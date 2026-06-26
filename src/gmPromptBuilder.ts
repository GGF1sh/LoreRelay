import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import type { ProfileUpdate } from './types/GameState';
import {
    t,
    getConfiguredLocale,
    type SupportedLocale
} from './i18n';
import { buildMemoryPromptContext, buildSagaPromptContext, matchMemories, type MemoryChunk } from './memoryBank';
import {
    computeArchiveMilestone,
    getArchiveRemindStep,
    getArchiveThreshold,
    getContextTier,
    isArchiveAutoPromptEnabled,
    supportsArchivePrompt
} from './archivePrompt';
import { isValidCharacterId } from './characterId';
import { getWorkspacePath, getGameStatePath, getGmProvider, writeJsonAtomic } from './workspacePaths';
import { getGameEntryHistory } from './gameStateSync';
import { getGmBridgeOutputChannel } from './gmBridgeRunner';
import {
    getMemoryBackendSetting,
    resolveGmBridgeScript,
    resolvePythonCommand,
    runSkillScript
} from './skillScriptRunner';
import { loadGameRules } from './gameRules';
import {
    getCharactersDir,
    getPartyIds,
    getActiveCharacterId,
    loadCharacterById,
    loadDynamicProfiles,
    getPartyMemberIds
} from './characterManager';
import { type LorebookEntry, matchEntriesAgainstText } from './lorebookMatcher';
import { loadScenarioDirector } from './scenarioDirector';
import { loadPartyDirector } from './partyDirector';
import type { RelationshipType } from './partyDirectorCore';
import {
    buildSection,
    finalizeBreakdown,
    previewText,
    type PromptContextBreakdown,
    type PromptLoreMatch,
    type PromptMemoryMatch
} from './promptContext';

export interface GmPromptBuilderDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
    onArchiveNow: () => void | Promise<void>;
}

let deps: GmPromptBuilderDeps | undefined;
let lastArchivePromptMilestone = 0;

export function initGmPromptBuilder(builderDeps: GmPromptBuilderDeps): void {
    deps = builderDeps;
}

function requireDeps(): GmPromptBuilderDeps {
    if (!deps) {
        throw new Error('initGmPromptBuilder must be called before using GM prompt builder');
    }
    return deps;
}

export function resetArchivePromptMilestone(value = 0): void {
    lastArchivePromptMilestone = value;
}

export function computeAndSetArchiveMilestone(count: number, threshold: number, remindStep: number): void {
    lastArchivePromptMilestone =
        computeArchiveMilestone(count, threshold, remindStep) ?? 0;
}

function gmLanguageName(locale?: SupportedLocale): string {
    const loc = locale ?? getConfiguredLocale();
    return t(`gm.languageName.${loc}`, undefined, loc);
}

function loadStorySummary(): string {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return '';
    }
    try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        return typeof state.summary === 'string' ? state.summary.trim() : '';
    } catch {
        return '';
    }
}

function loadAllLorebookEntriesRaw(): LorebookEntry[] {
    const ws = getWorkspacePath();
    if (!ws) {
        return [];
    }
    const candidates = [path.join(ws, 'lorebook.json'), path.join(ws, 'world_info.json')];
    for (const p of candidates) {
        if (!fs.existsSync(p)) {
            continue;
        }
        try {
            const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (Array.isArray(raw.entries)) {
                return raw.entries as LorebookEntry[];
            }
        } catch {
            /* try next */
        }
    }
    return [];
}

function resolveLorebookForPrompt(hintText: string, maxEntries = 5): LorebookEntry[] {
    const enabled = loadAllLorebookEntriesRaw().filter((e) => e.enabled !== false);
    const pinned = enabled.filter((e) => e.pinned === true);
    const pinnedIds = new Set(pinned.map((e) => e.id).filter(Boolean));
    const keywordPool = enabled.filter((e) => !e.pinned);
    const matched = matchEntriesAgainstText(keywordPool, hintText, maxEntries);
    return [
        ...pinned,
        ...matched.filter((m) => !m.id || !pinnedIds.has(m.id))
    ];
}

