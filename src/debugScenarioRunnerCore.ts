import * as fs from 'fs';
import * as path from 'path';
import {
    computeNextTurnIdFromEntries,
    executeDebugCommand,
    isDebugScenarioPack,
    mergeDebugStatePatches,
    parseDebugCommand,
    type DebugCommandContext,
} from './debugScenarioCore';
import { DEFAULT_GAME_RULES, loadGameRules } from './gameRules';
import { loadNpcRegistry, applyNpcMemoryUpdates } from './npcRegistry';
import { loadWorldForge } from './worldForge';
import { loadWorldState } from './worldState';
import { ABSOLUTE_MAX_BULK_WORLD_STEPS } from './worldSimBulkCore';
import { persistWorldSimulationSteps } from './worldSimPersist';
import { parseWorldForge } from './worldForgeCore';
import type { TurnResult } from './types/TurnResult';
import type { GameStateWorld } from './types/GameState';
import { buildFogPayload } from './fogOfWarCore';

export interface DebugScenarioTurnResult {
    handled: boolean;
    turnResult?: TurnResult;
    infoMessage?: string;
    warningMessage?: string;
}

export function isActiveDebugScenario(wsPath: string): boolean {
    const scenarioPath = path.join(wsPath, 'scenario.json');
    if (!fs.existsSync(scenarioPath)) {
        return false;
    }
    try {
        const doc = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8')) as { meta?: { tags?: unknown } };
        return isDebugScenarioPack(doc.meta);
    } catch {
        return false;
    }
}

export function buildDebugCommandContext(wsPath: string): DebugCommandContext | null {
    const rules = loadGameRules();
    const registry = rules.enableNpcRegistry ? loadNpcRegistry() : { format: 'lorerelay-npc-registry/1.0', npcs: {} };
    const npcs = Object.entries(registry.npcs).map(([id, entry]) => ({
        id,
        name: entry.name,
        trust: entry.disposition?.playerTrust ?? 50,
        romance: entry.disposition?.playerRomance ?? 0,
        fear: entry.disposition?.playerFear ?? 0,
    }));

    let regions: { id: string; name: string }[] = [];
    let locations: { id: string; name: string }[] = [];
    let discoveredRegionIds: string[] = [];
    let rumoredRegionIds: string[] = [];
    let worldTurn = 0;
    let currentLocationId: string | undefined;
    let hp: { current: number; max: number } | undefined;

    const forge = loadWorldForge();
    if (forge) {
        regions = forge.geography.regions.map((r) => ({ id: r.id, name: r.name }));
        locations = forge.geography.locations.map((l) => ({ id: l.id, name: l.name }));
    }

    const worldState = loadWorldState();
    if (worldState) {
        worldTurn = worldState.worldTurn ?? 0;
    }

    const statePath = path.join(wsPath, 'game_state.json');
    if (fs.existsSync(statePath)) {
        try {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as {
                world?: GameStateWorld;
                status?: { hp?: { current?: number; max?: number } };
            };
            if (forge) {
                const fog = buildFogPayload(state.world, forge);
                discoveredRegionIds = [...fog.discoveredRegionIds];
                rumoredRegionIds = [...fog.rumoredRegionIds];
            }
            if (typeof state.world?.currentLocationId === 'string') {
                currentLocationId = state.world.currentLocationId;
            }
            const hpBlock = state.status?.hp;
            if (hpBlock && typeof hpBlock.current === 'number' && typeof hpBlock.max === 'number') {
                hp = { current: hpBlock.current, max: hpBlock.max };
            }
        } catch { /* ignore */ }
    }

    return {
        npcs,
        regions,
        locations,
        worldTurn,
        discoveredRegionIds,
        rumoredRegionIds,
        currentLocationId,
        hp,
    };
}

function ensureWorldBlock(wsPath: string): void {
    const forge = loadWorldForge();
    if (!forge || forge.geography.locations.length === 0) {
        return;
    }
    const statePath = path.join(wsPath, 'game_state.json');
    if (!fs.existsSync(statePath)) {
        return;
    }
    try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
        const world = state.world as GameStateWorld | undefined;
        if (world?.currentLocationId) {
            return;
        }
        const firstLoc = forge.geography.locations[0];
        state.world = { ...(world ?? {}), currentLocationId: firstLoc.id };
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch { /* ignore */ }
}

