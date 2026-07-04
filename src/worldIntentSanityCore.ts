// World Intent WI5: pure semantic sanity checker (report-only, no I/O).

import { validateMobileBaseLink } from './mobileBaseCore';
import {
    resolveModProfile,
    type ModAliasRule,
    type ModProfile,
    type ModRecordDomain,
    type ParsedModManifest,
} from './modSystemCore';
import type { SettlementStateV1 } from './settlementCore';
import {
    validateVehicleFleet,
    type VehicleEntry,
    type VehicleParseIssue,
    type VehicleState,
} from './vehicleCore';
import { parseVehicleWorldIntentBridgeMode } from './worldIntentCore';
import {
    formatWorldStateParseWarning,
    type WorldStateParseWarning,
} from './worldStateCore';

export const WORLD_SANITY_REPORT_VERSION = 1 as const;

export const MAX_WORLD_SANITY_ISSUES = 100;
export const MAX_WORLD_SANITY_MESSAGE_CHARS = 240;
export const MAX_WORLD_SANITY_RECOMMENDATION_CHARS = 240;
export const MAX_WORLD_SANITY_RELATED_REFS = 8;

export type WorldSanitySeverity = 'info' | 'warning' | 'error';

export type WorldSanityDomain =
    | 'vehicle'
    | 'mobile_base'
    | 'world_state'
    | 'mod'
    | 'game_rules'
    | 'world_intent';

export interface WorldSanityEntityRef {
    kind: string;
    id?: string;
}

export interface WorldSanityIssue {
    version: typeof WORLD_SANITY_REPORT_VERSION;
    severity: WorldSanitySeverity;
    domain: WorldSanityDomain;
    code: string;
    message: string;
    entity?: WorldSanityEntityRef;
    related?: WorldSanityEntityRef[];
    recommendation?: string;
}

export interface WorldSanityReport {
    version: typeof WORLD_SANITY_REPORT_VERSION;
    ok: boolean;
    issueCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    issues: WorldSanityIssue[];
    truncated?: boolean;
}

export interface WorldSanityGameRules {
    enableVehicleSystem?: boolean;
    enableSettlementMode?: boolean;
    enableMobileBaseSystem?: boolean;
}

export interface WorldSanityLedgerLoadIssue {
    file: string;
    code: 'json_parse_error' | 'structural_validation_failed';
    message: string;
}

export interface WorldSanityInput {
    vehicleState?: VehicleState;
    /** Raw structural issues detected before parseVehicleState normalization. */
    vehicleRawParseIssues?: VehicleParseIssue[];
    settlementState?: SettlementStateV1;
    gameRules?: WorldSanityGameRules;
    modProfile?: ModProfile;
    mods?: Readonly<Record<string, ParsedModManifest>>;
    ledgerLoadIssues?: WorldSanityLedgerLoadIssue[];
    worldStateParseWarnings?: WorldStateParseWarning[];
    rawConfig?: {
        vehicleBridgeMode?: unknown;
    };
}

export interface BuildWorldSanityReportOptions {
    maxIssues?: number;
}

const DOMAIN_ORDER: Record<WorldSanityDomain, number> = {
    game_rules: 0,
    vehicle: 1,
    mobile_base: 2,
    world_state: 3,
    mod: 4,
    world_intent: 5,
};

const SEVERITY_ORDER: Record<WorldSanitySeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
};

function clampText(raw: string, max: number): string {
    const t = raw.trim().replace(/\s+/g, ' ');
    return t.length <= max ? t : `${t.slice(0, max - 3)}...`;
}

