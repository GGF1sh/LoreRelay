#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'entityIdentityCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail(`${corePath} missing - run npm run compile`);
    process.exit(1);
}

const {
    entityRefKey,
    sameEntityRef,
    resolveEntityRef,
    validateEntityIdentitySet,
} = require(corePath);

// Test sameEntityRef
{
    if (sameEntityRef({ kind: 'npc', id: 'a' }, { kind: 'npc', id: 'a' }) !== true) fail('sameEntityRef equal failed');
    if (sameEntityRef({ kind: 'npc', id: 'a' }, { kind: 'npc', id: 'b' }) !== false) fail('sameEntityRef diff id failed');
    if (sameEntityRef({ kind: 'npc', id: 'a' }, { kind: 'location', id: 'a' }) !== false) fail('sameEntityRef diff kind failed');
    if (sameEntityRef(undefined, { kind: 'npc', id: 'a' }) !== false) fail('sameEntityRef undefined left failed');
    if (sameEntityRef({ kind: 'npc', id: 'a' }, undefined) !== false) fail('sameEntityRef undefined right failed');
    ok('sameEntityRef tests passed');
}

// Test resolveEntityRef: exact / alias / merged / deleted / missing
{
    const identities = {
        'npc:alice': { ref: { kind: 'npc', id: 'alice' } },
        'npc:bob': { ref: { kind: 'npc', id: 'bob' }, aliases: ['bobby'] },
        'npc:charlie': {
            ref: { kind: 'npc', id: 'charlie' },
            tombstone: { reason: 'merged', mergedInto: { kind: 'npc', id: 'bob' } }
        },
        'npc:deleted_npc': {
            ref: { kind: 'npc', id: 'deleted_npc' },
            tombstone: { reason: 'deleted' }
        }
    };

    // 1. Exact
    const resExact = resolveEntityRef({ kind: 'npc', id: 'alice' }, identities);
    if (resExact.status !== 'exact' || resExact.canonicalRef?.id !== 'alice') fail('exact resolution failed');

    // 2. Alias
    const resAlias = resolveEntityRef({ kind: 'npc', id: 'bobby' }, identities);
    if (resAlias.status !== 'alias' || resAlias.canonicalRef?.id !== 'bob' || resAlias.matchedAlias !== 'bobby') {
        fail('alias resolution failed: ' + JSON.stringify(resAlias));
    }

    // 3. Merged
    const resMerged = resolveEntityRef({ kind: 'npc', id: 'charlie' }, identities);
    if (resMerged.status !== 'merged' || resMerged.canonicalRef?.id !== 'bob' || !resMerged.tombstone) {
        fail('merged resolution failed: ' + JSON.stringify(resMerged));
    }

    // 4. Deleted
    const resDeleted = resolveEntityRef({ kind: 'npc', id: 'deleted_npc' }, identities);
    if (resDeleted.status !== 'deleted' || !resDeleted.tombstone || resDeleted.tombstone.reason !== 'deleted') {
        fail('deleted resolution failed');
    }

    // 5. Missing
    const resMissing = resolveEntityRef({ kind: 'npc', id: 'ghost' }, identities);
    if (resMissing.status !== 'missing') fail('missing resolution failed');

    ok('resolveEntityRef basic resolution tests passed');
}

