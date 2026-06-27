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
import { loadWorldForge } from './worldForge';
import { loadGameRules } from './gameRules';
import { saveWorldState, ensureWorldStateExists } from './worldState';
import { loadNpcRegistry, saveNpcRegistry } from './npcRegistry';

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
    const next = runSimulationStep(forge, state);
    next.lastSimulatedGmTurn = gmTurnCount;
    saveWorldState(next);

    // Propagate simulation events to NPC needs when both systems are enabled
    if (rules.enableNpcRegistry && (next.recentChanges?.length ?? 0) > 0) {
        const registry = loadNpcRegistry();
        const { registry: updated, updatedIds } = applyEventsToNpcRegistry(
            next.recentChanges ?? [],
            registry,
            forge
        );
        if (updatedIds.length > 0) {
            saveNpcRegistry(updated);
        }
    }
}

// ---------------------------------------------------------------------------
// Core simulation
// ---------------------------------------------------------------------------

/**
 * 1 シミュレーションステップを実行して新しい WorldState を返す。
 * 元の state は変更しない（ディープクローン）。
 */
export function runSimulationStep(forge: WorldForge, state: WorldState): WorldState {
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

    return next;
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
    tickEnemyFriction(faction, fs, forge, state, events);

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
        const consumed = Math.max(1, Math.round(fs.resources.food * 0.06));
        fs.resources.food = Math.max(0, fs.resources.food - consumed);
        if (fs.resources.food === 0) {
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
    events: string[]
): void {
    for (const enemyId of (faction.enemies ?? [])) {
        const enemyState = state.factions[enemyId];
        if (!enemyState) { continue; }

        const powerDiff = fs.power - enemyState.power;

        if (powerDiff > 10) {
            // 明確な優勢：敵を1点削る、自分は+0.5
            enemyState.power = Math.max(0, enemyState.power - 1);
            fs.power = Math.min(100, fs.power + 0.5);
            events.push(`${getFactionName(forge, enemyId)}との対立で優位`);
        } else if (powerDiff < -10) {
            // 明確な劣勢：自分が-1
            fs.power = Math.max(0, fs.power - 1);
            events.push(`${getFactionName(forge, enemyId)}に押されている`);
        } else {
            // 拮抗：両者消耗
            fs.power = Math.max(0, fs.power - 0.5);
            enemyState.power = Math.max(0, enemyState.power - 0.5);
        }
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
        const newDanger = clamp(Math.round((current + delta) * 10) / 10, 0, 10);
        rs.dangerLevel = newDanger;

        // アクティブイベントが存在するリージョンは追加の危険度上昇
        if (rs.activeEvents && rs.activeEvents.length > 0) {
            rs.dangerLevel = Math.min(10, rs.dangerLevel + 0.2);
        }

        // Emit event when danger is actively rising due to a hostile faction
        if (delta > 0) {
            worldEvents.push(makeWorldChangeEvent({
                worldTurn: state.worldTurn,
                category: 'region',
                severity: newDanger >= 7 ? 'critical' : 'warning',
                regionId: region.id,
                factionId: controlId,
                mapHighlight: true,
                message: `${region.name}: 危険度が上昇 (${newDanger}/10)`,
                gmHint: `${region.name} は ${forgeFaction.name} (power:${Math.round(factionState.power)}) の支配下で不安定化しています。危険度:${newDanger}/10。`,
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