function makeIssue(
    severity: WorldSanitySeverity,
    domain: WorldSanityDomain,
    code: string,
    message: string,
    entity?: WorldSanityEntityRef,
    related?: WorldSanityEntityRef[],
    recommendation?: string
): WorldSanityIssue {
    const issue: WorldSanityIssue = {
        version: WORLD_SANITY_REPORT_VERSION,
        severity,
        domain,
        code,
        message: clampText(message, MAX_WORLD_SANITY_MESSAGE_CHARS),
    };
    if (entity) { issue.entity = entity; }
    if (related?.length) {
        issue.related = related.slice(0, MAX_WORLD_SANITY_RELATED_REFS);
    }
    if (recommendation) {
        issue.recommendation = clampText(recommendation, MAX_WORLD_SANITY_RECOMMENDATION_CHARS);
    }
    return issue;
}

function sortIssues(issues: WorldSanityIssue[]): WorldSanityIssue[] {
    return issues.slice().sort((a, b) => {
        const domainCmp = DOMAIN_ORDER[a.domain] - DOMAIN_ORDER[b.domain];
        if (domainCmp !== 0) { return domainCmp; }
        const sevCmp = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (sevCmp !== 0) { return sevCmp; }
        const codeCmp = a.code.localeCompare(b.code);
        if (codeCmp !== 0) { return codeCmp; }
        const aId = a.entity?.id ?? '';
        const bId = b.entity?.id ?? '';
        return aId.localeCompare(bId);
    });
}

function countBySeverity(issues: WorldSanityIssue[]): {
    errorCount: number;
    warningCount: number;
    infoCount: number;
} {
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    for (const issue of issues) {
        if (issue.severity === 'error') { errorCount++; }
        else if (issue.severity === 'warning') { warningCount++; }
        else { infoCount++; }
    }
    return { errorCount, warningCount, infoCount };
}

function fleetIssueCode(message: string): string {
    if (message.includes('cycle')) { return 'carrier_cycle'; }
    if (message.includes('itself')) { return 'self_carry'; }
    if (message.includes('missing carrier') || message.includes('references missing vehicle')) {
        return 'missing_carried_vehicle';
    }
    if (message.includes('exceeds carrier')) { return 'carrier_size_exceeded'; }
    return 'fleet_validation';
}

function fleetEntityFromMessage(message: string): WorldSanityEntityRef | undefined {
    const match = message.match(/Vehicle ([a-zA-Z0-9_-]+)/);
    return match ? { kind: 'vehicle', id: match[1] } : undefined;
}

function statusConditionMismatch(vehicle: VehicleEntry): string | undefined {
    const { status, durability } = vehicle;
    const condition = durability.condition;
    if (status === 'lost' && condition !== 'disabled') {
        return `Vehicle ${vehicle.id} is lost but condition is ${condition}.`;
    }
    if (status === 'disabled' && (condition === 'pristine' || condition === 'worn')) {
        return `Vehicle ${vehicle.id} is disabled but condition is ${condition}.`;
    }
    if (status === 'damaged' && condition === 'pristine') {
        return `Vehicle ${vehicle.id} is damaged but condition is pristine.`;
    }
    if ((condition === 'disabled' || condition === 'critical')
        && (status === 'available' || status === 'deployed')) {
        return `Vehicle ${vehicle.id} has ${condition} condition but status is ${status}.`;
    }
    return undefined;
}

export function checkVehicleRawParseSanity(input: WorldSanityInput): WorldSanityIssue[] {
    const rawIssues = input.vehicleRawParseIssues;
    if (!rawIssues?.length) { return []; }

    const issues: WorldSanityIssue[] = [];
    for (const raw of rawIssues) {
        const severity: WorldSanitySeverity = raw.code === 'invalid_version' ? 'warning' : 'error';
        issues.push(makeIssue(
            severity,
            'vehicle',
            `raw_${raw.code}`,
            raw.message,
            raw.vehicleId ? { kind: 'vehicle', id: raw.vehicleId } : undefined,
            undefined,
            'Fix vehicle_state.json directly; normalization may hide this issue from semantic checks.'
        ));
    }
    return issues;
}

