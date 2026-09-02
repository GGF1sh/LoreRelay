import {
    ModManifest,
    ModValidationIssue,
    compareSemVer,
    isLoreRelayVersionCompatible,
    parseSemVer,
    satisfiesSemVerRange,
    validateModManifest,
} from './modManifestCore';
import { hashCanonicalModJson, isModSha256 } from './modHashCore';
import {
    MOD_LOCK_FORMAT,
    MOD_RESOLVER_VERSION,
    MAX_MOD_LOCK_BYTES,
    ModLock,
    ModLockedDependency,
    ModLockedPackage,
    ModProfile,
    ModResolvedSource,
    ModSourcePreference,
    computeModLockAggregateHash,
    computeModProfileHash,
    parseModLockText,
    serializeModLock,
    validateModProfile,
} from './modProfileCore';
import {
    compareUnicodeCodePointOrder,
    splitCanonicalResourceId,
    validateInstalledDirectoryIdentity,
} from './modPathCore';

/** Hard semantic limits for resolver version 1. Wall-clock time is never authoritative. */
export const MAX_MOD_RESOLVER_CANDIDATES = 512;
export const MAX_MOD_RESOLVER_SEARCH_STEPS = 10_000;

export interface ModPackageCandidate {
    source: ModResolvedSource;
    directoryId: string;
    directoryVersion: string;
    manifest: ModManifest;
    manifestHash: string;
    contentHash: string;
}

export interface ModResolverDiagnostic {
    code: string;
    modId: string;
    dependencyPath: string;
    message: string;
}

export interface ModResolverMetrics {
    candidateCount: number;
    searchSteps: number;
}

export type ModResolutionResult =
    | {
        ok: true;
        lock: ModLock;
        warnings: ModResolverDiagnostic[];
        metrics: ModResolverMetrics;
    }
    | {
        ok: false;
        diagnostics: ModResolverDiagnostic[];
        metrics: ModResolverMetrics;
    };

interface CandidateGroup {
    id: string;
    version: string;
    global?: ModPackageCandidate;
    workspace?: ModPackageCandidate;
}

interface RangeConstraint {
    range: string;
    path: string;
}

interface ConstraintState {
    source: ModSourcePreference;
    ranges: RangeConstraint[];
}

interface SearchState {
    constraints: Map<string, ConstraintState>;
    assignments: Map<string, ModPackageCandidate>;
    assignmentPaths: Map<string, string>;
}

interface RecordedFailure {
    depth: number;
    visitation: number;
    diagnostics: ModResolverDiagnostic[];
}

function diagnostic(code: string, modId: string, dependencyPath: string, message: string): ModResolverDiagnostic {
    return { code, modId, dependencyPath, message };
}

function sortDiagnostics(diagnostics: readonly ModResolverDiagnostic[]): ModResolverDiagnostic[] {
    return [...diagnostics].sort((left, right) => compareUnicodeCodePointOrder(left.code, right.code)
        || compareUnicodeCodePointOrder(left.modId, right.modId)
        || compareUnicodeCodePointOrder(left.dependencyPath, right.dependencyPath)
        || compareUnicodeCodePointOrder(left.message, right.message));
}

function fromValidationIssues(prefix: string, issues: readonly ModValidationIssue[]): ModResolverDiagnostic[] {
    return issues.map(issue => diagnostic(issue.code, prefix, prefix, `${issue.path}: ${issue.message}`));
}

function cloneSearchState(state: SearchState): SearchState {
    return {
        constraints: new Map([...state.constraints].map(([id, constraint]) => [id, {
            source: constraint.source,
            ranges: constraint.ranges.map(range => ({ ...range })),
        }])),
        assignments: new Map(state.assignments),
        assignmentPaths: new Map(state.assignmentPaths),
    };
}

