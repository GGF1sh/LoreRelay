/**
 * Pure lexical identity and package-relative path validation for MOD Substrate V1.
 *
 * Filesystem containment, link, and reparse-point checks belong to a future
 * bounded host. These helpers deliberately never touch the filesystem.
 */

export const MOD_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,31})(?:\.[a-z0-9](?:[a-z0-9-]{0,31})){1,5}$/;
export const LOCAL_RESOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
export const MAX_MOD_ID_LENGTH = 128;
export const MAX_MOD_RELATIVE_PATH_BYTES = 240;
export const MAX_MOD_RELATIVE_PATH_SEGMENTS = 32;

const WINDOWS_RESERVED_BASENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export type ModPathErrorCode =
    | 'EMPTY'
    | 'NOT_NFC'
    | 'TOO_LONG'
    | 'TOO_MANY_SEGMENTS'
    | 'ABSOLUTE'
    | 'BACKSLASH'
    | 'COLON'
    | 'ENCODED_SEPARATOR_OR_DOT'
    | 'CONTROL_CHARACTER'
    | 'EMPTY_SEGMENT'
    | 'DOT_SEGMENT'
    | 'WINDOWS_RESERVED_SEGMENT'
    | 'WINDOWS_TRAILING_DOT_OR_SPACE';

export interface ModPathValidationResult {
    ok: boolean;
    code?: ModPathErrorCode;
    normalized?: string;
}

export function compareUnicodeCodePointOrder(left: string, right: string): number {
    const leftPoints = Array.from(left, character => character.codePointAt(0) as number);
    const rightPoints = Array.from(right, character => character.codePointAt(0) as number);
    const length = Math.min(leftPoints.length, rightPoints.length);
    for (let index = 0; index < length; index += 1) {
        if (leftPoints[index] !== rightPoints[index]) {
            return leftPoints[index] < rightPoints[index] ? -1 : 1;
        }
    }
    return leftPoints.length === rightPoints.length ? 0 : leftPoints.length < rightPoints.length ? -1 : 1;
}

export function compareUtf8ByteOrder(left: string, right: string): number {
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function isValidModId(value: unknown): value is string {
    return typeof value === 'string'
        && value.length <= MAX_MOD_ID_LENGTH
        && MOD_ID_PATTERN.test(value);
}

export function isValidLocalResourceId(value: unknown): value is string {
    if (typeof value !== 'string' || !LOCAL_RESOURCE_ID_PATTERN.test(value)) {
        return false;
    }
    const segments = value.split('/');
    return segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..');
}

export function toCanonicalModResourceId(modId: string, localId: string): string {
    if (!isValidModId(modId)) {
        throw new Error(`Invalid MOD ID: ${modId}`);
    }
    if (!isValidLocalResourceId(localId)) {
        throw new Error(`Invalid local resource ID: ${localId}`);
    }
    return `${modId}:${localId}`;
}

export function toCanonicalBaseResourceId(legacyId: string): string {
    if (!isValidLocalResourceId(legacyId)) {
        throw new Error(`Invalid base resource ID: ${legacyId}`);
    }
    return `base:${legacyId}`;
}

export function splitCanonicalResourceId(value: string):
    | { namespace: 'base'; localId: string }
    | { namespace: 'mod'; modId: string; localId: string }
    | undefined {
    const separator = value.indexOf(':');
    if (separator <= 0 || separator !== value.lastIndexOf(':')) {
        return undefined;
    }
    const namespace = value.slice(0, separator);
    const localId = value.slice(separator + 1);
    if (!isValidLocalResourceId(localId)) {
        return undefined;
    }
    if (namespace === 'base') {
        return { namespace: 'base', localId };
    }
    return isValidModId(namespace)
        ? { namespace: 'mod', modId: namespace, localId }
        : undefined;
}

export function validateModRelativePath(value: unknown): ModPathValidationResult {
    if (typeof value !== 'string' || value.length === 0) {
        return { ok: false, code: 'EMPTY' };
    }
    if (value !== value.normalize('NFC')) {
        return { ok: false, code: 'NOT_NFC' };
    }
    if (Buffer.byteLength(value, 'utf8') > MAX_MOD_RELATIVE_PATH_BYTES) {
        return { ok: false, code: 'TOO_LONG' };
    }
    if (value.startsWith('/') || value.startsWith('//')) {
        return { ok: false, code: 'ABSOLUTE' };
    }
    if (value.includes('\\')) {
        return { ok: false, code: 'BACKSLASH' };
    }
    if (value.includes(':')) {
        return { ok: false, code: 'COLON' };
    }
    if (/%(?:2e|2f|5c)/i.test(value)) {
        return { ok: false, code: 'ENCODED_SEPARATOR_OR_DOT' };
    }
    if (CONTROL_CHARACTER.test(value)) {
        return { ok: false, code: 'CONTROL_CHARACTER' };
    }

    const segments = value.split('/');
    if (segments.length > MAX_MOD_RELATIVE_PATH_SEGMENTS) {
        return { ok: false, code: 'TOO_MANY_SEGMENTS' };
    }
    for (const segment of segments) {
        if (segment.length === 0) {
            return { ok: false, code: 'EMPTY_SEGMENT' };
        }
        if (segment === '.' || segment === '..') {
            return { ok: false, code: 'DOT_SEGMENT' };
        }
        if (/[. ]$/.test(segment)) {
            return { ok: false, code: 'WINDOWS_TRAILING_DOT_OR_SPACE' };
        }
        const windowsBase = segment.split('.')[0].replace(/[. ]+$/g, '');
        if (WINDOWS_RESERVED_BASENAME.test(windowsBase)) {
            return { ok: false, code: 'WINDOWS_RESERVED_SEGMENT' };
        }
    }
    return { ok: true, normalized: value };
}

/** Windows-invariant path identity used to reject cross-platform collisions. */
export function modPathCollisionKey(value: string): string {
    const validation = validateModRelativePath(value);
    if (!validation.ok || !validation.normalized) {
        throw new Error(`Invalid MOD relative path: ${validation.code ?? 'UNKNOWN'}`);
    }
    return unicodeInvariantCaseFold(validation.normalized);
}

/**
 * Locale-independent conservative Unicode fold for cross-platform path identity.
 * Per-scalar uppercase expansion catches Windows-relevant cases such as sigma,
 * sharp-s, and ligatures without locale-sensitive casing.
 */
export function unicodeInvariantCaseFold(value: string): string {
    return Array.from(value.normalize('NFC'), character => character.toUpperCase())
        .join('')
        .normalize('NFC');
}

export function validateInstalledDirectoryIdentity(input: {
    directoryId: unknown;
    directoryVersion: unknown;
    manifestId: unknown;
    manifestVersion: unknown;
    isValidVersion: (value: unknown) => boolean;
}): { ok: true } | { ok: false; code: 'DIRECTORY_ID_MISMATCH' | 'DIRECTORY_VERSION_MISMATCH' | 'INVALID_DIRECTORY_ID' | 'INVALID_DIRECTORY_VERSION' } {
    if (!isValidModId(input.directoryId)) {
        return { ok: false, code: 'INVALID_DIRECTORY_ID' };
    }
    if (!input.isValidVersion(input.directoryVersion)) {
        return { ok: false, code: 'INVALID_DIRECTORY_VERSION' };
    }
    if (input.directoryId !== input.manifestId) {
        return { ok: false, code: 'DIRECTORY_ID_MISMATCH' };
    }
    if (input.directoryVersion !== input.manifestVersion) {
        return { ok: false, code: 'DIRECTORY_VERSION_MISMATCH' };
    }
    return { ok: true };
}
