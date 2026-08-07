/**
 * Story → Combat start side (encounterOps).
 *
 * The GM declares that a fight *begins*; the deterministic combat core decides
 * how it *ends*. This module is the boundary that enforces that split: it parses
 * AI-authored `turn_result.encounterOps` and compiles a `CampaignCombatRequest`
 * carrying real campaign identity. It never resolves a battle and never touches
 * the filesystem, vscode, or the network.
 *
 * Ordering constraint (inherited from the V1-D findings): the resulting request
 * must be dispatched at the Accepted correlation boundary *after* the game_state
 * commit, never before, so a turn commit cannot revert combat-driven state.
 */

import {
    CAMPAIGN_COMBAT_REQUEST_SCHEMA_VERSION,
    CampaignCombatRequest,
    CampaignCombatRequestMode,
} from './campaignCombatRequestCore';

/** Only `start_combat` exists in V1. Unknown ops are rejected, never ignored silently. */
export const ENCOUNTER_OP_TYPES = ['start_combat'] as const;
export type EncounterOpType = (typeof ENCOUNTER_OP_TYPES)[number];

/**
 * At most one battle can be live at a time (the coordinator refuses concurrent
 * starts), so accepting more than one op per turn would only ever discard work.
 */
export const MAX_ENCOUNTER_OPS_PER_TURN = 1;

/**
 * Enemy rosters the GM is allowed to name. An allowlist rather than a free
 * string: a fixture id reaches `compileCampaignCombatRequest`, and an unknown
 * one would surface as a runtime compile failure on the player's turn.
 */
export const ALLOWED_ENCOUNTER_FIXTURE_IDS = [
    'standard_5v5',
    'armor_vs_normal',
    'armor_vs_ap',
] as const;
export type EncounterFixtureId = (typeof ALLOWED_ENCOUNTER_FIXTURE_IDS)[number];

export const DEFAULT_ENCOUNTER_FIXTURE_ID: EncounterFixtureId = 'standard_5v5';

/**
 * Ally slots per fixture, mirroring `initialCombatLabScenarios()`. These are the
 * fallback roster when the campaign has no party file, and they also define how
 * many real party members a fixture can seat.
 * `test_combat_encounter_turn_ops.js` pins them against the real scenarios.
 */
const FIXTURE_ALLY_ENTITY_IDS: Record<EncounterFixtureId, readonly string[]> = {
    standard_5v5: ['ally_1', 'ally_2', 'ally_3', 'ally_4', 'ally_5'],
    armor_vs_normal: ['normal'],
    armor_vs_ap: ['ap'],
};

/** How many ally units a fixture actually fields. */
export function fixtureAllySlotCount(fixtureId: EncounterFixtureId): number {
    return FIXTURE_ALLY_ENTITY_IDS[fixtureId].length;
}

/**
 * Seat the real party in the fixture's ally slots.
 *
 * `compileCampaignCombatRequest` binds `request.allies[i]` positionally onto
 * `battleSpec.initialState.units.allies[i]`, so passing real character ids makes
 * the compiled roster snapshot correlate the battle back to actual party
 * members instead of anonymous `ally_N` placeholders.
 *
 * Extra party members beyond the fixture's slots are dropped rather than
 * silently expanding the battle: the fixture defines the encounter's shape.
 * An empty party falls back to the fixture's own ids, so a solo campaign still
 * produces a valid request.
 */
export function resolveEncounterAllyEntityIds(
    fixtureId: EncounterFixtureId,
    partyEntityIds?: readonly string[],
): string[] {
    const slots = FIXTURE_ALLY_ENTITY_IDS[fixtureId];
    const seen = new Set<string>();
    const party: string[] = [];
    for (const raw of partyEntityIds ?? []) {
        if (!isBoundedString(raw)) continue;
        const id = raw.trim();
        if (seen.has(id)) continue;
        seen.add(id);
        party.push(id);
        if (party.length >= slots.length) break;
    }
    if (party.length === 0) {
        return [...slots];
    }
    // Any slot the party does not fill keeps the fixture's own unit so the
    // encounter still fields the roster the fixture was balanced around.
    return [...party, ...slots.slice(party.length)];
}

