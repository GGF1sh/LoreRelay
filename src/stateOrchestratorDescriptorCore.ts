// State Orchestrator SO1: pure ledger write-surface descriptor inventory (no I/O, no writes).

export const STATE_ORCHESTRATOR_DESCRIPTOR_VERSION = 1 as const;
export const MAX_STATE_ORCHESTRATOR_DESCRIPTOR_ISSUES = 64;

export type LedgerWriteOwner =
    | 'game_state'
    | 'world_state'
    | 'discovery'
    | 'campaign_resources'
    | 'settlement_layout'
    | 'vehicle_state'
    | 'npc_registry'
    | 'character'
    | 'party'
    | 'migration'
    | 'settings'
    | 'session'
    | 'other';

export type LedgerWritePhase =
    | 'gm_turn_primary'
    | 'gm_turn_secondary'
    | 'simulation_tick'
    | 'user_command'
    | 'migration_command'
    | 'import_export'
    | 'background_async';

export type LedgerFailurePolicy =
    | 'abort_before_commit'
    | 'retain_primary_report_partial'
    | 'skip_and_warn'
    | 'best_effort'
    | 'queue_retry'
    | 'manual_reconcile';

export interface LedgerDescriptor {
    id: string;
    owner: LedgerWriteOwner;
    fileNamePattern: string;
    /** Workspace-relative physical resource (e.g. vehicle_state.json). */
    resourceKey?: string;
    /** Logical coordination domain for writers targeting the same resourceKey. */
    coordinationDomain?: string;
    /** Manual/exception path — may write resourceKey without serializedQueue. */
    coordinationExempt?: boolean;
    phase: LedgerWritePhase;
    canonicalModule: string;
    atomicWrite: boolean;
    serializedQueue?: string;
    participatesInTurnLedgerOrder: boolean;
    turnLedgerOrderKey?: string;
    failurePolicy: LedgerFailurePolicy;
    backupPolicy: 'none' | 'optional_bak' | 'strict_timestamped';
    circuitBreaker: 'none' | 'game_state' | 'world_state';
    notes?: string;
}

export type StateOrchestratorDescriptorSeverity = 'info' | 'warning' | 'error';

export interface StateOrchestratorDescriptorIssue {
    severity: StateOrchestratorDescriptorSeverity;
    code: string;
    descriptorId?: string;
    message: string;
}

export interface StateOrchestratorDescriptorReport {
    version: typeof STATE_ORCHESTRATOR_DESCRIPTOR_VERSION;
    descriptorCount: number;
    issues: StateOrchestratorDescriptorIssue[];
}

export const KNOWN_LEDGER_QUEUE_NAMES: Readonly<Record<string, string>> = {
    game_state: 'runSerializedGameStateMutation',
    world_state: 'runSerializedWorldStateMutation',
    discoveries: 'runSerializedDiscoveryMutation',
    campaign_resources: 'runSerializedCampaignResourcesMutation',
    settlement_layout: 'runSerializedSettlementLayoutMutation',
    vehicle_state: 'runSerializedVehicleStateMutation',
};

