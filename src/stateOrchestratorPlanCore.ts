// State Orchestrator SO2: pure GM-turn transaction planning (no I/O, no writes).

import {
    LEDGER_DESCRIPTORS,
    type LedgerDescriptor,
    type LedgerFailurePolicy,
    type LedgerWriteOwner,
    type LedgerWritePhase,
} from './stateOrchestratorDescriptorCore';
import { TURN_LEDGER_PERSIST_ORDER } from './turnLedgerPersistCore';

export const STATE_TRANSACTION_PLAN_VERSION = 1 as const;
export const MAX_STATE_TRANSACTION_PLAN_WARNINGS = 16;

export type StateTransactionPlanKind =
    | 'gm_turn'
    | 'migration_command'
    | 'simulation_tick'
    | 'diagnostic';

export type StateTransactionPlanStepStatus =
    | 'planned'
    | 'skipped_no_ops'
    | 'blocked_by_primary_failure'
    | 'out_of_scope';

export interface StateTransactionPlanRequest {
    kind: StateTransactionPlanKind;
    commitGameStatePlanned: boolean;
    discoveryOpsPresent?: boolean;
    campaignResourceOpsPresent?: boolean;
    settlementLayoutOpsPresent?: boolean;
    vehicleOpsPresent?: boolean;
}

export interface StateTransactionPlanStep {
    order: number;
    ledgerId: string;
    turnLedgerOrderKey?: string;
    fileNamePattern: string;
    owner: LedgerWriteOwner;
    phase: LedgerWritePhase;
    canonicalModule: string;
    queue?: string;
    atomicWrite: boolean;
    backupPolicy: LedgerDescriptor['backupPolicy'];
    failurePolicy: LedgerFailurePolicy;
    circuitBreaker: LedgerDescriptor['circuitBreaker'];
    status: StateTransactionPlanStepStatus;
    reasonCode: string;
}

export interface StateTransactionPlanWarning {
    code: string;
    message: string;
    ledgerId?: string;
}

export interface StateTransactionPlan {
    version: typeof STATE_TRANSACTION_PLAN_VERSION;
    kind: StateTransactionPlanKind;
    orderSource: 'TURN_LEDGER_PERSIST_ORDER';
    primaryLedgerId: 'game_state';
    steps: StateTransactionPlanStep[];
    outOfScopeDescriptorIds: string[];
    warnings: StateTransactionPlanWarning[];
}

function pushWarning(
    warnings: StateTransactionPlanWarning[],
    warning: StateTransactionPlanWarning
): void {
    if (warnings.length >= MAX_STATE_TRANSACTION_PLAN_WARNINGS) {
        return;
    }
    warnings.push(warning);
}

function descriptorByTurnOrderKey(
    descriptors: readonly LedgerDescriptor[]
): Map<string, LedgerDescriptor> {
    const map = new Map<string, LedgerDescriptor>();
    for (const descriptor of descriptors) {
        const key = descriptor.turnLedgerOrderKey;
        if (!key || map.has(key)) {
            continue;
        }
        map.set(key, descriptor);
    }
    return map;
}

function sideOpsPresent(key: string, request: StateTransactionPlanRequest): boolean {
    switch (key) {
        case 'discoveries':
            return request.discoveryOpsPresent === true;
        case 'campaign_resources':
            return request.campaignResourceOpsPresent === true;
        case 'settlement_layout':
            return request.settlementLayoutOpsPresent === true;
        case 'vehicle_state':
            return request.vehicleOpsPresent === true;
        default:
            return false;
    }
}

function resolveGmTurnStepStatus(
    turnLedgerOrderKey: string,
    request: StateTransactionPlanRequest
): { status: StateTransactionPlanStepStatus; reasonCode: string } {
    if (turnLedgerOrderKey === 'game_state') {
        if (request.commitGameStatePlanned) {
            return { status: 'planned', reasonCode: 'primary_commit_planned' };
        }
        return { status: 'skipped_no_ops', reasonCode: 'primary_commit_not_planned' };
    }

    if (!request.commitGameStatePlanned) {
        return { status: 'blocked_by_primary_failure', reasonCode: 'awaiting_primary_commit' };
    }

    if (sideOpsPresent(turnLedgerOrderKey, request)) {
        return { status: 'planned', reasonCode: 'side_ops_present' };
    }

    return { status: 'skipped_no_ops', reasonCode: 'no_side_ops' };
}

function buildPlanStep(
    descriptor: LedgerDescriptor,
    order: number,
    request: StateTransactionPlanRequest
): StateTransactionPlanStep {
    const turnLedgerOrderKey = descriptor.turnLedgerOrderKey;
    const resolved = turnLedgerOrderKey
        ? resolveGmTurnStepStatus(turnLedgerOrderKey, request)
        : { status: 'out_of_scope' as const, reasonCode: 'not_in_turn_order' };

    return {
        order,
        ledgerId: descriptor.id,
        turnLedgerOrderKey,
        fileNamePattern: descriptor.fileNamePattern,
        owner: descriptor.owner,
        phase: descriptor.phase,
        canonicalModule: descriptor.canonicalModule,
        queue: descriptor.serializedQueue,
        atomicWrite: descriptor.atomicWrite,
        backupPolicy: descriptor.backupPolicy,
        failurePolicy: descriptor.failurePolicy,
        circuitBreaker: descriptor.circuitBreaker,
        status: resolved.status,
        reasonCode: resolved.reasonCode,
    };
}