export function checkVehicleSanity(input: WorldSanityInput): WorldSanityIssue[] {
    const state = input.vehicleState;
    if (!state) { return []; }

    const issues: WorldSanityIssue[] = [];
    const seenIds = new Set<string>();

    for (const vehicle of state.vehicles) {
        if (seenIds.has(vehicle.id)) {
            issues.push(makeIssue(
                'error',
                'vehicle',
                'duplicate_vehicle_id',
                `Duplicate vehicle id "${vehicle.id}" detected in supplied state.`,
                { kind: 'vehicle', id: vehicle.id },
                undefined,
                'Ensure each vehicle id is unique before persisting.'
            ));
        } else {
            seenIds.add(vehicle.id);
        }

        const mismatch = statusConditionMismatch(vehicle);
        if (mismatch) {
            issues.push(makeIssue(
                'warning',
                'vehicle',
                'status_condition_mismatch',
                mismatch,
                { kind: 'vehicle', id: vehicle.id }
            ));
        }

        const resources = vehicle.resources;
        if (resources && resources.powerType !== 'none') {
            const current = resources.current ?? 0;
            const max = resources.max ?? 0;
            if (current > max) {
                issues.push(makeIssue(
                    'error',
                    'vehicle',
                    'resource_over_max',
                    `Vehicle ${vehicle.id} resource current (${current}) exceeds max (${max}).`,
                    { kind: 'vehicle', id: vehicle.id }
                ));
            }
        }
    }

    if (state.activeVehicleId) {
        const active = state.vehicles.find((v) => v.id === state.activeVehicleId);
        if (!active) {
            issues.push(makeIssue(
                'error',
                'vehicle',
                'active_vehicle_missing',
                `Active vehicle id "${state.activeVehicleId}" does not reference a fleet vehicle.`,
                { kind: 'vehicle', id: state.activeVehicleId },
                undefined,
                'Set activeVehicleId to an existing vehicle or clear it.'
            ));
        } else if (active.status === 'lost') {
            issues.push(makeIssue(
                'warning',
                'vehicle',
                'active_vehicle_lost',
                `Active vehicle "${active.id}" is marked lost.`,
                { kind: 'vehicle', id: active.id },
                undefined,
                'Choose another active vehicle or recover the lost unit.'
            ));
        }
    }

    const fleet = validateVehicleFleet(state);
    for (const msg of fleet.issues) {
        issues.push(makeIssue(
            'error',
            'vehicle',
            fleetIssueCode(msg),
            msg,
            fleetEntityFromMessage(msg)
        ));
    }
    for (const msg of fleet.warnings ?? []) {
        issues.push(makeIssue(
            'warning',
            'vehicle',
            'fleet_warning',
            msg,
            fleetEntityFromMessage(msg)
        ));
    }

    return issues;
}

function mobileBaseIssueFromReason(
    vehicle: VehicleEntry,
    reason: string
): WorldSanityIssue {
    if (reason === 'invalid_mobile_base_link') {
        return makeIssue(
            'error',
            'mobile_base',
            'invalid_mobile_base_link',
            `Vehicle ${vehicle.id} has an invalid mobile base link.`,
            { kind: 'vehicle', id: vehicle.id }
        );
    }
    if (reason === 'missing_settlement_ledger') {
        return makeIssue(
            'error',
            'mobile_base',
            'missing_settlement_ledger',
            `Mobile base vehicle ${vehicle.id} requires a settlement ledger.`,
            { kind: 'vehicle', id: vehicle.id },
            [{ kind: 'settlement', id: vehicle.mobileBase?.settlementId }]
        );
    }
    if (reason.startsWith('settlement_id_mismatch')) {
        return makeIssue(
            'error',
            'mobile_base',
            'settlement_id_mismatch',
            `Mobile base vehicle ${vehicle.id} settlement link does not match supplied ledger (${reason}).`,
            { kind: 'vehicle', id: vehicle.id },
            [{ kind: 'settlement', id: vehicle.mobileBase?.settlementId }]
        );
    }
    return makeIssue(
        'warning',
        'mobile_base',
        'mobile_base_note',
        reason,
        { kind: 'vehicle', id: vehicle.id }
    );
}