function matchLorebookEntries(text: string, maxEntries = 5): LorebookEntry[] {
    return resolveLorebookForPrompt(text, maxEntries);
}

function resolveMemoriesViaPython(ws: string, hintText: string, backend: string): MemoryChunk[] {
    const scriptPath = resolveGmBridgeScript('memory_bank.py');
    if (!scriptPath) {
        return [];
    }
    const python = resolvePythonCommand();
    const result = spawnSync(
        python,
        [
            scriptPath,
            '--cwd', ws,
            '--resolve',
            '--json',
            '--text', hintText,
            '--max', '3',
            '--backend', backend
        ],
        { encoding: 'utf-8', timeout: 15000 }
    );
    if (result.status !== 0 || !result.stdout?.trim()) {
        return [];
    }
    try {
        const parsed = JSON.parse(result.stdout.trim());
        return Array.isArray(parsed) ? parsed as MemoryChunk[] : [];
    } catch {
        return [];
    }
}

function formatMemoryPromptFromChunks(matches: MemoryChunk[]): string {
    if (matches.length === 0) {
        return '';
    }
    const parts = ['[Memory Bank — relevant memories]'];
    for (const m of matches) {
        parts.push(`--- ${m.label || m.id} (${m.source}) ---`);
        parts.push(String(m.text || '').trim());
    }
    return parts.join('\n');
}

function buildMemoryContextForPrompt(ws: string, hintText: string): string {
    const backend = getMemoryBackendSetting();
    if (backend === 'tfidf') {
        return buildMemoryPromptContext(ws, hintText, 3);
    }
    const viaPy = formatMemoryPromptFromChunks(resolveMemoriesViaPython(ws, hintText, backend));
    if (viaPy) {
        return viaPy;
    }
    return buildMemoryPromptContext(ws, hintText, 3);
}

function relationshipLabel(rel: RelationshipType): string {
    return rel;
}

function buildPartyPromptContext(): string {
    const dynProfiles = loadDynamicProfiles();
    const ids = getPartyMemberIds();
    if (ids.length === 0) {
        return '';
    }
    const lines = ['[Party Members / Active Characters]'];
    for (const id of ids) {
        const char = loadCharacterById(id);
        if (!char) {
            continue;
        }
        lines.push(`--- ${char.name} (ID: ${id}) ---`);
        lines.push(`Description: ${char.description}`);
        lines.push(`Personality: ${char.personality}`);
        const src = char.stSource;
        if (src?.scenario) {
            lines.push(`Scenario: ${src.scenario}`);
        }
        if (src?.system_prompt) {
            lines.push(`Character rules: ${src.system_prompt}`);
        }
        if (src?.first_mes) {
            lines.push(`Opening line hint: ${src.first_mes}`);
        }
        if (src?.mes_example) {
            lines.push(`Example dialogue:\n${src.mes_example}`);
        }
        if (dynProfiles[id]) {
            lines.push(`Dynamic memory: ${dynProfiles[id]}`);
        }
    }
    lines.push('Have party members react in character, converse with each other, and adapt gear to the current world theme.');
    return lines.join('\n');
}

