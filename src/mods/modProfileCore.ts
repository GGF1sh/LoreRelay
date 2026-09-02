import {
    MOD_CAPABILITIES,
    MOD_CONTENT_TAGS,
    ModCapability,
    ModContentRating,
    ModContentTag,
    ModValidationIssue,
    ModValidationResult,
    compareSemVer,
    parseSemVer,
    parseSemVerRange,
} from './modManifestCore';
import {
    ModDataError,
    canonicalizeModJson,
    hashCanonicalModJson,
    isModSha256,
    parseStrictJson,
    parseStrictJsonBytes,
} from './modHashCore';
import {
    compareUnicodeCodePointOrder,
    isValidModId,
    splitCanonicalResourceId,
} from './modPathCore';

export const MOD_PROFILE_FORMAT = 'lorerelay-mod-profile/1' as const;
export const MOD_LOCK_FORMAT = 'lorerelay-mod-lock/1' as const;
export const MOD_RESOLVER_VERSION = 1 as const;
export const MAX_MOD_PROFILE_BYTES = 256 * 1024;
export const MAX_MOD_PROFILE_ENABLED = 128;
export const MAX_MOD_ADULT_APPROVALS = 128;

export type ModSourcePreference = 'any' | 'global' | 'workspace';
export type ModResolvedSource = Exclude<ModSourcePreference, 'any'>;

export interface ModProfileEnabledEntry {
    id: string;
    version: string;
    source: ModSourcePreference;
}

export interface ModAdultApproval {
    id: string;
    version: string;
    manifestHash: string;
    contentHash: string;
}

export interface ModProfile {
    format: typeof MOD_PROFILE_FORMAT;
    enabled: ModProfileEnabledEntry[];
    selected: {
        campaignKit: string | null;
    };
    adultContent: {
        allow: boolean;
        approvals: ModAdultApproval[];
    };
}

export interface ModLockedDependency {
    id: string;
    version: string;
    optional: boolean;
}

export interface ModLockedPackage {
    id: string;
    version: string;
    source: ModResolvedSource;
    manifestHash: string;
    contentHash: string;
    contentRating: ModContentRating;
    contentTags: ModContentTag[];
    capabilities: ModCapability[];
    dependencies: ModLockedDependency[];
    engineCompatibility: 'compatible';
}

export interface ModLock {
    format: typeof MOD_LOCK_FORMAT;
    resolverVersion: typeof MOD_RESOLVER_VERSION;
    resolvedWithLoreRelay: string;
    profileHash: string;
    adultContentAllowed: boolean;
    packages: ModLockedPackage[];
    loadOrder: string[];
    selected: {
        campaignKit: string | null;
    };
    aggregateHash: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addIssue(issues: ModValidationIssue[], code: string, path: string, message: string): void {
    issues.push({ code, path, message });
}

function checkAllowedKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: ModValidationIssue[]): void {
    const allowlist = new Set(allowed);
    for (const key of Object.keys(value)) {
        if (!allowlist.has(key)) addIssue(issues, 'UNKNOWN_FIELD', `${path}.${key}`, `Unknown field ${key}`);
    }
}

function sortedIssues(issues: ModValidationIssue[]): ModValidationIssue[] {
    return issues.sort((left, right) => compareUnicodeCodePointOrder(left.path, right.path)
        || compareUnicodeCodePointOrder(left.code, right.code));
}

