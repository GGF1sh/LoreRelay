// CAMPAIGN-COMBAT-SOAK-001: story-combat spectator soak contract (pure).
// No vscode / fs / network / LLM. The host script wires coordinator + apply + ACK.

import { ALLOWED_ENCOUNTER_FIXTURE_IDS, type EncounterFixtureId } from './combatEncounterTurnOpsCore';
import { isSafeQaTempDeletionTarget } from './gameQaRunnerCore';

export { isSafeQaTempDeletionTarget };

export const CAMPAIGN_COMBAT_SOAK_SCENARIO_VERSION = 1 as const;
export const CAMPAIGN_COMBAT_SOAK_REPORT_SCHEMA_VERSION = 1 as const;
export const DEFAULT_CAMPAIGN_COMBAT_SOAK_TEMP_ROOT = '.tmp/campaign_combat_soak';

export const CCS_RUN_MODES = ['quick', 'full'] as const;
export type CcsRunMode = (typeof CCS_RUN_MODES)[number];

export const CCS_INVARIANTS = [
    'terminal_reached',
    'spectator_no_commands',
    'pending_then_applied',
    'no_duplicate_receipt',
    'hp_in_range',
    'history_one_per_battle',
    'consequence_once',
    'reload_no_double_apply',
] as const;
export type CcsInvariantId = (typeof CCS_INVARIANTS)[number];

export const CCS_FORBIDDEN_KEYS = [
    'command', 'commands', 'cmd', 'shell', 'exec', 'execute', 'eval',
    'script', 'scripts', 'spawn', 'code', 'run', 'require', 'import',
] as const;

export interface CcsBattleCase {
    id: string;
    fixtureId: EncounterFixtureId;
    seed: string;
    protagonistEntityId: string;
    partyEntityIds: string[];
    startingHp: number;
    maxHp: number;
    sourceCampaignRevision: number;
}

export interface CcsLimits {
    timeoutMs: number;
    maxTicks: number;
    stepBatch: number;
}

export interface CcsScenarioDefinition {
    id: string;
    version: number;
    description: string;
    mode: CcsRunMode;
    modes?: CcsRunMode[];
    battles: CcsBattleCase[];
    limits: CcsLimits;
    invariants: CcsInvariantId[];
}

export type ParseCcsScenarioResult =
    | { ok: true; scenario: CcsScenarioDefinition }
    | { ok: false; errors: string[] };

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isRunMode(value: unknown): value is CcsRunMode {
    return typeof value === 'string' && (CCS_RUN_MODES as readonly string[]).includes(value);
}

function isFixtureId(value: unknown): value is EncounterFixtureId {
    return typeof value === 'string' && (ALLOWED_ENCOUNTER_FIXTURE_IDS as readonly string[]).includes(value);
}

function isInvariantId(value: unknown): value is CcsInvariantId {
    return typeof value === 'string' && (CCS_INVARIANTS as readonly string[]).includes(value);
}

function scanForbiddenKeys(raw: unknown, pathPrefix = ''): string[] {
    const hits: string[] = [];
    const forbidden = new Set<string>(CCS_FORBIDDEN_KEYS as readonly string[]);
    const walk = (value: unknown, prefix: string): void => {
        if (Array.isArray(value)) {
            value.forEach((item, i) => walk(item, `${prefix}[${i}]`));
            return;
        }
        if (!isPlainObject(value)) {
            return;
        }
        for (const key of Object.keys(value)) {
            if (forbidden.has(key.toLowerCase())) {
                hits.push(`${prefix}${prefix ? '.' : ''}${key}`);
            }
            walk(value[key], `${prefix}${prefix ? '.' : ''}${key}`);
        }
    };
    walk(raw, pathPrefix);
    return hits;
}

function requirePositiveInt(doc: Record<string, unknown>, field: string, errors: string[]): number | undefined {
    const value = doc[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
        errors.push(`${field} must be a positive number`);
        return undefined;
    }
    return Math.floor(value);
}

