import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';

export interface GameRules {
    enableRpgMechanics: boolean;
    defaultMaxHp: number;
    defaultMaxMp: number;
    diceDifficulty: string; // e.g. "Normal", "Hard"
    skillCommentary?: boolean;
    backgroundSimulation?: boolean;
    autoLorebookGrowth?: boolean;
    enableNpcRegistry?: boolean;
    enableWorldForge?: boolean;
    enableEmergentSimulation?: boolean;
    simIntervalTurns?: number;
}

export const DEFAULT_GAME_RULES: GameRules = {
    enableRpgMechanics: true,
    defaultMaxHp: 100,
    defaultMaxMp: 50,
    diceDifficulty: "Normal",
    skillCommentary: false,
    backgroundSimulation: false,
    autoLorebookGrowth: false,
    enableNpcRegistry: false,
    enableWorldForge: false,
    enableEmergentSimulation: false,
    simIntervalTurns: 5
};

export function getGameRulesPath(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) return undefined;
    return path.join(ws, 'game_rules.json');
}

let cachedRules: GameRules | undefined = undefined;
let cacheRulesPath = '';
let cacheRulesMtime = 0;

export function clearGameRulesCache(): void {
    cachedRules = undefined;
    cacheRulesPath = '';
    cacheRulesMtime = 0;
}

export function loadGameRules(): GameRules {
    const rulesPath = getGameRulesPath();
    if (!rulesPath || !fs.existsSync(rulesPath)) {
        return { ...DEFAULT_GAME_RULES };
    }
    try {
        const mtime = fs.statSync(rulesPath).mtimeMs;
        if (cachedRules && cacheRulesPath === rulesPath && cacheRulesMtime === mtime) {
            return cachedRules;
        }
        const data = fs.readFileSync(rulesPath, 'utf8');
        const parsed = JSON.parse(data);
        const loaded = { ...DEFAULT_GAME_RULES, ...parsed };
        cachedRules = loaded;
        cacheRulesPath = rulesPath;
        cacheRulesMtime = mtime;
        return loaded;
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
            if (difficulty === 'Easy' || difficulty === 'Normal' || difficulty === 'Hard') {
                sanitized.diceDifficulty = difficulty;
            }
        }
        if (rules.skillCommentary !== undefined && typeof rules.skillCommentary === 'boolean') {
            sanitized.skillCommentary = rules.skillCommentary;
        }
        if (rules.backgroundSimulation !== undefined && typeof rules.backgroundSimulation === 'boolean') {
            sanitized.backgroundSimulation = rules.backgroundSimulation;
        }
        if (rules.autoLorebookGrowth !== undefined && typeof rules.autoLorebookGrowth === 'boolean') {
            sanitized.autoLorebookGrowth = rules.autoLorebookGrowth;
        }
        if (rules.enableNpcRegistry !== undefined && typeof rules.enableNpcRegistry === 'boolean') {
            sanitized.enableNpcRegistry = rules.enableNpcRegistry;
        }
        if (rules.enableWorldForge !== undefined && typeof rules.enableWorldForge === 'boolean') {
            sanitized.enableWorldForge = rules.enableWorldForge;
        }
        if (rules.enableEmergentSimulation !== undefined && typeof rules.enableEmergentSimulation === 'boolean') {
            sanitized.enableEmergentSimulation = rules.enableEmergentSimulation;
        }
        if (rules.simIntervalTurns !== undefined && typeof rules.simIntervalTurns === 'number') {
            sanitized.simIntervalTurns = Math.max(1, Math.min(50, Math.floor(rules.simIntervalTurns)));
        }
    }

    const updated = { ...current, ...sanitized };

    try {
        writeJsonAtomic(rulesPath, updated);
        cachedRules = updated;
        cacheRulesPath = rulesPath;
        try { cacheRulesMtime = fs.statSync(rulesPath).mtimeMs; } catch { cacheRulesMtime = 0; }
    } catch (err) {
        console.error("Failed to save game_rules.json", err);
    }
}
