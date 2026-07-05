import type { WorldForge, Faction } from './worldForgeCore';
import {
    type WorldState,
    type FactionWorldState,
    type RegionWorldState,
    type GlobalEvent
} from './worldStateCore';
import {
    type WorldChangeEvent,
    makeWorldChangeEvent,
    mergeRecentChanges,
    pruneExpiredEvents,
    MAX_RECENT_CHANGES,
} from './worldEventLogCore';
import { applyEventsToNpcRegistry } from './npcBridgeCore';
import type { NpcRegistry } from './npcRegistryCore';
import { loadWorldForge } from './worldForge';
import { loadGameRules } from './gameRules';
import { saveWorldState, ensureWorldStateExists } from './worldState';
import { loadNpcRegistry, saveNpcRegistry } from './npcRegistry';
import { generateQuestHooks } from './questGeneratorCore';
import { captureWorldStepDebugTraceIfGated } from './debugTraceWorldStepHost';
import { flushDebugTraceHostUpdate, ensureDebugTraceLiveRun } from './debugTraceHostCore';
import { captureNpcNeedDivergenceDeepTrace, resolveDeepTraceEmitGateFlags } from './debugTraceEmitHost';
import { livingWorldEnabled, tickLivingWorldAfterSim } from './livingWorldBridge';
import { loadWorldForgeDocument } from './worldForge';

/** Apply Tier-1/Tier-2 living world tick after a simulation step (host only — needs workspace). */
export function applyLivingWorldAfterSimulationStep(
    forge: WorldForge,
    state: WorldState,
    registry: NpcRegistry | undefined,
    stepEvents: WorldChangeEvent[] = []
): WorldState {
    const rules = loadGameRules();
    if (!livingWorldEnabled(rules)) { return state; }
    const rawDoc = loadWorldForgeDocument();
    return tickLivingWorldAfterSim(forge, state, registry, rules, rawDoc, stepEvents).state;
}

export interface WorldStepOutcome {
    state: WorldState;
    registry: NpcRegistry | undefined;
    registryUpdated: boolean;
}

/**
 * 決定論の世界1ステップ(sim tick → registry反映 → Living World tick → quest hooks)を
 * 計算するだけでディスクへは書かない。`persistWorldStepOutcome()` で保存する。
 */
export function computeOneWorldStep(forge: WorldForge, state: WorldState, rules = loadGameRules()): WorldStepOutcome {
    const { state: stepped, stepEvents } = runSimulationStep(forge, state);
    let next = stepped;

    // Propagate only this step's events — re-processing recentChanges would inflate needs
    let currentRegistry: NpcRegistry | undefined = undefined;
    let registryUpdated = false;
    if (rules.enableNpcRegistry) {
        currentRegistry = loadNpcRegistry();
        if (stepEvents.length > 0) {
            const { registry: updated, updatedIds } = applyEventsToNpcRegistry(
                stepEvents,
                currentRegistry,
                forge
            );

            if (updatedIds.length > 0) {
                captureNpcNeedDivergenceDeepTrace(
                    resolveDeepTraceEmitGateFlags(),
                    ensureDebugTraceLiveRun(next.worldTurn ?? 0),
                    next.worldTurn ?? 0,
                    currentRegistry,
                    updated,
                    updatedIds
                );
                currentRegistry = updated;
                registryUpdated = true;
            }
        }
    }

    captureWorldStepDebugTraceIfGated(next, stepEvents);
    next = applyLivingWorldAfterSimulationStep(forge, next, currentRegistry, stepEvents);
    flushDebugTraceHostUpdate();

    // Phase 8: Generate Quest Hooks before persisting world state
    generateQuestHooks(next, currentRegistry, false);

    return { state: next, registry: currentRegistry, registryUpdated };
}

/** Write npc_registry (when changed) then world_state — shared by GM sim tick and Observatory. */
export function persistWorldStepOutcome(
    outcome: WorldStepOutcome,
    patch?: Partial<WorldState>
): void {
    if (outcome.registryUpdated && outcome.registry) {
        saveNpcRegistry(outcome.registry);
    }
    const state = patch ? { ...outcome.state, ...patch } : outcome.state;
    saveWorldState(state);
}