function parseBattleCase(raw: unknown, index: number, errors: string[]): CcsBattleCase | undefined {
    if (!isPlainObject(raw)) {
        errors.push(`battles[${index}] must be an object`);
        return undefined;
    }
    if (!isNonEmptyString(raw.id)) {
        errors.push(`battles[${index}].id is required`);
    }
    if (!isFixtureId(raw.fixtureId)) {
        errors.push(`battles[${index}].fixtureId must be one of ${ALLOWED_ENCOUNTER_FIXTURE_IDS.join(', ')}`);
    }
    if (!isNonEmptyString(raw.seed)) {
        errors.push(`battles[${index}].seed is required`);
    }
    const protagonistEntityId = isNonEmptyString(raw.protagonistEntityId) ? raw.protagonistEntityId.trim() : 'hero';
    let partyEntityIds: string[] = [protagonistEntityId];
    if (raw.partyEntityIds !== undefined) {
        if (!Array.isArray(raw.partyEntityIds) || !raw.partyEntityIds.every(isNonEmptyString)) {
            errors.push(`battles[${index}].partyEntityIds must be a string array`);
        } else {
            partyEntityIds = raw.partyEntityIds.map((id) => String(id).trim());
        }
    }
    const startingHp = typeof raw.startingHp === 'number' && Number.isFinite(raw.startingHp) ? Math.floor(raw.startingHp) : 20;
    const maxHp = typeof raw.maxHp === 'number' && Number.isFinite(raw.maxHp) ? Math.floor(raw.maxHp) : 20;
    if (startingHp < 0 || maxHp < 1 || startingHp > maxHp) {
        errors.push(`battles[${index}] HP must satisfy 0 <= startingHp <= maxHp and maxHp >= 1`);
    }
    const sourceCampaignRevision = typeof raw.sourceCampaignRevision === 'number' && Number.isInteger(raw.sourceCampaignRevision)
        ? raw.sourceCampaignRevision
        : 0;
    if (sourceCampaignRevision < 0) {
        errors.push(`battles[${index}].sourceCampaignRevision must be >= 0`);
    }
    if (errors.some((e) => e.startsWith(`battles[${index}]`))) {
        return undefined;
    }
    return {
        id: String(raw.id).trim(),
        fixtureId: raw.fixtureId as EncounterFixtureId,
        seed: String(raw.seed).trim(),
        protagonistEntityId,
        partyEntityIds,
        startingHp,
        maxHp,
        sourceCampaignRevision,
    };
}

export function parseCampaignCombatSoakScenario(raw: unknown): ParseCcsScenarioResult {
    const errors: string[] = [];
    if (!isPlainObject(raw)) {
        return { ok: false, errors: ['scenario root must be an object'] };
    }
    const forbidden = scanForbiddenKeys(raw);
    if (forbidden.length > 0) {
        errors.push(`forbidden command/code keys are not allowed: ${forbidden.join(', ')}`);
    }
    if (!isNonEmptyString(raw.id)) {
        errors.push('id is required');
    }
    if (raw.version !== CAMPAIGN_COMBAT_SOAK_SCENARIO_VERSION) {
        errors.push(`version must be ${CAMPAIGN_COMBAT_SOAK_SCENARIO_VERSION}`);
    }
    if (!isNonEmptyString(raw.description)) {
        errors.push('description is required');
    }
    if (!isRunMode(raw.mode)) {
        errors.push('mode must be quick or full');
    }
    let modes: CcsRunMode[] | undefined;
    if (raw.modes !== undefined) {
        if (!Array.isArray(raw.modes) || !raw.modes.every(isRunMode)) {
            errors.push('modes must be an array of quick|full');
        } else {
            modes = raw.modes as CcsRunMode[];
        }
    }
    if (!Array.isArray(raw.battles) || raw.battles.length < 1) {
        errors.push('battles must be a non-empty array');
    }
    const battles: CcsBattleCase[] = [];
    if (Array.isArray(raw.battles)) {
        raw.battles.forEach((entry, i) => {
            const parsed = parseBattleCase(entry, i, errors);
            if (parsed) {
                battles.push(parsed);
            }
        });
    }
    let limits: CcsLimits | undefined;
    if (!isPlainObject(raw.limits)) {
        errors.push('limits must be an object');
    } else {
        const timeoutMs = requirePositiveInt(raw.limits, 'timeoutMs', errors);
        const maxTicks = requirePositiveInt(raw.limits, 'maxTicks', errors);
        const stepBatch = requirePositiveInt(raw.limits, 'stepBatch', errors);
        if (timeoutMs !== undefined && maxTicks !== undefined && stepBatch !== undefined) {
            limits = { timeoutMs, maxTicks, stepBatch };
        }
    }
    let invariants: CcsInvariantId[] | undefined;
    if (!Array.isArray(raw.invariants) || raw.invariants.length === 0) {
        errors.push('invariants must be a non-empty array');
    } else {
        invariants = [];
        raw.invariants.forEach((inv, i) => {
            if (!isInvariantId(inv)) {
                errors.push(`invariants[${i}] is not allowlisted`);
            } else if (!invariants!.includes(inv)) {
                invariants!.push(inv);
            }
        });
    }
    if (errors.length > 0 || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.description)
        || !isRunMode(raw.mode) || battles.length === 0 || !limits || !invariants) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        scenario: {
            id: raw.id.trim(),
            version: CAMPAIGN_COMBAT_SOAK_SCENARIO_VERSION,
            description: raw.description.trim(),
            mode: raw.mode,
            modes,
            battles,
            limits,
            invariants,
        },
    };
}

export function filterCcsScenariosByRunMode(
    scenarios: CcsScenarioDefinition[],
    mode: CcsRunMode
): CcsScenarioDefinition[] {
    return scenarios.filter((s) => (s.modes && s.modes.length ? s.modes : [s.mode]).includes(mode));
}

