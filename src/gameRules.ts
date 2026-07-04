import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import {
    DEFAULT_GAME_RULES,
    normalizeGameRules,
    normalizeGuildRuleFlags,
    type GameRules,
} from './gameRulesCore';

export type { GameRules };
export { DEFAULT_GAME_RULES, normalizeGameRules, normalizeGuildRuleFlags };

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
        return normalizeGameRules(DEFAULT_GAME_RULES);
    }
    try {
        const mtime = fs.statSync(rulesPath).mtimeMs;
        if (cachedRules && cacheRulesPath === rulesPath && cacheRulesMtime === mtime) {
            return cachedRules;
        }
        const data = fs.readFileSync(rulesPath, 'utf8');
        const parsed = JSON.parse(data);
        const merged = { ...DEFAULT_GAME_RULES, ...parsed };
        const loaded = normalizeGameRules(merged, merged);
        cachedRules = loaded;
        cacheRulesPath = rulesPath;
        cacheRulesMtime = mtime;
        return loaded;
    } catch (err) {
        console.error("Failed to load game_rules.json", err);
        return normalizeGameRules(DEFAULT_GAME_RULES);
    }
}

export function saveGameRules(rules: Partial<GameRules>): void {
    const rulesPath = getGameRulesPath();
    if (!rulesPath) return;

    const current = loadGameRules();
    const updated = normalizeGameRules({ ...current, ...rules }, current);

    try {
        writeJsonAtomic(rulesPath, updated);
        cachedRules = updated;
        cacheRulesPath = rulesPath;
        try { cacheRulesMtime = fs.statSync(rulesPath).mtimeMs; } catch { cacheRulesMtime = 0; }
    } catch (err) {
        console.error("Failed to save game_rules.json", err);
    }
}