export function checkMobileBaseSanity(input: WorldSanityInput): WorldSanityIssue[] {
    const state = input.vehicleState;
    if (!state) { return []; }

    const issues: WorldSanityIssue[] = [];
    if (!input.settlementState) {
        for (const vehicle of state.vehicles) {
            if (!vehicle.mobileBase) { continue; }
            issues.push(makeIssue(
                'warning',
                'mobile_base',
                'settlement_ledger_not_supplied',
                `Mobile base vehicle ${vehicle.id} cannot be link-validated without a settlement ledger.`,
                { kind: 'vehicle', id: vehicle.id },
                [{ kind: 'settlement', id: vehicle.mobileBase.settlementId }],
                'Add settlement_state.json or supply settlement data to the checker.'
            ));
        }
        return issues;
    }

    for (const vehicle of state.vehicles) {
        if (!vehicle.mobileBase) { continue; }
        const result = validateMobileBaseLink(vehicle, input.settlementState);
        if (!result.isMobileBase) { continue; }
        if (!result.ok) {
            for (const reason of result.reasons) {
                if (reason === 'not_a_mobile_base') { continue; }
                issues.push(mobileBaseIssueFromReason(vehicle, reason));
            }
        }
        for (const warning of result.warnings ?? []) {
            issues.push(mobileBaseIssueFromReason(vehicle, warning));
        }
    }
    return issues;
}

function collectRecordIdsByDomain(
    mods: Readonly<Record<string, ParsedModManifest>>,
    enabledModIds: Set<string>
): Map<ModRecordDomain, Set<string>> {
    const byDomain = new Map<ModRecordDomain, Set<string>>();
    for (const modId of enabledModIds) {
        const manifest = mods[modId];
        if (!manifest) { continue; }
        for (const rec of manifest.records) {
            const set = byDomain.get(rec.domain) ?? new Set<string>();
            set.add(rec.id);
            byDomain.set(rec.domain, set);
        }
    }
    return byDomain;
}

function collectAliasRules(
    mods: Readonly<Record<string, ParsedModManifest>>,
    enabledModIds: Set<string>
): ModAliasRule[] {
    const rules: ModAliasRule[] = [];
    for (const modId of enabledModIds) {
        const manifest = mods[modId];
        if (!manifest) { continue; }
        for (const rule of manifest.aliasRules) {
            rules.push(rule);
        }
    }
    return rules;
}

function normalizeAliasCycleKey(cycle: string[]): string {
    const nodes = cycle.length > 1 && cycle[0] === cycle[cycle.length - 1]
        ? cycle.slice(0, -1)
        : cycle.slice();
    if (!nodes.length) { return ''; }
    let best = nodes.join('\0');
    for (let i = 1; i < nodes.length; i++) {
        const rotated = nodes.slice(i).concat(nodes.slice(0, i)).join('\0');
        if (rotated < best) { best = rotated; }
    }
    return best;
}

function detectAliasCycles(rules: ModAliasRule[]): string[][] {
    const cycles: string[][] = [];
    const seen = new Set<string>();
    const domains = new Set(rules.map((r) => r.domain));
    for (const domain of domains) {
        const domainRules = rules.filter((r) => r.domain === domain);
        const graph = new Map<string, string>();
        for (const rule of domainRules) {
            graph.set(rule.fromId, rule.toId);
        }
        const visiting = new Set<string>();
        const visited = new Set<string>();

        function dfs(node: string, stack: string[]): void {
            if (visited.has(node)) { return; }
            if (visiting.has(node)) {
                const start = stack.indexOf(node);
                if (start >= 0) {
                    const cycle = stack.slice(start).concat(node);
                    const key = normalizeAliasCycleKey(cycle);
                    if (key && !seen.has(key)) {
                        seen.add(key);
                        cycles.push(cycle);
                    }
                }
                return;
            }
            visiting.add(node);
            stack.push(node);
            const next = graph.get(node);
            if (next) { dfs(next, stack); }
            stack.pop();
            visiting.delete(node);
            visited.add(node);
        }

        for (const fromId of graph.keys()) {
            dfs(fromId, []);
        }
    }
    return cycles;
}

