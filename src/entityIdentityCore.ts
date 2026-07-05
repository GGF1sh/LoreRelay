// LoreRelay Identity / Reference Layer D1a: pure identity core (no I/O, no fs).

export type EntityKind =
    | 'region'
    | 'location'
    | 'faction'
    | 'npc'
    | 'vehicle'
    | 'settlement'
    | 'mod';

export interface EntityRef {
    kind: EntityKind;
    id: string;
}

export interface EntityTombstone {
    reason: 'deleted' | 'merged';
    mergedInto?: EntityRef;
}

export interface EntityIdentity {
    ref: EntityRef;
    aliases?: string[];
    tombstone?: EntityTombstone;
}

export interface EntityPresence {
    ref: EntityRef;
    ledger: string;
    path: string;
    role: 'canonical' | 'seed' | 'mirror' | 'embedded';
    displayName?: string;
}

export interface EntityReferenceObservation {
    sourceLedger: string;
    sourcePath: string;
    ownerRef?: EntityRef;
    targetRef: EntityRef;
    optional?: boolean;
}

export interface EntityResolveResult {
    status: 'exact' | 'alias' | 'merged' | 'deleted' | 'missing' | 'kind_mismatch' | 'ambiguous';
    canonicalRef?: EntityRef;
    matchedAlias?: string;
    tombstone?: EntityTombstone;
}

/** Format EntityRef into a stable string key. */
export function entityRefKey(ref: EntityRef): string {
    return `${ref.kind}:${ref.id}`;
}

/** Check if two EntityRefs are equal. */
export function sameEntityRef(a: EntityRef | undefined, b: EntityRef | undefined): boolean {
    if (!a || !b) {
        return false;
    }
    return a.kind === b.kind && a.id === b.id;
}

/**
 * Resolve an EntityRef against a set of known identities.
 * Does not mutate any input parameters.
 */
export function resolveEntityRef(
    ref: EntityRef,
    identities: Readonly<Record<string, EntityIdentity>>
): EntityResolveResult {
    const key = entityRefKey(ref);
    const exactIdentity = identities[key];

    if (exactIdentity) {
        if (!exactIdentity.tombstone) {
            return { status: 'exact', canonicalRef: exactIdentity.ref };
        }
        if (exactIdentity.tombstone.reason === 'deleted') {
            return { status: 'deleted', tombstone: exactIdentity.tombstone };
        }
        if (exactIdentity.tombstone.reason === 'merged') {
            const mergedInto = exactIdentity.tombstone.mergedInto;
            if (!mergedInto) {
                return { status: 'missing' };
            }
            if (mergedInto.kind !== ref.kind) {
                return { status: 'kind_mismatch' };
            }

            const visited = new Set<string>();
            visited.add(key);

            let currentRef = mergedInto;
            let lastTombstone = exactIdentity.tombstone;

            while (true) {
                const currentKey = entityRefKey(currentRef);
                if (visited.has(currentKey)) {
                    return { status: 'ambiguous' }; // Cycle detected
                }
                visited.add(currentKey);

                const nextIdentity = identities[currentKey];
                if (!nextIdentity) {
                    return { status: 'merged', canonicalRef: currentRef, tombstone: lastTombstone };
                }

                if (!nextIdentity.tombstone) {
                    return { status: 'merged', canonicalRef: nextIdentity.ref, tombstone: lastTombstone };
                }

                if (nextIdentity.tombstone.reason === 'deleted') {
                    return { status: 'deleted', tombstone: nextIdentity.tombstone };
                }

                if (nextIdentity.tombstone.reason === 'merged') {
                    const nextMergedInto = nextIdentity.tombstone.mergedInto;
                    if (!nextMergedInto) {
                        return { status: 'missing' };
                    }
                    if (nextMergedInto.kind !== ref.kind) {
                        return { status: 'kind_mismatch' };
                    }
                    lastTombstone = nextIdentity.tombstone;
                    currentRef = nextMergedInto;
                }
            }
        }
    }

    // Check alias matches across the identities
    const matchingIdentities: EntityIdentity[] = [];
    for (const identity of Object.values(identities)) {
        if (identity.aliases && identity.aliases.includes(ref.id)) {
            matchingIdentities.push(identity);
        }
    }

    if (matchingIdentities.length > 1) {
        return { status: 'ambiguous' };
    }

    if (matchingIdentities.length === 1) {
        const aliasIdentity = matchingIdentities[0];
        if (aliasIdentity.ref.kind !== ref.kind) {
            return { status: 'kind_mismatch' };
        }

        const resolved = resolveEntityRef(aliasIdentity.ref, identities);
        if (resolved.status === 'exact') {
            return { status: 'alias', canonicalRef: aliasIdentity.ref, matchedAlias: ref.id };
        }
        if (resolved.status === 'merged') {
            return {
                status: 'merged',
                canonicalRef: resolved.canonicalRef,
                matchedAlias: ref.id,
                tombstone: resolved.tombstone,
            };
        }
        if (resolved.status === 'deleted') {
            return { status: 'deleted', tombstone: resolved.tombstone };
        }
        return resolved;
    }

    return { status: 'missing' };
}

