import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { getConfiguredLocale, t } from './i18n';
import { getWorkspacePath, getGameStatePath, writeJsonAtomic } from './workspacePaths';
import { sendCurrentState, setGameEntryHistoryWithSeenIds, saveHistoryToDisk } from './gameStateSync';
import { sendBgmManifest, sendSfxManifest } from './mediaManifest';
import { resolvePythonCommand } from './skillScriptRunner';
import { commitGameState } from './stateManager';
import { resetGmBridgeSessions } from './gmBridgeRunner';
import {
    parseScenarioDirectorTemplate,
    pushScenarioDirectorToWebview,
    seedDirectorFromTemplate,
    validateScenarioDirectorBlock
} from './scenarioDirector';
import {
    applyScenarioLocaleOverlay,
    BUNDLED_SAMPLE_IDS,
    OPTIONAL_PACK_FILES,
    resolveBundledSampleDir,
} from './scenarioPackCore';
import { isDebugScenarioPack } from './debugScenarioCore';
import { seedDebugScenarioWorldFromForge } from './debugScenarioRunnerCore';
import { clearCampaignKitCache } from './campaignKit';
import { clearDiscoveryLedgerCache } from './discoveryLedger';
import { isValidCharacterId } from './characterId';
import { addToParty, getCharacters, saveCharacter, sendCharacterList, setActiveCharacter } from './characterManager';
import {
    parseProtagonistDraft,
    protagonistDraftToProfile,
    resolveUniqueCharacterId,
} from './protagonistBootstrapCore';

export { BUNDLED_SAMPLE_IDS, resolveBundledSampleDir } from './scenarioPackCore';

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function localizeScenarioData(scenario: Record<string, unknown>): Record<string, unknown> {
    return applyScenarioLocaleOverlay(scenario, getConfiguredLocale());
}

function normalizeOpeningStatus(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
    }
    const status = { ...(raw as Record<string, unknown>) };
    for (const field of ['condition', 'inventory', 'skills'] as const) {
        if (typeof status[field] === 'string' && status[field].trim()) {
            status[field] = [status[field].trim()];
        }
    }
    return status;
}

function ensureScenarioStarterProtagonist(scenario: Record<string, unknown>): void {
    const setup = asRecord(scenario.setup);
    const rawStarter = asRecord(setup?.playerCharacter);
    if (!rawStarter) {
        return;
    }

    const draft = parseProtagonistDraft(rawStarter);
    if (!draft) {
        return;
    }

    const preferredId = typeof rawStarter.id === 'string' && isValidCharacterId(rawStarter.id.trim())
        ? rawStarter.id.trim()
        : undefined;
    const existing = getCharacters();
    const usablePlayerCharacters = existing.filter((character) =>
        character.controlledBy === 'player'
        && typeof character.name === 'string'
        && character.name.trim().length > 0
    );
    const reusablePlayer = usablePlayerCharacters.find((character) =>
        (preferredId && character.id === preferredId)
        || (
            typeof character.name === 'string'
            && character.name.trim().toLowerCase() === draft.name.trim().toLowerCase()
        )
    );
    if (reusablePlayer) {
        setActiveCharacter(reusablePlayer.id);
        addToParty(reusablePlayer.id);
        return;
    }
    if (usablePlayerCharacters.length > 0) {
        return;
    }

    const takenIds = existing.map((character) => character.id);
    const id = preferredId && !takenIds.includes(preferredId)
        ? preferredId
        : resolveUniqueCharacterId(draft.name, takenIds);
    const profile = protagonistDraftToProfile(draft, id);
    saveCharacter(profile);
    setActiveCharacter(id);
    addToParty(id);
}

