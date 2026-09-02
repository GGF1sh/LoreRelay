import { ModDataError, canonicalizeModJson, parseStrictJson, parseStrictJsonBytes } from './modHashCore';
import {
    compareUnicodeCodePointOrder,
    isValidLocalResourceId,
    isValidModId,
    validateModRelativePath,
} from './modPathCore';

export const MOD_MANIFEST_FORMAT = 'lorerelay-mod/1' as const;
export const MAX_MOD_MANIFEST_BYTES = 64 * 1024;
export const MAX_MOD_DEPENDENCIES = 64;
export const MAX_MOD_ENTRYPOINTS_PER_CAPABILITY = 64;
export const MAX_MOD_ENTRYPOINTS_TOTAL = 256;

export const MOD_CONTENT_TAGS = [
    'graphic-violence',
    'horror',
    'nudity',
    'sexual-content',
    'strong-language',
    'substance-use',
] as const;

export const MOD_CAPABILITIES = [
    'asset',
    'campaign-kit',
    'combat-lab-fixture',
    'localization',
    'lorebook',
    'persona',
    'prompt-fragment',
    'scenario',
] as const;

export type ModContentRating = 'general' | 'mature' | 'adult';
export type ModContentTag = typeof MOD_CONTENT_TAGS[number];
export type ModCapability = typeof MOD_CAPABILITIES[number];
export type ModEntrypointKey = keyof ModEntrypoints;

export interface ParsedSemVer {
    major: bigint;
    minor: bigint;
    patch: bigint;
    prerelease: ReadonlyArray<string | bigint>;
    raw: string;
}

export interface ModVersionConstraint {
    id: string;
    version: string;
}

export interface ModConflict extends ModVersionConstraint {
    reason?: string;
}

export interface ModIdEntrypoint {
    id: string;
    path: string;
}

export interface ModPathEntrypoint {
    path: string;
}

export interface ModLocalizationEntrypoint {
    locale: string;
    path: string;
}

export interface ModEntrypoints {
    scenarios?: ModIdEntrypoint[];
    lorebooks?: ModIdEntrypoint[];
    personas?: ModIdEntrypoint[];
    localization?: ModLocalizationEntrypoint[];
    assets?: ModPathEntrypoint[];
    campaignKits?: ModIdEntrypoint[];
    promptFragments?: ModPathEntrypoint[];
    combatLabFixtures?: ModIdEntrypoint[];
}

export interface ModManifest {
    format: typeof MOD_MANIFEST_FORMAT;
    id: string;
    version: string;
    name: string;
    description?: string;
    authors: string[];
    lorerelay: {
        minVersion: string;
        maxVersionExclusive?: string;
    };
    contentRating: ModContentRating;
    contentTags: ModContentTag[];
    capabilities: ModCapability[];
    dependencies: ModVersionConstraint[];
    optionalDependencies: ModVersionConstraint[];
    conflicts: ModConflict[];
    entrypoints: ModEntrypoints;
}

export interface ModValidationIssue {
    code: string;
    path: string;
    message: string;
}

export type ModValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; issues: ModValidationIssue[] };

interface Comparator {
    operator: '=' | '>' | '>=' | '<' | '<=';
    version: ParsedSemVer;
}

export interface ParsedSemVerRange {
    comparators: ReadonlyArray<Comparator>;
    prereleaseBases: ReadonlySet<string>;
    any: boolean;
    raw: string;
}

const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
const ENTRYPOINT_KEYS: ReadonlyArray<ModEntrypointKey> = [
    'scenarios',
    'lorebooks',
    'personas',
    'localization',
    'assets',
    'campaignKits',
    'promptFragments',
    'combatLabFixtures',
];
const CAPABILITY_BY_ENTRYPOINT: Readonly<Record<ModEntrypointKey, ModCapability>> = {
    scenarios: 'scenario',
    lorebooks: 'lorebook',
    personas: 'persona',
    localization: 'localization',
    assets: 'asset',
    campaignKits: 'campaign-kit',
    promptFragments: 'prompt-fragment',
    combatLabFixtures: 'combat-lab-fixture',
};

function isRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || prototype === Object.prototype;
}

