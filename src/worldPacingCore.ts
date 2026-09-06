import type { WorldForge } from './worldForgeCore';
import type { WorldState } from './worldStateCore';
import { makeWorldChangeEvent, type WorldChangeEvent } from './worldEventLogCore';

export interface WorldPacingSettings {
    foodDemandMultiplier: number;
    conflictEnabled: boolean;
    conflictActiveDays: number;
    conflictRestDays: number;
    relationshipPace: 'stopped' | 'slow' | 'standard' | 'fast';
}
export const DEFAULT_WORLD_PACING: Readonly<WorldPacingSettings> = Object.freeze({
    foodDemandMultiplier: 1, conflictEnabled: true, conflictActiveDays: 10,
    conflictRestDays: 20, relationshipPace: 'standard',
});
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const validId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v)
    && !['__proto__', 'constructor', 'prototype'].includes(v);
const number = (v: unknown, low: number, high: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(low, Math.min(high, v)) : fallback;
export function normalizeWorldPacing(raw: unknown, base: Readonly<WorldPacingSettings> = DEFAULT_WORLD_PACING): WorldPacingSettings {
    const r = record(raw);
    return { foodDemandMultiplier: number(r.foodDemandMultiplier, 0, 3, base.foodDemandMultiplier),
        conflictEnabled: typeof r.conflictEnabled === 'boolean' ? r.conflictEnabled : base.conflictEnabled,
        conflictActiveDays: Math.round(number(r.conflictActiveDays, 1, 100, base.conflictActiveDays)),
        conflictRestDays: Math.round(number(r.conflictRestDays, 1, 100, base.conflictRestDays)),
        relationshipPace: ['stopped', 'slow', 'standard', 'fast'].includes(String(r.relationshipPace))
            ? r.relationshipPace as WorldPacingSettings['relationshipPace'] : base.relationshipPace };
}
export function worldPacingPreset(id: 'stable' | 'changing' | 'demanding') {
    return { economyProfile: id === 'stable' ? 'plentiful' as const : id === 'demanding' ? 'scarce' as const : 'normal' as const,
        worldPacing: normalizeWorldPacing(id === 'stable'
            ? { foodDemandMultiplier: 0, conflictEnabled: false, relationshipPace: 'slow' }
            : id === 'demanding' ? { foodDemandMultiplier: 1.5, conflictActiveDays: 20, conflictRestDays: 10 } : {}) };
}

/** An explicit, genre-neutral conversion: one staple unit supplies one food unit. */
export interface FactionFoodSupply {
    marketLocationId: string;
    commodityId: string;
    dailyDemand: number;
    reserveTarget: number;
}
export interface FactionFoodStatus {
    status: 'unconfigured' | 'paused' | 'supplied' | 'shortage';
    demand: number;
    received: number;
}
export interface FactionConflictState {
    factionA: string;
    factionB: string;
    phase: 'active' | 'resting' | 'exhausted' | 'paused';
    phaseSince: number;
}
export function parseFactionFoodSupply(raw: unknown): FactionFoodSupply | undefined {
    const r = record(raw);
    if (!validId(r.marketLocationId) || !validId(r.commodityId)
        || typeof r.dailyDemand !== 'number' || !Number.isFinite(r.dailyDemand) || r.dailyDemand <= 0
        || typeof r.reserveTarget !== 'number' || !Number.isFinite(r.reserveTarget) || r.reserveTarget <= 0) return;
    return { marketLocationId: r.marketLocationId, commodityId: r.commodityId,
        dailyDemand: Math.round(number(r.dailyDemand, 1, 1000, 1)), reserveTarget: Math.round(number(r.reserveTarget, 1, 100000, 14)) };
}
export function parseFactionFoodStatuses(raw: unknown): Record<string, FactionFoodStatus> | undefined {
    if (!raw) return;
    const out: Record<string, FactionFoodStatus> = {};
    for (const [id, v] of Object.entries(record(raw)).slice(0, 256)) {
        const r = record(v);
        if (!validId(id)
            || !['unconfigured', 'paused', 'supplied', 'shortage'].includes(String(r.status))) continue;
        out[id] = { status: r.status as FactionFoodStatus['status'], demand: number(r.demand, 0, 3000, 0), received: number(r.received, 0, 100000, 0) };
    }
    return out;
}
export function parseFactionConflicts(raw: unknown): Record<string, FactionConflictState> | undefined {
    if (!raw) return;
    const out: Record<string, FactionConflictState> = {};
    for (const v of Object.values(record(raw)).slice(0, 1024)) {
        const r = record(v);
        if (!validId(r.factionA) || !validId(r.factionB) || r.factionA >= r.factionB
            || !['active', 'resting', 'exhausted', 'paused'].includes(String(r.phase))) continue;
        out[`${r.factionA}|${r.factionB}`] = { factionA: r.factionA, factionB: r.factionB,
            phase: r.phase as FactionConflictState['phase'], phaseSince: Math.floor(number(r.phaseSince, 0, Number.MAX_SAFE_INTEGER, 0)) };
    }
    return out;
}

/** Called once on a detached world copy. Supply uses previously committed market stock.
 * Current-day production/recovery then runs through the existing Living World tick. */
export function tickFactionFoodSupply(
    forge: WorldForge,
    state: WorldState,
    pacing: WorldPacingSettings,
    events: WorldChangeEvent[],
    commerceEnabled = true
) {
    const previous = state.factionFoodStatus ?? {};
    const statuses: Record<string, FactionFoodStatus> = {};
    const jobs: Array<{ id: string; supply: FactionFoodSupply; demand: number; target: number; received: number }> = [];
    for (const f of [...forge.factions].sort((a, b) => a.id.localeCompare(b.id))) {
        if (!validId(f.id)) continue;
        const target = state.factions[f.id];
        if (!target) continue;
        const s = f.foodSupply;
        if (!commerceEnabled || pacing.foodDemandMultiplier === 0) {
            statuses[f.id] = { status: 'paused', demand: 0, received: 0 };
            continue;
        }
        // Parser validates the commodity role against the authored commerce document.
        const market = s && state.markets?.[s.marketLocationId]?.[s.commodityId];
        if (!s || !market || !Number.isFinite(market.stock) || market.stock < 0) { statuses[f.id] = { status: 'unconfigured', demand: 0, received: 0 }; continue; }
        target.resources ??= {};
        target.resources.food = number(target.resources.food, 0, Number.MAX_SAFE_INTEGER, 0);
        const demand = Math.ceil(s.dailyDemand * pacing.foodDemandMultiplier);
        jobs.push({ id: f.id, supply: s, demand, target: Math.max(s.reserveTarget, demand), received: 0 });
    }
    // Cover today's demand before filling anyone's buffer. Stable ordering makes competition reproducible.
    for (const buffer of [false, true]) for (const job of jobs) {
        const resources = state.factions[job.id].resources!;
        const stock = state.markets![job.supply.marketLocationId][job.supply.commodityId];
        const need = Math.max(0, (buffer ? job.target : job.demand) - resources.food!);
        const moved = Math.min(need, Math.max(0, Math.floor(stock.stock)));
        stock.stock -= moved; resources.food! += moved; job.received += moved;
    }
    for (const job of jobs) {
        const faction = state.factions[job.id];
        const shortage = faction.resources!.food! < job.demand;
        faction.resources!.food = Math.max(0, faction.resources!.food! - job.demand);
        statuses[job.id] = { status: shortage ? 'shortage' : 'supplied', demand: job.demand, received: job.received };
        const before = previous[job.id]?.status;
        if (shortage && before !== 'shortage') {
            faction.morale = Math.max(0, (faction.morale ?? 50) - 10);
            events.push(makeWorldChangeEvent({ worldTurn: state.worldTurn, source: 'simulation', category: 'resource', severity: 'warning',
                factionId: job.id, message: `${forge.factions.find(f => f.id === job.id)?.name}: 食料が不足しています`, expiresAfterTurns: 5, idSuffix: `${job.id}_food_shortage` }));
        } else if (!shortage && before === 'shortage') {
            // Faction category avoids the food-crisis classifier; recovery must not create a second shortage shock.
            events.push(makeWorldChangeEvent({ worldTurn: state.worldTurn, source: 'simulation', category: 'faction', severity: 'info',
                factionId: job.id, message: `${forge.factions.find(f => f.id === job.id)?.name}: 食料供給が回復しました`, expiresAfterTurns: 5, idSuffix: `${job.id}_food_recovered` }));
        }
    }
    state.factionFoodStatus = statuses;
}

export function tickFactionConflicts(forge: WorldForge, state: WorldState, pacing: WorldPacingSettings, events: WorldChangeEvent[]) {
    const prior = state.factionConflicts ?? {};
    const next: Record<string, FactionConflictState> = {};
    const pairs = new Map<string, [string, string]>();
    const activeFactions = new Set<string>();
    const activeEnemies = new Map<string, Set<string>>();
    for (const f of forge.factions) for (const enemy of f.enemies ?? []) {
        if (!validId(f.id) || !validId(enemy) || f.id === enemy || !state.factions[enemy] || !state.factions[f.id]) continue;
        const [a, b] = [f.id, enemy].sort(); pairs.set(`${a}|${b}`, [a, b]);
    }
    for (const [key, [a, b]] of [...pairs].sort(([a], [b]) => a.localeCompare(b))) {
        const left = state.factions[a], right = state.factions[b], old = prior[key];
        let phase: FactionConflictState['phase'] = old?.phase ?? 'active';
        let since = Math.min(old?.phaseSince ?? state.worldTurn, state.worldTurn);
        if (!pacing.conflictEnabled) phase = 'paused';
        else if (left.power <= 0 || right.power <= 0) phase = 'exhausted';
        else if (phase === 'paused' || phase === 'exhausted') phase = 'resting';
        else if (state.worldTurn - since >= (phase === 'active' ? pacing.conflictActiveDays : pacing.conflictRestDays)) phase = phase === 'active' ? 'resting' : 'active';
        if (phase !== old?.phase) since = state.worldTurn;
        if (phase === 'active') {
            activeFactions.add(a); activeFactions.add(b);
            if (!activeEnemies.has(a)) activeEnemies.set(a, new Set());
            if (!activeEnemies.has(b)) activeEnemies.set(b, new Set());
            activeEnemies.get(a)!.add(b);
            activeEnemies.get(b)!.add(a);
            const difference = left.power - right.power;
            if (difference > 10) { left.power = Math.min(100, left.power + .5); right.power = Math.max(0, right.power - 1); }
            else if (difference < -10) { right.power = Math.min(100, right.power + .5); left.power = Math.max(0, left.power - 1); }
            else { left.power = Math.max(0, left.power - .5); right.power = Math.max(0, right.power - .5); }
            events.push(makeWorldChangeEvent({ worldTurn: state.worldTurn, source: 'simulation', category: 'faction', severity: 'warning',
                factionId: a, targetFactionId: b, message: `${forge.factions.find(f => f.id === a)?.name}と${forge.factions.find(f => f.id === b)?.name}の紛争${phase !== old?.phase ? 'が活動期間に入りました' : 'が続く'}`, expiresAfterTurns: 5, idSuffix: `friction_${a}_${b}` }));
        }
        if (phase !== 'active' && phase !== old?.phase) events.push(makeWorldChangeEvent({ worldTurn: state.worldTurn, source: 'simulation',
            category: 'faction', severity: 'info', factionId: a,
            message: `${forge.factions.find(f => f.id === a)?.name}と${forge.factions.find(f => f.id === b)?.name}: ${phase === 'exhausted' ? '戦力不足で活動停止' : phase === 'paused' ? '設定により活動停止' : '休止期間に入りました'}`,
            expiresAfterTurns: 5, idSuffix: `faction_pause_${a}_${b}` }));
        next[key] = { factionA: a, factionB: b, phase, phaseSince: since };
    }
    state.factionConflicts = next;
    for (const id of activeFactions) {
        const faction = state.factions[id];
        const resources = faction.resources;
        if (typeof resources?.weapons === 'number') resources.weapons = Math.max(0, resources.weapons - 1);
        const enemies = [...(activeEnemies.get(id) ?? [])]
            .map(enemyId => state.factions[enemyId]?.power)
            .filter((power): power is number => typeof power === 'number' && Number.isFinite(power));
        if (enemies.length > 0) {
            const averageEnemyPower = enemies.reduce((sum, power) => sum + power, 0) / enemies.length;
            if (faction.power > averageEnemyPower + 5) faction.morale = Math.min(100, (faction.morale ?? 50) + 2);
            else if (faction.power < averageEnemyPower - 5) faction.morale = Math.max(0, (faction.morale ?? 50) - 2);
        }
    }
}

/** Player projection uses discovered regions; neither hidden supply markets nor opposing factions leak. */
export function projectWorldPacing(forge: WorldForge, state: WorldState | undefined, discoveredRegionIds: readonly string[]) {
    const discovered = new Set(discoveredRegionIds);
    const visibleFactions = new Set<string>();
    const regions = forge.geography.regions.filter(r => discovered.has(r.id)).map(region => {
        const factionId = state?.regions?.[region.id]?.controllingFaction;
        const faction = forge.factions.find(f => f.id === factionId);
        if (!faction) return { regionId: region.id, name: region.name, status: 'unconfirmed' };
        visibleFactions.add(faction.id);
        const supply = faction.foodSupply;
        const location = supply && forge.geography.locations.find(l => l.id === supply.marketLocationId);
        const sourceVisible = !supply || !!location?.regionId && discovered.has(location.regionId);
        const status = sourceVisible ? state?.factionFoodStatus?.[faction.id]?.status ?? (supply ? 'unconfirmed' : 'unconfigured') : 'unconfirmed';
        return { regionId: region.id, name: region.name, factionName: faction.name, status,
            ...(sourceVisible && location ? { supplyMarketName: location.name } : {}) };
    });
    const conflicts = Object.values(state?.factionConflicts ?? {}).filter(c => visibleFactions.has(c.factionA) && visibleFactions.has(c.factionB))
        .map(c => ({ factionA: forge.factions.find(f => f.id === c.factionA)!.name,
            factionB: forge.factions.find(f => f.id === c.factionB)!.name, phase: c.phase }));
    return { regions, conflicts };
}