function buildPartyDirectorPromptContext(): string {
    const director = loadPartyDirector();
    if (!director) {
        return '';
    }
    const lines = ['[Party Director — NPC speech & relationships]'];
    const g = director.global;
    if (!g.npcBanterEnabled) {
        lines.push('NPC banter: OFF — party NPCs speak only when addressed or plot-critical.');
    } else {
        lines.push('NPC banter: ON — allow natural party dialogue when pacing fits.');
    }
    if (g.combatQuietMode) {
        lines.push('Combat quiet mode: ON — minimize cross-talk during tense combat turns.');
    }
    if (director.notes) {
        lines.push(`Director notes: ${director.notes}`);
    }

    const idToName = new Map<string, string>();
    for (const id of Object.keys(director.members)) {
        const char = loadCharacterById(id);
        idToName.set(id, char?.name || id);
    }

    for (const [id, cfg] of Object.entries(director.members)) {
        const name = idToName.get(id) || id;
        const tags: string[] = [];
        if (cfg.muted) {
            tags.push('MUTED — do not give this character dialogue unless the player addresses them');
        }
        if (cfg.forceSpeak) {
            tags.push('FORCE SPEAK — include a brief in-character line this turn if possible');
        }
        if (!cfg.muted && !cfg.forceSpeak) {
            if (cfg.verbosity <= 20) {
                tags.push('verbosity: low — rare optional lines only');
            } else if (cfg.verbosity >= 80) {
                tags.push('verbosity: high — frequent reactions and banter');
            } else {
                tags.push(`verbosity: ${cfg.verbosity}/100`);
            }
        }
        lines.push(`--- ${name} (${id}) ---`);
        if (tags.length > 0) {
            lines.push(tags.join('; '));
        }
        const relParts = Object.entries(cfg.relationships)
            .filter(([otherId]) => otherId !== id)
            .map(([otherId, rel]) => `${idToName.get(otherId) || otherId}: ${relationshipLabel(rel)}`);
        if (relParts.length > 0) {
            lines.push(`Relationships: ${relParts.join('; ')}`);
        }
    }
    lines.push('Respect muted/verbosity flags. Use relationship tone when NPCs address each other.');
    return lines.join('\n');
}

function buildScenarioDirectorPromptContext(): string {
    const director = loadScenarioDirector();
    if (!director) {
        return '';
    }
    const lines = ['[Scenario Director]'];
    if (director.scenarioTitle) {
        lines.push(`Scenario: ${director.scenarioTitle}`);
    }
    if (director.act || director.chapter) {
        lines.push(`Act/Chapter: ${[director.act, director.chapter].filter(Boolean).join(' / ')}`);
    }
    if (director.scene) {
        lines.push(`Scene: ${director.scene}`);
    }
    if (director.objective) {
        lines.push(`Objective: ${director.objective}`);
    }
    if (director.successConditions.length > 0) {
        lines.push(`Success: ${director.successConditions.join('; ')}`);
    }
    if (director.failConditions.length > 0) {
        lines.push(`Fail if: ${director.failConditions.join('; ')}`);
    }
    if (director.guidanceMode === 'sandbox') {
        lines.push('Guidance: sandbox — prioritize player agency; use director beats as optional color only.');
    } else if (director.guidanceMode === 'guided') {
        lines.push('Guidance: guided — follow the objective and scene structure while allowing minor detours.');
    } else if (director.guidanceMode === 'railroad') {
        lines.push('Guidance: railroad — keep the plot on the listed objective and success path.');
    }
    if (director.optionalEncounters.length > 0) {
        lines.push(`Optional encounters: ${director.optionalEncounters.join('; ')}`);
    }
    if (director.achievedEndings && director.achievedEndings.length > 0) {
        lines.push(`Achieved ending flags: ${director.achievedEndings.join(', ')}`);
    }
    return lines.join('\n');
}

function buildGameRulesPromptContext(): string {
    const rules = loadGameRules();
    if (!rules.enableRpgMechanics) {
        return '[Game Rules]\nRPG mechanics (HP/MP numeric tracking) are DISABLED. Focus on narrative flow; omit combat stats unless the player explicitly requests them.';
    }
    return `[Game Rules]\nRPG mechanics ENABLED. Default max HP: ${rules.defaultMaxHp}, max MP: ${rules.defaultMaxMp}. Dice difficulty tone: ${rules.diceDifficulty}. Track HP/MP changes via status patches only when mechanics are relevant.`;
}

function buildLorebookPromptContext(hintText: string): string {
    const matches = resolveLorebookForPrompt(hintText);
    if (matches.length === 0) {
        return '';
    }
    const parts = ['[Lorebook — matched + pinned entries]'];
    for (const e of matches) {
        const tag = e.pinned ? '📌 ' : '';
        parts.push(`--- ${tag}${e.comment || e.id || 'entry'} ---`);
        parts.push(String(e.content || '').trim());
    }
    return parts.join('\n');
}