export function validateModProfile(value: unknown): ModValidationResult<ModProfile> {
    const issues: ModValidationIssue[] = [];
    if (!isRecord(value)) {
        return { ok: false, issues: [{ code: 'OBJECT_REQUIRED', path: '$', message: 'Profile must be a plain JSON object' }] };
    }
    checkAllowedKeys(value, ['format', 'enabled', 'selected', 'adultContent'], '$', issues);
    if (value.format !== MOD_PROFILE_FORMAT) addIssue(issues, 'FORMAT_UNSUPPORTED', '$.format', `Expected ${MOD_PROFILE_FORMAT}`);

    const enabledIds = new Set<string>();
    if (!Array.isArray(value.enabled)) {
        addIssue(issues, 'ARRAY_REQUIRED', '$.enabled', 'Expected an array');
    } else {
        if (value.enabled.length > MAX_MOD_PROFILE_ENABLED) addIssue(issues, 'PROFILE_ENABLED_LIMIT', '$.enabled', `At most ${MAX_MOD_PROFILE_ENABLED} enabled MODs are allowed`);
        value.enabled.forEach((entry, index) => {
            const path = `$.enabled[${index}]`;
            if (!isRecord(entry)) {
                addIssue(issues, 'OBJECT_REQUIRED', path, 'Expected an object');
                return;
            }
            checkAllowedKeys(entry, ['id', 'version', 'source'], path, issues);
            if (!isValidModId(entry.id)) addIssue(issues, 'MOD_ID_INVALID', `${path}.id`, 'Invalid MOD ID');
            if (typeof entry.id === 'string' && enabledIds.has(entry.id)) addIssue(issues, 'DUPLICATE_ENABLED_ID', `${path}.id`, 'Enabled MOD IDs must be unique');
            if (typeof entry.id === 'string') enabledIds.add(entry.id);
            if (!parseSemVerRange(entry.version)) addIssue(issues, 'SEMVER_RANGE_INVALID', `${path}.version`, 'Invalid deterministic SemVer range');
            if (!['any', 'global', 'workspace'].includes(String(entry.source))) addIssue(issues, 'SOURCE_INVALID', `${path}.source`, 'Unsupported MOD source');
        });
    }

    if (!isRecord(value.selected)) {
        addIssue(issues, 'OBJECT_REQUIRED', '$.selected', 'Expected an object');
    } else {
        checkAllowedKeys(value.selected, ['campaignKit'], '$.selected', issues);
        if (value.selected.campaignKit !== null) {
            const selected = typeof value.selected.campaignKit === 'string'
                ? splitCanonicalResourceId(value.selected.campaignKit)
                : undefined;
            if (!selected || selected.namespace !== 'mod') {
                addIssue(issues, 'CAMPAIGN_KIT_SELECTION_INVALID', '$.selected.campaignKit', 'Campaign kit must be null or a canonical MOD resource ID');
            } else if (!enabledIds.has(selected.modId)) {
                addIssue(issues, 'SELECTION_OUTSIDE_ENABLED', '$.selected.campaignKit', 'Selected campaign kit must belong to an enabled MOD');
            }
        }
    }

    if (!isRecord(value.adultContent)) {
        addIssue(issues, 'OBJECT_REQUIRED', '$.adultContent', 'Expected an object');
    } else {
        checkAllowedKeys(value.adultContent, ['allow', 'approvals'], '$.adultContent', issues);
        if (typeof value.adultContent.allow !== 'boolean') addIssue(issues, 'BOOLEAN_REQUIRED', '$.adultContent.allow', 'Expected a boolean');
        const approvalKeys = new Set<string>();
        if (!Array.isArray(value.adultContent.approvals)) {
            addIssue(issues, 'ARRAY_REQUIRED', '$.adultContent.approvals', 'Expected an array');
        } else {
            if (value.adultContent.approvals.length > MAX_MOD_ADULT_APPROVALS) addIssue(issues, 'ADULT_APPROVAL_LIMIT', '$.adultContent.approvals', `At most ${MAX_MOD_ADULT_APPROVALS} approvals are allowed`);
            value.adultContent.approvals.forEach((approval, index) => {
                const path = `$.adultContent.approvals[${index}]`;
                if (!isRecord(approval)) {
                    addIssue(issues, 'OBJECT_REQUIRED', path, 'Expected an object');
                    return;
                }
                checkAllowedKeys(approval, ['id', 'version', 'manifestHash', 'contentHash'], path, issues);
                if (!isValidModId(approval.id)) addIssue(issues, 'MOD_ID_INVALID', `${path}.id`, 'Invalid MOD ID');
                if (!parseSemVer(approval.version)) addIssue(issues, 'SEMVER_INVALID', `${path}.version`, 'Approval version must be exact SemVer');
                if (!isModSha256(approval.manifestHash)) addIssue(issues, 'HASH_INVALID', `${path}.manifestHash`, 'Invalid manifest SHA-256');
                if (!isModSha256(approval.contentHash)) addIssue(issues, 'HASH_INVALID', `${path}.contentHash`, 'Invalid content SHA-256');
                const key = `${String(approval.id)}\0${String(approval.version)}`;
                if (approvalKeys.has(key)) addIssue(issues, 'DUPLICATE_ADULT_APPROVAL', path, 'Adult approvals for one id@version must be unique');
                approvalKeys.add(key);
            });
        }
    }
    return issues.length > 0
        ? { ok: false, issues: sortedIssues(issues) }
        : { ok: true, value: value as unknown as ModProfile };
}

