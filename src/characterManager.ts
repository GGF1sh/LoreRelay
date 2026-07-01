import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { CharacterProfile } from './types/Character';
import {
    filterValidCharacterIds,
    isValidCharacterId,
    resolveCharacterJsonPath,
    resolvePortraitPath
} from './characterId';
import { getWorkspacePath, getGameStatePath, writeJsonAtomic } from './workspacePaths';
import { safeImageUri } from './gameStateSync';
import {
    buildImageGenEnv,
    getImageOutputChannel,
    resolveComfyScript
} from './imageGenRunner';
import { loadImageGenConfig } from './imageGenConfig';
import { t } from './i18n';
import { spawn, ChildProcess } from 'child_process';
import { resolvePythonCommand } from './skillScriptRunner';
import { commitGameState } from './stateManager';

let portraitProcess: ChildProcess | undefined;

export function killPortraitProcess(): void {
    if (portraitProcess) {
        portraitProcess.kill();
        portraitProcess = undefined;
    }
}

const CHARACTER_META_FILES = new Set(['party.json', 'dynamic_profiles.json', 'party_director.json']);
const MAX_CHARACTER_IMAGE_BYTES = 8 * 1024 * 1024;
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp);base64,([a-zA-Z0-9+/=\r\n]+)$/;

export interface CharacterManagerDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
    onPartyChanged?: () => void;
}

let deps: CharacterManagerDeps | undefined;

export function initCharacterManager(managerDeps: CharacterManagerDeps): void {
    deps = managerDeps;
}

function requireDeps(): CharacterManagerDeps {
    if (!deps) {
        throw new Error('initCharacterManager must be called before using character management');
    }
    return deps;
}

export function getCharactersDir(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) { return undefined; }
    const charDir = path.join(ws, 'characters');
    if (!fs.existsSync(charDir)) {
        fs.mkdirSync(charDir, { recursive: true });
    }
    return charDir;
}

export function getPartyIds(): string[] {
    const charDir = getCharactersDir();
    if (!charDir) { return []; }
    const partyFile = path.join(charDir, 'party.json');
    if (fs.existsSync(partyFile)) {
        try {
            const raw = JSON.parse(fs.readFileSync(partyFile, 'utf-8'));
            return Array.isArray(raw) ? filterValidCharacterIds(raw) : [];
        } catch {
            return [];
        }
    }
    return [];
}

function savePartyIds(ids: string[]): void {
    const charDir = getCharactersDir();
    if (!charDir) { return; }
    const partyFile = path.join(charDir, 'party.json');
    try {
        writeJsonAtomic(partyFile, filterValidCharacterIds(ids));
    } catch (e) {
        console.error('Error saving party:', e);
    }
}

export function getActiveCharacterId(): string | undefined {
    const charDir = getCharactersDir();
    if (!charDir) { return undefined; }
    const activeFile = path.join(charDir, 'active_character.txt');
    if (fs.existsSync(activeFile)) {
        return fs.readFileSync(activeFile, 'utf-8').trim();
    }
    return undefined;
}

export function loadCharacterById(id: string): CharacterProfile | undefined {
    if (!isValidCharacterId(id)) { return undefined; }
    const charDir = getCharactersDir();
    if (!charDir) { return undefined; }
    const filePath = resolveCharacterJsonPath(charDir, id);
    if (!filePath || !fs.existsSync(filePath)) { return undefined; }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CharacterProfile;
    } catch {
        return undefined;
    }
}

export function getActiveCharacterProfile(): CharacterProfile | undefined {
    const id = getActiveCharacterId();
    return id ? loadCharacterById(id) : undefined;
}

export function loadDynamicProfiles(): Record<string, string> {
    const charDir = getCharactersDir();
    if (!charDir) { return {}; }
    const dynPath = path.join(charDir, 'dynamic_profiles.json');
    if (!fs.existsSync(dynPath)) { return {}; }
    try {
        const raw = JSON.parse(fs.readFileSync(dynPath, 'utf-8'));
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, string> : {};
    } catch {
        return {};
    }
}