function runWorldSimSteps(steps: number): {
    ok: boolean;
    summaryText?: string;
    infoMessage?: string;
    warning?: string;
} {
    const result = persistWorldSimulationSteps(steps, ABSOLUTE_MAX_BULK_WORLD_STEPS);
    if (!result.ok) {
        const warning = result.reason === 'SIM_OFF'
            ? 'Emergent Simulation が OFF です。'
            : result.reason === 'NO_FORGE'
                ? 'world_forge.json が必要です。'
                : 'ステップ数が無効です。';
        return { ok: false, warning };
    }
    const s = result.summary;
    return {
        ok: true,
        summaryText: `世界ターン **${s.startWorldTurn}** → **${s.endWorldTurn}**（イベント ${s.totalEventsEmitted} 件）`,
        infoMessage: `世界シミュ: ターン ${s.startWorldTurn} → ${s.endWorldTurn}（イベント ${s.totalEventsEmitted} 件）`,
    };
}

export function executeDebugScenarioTurn(
    wsPath: string,
    playerAction: string,
    ctx: DebugCommandContext
): DebugScenarioTurnResult {
    const parsed = parseDebugCommand(playerAction, ctx);
    if (!parsed) {
        return { handled: false };
    }

    const outcome = executeDebugCommand(parsed, ctx);
    let infoMessage: string | undefined;
    let warningMessage: string | undefined;

    if (outcome.worldSimSteps) {
        const sim = runWorldSimSteps(outcome.worldSimSteps);
        if (!sim.ok) {
            warningMessage = sim.warning;
            outcome.narration += `\n\n（${sim.warning}）`;
        } else {
            infoMessage = sim.infoMessage;
            outcome.narration += `\n\n完了: ${sim.summaryText}`;
        }
    }

    if (outcome.npcUpdates && outcome.npcUpdates.length > 0) {
        const rules = loadGameRules();
        if (!rules.enableNpcRegistry) {
            outcome.narration += '\n\n（NPC Registry が OFF のため好感度は保存されませんでした）';
        } else {
            const statePath = path.join(wsPath, 'game_state.json');
            let turn = 0;
            if (fs.existsSync(statePath)) {
                try {
                    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as { entries?: unknown[] };
                    turn = Array.isArray(state.entries) ? state.entries.length : 0;
                } catch { /* ignore */ }
            }
            applyNpcMemoryUpdates(outcome.npcUpdates, turn);
        }
    }

    if (outcome.cartographyReveal || outcome.statePatch?.some((p) => p.path.startsWith('/world'))) {
        ensureWorldBlock(wsPath);
    }

    const turnResult = buildDebugTurnResult(wsPath, playerAction, {
        narration: outcome.narration,
        options: outcome.options,
        cartographyReveal: outcome.cartographyReveal,
        statePatch: mergeDebugStatePatches(outcome.options, outcome.statePatch),
    });

    return { handled: true, turnResult, infoMessage, warningMessage };
}

function buildDebugTurnResult(
    wsPath: string,
    playerAction: string,
    payload: {
        narration: string;
        options?: string[];
        cartographyReveal?: TurnResult['cartographyReveal'];
        statePatch?: TurnResult['statePatch'];
    }
): TurnResult {
    const statePath = path.join(wsPath, 'game_state.json');
    let entries: unknown[] = [];
    if (fs.existsSync(statePath)) {
        try {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as { entries?: unknown[] };
            entries = Array.isArray(state.entries) ? state.entries : [];
        } catch { /* ignore */ }
    }

    return {
        turnId: computeNextTurnIdFromEntries(entries),
        playerAction,
        narration: payload.narration,
        statePatch: payload.statePatch,
        cartographyReveal: payload.cartographyReveal,
        gmEntry: { sender: 'Debug Console' },
    };
}

/** Seed game_state.world.currentLocationId when loading a debug pack. */
export function seedDebugScenarioWorldFromForge(
    state: Record<string, unknown>,
    forgeRaw: unknown
): Record<string, unknown> {
    const forge = parseWorldForge(forgeRaw);
    if (!forge || forge.geography.locations.length === 0) {
        return state;
    }
    const firstLoc = forge.geography.locations[0];
    const maxHp = DEFAULT_GAME_RULES.defaultMaxHp;
    return {
        ...state,
        world: { currentLocationId: firstLoc.id },
        status: {
            ...(typeof state.status === 'object' && state.status ? state.status as object : {}),
            hp: { current: maxHp, max: maxHp },
        },
    };
}