function comparePrerelease(left: ParsedSemVer, right: ParsedSemVer): number {
    const leftEmpty = left.prerelease.length === 0;
    const rightEmpty = right.prerelease.length === 0;
    if (leftEmpty || rightEmpty) {
        return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
    }
    const length = Math.max(left.prerelease.length, right.prerelease.length);
    for (let index = 0; index < length; index += 1) {
        const leftPart = left.prerelease[index];
        const rightPart = right.prerelease[index];
        if (leftPart === undefined || rightPart === undefined) {
            return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1;
        }
        if (leftPart === rightPart) continue;
        if (typeof leftPart === 'bigint' && typeof rightPart === 'bigint') {
            return leftPart < rightPart ? -1 : 1;
        }
        if (typeof leftPart === 'bigint') return -1;
        if (typeof rightPart === 'bigint') return 1;
        return compareUnicodeCodePointOrder(leftPart, rightPart);
    }
    return 0;
}

export function parseSemVer(value: unknown): ParsedSemVer | undefined {
    if (typeof value !== 'string' || value.includes('+')) return undefined;
    const match = SEMVER_PATTERN.exec(value);
    if (!match) return undefined;
    const prerelease = match[4]
        ? match[4].split('.').map(part => /^[0-9]+$/.test(part) ? BigInt(part) : part)
        : [];
    return {
        major: BigInt(match[1]),
        minor: BigInt(match[2]),
        patch: BigInt(match[3]),
        prerelease,
        raw: value,
    };
}

export function compareSemVer(leftValue: string | ParsedSemVer, rightValue: string | ParsedSemVer): number {
    const left = typeof leftValue === 'string' ? parseSemVer(leftValue) : leftValue;
    const right = typeof rightValue === 'string' ? parseSemVer(rightValue) : rightValue;
    if (!left || !right) throw new Error('compareSemVer requires valid SemVer values');
    for (const key of ['major', 'minor', 'patch'] as const) {
        if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
    }
    return comparePrerelease(left, right);
}

function semVerBase(version: ParsedSemVer): string {
    return `${version.major}.${version.minor}.${version.patch}`;
}

function stableVersion(major: bigint, minor: bigint, patch: bigint): ParsedSemVer {
    const raw = `${major}.${minor}.${patch}`;
    return { major, minor, patch, prerelease: [], raw };
}

export function parseSemVerRange(value: unknown): ParsedSemVerRange | undefined {
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || value.includes('||')) {
        return undefined;
    }
    if (value === '*') {
        return { comparators: [], prereleaseBases: new Set<string>(), any: true, raw: value };
    }
    const tokens = value.split(/ +/);
    if (tokens.some(token => token.length === 0)) return undefined;
    const comparators: Comparator[] = [];
    const prereleaseBases = new Set<string>();
    for (const token of tokens) {
        const match = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(token);
        if (!match) return undefined;
        const operator = match[1] ?? '=';
        const version = parseSemVer(match[2]);
        if (!version) return undefined;
        if (version.prerelease.length > 0) prereleaseBases.add(semVerBase(version));
        if (operator === '^') {
            comparators.push({ operator: '>=', version });
            const upper = version.major > 0n
                ? stableVersion(version.major + 1n, 0n, 0n)
                : version.minor > 0n
                    ? stableVersion(0n, version.minor + 1n, 0n)
                    : stableVersion(0n, 0n, version.patch + 1n);
            comparators.push({ operator: '<', version: upper });
        } else if (operator === '~') {
            comparators.push({ operator: '>=', version });
            comparators.push({ operator: '<', version: stableVersion(version.major, version.minor + 1n, 0n) });
        } else {
            comparators.push({ operator: operator as Comparator['operator'], version });
        }
    }
    return { comparators, prereleaseBases, any: false, raw: value };
}

export function satisfiesSemVerRange(versionValue: string | ParsedSemVer, rangeValue: string | ParsedSemVerRange): boolean {
    const version = typeof versionValue === 'string' ? parseSemVer(versionValue) : versionValue;
    const range = typeof rangeValue === 'string' ? parseSemVerRange(rangeValue) : rangeValue;
    if (!version || !range) return false;
    if (version.prerelease.length > 0 && !range.prereleaseBases.has(semVerBase(version))) {
        return false;
    }
    return range.comparators.every(comparator => {
        const comparison = compareSemVer(version, comparator.version);
        switch (comparator.operator) {
            case '=': return comparison === 0;
            case '>': return comparison > 0;
            case '>=': return comparison >= 0;
            case '<': return comparison < 0;
            case '<=': return comparison <= 0;
        }
    });
}