function groupCandidates(candidates: readonly ModPackageCandidate[]):
    | { ok: true; groups: Map<string, CandidateGroup[]> }
    | { ok: false; diagnostics: ModResolverDiagnostic[] } {
    const diagnostics: ModResolverDiagnostic[] = [];
    const groupsByKey = new Map<string, CandidateGroup>();
    const seenSourceKeys = new Set<string>();
    for (const candidate of candidates) {
        if (candidate.source !== 'global' && candidate.source !== 'workspace') {
            diagnostics.push(diagnostic('CANDIDATE_SOURCE_INVALID', typeof candidate.manifest?.id === 'string' ? candidate.manifest.id : '', '', 'Candidate source must be global or workspace'));
            continue;
        }
        const identity = validateInstalledDirectoryIdentity({
            directoryId: candidate.directoryId,
            directoryVersion: candidate.directoryVersion,
            manifestId: candidate.manifest?.id,
            manifestVersion: candidate.manifest?.version,
            isValidVersion: value => parseSemVer(value) !== undefined,
        });
        const candidateId = typeof candidate.manifest?.id === 'string'
            ? candidate.manifest.id
            : typeof candidate.directoryId === 'string' ? candidate.directoryId : '';
        const path = typeof candidate.directoryId === 'string' && typeof candidate.directoryVersion === 'string'
            ? `${candidate.directoryId}@${candidate.directoryVersion}`
            : '';
        if (!identity.ok) {
            diagnostics.push(diagnostic(identity.code, candidateId, path, 'Installed directory identity does not exactly match the manifest'));
            continue;
        }
        const manifestValidation = validateModManifest(candidate.manifest);
        if (!manifestValidation.ok) {
            diagnostics.push(...fromValidationIssues(candidateId, manifestValidation.issues));
            continue;
        }
        if (!isModSha256(candidate.manifestHash) || !isModSha256(candidate.contentHash)) {
            diagnostics.push(diagnostic('CANDIDATE_HASH_INVALID', candidateId, path, 'Candidate hashes must use sha256:<lowercase-hex>'));
            continue;
        }
        try {
            if (hashCanonicalModJson(candidate.manifest) !== candidate.manifestHash) {
                diagnostics.push(diagnostic('MANIFEST_HASH_MISMATCH', candidateId, path, 'Candidate manifestHash does not match the canonical manifest'));
                continue;
            }
        } catch {
            diagnostics.push(diagnostic('MANIFEST_NOT_CANONICAL_JSON', candidateId, path, 'Candidate manifest is not canonicalizable JSON'));
            continue;
        }
        const sourceKey = `${candidateId}\0${candidate.manifest.version}\0${candidate.source}`;
        if (seenSourceKeys.has(sourceKey)) {
            diagnostics.push(diagnostic('SAME_SOURCE_DUPLICATE', candidateId, path, `Duplicate ${candidate.source} candidate for the same id@version`));
            continue;
        }
        seenSourceKeys.add(sourceKey);
        const groupKey = `${candidateId}\0${candidate.manifest.version}`;
        let group = groupsByKey.get(groupKey);
        if (!group) {
            group = { id: candidateId, version: candidate.manifest.version };
            groupsByKey.set(groupKey, group);
        }
        group[candidate.source] = candidate;
    }
    if (diagnostics.length > 0) return { ok: false, diagnostics: sortDiagnostics(diagnostics) };

    const groups = new Map<string, CandidateGroup[]>();
    for (const group of groupsByKey.values()) {
        const list = groups.get(group.id) ?? [];
        list.push(group);
        groups.set(group.id, list);
    }
    for (const list of groups.values()) {
        list.sort((left, right) => {
            const precedence = compareSemVer(right.version, left.version);
            return precedence || compareUnicodeCodePointOrder(right.version, left.version);
        });
    }
    return { ok: true, groups };
}