export function getPartyMemberIds(): string[] {
    const ids = [...getPartyIds()];
    const activeId = getActiveCharacterId();
    if (activeId && !ids.includes(activeId)) {
        ids.unshift(activeId);
    }
    return ids;
}

export function getCharacters(): CharacterProfile[] {
    const charDir = getCharactersDir();
    if (!charDir) { return []; }
    const characters: CharacterProfile[] = [];
    try {
        const files = fs.readdirSync(charDir);
        for (const file of files) {
            if (file.endsWith('.json') && !CHARACTER_META_FILES.has(file)) {
                const raw = fs.readFileSync(path.join(charDir, file), 'utf-8');
                const char = JSON.parse(raw) as CharacterProfile;
                if (!char.id || !char.name) { continue; }
                if (char.portrait) {
                    const uri = safeImageUri(char.portrait);
                    if (uri) { char.portrait = uri; }
                }
                characters.push(char);
            }
        }
    } catch (e) {
        console.error('Error reading characters directory:', e);
    }
    return characters;
}

export function sendCharacterList(): void {
    const panel = requireDeps().getPanel();
    if (!panel) { return; }
    
    panel.webview.postMessage({
        type: 'characterList',
        characters: getCharacters(),
        activeCharacterId: getActiveCharacterId(),
        partyIds: getPartyIds()
    });
}

function decodeDataImage(value: unknown): { ext: string; buffer: Buffer } | undefined {
    if (typeof value !== 'string') { return undefined; }
    const match = DATA_IMAGE_RE.exec(value);
    if (!match) { return undefined; }
    const type = match[1].toLowerCase();
    const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (buffer.length <= 0 || buffer.length > MAX_CHARACTER_IMAGE_BYTES) {
        return undefined;
    }
    const ext = type === 'jpg' || type === 'jpeg' ? '.jpg' : `.${type}`;
    return { ext, buffer };
}

function resolveExpressionPath(charDir: string, id: string, key: string, ext: string): string | undefined {
    if (!isValidCharacterId(id)) { return undefined; }
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'expression';
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext.toLowerCase()) ? ext.toLowerCase() : '.png';
    const base = path.resolve(charDir);
    const resolved = path.resolve(base, `${id}_expr_${safeKey}${safeExt}`);
    return resolved.startsWith(base + path.sep) ? resolved : undefined;
}

function persistCharacterImage(charDir: string, id: string, value: unknown, kind: 'portrait' | 'expression', key?: string): string | undefined {
    if (typeof value === 'string' && !value.startsWith('data:image/')) {
        return value;
    }
    const decoded = decodeDataImage(value);
    if (!decoded) { return typeof value === 'string' ? undefined : undefined; }
    const dest = kind === 'portrait'
        ? resolvePortraitPath(charDir, id, decoded.ext)
        : resolveExpressionPath(charDir, id, key ?? 'expression', decoded.ext);
    if (!dest) { return undefined; }
    fs.writeFileSync(dest, decoded.buffer);
    return dest;
}

