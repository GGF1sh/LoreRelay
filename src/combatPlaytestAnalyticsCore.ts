/**
 * Battle analytics accumulated from the events `stepCombat` already emits.
 *
 * `advanceCombatCommandPlaytest` used to keep only `commandReceipts` and drop
 * `attacks` / `heals` / `deaths` / `decisions` / `mechanicsReceipts` on the
 * floor, so nothing downstream could answer "who hit whom, for how much, and
 * why did this side lose". This module folds those same events into bounded,
 * JSON-safe aggregates without changing combat mechanics: no combat-core
 * function is modified, no new event is emitted, and nothing here reads a
 * clock, a random source, the DOM or the filesystem. A battle's analytics are
 * therefore a pure function of the ticks that produced them.
 *
 * Everything is sized so it can ride along on the host's per-pulse snapshot
 * broadcast: per-unit totals are a fixed number of scalars, and the live feed
 * is a hard-capped ring of the most recent entries.
 */
import { CombatEvent, CombatStepEvents } from './gambitCombatCore';
import { MechanicsReceipt } from './combatMechanicsResolver';

/** Hard cap on the live feed carried by every snapshot broadcast. */
export const COMBAT_ANALYTICS_RECENT_EVENT_LIMIT = 24;

export type CombatPlaytestLogEntryKind = 'attack' | 'heal' | 'death';

/** One normalized line of the in-battle feed. */
export interface CombatPlaytestLogEntry {
    tick: number;
    kind: CombatPlaytestLogEntryKind;
    /** Attacker or healer. Absent for `death`, which has no attributed source here. */
    sourceId?: string;
    /** Victim, healed ally, or the unit that died. */
    targetId: string;
    /** Damage or healing. Absent for `death`. */
    amount?: number;
    /** True when the attack resolved as a full evade (mechanics `dodged` receipt). */
    dodged?: boolean;
    /** True when this attack reduced the target to 0 HP on the same tick. */
    lethal?: boolean;
}

/** Per-unit accumulated contribution. All fields are monotonic except the `last*` pair. */
export interface CombatPlaytestUnitAnalytics {
    damageDealt: number;
    damageTaken: number;
    healingGiven: number;
    healingReceived: number;
    /** Enemies this unit reduced to 0 HP, credited to the attacker of the killing blow. */
    kills: number;
    /** Attack resolutions where this unit was the attacker (an AoE hit on N targets counts N). */
    attacksMade: number;
    /** Subset of `attacksMade` that dealt more than 0 damage. */
    hits: number;
    /** Incoming attacks this unit fully evaded. */
    dodges: number;
    /** Tick this unit died on; null while alive. */
    diedAtTick: number | null;
    /** Most recent unit this one attacked or was ordered to act on; null if never. */
    lastTargetId: string | null;
    /** Tick `lastTargetId` was last observed, so a stale target can be faded by the UI. */
    lastTargetTick: number | null;
    /** Damage dealt per victim. Kept session-side to derive `topTargetId`; not broadcast. */
    damageByTarget: Record<string, number>;
}

export interface CombatPlaytestAnalytics {
    units: Record<string, CombatPlaytestUnitAnalytics>;
    /** Oldest first, capped at {@link COMBAT_ANALYTICS_RECENT_EVENT_LIMIT}. */
    recentEvents: CombatPlaytestLogEntry[];
}

/** Broadcast-safe projection of one unit's totals. Excludes the per-victim tally. */
export interface CombatPlaytestUnitStats {
    damageDealt: number;
    damageTaken: number;
    healingGiven: number;
    healingReceived: number;
    kills: number;
    attacksMade: number;
    hits: number;
    dodges: number;
    diedAtTick: number | null;
    /** Victim this unit dealt the most damage to; ties break on participant order. */
    topTargetId: string | null;
}