function selectLogicalCandidates(
    modId: string,
    constraint: ConstraintState,
    groups: ReadonlyMap<string, CandidateGroup[]>,
    loreRelayVersion: string,
): { candidates: ModPackageCandidate[]; diagnostics: ModResolverDiagnostic[] } {
    const eligibleGroups = (groups.get(modId) ?? []).filter(group => constraint.ranges.every(item => satisfiesSemVerRange(group.version, item.range)));
    const candidates: ModPackageCandidate[] = [];
    const duplicateVariantDiagnostics: ModResolverDiagnostic[] = [];
    let hadSourceCandidate = false;
    let hadCompatibleCandidate = false;
    for (const group of eligibleGroups) {
        let candidate: ModPackageCandidate | undefined;
        if (constraint.source === 'global') {
            candidate = group.global;
        } else if (constraint.source === 'workspace') {
            candidate = group.workspace;
        } else if (group.global && group.workspace) {
            hadSourceCandidate = true;
            if (group.global.manifestHash !== group.workspace.manifestHash
                || group.global.contentHash !== group.workspace.contentHash) {
                duplicateVariantDiagnostics.push(diagnostic(
                    'DUPLICATE_VARIANT',
                    modId,
                    constraint.ranges[0]?.path ?? modId,
                    `Global and workspace variants differ for ${modId}@${group.version}`,
                ));
                continue;
            }
            candidate = group.workspace;
        } else {
            candidate = group.workspace ?? group.global;
        }
        if (!candidate) continue;
        hadSourceCandidate = true;
        if (!isLoreRelayVersionCompatible(candidate.manifest, loreRelayVersion)) continue;
        hadCompatibleCandidate = true;
        candidates.push(candidate);
    }
    if (duplicateVariantDiagnostics.length > 0) {
        return { candidates: [], diagnostics: sortDiagnostics(duplicateVariantDiagnostics) };
    }
    if (candidates.length > 0) return { candidates, diagnostics: [] };
    const path = constraint.ranges[0]?.path ?? modId;
    if (hadSourceCandidate && !hadCompatibleCandidate) {
        return {
            candidates: [],
            diagnostics: [diagnostic('ENGINE_INCOMPATIBLE', modId, path, `No compatible ${modId} candidate for LoreRelay ${loreRelayVersion}`)],
        };
    }
    return {
        candidates: [],
        diagnostics: [diagnostic('REQUIRED_PACKAGE_UNAVAILABLE', modId, path, `No installed candidate satisfies the required ranges and source restriction`)],
    };
}

function checkAssignedConstraints(state: SearchState): ModResolverDiagnostic[] {
    const diagnostics: ModResolverDiagnostic[] = [];
    for (const [id, candidate] of state.assignments) {
        const constraint = state.constraints.get(id);
        if (!constraint) continue;
        const failed = constraint.ranges.filter(item => !satisfiesSemVerRange(candidate.manifest.version, item.range));
        for (const item of failed) {
            diagnostics.push(diagnostic('ASSIGNED_VERSION_OUTSIDE_RANGE', id, item.path, `${candidate.manifest.version} does not satisfy ${item.range}`));
        }
        if (constraint.source !== 'any' && candidate.source !== constraint.source) {
            diagnostics.push(diagnostic('ASSIGNED_SOURCE_MISMATCH', id, state.assignmentPaths.get(id) ?? id, `Expected ${constraint.source}, got ${candidate.source}`));
        }
    }
    return diagnostics;
}

function checkConflicts(state: SearchState): ModResolverDiagnostic[] {
    const diagnostics: ModResolverDiagnostic[] = [];
    const sortedIds = [...state.assignments.keys()].sort(compareUnicodeCodePointOrder);
    for (const id of sortedIds) {
        const candidate = state.assignments.get(id)!;
        for (const conflict of [...candidate.manifest.conflicts].sort((left, right) => compareUnicodeCodePointOrder(left.id, right.id))) {
            const target = state.assignments.get(conflict.id);
            if (target && satisfiesSemVerRange(target.manifest.version, conflict.version)) {
                diagnostics.push(diagnostic(
                    'DECLARED_CONFLICT',
                    id,
                    `${state.assignmentPaths.get(id) ?? id}>!${conflict.id}`,
                    conflict.reason ? `Conflict with ${conflict.id}@${target.manifest.version}: ${conflict.reason}` : `Conflict with ${conflict.id}@${target.manifest.version}`,
                ));
            }
        }
    }
    return diagnostics;
}