/**
 * Fields that would let prose decide the battle. Mirrors the request contract's
 * own guard so a bad op is rejected at the earliest boundary rather than deeper
 * in the pipeline.
 */
const FORBIDDEN_OUTCOME_KEYS = [
    'winner',
    'outcome',
    'result',
    'finalHp',
    'hp',
    'damage',
    'damageTotal',
    'terminalOutcomeCode',
    'receiptHash',
    'simulationResultHash',
    'survivors',
    'casualties',
    'loot',
    'rewards',
] as const;

export interface EncounterTurnOp {
    op: EncounterOpType;
    encounterId: string;
    fixtureId: EncounterFixtureId;
    mode: CampaignCombatRequestMode;
    reason?: string;
}

export type ParseEncounterTurnOpsResult =
    | { ok: true; ops: EncounterTurnOp[] }
    | { ok: false; error: string; detail?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, max = 128): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

/**
 * Parse AI-authored encounter ops. Returns `ok: true` with an empty list when the
 * field is absent — "the GM declared nothing" is normal, not an error.
 */
export function parseEncounterTurnOps(raw: unknown): ParseEncounterTurnOpsResult {
    if (raw === undefined || raw === null) {
        return { ok: true, ops: [] };
    }
    if (!Array.isArray(raw)) {
        return { ok: false, error: 'ENCOUNTER_OPS_NOT_ARRAY' };
    }
    if (raw.length === 0) {
        return { ok: true, ops: [] };
    }
    if (raw.length > MAX_ENCOUNTER_OPS_PER_TURN) {
        return { ok: false, error: 'TOO_MANY_ENCOUNTER_OPS', detail: `${raw.length} > ${MAX_ENCOUNTER_OPS_PER_TURN}` };
    }

    const ops: EncounterTurnOp[] = [];
    for (const entry of raw) {
        if (!isRecord(entry)) {
            return { ok: false, error: 'ENCOUNTER_OP_NOT_OBJECT' };
        }
        for (const key of FORBIDDEN_OUTCOME_KEYS) {
            if (key in entry) {
                return { ok: false, error: 'FORBIDDEN_OUTCOME_FIELD', detail: key };
            }
        }
        if (entry.op !== 'start_combat') {
            return { ok: false, error: 'UNKNOWN_ENCOUNTER_OP', detail: String(entry.op) };
        }
        if (!isBoundedString(entry.encounterId)) {
            return { ok: false, error: 'INVALID_ENCOUNTER_ID' };
        }
        let fixtureId: EncounterFixtureId = DEFAULT_ENCOUNTER_FIXTURE_ID;
        if (entry.fixtureId !== undefined) {
            if (!ALLOWED_ENCOUNTER_FIXTURE_IDS.includes(entry.fixtureId as EncounterFixtureId)) {
                return { ok: false, error: 'UNKNOWN_ENCOUNTER_FIXTURE', detail: String(entry.fixtureId) };
            }
            fixtureId = entry.fixtureId as EncounterFixtureId;
        }
        let mode: CampaignCombatRequestMode = 'command';
        if (entry.mode !== undefined) {
            if (entry.mode !== 'command' && entry.mode !== 'spectator') {
                return { ok: false, error: 'INVALID_ENCOUNTER_MODE', detail: String(entry.mode) };
            }
            mode = entry.mode;
        }
        if (entry.reason !== undefined && !isBoundedString(entry.reason, 256)) {
            return { ok: false, error: 'INVALID_ENCOUNTER_REASON' };
        }
        ops.push({
            op: 'start_combat',
            encounterId: entry.encounterId.trim(),
            fixtureId,
            mode,
            ...(entry.reason !== undefined ? { reason: (entry.reason as string).trim() } : {}),
        });
    }
    return { ok: true, ops };
}