export function checkModSanity(input: WorldSanityInput): WorldSanityIssue[] {
    const profile = input.modProfile;
    const mods = input.mods;
    if (!profile || !mods) { return []; }

    const issues: WorldSanityIssue[] = [];
    const result = resolveModProfile({ profile, mods });

    for (const dep of result.report.missingDependencies) {
        const severity: WorldSanitySeverity = dep.kind === 'disabled' ? 'warning' : 'error';
        const code = dep.kind === 'cycle'
            ? 'mod_dependency_cycle'
            : dep.kind === 'disabled'
                ? 'mod_disabled_dependency'
                : 'mod_missing_dependency';
        issues.push(makeIssue(
            severity,
            'mod',
            code,
            dep.message,
            { kind: 'mod', id: dep.modId },
            [{ kind: 'mod', id: dep.dependencyModId }]
        ));
    }

    for (const conflict of result.report.conflicts) {
        const isDeclared = conflict.reason === 'declared_conflict';
        issues.push(makeIssue(
            'warning',
            'mod',
            isDeclared ? 'mod_declared_conflict' : 'mod_record_override',
            isDeclared
                ? `Declared conflict: ${conflict.winnerModId} conflicts with ${conflict.overriddenModIds.join(', ')}.`
                : `Record ${conflict.key.domain}/${conflict.key.id}: ${conflict.winnerModId} overrides ${conflict.overriddenModIds.join(', ')}.`,
            { kind: 'mod_record', id: conflict.key.id },
            [
                { kind: 'mod', id: conflict.winnerModId },
                ...conflict.overriddenModIds.map((id) => ({ kind: 'mod', id })),
            ]
        ));
    }

    for (const warning of result.report.loadOrderWarnings) {
        issues.push(makeIssue(
            'warning',
            'mod',
            'mod_similar_id',
            warning,
            { kind: 'mod_profile', id: profile.name }
        ));
    }

    const enabledModIds = new Set(
        profile.enabledMods.filter((e) => e.enabled).map((e) => e.modId)
    );
    const recordIdsByDomain = collectRecordIdsByDomain(mods, enabledModIds);
    const aliasRules = collectAliasRules(mods, enabledModIds);

    for (const rule of aliasRules) {
        const ids = recordIdsByDomain.get(rule.domain);
        if (!ids?.has(rule.toId)) {
            issues.push(makeIssue(
                'warning',
                'mod',
                'mod_alias_missing_target',
                `Alias ${rule.domain}:${rule.fromId} -> ${rule.toId} points to a missing target record.`,
                { kind: 'mod_record', id: rule.fromId },
                [{ kind: 'mod_record', id: rule.toId }]
            ));
        }
    }

    const cycles = detectAliasCycles(aliasRules);
    for (const cycle of cycles) {
        issues.push(makeIssue(
            'error',
            'mod',
            'mod_alias_cycle',
            `Alias cycle in domain: ${cycle.join(' -> ')}.`,
            { kind: 'mod_record', id: cycle[0] },
            cycle.slice(1).map((id) => ({ kind: 'mod_record', id }))
        ));
    }

    return issues;
}

