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
import { getWorkspacePath, getGameStatePath } from './workspacePaths';
import { safeImageUri } from './gameStateSync';
import {
    buildImageGenEnv,
    getImageOutputChannel,
    resolveComfyScript
} from './imageGenRunner';
import { loadImageGenConfig } from './imageGenConfig';
import { t } from './i18n';
import { spawn } from 'child_process';

const CHARACTER_META_FILES = new Set(['party.json', 'dynamic_profiles.json']);

export interface CharacterManagerDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
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
            return JSON.parse(fs.readFileSync(partyFile, 'utf-8'));
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
        fs.writeFileSync(partyFile, JSON.stringify(filterValidCharacterIds(ids), null, 2), 'utf-8');
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
    const charDir = getCharactersDir();
    if (!charDir) { return undefined; }
    const filePath = path.join(charDir, `${id}.json`);
    if (!fs.existsSync(filePath)) { return undefined; }
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

export function sendCharacterList(): void {
    const panel = requireDeps().getPanel();
    if (!panel) { return; }
    const charDir = getCharactersDir();
    if (!charDir) { return; }

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

    panel.webview.postMessage({
        type: 'characterList',
        characters,
        activeCharacterId: getActiveCharacterId(),
        partyIds: getPartyIds()
    });
}

export function saveCharacter(character: CharacterProfile): void {
    const charDir = getCharactersDir();
    if (!charDir || !isValidCharacterId(character.id)) { return; }
    const filePath = resolveCharacterJsonPath(charDir, character.id);
    if (!filePath) { return; }
    try {
        fs.writeFileSync(filePath, JSON.stringify(character, null, 2), 'utf-8');
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
        fs.writeFileSync(activeFile, id, 'utf-8');
        sendCharacterList();
    } catch (e) {
        console.error('Error setting active character:', e);
    }
}

export function addToParty(id: string): void {
    const ids = getPartyIds();
    if (!ids.includes(id)) {
        ids.push(id);
        savePartyIds(ids);
        sendCharacterList();
    }
}

export function removeFromParty(id: string): void {
    const ids = getPartyIds();
    const newIds = ids.filter(x => x !== id);
    if (ids.length !== newIds.length) {
        savePartyIds(newIds);
        sendCharacterList();
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

    const channel = getImageOutputChannel();
    const env = buildImageGenEnv(wsPath);
    const portraitConfig = loadImageGenConfig(wsPath);
    const portraitMode = ['pony', 'illustrious', 'natural', 'standard'].includes(portraitConfig.mode)
        ? portraitConfig.mode
        : 'illustrious';

    channel.show(true);
    channel.appendLine(`Generating portrait for ${char.name} in theme ${currentTheme}...`);
    getPanel()?.webview.postMessage({ type: 'imageGenStart' });

    const child = spawn('python', [scriptPath, prompt, charDir, portraitMode], {
        shell: false,
        env
    });

    child.stdout.on('data', (data) => channel.append(data.toString()));
    child.stderr.on('data', (data) => channel.append(data.toString()));

    child.on('close', (code) => {
        channel.appendLine(`\nProcess exited with code ${code}`);
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
                    vscode.window.showInformationMessage('Portrait generated successfully!');
                }
            } catch (e) {
                console.error('Failed to link generated portrait:', e);
            }
        }
    });
}