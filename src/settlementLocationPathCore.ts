/**
 * SETTLEMENT-MULTI-LOCATION-001-PRE1
 * Pure location-ID validation and path contract for location-scoped settlement documents.
 * No filesystem I/O, VS Code, parsers, caches, or migration.
 */

import * as path from 'path';

/** Fixed-settlement location IDs: exact match, no trim/repair/case-fold. */
export const SETTLEMENT_FIXED_LOCATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export const SETTLEMENTS_DIR_NAME = 'settlements' as const;
export const MOBILE_BASE_SETTLEMENT_NAMESPACE = '_mobile_base' as const;
export const SETTLEMENT_STATE_BASENAME = 'settlement_state.json' as const;
export const SETTLEMENT_LAYOUT_BASENAME = 'settlement_layout.json' as const;

export type SettlementLocationIdErrorCode =
    | 'not_string'
    | 'empty'
    | 'too_long'
    | 'invalid_characters'
    | 'path_segment'
    | 'absolute_or_drive'
    | 'url_encoded'
    | 'reserved_namespace'
    | 'reserved_device_name'
    | 'prototype_key'
    | 'unknown_location'
    | 'invalid_workspace_root'
    | 'path_escape';

export type SettlementLocationIdValidationResult =
    | { ok: true; locationId: string }
    | { ok: false; code: SettlementLocationIdErrorCode };

export type SettlementDocumentPathKind = 'fixed' | 'mobile_base';

export type SettlementDocumentPathsResult =
    | {
        ok: true;
        kind: 'fixed';
        locationId: string;
        settlementsRoot: string;
        directory: string;
        statePath: string;
        layoutPath: string;
    }
    | {
        ok: true;
        kind: 'mobile_base';
        settlementsRoot: string;
        directory: string;
        statePath: string;
        layoutPath: string;
    }
    | { ok: false; code: SettlementLocationIdErrorCode };

/** Windows device names (case-insensitive); must not be used as path segments. */
const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isAsciiControlOrWhitespace(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return code <= 0x20 || code === 0x7f;
}

function hasNonAscii(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        if (value.charCodeAt(i) > 0x7f) {
            return true;
        }
    }
    return false;
}

/**
 * Syntax-only validation for fixed World location IDs.
 * Does not check World Forge catalog membership.
 */
export function validateFixedSettlementLocationId(
    raw: unknown
): SettlementLocationIdValidationResult {
    if (typeof raw !== 'string') {
        return { ok: false, code: 'not_string' };
    }
    if (raw.length === 0) {
        return { ok: false, code: 'empty' };
    }
    if (raw.length > 64) {
        return { ok: false, code: 'too_long' };
    }

    // Exact rejection categories before / in addition to the positive pattern.
    if (raw === '.' || raw === '..') {
        return { ok: false, code: 'path_segment' };
    }
    if (raw.includes('/') || raw.includes('\\')) {
        return { ok: false, code: 'path_segment' };
    }
    if (raw.includes('.')) {
        // Embedded dots (path-like segments) are never allowed for fixed IDs.
        return { ok: false, code: 'path_segment' };
    }
    if (raw.includes('%')) {
        return { ok: false, code: 'url_encoded' };
    }
    if (raw.includes(':')) {
        // Drive prefixes (C:) and other colon forms.
        return { ok: false, code: 'absolute_or_drive' };
    }
    // UNC-like or absolute-ish forms that may not contain separators alone.
    if (raw.startsWith('\\\\') || raw.startsWith('//')) {
        return { ok: false, code: 'absolute_or_drive' };
    }

    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (isAsciiControlOrWhitespace(ch)) {
            return { ok: false, code: 'invalid_characters' };
        }
    }
    if (hasNonAscii(raw)) {
        return { ok: false, code: 'invalid_characters' };
    }

    if (PROTOTYPE_KEYS.has(raw)) {
        return { ok: false, code: 'prototype_key' };
    }

    // Reserved namespace / leading underscore (including _mobile_base).
    if (raw === MOBILE_BASE_SETTLEMENT_NAMESPACE || raw.startsWith('_')) {
        return { ok: false, code: 'reserved_namespace' };
    }

    if (WINDOWS_RESERVED_DEVICE_NAMES.has(raw.toUpperCase())) {
        return { ok: false, code: 'reserved_device_name' };
    }

    if (!SETTLEMENT_FIXED_LOCATION_ID_PATTERN.test(raw)) {
        return { ok: false, code: 'invalid_characters' };
    }

    return { ok: true, locationId: raw };
}