function resolvePackageScenarioScript(): string | undefined {
    const candidates = [
        path.join(__dirname, '..', 'scripts', 'package_scenario.py'),
        path.join('C:', 'AI', 'text-adventure-vsce', 'scripts', 'package_scenario.py')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return undefined;
}

function validateScenarioData(scenario: Record<string, unknown>): string[] {
    const errors: string[] = [];
    if (scenario.format !== 'text-adventure-scenario/1.0') {
        errors.push('format must be text-adventure-scenario/1.0');
    }
    const meta = scenario.meta as Record<string, unknown> | undefined;
    if (!meta?.title) {
        errors.push('meta.title is required');
    }
    const opening = scenario.opening as Record<string, unknown> | undefined;
    if (!opening?.narrative) {
        errors.push('opening.narrative is required');
    }
    if (scenario.director !== undefined) {
        errors.push(...validateScenarioDirectorBlock(scenario.director));
    }
    return errors;
}

/** Optional, scenario-authored initial caravan state. This is deliberately
 * data-only: it does not calculate prices, travel, food, or world time. */
function normalizeOpeningCommerce(raw: unknown): Record<string, unknown> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const source = raw as Record<string, unknown>;
    if (typeof source.credits !== 'number' || !Number.isFinite(source.credits)) { return undefined; }
    const cargo = Array.isArray(source.cargo)
        ? source.cargo
            .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry))
            .filter((entry) => typeof entry.commodityId === 'string' && typeof entry.qty === 'number' && Number.isFinite(entry.qty))
            .slice(0, 24)
            .map((entry) => ({ commodityId: entry.commodityId, qty: Math.max(0, Math.floor(entry.qty as number)) }))
        : [];
    return {
        credits: Math.max(0, Math.floor(source.credits)),
        cargo,
        transportId: typeof source.transportId === 'string' && source.transportId ? source.transportId : 'wagon',
        food: typeof source.food === 'number' && Number.isFinite(source.food) ? Math.max(0, Math.floor(source.food)) : 30,
        playerRole: typeof source.playerRole === 'string' && source.playerRole ? source.playerRole : 'merchant',
    };
}

function normalizeOpeningWorld(raw: unknown): Record<string, unknown> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const source = raw as Record<string, unknown>;
    if (typeof source.currentLocationId !== 'string' || !source.currentLocationId) { return undefined; }
    return { currentLocationId: source.currentLocationId };
}

function copyFolderSync(from: string, to: string) {
    if (!fs.existsSync(from)) {
        return;
    }
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(element => {
        const fromPath = path.join(from, element);
        const toPath = path.join(to, element);
        if (fs.lstatSync(fromPath).isDirectory()) {
            copyFolderSync(fromPath, toPath);
        } else {
            fs.copyFileSync(fromPath, toPath);
        }
    });
}

async function confirmScenarioReset(wsPath: string): Promise<boolean> {
    const statePath = path.join(wsPath, 'game_state.json');
    let hasProgress = false;
    if (fs.existsSync(statePath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
            const entries = raw.entries;
            hasProgress = Array.isArray(entries) && entries.length > 0;
        } catch {
            hasProgress = true;
        }
    }
    if (!hasProgress) {
        return true;
    }
    const yes = t('extension.scenario.resetYes') || 'Yes';
    const resetConfirm = await vscode.window.showWarningMessage(
        t('extension.scenario.resetConfirm') || 'Loading a new scenario pack will reset your current game progress and history. Do you want to proceed?',
        { modal: true },
        yes,
        t('extension.scenario.resetNo') || 'No'
    );
    return resetConfirm === yes;
}