export const LEDGER_DESCRIPTORS: readonly LedgerDescriptor[] = [
    {
        id: 'game_state',
        owner: 'game_state',
        fileNamePattern: 'game_state.json',
        phase: 'gm_turn_primary',
        canonicalModule: 'stateManager.ts',
        atomicWrite: true,
        serializedQueue: KNOWN_LEDGER_QUEUE_NAMES.game_state,
        participatesInTurnLedgerOrder: true,
        turnLedgerOrderKey: 'game_state',
        failurePolicy: 'abort_before_commit',
        backupPolicy: 'optional_bak',
        circuitBreaker: 'game_state',
        notes: 'Primary GM turn commit; side ledgers gate on successful game_state write.',
    },
    {
        id: 'discoveries',
        owner: 'discovery',
        fileNamePattern: 'discoveries.json',
        phase: 'gm_turn_secondary',
        canonicalModule: 'discoveryTurnOps.ts',
        atomicWrite: true,
        serializedQueue: KNOWN_LEDGER_QUEUE_NAMES.discoveries,
        participatesInTurnLedgerOrder: true,
        turnLedgerOrderKey: 'discoveries',
        failurePolicy: 'retain_primary_report_partial',
        backupPolicy: 'none',
        circuitBreaker: 'none',
        notes: 'Campaign Kit discovery ledger; persists after game_state commit.',
    },
    {
        id: 'campaign_resources',
        owner: 'campaign_resources',
        fileNamePattern: 'campaign_resources.json',
        phase: 'gm_turn_secondary',
        canonicalModule: 'campaignResourceTurnOps.ts',
        atomicWrite: true,
        serializedQueue: KNOWN_LEDGER_QUEUE_NAMES.campaign_resources,
        participatesInTurnLedgerOrder: true,
        turnLedgerOrderKey: 'campaign_resources',
        failurePolicy: 'retain_primary_report_partial',
        backupPolicy: 'none',
        circuitBreaker: 'none',
    },
    {
        id: 'settlement_layout',
        owner: 'settlement_layout',
        fileNamePattern: 'settlement_layout.json',
        phase: 'gm_turn_secondary',
        canonicalModule: 'settlementLayoutTurnOps.ts',
        atomicWrite: true,
        serializedQueue: KNOWN_LEDGER_QUEUE_NAMES.settlement_layout,
        participatesInTurnLedgerOrder: true,
        turnLedgerOrderKey: 'settlement_layout',
        failurePolicy: 'retain_primary_report_partial',
        backupPolicy: 'none',
        circuitBreaker: 'none',
    },
    {
        id: 'vehicle_state',
        owner: 'vehicle_state',
        fileNamePattern: 'vehicle_state.json',
        resourceKey: 'vehicle_state.json',
        coordinationDomain: 'vehicle_state',
        phase: 'gm_turn_secondary',
        canonicalModule: 'vehicleTurnOps.ts',
        atomicWrite: true,
        serializedQueue: KNOWN_LEDGER_QUEUE_NAMES.vehicle_state,
        participatesInTurnLedgerOrder: true,
        turnLedgerOrderKey: 'vehicle_state',
        failurePolicy: 'retain_primary_report_partial',
        backupPolicy: 'none',
        circuitBreaker: 'none',
        notes: 'Primary vehicle turn_result.vehicleOps writer; shares queue with mobile_base_vehicle_turn_ops.',
    },
    {
        id: 'mobile_base_vehicle_turn_ops',
        owner: 'vehicle_state',
        fileNamePattern: 'vehicle_state.json',
        resourceKey: 'vehicle_state.json',
        coordinationDomain: 'vehicle_state',
        phase: 'gm_turn_secondary',
        canonicalModule: 'mobileBaseTurnOps.ts',
        atomicWrite: true,
        serializedQueue: KNOWN_LEDGER_QUEUE_NAMES.vehicle_state,
        participatesInTurnLedgerOrder: false,
        failurePolicy: 'retain_primary_report_partial',
        backupPolicy: 'none',
        circuitBreaker: 'none',
        notes: 'turn_result.mobileBaseOps writer; same serialized queue as vehicleTurnOps.',
    },
    {
        id: 'world_state',
        owner: 'world_state',
        fileNamePattern: 'world_state.json',
        phase: 'simulation_tick',
        canonicalModule: 'worldState.ts',
        atomicWrite: true,
        serializedQueue: KNOWN_LEDGER_QUEUE_NAMES.world_state,
        participatesInTurnLedgerOrder: false,
        failurePolicy: 'skip_and_warn',
        backupPolicy: 'optional_bak',
        circuitBreaker: 'world_state',
        notes: 'Living World / observer tick writes; not part of GM turn ledger persist order.',
    },
    {
        id: 'npc_registry',
        owner: 'npc_registry',
        fileNamePattern: 'npc_registry.json',
        phase: 'background_async',
        canonicalModule: 'npcRegistry.ts',
        atomicWrite: true,
        participatesInTurnLedgerOrder: false,
        failurePolicy: 'best_effort',
        backupPolicy: 'none',
        circuitBreaker: 'none',
    },
    {
        id: 'migration_vehicle_writeback',
        owner: 'migration',
        fileNamePattern: 'vehicle_state.json',
        resourceKey: 'vehicle_state.json',
        coordinationDomain: 'vehicle_state',
        phase: 'migration_command',
        canonicalModule: 'ledgerMigrationWritebackRunner.ts',
        atomicWrite: true,
        serializedQueue: KNOWN_LEDGER_QUEUE_NAMES.vehicle_state,
        participatesInTurnLedgerOrder: false,
        failurePolicy: 'manual_reconcile',
        backupPolicy: 'strict_timestamped',
        circuitBreaker: 'none',
        notes: 'WI7 explicit v0->v1 write-back; strict backup/write/reload shares the vehicle queue.',
    },
    {
        id: 'migration_vehicle_restore',
        owner: 'migration',
        fileNamePattern: 'vehicle_state.json',
        resourceKey: 'vehicle_state.json',
        coordinationDomain: 'vehicle_state',
        phase: 'migration_command',
        canonicalModule: 'ledgerMigrationRestoreRunner.ts',
        atomicWrite: true,
        serializedQueue: KNOWN_LEDGER_QUEUE_NAMES.vehicle_state,
        participatesInTurnLedgerOrder: false,
        failurePolicy: 'manual_reconcile',
        backupPolicy: 'strict_timestamped',
        circuitBreaker: 'none',
        notes: 'WI7b complete-document restore; pre-backup/write/reload shares the vehicle queue.',
    },
];