function addIssue(issues: ModValidationIssue[], code: string, path: string, message: string): void {
    issues.push({ code, path, message });
}

function checkAllowedKeys(
    value: Record<string, unknown>,
    allowed: readonly string[],
    path: string,
    issues: ModValidationIssue[],
): void {
    const allowlist = new Set(allowed);
    for (const key of Object.keys(value)) {
        if (!allowlist.has(key)) addIssue(issues, 'UNKNOWN_FIELD', `${path}.${key}`, `Unknown field ${key}`);
    }
}

function checkNonEmptyString(
    value: unknown,
    path: string,
    issues: ModValidationIssue[],
    maxScalars: number,
): value is string {
    if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0) {
        addIssue(issues, 'STRING_REQUIRED', path, 'Expected a non-empty string');
        return false;
    }
    if (Array.from(value).length > maxScalars) {
        addIssue(issues, 'STRING_TOO_LONG', path, `String exceeds ${maxScalars} Unicode scalar values`);
        return false;
    }
    return true;
}

function checkSortedUniqueSubset<T extends string>(
    value: unknown,
    allowed: readonly T[],
    path: string,
    issues: ModValidationIssue[],
): value is T[] {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
        addIssue(issues, 'ARRAY_REQUIRED', path, 'Expected an array of strings');
        return false;
    }
    const strings = value as string[];
    const allowedSet = new Set<string>(allowed);
    if (strings.some(item => !allowedSet.has(item))) {
        addIssue(issues, 'VALUE_NOT_ALLOWED', path, 'Array contains an unsupported value');
        return false;
    }
    const sorted = [...strings].sort(compareUnicodeCodePointOrder);
    if (new Set(strings).size !== strings.length || sorted.some((item, index) => item !== strings[index])) {
        addIssue(issues, 'SORTED_UNIQUE_REQUIRED', path, 'Array must be unique and sorted by Unicode code point');
        return false;
    }
    return true;
}

function validateVersionConstraints(
    value: unknown,
    path: string,
    ownerId: unknown,
    issues: ModValidationIssue[],
): value is ModVersionConstraint[] {
    if (!Array.isArray(value)) {
        addIssue(issues, 'ARRAY_REQUIRED', path, 'Expected an array');
        return false;
    }
    if (value.length > MAX_MOD_DEPENDENCIES) {
        addIssue(issues, 'ARRAY_TOO_LONG', path, `At most ${MAX_MOD_DEPENDENCIES} entries are allowed`);
    }
    const ids = new Set<string>();
    value.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (!isRecord(item)) {
            addIssue(issues, 'OBJECT_REQUIRED', itemPath, 'Expected an object');
            return;
        }
        checkAllowedKeys(item, ['id', 'version'], itemPath, issues);
        if (!isValidModId(item.id)) addIssue(issues, 'MOD_ID_INVALID', `${itemPath}.id`, 'Invalid MOD ID');
        if (item.id === ownerId) addIssue(issues, 'SELF_DEPENDENCY', `${itemPath}.id`, 'A MOD cannot depend on itself');
        if (typeof item.id === 'string' && ids.has(item.id)) addIssue(issues, 'DUPLICATE_DEPENDENCY', `${itemPath}.id`, 'Dependency IDs must be unique');
        if (typeof item.id === 'string') ids.add(item.id);
        if (!parseSemVerRange(item.version)) addIssue(issues, 'SEMVER_RANGE_INVALID', `${itemPath}.version`, 'Invalid deterministic SemVer range');
    });
    return true;
}