function findDependencyCycle(assignments: ReadonlyMap<string, ModPackageCandidate>): string[] | undefined {
    const color = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    const visit = (id: string): string[] | undefined => {
        color.set(id, 1);
        stack.push(id);
        const candidate = assignments.get(id)!;
        const dependencies = candidate.manifest.dependencies
            .map(dependency => dependency.id)
            .filter(dependencyId => assignments.has(dependencyId))
            .sort(compareUnicodeCodePointOrder);
        for (const dependencyId of dependencies) {
            if (color.get(dependencyId) === 1) {
                const start = stack.indexOf(dependencyId);
                return [...stack.slice(start), dependencyId];
            }
            if ((color.get(dependencyId) ?? 0) === 0) {
                const cycle = visit(dependencyId);
                if (cycle) return cycle;
            }
        }
        stack.pop();
        color.set(id, 2);
        return undefined;
    };
    for (const id of [...assignments.keys()].sort(compareUnicodeCodePointOrder)) {
        if ((color.get(id) ?? 0) === 0) {
            const cycle = visit(id);
            if (cycle) return cycle;
        }
    }
    return undefined;
}

function validateTentativeState(state: SearchState): ModResolverDiagnostic[] {
    const diagnostics = [...checkAssignedConstraints(state), ...checkConflicts(state)];
    const cycle = findDependencyCycle(state.assignments);
    if (cycle) {
        diagnostics.push(diagnostic('DEPENDENCY_CYCLE', cycle[0], cycle.join('>'), `Required dependency cycle: ${cycle.join(' -> ')}`));
    }
    return sortDiagnostics(diagnostics);
}

function addRequiredDependencies(state: SearchState, candidate: ModPackageCandidate): void {
    const parentPath = state.assignmentPaths.get(candidate.manifest.id) ?? candidate.manifest.id;
    for (const dependency of [...candidate.manifest.dependencies].sort((left, right) => compareUnicodeCodePointOrder(left.id, right.id))) {
        const dependencyPath = `${parentPath}>${dependency.id}`;
        const existing = state.constraints.get(dependency.id);
        if (existing) {
            existing.ranges.push({ range: dependency.version, path: dependencyPath });
            existing.ranges.sort((left, right) => compareUnicodeCodePointOrder(left.path, right.path)
                || compareUnicodeCodePointOrder(left.range, right.range));
        } else {
            state.constraints.set(dependency.id, {
                source: 'any',
                ranges: [{ range: dependency.version, path: dependencyPath }],
            });
        }
    }
}

function buildLoadOrder(
    assignments: ReadonlyMap<string, ModPackageCandidate>,
    optionalEdges: ReadonlyArray<{ dependency: string; dependent: string }>,
): string[] {
    const outgoing = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();
    for (const id of assignments.keys()) {
        outgoing.set(id, new Set());
        indegree.set(id, 0);
    }
    const addEdge = (dependency: string, dependent: string): void => {
        const targets = outgoing.get(dependency);
        if (!targets || targets.has(dependent)) return;
        targets.add(dependent);
        indegree.set(dependent, (indegree.get(dependent) ?? 0) + 1);
    };
    for (const [dependent, candidate] of assignments) {
        for (const dependency of candidate.manifest.dependencies) addEdge(dependency.id, dependent);
    }
    for (const edge of optionalEdges) addEdge(edge.dependency, edge.dependent);

    const ready = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id).sort(compareUnicodeCodePointOrder);
    const order: string[] = [];
    while (ready.length > 0) {
        const id = ready.shift()!;
        order.push(id);
        for (const dependent of [...(outgoing.get(id) ?? [])].sort(compareUnicodeCodePointOrder)) {
            const next = (indegree.get(dependent) ?? 0) - 1;
            indegree.set(dependent, next);
            if (next === 0) {
                ready.push(dependent);
                ready.sort(compareUnicodeCodePointOrder);
            }
        }
    }
    if (order.length !== assignments.size) throw new Error('buildLoadOrder received a cyclic graph');
    return order;
}

