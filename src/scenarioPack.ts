import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { t } from './i18n';
import { getWorkspacePath, getGameStatePath, writeJsonAtomic } from './workspacePaths';
import { sendCurrentState, setGameEntryHistoryWithSeenIds, saveHistoryToDisk } from './gameStateSync';
import { sendBgmManifest, sendSfxManifest } from './mediaManifest';
import { resolvePythonCommand } from './skillScriptRunner';

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
    return errors;
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

    const resetConfirm = await vscode.window.showWarningMessage(
        t('extension.scenario.resetConfirm') || 'Loading a new scenario pack will reset your current game progress and history. Do you want to proceed?',
        { modal: true },
        t('extension.scenario.resetYes') || 'Yes',
        t('extension.scenario.resetNo') || 'No'
    );
    if (resetConfirm !== (t('extension.scenario.resetYes') || 'Yes')) {
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

    const dir = picked[0].fsPath;
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

    const opening = (scenario.opening || {}) as Record<string, unknown>;
    const setup = (scenario.setup || {}) as Record<string, unknown>;
    const meta = (scenario.meta || {}) as Record<string, unknown>;

    const state: Record<string, unknown> = {
        entries: [{
            id: 'scenario-opening',
            role: 'gm',
            sender: 'Game Master',
            content: opening.narrative || t('extension.scenario.openingFallback', {
                title: String(meta.title || t('extension.scenario.defaultTitle'))
            })
        }],
        status: opening.status || {},
        options: Array.isArray(opening.options) ? opening.options : [],
        theme: setup.theme || 'fantasy'
    };
    if (opening.bgm) { state.bgm = opening.bgm; }
    if (opening.sfx) { state.sfx = opening.sfx; }

    const statePath = getGameStatePath();
    if (!statePath) { return; }

    // Clear game history before writing the state
    setGameEntryHistoryWithSeenIds([]);
    saveHistoryToDisk();

    try {
        writeJsonAtomic(statePath, state);
        const wsScenario = path.join(wsPath, 'scenario.json');
        if (path.resolve(scenarioPath) !== path.resolve(wsScenario)) {
            fs.copyFileSync(scenarioPath, wsScenario);
        }
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

    // Create scenario_assets directory in workspace if media files exist
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
        sendBgmManifest();
        sendSfxManifest();
    }, 400);

    const extra = notes.length
        ? t('extension.info.scenarioExtra', { notes: notes.join(' / ') })
        : '';
    vscode.window.showInformationMessage(
        t('extension.info.scenarioLoaded', {
            title: String(meta.title || t('extension.scenario.defaultTitle')),
            extra
        })
    );
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