function validateConflicts(
    value: unknown,
    ownerId: unknown,
    issues: ModValidationIssue[],
): value is ModConflict[] {
    const path = '$.conflicts';
    if (!Array.isArray(value)) {
        addIssue(issues, 'ARRAY_REQUIRED', path, 'Expected an array');
        return false;
    }
    if (value.length > MAX_MOD_DEPENDENCIES) addIssue(issues, 'ARRAY_TOO_LONG', path, `At most ${MAX_MOD_DEPENDENCIES} entries are allowed`);
    const ids = new Set<string>();
    value.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (!isRecord(item)) {
            addIssue(issues, 'OBJECT_REQUIRED', itemPath, 'Expected an object');
            return;
        }
        checkAllowedKeys(item, ['id', 'version', 'reason'], itemPath, issues);
        if (!isValidModId(item.id)) addIssue(issues, 'MOD_ID_INVALID', `${itemPath}.id`, 'Invalid MOD ID');
        if (item.id === ownerId) addIssue(issues, 'SELF_CONFLICT', `${itemPath}.id`, 'A MOD cannot conflict with itself');
        if (typeof item.id === 'string' && ids.has(item.id)) addIssue(issues, 'DUPLICATE_CONFLICT', `${itemPath}.id`, 'Conflict IDs must be unique');
        if (typeof item.id === 'string') ids.add(item.id);
        if (!parseSemVerRange(item.version)) addIssue(issues, 'SEMVER_RANGE_INVALID', `${itemPath}.version`, 'Invalid deterministic SemVer range');
        if (item.reason !== undefined && (typeof item.reason !== 'string' || Buffer.byteLength(item.reason, 'utf8') > 240)) {
            addIssue(issues, 'CONFLICT_REASON_INVALID', `${itemPath}.reason`, 'Conflict reason must be a string of at most 240 UTF-8 bytes');
        }
    });
    return true;
}

function validateEntrypoints(value: unknown, issues: ModValidationIssue[]): value is ModEntrypoints {
    const path = '$.entrypoints';
    if (!isRecord(value)) {
        addIssue(issues, 'OBJECT_REQUIRED', path, 'Expected an object');
        return false;
    }
    checkAllowedKeys(value, ENTRYPOINT_KEYS, path, issues);
    let total = 0;
    const resourceIds = new Set<string>();
    for (const key of ENTRYPOINT_KEYS) {
        const entries = value[key];
        if (entries === undefined) continue;
        if (!Array.isArray(entries)) {
            addIssue(issues, 'ARRAY_REQUIRED', `${path}.${key}`, 'Expected an array');
            continue;
        }
        total += entries.length;
        if (entries.length > MAX_MOD_ENTRYPOINTS_PER_CAPABILITY) {
            addIssue(issues, 'ENTRYPOINT_LIMIT', `${path}.${key}`, `At most ${MAX_MOD_ENTRYPOINTS_PER_CAPABILITY} descriptors are allowed`);
        }
        const identities = new Set<string>();
        entries.forEach((entry, index) => {
            const entryPath = `${path}.${key}[${index}]`;
            if (!isRecord(entry)) {
                addIssue(issues, 'OBJECT_REQUIRED', entryPath, 'Expected an object');
                return;
            }
            const hasId = key !== 'localization' && key !== 'assets' && key !== 'promptFragments';
            const hasLocale = key === 'localization';
            checkAllowedKeys(entry, hasId ? ['id', 'path'] : hasLocale ? ['locale', 'path'] : ['path'], entryPath, issues);
            if (hasId && !isValidLocalResourceId(entry.id)) {
                addIssue(issues, 'LOCAL_RESOURCE_ID_INVALID', `${entryPath}.id`, 'Invalid local resource ID');
            } else if (hasId && typeof entry.id === 'string') {
                if (resourceIds.has(entry.id)) {
                    addIssue(issues, 'DUPLICATE_CANONICAL_RESOURCE_ID', `${entryPath}.id`, 'Local resource IDs must be unique across the package');
                }
                resourceIds.add(entry.id);
            }
            if (hasLocale && (typeof entry.locale !== 'string' || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(entry.locale))) {
                addIssue(issues, 'LOCALE_INVALID', `${entryPath}.locale`, 'Invalid bounded locale identifier');
            }
            const pathResult = validateModRelativePath(entry.path);
            if (!pathResult.ok) addIssue(issues, 'ENTRYPOINT_PATH_INVALID', `${entryPath}.path`, `Invalid package-relative path: ${pathResult.code ?? 'UNKNOWN'}`);
            const identity = hasId
                ? (typeof entry.id === 'string' ? entry.id : undefined)
                : hasLocale
                    ? (typeof entry.locale === 'string' && typeof entry.path === 'string' ? `${entry.locale}\0${entry.path}` : undefined)
                    : (typeof entry.path === 'string' ? entry.path : undefined);
            if (identity !== undefined) {
                if (identities.has(identity)) addIssue(issues, 'DUPLICATE_ENTRYPOINT', entryPath, 'Duplicate entrypoint descriptor identity');
                identities.add(identity);
            }
        });
    }
    if (total > MAX_MOD_ENTRYPOINTS_TOTAL) addIssue(issues, 'ENTRYPOINT_TOTAL_LIMIT', path, `At most ${MAX_MOD_ENTRYPOINTS_TOTAL} descriptors are allowed`);
    return true;
}