function parseBoundedJson<T>(
    input: string | Uint8Array,
    validator: (value: unknown) => ModValidationResult<T>,
): ModValidationResult<T> {
    const byteLength = typeof input === 'string' ? Buffer.byteLength(input, 'utf8') : input.byteLength;
    if (byteLength > MAX_MOD_PROFILE_BYTES) {
        return { ok: false, issues: [{ code: 'DOCUMENT_TOO_LARGE', path: '$', message: `Document exceeds ${MAX_MOD_PROFILE_BYTES} bytes` }] };
    }
    try {
        const value = typeof input === 'string' ? parseStrictJson(input) : parseStrictJsonBytes(input);
        return validator(value);
    } catch (error) {
        return {
            ok: false,
            issues: [{
                code: error instanceof ModDataError ? error.code : 'JSON_INVALID',
                path: '$',
                message: error instanceof Error ? error.message : 'Invalid JSON',
            }],
        };
    }
}

export function parseModProfileText(text: string): ModValidationResult<ModProfile> {
    return parseBoundedJson(text, validateModProfile);
}

export function parseModProfileBytes(bytes: Uint8Array): ModValidationResult<ModProfile> {
    return parseBoundedJson(bytes, validateModProfile);
}

export function normalizeModProfile(profile: ModProfile): ModProfile {
    return {
        format: MOD_PROFILE_FORMAT,
        enabled: [...profile.enabled].sort((left, right) => compareUnicodeCodePointOrder(left.id, right.id)
            || compareUnicodeCodePointOrder(left.version, right.version)
            || compareUnicodeCodePointOrder(left.source, right.source)),
        selected: { campaignKit: profile.selected.campaignKit },
        adultContent: {
            allow: profile.adultContent.allow,
            approvals: [...profile.adultContent.approvals].sort((left, right) => compareUnicodeCodePointOrder(left.id, right.id)
                || compareSemVer(left.version, right.version)
                || compareUnicodeCodePointOrder(left.manifestHash, right.manifestHash)
                || compareUnicodeCodePointOrder(left.contentHash, right.contentHash)),
        },
    };
}

export function computeModProfileHash(profile: ModProfile): string {
    return hashCanonicalModJson(normalizeModProfile(profile));
}

export function computeModLockAggregateHash(lockWithoutHash: Omit<ModLock, 'aggregateHash'>): string {
    return hashCanonicalModJson(lockWithoutHash);
}

export function serializeModProfile(profile: ModProfile): string {
    return `${canonicalizeModJson(normalizeModProfile(profile))}\n`;
}

export function serializeModLock(lock: ModLock): string {
    return `${canonicalizeModJson(lock)}\n`;
}

function validateLockedDependency(value: unknown, path: string, issues: ModValidationIssue[]): value is ModLockedDependency {
    if (!isRecord(value)) {
        addIssue(issues, 'OBJECT_REQUIRED', path, 'Expected an object');
        return false;
    }
    checkAllowedKeys(value, ['id', 'version', 'optional'], path, issues);
    if (!isValidModId(value.id)) addIssue(issues, 'MOD_ID_INVALID', `${path}.id`, 'Invalid MOD ID');
    if (!parseSemVer(value.version)) addIssue(issues, 'SEMVER_INVALID', `${path}.version`, 'Expected exact SemVer');
    if (typeof value.optional !== 'boolean') addIssue(issues, 'BOOLEAN_REQUIRED', `${path}.optional`, 'Expected a boolean');
    return true;
}