function sanitizeCharacterForSave(character: CharacterProfile): CharacterProfile | undefined {
    const charDir = getCharactersDir();
    if (!charDir || !isValidCharacterId(character.id)) { return undefined; }
    const raw = character as CharacterProfile & Record<string, unknown>;
    const sanitized: CharacterProfile = {
        id: character.id,
        name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 120) : '',
        description: typeof raw.description === 'string' ? raw.description.slice(0, 8000) : '',
        personality: typeof raw.personality === 'string' ? raw.personality.slice(0, 4000) : '',
        controlledBy: raw.controlledBy === 'player' || raw.controlledBy === 'ai' || raw.controlledBy === 'gm'
            ? raw.controlledBy
            : 'gm'
    };
    if (!sanitized.name) { return undefined; }
    if (typeof raw.llmProvider === 'string') { sanitized.llmProvider = raw.llmProvider.slice(0, 80); }
    if (typeof raw.llmModel === 'string') { sanitized.llmModel = raw.llmModel.slice(0, 120); }
    if (raw.equipment && typeof raw.equipment === 'object' && !Array.isArray(raw.equipment)) {
        const eq = raw.equipment as Record<string, unknown>;
        sanitized.equipment = {};
        if (typeof eq.weapon === 'string') { sanitized.equipment.weapon = eq.weapon.slice(0, 120); }
        if (typeof eq.armor === 'string') { sanitized.equipment.armor = eq.armor.slice(0, 120); }
        if (typeof eq.accessory === 'string') { sanitized.equipment.accessory = eq.accessory.slice(0, 120); }
    }
    const portrait = persistCharacterImage(charDir, character.id, raw.portrait, 'portrait');
    if (portrait) { sanitized.portrait = portrait; }
    if (raw.expressions && typeof raw.expressions === 'object' && !Array.isArray(raw.expressions)) {
        const expressions: Record<string, string> = {};
        for (const [key, value] of Object.entries(raw.expressions as Record<string, unknown>).slice(0, 32)) {
            const uri = typeof value === 'object' && value !== null && 'uri' in value
                ? (value as Record<string, unknown>).uri
                : value;
            const saved = persistCharacterImage(charDir, character.id, uri, 'expression', key);
            if (saved) { expressions[key.slice(0, 64)] = saved; }
        }
        if (Object.keys(expressions).length > 0) { sanitized.expressions = expressions; }
    }
    if (raw.stSource && typeof raw.stSource === 'object' && !Array.isArray(raw.stSource)) {
        sanitized.stSource = raw.stSource;
    }
    return sanitized;
}

export function saveCharacter(character: CharacterProfile): void {
    const charDir = getCharactersDir();
    if (!charDir || !isValidCharacterId(character.id)) { return; }
    const filePath = resolveCharacterJsonPath(charDir, character.id);
    if (!filePath) { return; }
    const sanitized = sanitizeCharacterForSave(character);
    if (!sanitized) { return; }
    try {
        writeJsonAtomic(filePath, sanitized);
        sendCharacterList();
    } catch (e) {
        console.error('Error saving character:', e);
    }
}

export function setActiveCharacter(id: string): void {
    const charDir = getCharactersDir();
    if (!charDir || !isValidCharacterId(id)) { return; }
    try {
        const activeFile = path.join(charDir, 'active_character.txt');
        const tmp = `${activeFile}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tmp, id, 'utf-8');
        fs.renameSync(tmp, activeFile);
        sendCharacterList();
    } catch (e) {
        console.error('Error setting active character:', e);
    }
}

function notifyPartyChanged(): void {
    deps?.onPartyChanged?.();
}

export function addToParty(id: string): void {
    const ids = getPartyIds();
    if (!ids.includes(id)) {
        ids.push(id);
        savePartyIds(ids);
        sendCharacterList();
        notifyPartyChanged();
    }
}

export function removeFromParty(id: string): void {
    const ids = getPartyIds();
    const newIds = ids.filter(x => x !== id);
    if (ids.length !== newIds.length) {
        savePartyIds(newIds);
        sendCharacterList();
        notifyPartyChanged();
    }
}

export async function uploadPortrait(id: string): Promise<void> {
    const charDir = getCharactersDir();
    if (!charDir || !isValidCharacterId(id)) { return; }
    const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Images': ['png', 'jpg', 'jpeg', 'webp'] }
    });
    if (!picked || picked.length === 0) { return; }

    const sourcePath = picked[0].fsPath;
    const ext = path.extname(sourcePath);
    const destPath = resolvePortraitPath(charDir, id, ext);
    const jsonPath = resolveCharacterJsonPath(charDir, id);
    if (!destPath || !jsonPath) { return; }

    try {
        fs.copyFileSync(sourcePath, destPath);
        if (fs.existsSync(jsonPath)) {
            const char: CharacterProfile = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            char.portrait = destPath;
            saveCharacter(char);
        }
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to copy image: ${e}`);
    }
}

