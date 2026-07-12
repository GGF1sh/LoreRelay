import * as fs from 'fs';
import { loadGameRules } from './gameRules';
import { loadWorldForge, loadWorldForgeDocument, isWorldForgeEnabled } from './worldForge';
import { loadWorldState, saveWorldState } from './worldState';
import { loadNpcRegistry, saveNpcRegistry } from './npcRegistry';
import { getGameStatePath } from './workspacePaths';
import { commitGameState } from './stateManager';
import { readStateRevision } from './workspaceStateQueueCore';
import { runBulkWorldSimulation } from './worldSimBulkCore';
import { applyLivingWorldAfterSimulationStep } from './emergentSimulator';
import { executeCrossFileDualWrite, type CrossFileDualWriteOutcome } from './workspaceWriteCircuitBreakerCore';
import { recordSplitBrainRisk } from './workspaceWriteHealth';
import type { GameState } from './types/GameState';
import type { WorldChangeEvent } from './worldEventLogCore';
import type { MarketStateMap } from './livingWorldTypes';

export type EndDayFailureCode =
    | 'CONFIRMATION_REQUIRED' | 'SIM_OFF' | 'NO_FORGE' | 'NO_WORLD' | 'NO_GAME_STATE'
    | 'NO_LOCATION' | 'SIMULATION_FAILED' | 'PERSIST_FAILED' | 'PARTIAL_PERSIST_FAILED';

export interface EndDayPreview {
    ok: true;
    currentWorldTurn: number;
    targetWorldTurn: number;
    currentLocationId: string;
    systems: string[];
    fixedResourceConsumption: Array<{ resource: string; amount: number }>;
}

export interface EndDayFailure {
    ok: false;
    code: EndDayFailureCode;
    message: string;
    nextStep: string;
    persistence?: CrossFileDualWriteOutcome & { npcAttempted: boolean; npcOk: boolean };
}

export interface EndDayReceipt {
    requestId: string;
    worldTurn: { before: number; after: number };
    currentLocationId: string;
    eventCount: number;
    eventCategories: string[];
    marketChanges: Array<{ commodityId: string; stockDelta: number; priceIndexDelta: number }>;
    resourceChanges: Array<{ resource: string; before: number; after: number }>;
    quiet: boolean;
    persisted: true;
}

export interface EndDayHostDeps {
    loadGameRules: typeof loadGameRules;
    isWorldForgeEnabled: typeof isWorldForgeEnabled;
    loadWorldForge: typeof loadWorldForge;
    loadWorldForgeDocument: typeof loadWorldForgeDocument;
    loadWorldState: typeof loadWorldState;
    saveWorldState: typeof saveWorldState;
    loadNpcRegistry: typeof loadNpcRegistry;
    saveNpcRegistry: typeof saveNpcRegistry;
    getGameStatePath: typeof getGameStatePath;
    commitGameState: typeof commitGameState;
    readStateRevision: typeof readStateRevision;
    runBulkWorldSimulation: typeof runBulkWorldSimulation;
    applyLivingWorldAfterSimulationStep: typeof applyLivingWorldAfterSimulationStep;
    recordSplitBrainRisk: typeof recordSplitBrainRisk;
}

const productionDeps: EndDayHostDeps = {
    loadGameRules, isWorldForgeEnabled, loadWorldForge, loadWorldForgeDocument,
    loadWorldState, saveWorldState, loadNpcRegistry, saveNpcRegistry,
    getGameStatePath, commitGameState, readStateRevision, runBulkWorldSimulation,
    applyLivingWorldAfterSimulationStep, recordSplitBrainRisk,
};

function readGameState(deps: EndDayHostDeps): GameState | undefined {
    const path = deps.getGameStatePath();
    if (!path || !fs.existsSync(path)) { return undefined; }
    try { return JSON.parse(fs.readFileSync(path, 'utf8')) as GameState; } catch { return undefined; }
}

function failure(code: EndDayFailureCode, message: string, nextStep: string, persistence?: EndDayFailure['persistence']): EndDayFailure {
    return { ok: false, code, message, nextStep, persistence };
}

function currentLocation(state: GameState | undefined): string | undefined {
    const id = state?.world?.currentLocationId;
    return typeof id === 'string' && id ? id : undefined;
}

function changedMarkets(before: MarketStateMap | undefined, after: MarketStateMap | undefined, locationId: string) {
    const oldStocks = before?.[locationId] ?? {};
    const newStocks = after?.[locationId] ?? {};
    const ids = new Set([...Object.keys(oldStocks), ...Object.keys(newStocks)]);
    return [...ids].map((commodityId) => ({
        commodityId,
        stockDelta: (newStocks[commodityId]?.stock ?? 0) - (oldStocks[commodityId]?.stock ?? 0),
        priceIndexDelta: (newStocks[commodityId]?.priceIndex ?? 1) - (oldStocks[commodityId]?.priceIndex ?? 1),
    })).filter((change) => change.stockDelta !== 0 || change.priceIndexDelta !== 0);
}

