import { isLoreRelayVersionCompatible, parseSemVer, validateModManifest } from './modManifestCore';
import { hashCanonicalModJson } from './modHashCore';
import {
    MOD_RESOLVER_VERSION,
    ModLock,
    validateModLock,
} from './modProfileCore';
import { ModPackageCandidate } from './modResolverCore';
import { compareUnicodeCodePointOrder, validateInstalledDirectoryIdentity } from './modPathCore';

export const MOD_CONTEXT_FORMAT = 'lorerelay-mod-context/1' as const;
export const SAFE_MODE_HISTORY_PLACEHOLDER = '[MOD content hidden in Safe Mode]';

export interface ModContext {
    format: typeof MOD_CONTEXT_FORMAT;
    lockFingerprint: string;
    adultActive: boolean;
}

export type ModSafeModeAction =
    | 'diagnostics-export'
    | 'package-install-rescan'
    | 'adult-visibility-choice'
    | 'restore-inspection'
    | 'recovery-fork'
    | 'provider-turn'
    | 'combat'
    | 'economy'
    | 'travel'
    | 'world-generation'
    | 'normal-save'
    | 'checkpoint-write'
    | 'canonical-mutation';

export const SAFE_MODE_ALLOWED_ACTIONS: ReadonlySet<ModSafeModeAction> = new Set([
    'diagnostics-export',
    'package-install-rescan',
    'adult-visibility-choice',
    'restore-inspection',
    'recovery-fork',
]);

export interface ModOpenDiagnostic {
    code: string;
    modId: string;
    message: string;
}

export type ModOpenDecision =
    | {
        mode: 'unmodded';
        contributionsActive: false;
        canonicalWritesAllowed: true;
        providerRequestsAllowed: true;
        blockers: [];
        warnings: ModOpenDiagnostic[];
    }
    | {
        mode: 'normal';
        contributionsActive: true;
        canonicalWritesAllowed: true;
        providerRequestsAllowed: true;
        blockers: [];
        warnings: ModOpenDiagnostic[];
    }
    | {
        mode: 'safe-required';
        contributionsActive: false;
        canonicalWritesAllowed: false;
        providerRequestsAllowed: false;
        blockers: ModOpenDiagnostic[];
        warnings: ModOpenDiagnostic[];
    };

export interface ModHistoryPresentationDecision {
    presentation: 'show' | 'placeholder';
    reason:
        | 'USER_AUTHORED'
        | 'ADULT_VISIBILITY_ALLOWED'
        | 'NO_ADULT_CONTEXT'
        | 'ADULT_CONTEXT_ACTIVE'
        | 'MISSING_OR_INVALID_CONTEXT';
    placeholder?: string;
}

function sortedDiagnostics(diagnostics: readonly ModOpenDiagnostic[]): ModOpenDiagnostic[] {
    return [...diagnostics].sort((left, right) => compareUnicodeCodePointOrder(left.code, right.code)
        || compareUnicodeCodePointOrder(left.modId, right.modId)
        || compareUnicodeCodePointOrder(left.message, right.message));
}

export function isSafeModeActionAllowed(action: ModSafeModeAction): boolean {
    return SAFE_MODE_ALLOWED_ACTIONS.has(action);
}

export function buildModContext(lock: ModLock): ModContext {
    return {
        format: MOD_CONTEXT_FORMAT,
        lockFingerprint: lock.aggregateHash,
        adultActive: lock.packages.some(pkg => pkg.contentRating === 'adult'),
    };
}

export function parseModContext(value: unknown): ModContext | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareUnicodeCodePointOrder);
    if (keys.length !== 3 || keys[0] !== 'adultActive' || keys[1] !== 'format' || keys[2] !== 'lockFingerprint') return undefined;
    if (record.format !== MOD_CONTEXT_FORMAT
        || typeof record.adultActive !== 'boolean'
        || typeof record.lockFingerprint !== 'string'
        || !/^sha256:[a-f0-9]{64}$/.test(record.lockFingerprint)) {
        return undefined;
    }
    return record as unknown as ModContext;
}

export function decideSafeModeHistoryPresentation(input: {
    author: 'user' | 'machine';
    modContext: unknown;
    adultVisibilityAllowed: boolean;
    campaignMayHaveAdultModHistory: boolean;
    knownLockFingerprints?: readonly string[];
}): ModHistoryPresentationDecision {
    if (input.author === 'user') return { presentation: 'show', reason: 'USER_AUTHORED' };
    if (input.adultVisibilityAllowed) return { presentation: 'show', reason: 'ADULT_VISIBILITY_ALLOWED' };
    const context = parseModContext(input.modContext);
    const contextIsKnown = context && (!input.knownLockFingerprints
        || input.knownLockFingerprints.includes(context.lockFingerprint));
    if (contextIsKnown && context.adultActive) {
        return {
            presentation: 'placeholder',
            reason: 'ADULT_CONTEXT_ACTIVE',
            placeholder: SAFE_MODE_HISTORY_PLACEHOLDER,
        };
    }
    if (contextIsKnown) return { presentation: 'show', reason: 'NO_ADULT_CONTEXT' };
    if (input.campaignMayHaveAdultModHistory) {
        return {
            presentation: 'placeholder',
            reason: 'MISSING_OR_INVALID_CONTEXT',
            placeholder: SAFE_MODE_HISTORY_PLACEHOLDER,
        };
    }
    return { presentation: 'show', reason: 'NO_ADULT_CONTEXT' };
}

