import {
    DEFAULT_GAME_RULES,
    normalizeGameRules,
    type GameRules,
} from './gameRulesCore';
import {
    resolveRulesProfile,
    type GenesisAnswers,
    type RulesProfileResult,
} from './rulesProfileCore';

export interface RulesProfileApplyResult {
    profile: RulesProfileResult;
    currentRules: GameRules;
    mergedRules: GameRules;
    changedKeys: string[];
}

const SUPPORTED_RULE_KEYS = new Set(Object.keys(DEFAULT_GAME_RULES));

function sanitizePatch(patch: Partial<GameRules>): Partial<GameRules> {
    const clean: Partial<GameRules> = {};
    for (const [key, value] of Object.entries(patch)) {
        if (SUPPORTED_RULE_KEYS.has(key)) {
            (clean as Record<string, unknown>)[key] = value;
        }
    }
    return clean;
}

function diffKeys(before: GameRules, after: GameRules): string[] {
    const beforeRecord = before as unknown as Record<string, unknown>;
    const afterRecord = after as unknown as Record<string, unknown>;
    return Object.keys(after)
        .filter((key) => beforeRecord[key] !== afterRecord[key])
        .sort();
}

/**
 * Authoritative Genesis apply gate.
 *
 * Webview previews may mirror Genesis logic for responsiveness, but disk writes
 * must pass through this pure resolver first. It only returns the merged rules;
 * host code remains responsible for persistence.
 */
export function buildRulesProfileApplication(
    currentRules: unknown,
    answers?: GenesisAnswers
): RulesProfileApplyResult {
    const current = normalizeGameRules(currentRules);
    const profile = resolveRulesProfile(answers);
    const patch = sanitizePatch(profile.rulesPatch);
    const mergedRules = normalizeGameRules({ ...current, ...patch }, current);

    return {
        profile,
        currentRules: current,
        mergedRules,
        changedKeys: diffKeys(current, mergedRules),
    };
}