/** Preview only reads canonical state; it never schedules or writes a mutation. */
export function previewEndDay(deps: EndDayHostDeps = productionDeps): EndDayPreview | EndDayFailure {
    const rules = deps.loadGameRules();
    if (!rules.enableEmergentSimulation) return failure('SIM_OFF', '世界シミュレーションが有効ではありません。', 'ゲームルールを確認してください。');
    if (!deps.isWorldForgeEnabled() || !deps.loadWorldForge()) return failure('NO_FORGE', '世界設定を確認できません。', 'World Forge を確認してください。');
    const state = deps.loadWorldState();
    if (!state) return failure('NO_WORLD', '世界状態を確認できません。', '現在のワークスペースを確認してください。');
    const game = readGameState(deps);
    if (!game) return failure('NO_GAME_STATE', 'ゲーム状態を確認できません。', '現在のワークスペースを確認してください。');
    const locationId = currentLocation(game);
    if (!locationId) return failure('NO_LOCATION', '現在地を確認できません。', '現在地を設定してから再試行してください。');
    return {
        ok: true,
        currentWorldTurn: state.worldTurn ?? 0,
        targetWorldTurn: (state.worldTurn ?? 0) + 1,
        currentLocationId: locationId,
        systems: ['world simulation', ...(rules.enableCommerce ? ['market recovery'] : []), ...(rules.enableNpcRegistry ? ['NPC registry'] : [])],
        fixedResourceConsumption: [],
    };
}

/**
 * Re-reads canonical state at commit. A single runBulkWorldSimulation step is the
 * authority; its afterStep invokes the existing Living World cadence (including
 * tickMarketRecovery when commerce is enabled). No Relay, GM, narration, or LLM path is used.
 */
export function executeEndDay(requestId: string, confirmed: boolean, deps: EndDayHostDeps = productionDeps): EndDayReceipt | EndDayFailure {
    if (!confirmed) return failure('CONFIRMATION_REQUIRED', '日を終えるには明示的な確認が必要です。', '確認画面で「一日を終える」を選択してください。');
    const preview = previewEndDay(deps);
    if (!preview.ok) return preview;

    const rules = deps.loadGameRules();
    const forge = deps.loadWorldForge();
    const worldBefore = deps.loadWorldState();
    const gameBefore = readGameState(deps);
    if (!forge || !worldBefore || !gameBefore) return failure('NO_WORLD', '日を終える前の状態を再読込できませんでした。', '現在の状態を確認してください。');
    const locationId = currentLocation(gameBefore);
    if (!locationId) return failure('NO_LOCATION', '現在地を確認できません。', '現在地を設定してから再試行してください。');

    const registry = rules.enableNpcRegistry === true ? deps.loadNpcRegistry() : undefined;
    let stepEvents: WorldChangeEvent[] = [];
    let marketBefore: MarketStateMap | undefined;
    let marketAfter: MarketStateMap | undefined;
    let result: ReturnType<typeof runBulkWorldSimulation>;
    try {
        result = deps.runBulkWorldSimulation(forge, worldBefore, registry, {
            steps: 1,
            maxSteps: 1,
            enableNpcRegistry: rules.enableNpcRegistry === true,
            afterStep: (state, events, nextRegistry) => {
                stepEvents = events;
                marketBefore = (state as typeof state & { markets?: MarketStateMap }).markets;
                const next = deps.applyLivingWorldAfterSimulationStep(forge, state, nextRegistry, events);
                marketAfter = (next as typeof next & { markets?: MarketStateMap }).markets;
                return next;
            },
        });
    } catch {
        return failure('SIMULATION_FAILED', '世界の一日を計算できませんでした。', '日を終える操作は書き込まれませんでした。');
    }
    if (!result.ok || result.summary.stepsExecuted !== 1 || result.summary.endWorldTurn !== result.summary.startWorldTurn + 1) {
        return failure('SIMULATION_FAILED', '世界の一日を確認できませんでした。', '日を終える操作は書き込まれませんでした。');
    }

    const nextGame: GameState = {
        ...gameBefore,
        world: { ...(gameBefore.world ?? {}), worldTurnAtLastSync: result.summary.endWorldTurn },
    };
    const baseRevision = deps.readStateRevision(gameBefore as unknown as Record<string, unknown>);
    let npcAttempted = Boolean(rules.enableNpcRegistry && result.registry);
    let npcOk = !npcAttempted;
    const persistence = executeCrossFileDualWrite({
        gameAttempted: true,
        worldAttempted: true,
        writeGame: () => {
            try { return deps.commitGameState(nextGame, { mode: 'salvage', baseRevision, mergeProfile: 'turn' }).ok; } catch { return false; }
        },
        writeWorld: () => {
            try {
                if (npcAttempted && result.registry) {
                    deps.saveNpcRegistry(result.registry);
                    npcOk = true;
                }
                return deps.saveWorldState(result.state);
            } catch { npcOk = false; return false; }
        },
    });
    const fullPersistence = { ...persistence, npcAttempted, npcOk };
    deps.recordSplitBrainRisk(persistence, 'endDayWorldProgression');
    if (!persistence.ok || !npcOk) {
        return failure(
            persistence.partial || (persistence.gameOk || persistence.worldOk) ? 'PARTIAL_PERSIST_FAILED' : 'PERSIST_FAILED',
            '日を終えた結果をすべて書き込めたことを確認できませんでした。',
            '現在の状態を確認してから再試行してください。',
            fullPersistence
        );
    }

    const categories = [...new Set(stepEvents.map((event) => String(event.category)))];
    const resourceChanges: EndDayReceipt['resourceChanges'] = [];
    const foodBefore = gameBefore.commerce?.food;
    const foodAfter = nextGame.commerce?.food;
    if (typeof foodBefore === 'number' && typeof foodAfter === 'number' && foodBefore !== foodAfter) {
        resourceChanges.push({ resource: 'food', before: foodBefore, after: foodAfter });
    }
    return {
        requestId,
        worldTurn: { before: result.summary.startWorldTurn, after: result.summary.endWorldTurn },
        currentLocationId: locationId,
        eventCount: stepEvents.length,
        eventCategories: categories,
        marketChanges: changedMarkets(marketBefore, marketAfter, locationId),
        resourceChanges,
        quiet: stepEvents.length === 0,
        persisted: true,
    };
}