export interface CcsBattleObservation {
    battleId: string;
    fixtureId: string;
    seed: string;
    combatSessionId?: string;
    lifecycle?: string;
    outcome?: string;
    ticksAdvanced: number;
    commandEventCount: number;
    pendingBeforeApply: number;
    appliedOkCount: number;
    applyStatuses: string[];
    reloadApplyStatuses: string[];
    historyLength: number;
    distinctReceiptHashes: number;
    hpBefore: number;
    hpAfter: number;
    hpMax: number;
    consequenceFirstAck?: string;
    consequenceRepeatAck?: string;
    simulationResultHash?: string;
    terminalReached: boolean;
}

export interface CcsInvariantResult {
    id: CcsInvariantId;
    ok: boolean;
    detail?: string;
}

export function evaluateCcsInvariants(
    ids: CcsInvariantId[],
    obs: CcsBattleObservation
): CcsInvariantResult[] {
    return ids.map((id) => evaluateOne(id, obs));
}

function evaluateOne(id: CcsInvariantId, obs: CcsBattleObservation): CcsInvariantResult {
    switch (id) {
        case 'terminal_reached':
            return {
                id,
                ok: obs.terminalReached && Boolean(obs.outcome) && obs.lifecycle === 'receipt_pending',
                detail: obs.terminalReached
                    ? `lifecycle=${obs.lifecycle} outcome=${obs.outcome}`
                    : `did not terminate after ${obs.ticksAdvanced} ticks`,
            };
        case 'spectator_no_commands':
            return {
                id,
                ok: obs.commandEventCount === 0,
                detail: obs.commandEventCount === 0 ? undefined : `command events=${obs.commandEventCount}`,
            };
        case 'pending_then_applied':
            return {
                id,
                ok: obs.pendingBeforeApply === 1 && obs.appliedOkCount >= 1
                    && obs.applyStatuses.every((s) => s === 'applied' || s === 'already_applied'),
                detail: `pending=${obs.pendingBeforeApply} apply=${obs.applyStatuses.join(',')}`,
            };
        case 'no_duplicate_receipt':
            return {
                id,
                ok: obs.distinctReceiptHashes === obs.historyLength && obs.historyLength >= 1,
                detail: `history=${obs.historyLength} distinctHashes=${obs.distinctReceiptHashes}`,
            };
        case 'hp_in_range': {
            const ok = Number.isFinite(obs.hpAfter) && obs.hpAfter >= 0 && obs.hpAfter <= obs.hpMax;
            return { id, ok, detail: ok ? undefined : `hp ${obs.hpAfter}/${obs.hpMax}` };
        }
        case 'history_one_per_battle':
            return {
                id,
                ok: obs.historyLength === 1,
                detail: `historyLength=${obs.historyLength}`,
            };
        case 'consequence_once':
            return {
                id,
                ok: obs.consequenceFirstAck === 'applied' && obs.consequenceRepeatAck === 'alreadySatisfied',
                detail: `first=${obs.consequenceFirstAck} repeat=${obs.consequenceRepeatAck}`,
            };
        case 'reload_no_double_apply':
            return {
                id,
                ok: obs.reloadApplyStatuses.length > 0
                    && obs.reloadApplyStatuses.every((s) => s === 'already_applied'),
                detail: `reload=${obs.reloadApplyStatuses.join(',')}`,
            };
        default:
            return { id, ok: false, detail: 'unknown invariant' };
    }
}

export interface CcsBattleReport {
    observation: CcsBattleObservation;
    invariantResults: CcsInvariantResult[];
    ok: boolean;
}

export interface CcsSoakReport {
    schemaVersion: typeof CAMPAIGN_COMBAT_SOAK_REPORT_SCHEMA_VERSION;
    scenarioId: string;
    mode: CcsRunMode;
    ok: boolean;
    battles: CcsBattleReport[];
    runtimeMs: number;
    warnings: string[];
}

export function summarizeCcsReport(report: CcsSoakReport): string {
    const lines = [
        `# Campaign Combat Soak — ${report.scenarioId}`,
        '',
        `- Result: **${report.ok ? 'PASS' : 'FAIL'}**`,
        `- Mode: ${report.mode}`,
        `- Battles: ${report.battles.length}`,
        `- Runtime: ${report.runtimeMs} ms`,
        '',
    ];
    for (const battle of report.battles) {
        const obs = battle.observation;
        lines.push(`## ${obs.battleId} (${obs.fixtureId})`);
        lines.push(`- ${battle.ok ? 'PASS' : 'FAIL'} outcome=${obs.outcome || 'none'} ticks=${obs.ticksAdvanced} hp=${obs.hpAfter}/${obs.hpMax}`);
        for (const inv of battle.invariantResults) {
            lines.push(`- \`${inv.id}\`: ${inv.ok ? 'ok' : 'FAIL'}${inv.detail ? ` — ${inv.detail}` : ''}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

export function formatCcsRunId(startedAt: Date, suffix: string): string {
    const stamp = startedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '_');
    return `ccs_${stamp}_${suffix}`;
}