function emptyUnitAnalytics(): CombatPlaytestUnitAnalytics {
    return {
        damageDealt: 0,
        damageTaken: 0,
        healingGiven: 0,
        healingReceived: 0,
        kills: 0,
        attacksMade: 0,
        hits: 0,
        dodges: 0,
        diedAtTick: null,
        lastTargetId: null,
        lastTargetTick: null,
        damageByTarget: {},
    };
}

export function createCombatPlaytestAnalytics(unitIds: readonly string[]): CombatPlaytestAnalytics {
    const units: Record<string, CombatPlaytestUnitAnalytics> = {};
    for (const id of unitIds) units[id] = emptyUnitAnalytics();
    return { units, recentEvents: [] };
}

function cloneUnitAnalytics(source: CombatPlaytestUnitAnalytics): CombatPlaytestUnitAnalytics {
    return { ...source, damageByTarget: { ...source.damageByTarget } };
}

/**
 * Copy-on-fold so a session value can be advanced twice from the same starting
 * point without the second run inheriting the first one's totals — the same
 * value semantics `advanceCombatCommandPlaytest` already has for `state`.
 */
function cloneAnalytics(source: CombatPlaytestAnalytics): CombatPlaytestAnalytics {
    const units: Record<string, CombatPlaytestUnitAnalytics> = {};
    for (const id of Object.keys(source.units)) units[id] = cloneUnitAnalytics(source.units[id]);
    return { units, recentEvents: source.recentEvents.map(entry => ({ ...entry })) };
}

function ensureUnit(analytics: CombatPlaytestAnalytics, id: string): CombatPlaytestUnitAnalytics {
    let entry = analytics.units[id];
    if (!entry) {
        entry = emptyUnitAnalytics();
        analytics.units[id] = entry;
    }
    return entry;
}

