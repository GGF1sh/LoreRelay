/**
 * SETTLEMENT-MULTI-LOCATION-001-PRE2
 * Thin host adapter: read-only FS inspection + parse + pure resolve.
 * Does not write, migrate, cache, or wire World View.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    parseSettlementLayout,
    parseSettlementState,
    type SettlementLayoutV1,
    type SettlementStateV1,
} from './settlementCore';
import { CHARACTER_ID_PATTERN } from './characterId';
import {
    buildFixedSettlementDocumentPaths,
    buildMobileBaseSettlementDocumentPaths,
    SETTLEMENT_LAYOUT_BASENAME,
    SETTLEMENT_STATE_BASENAME,
} from './settlementLocationPathCore';
import {
    mapPathValidationCode,
    resolveFixedSettlementFromFacts,
    resolveMobileBaseSettlementFromFacts,
    type ResolvedSettlementDocuments,
    type SettlementDocumentResolveErrorCode,
    type SettlementLayoutLoad,
    type SettlementStateLoad,
} from './settlementLocationResolveCore';

export type {
    ResolvedSettlementDocuments,
    SettlementDocumentResolveErrorCode,
    SettlementDocumentSource,
} from './settlementLocationResolveCore';

export interface SettlementResolveFsDeps {
    fileExists: (filePath: string) => boolean;
    readFileUtf8: (filePath: string) => string;
}

export const defaultSettlementResolveFsDeps: SettlementResolveFsDeps = {
    fileExists: (filePath) => fs.existsSync(filePath),
    readFileUtf8: (filePath) => fs.readFileSync(filePath, 'utf-8'),
};

export interface ResolveFixedSettlementDocumentsInput {
    workspaceRoot: string;
    requestedLocationId: unknown;
    forgeLocationIds: ReadonlySet<string>;
    /** Used only to detect legacy root ownership by mobile base. */
    activeMobileBaseSettlementId?: string;
}

export interface ResolveMobileBaseSettlementDocumentsInput {
    workspaceRoot: string;
    activeMobileBaseSettlementId: unknown;
}

function loadState(filePath: string, deps: SettlementResolveFsDeps): SettlementStateLoad {
    if (!deps.fileExists(filePath)) {
        return { status: 'missing' };
    }
    let rawText: string;
    try {
        rawText = deps.readFileUtf8(filePath);
    } catch {
        return { status: 'read_failed' };
    }
    let raw: unknown;
    try {
        raw = JSON.parse(rawText);
    } catch {
        return { status: 'invalid_parse' };
    }
    const parsed = parseSettlementState(raw);
    if (!parsed) {
        return { status: 'invalid_parse' };
    }
    return { status: 'ok', value: parsed };
}

function loadLayout(filePath: string, deps: SettlementResolveFsDeps): SettlementLayoutLoad {
    if (!deps.fileExists(filePath)) {
        return { status: 'missing' };
    }
    let rawText: string;
    try {
        rawText = deps.readFileUtf8(filePath);
    } catch {
        return { status: 'read_failed' };
    }
    let raw: unknown;
    try {
        raw = JSON.parse(rawText);
    } catch {
        return { status: 'invalid_parse' };
    }
    const parsed = parseSettlementLayout(raw);
    if (!parsed) {
        return { status: 'invalid_parse' };
    }
    return { status: 'ok', value: parsed };
}

function anyExists(deps: SettlementResolveFsDeps, ...paths: string[]): boolean {
    return paths.some((p) => deps.fileExists(p));
}

function isNonEmptySettlementId(raw: unknown): raw is string {
    return typeof raw === 'string'
        && raw.length > 0
        && CHARACTER_ID_PATTERN.test(raw);
}

/**
 * Read-only fixed settlement resolution (scoped multi-location, then restricted legacy).
 */
export function resolveFixedSettlementDocuments(
    input: ResolveFixedSettlementDocumentsInput,
    deps: SettlementResolveFsDeps = defaultSettlementResolveFsDeps
): ResolvedSettlementDocuments {
    const paths = buildFixedSettlementDocumentPaths(
        input.workspaceRoot,
        input.requestedLocationId,
        input.forgeLocationIds
    );
    if (!paths.ok) {
        return { ok: false, code: mapPathValidationCode(paths.code) };
    }
    if (paths.kind !== 'fixed') {
        return { ok: false, code: 'invalid_location_id' };
    }

    const legacyStatePath = path.resolve(input.workspaceRoot, SETTLEMENT_STATE_BASENAME);
    const legacyLayoutPath = path.resolve(input.workspaceRoot, SETTLEMENT_LAYOUT_BASENAME);

    const scopedState = loadState(paths.statePath, deps);
    const scopedLayout = loadLayout(paths.layoutPath, deps);
    const scopedAnyFileExists = anyExists(deps, paths.statePath, paths.layoutPath);

    const legacyState = loadState(legacyStatePath, deps);
    const legacyLayout = loadLayout(legacyLayoutPath, deps);
    const legacyAnyFileExists = anyExists(deps, legacyStatePath, legacyLayoutPath);

    return resolveFixedSettlementFromFacts({
        requestedLocationId: paths.locationId,
        forgeLocationIds: input.forgeLocationIds,
        activeMobileBaseSettlementId: isNonEmptySettlementId(input.activeMobileBaseSettlementId)
            ? input.activeMobileBaseSettlementId
            : undefined,
        scopedStatePath: paths.statePath,
        scopedLayoutPath: paths.layoutPath,
        scopedState,
        scopedLayout,
        scopedAnyFileExists,
        legacyStatePath,
        legacyLayoutPath,
        legacyState,
        legacyLayout,
        legacyAnyFileExists,
    });
}

/**
 * Read-only mobile-base settlement resolution (dedicated namespace, then legacy root by settlementId).
 */
export function resolveMobileBaseSettlementDocuments(
    input: ResolveMobileBaseSettlementDocumentsInput,
    deps: SettlementResolveFsDeps = defaultSettlementResolveFsDeps
): ResolvedSettlementDocuments {
    if (!isNonEmptySettlementId(input.activeMobileBaseSettlementId)) {
        return { ok: false, code: 'missing_active_mobile_base' };
    }

    const paths = buildMobileBaseSettlementDocumentPaths(input.workspaceRoot);
    if (!paths.ok) {
        return { ok: false, code: mapPathValidationCode(paths.code) };
    }

    const legacyStatePath = path.resolve(input.workspaceRoot, SETTLEMENT_STATE_BASENAME);
    const legacyLayoutPath = path.resolve(input.workspaceRoot, SETTLEMENT_LAYOUT_BASENAME);

    const scopedState = loadState(paths.statePath, deps);
    const scopedLayout = loadLayout(paths.layoutPath, deps);
    const scopedAnyFileExists = anyExists(deps, paths.statePath, paths.layoutPath);

    const legacyState = loadState(legacyStatePath, deps);
    const legacyLayout = loadLayout(legacyLayoutPath, deps);
    const legacyAnyFileExists = anyExists(deps, legacyStatePath, legacyLayoutPath);

    return resolveMobileBaseSettlementFromFacts({
        activeMobileBaseSettlementId: input.activeMobileBaseSettlementId,
        scopedStatePath: paths.statePath,
        scopedLayoutPath: paths.layoutPath,
        scopedState,
        scopedLayout,
        scopedAnyFileExists,
        legacyStatePath,
        legacyLayoutPath,
        legacyState,
        legacyLayout,
        legacyAnyFileExists,
    });
}

/** Re-export types used by callers without deep-importing pure core. */
export type { SettlementStateV1, SettlementLayoutV1 };