export function validateModLock(value: unknown): ModValidationResult<ModLock> {
    const issues: ModValidationIssue[] = [];
    if (!isRecord(value)) {
        return { ok: false, issues: [{ code: 'OBJECT_REQUIRED', path: '$', message: 'Lock must be a plain JSON object' }] };
    }
    checkAllowedKeys(value, [
        'format', 'resolverVersion', 'resolvedWithLoreRelay', 'profileHash', 'adultContentAllowed',
        'packages', 'loadOrder', 'selected', 'aggregateHash',
    ], '$', issues);
    if (value.format !== MOD_LOCK_FORMAT) addIssue(issues, 'FORMAT_UNSUPPORTED', '$.format', `Expected ${MOD_LOCK_FORMAT}`);
    if (value.resolverVersion !== MOD_RESOLVER_VERSION) addIssue(issues, 'RESOLVER_VERSION_UNSUPPORTED', '$.resolverVersion', `Expected resolver ${MOD_RESOLVER_VERSION}`);
    if (!parseSemVer(value.resolvedWithLoreRelay)) addIssue(issues, 'SEMVER_INVALID', '$.resolvedWithLoreRelay', 'Expected exact SemVer');
    if (!isModSha256(value.profileHash)) addIssue(issues, 'HASH_INVALID', '$.profileHash', 'Invalid profile SHA-256');
    if (typeof value.adultContentAllowed !== 'boolean') addIssue(issues, 'BOOLEAN_REQUIRED', '$.adultContentAllowed', 'Expected a boolean');
    if (!isModSha256(value.aggregateHash)) addIssue(issues, 'HASH_INVALID', '$.aggregateHash', 'Invalid aggregate SHA-256');

    const packageIds = new Set<string>();
    if (!Array.isArray(value.packages)) {
        addIssue(issues, 'ARRAY_REQUIRED', '$.packages', 'Expected an array');
    } else {
        value.packages.forEach((item, index) => {
            const path = `$.packages[${index}]`;
            if (!isRecord(item)) {
                addIssue(issues, 'OBJECT_REQUIRED', path, 'Expected an object');
                return;
            }
            checkAllowedKeys(item, [
                'id', 'version', 'source', 'manifestHash', 'contentHash', 'contentRating', 'contentTags',
                'capabilities', 'dependencies', 'engineCompatibility',
            ], path, issues);
            if (!isValidModId(item.id)) addIssue(issues, 'MOD_ID_INVALID', `${path}.id`, 'Invalid MOD ID');
            if (typeof item.id === 'string' && packageIds.has(item.id)) addIssue(issues, 'DUPLICATE_LOCKED_ID', `${path}.id`, 'Locked package IDs must be unique');
            if (typeof item.id === 'string') packageIds.add(item.id);
            if (!parseSemVer(item.version)) addIssue(issues, 'SEMVER_INVALID', `${path}.version`, 'Expected exact SemVer');
            if (!['global', 'workspace'].includes(String(item.source))) addIssue(issues, 'SOURCE_INVALID', `${path}.source`, 'Unsupported source');
            if (!isModSha256(item.manifestHash)) addIssue(issues, 'HASH_INVALID', `${path}.manifestHash`, 'Invalid manifest SHA-256');
            if (!isModSha256(item.contentHash)) addIssue(issues, 'HASH_INVALID', `${path}.contentHash`, 'Invalid content SHA-256');
            if (!['general', 'mature', 'adult'].includes(String(item.contentRating))) addIssue(issues, 'CONTENT_RATING_INVALID', `${path}.contentRating`, 'Unsupported content rating');
            if (!Array.isArray(item.contentTags) || item.contentTags.some(tag => typeof tag !== 'string')) {
                addIssue(issues, 'ARRAY_REQUIRED', `${path}.contentTags`, 'Expected content tags');
            } else {
                const tags = item.contentTags as string[];
                const sorted = [...tags].sort(compareUnicodeCodePointOrder);
                if (tags.some(tag => !MOD_CONTENT_TAGS.includes(tag as ModContentTag))) addIssue(issues, 'VALUE_NOT_ALLOWED', `${path}.contentTags`, 'Unsupported content tag');
                if (new Set(tags).size !== tags.length || sorted.some((tag, tagIndex) => tag !== tags[tagIndex])) addIssue(issues, 'SORTED_UNIQUE_REQUIRED', `${path}.contentTags`, 'Content tags must be sorted and unique');
            }
            if (!Array.isArray(item.capabilities) || item.capabilities.some(capability => typeof capability !== 'string')) {
                addIssue(issues, 'ARRAY_REQUIRED', `${path}.capabilities`, 'Expected capabilities');
            } else {
                const capabilities = item.capabilities as string[];
                const sorted = [...capabilities].sort(compareUnicodeCodePointOrder);
                if (capabilities.some(capability => !MOD_CAPABILITIES.includes(capability as ModCapability))) addIssue(issues, 'VALUE_NOT_ALLOWED', `${path}.capabilities`, 'Unsupported capability');
                if (new Set(capabilities).size !== capabilities.length || sorted.some((capability, capabilityIndex) => capability !== capabilities[capabilityIndex])) addIssue(issues, 'SORTED_UNIQUE_REQUIRED', `${path}.capabilities`, 'Capabilities must be sorted and unique');
            }
            if (!Array.isArray(item.dependencies)) {
                addIssue(issues, 'ARRAY_REQUIRED', `${path}.dependencies`, 'Expected dependencies');
            } else {
                item.dependencies.forEach((dependency, dependencyIndex) => validateLockedDependency(dependency, `${path}.dependencies[${dependencyIndex}]`, issues));
            }
            if (item.engineCompatibility !== 'compatible') addIssue(issues, 'ENGINE_COMPATIBILITY_INVALID', `${path}.engineCompatibility`, 'Expected compatible');
        });
    }

    if (!Array.isArray(value.loadOrder) || value.loadOrder.some(id => !isValidModId(id))) {
        addIssue(issues, 'LOAD_ORDER_INVALID', '$.loadOrder', 'Expected an array of MOD IDs');
    } else if (new Set(value.loadOrder).size !== value.loadOrder.length || value.loadOrder.some(id => !packageIds.has(id))) {
        addIssue(issues, 'LOAD_ORDER_MISMATCH', '$.loadOrder', 'Load order must contain each locked package exactly once');
    } else if (packageIds.size !== value.loadOrder.length) {
        addIssue(issues, 'LOAD_ORDER_MISMATCH', '$.loadOrder', 'Load order must contain each locked package exactly once');
    }
    if (!isRecord(value.selected)) {
        addIssue(issues, 'OBJECT_REQUIRED', '$.selected', 'Expected an object');
    } else {
        checkAllowedKeys(value.selected, ['campaignKit'], '$.selected', issues);
        if (value.selected.campaignKit !== null) {
            const parsed = typeof value.selected.campaignKit === 'string'
                ? splitCanonicalResourceId(value.selected.campaignKit)
                : undefined;
            if (!parsed || parsed.namespace !== 'mod') {
                addIssue(issues, 'CAMPAIGN_KIT_SELECTION_INVALID', '$.selected.campaignKit', 'Expected null or canonical MOD resource ID');
            }
        }
    }
    if (issues.length === 0) {
        const typed = value as unknown as ModLock;
        const packageById = new Map(typed.packages.map(pkg => [pkg.id, pkg]));
        if (typed.packages.some(pkg => pkg.contentRating === 'adult') && !typed.adultContentAllowed) {
            addIssue(issues, 'ADULT_LOCK_NOT_ALLOWED', '$.adultContentAllowed', 'A lock containing an adult package must record adult content as allowed');
        }
        typed.packages.forEach((pkg, packageIndex) => {
            if (typed.loadOrder[packageIndex] !== pkg.id) {
                addIssue(issues, 'PACKAGE_ORDER_MISMATCH', `$.packages[${packageIndex}].id`, 'Package array must exactly follow loadOrder');
            }
            const dependencyIds = new Set<string>();
            pkg.dependencies.forEach((dependency, dependencyIndex) => {
                const dependencyPath = `$.packages[${packageIndex}].dependencies[${dependencyIndex}]`;
                if (dependencyIds.has(dependency.id)) addIssue(issues, 'DUPLICATE_LOCKED_DEPENDENCY', dependencyPath, 'Locked dependency IDs must be unique');
                dependencyIds.add(dependency.id);
                if (dependency.id === pkg.id) addIssue(issues, 'SELF_DEPENDENCY', dependencyPath, 'A locked package cannot depend on itself');
                const target = packageById.get(dependency.id);
                if (!target || target.version !== dependency.version) addIssue(issues, 'LOCKED_DEPENDENCY_MISMATCH', dependencyPath, 'Locked dependency must name an exact selected package version');
                if (dependencyIndex > 0 && compareUnicodeCodePointOrder(pkg.dependencies[dependencyIndex - 1].id, dependency.id) >= 0) {
                    addIssue(issues, 'LOCKED_DEPENDENCY_ORDER_INVALID', dependencyPath, 'Locked dependencies must be sorted by MOD ID');
                }
            });
        });
        if (typed.selected.campaignKit) {
            const selected = splitCanonicalResourceId(typed.selected.campaignKit);
            const owner = selected?.namespace === 'mod' ? packageById.get(selected.modId) : undefined;
            if (!owner || !owner.capabilities.includes('campaign-kit')) {
                addIssue(issues, 'CAMPAIGN_KIT_SELECTION_INVALID', '$.selected.campaignKit', 'Selected campaign kit owner must be a locked campaign-kit package');
            }
        }
    }
    if (isModSha256(value.aggregateHash)) {
        const { aggregateHash: _ignored, ...body } = value;
        try {
            const expected = hashCanonicalModJson(body);
            if (expected !== value.aggregateHash) addIssue(issues, 'LOCK_AGGREGATE_HASH_MISMATCH', '$.aggregateHash', 'Lock aggregate hash does not match its canonical body');
        } catch {
            addIssue(issues, 'LOCK_NOT_CANONICAL_JSON', '$', 'Lock contains a value outside canonical JSON');
        }
    }
    return issues.length > 0
        ? { ok: false, issues: sortedIssues(issues) }
        : { ok: true, value: value as unknown as ModLock };
}

export function parseModLockText(text: string): ModValidationResult<ModLock> {
    return parseBoundedJson(text, validateModLock);
}

export function parseModLockBytes(bytes: Uint8Array): ModValidationResult<ModLock> {
    return parseBoundedJson(bytes, validateModLock);
}
