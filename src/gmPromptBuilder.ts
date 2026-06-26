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
import { buildMemoryPromptContext, buildSagaPromptContext, type MemoryChunk } from './memoryBank';
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

interface LorebookEntry {
    id?: string;
    keys?: string[];
    content?: string;
    comment?: string;
    priority?: number;
    enabled?: boolean;
}

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

function loadLorebookEntries(): LorebookEntry[] {
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
                return raw.entries.filter((e: LorebookEntry) => e.enabled !== false);
            }
        } catch {
            /* try next */
        }
    }
    return [];
}

function matchLorebookEntries(text: string, maxEntries = 5): LorebookEntry[] {
    const hay = text.toLowerCase();
    const hits: Array<{ priority: number; entry: LorebookEntry }> = [];
    for (const entry of loadLorebookEntries()) {
        const keys = entry.keys || [];
        const matched = keys.some((k) => {
            const key = String(k).trim().toLowerCase();
            return key.length > 0 && hay.includes(key);
        });
        if (matched) {
            hits.push({ priority: entry.priority ?? 0, entry });
        }
    }
    hits.sort((a, b) => b.priority - a.priority);
    return hits.slice(0, maxEntries).map((h) => h.entry);
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
        if (char.stSource?.first_mes) {
            lines.push(`Opening line hint: ${char.stSource.first_mes}`);
        }
        if (dynProfiles[id]) {
            lines.push(`Dynamic memory: ${dynProfiles[id]}`);
        }
    }
    lines.push('Have party members react in character, converse with each other, and adapt gear to the current world theme.');
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
    const matches = matchLorebookEntries(hintText);
    if (matches.length === 0) {
        return '';
    }
    const parts = ['[Lorebook — matched entries]'];
    for (const e of matches) {
        parts.push(`--- ${e.comment || e.id || 'entry'} ---`);
        parts.push(String(e.content || '').trim());
    }
    return parts.join('\n');
}

/** Turn Inspector / turn_result 用に発火したロアブックのラベルを返す。 */
export function getTriggeredLoreLabels(hintText: string, maxEntries = 5): string[] {
    return matchLorebookEntries(hintText, maxEntries).map(
        (e) => String(e.comment || e.id || 'entry').trim()
    ).filter((label) => label.length > 0);
}

export function buildGmPromptContext(playerAction: string): string {
    const chunks: string[] = [buildGameRulesPromptContext()];
    const ws = getWorkspacePath();
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
    const recent = getGameEntryHistory()
        .filter((e) => !e.excludedFromPrompt)
        .slice(-3)
        .map((e) => e.content)
        .join('\n');
    const hint = `${recent}\n${playerAction}`;
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