function readString(event: CombatEvent, key: string): string | null {
    const value = event[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function readAmount(event: CombatEvent, key: string): number {
    const value = event[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function pushRecent(analytics: CombatPlaytestAnalytics, entry: CombatPlaytestLogEntry): void {
    analytics.recentEvents.push(entry);
    if (analytics.recentEvents.length > COMBAT_ANALYTICS_RECENT_EVENT_LIMIT) {
        analytics.recentEvents.splice(0, analytics.recentEvents.length - COMBAT_ANALYTICS_RECENT_EVENT_LIMIT);
    }
}

/** `tick|attacker|victim` keys for attacks the resolver reported as fully evaded. */
function dodgedAttackKeys(receipts: ReadonlyArray<CombatEvent & { receipt: MechanicsReceipt }>): Set<string> {
    const keys = new Set<string>();
    for (const entry of receipts) {
        if (entry.receipt?.kind !== 'dodged') continue;
        const attacker = readString(entry, 'unit');
        const victim = readString(entry, 'target');
        if (!attacker || !victim) continue;
        keys.add(`${entry.tick}|${attacker}|${victim}`);
    }
    return keys;
}

/**
 * Fold one tick's events into a new analytics value.
 *
 * Kill credit goes to the attacker of the last attack recorded against the dead
 * unit on the same tick. Combat-core pushes the death immediately after the
 * attack that caused it, so within a tick that attacker is the killing blow.
 * A unit that dies with no attack against it that tick (e.g. a future
 * damage-over-time source) simply credits nobody rather than guessing.
 */
export function foldCombatStepEvents(
    previous: CombatPlaytestAnalytics,
    events: CombatStepEvents,
): CombatPlaytestAnalytics {
    const analytics = cloneAnalytics(previous);
    const dodged = dodgedAttackKeys(events.mechanicsReceipts || []);
    /** Last attacker seen against a victim on this tick — the killing-blow candidate. */
    const lastAttackerFor = new Map<string, string>();

    for (const event of events.decisions || []) {
        const unitId = readString(event, 'unit');
        const targetId = readString(event, 'target');
        if (!unitId || !targetId) continue;
        const unit = ensureUnit(analytics, unitId);
        unit.lastTargetId = targetId;
        unit.lastTargetTick = event.tick;
    }

    for (const event of events.attacks || []) {
        const attackerId = readString(event, 'unit');
        const victimId = readString(event, 'target');
        if (!attackerId || !victimId) continue;
        const damage = Math.max(0, readAmount(event, 'damage'));
        const wasDodged = dodged.has(`${event.tick}|${attackerId}|${victimId}`);

        const attacker = ensureUnit(analytics, attackerId);
        attacker.attacksMade += 1;
        attacker.damageDealt += damage;
        attacker.lastTargetId = victimId;
        attacker.lastTargetTick = event.tick;
        if (damage > 0) {
            attacker.hits += 1;
            attacker.damageByTarget[victimId] = (attacker.damageByTarget[victimId] || 0) + damage;
        }

        const victim = ensureUnit(analytics, victimId);
        victim.damageTaken += damage;
        if (wasDodged) victim.dodges += 1;

        lastAttackerFor.set(victimId, attackerId);
        pushRecent(analytics, {
            tick: event.tick,
            kind: 'attack',
            sourceId: attackerId,
            targetId: victimId,
            amount: damage,
            ...(wasDodged ? { dodged: true } : {}),
        });
    }

    for (const event of events.heals || []) {
        const healedId = readString(event, 'unit');
        if (!healedId) continue;
        const healerId = readString(event, 'source') || healedId;
        const amount = Math.max(0, readAmount(event, 'amount'));
        if (amount <= 0) continue;

        ensureUnit(analytics, healerId).healingGiven += amount;
        ensureUnit(analytics, healedId).healingReceived += amount;
        pushRecent(analytics, {
            tick: event.tick,
            kind: 'heal',
            sourceId: healerId,
            targetId: healedId,
            amount,
        });
    }

    for (const event of events.deaths || []) {
        const deadId = readString(event, 'unit');
        if (!deadId) continue;
        const dead = ensureUnit(analytics, deadId);
        if (dead.diedAtTick === null) dead.diedAtTick = event.tick;
        const killerId = lastAttackerFor.get(deadId);
        if (killerId && killerId !== deadId) ensureUnit(analytics, killerId).kills += 1;
        // Mark the lethal blow in the feed so a kill reads as one line, not two.
        for (let index = analytics.recentEvents.length - 1; index >= 0; index--) {
            const entry = analytics.recentEvents[index];
            if (entry.tick !== event.tick) break;
            if (entry.kind === 'attack' && entry.targetId === deadId) {
                entry.lethal = true;
                break;
            }
        }
        pushRecent(analytics, { tick: event.tick, kind: 'death', targetId: deadId });
    }

    return analytics;
}

/** Highest-damage victim for one unit; ties resolve on `participantOrder` for determinism. */
export function topDamageTargetId(
    unit: CombatPlaytestUnitAnalytics,
    participantOrder: readonly string[],
): string | null {
    let best: string | null = null;
    let bestDamage = 0;
    for (const id of participantOrder) {
        const damage = unit.damageByTarget[id];
        if (typeof damage !== 'number' || damage <= bestDamage) continue;
        best = id;
        bestDamage = damage;
    }
    return best;
}

/** Broadcast projection: drops the per-victim tally, resolves `topTargetId`. */
export function combatPlaytestUnitStats(
    unit: CombatPlaytestUnitAnalytics,
    participantOrder: readonly string[],
): CombatPlaytestUnitStats {
    return {
        damageDealt: unit.damageDealt,
        damageTaken: unit.damageTaken,
        healingGiven: unit.healingGiven,
        healingReceived: unit.healingReceived,
        kills: unit.kills,
        attacksMade: unit.attacksMade,
        hits: unit.hits,
        dodges: unit.dodges,
        diedAtTick: unit.diedAtTick,
        topTargetId: topDamageTargetId(unit, participantOrder),
    };
}