/** Load scenario.json (+ optional world/media files) from a pack directory into the workspace. */
async function loadScenarioPackFromDir(dir: string, opts?: { firstSessionHint?: boolean }): Promise<void> {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }

    const scenarioPath = path.join(dir, 'scenario.json');
    if (!fs.existsSync(scenarioPath)) {
        vscode.window.showErrorMessage(t('extension.error.scenarioMissing'));
        return;
    }

    let scenario: Record<string, unknown>;
    try {
        scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8')) as Record<string, unknown>;
    } catch (e) {
        vscode.window.showErrorMessage(t('extension.error.scenarioReadFailed', { error: String(e) }));
        return;
    }

    const localizedScenario = localizeScenarioData(scenario);
    const opening = (localizedScenario.opening || {}) as Record<string, unknown>;
    const setup = (localizedScenario.setup || {}) as Record<string, unknown>;
    const meta = (localizedScenario.meta || {}) as Record<string, unknown>;
    const openingStatus = normalizeOpeningStatus(opening.status);

    const state: Record<string, unknown> = {
        entries: [{
            id: 'scenario-opening',
            role: 'gm',
            sender: 'Game Master',
            content: opening.narrative || t('extension.scenario.openingFallback', {
                title: String(meta.title || t('extension.scenario.defaultTitle'))
            })
        }],
        status: openingStatus,
        options: Array.isArray(opening.options) ? opening.options : [],
        theme: setup.theme || 'fantasy'
    };
    const openingCommerce = normalizeOpeningCommerce(opening.commerce);
    if (openingCommerce) { state.commerce = openingCommerce; }
    const openingWorld = normalizeOpeningWorld(opening.world);
    if (openingWorld) { state.world = openingWorld; }
    if (opening.bgm) { state.bgm = opening.bgm; }
    if (opening.sfx) { state.sfx = opening.sfx; }

    const directorTemplate = parseScenarioDirectorTemplate(
        localizedScenario.director as Record<string, unknown> | undefined,
        meta
    );
    if (directorTemplate) {
        state.director = seedDirectorFromTemplate(directorTemplate);
    }

    if (isDebugScenarioPack(meta)) {
        const forgePath = path.join(dir, 'world_forge.json');
        if (fs.existsSync(forgePath)) {
            try {
                const forgeRaw = JSON.parse(fs.readFileSync(forgePath, 'utf-8'));
                Object.assign(state, seedDebugScenarioWorldFromForge(state, forgeRaw));
            } catch { /* ignore */ }
        }
    }

    const statePath = getGameStatePath();
    if (!statePath) { return; }

    setGameEntryHistoryWithSeenIds([]);
    saveHistoryToDisk();
    resetGmBridgeSessions();

    try {
        commitGameState(state, { mergeProfile: 'replace' });
        ensureScenarioStarterProtagonist(localizedScenario);
        const wsScenario = path.join(wsPath, 'scenario.json');
        if (path.resolve(scenarioPath) !== path.resolve(wsScenario)) {
            // Keep the workspace-local scenario copy aligned with the active locale,
            // otherwise bundled demos reopen with mixed-language context.
            writeJsonAtomic(wsScenario, localizedScenario);
        }
        for (const fileName of OPTIONAL_PACK_FILES) {
            const src = path.join(dir, fileName);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, path.join(wsPath, fileName));
            }
        }
        clearCampaignKitCache();
        clearDiscoveryLedgerCache();
    } catch (e) {
        vscode.window.showErrorMessage(t('extension.error.scenarioWriteFailed', { error: String(e) }));
        return;
    }

    const config = vscode.workspace.getConfiguration('textAdventure');
    const assetsDir = path.join(wsPath, 'scenario_assets');
    const packBgm = path.join(dir, 'bgm.json');
    const packSfx = path.join(dir, 'sfx.json');
    const packBgmDir = path.join(dir, 'bgm');
    const packSfxDir = path.join(dir, 'sfx');
    const notes: string[] = [];

    if (fs.existsSync(packBgm) || fs.existsSync(packSfx) || fs.existsSync(packBgmDir) || fs.existsSync(packSfxDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    if (fs.existsSync(packBgm)) {
        const destBgm = path.join(assetsDir, 'bgm.json');
        fs.copyFileSync(packBgm, destBgm);
        await config.update('bgm.manifestPath', destBgm, vscode.ConfigurationTarget.Workspace);
        notes.push(t('extension.scenario.notesBgm'));
    }
    if (fs.existsSync(packBgmDir)) {
        copyFolderSync(packBgmDir, path.join(assetsDir, 'bgm'));
    }

    if (fs.existsSync(packSfx)) {
        const destSfx = path.join(assetsDir, 'sfx.json');
        fs.copyFileSync(packSfx, destSfx);
        await config.update('sfx.manifestPath', destSfx, vscode.ConfigurationTarget.Workspace);
        notes.push(t('extension.scenario.notesSe'));
    }
    if (fs.existsSync(packSfxDir)) {
        copyFolderSync(packSfxDir, path.join(assetsDir, 'sfx'));
    }

    await vscode.commands.executeCommand('textadventure.openGame');
    setTimeout(() => {
        sendCurrentState(0, true);
        // Starter creation can happen before the panel exists, so re-send once the game view is open.
        sendCharacterList();
        sendBgmManifest();
        sendSfxManifest();
        pushScenarioDirectorToWebview();
    }, 400);

    const extra = notes.length
        ? t('extension.info.scenarioExtra', { notes: notes.join(' / ') })
        : '';
    const title = String(meta.title || t('extension.scenario.defaultTitle'));
    const msgKey = opts?.firstSessionHint
        ? 'extension.info.firstSessionDemoLoaded'
        : 'extension.info.scenarioLoaded';
    vscode.window.showInformationMessage(t(msgKey, { title, extra }));
}

/** Load a bundled sample scenario (Start Hub demo, no folder picker). */
export async function loadBundledSampleScenario(sampleId: string): Promise<void> {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(t('extension.error.untrustedWorkspace'));
        return;
    }

    const wsPath = getWorkspacePath();
    if (!wsPath) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }

    const dir = resolveBundledSampleDir(sampleId);
    if (!dir) {
        vscode.window.showErrorMessage(t('extension.error.bundledSampleMissing', { id: sampleId }));
        return;
    }

    if (!(await confirmScenarioReset(wsPath))) {
        return;
    }

    await loadScenarioPackFromDir(dir, { firstSessionHint: true });
}

