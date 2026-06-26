import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';

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
    const sanitized: Partial<GameRules> = {};

    if (rules && typeof rules === 'object') {
        if (rules.enableRpgMechanics !== undefined && typeof rules.enableRpgMechanics === 'boolean') {
            sanitized.enableRpgMechanics = rules.enableRpgMechanics;
        }
        if (rules.defaultMaxHp !== undefined && typeof rules.defaultMaxHp === 'number') {
            sanitized.defaultMaxHp = Math.max(1, Math.min(99999, Math.floor(rules.defaultMaxHp)));
        }
        if (rules.defaultMaxMp !== undefined && typeof rules.defaultMaxMp === 'number') {
            sanitized.defaultMaxMp = Math.max(1, Math.min(99999, Math.floor(rules.defaultMaxMp)));
        }
        if (rules.diceDifficulty !== undefined && typeof rules.diceDifficulty === 'string') {
            const difficulty = rules.diceDifficulty.trim();
            if (difficulty === 'Normal' || difficulty === 'Hard') {
                sanitized.diceDifficulty = difficulty;
            }
        }
    }

    const updated = { ...current, ...sanitized };

    try {
        writeJsonAtomic(rulesPath, updated);
    } catch (err) {
        console.error("Failed to save game_rules.json", err);
    }
}