/**
 * @deprecated Prefer `computeOneWorldStep` + `persistWorldStepOutcome` for explicit persist control.
 */
export function runOneWorldStep(forge: WorldForge, state: WorldState, rules = loadGameRules()): WorldStepOutcome {
    const outcome = computeOneWorldStep(forge, state, rules);
    persistWorldStepOutcome(outcome);
    return outcome;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * GM ターン数が simIntervalTurns の倍数に達したときに呼ぶ。
 * フラグが OFF 、または world_forge.json が存在しない場合は何もしない。
 */
export function maybeTickSimulation(gmTurnCount: number): void {
    const rules = loadGameRules();
    if (!rules.enableEmergentSimulation) { return; }
    const simInterval = Math.max(1, rules.simIntervalTurns ?? 5);
    if (gmTurnCount === 0 || gmTurnCount % simInterval !== 0) { return; }

    const forge = loadWorldForge();
    if (!forge) { return; }

    const state = ensureWorldStateExists(forge);
    if ((state.lastSimulatedGmTurn ?? 0) >= gmTurnCount) { return; }

    const outcome = computeOneWorldStep(forge, state, rules);
    persistWorldStepOutcome(outcome, { lastSimulatedGmTurn: gmTurnCount });
}

// ---------------------------------------------------------------------------
// Core simulation
// ---------------------------------------------------------------------------

export interface SimulationStepResult {
    state: WorldState;
    /** Events emitted during this step only (for NPC bridge — not the full log). */
    stepEvents: WorldChangeEvent[];
}

/**
 * 1 シミュレーションステップを実行して新しい WorldState を返す。
 * 元の state は変更しない（ディープクローン）。
 */
export function runSimulationStep(forge: WorldForge, state: WorldState): SimulationStepResult {
    const next: WorldState = JSON.parse(JSON.stringify(state)) as WorldState;
    next.worldTurn = (state.worldTurn ?? 0) + 1;
    next.lastUpdated = new Date().toISOString();

    // 前ステップの recentEvents をリセット
    for (const id of Object.keys(next.factions)) {
        next.factions[id].recentEvents = [];
    }

    // Collect structured events emitted during this step
    const newEvents: WorldChangeEvent[] = [];

    // 各派閥の内部ティック
    for (const faction of forge.factions) {
        tickFaction(faction, forge, next, newEvents);
    }

    // グローバルイベントの進行
    tickGlobalEvents(next);

    // リージョン危険度の更新
    updateRegionDanger(forge, next, newEvents);

    // Merge new events into recentChanges (prune expired first, then FIFO cap)
    const existing = pruneExpiredEvents(next.recentChanges ?? [], next.worldTurn);
    next.recentChanges = mergeRecentChanges(existing, newEvents, MAX_RECENT_CHANGES);

    return { state: next, stepEvents: newEvents };
}

// ---------------------------------------------------------------------------
// Faction tick
// ---------------------------------------------------------------------------

function tickFaction(
    faction: Faction,
    forge: WorldForge,
    state: WorldState,
    worldEvents: WorldChangeEvent[]
): void {
    const fs = state.factions[faction.id];
    if (!fs) { return; }

    const events: string[] = [];

    // 資源消費・再生
    tickResources(faction, fs, state.worldTurn, events, worldEvents);

    // 敵対派閥との摩擦
    tickEnemyFriction(faction, fs, forge, state, events, worldEvents);

    // 友好派閥のボーナス
    tickAllyBonus(faction, fs, state);

    // モラル更新
    updateMorale(faction, fs, state);

    // パワーを 0-100 にクランプ
    fs.power = clamp(fs.power, 0, 100);

    fs.recentEvents = events.slice(0, 3); // 最大3件に制限
}

function tickResources(
    faction: Faction,
    fs: FactionWorldState,
    worldTurn: number,
    events: string[],
    worldEvents: WorldChangeEvent[]
): void {
    if (!fs.resources) { return; }

    // 食料消費（派閥規模に比例）
    if (typeof fs.resources.food === 'number') {
        const foodBefore = fs.resources.food;
        const consumed = Math.max(1, Math.round(fs.resources.food * 0.06));
        fs.resources.food = Math.max(0, fs.resources.food - consumed);
        // Emit only on transition to zero — not every tick while depleted
        if (fs.resources.food === 0 && foodBefore > 0) {
            events.push('食料が底をついた — 士気に影響');
            fs.morale = Math.max(0, (fs.morale ?? 50) - 10);
            worldEvents.push(makeWorldChangeEvent({
                worldTurn,
                category: 'resource',
                severity: 'warning',
                factionId: faction.id,
                message: `${faction.name}: 食料が底をついた`,
                gmHint: `${faction.name} の食料が枯渇。NPC の動機・Needs に影響する可能性がある。`,
                expiresAfterTurns: 5,
                idSuffix: `${faction.id}_food`,
            }));
        } else if (fs.resources.food < 10) {
            events.push('食料備蓄が危機的水準');
        }
    }

    // 武器在庫はゆっくり消耗（活発な戦闘がある敵対派閥のみ）
    if (typeof fs.resources.weapons === 'number' && faction.type === 'hostile') {
        fs.resources.weapons = Math.max(0, fs.resources.weapons - 1);
    }

    // マナは自然回復
    if (typeof fs.resources.mana === 'number') {
        fs.resources.mana = Math.min(100, fs.resources.mana + 2);
    }
}

function tickEnemyFriction(
    faction: Faction,
    fs: FactionWorldState,
    forge: WorldForge,
    state: WorldState,
    events: string[],
    worldEvents: WorldChangeEvent[]
): void {
    for (const enemyId of (faction.enemies ?? [])) {
        const enemyState = state.factions[enemyId];
        if (!enemyState) { continue; }

        const powerDiff = fs.power - enemyState.power;
        let frictionMessage: string | undefined;

        if (powerDiff > 10) {
            // 明確な優勢：敵を1点削る、自分は+0.5
            enemyState.power = Math.max(0, enemyState.power - 1);
            fs.power = Math.min(100, fs.power + 0.5);
            frictionMessage = `${getFactionName(forge, enemyId)}との対立で優位`;
        } else if (powerDiff < -10) {
            // 明確な劣勢：自分が-1
            fs.power = Math.max(0, fs.power - 1);
            frictionMessage = `${getFactionName(forge, enemyId)}に押されている`;
        } else {
            // 拮抗：両者消耗
            fs.power = Math.max(0, fs.power - 0.5);
            enemyState.power = Math.max(0, enemyState.power - 0.5);
            frictionMessage = `${getFactionName(forge, enemyId)}との紛争が続く`;
        }

        events.push(frictionMessage);
        worldEvents.push(makeWorldChangeEvent({
            worldTurn: state.worldTurn,
            category: 'faction',
            severity: 'warning',
            factionId: faction.id,
            targetFactionId: enemyId,
            message: `${getFactionName(forge, faction.id)}と${getFactionName(forge, enemyId)}の紛争が続く`,
            gmHint: 'Narrate as faction-level border tension between these two powers, not individual NPC actions.',
            expiresAfterTurns: 5,
            idSuffix: `friction_${faction.id}_${enemyId}`,
        }));
    }
}

function tickAllyBonus(faction: Faction, fs: FactionWorldState, state: WorldState): void {
    for (const allyId of (faction.allies ?? [])) {
        const allyState = state.factions[allyId];
        if (!allyState) { continue; }
        // 同盟ボーナス：自派閥のモラル+1（相手も自身のターンで加算される）
        fs.morale = Math.min(100, (fs.morale ?? 50) + 1);
    }
}

function updateMorale(faction: Faction, fs: FactionWorldState, state: WorldState): void {
    const enemies = faction.enemies ?? [];
    if (enemies.length === 0) { return; }

    const avgEnemyPower = enemies
        .map((id) => state.factions[id]?.power ?? 0)
        .reduce((a, b) => a + b, 0) / enemies.length;

    if (fs.power > avgEnemyPower + 5) {
        fs.morale = Math.min(100, (fs.morale ?? 50) + 2);
    } else if (fs.power < avgEnemyPower - 5) {
        fs.morale = Math.max(0, (fs.morale ?? 50) - 2);
    }
    fs.morale = clamp(fs.morale ?? 50, 0, 100);
}

// ---------------------------------------------------------------------------
// Global events
// ---------------------------------------------------------------------------

function tickGlobalEvents(state: WorldState): void {
    if (!state.globalEvents) { return; }

    state.globalEvents = state.globalEvents
        .map((ev) => ({
            ...ev,
            turnsRemaining: ev.turnsRemaining !== undefined ? ev.turnsRemaining - 1 : undefined
        }))
        .filter((ev) => ev.turnsRemaining === undefined || ev.turnsRemaining > 0);

    // アクティブイベントが地域の危険度に影響を与える場合に派閥パワーへ影響
    for (const ev of state.globalEvents) {
        if (ev.severity === 'catastrophic' || ev.severity === 'major') {
            // 全派閥のモラルをわずかに下げる（世界的脅威）
            for (const fs of Object.values(state.factions)) {
                fs.morale = Math.max(0, (fs.morale ?? 50) - 1);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Region danger
// ---------------------------------------------------------------------------

function updateRegionDanger(
    forge: WorldForge,
    state: WorldState,
    worldEvents: WorldChangeEvent[]
): void {
    if (!state.regions) { return; }

    for (const region of forge.geography.regions) {
        const rs = state.regions[region.id];
        if (!rs) { continue; }

        const controlId = rs.controllingFaction;
        if (!controlId) { continue; }

        const forgeFaction = forge.factions.find((f) => f.id === controlId);
        const factionState = state.factions[controlId];
        if (!forgeFaction || !factionState) { continue; }

        let delta = 0;
        if (forgeFaction.type === 'hostile' && factionState.power > 60) {
            delta = 0.5; // 強力な敵対派閥 → 危険度上昇
        } else if (forgeFaction.type === 'hostile' && factionState.power <= 40) {
            delta = -0.3; // 弱った敵対派閥 → わずかに安定
        } else if (forgeFaction.type === 'friendly' || forgeFaction.type === 'neutral') {
            delta = -0.2; // 友好/中立支配 → 安定化
        }

        const current = rs.dangerLevel ?? (region.dangerLevel ?? 1);
        const dangerFloorBefore = Math.floor(current);
        rs.dangerLevel = clamp(Math.round((current + delta) * 10) / 10, 0, 10);

        // アクティブイベントが存在するリージョンは追加の危険度上昇
        if (rs.activeEvents && rs.activeEvents.length > 0) {
            rs.dangerLevel = Math.min(10, rs.dangerLevel + 0.2);
        }

        const displayDanger = rs.dangerLevel;
        const dangerFloorAfter = Math.floor(displayDanger);
        // Emit when integer danger tier rises (avoids flooding every tick)
        if (delta > 0 && dangerFloorAfter > dangerFloorBefore) {
            worldEvents.push(makeWorldChangeEvent({
                worldTurn: state.worldTurn,
                category: 'region',
                severity: displayDanger >= 7 ? 'critical' : 'warning',
                regionId: region.id,
                factionId: controlId,
                mapHighlight: true,
                message: `${region.name}: 危険度が上昇 (${displayDanger}/10)`,
                gmHint: `${region.name} は ${forgeFaction.name} (power:${Math.round(factionState.power)}) の支配下で不安定化しています。危険度:${displayDanger}/10。`,
                expiresAfterTurns: 3,
                idSuffix: `${region.id}_danger`,
            }));
        }
    }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

/** 派閥 ID から forge の表示名を取得（フォールバックは ID そのまま）。 */
function getFactionName(forge: WorldForge, id: string): string {
    return forge.factions.find((f) => f.id === id)?.name ?? id;
}
