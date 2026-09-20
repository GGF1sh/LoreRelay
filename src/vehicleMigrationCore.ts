// World Intent WI6: vehicle_state ledger migration pilot (pure, no I/O).

import {
    migrateLedgerDocument,
    probeNumericVersion,
    type LedgerMigrationResult,
    type LedgerMigrationStep,
} from './ledgerMigrationCore';
import { parseVehicleState, VEHICLE_STATE_VERSION } from './vehicleCore';

export const VEHICLE_STATE_LEDGER = 'vehicle_state' as const;
export const VEHICLE_STATE_TARGET_VERSION = VEHICLE_STATE_VERSION;

function migrateVehicleStateV0ToV1(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { version: VEHICLE_STATE_TARGET_VERSION, vehicles: [] };
    }
    const record = raw as Record<string, unknown>;
    const out: Record<string, unknown> = { ...record, version: VEHICLE_STATE_TARGET_VERSION };
    if (!Array.isArray(out.vehicles)) {
        out.vehicles = Array.isArray(record.vehicles) ? record.vehicles : [];
    }
    return out;
}

export const VEHICLE_STATE_MIGRATION_STEPS: readonly LedgerMigrationStep[] = [
    {
        ledger: VEHICLE_STATE_LEDGER,
        fromVersion: 0,
        toVersion: VEHICLE_STATE_TARGET_VERSION,
        migrate: migrateVehicleStateV0ToV1,
    },
];

export function getVehicleStateDocumentVersion(raw: unknown): number | undefined {
    const probe = probeNumericVersion(raw, ['version']);
    if (probe.status === 'missing') { return 0; }
    if (probe.status === 'invalid') { return undefined; }
    return probe.value;
}

function validateVehicleStateDocument(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return false; }
    const record = raw as Record<string, unknown>;
    if (record.version !== VEHICLE_STATE_TARGET_VERSION) { return false; }
    if (!Array.isArray(record.vehicles)) { return false; }
    const parsed = parseVehicleState(raw);
    return parsed.version === VEHICLE_STATE_TARGET_VERSION;
}

/** Dry-run migrate a raw vehicle_state document toward the canonical parser version. */
export function migrateVehicleStateDocument(raw: unknown): LedgerMigrationResult {
    return migrateLedgerDocument({
        ledger: VEHICLE_STATE_LEDGER,
        raw,
        targetVersion: VEHICLE_STATE_TARGET_VERSION,
        steps: VEHICLE_STATE_MIGRATION_STEPS,
        versionFields: ['version'],
        treatMissingVersionAs: 0,
        getVersion: getVehicleStateDocumentVersion,
        validate: validateVehicleStateDocument,
    });
}