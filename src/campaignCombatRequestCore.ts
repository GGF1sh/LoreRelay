/**
 * Campaign combat request contract (V1-A).
 * Not CombatLabScenario — Lab remains a separate adapter that can compile to BattleSpec.
 */

export const CAMPAIGN_COMBAT_REQUEST_SCHEMA_VERSION = 'campaign-combat-request-v1' as const;

export type CampaignCombatRequestMode = 'command' | 'spectator';

export interface CampaignCombatParticipantRef {
    entityId: string;
    team: 0 | 1;
    /** Stable campaign identity; optional for pre-story-combat/debug requests. */
    role?: 'protagonist';
}

export interface CampaignCombatRequest {
    schemaVersion: typeof CAMPAIGN_COMBAT_REQUEST_SCHEMA_VERSION;
    encounterId: string;
    requestId: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    sourceCampaignRevision: number;
    sourceAcceptedTurnId?: string;
    requestedMode: CampaignCombatRequestMode;
    /** V1 debug: named lab fixture id used only inside compile adapter (not stored as Lab scenario). */
    debugFixtureId?: string;
    allies: CampaignCombatParticipantRef[];
    enemies: CampaignCombatParticipantRef[] | { kind: 'fixture'; fixtureId: string };
    presentation?: {
        titleKey?: string;
        openBattleView?: boolean;
    };
    objective: { type: 'annihilate' };
}

export type CampaignCombatRequestValidateResult =
    | { ok: true; request: CampaignCombatRequest }
    | { ok: false; error: string; detail?: string };

const FORBIDDEN_RESULT_KEYS = [
    'winner',
    'outcome',
    'finalHp',
    'damageTotal',
    'terminalOutcomeCode',
    'receiptHash',
    'simulationResultHash',
] as const;

function isNonEmptyString(value: unknown, max = 128): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

function isParticipant(value: unknown): value is CampaignCombatParticipantRef {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const o = value as Record<string, unknown>;
    return isNonEmptyString(o.entityId, 128)
        && (o.team === 0 || o.team === 1)
        && (o.role === undefined || o.role === 'protagonist');
}

/** Reject AI/result fields and unknown modes. */
export function validateCampaignCombatRequest(raw: unknown): CampaignCombatRequestValidateResult {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, error: 'INVALID_CAMPAIGN_COMBAT_REQUEST' };
    }
    const o = raw as Record<string, unknown>;
    for (const key of FORBIDDEN_RESULT_KEYS) {
        if (key in o) {
            return { ok: false, error: 'FORBIDDEN_RESULT_FIELD', detail: key };
        }
    }
    if (o.schemaVersion !== CAMPAIGN_COMBAT_REQUEST_SCHEMA_VERSION) {
        return { ok: false, error: 'INVALID_SCHEMA_VERSION' };
    }
    if (!isNonEmptyString(o.encounterId) || !isNonEmptyString(o.requestId)
        || !isNonEmptyString(o.campaignInstanceId) || !isNonEmptyString(o.timelineEpochId)) {
        return { ok: false, error: 'INVALID_IDENTITY_FIELDS' };
    }
    if (typeof o.sourceCampaignRevision !== 'number' || !Number.isFinite(o.sourceCampaignRevision)
        || o.sourceCampaignRevision < 0 || !Number.isInteger(o.sourceCampaignRevision)) {
        return { ok: false, error: 'INVALID_SOURCE_REVISION' };
    }
    if (o.requestedMode !== 'command' && o.requestedMode !== 'spectator') {
        return { ok: false, error: 'INVALID_MODE' };
    }
    if (!o.objective || typeof o.objective !== 'object' || (o.objective as { type?: unknown }).type !== 'annihilate') {
        return { ok: false, error: 'INVALID_OBJECTIVE' };
    }
    if (!Array.isArray(o.allies) || o.allies.length === 0 || !o.allies.every(isParticipant)) {
        return { ok: false, error: 'INVALID_ALLIES' };
    }
    if (o.allies.filter(ally => (ally as CampaignCombatParticipantRef).role === 'protagonist').length > 1) {
        return { ok: false, error: 'INVALID_ALLIES', detail: 'multiple protagonists' };
    }
    let enemies: CampaignCombatRequest['enemies'];
    if (Array.isArray(o.enemies)) {
        if (o.enemies.length === 0 || !o.enemies.every(isParticipant)
            || o.enemies.some(enemy => (enemy as CampaignCombatParticipantRef).role !== undefined)) {
            return { ok: false, error: 'INVALID_ENEMIES' };
        }
        enemies = o.enemies as CampaignCombatParticipantRef[];
    } else if (o.enemies && typeof o.enemies === 'object'
        && (o.enemies as { kind?: unknown }).kind === 'fixture'
        && isNonEmptyString((o.enemies as { fixtureId?: unknown }).fixtureId)) {
        enemies = { kind: 'fixture', fixtureId: String((o.enemies as { fixtureId: string }).fixtureId).trim() };
    } else {
        return { ok: false, error: 'INVALID_ENEMIES' };
    }

    const request: CampaignCombatRequest = {
        schemaVersion: CAMPAIGN_COMBAT_REQUEST_SCHEMA_VERSION,
        encounterId: o.encounterId.trim(),
        requestId: o.requestId.trim(),
        campaignInstanceId: o.campaignInstanceId.trim(),
        timelineEpochId: o.timelineEpochId.trim(),
        sourceCampaignRevision: o.sourceCampaignRevision,
        requestedMode: o.requestedMode,
        allies: o.allies as CampaignCombatParticipantRef[],
        enemies,
        objective: { type: 'annihilate' },
    };
    if (isNonEmptyString(o.sourceAcceptedTurnId)) {
        request.sourceAcceptedTurnId = o.sourceAcceptedTurnId.trim();
    }
    if (isNonEmptyString(o.debugFixtureId, 64)) {
        request.debugFixtureId = o.debugFixtureId.trim();
    }
    if (o.presentation && typeof o.presentation === 'object' && !Array.isArray(o.presentation)) {
        const p = o.presentation as Record<string, unknown>;
        request.presentation = {
            ...(isNonEmptyString(p.titleKey) ? { titleKey: p.titleKey.trim() } : {}),
            ...(typeof p.openBattleView === 'boolean' ? { openBattleView: p.openBattleView } : {}),
        };
    }
    return { ok: true, request };
}

/** Default debug request for command-palette entry (no AI results). */
export function buildDebugCampaignCombatRequest(options?: {
    mode?: CampaignCombatRequestMode;
    requestId?: string;
    combatSessionSeed?: string;
}): CampaignCombatRequest {
    const requestId = options?.requestId
        ?? `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    return {
        schemaVersion: CAMPAIGN_COMBAT_REQUEST_SCHEMA_VERSION,
        encounterId: 'debug_standard_5v5',
        requestId,
        campaignInstanceId: 'debug-campaign',
        timelineEpochId: 'debug-epoch',
        sourceCampaignRevision: 0,
        requestedMode: options?.mode === 'spectator' ? 'spectator' : 'command',
        debugFixtureId: 'standard_5v5',
        allies: [
            { entityId: 'ally_1', team: 0 },
            { entityId: 'ally_2', team: 0 },
            { entityId: 'ally_3', team: 0 },
            { entityId: 'ally_4', team: 0 },
            { entityId: 'ally_5', team: 0 },
        ],
        enemies: { kind: 'fixture', fixtureId: 'standard_5v5' },
        presentation: { openBattleView: true },
        objective: { type: 'annihilate' },
    };
}