export function validateModManifest(value: unknown): ModValidationResult<ModManifest> {
    const issues: ModValidationIssue[] = [];
    if (!isRecord(value)) {
        return { ok: false, issues: [{ code: 'OBJECT_REQUIRED', path: '$', message: 'Manifest must be a plain JSON object' }] };
    }
    try {
        if (Buffer.byteLength(canonicalizeModJson(value), 'utf8') > MAX_MOD_MANIFEST_BYTES) {
            addIssue(issues, 'MANIFEST_TOO_LARGE', '$', `Canonical manifest exceeds ${MAX_MOD_MANIFEST_BYTES} bytes`);
        }
    } catch (error) {
        return {
            ok: false,
            issues: [{
                code: error instanceof ModDataError ? error.code : 'MANIFEST_NOT_JSON',
                path: '$',
                message: 'Manifest must contain only plain canonical JSON values',
            }],
        };
    }
    checkAllowedKeys(value, [
        'format', 'id', 'version', 'name', 'description', 'authors', 'lorerelay', 'contentRating',
        'contentTags', 'capabilities', 'dependencies', 'optionalDependencies', 'conflicts', 'entrypoints',
    ], '$', issues);
    if (value.format !== MOD_MANIFEST_FORMAT) addIssue(issues, 'FORMAT_UNSUPPORTED', '$.format', `Expected ${MOD_MANIFEST_FORMAT}`);
    if (!isValidModId(value.id)) addIssue(issues, 'MOD_ID_INVALID', '$.id', 'Invalid MOD ID');
    if (!parseSemVer(value.version)) addIssue(issues, 'SEMVER_INVALID', '$.version', 'Version must be SemVer 2 without build metadata');
    checkNonEmptyString(value.name, '$.name', issues, 120);
    if (value.description !== undefined && (typeof value.description !== 'string' || Buffer.byteLength(value.description, 'utf8') > 2_000)) {
        addIssue(issues, 'DESCRIPTION_INVALID', '$.description', 'Description must be a string of at most 2,000 UTF-8 bytes');
    }
    if (!Array.isArray(value.authors) || value.authors.length < 1 || value.authors.length > 16) {
        addIssue(issues, 'AUTHORS_INVALID', '$.authors', 'Authors must contain 1 to 16 entries');
    } else {
        value.authors.forEach((author, index) => checkNonEmptyString(author, `$.authors[${index}]`, issues, 120));
    }
    if (!isRecord(value.lorerelay)) {
        addIssue(issues, 'OBJECT_REQUIRED', '$.lorerelay', 'Expected an object');
    } else {
        checkAllowedKeys(value.lorerelay, ['minVersion', 'maxVersionExclusive'], '$.lorerelay', issues);
        const minimum = parseSemVer(value.lorerelay.minVersion);
        const maximum = value.lorerelay.maxVersionExclusive === undefined ? undefined : parseSemVer(value.lorerelay.maxVersionExclusive);
        if (!minimum || minimum.prerelease.length > 0) addIssue(issues, 'ENGINE_MIN_VERSION_INVALID', '$.lorerelay.minVersion', 'Minimum version must be stable SemVer');
        if (value.lorerelay.maxVersionExclusive !== undefined && (!maximum || maximum.prerelease.length > 0)) {
            addIssue(issues, 'ENGINE_MAX_VERSION_INVALID', '$.lorerelay.maxVersionExclusive', 'Maximum version must be stable SemVer');
        } else if (minimum && maximum && compareSemVer(maximum, minimum) <= 0) {
            addIssue(issues, 'ENGINE_RANGE_EMPTY', '$.lorerelay.maxVersionExclusive', 'Maximum version must exceed minimum version');
        }
    }
    if (typeof value.contentRating !== 'string' || !['general', 'mature', 'adult'].includes(value.contentRating)) {
        addIssue(issues, 'CONTENT_RATING_INVALID', '$.contentRating', 'Unsupported content rating');
    }
    const contentTagsValid = checkSortedUniqueSubset(value.contentTags, MOD_CONTENT_TAGS, '$.contentTags', issues);
    const capabilitiesValid = checkSortedUniqueSubset(value.capabilities, MOD_CAPABILITIES, '$.capabilities', issues);
    const contentTags = contentTagsValid ? value.contentTags as ModContentTag[] : [];
    const capabilities = capabilitiesValid ? value.capabilities as ModCapability[] : [];
    if (value.contentRating === 'general' && contentTags.includes('sexual-content')) {
        addIssue(issues, 'GENERAL_SEXUAL_CONTENT_INVALID', '$.contentTags', 'sexual-content is incompatible with general rating');
    }
    validateVersionConstraints(value.dependencies, '$.dependencies', value.id, issues);
    validateVersionConstraints(value.optionalDependencies, '$.optionalDependencies', value.id, issues);
    if (Array.isArray(value.dependencies) && Array.isArray(value.optionalDependencies)) {
        const required = new Set(value.dependencies.filter(isRecord).map(item => item.id).filter((id): id is string => typeof id === 'string'));
        value.optionalDependencies.forEach((item, index) => {
            if (isRecord(item) && typeof item.id === 'string' && required.has(item.id)) {
                addIssue(issues, 'DEPENDENCY_KIND_COLLISION', `$.optionalDependencies[${index}].id`, 'A dependency cannot be both required and optional');
            }
        });
    }
    validateConflicts(value.conflicts, value.id, issues);
    const entrypointsValid = validateEntrypoints(value.entrypoints, issues);
    if (capabilitiesValid && entrypointsValid) {
        const nonEmptyCapabilities = ENTRYPOINT_KEYS
            .filter(key => Array.isArray((value.entrypoints as Record<string, unknown>)[key]) && ((value.entrypoints as Record<string, unknown>)[key] as unknown[]).length > 0)
            .map(key => CAPABILITY_BY_ENTRYPOINT[key])
            .sort(compareUnicodeCodePointOrder);
        if (nonEmptyCapabilities.length !== capabilities.length
            || nonEmptyCapabilities.some((capability, index) => capability !== capabilities[index])) {
            addIssue(issues, 'CAPABILITY_ENTRYPOINT_MISMATCH', '$.capabilities', 'Capabilities must exactly match non-empty entrypoint groups');
        }
    }
    issues.sort((left, right) => compareUnicodeCodePointOrder(left.path, right.path)
        || compareUnicodeCodePointOrder(left.code, right.code));
    return issues.length > 0
        ? { ok: false, issues }
        : { ok: true, value: value as unknown as ModManifest };
}

