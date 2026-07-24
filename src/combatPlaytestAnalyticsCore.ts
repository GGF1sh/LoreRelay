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
 *
 * One category of damage never shows up in `events.attacks` at all: a
 * `mechanics_v1` poison/burn/bleed tick reduces HP straight inside
 * `advanceMechanicsState`'s end-of-tick sweep, with no accompanying event.
 * Folding only `events` would silently under-count both `damageDealt` (the
 * DoT's caster) and `damageTaken` (its victim) for exactly the status-heavy
 * fights this module exists to summarize. The caller already holds a unit's
 * HP immediately before and after each `stepCombat` call, so
 * {@link foldCombatStepEvents} takes that as a third argument and derives the
 * untracked remainder — still without reading combat-core internals, only
 * comparing state the caller already has on hand.
 */
import { CombatEvent, CombatStepEvents } from './gambitCombatCore';
import { MechanicsReceipt } from './combatMechanicsResolver';

/** Per-unit HP immediately before/after one `stepCombat` call, and any status
 * list snapshot the caller wants consulted for ambient-damage attribution. */
export interface CombatStepTickContext {
    hpBefore: Readonly<Record<string, number>>;
    hpAfter: Readonly<Record<string, number>>;
    /**
     * End-of-tick active status ids per unit. When a unit's ambient HP loss
     * this tick is unexplained by `events`, and exactly one caster is on
     * record (via `status_applied` receipts, see
     * {@link CombatPlaytestAnalytics.statusSourceByVictim}) for the statuses
     * listed here, that source is credited. Omitted or ambiguous (0 or 2+
     * distinct sources) attribution is left blank rather than guessed.
     */
    statusesAfter?: Readonly<Record<string, ReadonlyArray<{ id: string }>>>;
}

/** Hard cap on the live feed carried by every snapshot broadcast. */
export const COMBAT_ANALYTICS_RECENT_EVENT_LIMIT = 24;

export type CombatPlaytestLogEntryKind = 'attack' | 'heal' | 'death' | 'status';

export type CombatPlaytestStatusAction = 'applied' | 'removed' | 'expired';

/** One normalized line of the in-battle feed. */
export interface CombatPlaytestLogEntry {
    tick: number;
    kind: CombatPlaytestLogEntryKind;
    /** Attacker, healer, or status caster. Absent for `death` and ambient `status` expiry. */
    sourceId?: string;
    /** Victim, healed ally, unit that died, or unit the status belongs to. */
    targetId: string;
    /** Damage or healing. Absent for `death` and `status`. */
    amount?: number;
    /** True when the attack resolved as a full evade (mechanics `dodged` receipt). */
    dodged?: boolean;
    /** True when this attack reduced the target to 0 HP on the same tick. */
    lethal?: boolean;
    /** `mechanics_v1` status id (e.g. `burn`, `stun`); present only for `kind: 'status'`. */
    statusId?: string;
    statusAction?: CombatPlaytestStatusAction;
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
    /**
     * `"${victimId}|${statusId}" -> casterId`, learned from `status_applied`
     * receipts and cleared on `cleansed`. This exists because the engine only
     * records a status instance's own caster (`StatusInstance.sourceId`) for
     * `lethal_timer`-class statuses — "only lethal timers need a caster link"
     * per combatMechanicsResolver.ts's `applyStatus` — so poison/burn/bleed
     * ticks have no caster to read off the status itself. Naturally-expiring
     * DoTs are not pruned here (no receipt marks that moment for non-lethal-
     * timer statuses); a stale entry is harmless since it is only ever
     * consulted for a status id still present in that tick's active list.
     */
    statusSourceByVictim: Record<string, string>;
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
    return { units, recentEvents: [], statusSourceByVictim: {} };
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
    return {
        units,
        recentEvents: source.recentEvents.map(entry => ({ ...entry })),
        statusSourceByVictim: { ...source.statusSourceByVictim },
    };
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

/**
 * `mechanics_v1` receipt kinds that represent a status being gained or lost,
 * mapped to the log action they read as. Every other receipt kind (damage,
 * barrier, targeting, delivery math, ...) is not a status-lifecycle event and
 * is left out of the feed on purpose.
 */
const STATUS_RECEIPT_ACTIONS: Partial<Record<string, CombatPlaytestStatusAction>> = {
    status_applied: 'applied',
    cleansed: 'removed',
    lethal_timer_expired: 'expired',
};

/**
 * The one unambiguous caster among a unit's currently active statuses, looked
 * up via `statusSourceByVictim` (populated from `status_applied` receipts —
 * see that field's doc comment for why the status instances themselves cannot
 * be trusted). Null when zero or two-or-more distinct sources are found;
 * attribution is skipped rather than guessed in the ambiguous case (e.g.
 * simultaneous poison from one caster and burn from another).
 */
function soleActiveStatusSource(
    analytics: CombatPlaytestAnalytics,
    unitId: string,
    activeStatuses: ReadonlyArray<{ id: string }> | undefined,
): string | null {
    if (!activeStatuses || activeStatuses.length === 0) return null;
    const sources = new Set(
        activeStatuses
            .map(status => analytics.statusSourceByVictim[`${unitId}|${status.id}`])
            .filter((id): id is string => Boolean(id)),
    );
    return sources.size === 1 ? [...sources][0] : null;
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
 * unit on the same tick — UNLESS that attack alone would not have been lethal
 * (checked against `tick.hpBefore`/`hpAfter`), in which case a same-tick DoT or
 * lethal timer actually finished the unit off; credit moves to that status's
 * source when it is unambiguous (see {@link CombatStepTickContext}), otherwise
 * to nobody, rather than misattributing the earlier non-lethal hit.
 */
export function foldCombatStepEvents(
    previous: CombatPlaytestAnalytics,
    events: CombatStepEvents,
    // Defaults to an empty before/after pair, under which the ambient-damage
    // pass below finds nothing and behaves exactly as it did before this
    // parameter existed — callers that only care about event-level folding
    // (most of this file's own tests) are not required to supply real state.
    tick: CombatStepTickContext = { hpBefore: {}, hpAfter: {} },
): CombatPlaytestAnalytics {
    const analytics = cloneAnalytics(previous);
    const dodged = dodgedAttackKeys(events.mechanicsReceipts || []);
    /** Last attacker seen against a victim on this tick — the killing-blow candidate. */
    const lastAttackerFor = new Map<string, string>();
    /** Per-victim sum of `events.attacks` damage this tick, to isolate the ambient remainder. */
    const attackDamageForVictim = new Map<string, number>();
    /** Per-healed-unit sum of `events.heals` amount this tick, for the same reason. */
    const healAmountForUnit = new Map<string, number>();

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
        attackDamageForVictim.set(victimId, (attackDamageForVictim.get(victimId) || 0) + damage);
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
        healAmountForUnit.set(healedId, (healAmountForUnit.get(healedId) || 0) + amount);
        pushRecent(analytics, {
            tick: event.tick,
            kind: 'heal',
            sourceId: healerId,
            targetId: healedId,
            amount,
        });
    }

    // Status lifecycle (feed lines + statusSourceByVictim bookkeeping) runs
    // before the ambient-damage pass below so a status applied earlier this
    // very tick already has a known caster by the time that status's first
    // DoT tick (in the same tick's end-of-tick mechanics sweep) is folded.
    for (const event of events.mechanicsReceipts || []) {
        const action = STATUS_RECEIPT_ACTIONS[event.receipt?.kind];
        const statusId = event.receipt?.statusId;
        if (!action || !statusId) continue;
        // status_applied/cleansed are on-hit receipts carrying the recipient as
        // `target`; lethal_timer_expired is an ambient per-tick receipt with only
        // the status owner as `unit` — there is no separate caster to report.
        const ownerId = action === 'expired' ? readString(event, 'unit') : readString(event, 'target');
        if (!ownerId) continue;
        const sourceId = action !== 'expired' ? readString(event, 'unit') : null;
        const key = `${ownerId}|${statusId}`;
        if (action === 'applied' && sourceId) analytics.statusSourceByVictim[key] = sourceId;
        else if (action === 'removed') delete analytics.statusSourceByVictim[key];
        pushRecent(analytics, {
            tick: event.tick,
            kind: 'status',
            targetId: ownerId,
            statusId,
            statusAction: action,
            ...(sourceId ? { sourceId } : {}),
        });
    }

    // Ambient damage: whatever HP a unit lost this tick that `attacks` does not
    // explain (a poison/burn/bleed tick or a lethal-timer execution, none of
    // which push an attacks event). `after = before - attackDamage -
    // ambientDamage + healAmount`, rearranged below. Only credited when
    // positive — a unit that gained HP from untracked regen is not this
    // module's concern, and floating residue from an exact-lethal hit must not
    // read as a second source of damage.
    // Only units the caller supplied hp for get the ambient-vs-attack distinction;
    // a unit absent from hpBefore falls back to the pre-existing "trust the last
    // same-tick attacker" behavior below, unchanged for callers (mostly this
    // file's own tests) that fold events without tracking state at all.
    const attackAloneLethalFor = new Map<string, boolean>();
    for (const unitId of Object.keys(tick.hpBefore)) {
        const before = tick.hpBefore[unitId];
        const after = tick.hpAfter[unitId];
        if (typeof before !== 'number' || typeof after !== 'number') continue;
        const attackDamage = attackDamageForVictim.get(unitId) || 0;
        const healAmount = healAmountForUnit.get(unitId) || 0;
        const ambient = before - after - attackDamage + healAmount;
        if (ambient > 0) {
            ensureUnit(analytics, unitId).damageTaken += ambient;
            const source = soleActiveStatusSource(analytics, unitId, tick.statusesAfter?.[unitId]);
            if (source) {
                const dealer = ensureUnit(analytics, source);
                dealer.damageDealt += ambient;
                dealer.damageByTarget[unitId] = (dealer.damageByTarget[unitId] || 0) + ambient;
            }
        }
        attackAloneLethalFor.set(unitId, before - attackDamage <= 0);
    }

    for (const event of events.deaths || []) {
        const deadId = readString(event, 'unit');
        if (!deadId) continue;
        const dead = ensureUnit(analytics, deadId);
        if (dead.diedAtTick === null) dead.diedAtTick = event.tick;

        const attackAloneLethal = attackAloneLethalFor.get(deadId) ?? true;
        const killerId = attackAloneLethal
            ? lastAttackerFor.get(deadId)
            : soleActiveStatusSource(analytics, deadId, tick.statusesAfter?.[deadId]);
        if (killerId && killerId !== deadId) ensureUnit(analytics, killerId).kills += 1;
        // Mark the lethal blow in the feed so a kill reads as one line, not two
        // — only when an attack was actually the killing blow; an ambient death
        // has no attack entry to mark.
        if (attackAloneLethal) {
            for (let index = analytics.recentEvents.length - 1; index >= 0; index--) {
                const entry = analytics.recentEvents[index];
                if (entry.tick !== event.tick) break;
                if (entry.kind === 'attack' && entry.targetId === deadId) {
                    entry.lethal = true;
                    break;
                }
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