function collectOptionalEdges(assignments: ReadonlyMap<string, ModPackageCandidate>): {
    edges: Array<{ dependency: string; dependent: string }>;
    warnings: ModResolverDiagnostic[];
} {
    const edges: Array<{ dependency: string; dependent: string }> = [];
    const warnings: ModResolverDiagnostic[] = [];
    const outgoing = new Map<string, Set<string>>([...assignments.keys()].map(id => [id, new Set<string>()]));
    for (const [dependent, candidate] of assignments) {
        for (const dependency of candidate.manifest.dependencies) outgoing.get(dependency.id)?.add(dependent);
    }
    const reaches = (start: string, target: string): boolean => {
        const pending = [start];
        const seen = new Set<string>();
        while (pending.length > 0) {
            const current = pending.pop()!;
            if (current === target) return true;
            if (seen.has(current)) continue;
            seen.add(current);
            pending.push(...[...(outgoing.get(current) ?? [])].sort(compareUnicodeCodePointOrder).reverse());
        }
        return false;
    };
    for (const id of [...assignments.keys()].sort(compareUnicodeCodePointOrder)) {
        const candidate = assignments.get(id)!;
        for (const dependency of [...candidate.manifest.optionalDependencies].sort((left, right) => compareUnicodeCodePointOrder(left.id, right.id))) {
            const target = assignments.get(dependency.id);
            if (!target) {
                warnings.push(diagnostic('OPTIONAL_DEPENDENCY_NOT_SELECTED', id, `${id}>?${dependency.id}`, `Optional dependency ${dependency.id} is not selected`));
            } else if (!satisfiesSemVerRange(target.manifest.version, dependency.version)) {
                warnings.push(diagnostic('OPTIONAL_DEPENDENCY_VERSION_MISMATCH', id, `${id}>?${dependency.id}`, `Selected ${dependency.id}@${target.manifest.version} does not satisfy ${dependency.version}`));
            } else if (reaches(id, dependency.id)) {
                warnings.push(diagnostic('OPTIONAL_DEPENDENCY_CYCLE_OMITTED', id, `${id}>?${dependency.id}`, `Optional ordering edge from ${dependency.id} to ${id} would create a cycle`));
            } else {
                edges.push({ dependency: dependency.id, dependent: id });
                outgoing.get(dependency.id)?.add(id);
            }
        }
    }
    return { edges, warnings: sortDiagnostics(warnings) };
}

function validateAdultApprovals(profile: ModProfile, assignments: ReadonlyMap<string, ModPackageCandidate>): ModResolverDiagnostic[] {
    const diagnostics: ModResolverDiagnostic[] = [];
    for (const id of [...assignments.keys()].sort(compareUnicodeCodePointOrder)) {
        const candidate = assignments.get(id)!;
        if (candidate.manifest.contentRating !== 'adult') continue;
        if (!profile.adultContent.allow) {
            diagnostics.push(diagnostic('ADULT_CONTENT_NOT_ALLOWED', id, id, 'Profile adultContent.allow must be true'));
            continue;
        }
        const approved = profile.adultContent.approvals.some(approval => approval.id === id
            && approval.version === candidate.manifest.version
            && approval.manifestHash === candidate.manifestHash
            && approval.contentHash === candidate.contentHash);
        if (!approved) {
            diagnostics.push(diagnostic('ADULT_REAPPROVAL_REQUIRED', id, id, 'Exact id, version, manifestHash, and contentHash approval is required'));
        }
    }
    return sortDiagnostics(diagnostics);
}

function validateSelectedCampaignKit(profile: ModProfile, assignments: ReadonlyMap<string, ModPackageCandidate>): ModResolverDiagnostic[] {
    if (profile.selected.campaignKit === null) return [];
    const parsed = splitCanonicalResourceId(profile.selected.campaignKit);
    if (!parsed || parsed.namespace !== 'mod') {
        return [diagnostic('CAMPAIGN_KIT_SELECTION_INVALID', '', 'selected.campaignKit', 'Invalid canonical campaign kit ID')];
    }
    const candidate = assignments.get(parsed.modId);
    if (!candidate || !candidate.manifest.capabilities.includes('campaign-kit')) {
        return [diagnostic('CAMPAIGN_KIT_PACKAGE_UNAVAILABLE', parsed.modId, 'selected.campaignKit', 'Selected campaign kit package is not resolved with campaign-kit capability')];
    }
    const declared = candidate.manifest.entrypoints.campaignKits?.some(entry => entry.id === parsed.localId) ?? false;
    return declared
        ? []
        : [diagnostic('CAMPAIGN_KIT_NOT_DECLARED', parsed.modId, 'selected.campaignKit', 'Selected campaign kit is not declared by the resolved package')];
}