export function parseModManifestText(text: string): ModValidationResult<ModManifest> {
    if (Buffer.byteLength(text, 'utf8') > MAX_MOD_MANIFEST_BYTES) {
        return { ok: false, issues: [{ code: 'MANIFEST_TOO_LARGE', path: '$', message: `Manifest exceeds ${MAX_MOD_MANIFEST_BYTES} bytes` }] };
    }
    try {
        return validateModManifest(parseStrictJson(text));
    } catch (error) {
        const code = error instanceof ModDataError ? error.code : 'JSON_INVALID';
        return { ok: false, issues: [{ code, path: '$', message: error instanceof Error ? error.message : 'Invalid JSON' }] };
    }
}

export function parseModManifestBytes(bytes: Uint8Array): ModValidationResult<ModManifest> {
    if (bytes.byteLength > MAX_MOD_MANIFEST_BYTES) {
        return { ok: false, issues: [{ code: 'MANIFEST_TOO_LARGE', path: '$', message: `Manifest exceeds ${MAX_MOD_MANIFEST_BYTES} bytes` }] };
    }
    try {
        return validateModManifest(parseStrictJsonBytes(bytes));
    } catch (error) {
        const code = error instanceof ModDataError ? error.code : 'JSON_INVALID';
        return { ok: false, issues: [{ code, path: '$', message: error instanceof Error ? error.message : 'Invalid JSON' }] };
    }
}

export function isLoreRelayVersionCompatible(manifest: ModManifest, currentVersion: string): boolean {
    const current = parseSemVer(currentVersion);
    const minimum = parseSemVer(manifest.lorerelay.minVersion);
    const maximum = manifest.lorerelay.maxVersionExclusive ? parseSemVer(manifest.lorerelay.maxVersionExclusive) : undefined;
    if (!current || !minimum) return false;
    return compareSemVer(current, minimum) >= 0 && (!maximum || compareSemVer(current, maximum) < 0);
}
