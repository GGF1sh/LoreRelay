import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath } from './workspacePaths';

export interface GameRules {
    enableRpgMechanics: boolean;
    defaultMaxHp: number;
    defaultMaxMp: number;
    diceDifficulty: string; // e.g. "Normal", "Hard"
}

export const DEFAULT_GAME_RULES: GameRules = {
    enableRpgMechanics: true,
    defaultMaxHp: 100,
    defaultMaxMp: 50,
    diceDifficulty: "Normal"
};

export function getGameRulesPath(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) return undefined;
    return path.join(ws, 'game_rules.json');
}

export function loadGameRules(): GameRules {
    const rulesPath = getGameRulesPath();
    if (!rulesPath || !fs.existsSync(rulesPath)) {
        return { ...DEFAULT_GAME_RULES };
    }
    try {
        const data = fs.readFileSync(rulesPath, 'utf8');
        const parsed = JSON.parse(data);
        return { ...DEFAULT_GAME_RULES, ...parsed };
    } catch (err) {
        console.error("Failed to load game_rules.json", err);
        return { ...DEFAULT_GAME_RULES };
    }
}

export function saveGameRules(rules: Partial<GameRules>): void {
    const rulesPath = getGameRulesPath();
    if (!rulesPath) return;

    const current = loadGameRules();
    const updated = { ...current, ...rules };

    try {
        fs.writeFileSync(rulesPath, JSON.stringify(updated, null, 4), 'utf8');
    } catch (err) {
        console.error("Failed to save game_rules.json", err);
    }
}