export async function generatePortrait(id: string): Promise<void> {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(t('extension.error.untrustedWorkspace'));
        return;
    }

    const { getPanel } = requireDeps();
    const charDir = getCharactersDir();
    if (!charDir || !isValidCharacterId(id)) { return; }

    const jsonPath = resolveCharacterJsonPath(charDir, id);
    if (!jsonPath || !fs.existsSync(jsonPath)) { return; }

    const char: CharacterProfile = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    const wsPath = getWorkspacePath() || process.cwd();
    let currentTheme = 'fantasy';
    const statePath = getGameStatePath();
    if (statePath && fs.existsSync(statePath)) {
        try {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
            if (state.theme) { currentTheme = state.theme; }
        } catch { /* ignore */ }
    }

    const prompt = `A high quality full body character portrait of ${char.name}. ${char.description}. The setting is a ${currentTheme} world. The character's outfit and gear are adapted to fit the ${currentTheme} theme seamlessly.`;

    const scriptPath = resolveComfyScript(wsPath);
    if (!scriptPath) {
        vscode.window.showWarningMessage(t('extension.error.imageScriptNotFound'));
        return;
    }

    if (portraitProcess) {
        vscode.window.showWarningMessage(t('extension.warning.imageBusy'));
        return;
    }

    const channel = getImageOutputChannel();
    const env = buildImageGenEnv(wsPath);
    const portraitConfig = loadImageGenConfig(wsPath);
    const portraitMode = ['pony', 'illustrious', 'natural', 'standard'].includes(portraitConfig.mode)
        ? portraitConfig.mode
        : 'illustrious';

    channel.show(true);
    channel.appendLine(`Generating portrait for ${char.name} in theme ${currentTheme}...`);
    getPanel()?.webview.postMessage({ type: 'imageGenStart' });

    const python = resolvePythonCommand();
    const child = spawn(python, [scriptPath, prompt, charDir, portraitMode], {
        shell: false,
        env
    });
    portraitProcess = child;

    let finished = false;
    const finishPortrait = (code: number | null) => {
        if (finished) { return; }
        finished = true;
        portraitProcess = undefined;
        channel.appendLine(`\nProcess exited with code ${code ?? 'unknown'}`);
        getPanel()?.webview.postMessage({ type: 'imageGenEnd', success: code === 0 });

        if (code === 0) {
            try {
                const files = fs.readdirSync(charDir)
                    .filter(f => f.startsWith('scene_') && f.endsWith('.png'))
                    .map(f => ({ name: f, time: fs.statSync(path.join(charDir, f)).mtime.getTime() }))
                    .sort((a, b) => b.time - a.time);

                if (files.length > 0) {
                    const latest = files[0].name;
                    const src = path.join(charDir, latest);
                    const dest = path.join(charDir, `${id}_portrait.png`);
                    fs.renameSync(src, dest);

                    char.portrait = dest;
                    saveCharacter(char);
                    const uri = safeImageUri(dest);
                    if (uri) {
                        getPanel()?.webview.postMessage({ type: 'portraitGenerated', id, uri });
                    }
                    vscode.window.showInformationMessage('Portrait generated successfully!');
                }
            } catch (e) {
                console.error('Failed to link generated portrait:', e);
            }
        }
    };

    child.stdout.on('data', (data) => channel.append(data.toString()));
    child.stderr.on('data', (data) => channel.append(data.toString()));

    child.on('error', (err) => {
        if (finished) { return; }
        channel.appendLine(`\n[Error: ${err.message}]`);
        vscode.window.showErrorMessage(t('extension.error.pythonFailed', { message: err.message }));
        finishPortrait(null);
    });

    child.on('close', (code) => {
        finishPortrait(code);
    });
}