function pushIssue(
    issues: StateOrchestratorDescriptorIssue[],
    issue: StateOrchestratorDescriptorIssue
): void {
    if (issues.length >= MAX_STATE_ORCHESTRATOR_DESCRIPTOR_ISSUES) { return; }
    issues.push(issue);
}

function isNonEmptyBounded(value: string, maxLen: number): boolean {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= maxLen;
}

export function validateDescriptorShape(
    descriptors: readonly LedgerDescriptor[]
): StateOrchestratorDescriptorIssue[] {
    const issues: StateOrchestratorDescriptorIssue[] = [];
    const seenIds = new Set<string>();

    for (const descriptor of descriptors) {
        if (!isNonEmptyBounded(descriptor.id, 64)) {
            pushIssue(issues, {
                severity: 'error',
                code: 'invalid_descriptor_id',
                descriptorId: descriptor.id,
                message: 'Descriptor id must be a non-empty bounded string.',
            });
        } else if (seenIds.has(descriptor.id)) {
            pushIssue(issues, {
                severity: 'error',
                code: 'duplicate_descriptor_id',
                descriptorId: descriptor.id,
                message: `Duplicate descriptor id "${descriptor.id}".`,
            });
        } else {
            seenIds.add(descriptor.id);
        }

        if (!isNonEmptyBounded(descriptor.fileNamePattern, 120)) {
            pushIssue(issues, {
                severity: 'error',
                code: 'invalid_file_name_pattern',
                descriptorId: descriptor.id,
                message: 'Descriptor fileNamePattern must be non-empty and bounded.',
            });
        }
        if (!isNonEmptyBounded(descriptor.canonicalModule, 120)) {
            pushIssue(issues, {
                severity: 'error',
                code: 'invalid_canonical_module',
                descriptorId: descriptor.id,
                message: 'Descriptor canonicalModule must be non-empty and bounded.',
            });
        }
        if (descriptor.participatesInTurnLedgerOrder && !descriptor.turnLedgerOrderKey) {
            pushIssue(issues, {
                severity: 'error',
                code: 'missing_turn_ledger_order_key',
                descriptorId: descriptor.id,
                message: 'Turn-order participant is missing turnLedgerOrderKey.',
            });
        }
        if (!descriptor.participatesInTurnLedgerOrder && descriptor.turnLedgerOrderKey) {
            pushIssue(issues, {
                severity: 'warning',
                code: 'unexpected_turn_ledger_order_key',
                descriptorId: descriptor.id,
                message: 'Non-participant descriptor should not define turnLedgerOrderKey.',
            });
        }
    }

    return issues;
}

export function checkTurnLedgerDescriptorOrder(input: {
    descriptors: readonly LedgerDescriptor[];
    turnOrder: readonly string[];
}): StateOrchestratorDescriptorIssue[] {
    const issues: StateOrchestratorDescriptorIssue[] = [];
    const participants = input.descriptors.filter((d) => d.participatesInTurnLedgerOrder);
    const keyToDescriptor = new Map<string, LedgerDescriptor>();

    for (const descriptor of participants) {
        const key = descriptor.turnLedgerOrderKey;
        if (!key) {
            pushIssue(issues, {
                severity: 'error',
                code: 'missing_turn_ledger_order_key',
                descriptorId: descriptor.id,
                message: 'Turn-order participant is missing turnLedgerOrderKey.',
            });
            continue;
        }
        if (keyToDescriptor.has(key)) {
            pushIssue(issues, {
                severity: 'error',
                code: 'duplicate_turn_order_key',
                descriptorId: descriptor.id,
                message: `Duplicate turn ledger order key "${key}".`,
            });
        } else {
            keyToDescriptor.set(key, descriptor);
        }
    }

    const turnOrder = [...input.turnOrder];
    const seenTurnKeys = new Set<string>();
    for (const key of turnOrder) {
        if (seenTurnKeys.has(key)) {
            pushIssue(issues, {
                severity: 'error',
                code: 'duplicate_turn_order_key',
                message: `Duplicate key "${key}" in turn ledger persist order.`,
            });
        } else {
            seenTurnKeys.add(key);
        }
        if (!keyToDescriptor.has(key)) {
            pushIssue(issues, {
                severity: 'error',
                code: 'turn_order_key_without_descriptor',
                message: `Turn ledger order key "${key}" has no descriptor.`,
            });
        }
    }

    for (const descriptor of participants) {
        const key = descriptor.turnLedgerOrderKey;
        if (key && !turnOrder.includes(key)) {
            pushIssue(issues, {
                severity: 'error',
                code: 'descriptor_key_not_in_turn_order',
                descriptorId: descriptor.id,
                message: `Descriptor turnLedgerOrderKey "${key}" is absent from turn order.`,
            });
        }
    }

    const descriptorOrder = participants
        .map((d) => d.turnLedgerOrderKey)
        .filter((key): key is string => typeof key === 'string');
    const filteredTurnOrder = turnOrder.filter((key) => keyToDescriptor.has(key));
    if (descriptorOrder.join('|') !== filteredTurnOrder.join('|')) {
        pushIssue(issues, {
            severity: 'error',
            code: 'turn_order_sequence_mismatch',
            message: 'Descriptor turn-order sequence disagrees with TURN_LEDGER_PERSIST_ORDER.',
        });
    }

    return issues;
}