/**
 * Validate a set of EntityIdentities.
 * Returns an array of validation errors. Does not mutate the input array.
 */
export function validateEntityIdentitySet(identities: readonly EntityIdentity[]): string[] {
    const errors: string[] = [];

    const validKinds = new Set<EntityKind>([
        'region',
        'location',
        'faction',
        'npc',
        'vehicle',
        'settlement',
        'mod',
    ]);

    const exactKeys = new Set<string>();
    const aliasMap = new Map<string, string>(); // aliasKey (kind:alias) -> identityKey (kind:id)

    // First pass: validate structures and detect duplicates
    for (const identity of identities) {
        if (!identity.ref || typeof identity.ref !== 'object') {
            errors.push('Identity is missing ref object');
            continue;
        }

        const kind = identity.ref.kind;
        const id = identity.ref.id;

        if (!kind || !validKinds.has(kind)) {
            errors.push(`Invalid entity kind: ${kind}`);
        }

        if (!id || typeof id !== 'string' || id.trim().length === 0) {
            errors.push('Entity ID must be a non-empty string');
            continue;
        }

        const key = entityRefKey(identity.ref);
        if (exactKeys.has(key)) {
            errors.push(`Duplicate entity identity for ${key}`);
        }
        exactKeys.add(key);

        if (identity.aliases) {
            if (!Array.isArray(identity.aliases)) {
                errors.push(`aliases must be an array for ${key}`);
            } else {
                for (const alias of identity.aliases) {
                    if (typeof alias !== 'string' || alias.trim().length === 0) {
                        errors.push(`Invalid alias in ${key}`);
                        continue;
                    }

                    if (alias === id) {
                        errors.push(`Entity cannot have itself as an alias: ${key}`);
                    }

                    const aliasKey = `${kind}:${alias}`;
                    if (aliasMap.has(aliasKey)) {
                        errors.push(`Duplicate alias ${alias} for kind ${kind}`);
                    } else {
                        aliasMap.set(aliasKey, key);
                    }
                }
            }
        }
    }

    // Second pass: validate cross-kind alias conflicts, cross-kind merges, and cycles
    for (const identity of identities) {
        if (!identity.ref || !identity.ref.kind || !identity.ref.id) {
            continue;
        }

        const key = entityRefKey(identity.ref);

        // Check if any alias conflicts with an active canonical ID of the same kind
        if (identity.aliases) {
            for (const alias of identity.aliases) {
                const sameKindCanonicalKey = `${identity.ref.kind}:${alias}`;
                if (exactKeys.has(sameKindCanonicalKey)) {
                    const conflictingIdentity = identities.find(i => entityRefKey(i.ref) === sameKindCanonicalKey);
                    if (conflictingIdentity && !conflictingIdentity.tombstone) {
                        errors.push(`Alias ${alias} of kind ${identity.ref.kind} conflicts with active canonical entity ${sameKindCanonicalKey}`);
                    }
                }

                for (const exactKey of exactKeys) {
                    if (exactKey !== sameKindCanonicalKey && exactKey.endsWith(`:${alias}`)) {
                        errors.push(`Cross-kind alias rejected: ${identity.ref.kind}:${alias} conflicts with ${exactKey}`);
                    }
                }
            }
        }

        // Check cross-kind merge
        if (identity.tombstone) {
            if (identity.tombstone.reason === 'merged') {
                const mergedInto = identity.tombstone.mergedInto;
                if (!mergedInto) {
                    errors.push(`Merge tombstone in ${key} is missing mergedInto target`);
                } else {
                    if (mergedInto.kind !== identity.ref.kind) {
                        errors.push(`Cross-kind merge rejected: ${key} cannot merge into ${entityRefKey(mergedInto)}`);
                    }
                    if (!exactKeys.has(entityRefKey(mergedInto))) {
                        errors.push(`Merge tombstone in ${key} points to missing target ${entityRefKey(mergedInto)}`);
                    }
                }
            }
        }

        // Check for cycles in the merge chain
        const visited = new Set<string>();
        let current = identity;
        while (current.tombstone?.reason === 'merged' && current.tombstone.mergedInto) {
            const currentKey = entityRefKey(current.ref);
            if (visited.has(currentKey)) {
                errors.push(`Cycle detected in merge chain starting at ${key}`);
                break;
            }
            visited.add(currentKey);

            const nextKey = entityRefKey(current.tombstone.mergedInto);
            const next = identities.find(i => entityRefKey(i.ref) === nextKey);
            if (next) {
                current = next;
            } else {
                break; // Target is missing, not a cycle
            }
        }
    }

    return errors;
}