// Test validateEntityIdentitySet: duplicates / validation rules / cycles / cross-kind
{
    // Exact valid set
    const validSet = [
        { ref: { kind: 'npc', id: 'alice' } },
        { ref: { kind: 'location', id: 'cave' } },
        { ref: { kind: 'npc', id: 'bob' }, aliases: ['bobby'] },
        { ref: { kind: 'npc', id: 'charlie' }, tombstone: { reason: 'merged', mergedInto: { kind: 'npc', id: 'bob' } } }
    ];
    const errsValid = validateEntityIdentitySet(validSet);
    if (errsValid.length > 0) fail('valid set returned errors: ' + errsValid.join(', '));

    // Duplicate canonical owner
    const dupSet = [
        { ref: { kind: 'npc', id: 'alice' } },
        { ref: { kind: 'npc', id: 'alice' } }
    ];
    const errsDup = validateEntityIdentitySet(dupSet);
    if (!errsDup.some(e => e.includes('Duplicate'))) fail('duplicate owner not detected');

    // Duplicate alias same kind
    const dupAliasSet = [
        { ref: { kind: 'npc', id: 'alice' }, aliases: ['bob'] },
        { ref: { kind: 'npc', id: 'charlie' }, aliases: ['bob'] }
    ];
    const errsDupAlias = validateEntityIdentitySet(dupAliasSet);
    if (!errsDupAlias.some(e => e.includes('Duplicate alias'))) fail('duplicate alias same kind not detected');

    // Cross-kind alias rejection
    const crossKindAliasSet = [
        { ref: { kind: 'location', id: 'cave' }, aliases: ['alice'] },
        { ref: { kind: 'npc', id: 'alice' } }
    ];
    const errsCrossKindAlias = validateEntityIdentitySet(crossKindAliasSet);
    if (!errsCrossKindAlias.some(e => e.includes('Cross-kind alias rejected'))) fail('cross-kind alias not rejected');

    // Cross-kind mergedInto rejection
    const crossMergeSet = [
        { ref: { kind: 'npc', id: 'alice' }, tombstone: { reason: 'merged', mergedInto: { kind: 'location', id: 'cave' } } },
        { ref: { kind: 'location', id: 'cave' } }
    ];
    const errsCrossMerge = validateEntityIdentitySet(crossMergeSet);
    if (!errsCrossMerge.some(e => e.includes('Cross-kind merge rejected'))) fail('cross-kind merge not rejected');

    // Missing merge target rejection
    const missingMergeSet = [
        { ref: { kind: 'npc', id: 'alice' }, tombstone: { reason: 'merged', mergedInto: { kind: 'npc', id: 'missing' } } }
    ];
    const errsMissingMerge = validateEntityIdentitySet(missingMergeSet);
    if (!errsMissingMerge.some(e => e.includes('missing target'))) fail('missing merge target not rejected');

    // Alias cycle rejection
    const cycleMergeSet = [
        { ref: { kind: 'npc', id: 'alice' }, tombstone: { reason: 'merged', mergedInto: { kind: 'npc', id: 'bob' } } },
        { ref: { kind: 'npc', id: 'bob' }, tombstone: { reason: 'merged', mergedInto: { kind: 'npc', id: 'alice' } } }
    ];
    const errsCycleMerge = validateEntityIdentitySet(cycleMergeSet);
    if (!errsCycleMerge.some(e => e.includes('Cycle detected'))) fail('merge cycle not rejected');

    // Resolving exact matches still wins over same-label aliases in other kinds when validation is not applied.
    const identitiesWithCrossKindAlias = {
        'location:cave': { ref: { kind: 'location', id: 'cave' }, aliases: ['alice'] }, // 'alice' is alias for a location
        'npc:alice': { ref: { kind: 'npc', id: 'alice' } }
    };
    // If we try to resolve location:alice, it should find it as alias of location:cave.
    const resLocationAlice = resolveEntityRef({ kind: 'location', id: 'alice' }, identitiesWithCrossKindAlias);
    if (resLocationAlice.status !== 'alias' || resLocationAlice.canonicalRef?.id !== 'cave') {
        fail('should resolve location:alice as alias of location:cave');
    }
    // But if we try to resolve npc:alice, it should match npc:alice exactly (exact > alias).
    const resNpcAlice = resolveEntityRef({ kind: 'npc', id: 'alice' }, identitiesWithCrossKindAlias);
    if (resNpcAlice.status !== 'exact' || resNpcAlice.canonicalRef?.id !== 'alice') {
        fail('should resolve npc:alice exactly');
    }
    // If we look up npc:cave (which does not exist, but 'cave' is exact for location:cave), it should return missing.
    const resNpcCave = resolveEntityRef({ kind: 'npc', id: 'cave' }, identitiesWithCrossKindAlias);
    if (resNpcCave.status !== 'missing') {
        fail('npc:cave should be missing');
    }

    ok('validateEntityIdentitySet validation tests passed');
}

// Input mutation check
{
    const inputRef = { kind: 'npc', id: 'alice' };
    const inputIdentities = {
        'npc:alice': {
            ref: { kind: 'npc', id: 'alice' },
            aliases: ['ali'],
            tombstone: { reason: 'merged', mergedInto: { kind: 'npc', id: 'bob' } }
        }
    };
    Object.freeze(inputRef);
    Object.freeze(inputIdentities['npc:alice']);
    Object.freeze(inputIdentities['npc:alice'].ref);
    Object.freeze(inputIdentities['npc:alice'].aliases);
    Object.freeze(inputIdentities['npc:alice'].tombstone);
    Object.freeze(inputIdentities['npc:alice'].tombstone.mergedInto);
    Object.freeze(inputIdentities);

    try {
        resolveEntityRef(inputRef, inputIdentities);
        validateEntityIdentitySet([inputIdentities['npc:alice']]);
        ok('functions do not mutate inputs (successfully did not throw on frozen objects)');
    } catch (err) {
        fail('input mutation check failed: ' + err.message);
    }
}

// Deterministic ordering
{
    const refs = [
        { kind: 'npc', id: 'charlie' },
        { kind: 'location', id: 'cave' },
        { kind: 'npc', id: 'alice' }
    ];
    const sortedKeys = refs.map(entityRefKey).sort();
    if (sortedKeys[0] !== 'location:cave' || sortedKeys[1] !== 'npc:alice' || sortedKeys[2] !== 'npc:charlie') {
        fail('deterministic sorting failed: ' + JSON.stringify(sortedKeys));
    } else {
        ok('deterministic ordering tests passed');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll entityIdentityCore tests passed.');