export function checkGameRuleSanity(input: WorldSanityInput): WorldSanityIssue[] {
    const rules = input.gameRules;
    if (!rules) { return []; }

    const issues: WorldSanityIssue[] = [];
    const vehicleOn = rules.enableVehicleSystem === true;
    const settlementOn = rules.enableSettlementMode === true;
    const mobileBaseOn = rules.enableMobileBaseSystem === true;

    if (mobileBaseOn && (!vehicleOn || !settlementOn)) {
        issues.push(makeIssue(
            'warning',
            'game_rules',
            'mobile_base_feature_gate_mismatch',
            'enableMobileBaseSystem is true but enableVehicleSystem or enableSettlementMode is not true.',
            { kind: 'feature_gate', id: 'enableMobileBaseSystem' },
            undefined,
            'Enable vehicle and settlement systems together with mobile base, or disable mobile base.'
        ));
    }

    if (settlementOn && input.settlementState === undefined) {
        issues.push(makeIssue(
            'warning',
            'game_rules',
            'settlement_mode_without_ledger',
            'enableSettlementMode is true but no settlement ledger was supplied to the checker.',
            { kind: 'feature_gate', id: 'enableSettlementMode' }
        ));
    }

    return issues;
}

function ledgerLoadDomain(file: string): WorldSanityDomain {
    if (file === 'vehicle_state.json') { return 'vehicle'; }
    if (file === 'settlement_state.json') { return 'mobile_base'; }
    if (file === 'world_state.json') { return 'world_state'; }
    if (file === 'mod_profile.json' || file.endsWith('/mod_profile.json')) { return 'mod'; }
    if (file === 'game_rules.json') { return 'game_rules'; }
    return 'world_intent';
}

export function checkWorldStateParseCapSanity(input: WorldSanityInput): WorldSanityIssue[] {
    const warnings = input.worldStateParseWarnings;
    if (!warnings?.length) { return []; }

    return warnings.map((warning) => makeIssue(
        'warning',
        'world_state',
        'parse_cap_exceeded',
        formatWorldStateParseWarning(warning),
        { kind: 'world_state_field', id: warning.field },
        undefined,
        'Trim ledger growth or archive old entries; parser silently dropped overflow.'
    ));
}

export function checkLedgerLoadSanity(input: WorldSanityInput): WorldSanityIssue[] {
    if (!input.ledgerLoadIssues?.length) { return []; }
    return input.ledgerLoadIssues.map((issue) => makeIssue(
        'error',
        ledgerLoadDomain(issue.file),
        issue.code,
        issue.message,
        { kind: 'ledger_file', id: issue.file },
        undefined,
        'Fix JSON syntax or restore from backup before running migration or turn ops.'
    ));
}

export function checkWorldIntentSanity(input: WorldSanityInput): WorldSanityIssue[] {
    const raw = input.rawConfig?.vehicleBridgeMode;
    if (raw === undefined) { return []; }

    const parsed = parseVehicleWorldIntentBridgeMode(raw);
    if (parsed !== undefined) { return []; }

    const display = typeof raw === 'string' ? raw : typeof raw;
    return [
        makeIssue(
            'warning',
            'world_intent',
            'invalid_bridge_mode',
            `textAdventure.worldIntent.vehicleBridgeMode value "${display}" is not off, shadow, or compare_only.`,
            { kind: 'config', id: 'vehicleBridgeMode' },
            undefined,
            'Use off, shadow, or compare_only until a later gate approves additional modes.'
        ),
    ];
}

export function buildWorldSanityReport(
    input: WorldSanityInput,
    options?: BuildWorldSanityReportOptions
): WorldSanityReport {
    const maxIssues = options?.maxIssues ?? MAX_WORLD_SANITY_ISSUES;
    const collected = [
        ...checkLedgerLoadSanity(input),
        ...checkGameRuleSanity(input),
        ...checkVehicleRawParseSanity(input),
        ...checkVehicleSanity(input),
        ...checkMobileBaseSanity(input),
        ...checkWorldStateParseCapSanity(input),
        ...checkModSanity(input),
        ...checkWorldIntentSanity(input),
    ];
    const sorted = sortIssues(collected);
    const truncated = sorted.length > maxIssues;
    const issues = sorted.slice(0, maxIssues);
    const counts = countBySeverity(issues);

    return {
        version: WORLD_SANITY_REPORT_VERSION,
        ok: counts.errorCount === 0,
        issueCount: issues.length,
        ...counts,
        issues,
        truncated: truncated || undefined,
    };
}