export function assessModCampaignOpen(input: {
    lock?: ModLock;
    installedCandidates: readonly ModPackageCandidate[];
    currentLoreRelayVersion: string;
    adultSessionAllowed: boolean;
    activeProfileHash?: string;
}): ModOpenDecision {
    const warnings: ModOpenDiagnostic[] = [];
    const blockers: ModOpenDiagnostic[] = [];
    if (!input.lock) {
        return {
            mode: 'unmodded',
            contributionsActive: false,
            canonicalWritesAllowed: true,
            providerRequestsAllowed: true,
            blockers: [],
            warnings,
        };
    }
    const lockValidation = validateModLock(input.lock);
    if (!lockValidation.ok) {
        for (const issue of lockValidation.issues) {
            blockers.push({ code: `LOCK_${issue.code}`, modId: '', message: `${issue.path}: ${issue.message}` });
        }
        return {
            mode: 'safe-required',
            contributionsActive: false,
            canonicalWritesAllowed: false,
            providerRequestsAllowed: false,
            blockers: sortedDiagnostics(blockers),
            warnings,
        };
    }
    if (input.lock.resolverVersion !== MOD_RESOLVER_VERSION) {
        blockers.push({ code: 'RESOLVER_VERSION_CHANGED', modId: '', message: 'Explicit re-resolution or migration is required' });
    }
    if (!parseSemVer(input.currentLoreRelayVersion)) {
        blockers.push({ code: 'ENGINE_VERSION_INVALID', modId: '', message: 'Current LoreRelay version is invalid' });
    } else if (input.currentLoreRelayVersion !== input.lock.resolvedWithLoreRelay) {
        warnings.push({ code: 'ENGINE_VERSION_DRIFT', modId: '', message: `Lock used ${input.lock.resolvedWithLoreRelay}; current version is ${input.currentLoreRelayVersion}` });
    }
    if (input.activeProfileHash && input.activeProfileHash !== input.lock.profileHash) {
        warnings.push({ code: 'PROFILE_DRIFT', modId: '', message: 'Active profile differs from the locked profile; the lock remains authoritative' });
    }

    for (const locked of input.lock.packages) {
        const candidate = input.installedCandidates.find(item => item.manifest.id === locked.id
            && item.manifest.version === locked.version
            && item.source === locked.source);
        if (!candidate) {
            blockers.push({ code: 'LOCKED_PACKAGE_MISSING', modId: locked.id, message: `Missing exact ${locked.source} package ${locked.id}@${locked.version}` });
            continue;
        }
        const directoryIdentity = validateInstalledDirectoryIdentity({
            directoryId: candidate.directoryId,
            directoryVersion: candidate.directoryVersion,
            manifestId: candidate.manifest.id,
            manifestVersion: candidate.manifest.version,
            isValidVersion: value => parseSemVer(value) !== undefined,
        });
        if (!directoryIdentity.ok) {
            blockers.push({ code: directoryIdentity.code, modId: locked.id, message: 'Installed directory identity does not match the manifest' });
            continue;
        }
        const manifestValidation = validateModManifest(candidate.manifest);
        if (!manifestValidation.ok) {
            blockers.push({ code: 'LOCKED_MANIFEST_INVALID', modId: locked.id, message: 'Installed manifest is no longer valid' });
            continue;
        }
        let actualManifestHash: string;
        try {
            actualManifestHash = hashCanonicalModJson(candidate.manifest);
        } catch {
            blockers.push({ code: 'LOCKED_MANIFEST_NOT_CANONICAL_JSON', modId: locked.id, message: 'Installed manifest cannot be canonicalized' });
            continue;
        }
        if (candidate.manifestHash !== actualManifestHash
            || locked.manifestHash !== actualManifestHash
            || locked.contentHash !== candidate.contentHash) {
            blockers.push({ code: 'LOCKED_PACKAGE_HASH_MISMATCH', modId: locked.id, message: 'Installed package differs from the exact locked hashes' });
        }
        if (!isLoreRelayVersionCompatible(candidate.manifest, input.currentLoreRelayVersion)) {
            blockers.push({ code: 'ENGINE_INCOMPATIBLE', modId: locked.id, message: `Package is incompatible with LoreRelay ${input.currentLoreRelayVersion}` });
        }
        if (locked.contentRating === 'adult' && !input.adultSessionAllowed) {
            blockers.push({ code: 'ADULT_SESSION_PERMISSION_REQUIRED', modId: locked.id, message: 'Adult session permission is required before activation' });
        }
    }
    if (blockers.length > 0) {
        return {
            mode: 'safe-required',
            contributionsActive: false,
            canonicalWritesAllowed: false,
            providerRequestsAllowed: false,
            blockers: sortedDiagnostics(blockers),
            warnings: sortedDiagnostics(warnings),
        };
    }
    return {
        mode: 'normal',
        contributionsActive: true,
        canonicalWritesAllowed: true,
        providerRequestsAllowed: true,
        blockers: [],
        warnings: sortedDiagnostics(warnings),
    };
}
