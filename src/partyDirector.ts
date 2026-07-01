import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getPartyMemberIds } from './characterManager';
import { getGameStatePath, getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { commitGameState } from './stateManager';
import {
    mergePartyDirector,
    parseGameStatePartyDirector,
    parsePartyDirectorTemplate,
    serializePartyDirectorTemplate,
    validatePartyDirectorFile,
    type PartyDirectorTemplate,
    type PartyDirectorView
} from './partyDirectorCore';

export type { PartyDirectorView, PartyDirectorTemplate };
export { parsePartyDirectorTemplate, validatePartyDirectorFile };

const PARTY_DIRECTOR_FILE = 'party_director.json';

let getPanelRef: (() => vscode.WebviewPanel | undefined) | undefined;

export function initPartyDirector(deps: { getPanel: () => vscode.WebviewPanel | undefined }): void {
    getPanelRef = deps.getPanel;
}

export function pushPartyDirectorToWebview(): void {
    const panel = getPanelRef?.();
    if (!panel) {
        return;
    }
    panel.webview.postMessage({
        type: 'partyDirector',
        director: loadPartyDirector()
    });
}

function getPartyDirectorPath(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    return path.join(ws, 'characters', PARTY_DIRECTOR_FILE);
}

function loadDirectorTemplate(): PartyDirectorTemplate | undefined {
    const filePath = getPartyDirectorPath();
    if (!filePath || !fs.existsSync(filePath)) {
        return undefined;
    }
    try {
        return parsePartyDirectorTemplate(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } catch {
        return undefined;
    }
}

function loadDirectorRuntime(): ReturnType<typeof parseGameStatePartyDirector> {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
        return parseGameStatePartyDirector(state.partyDirector);
    } catch {
        return undefined;
    }
}

/** party_director.json + game_state.partyDirector をマージして返す。 */
export function loadPartyDirector(): PartyDirectorView | undefined {
    return mergePartyDirector(
        loadDirectorTemplate(),
        loadDirectorRuntime(),
        getPartyMemberIds()
    );
}

export interface PartyDirectorSaveResult {
    ok: boolean;
    path?: string;
    error?: string;
}

export function savePartyDirectorFromUi(raw: unknown): PartyDirectorSaveResult {
    const errors = validatePartyDirectorFile(raw);
    if (errors.length > 0) {
        return { ok: false, error: errors.join('; ') };
    }
    const parsed = parsePartyDirectorTemplate(raw);
    if (!parsed) {
        return { ok: false, error: 'Invalid party director document' };
    }
    const filePath = getPartyDirectorPath();
    if (!filePath) {
        return { ok: false, error: 'No workspace' };
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const doc = serializePartyDirectorTemplate({
        global: parsed.global,
        members: Object.fromEntries(
            Object.entries(parsed.members).map(([id, m]) => [id, { ...m, hasRuntimeOverrides: false }])
        ),
        hasRuntimeOverrides: false
    });
    try {
        writeJsonAtomic(filePath, doc);
        pushPartyDirectorToWebview();
        return { ok: true, path: filePath };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}