/** Turn Inspector / turn_result 用に発火したロアブックのラベルを返す。 */
export function getTriggeredLoreLabels(hintText: string, maxEntries = 5): string[] {
    return resolveLorebookForPrompt(hintText, maxEntries).map((e) => {
        const label = String(e.comment || e.id || 'entry').trim();
        return e.pinned ? `📌 ${label}` : label;
    }).filter((label) => label.length > 0);
}

function buildHintText(playerAction: string): string {
    const recent = getGameEntryHistory()
        .filter((e) => !e.excludedFromPrompt)
        .slice(-3)
        .map((e) => e.content)
        .join('\n');
    return `${recent}\n${playerAction}`;
}

function resolveMemoryMatches(ws: string, hint: string): MemoryChunk[] {
    const backend = getMemoryBackendSetting();
    if (backend === 'tfidf') {
        return matchMemories(ws, hint, 3);
    }
    return resolveMemoriesViaPython(ws, hint, backend);
}

export function buildGmPromptBreakdown(playerAction: string): PromptContextBreakdown {
    const ws = getWorkspacePath();
    const hint = buildHintText(playerAction);
    const memoryBackend = getMemoryBackendSetting();

    const loreMatches = matchLorebookEntries(hint);
    const matchedLore: PromptLoreMatch[] = loreMatches.map((e) => ({
        id: String(e.id || e.comment || 'entry'),
        label: String(e.comment || e.id || 'entry'),
        preview: previewText(String(e.content || '')),
        keys: Array.isArray(e.keys) ? e.keys.map(String) : []
    }));

    const memoryChunks = ws ? resolveMemoryMatches(ws, hint) : [];
    const memoryMatches: PromptMemoryMatch[] = memoryChunks.map((m) => ({
        id: m.id,
        label: m.label,
        source: m.source,
        preview: previewText(m.text)
    }));

    const sections = [
        buildSection('gameRules', 'Game Rules', buildGameRulesPromptContext()),
        buildSection('director', 'Scenario Director', buildScenarioDirectorPromptContext()),
        buildSection('summary', 'Story Synopsis', loadStorySummary() ? `[Story Synopsis]\n${loadStorySummary()}` : ''),
        ws ? buildSection('saga', 'Saga Archive', buildSagaPromptContext(ws, 2)) : undefined,
        buildSection('party', 'Party', buildPartyPromptContext()),
        buildSection('partyDirector', 'Party Director', buildPartyDirectorPromptContext()),
        ws ? buildSection('memory', 'Memory Bank', buildMemoryContextForPrompt(ws, hint)) : undefined,
        buildSection('lorebook', 'Lorebook', buildLorebookPromptContext(hint)),
        buildSection('vision', 'Vision', buildVisionContext())
    ];

    return finalizeBreakdown(
        sections,
        memoryBackend,
        matchedLore,
        memoryMatches,
        previewText(hint, 240)
    );
}

export function buildGmPromptContext(playerAction: string): string {
    const hint = buildHintText(playerAction);
    const ws = getWorkspacePath();
    const chunks: string[] = [buildGameRulesPromptContext()];
    const directorCtx = buildScenarioDirectorPromptContext();
    if (directorCtx) {
        chunks.push(directorCtx);
    }
    const summary = loadStorySummary();
    if (summary) {
        chunks.push(`[Story Synopsis]\n${summary}`);
    }
    if (ws) {
        const sagaCtx = buildSagaPromptContext(ws, 2);
        if (sagaCtx) {
            chunks.push(sagaCtx);
        }
    }
    const partyCtx = buildPartyPromptContext();
    if (partyCtx) {
        chunks.push(partyCtx);
    }
    const partyDirectorCtx = buildPartyDirectorPromptContext();
    if (partyDirectorCtx) {
        chunks.push(partyDirectorCtx);
    }
    if (ws) {
        const memoryCtx = buildMemoryContextForPrompt(ws, hint);
        if (memoryCtx) {
            chunks.push(memoryCtx);
        }
    }
    const loreCtx = buildLorebookPromptContext(hint);
    if (loreCtx) {
        chunks.push(loreCtx);
    }
    const visionCtx = buildVisionContext();
    if (visionCtx) {
        chunks.push(visionCtx);
    }
    return chunks.length ? `\n\n${chunks.join('\n\n')}` : '';
}