/** Real campaign identity, taken from the Accepted turn commit — never invented here. */
export interface EncounterCampaignIdentity {
    campaignInstanceId: string;
    timelineEpochId: string;
    /** Accepted turn id that declared the encounter; correlates the receipt back to its turn. */
    acceptedTurnId: string;
    /** Monotonic campaign revision at declaration time. */
    sourceCampaignRevision: number;
}

export type BuildEncounterRequestResult =
    | { ok: true; request: CampaignCombatRequest }
    | { ok: false; error: string; detail?: string };

/**
 * Compile a validated op into a campaign combat request.
 *
 * `requestId` is caller-supplied rather than generated here so the module stays
 * pure and the same turn always produces the same request under replay.
 */
export function buildCampaignCombatRequestFromEncounterOp(
    op: EncounterTurnOp,
    identity: EncounterCampaignIdentity,
    requestId: string,
    /** Real party character ids; omitted or empty falls back to the fixture roster. */
    partyEntityIds?: readonly string[],
): BuildEncounterRequestResult {
    if (!isBoundedString(identity.campaignInstanceId) || !isBoundedString(identity.timelineEpochId)) {
        return { ok: false, error: 'INVALID_CAMPAIGN_IDENTITY' };
    }
    if (!isBoundedString(identity.acceptedTurnId)) {
        return { ok: false, error: 'INVALID_ACCEPTED_TURN_ID' };
    }
    if (!Number.isInteger(identity.sourceCampaignRevision) || identity.sourceCampaignRevision < 0) {
        return { ok: false, error: 'INVALID_SOURCE_REVISION' };
    }
    if (!isBoundedString(requestId)) {
        return { ok: false, error: 'INVALID_REQUEST_ID' };
    }
    return {
        ok: true,
        request: {
            schemaVersion: CAMPAIGN_COMBAT_REQUEST_SCHEMA_VERSION,
            encounterId: op.encounterId,
            requestId,
            campaignInstanceId: identity.campaignInstanceId,
            timelineEpochId: identity.timelineEpochId,
            sourceCampaignRevision: identity.sourceCampaignRevision,
            sourceAcceptedTurnId: identity.acceptedTurnId,
            requestedMode: op.mode,
            debugFixtureId: op.fixtureId,
            allies: resolveEncounterAllyEntityIds(op.fixtureId, partyEntityIds)
                .map(entityId => ({ entityId, team: 0 as const })),
            enemies: { kind: 'fixture', fixtureId: op.fixtureId },
            presentation: { openBattleView: true },
            objective: { type: 'annihilate' },
        },
    };
}

/** Deterministic request id: same accepted turn + encounter always yields the same id. */
export function encounterRequestId(acceptedTurnId: string, encounterId: string): string {
    return `enc_${acceptedTurnId}_${encounterId}`.slice(0, 128);
}

/**
 * GM instruction for story-declared combat.
 *
 * Derived from the same allowlists the parser enforces, so the prompt can never
 * advertise a fixture or field that would be rejected at apply time. Kept to a
 * few lines because it is injected on every turn while the rule is on.
 */
export function buildStoryCombatPromptInstruction(): string {
    return [
        'STORY COMBAT ENABLED: When the narrative reaches a fight that should actually be played out,',
        'emit `encounterOps` (at most ONE per turn) to hand the battle to the combat engine:',
        '  encounterOps: [{ "op": "start_combat", "encounterId": "<short_snake_case_id>",',
        `    "fixtureId": "<${ALLOWED_ENCOUNTER_FIXTURE_IDS.join(' | ')}>", "reason": "<one short clause>" }]`,
        'You declare only that a fight BEGINS. You must NEVER describe or decide its result:',
        'do not narrate who wins, who dies, damage numbers, HP left, or loot in the same turn.',
        `The following keys are rejected outright: ${FORBIDDEN_OUTCOME_KEYS.join(', ')}.`,
        'End the narrative at the moment combat is joined; the engine resolves it and the',
        'confirmed outcome is given back to you on a later turn. Omit encounterOps entirely',
        'for scuffles that are better handled as prose.',
    ].join('\n');
}