/**
 * Catalog membership for a already-validated or raw ID.
 * Invalid syntax preserves the syntax error (does not become unknown_location).
 * `_mobile_base` remains rejected even if present in the catalog.
 */
export function validateFixedSettlementLocationIdInCatalog(
    raw: unknown,
    forgeLocationIds: ReadonlySet<string>
): SettlementLocationIdValidationResult {
    const syntax = validateFixedSettlementLocationId(raw);
    if (!syntax.ok) {
        return syntax;
    }
    // Belt-and-suspenders: never allow reserved namespace via catalog.
    if (syntax.locationId === MOBILE_BASE_SETTLEMENT_NAMESPACE) {
        return { ok: false, code: 'reserved_namespace' };
    }
    if (!forgeLocationIds.has(syntax.locationId)) {
        return { ok: false, code: 'unknown_location' };
    }
    return syntax;
}

/** Component-safe containment: candidate is root or a descendant of root. */
export function isPathInsideRoot(root: string, candidate: string): boolean {
    const base = path.resolve(root);
    const resolved = path.resolve(candidate);
    if (resolved === base) {
        return true;
    }
    const prefix = base.endsWith(path.sep) ? base : base + path.sep;
    return resolved.startsWith(prefix);
}

function validateWorkspaceRoot(workspaceRoot: unknown): SettlementLocationIdValidationResult {
    if (typeof workspaceRoot !== 'string') {
        return { ok: false, code: 'invalid_workspace_root' };
    }
    if (workspaceRoot.length === 0) {
        return { ok: false, code: 'invalid_workspace_root' };
    }
    // Reject pure whitespace roots without inventing a new code.
    for (let i = 0; i < workspaceRoot.length; i++) {
        if (!isAsciiControlOrWhitespace(workspaceRoot[i])) {
            return { ok: true, locationId: workspaceRoot };
        }
    }
    return { ok: false, code: 'invalid_workspace_root' };
}

function finalizePaths(
    kind: SettlementDocumentPathKind,
    workspaceRoot: string,
    dirName: string,
    locationId?: string
): SettlementDocumentPathsResult {
    const settlementsRoot = path.resolve(workspaceRoot, SETTLEMENTS_DIR_NAME);
    const directory = path.resolve(settlementsRoot, dirName);
    const statePath = path.resolve(directory, SETTLEMENT_STATE_BASENAME);
    const layoutPath = path.resolve(directory, SETTLEMENT_LAYOUT_BASENAME);

    if (!isPathInsideRoot(settlementsRoot, directory)
        || !isPathInsideRoot(directory, statePath)
        || !isPathInsideRoot(directory, layoutPath)) {
        return { ok: false, code: 'path_escape' };
    }
    // Directory must be a direct child of settlementsRoot (no multi-hop dirName).
    if (path.dirname(directory) !== settlementsRoot) {
        return { ok: false, code: 'path_escape' };
    }

    if (kind === 'fixed') {
        if (!locationId) {
            return { ok: false, code: 'empty' };
        }
        return {
            ok: true,
            kind: 'fixed',
            locationId,
            settlementsRoot,
            directory,
            statePath,
            layoutPath,
        };
    }
    return {
        ok: true,
        kind: 'mobile_base',
        settlementsRoot,
        directory,
        statePath,
        layoutPath,
    };
}

/**
 * Build paths for a fixed settlement under settlements/<locationId>/.
 * Requires syntax + catalog membership. Never accepts _mobile_base.
 */
export function buildFixedSettlementDocumentPaths(
    workspaceRoot: unknown,
    locationId: unknown,
    forgeLocationIds: ReadonlySet<string>
): SettlementDocumentPathsResult {
    const rootCheck = validateWorkspaceRoot(workspaceRoot);
    if (!rootCheck.ok) {
        return rootCheck;
    }
    const idCheck = validateFixedSettlementLocationIdInCatalog(locationId, forgeLocationIds);
    if (!idCheck.ok) {
        return idCheck;
    }
    return finalizePaths('fixed', rootCheck.locationId, idCheck.locationId, idCheck.locationId);
}

/**
 * Build paths for the reserved mobile-base settlement namespace.
 * Caller cannot supply a namespace ID.
 */
export function buildMobileBaseSettlementDocumentPaths(
    workspaceRoot: unknown
): SettlementDocumentPathsResult {
    const rootCheck = validateWorkspaceRoot(workspaceRoot);
    if (!rootCheck.ok) {
        return rootCheck;
    }
    return finalizePaths(
        'mobile_base',
        rootCheck.locationId,
        MOBILE_BASE_SETTLEMENT_NAMESPACE
    );
}