export function postPromptContextToWebview(playerAction: string): void {
    const panel = requireDeps().getPanel();
    if (!panel) {
        return;
    }
    panel.webview.postMessage({
        type: 'promptContext',
        breakdown: buildGmPromptBreakdown(playerAction)
    });
}

function buildVisionContext(): string {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return '';
    }
    try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        if (state.latestImage) {
            return `[Vision Context: latestImage = ${state.latestImage}]\n*The VLM can use this image path to describe the current scene visually.*`;
        }
    } catch {
        // ignore
    }
    return '';
}

export function processProfileUpdates(updates: ProfileUpdate[]): void {
    const charDir = getCharactersDir();
    if (!charDir || updates.length === 0) {
        return;
    }
    const dynPath = path.join(charDir, 'dynamic_profiles.json');
    let dynProfiles = loadDynamicProfiles();
    let changed = false;
    for (const up of updates as unknown[]) {
        if (typeof up !== 'object' || up === null) {
            continue;
        }
        const record = up as Partial<ProfileUpdate>;
        if (isValidCharacterId(record.characterId) && typeof record.dynamicProfile === 'string') {
            const dynamicProfile = record.dynamicProfile.trim().slice(0, 20000);
            if (!dynamicProfile) {
                continue;
            }
            dynProfiles[record.characterId] = dynamicProfile;
            changed = true;
        }
    }
    if (changed) {
        writeJsonAtomic(dynPath, dynProfiles);
        getGmBridgeOutputChannel().appendLine(
            `[Dynamic Profiles] Updated memory for ${updates.length} character(s).`
        );
        const ws = getWorkspacePath();
        if (ws) {
            void runSkillScript('memory_bank.py', ['--rebuild', '--backend', getMemoryBackendSetting()]);
        }
    }
}

export function buildGrokPrompt(playerAction: string, isContinuation: boolean): string {
    const locale = getConfiguredLocale();
    const base = t('gm.prompt.playerAction', { action: playerAction }, locale);
    const context = buildGmPromptContext(playerAction);
    if (isContinuation) {
        return t('gm.prompt.continue', { base }, locale) + context;
    }
    return t('gm.prompt.start', { base, languageName: gmLanguageName(locale) }, locale) + context;
}

export function maybeSuggestArchive(): void {
    const panel = requireDeps().getPanel();
    if (!isArchiveAutoPromptEnabled() || !panel) {
        return;
    }
    const provider = getGmProvider();
    if (!supportsArchivePrompt(provider)) {
        return;
    }
    const config = vscode.workspace.getConfiguration('textAdventure');
    const orModel = config.get<string>('gmBridge.openRouter.model', '');
    const threshold = getArchiveThreshold(provider, orModel);
    const remindStep = getArchiveRemindStep();
    const count = getGameEntryHistory().length;
    const milestone = computeArchiveMilestone(count, threshold, remindStep);
    if (milestone === undefined || milestone <= lastArchivePromptMilestone) {
        return;
    }
    lastArchivePromptMilestone = milestone;

    const tier = getContextTier(provider, orModel);
    panel.webview.postMessage({
        type: 'archiveSuggest',
        count,
        threshold,
        tier
    });

    const msg = t('extension.info.archiveSuggest', { count: String(count), threshold: String(threshold) });
    const action = t('extension.archive.now');
    void vscode.window.showInformationMessage(msg, action).then((choice) => {
        if (choice === action) {
            void requireDeps().onArchiveNow();
        }
    });
}