export function checkPhysicalResourceCoordination(
    descriptors: readonly LedgerDescriptor[]
): StateOrchestratorDescriptorIssue[] {
    const issues: StateOrchestratorDescriptorIssue[] = [];
    const byResource = new Map<string, LedgerDescriptor[]>();

    for (const descriptor of descriptors) {
        if (!descriptor.resourceKey) { continue; }
        const bucket = byResource.get(descriptor.resourceKey);
        if (bucket) { bucket.push(descriptor); } else { byResource.set(descriptor.resourceKey, [descriptor]); }
    }

    for (const [resourceKey, group] of byResource) {
        if (group.length <= 1) { continue; }
        const queued = group.filter((d) => !!d.serializedQueue);
        const unqueued = group.filter((d) => !d.serializedQueue);
        if (queued.length === 0 || unqueued.length === 0) { continue; }

        const unqueuedExempt = unqueued.every((d) => d.coordinationExempt === true);
        if (unqueuedExempt) { continue; }

        for (const descriptor of unqueued) {
            pushIssue(issues, {
                severity: 'error',
                code: 'mixed_physical_resource_coordination',
                descriptorId: descriptor.id,
                message:
                    `Descriptor "${descriptor.id}" writes "${resourceKey}" without a serialized queue `
                    + `while other writers use queue coordination.`,
            });
        }
    }

    return issues;
}

export function checkLedgerQueueDescriptors(
    descriptors: readonly LedgerDescriptor[]
): StateOrchestratorDescriptorIssue[] {
    const issues: StateOrchestratorDescriptorIssue[] = [];
    for (const [ledgerKey, queueName] of Object.entries(KNOWN_LEDGER_QUEUE_NAMES)) {
        const matches = descriptors.filter((d) => d.serializedQueue === queueName);
        if (matches.length === 0) {
            pushIssue(issues, {
                severity: 'error',
                code: 'missing_queue_descriptor',
                message: `No descriptor lists queue "${queueName}" for ledger "${ledgerKey}".`,
            });
        }
    }
    return issues;
}

export function buildStateOrchestratorDescriptorReport(input?: {
    descriptors?: readonly LedgerDescriptor[];
    turnOrder?: readonly string[];
}): StateOrchestratorDescriptorReport {
    const descriptors = input?.descriptors ?? LEDGER_DESCRIPTORS;
    const issues: StateOrchestratorDescriptorIssue[] = [
        ...validateDescriptorShape(descriptors),
    ];

    if (input?.turnOrder) {
        issues.push(...checkTurnLedgerDescriptorOrder({
            descriptors,
            turnOrder: input.turnOrder,
        }));
    }

    issues.push(...checkLedgerQueueDescriptors(descriptors));
    issues.push(...checkPhysicalResourceCoordination(descriptors));

    const bounded = issues.slice(0, MAX_STATE_ORCHESTRATOR_DESCRIPTOR_ISSUES);
    return {
        version: STATE_ORCHESTRATOR_DESCRIPTOR_VERSION,
        descriptorCount: descriptors.length,
        issues: bounded,
    };
}

export function formatStateOrchestratorDescriptorLines(
    report: StateOrchestratorDescriptorReport,
    descriptors: readonly LedgerDescriptor[] = LEDGER_DESCRIPTORS
): string[] {
    const lines = [
        'LoreRelay State Orchestrator Descriptor Inventory',
        `Descriptors: ${report.descriptorCount}`,
        `Issues: ${report.issues.length}`,
    ];
    for (const descriptor of descriptors) {
        const queue = descriptor.serializedQueue ? ` queue:${descriptor.serializedQueue}` : '';
        const turn = descriptor.turnLedgerOrderKey ? ` turn:${descriptor.turnLedgerOrderKey}` : '';
        lines.push(
            `${descriptor.id.padEnd(28)}${descriptor.phase.padEnd(20)}${descriptor.failurePolicy}${queue}${turn}`
        );
    }
    if (report.issues.length > 0) {
        lines.push('');
        for (const issue of report.issues) {
            const prefix = issue.descriptorId ? `${issue.descriptorId} ` : '';
            lines.push(`${prefix}${issue.severity} ${issue.code}`);
        }
    }
    return lines;
}