function buildLock(
    profile: ModProfile,
    assignments: ReadonlyMap<string, ModPackageCandidate>,
    loreRelayVersion: string,
): { lock: ModLock; warnings: ModResolverDiagnostic[] } {
    const optional = collectOptionalEdges(assignments);
    const loadOrder = buildLoadOrder(assignments, optional.edges);
    const packages: ModLockedPackage[] = loadOrder.map(id => {
        const candidate = assignments.get(id)!;
        const dependencies: ModLockedDependency[] = candidate.manifest.dependencies
            .map(dependency => ({
                id: dependency.id,
                version: assignments.get(dependency.id)!.manifest.version,
                optional: false,
            }))
            .concat(optional.edges.filter(edge => edge.dependent === id).map(edge => ({
                id: edge.dependency,
                version: assignments.get(edge.dependency)!.manifest.version,
                optional: true,
            })))
            .sort((left, right) => compareUnicodeCodePointOrder(left.id, right.id));
        return {
            id,
            version: candidate.manifest.version,
            source: candidate.source,
            manifestHash: candidate.manifestHash,
            contentHash: candidate.contentHash,
            contentRating: candidate.manifest.contentRating,
            contentTags: [...candidate.manifest.contentTags],
            capabilities: [...candidate.manifest.capabilities],
            dependencies,
            engineCompatibility: 'compatible',
        };
    });
    const body: Omit<ModLock, 'aggregateHash'> = {
        format: MOD_LOCK_FORMAT,
        resolverVersion: MOD_RESOLVER_VERSION,
        resolvedWithLoreRelay: loreRelayVersion,
        profileHash: computeModProfileHash(profile),
        adultContentAllowed: profile.adultContent.allow,
        packages,
        loadOrder,
        selected: { campaignKit: profile.selected.campaignKit },
    };
    return { lock: { ...body, aggregateHash: computeModLockAggregateHash(body) }, warnings: optional.warnings };
}