/** シナリオパック（scenario.json を含むフォルダ）を読み込み、開始シーンをUIに表示する。 */
export async function loadScenarioPack(): Promise<void> {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(t('extension.error.untrustedWorkspace'));
        return;
    }

    const wsPath = getWorkspacePath();
    if (!wsPath) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }

    if (!(await confirmScenarioReset(wsPath))) {
        return;
    }

    const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        title: t('extension.scenario.openTitle'),
        openLabel: t('extension.scenario.openLabel')
    });
    if (!picked || picked.length === 0) { return; }

    await loadScenarioPackFromDir(picked[0].fsPath);
}

export async function validateScenarioPack(): Promise<void> {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(t('extension.error.untrustedWorkspace'));
        return;
    }

    const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        title: t('extension.scenario.validateTitle'),
        openLabel: t('extension.scenario.validateLabel')
    });
    if (!picked?.length) {
        return;
    }
    const dir = picked[0].fsPath;
    const scenarioPath = path.join(dir, 'scenario.json');
    if (!fs.existsSync(scenarioPath)) {
        vscode.window.showErrorMessage(t('extension.error.scenarioMissing'));
        return;
    }
    try {
        const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8')) as Record<string, unknown>;
        const errors = validateScenarioData(scenario);
        const workshopPath = path.join(dir, 'workshop.json');
        const hasWorkshop = fs.existsSync(workshopPath);
        if (errors.length) {
            vscode.window.showWarningMessage(t('extension.warning.scenarioInvalid', { errors: errors.join('; ') }));
            return;
        }
        const title = (scenario.meta as Record<string, unknown>)?.title || dir;
        vscode.window.showInformationMessage(
            t('extension.info.scenarioValid', { title: String(title), workshop: hasWorkshop ? 'yes' : 'no' })
        );
    } catch (e) {
        vscode.window.showErrorMessage(t('extension.error.scenarioReadFailed', { error: String(e) }));
    }
}

export async function exportScenarioPack(): Promise<void> {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(t('extension.error.untrustedWorkspace'));
        return;
    }

    const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        title: t('extension.scenario.exportTitle'),
        openLabel: t('extension.scenario.exportLabel')
    });
    if (!picked?.length) {
        return;
    }
    const dir = picked[0].fsPath;
    const scenarioPath = path.join(dir, 'scenario.json');
    if (!fs.existsSync(scenarioPath)) {
        vscode.window.showErrorMessage(t('extension.error.scenarioMissing'));
        return;
    }
    try {
        const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8')) as Record<string, unknown>;
        const errors = validateScenarioData(scenario);
        if (errors.length) {
            vscode.window.showWarningMessage(t('extension.warning.scenarioInvalid', { errors: errors.join('; ') }));
            return;
        }
    } catch (e) {
        vscode.window.showErrorMessage(t('extension.error.scenarioReadFailed', { error: String(e) }));
        return;
    }

    const defaultName = `${path.basename(dir)}.zip`;
    const outPick = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(dir, defaultName)),
        filters: { 'ZIP': ['zip'] },
        title: t('extension.scenario.exportSaveTitle')
    });
    if (!outPick) {
        return;
    }

    const script = resolvePackageScenarioScript();
    if (!script) {
        vscode.window.showErrorMessage(t('extension.error.packageScriptNotFound'));
        return;
    }
    const python = resolvePythonCommand();
    const result = spawnSync(python, [script, '--dir', dir, '--out', outPick.fsPath], {
        cwd: dir,
        encoding: 'utf-8'
    });
    if (result.status !== 0) {
        vscode.window.showErrorMessage(t('extension.error.scenarioExportFailed', {
            error: (result.stderr || result.stdout || '').trim() || String(result.status)
        }));
        return;
    }
    const title = (JSON.parse(fs.readFileSync(scenarioPath, 'utf-8')) as Record<string, unknown>).meta as Record<string, unknown>;
    vscode.window.showInformationMessage(
        t('extension.info.scenarioExported', { title: String(title?.title || path.basename(dir)), path: outPick.fsPath })
    );
}
