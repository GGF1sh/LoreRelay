import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, getGameStatePath } from './workspacePaths';
import {
    mergeScenarioDirector,
    parseGameStateDirector,
    parseScenarioDirectorTemplate,
    seedDirectorFromTemplate,
    validateGameStateDirector,
    validateScenarioDirectorBlock,
    type GameStateDirector,
    type GuidanceMode,
    type ScenarioDirectorTemplate,
    type ScenarioDirectorView
} from './scenarioDirectorCore';

export type { GameStateDirector, GuidanceMode, ScenarioDirectorTemplate, ScenarioDirectorView };
export {
    parseScenarioDirectorTemplate,
    validateGameStateDirector,
    validateScenarioDirectorBlock,
    seedDirectorFromTemplate
};

let getPanelRef: (() => vscode.WebviewPanel | undefined) | undefined;

export function initScenarioDirector(deps: { getPanel: () => vscode.WebviewPanel | undefined }): void {
    getPanelRef = deps.getPanel;
}

export function pushScenarioDirectorToWebview(): void {
    const panel = getPanelRef?.();
    if (!panel) {
        return;
    }
    panel.webview.postMessage({
        type: 'scenarioDirector',
        director: loadScenarioDirector()
    });
}

function readScenarioFile(): Record<string, unknown> | undefined {
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const scenarioPath = path.join(ws, 'scenario.json');
    if (!fs.existsSync(scenarioPath)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(scenarioPath, 'utf-8')) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

function loadDirectorTemplate(): ScenarioDirectorTemplate | undefined {
    const raw = readScenarioFile();
    if (!raw) {
        return undefined;
    }
    return parseScenarioDirectorTemplate(
        raw.director as Record<string, unknown> | undefined,
        raw.meta as Record<string, unknown> | undefined
    );
}

function loadDirectorRuntime(): GameStateDirector | undefined {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
        return parseGameStateDirector(state.director);
    } catch {
        return undefined;
    }
}

/** scenario.json テンプレート + game_state.director ランタイムをマージして返す。 */
export function loadScenarioDirector(): ScenarioDirectorView | undefined {
    return mergeScenarioDirector(loadDirectorTemplate(), loadDirectorRuntime());
}