export function resolveModProfile(
    profile: ModProfile,
    installedCandidates: readonly ModPackageCandidate[],
    loreRelayVersion: string,
): ModResolutionResult {
    const metrics: ModResolverMetrics = { candidateCount: installedCandidates.length, searchSteps: 0 };
    if (installedCandidates.length > MAX_MOD_RESOLVER_CANDIDATES) {
        return {
            ok: false,
            diagnostics: [diagnostic(
                'RESOLUTION_COMPLEXITY_LIMIT',
                '',
                'candidates',
                `Candidate count ${installedCandidates.length} exceeds deterministic limit ${MAX_MOD_RESOLVER_CANDIDATES}`,
            )],
            metrics,
        };
    }
    if (!parseSemVer(loreRelayVersion)) {
        return { ok: false, diagnostics: [diagnostic('ENGINE_VERSION_INVALID', '', 'engine', 'LoreRelay version must be exact SemVer')], metrics };
    }
    const profileValidation = validateModProfile(profile);
    if (!profileValidation.ok) {
        return { ok: false, diagnostics: sortDiagnostics(fromValidationIssues('profile', profileValidation.issues)), metrics };
    }
    const grouped = groupCandidates(installedCandidates);
    if (!grouped.ok) return { ok: false, diagnostics: grouped.diagnostics, metrics };

    const initialState: SearchState = {
        constraints: new Map(),
        assignments: new Map(),
        assignmentPaths: new Map(),
    };
    for (const entry of [...profile.enabled].sort((left, right) => compareUnicodeCodePointOrder(left.id, right.id))) {
        initialState.constraints.set(entry.id, {
            source: entry.source,
            ranges: [{ range: entry.version, path: entry.id }],
        });
    }

    let visitation = 0;
    let bestFailure: RecordedFailure | undefined;
    let complexityExceeded = false;
    const recordFailure = (state: SearchState, diagnostics: ModResolverDiagnostic[]): void => {
        const failure: RecordedFailure = {
            depth: state.assignments.size,
            visitation,
            diagnostics: sortDiagnostics(diagnostics),
        };
        visitation += 1;
        if (!bestFailure || failure.depth > bestFailure.depth
            || (failure.depth === bestFailure.depth && failure.visitation < bestFailure.visitation)) {
            bestFailure = failure;
        }
    };

    const search = (state: SearchState): SearchState | undefined => {
        const unassigned = [...state.constraints.keys()]
            .filter(id => !state.assignments.has(id))
            .sort(compareUnicodeCodePointOrder);
        if (unassigned.length === 0) {
            const terminalDiagnostics = validateTentativeState(state);
            if (terminalDiagnostics.length > 0) recordFailure(state, terminalDiagnostics);
            return terminalDiagnostics.length === 0 ? state : undefined;
        }
        const id = unassigned[0];
        const constraint = state.constraints.get(id)!;
        const selection = selectLogicalCandidates(id, constraint, grouped.groups, loreRelayVersion);
        if (selection.diagnostics.length > 0) {
            recordFailure(state, selection.diagnostics);
            return undefined;
        }
        for (const candidate of selection.candidates) {
            metrics.searchSteps += 1;
            if (metrics.searchSteps > MAX_MOD_RESOLVER_SEARCH_STEPS) {
                complexityExceeded = true;
                return undefined;
            }
            const next = cloneSearchState(state);
            next.assignments.set(id, candidate);
            const canonicalPath = [...constraint.ranges]
                .sort((left, right) => compareUnicodeCodePointOrder(left.path, right.path))[0]?.path ?? id;
            next.assignmentPaths.set(id, canonicalPath);
            addRequiredDependencies(next, candidate);
            const tentativeDiagnostics = validateTentativeState(next);
            if (tentativeDiagnostics.length > 0) {
                recordFailure(next, tentativeDiagnostics);
                continue;
            }
            const solved = search(next);
            if (solved) return solved;
            if (complexityExceeded) return undefined;
        }
        return undefined;
    };

    const solution = search(initialState);
    if (complexityExceeded) {
        return {
            ok: false,
            diagnostics: [diagnostic(
                'RESOLUTION_COMPLEXITY_LIMIT',
                '',
                'search',
                `Search steps exceeded deterministic limit ${MAX_MOD_RESOLVER_SEARCH_STEPS}`,
            )],
            metrics,
        };
    }
    if (!solution) {
        return {
            ok: false,
            diagnostics: bestFailure?.diagnostics ?? [diagnostic('RESOLUTION_FAILED', '', '', 'No valid assignment exists')],
            metrics,
        };
    }
    const postResolutionDiagnostics = [
        ...validateAdultApprovals(profile, solution.assignments),
        ...validateSelectedCampaignKit(profile, solution.assignments),
    ];
    if (postResolutionDiagnostics.length > 0) {
        return { ok: false, diagnostics: sortDiagnostics(postResolutionDiagnostics), metrics };
    }
    const built = buildLock(profile, solution.assignments, loreRelayVersion);
    const serializedLock = serializeModLock(built.lock);
    if (Buffer.byteLength(serializedLock, 'utf8') > MAX_MOD_LOCK_BYTES) {
        return {
            ok: false,
            diagnostics: [diagnostic('LOCK_SIZE_LIMIT', '', 'lock', `Resolved lock exceeds deterministic limit ${MAX_MOD_LOCK_BYTES} bytes`)],
            metrics,
        };
    }
    const lockSelfCheck = parseModLockText(serializedLock);
    if (!lockSelfCheck.ok) {
        return {
            ok: false,
            diagnostics: [diagnostic('LOCK_SCHEMA_SELF_CHECK_FAILED', '', 'lock', lockSelfCheck.issues.map(issue => issue.code).join(','))],
            metrics,
        };
    }
    return { ok: true, lock: built.lock, warnings: built.warnings, metrics };
}