function collectDescriptorWarnings(
    descriptors: readonly LedgerDescriptor[],
    turnOrder: readonly string[],
    warnings: StateTransactionPlanWarning[]
): string[] {
    const outOfScope: string[] = [];
    const turnKeySet = new Set(turnOrder);

    if (turnOrder[0] !== 'game_state') {
        pushWarning(warnings, {
            code: 'primary_not_first',
            message: 'TURN_LEDGER_PERSIST_ORDER must start with game_state.',
        });
    }

    for (const key of turnOrder) {
        const matches = descriptors.filter((d) => d.turnLedgerOrderKey === key);
        if (matches.length === 0) {
            pushWarning(warnings, {
                code: 'missing_descriptor',
                message: `No descriptor found for turn ledger order key "${key}".`,
                ledgerId: key,
            });
        }
    }

    for (const descriptor of descriptors) {
        if (!descriptor.participatesInTurnLedgerOrder) {
            outOfScope.push(descriptor.id);
            continue;
        }
        const key = descriptor.turnLedgerOrderKey;
        if (key && !turnKeySet.has(key)) {
            pushWarning(warnings, {
                code: 'descriptor_not_in_turn_order',
                message: `Descriptor "${descriptor.id}" participates in turn order but key "${key}" is absent from TURN_LEDGER_PERSIST_ORDER.`,
                ledgerId: descriptor.id,
            });
        }
    }

    return outOfScope;
}

export function buildStateTransactionPlan(
    request: StateTransactionPlanRequest,
    options?: {
        descriptors?: readonly LedgerDescriptor[];
        turnOrder?: readonly string[];
    }
): StateTransactionPlan {
    const descriptors = options?.descriptors ?? LEDGER_DESCRIPTORS;
    const turnOrder = options?.turnOrder ?? TURN_LEDGER_PERSIST_ORDER;
    const warnings: StateTransactionPlanWarning[] = [];

    if (request.kind !== 'gm_turn') {
        pushWarning(warnings, {
            code: 'unknown_kind',
            message: `Plan kind "${request.kind}" is not implemented in SO2; only gm_turn is supported.`,
        });
        return {
            version: STATE_TRANSACTION_PLAN_VERSION,
            kind: request.kind,
            orderSource: 'TURN_LEDGER_PERSIST_ORDER',
            primaryLedgerId: 'game_state',
            steps: [],
            outOfScopeDescriptorIds: collectDescriptorWarnings(descriptors, turnOrder, warnings),
            warnings,
        };
    }

    const outOfScopeDescriptorIds = collectDescriptorWarnings(descriptors, turnOrder, warnings);
    const descriptorMap = descriptorByTurnOrderKey(descriptors);
    const steps: StateTransactionPlanStep[] = [];
    let order = 1;

    for (const key of turnOrder) {
        const descriptor = descriptorMap.get(key);
        if (!descriptor) {
            continue;
        }

        const step = buildPlanStep(descriptor, order, request);
        steps.push(step);
        order += 1;

        if (step.status === 'blocked_by_primary_failure') {
            pushWarning(warnings, {
                code: 'side_ledger_blocked',
                message: `Side ledger "${descriptor.id}" would wait for successful game_state commit.`,
                ledgerId: descriptor.id,
            });
        }
    }

    return {
        version: STATE_TRANSACTION_PLAN_VERSION,
        kind: request.kind,
        orderSource: 'TURN_LEDGER_PERSIST_ORDER',
        primaryLedgerId: 'game_state',
        steps,
        outOfScopeDescriptorIds,
        warnings,
    };
}

export function formatStateTransactionPlanLines(plan: StateTransactionPlan): string[] {
    const lines = [
        'LoreRelay State Orchestrator Transaction Plan',
        `Kind: ${plan.kind}`,
        `Order source: ${plan.orderSource}`,
        `Steps: ${plan.steps.length}`,
        `Warnings: ${plan.warnings.length}`,
    ];

    for (const step of plan.steps) {
        const queue = step.queue ? ` queue:${step.queue}` : '';
        lines.push(
            `${String(step.order).padStart(2, '0')} ${step.ledgerId.padEnd(24)}`
            + `${step.status.padEnd(28)}${step.failurePolicy}${queue}`
        );
    }

    if (plan.outOfScopeDescriptorIds.length > 0) {
        lines.push('');
        lines.push(`Out of scope: ${plan.outOfScopeDescriptorIds.join(', ')}`);
    }

    if (plan.warnings.length > 0) {
        lines.push('');
        for (const warning of plan.warnings) {
            const prefix = warning.ledgerId ? `${warning.ledgerId} ` : '';
            lines.push(`${prefix}${warning.code}: ${warning.message}`);
        }
    }

    return lines;
}

/** Mirror runtime side-ledger attempt booleans for parity tests. */
export function resolvePlannedLedgerAttempts(plan: StateTransactionPlan): {
    discoveryAttempted: boolean;
    campaignResourcesAttempted: boolean;
    settlementLayoutAttempted: boolean;
    vehicleStateAttempted: boolean;
} {
    const byKey = new Map(
        plan.steps
            .filter((step) => step.status === 'planned' && step.turnLedgerOrderKey)
            .map((step) => [step.turnLedgerOrderKey as string, true])
    );
    return {
        discoveryAttempted: byKey.has('discoveries'),
        campaignResourcesAttempted: byKey.has('campaign_resources'),
        settlementLayoutAttempted: byKey.has('settlement_layout'),
        vehicleStateAttempted: byKey.has('vehicle_state'),
    };
}