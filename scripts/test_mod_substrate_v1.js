#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const manifestCore = require('../out/mods/modManifestCore.js');
const pathCore = require('../out/mods/modPathCore.js');
const hashCore = require('../out/mods/modHashCore.js');
const profileCore = require('../out/mods/modProfileCore.js');
const resolverCore = require('../out/mods/modResolverCore.js');
const safeModeCore = require('../out/mods/modSafeModeCore.js');
const discoveryHost = require('../out/mods/modDiscoveryHost.js');
const activationCore = require('../out/mods/modActivationGateCore.js');
const activationHost = require('../out/mods/modActivationGateHost.js');
const { installVscodeStub } = require('./test_helpers/vscode_stub');
const restoreVscode = installVscodeStub();
const checkpoint = require('../out/checkpoint.js');
restoreVscode();

let assertions = 0;
function check(value, message) {
    assertions += 1;
    assert.ok(value, message);
}
function equal(actual, expected, message) {
    assertions += 1;
    assert.deepStrictEqual(actual, expected, message);
}

function manifest(id, version, overrides = {}) {
    return {
        format: 'lorerelay-mod/1',
        id,
        version,
        name: `${id} ${version}`,
        authors: ['LoreRelay test'],
        lorerelay: { minVersion: '1.84.32', maxVersionExclusive: '2.0.0' },
        contentRating: 'general',
        contentTags: [],
        capabilities: [],
        dependencies: [],
        optionalDependencies: [],
        conflicts: [],
        entrypoints: {},
        ...overrides,
    };
}

function candidate(modManifest, source = 'workspace', contentSeed) {
    return {
        source,
        directoryId: modManifest.id,
        directoryVersion: modManifest.version,
        manifest: modManifest,
        manifestHash: hashCore.hashCanonicalModJson(modManifest),
        contentHash: hashCore.sha256ModBytes(Buffer.from(contentSeed ?? `${modManifest.id}@${modManifest.version}`, 'utf8')),
    };
}

function profile(enabled, options = {}) {
    return {
        format: 'lorerelay-mod-profile/1',
        enabled,
        selected: { campaignKit: options.campaignKit ?? null },
        adultContent: {
            allow: options.adultAllow ?? false,
            approvals: options.approvals ?? [],
        },
    };
}

function errorCodes(result) {
    return result.ok ? [] : result.diagnostics.map(item => item.code);
}

async function main() {
    const validManifest = manifest('author.sample', '1.0.0', {
        capabilities: ['asset', 'scenario'],
        entrypoints: {
            scenarios: [{ id: 'harbor-night', path: 'content/scenarios/harbor.json' }],
            assets: [{ path: 'content/assets/assets.json' }],
        },
    });
    equal(manifestCore.validateModManifest(validManifest).ok, true, 'valid manifest should pass');
    equal(manifestCore.parseModManifestText('{').issues[0].code, 'JSON_UNTERMINATED_OBJECT', 'malformed JSON has stable code');
    equal(manifestCore.parseModManifestText('{"format":"lorerelay-mod/1","format":"lorerelay-mod/1"}').issues[0].code, 'JSON_DUPLICATE_KEY', 'duplicate JSON keys reject');
    equal(manifestCore.parseModManifestBytes(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])).issues[0].code, 'UTF8_BOM_FORBIDDEN', 'BOM rejects');
    equal(manifestCore.parseModManifestText(' '.repeat(manifestCore.MAX_MOD_MANIFEST_BYTES + 1)).issues[0].code, 'MANIFEST_TOO_LARGE', 'oversize manifest rejects');
    const unknown = { ...validManifest, loadAfter: [] };
    check(manifestCore.validateModManifest(unknown).issues.some(issue => issue.code === 'UNKNOWN_FIELD'), 'unknown manifest field rejects');
    const missing = { ...validManifest };
    delete missing.authors;
    check(!manifestCore.validateModManifest(missing).ok, 'missing required field rejects');
    equal(manifestCore.validateModManifest({ ...validManifest, format: 'lorerelay-mod/2' }).issues.some(issue => issue.code === 'FORMAT_UNSUPPORTED'), true, 'unknown manifest format rejects');
    check(!manifestCore.parseSemVer('1.0.0+build'), 'SemVer build metadata rejects');
    check(manifestCore.compareSemVer('999999999999999999999999.0.0', '999999999999999999999998.0.0') > 0, 'SemVer comparison preserves arbitrarily large numeric identifiers');
    check(manifestCore.satisfiesSemVerRange('1.9.0', '^1.0.0'), 'caret range matches');
    check(!manifestCore.satisfiesSemVerRange('1.1.0-beta.1', '^1.0.0'), 'prerelease requires an explicit prerelease comparator');
    check(manifestCore.satisfiesSemVerRange('1.1.0-beta.2', '>=1.1.0-beta.1 <1.1.0'), 'explicit prerelease comparator matches');

    check(pathCore.isValidModId('author.sample'), 'canonical MOD ID passes');
    check(!pathCore.isValidModId('Author.Sample'), 'uppercase MOD ID rejects');
    check(pathCore.isValidLocalResourceId('nested/harbor-night'), 'local resource ID passes');
    check(!pathCore.isValidLocalResourceId('../escape'), 'local traversal ID rejects');
    equal(pathCore.splitCanonicalResourceId('author.sample:harbor-night').modId, 'author.sample', 'canonical namespace parses');
    for (const invalidPath of ['/absolute.json', '../escape.json', '..%2fescape.json', 'dir\\file.json', 'C:/drive.json', '//server/share', 'file:name.json', 'CON.txt', 'CON .txt', 'dir/trailing.']) {
        check(!pathCore.validateModRelativePath(invalidPath).ok, `dangerous path rejects: ${invalidPath}`);
    }
    check(!pathCore.validateModRelativePath(`${'a'.repeat(241)}.json`).ok, 'overlong UTF-8 path rejects');
    check(pathCore.validateModRelativePath('content/scenario.json').ok, 'safe relative path passes');
    equal(pathCore.modPathCollisionKey('folder/\u03c2.txt'), pathCore.modPathCollisionKey('folder/\u03c3.txt'), 'invariant case fold catches final-sigma collisions');

    const packageA = [
        { path: 'lorerelay.mod.json', kind: 'json', bytes: Buffer.from('{"b":2,"a":"e\\u0301"}') },
        { path: 'README.md', kind: 'text', bytes: Buffer.from('line 1\r\nline 2\r\n') },
    ];
    const packageB = [
        { path: 'README.md', kind: 'text', bytes: Buffer.from('line 1\nline 2\n') },
        { path: 'lorerelay.mod.json', kind: 'json', bytes: Buffer.from('{ \n "a":"é", "b":2 }') },
    ];
    equal(hashCore.hashNormalizedModPackage(packageA).contentHash, hashCore.hashNormalizedModPackage(packageB).contentHash, 'JSON order/whitespace, NFC, file order, and CRLF normalize');
    const semanticChange = packageB.map(file => file.path === 'lorerelay.mod.json' ? { ...file, bytes: Buffer.from('{"a":"é","b":3}') } : file);
    check(hashCore.hashNormalizedModPackage(packageA).contentHash !== hashCore.hashNormalizedModPackage(semanticChange).contentHash, 'semantic JSON change changes content hash');
    const docChange = packageB.map(file => file.path === 'README.md' ? { ...file, bytes: Buffer.from('different\n') } : file);
    check(hashCore.hashNormalizedModPackage(packageA).contentHash !== hashCore.hashNormalizedModPackage(docChange).contentHash, 'documentation change changes content hash');
    assert.throws(() => hashCore.parseStrictJson('{"é":1,"e\\u0301":2}'), error => error.code === 'JSON_NORMALIZED_KEY_COLLISION');
    assertions += 1;
    equal(hashCore.parseStrictJson('9007199254740991'), Number.MAX_SAFE_INTEGER, 'largest safe JSON integer is accepted exactly');
    for (const unsafeInteger of ['9007199254740992', '9007199254740993', '-9007199254740992', '1e20']) {
        assert.throws(() => hashCore.parseStrictJson(unsafeInteger), error => error.code === 'JSON_UNSAFE_INTEGER');
        assertions += 1;
    }
    assert.throws(() => hashCore.canonicalizeModJson({ value: Number.MAX_SAFE_INTEGER + 1 }), error => error.code === 'JSON_UNSAFE_INTEGER');
    assertions += 1;
    assert.throws(() => hashCore.hashNormalizedModPackage([
        { path: 'A.json', kind: 'json', bytes: Buffer.from('{}') },
        { path: 'a.json', kind: 'json', bytes: Buffer.from('{}') },
    ]), error => error.code === 'PACKAGE_PATH_COLLISION');
    assertions += 1;
    assert.throws(() => hashCore.canonicalizeModJson(Object.create({ inherited: true })), error => error.code === 'JSON_NON_PLAIN_OBJECT');
    assertions += 1;
    let accessorInvoked = false;
    const accessorObject = {};
    Object.defineProperty(accessorObject, 'value', { enumerable: true, get: () => { accessorInvoked = true; return 'unsafe'; } });
    assert.throws(() => hashCore.canonicalizeModJson(accessorObject), error => error.code === 'JSON_ACCESSOR_FORBIDDEN');
    assertions += 1;
    equal(accessorInvoked, false, 'canonicalization rejects accessors without invoking them');
    const duplicateResource = manifest('duplicate.resource', '1.0.0', {
        capabilities: ['persona', 'scenario'],
        entrypoints: {
            personas: [{ id: 'shared', path: 'content/persona.json' }],
            scenarios: [{ id: 'shared', path: 'content/scenario.json' }],
        },
    });
    check(manifestCore.validateModManifest(duplicateResource).issues.some(issue => issue.code === 'DUPLICATE_CANONICAL_RESOURCE_ID'), 'canonical resource IDs are unique across entrypoint types');

    const a2 = candidate(manifest('a.mod', '2.0.0', { dependencies: [{ id: 'c.mod', version: '^2.0.0' }] }));
    const a1 = candidate(manifest('a.mod', '1.0.0', { dependencies: [{ id: 'c.mod', version: '^1.0.0' }] }));
    const b1 = candidate(manifest('b.mod', '1.0.0', { dependencies: [{ id: 'c.mod', version: '^1.0.0' }] }));
    const c2 = candidate(manifest('c.mod', '2.0.0'));
    const c1 = candidate(manifest('c.mod', '1.0.0'));
    const backtrackProfile = profile([
        { id: 'b.mod', version: '*', source: 'any' },
        { id: 'a.mod', version: '*', source: 'any' },
    ]);
    const backtracked = resolverCore.resolveModProfile(backtrackProfile, [c2, a1, b1, a2, c1], '1.84.32');
    check(backtracked.ok, 'deterministic resolver should find a solution');
    equal(backtracked.lock.packages.find(item => item.id === 'a.mod').version, '1.0.0', 'resolver backtracks to lower compatible version');
    equal(backtracked.lock.loadOrder, ['c.mod', 'a.mod', 'b.mod'], 'dependency-first Kahn order uses MOD ID tie break');
    const shuffled = resolverCore.resolveModProfile(
        profile([...backtrackProfile.enabled].reverse()),
        [a2, c1, b1, a1, c2],
        '1.84.32',
    );
    check(shuffled.ok, 'shuffled candidate/profile order resolves');
    equal(profileCore.serializeModLock(shuffled.lock), profileCore.serializeModLock(backtracked.lock), 'shuffled enumeration produces byte-identical lock');

    const sameManifest = manifest('same.mod', '1.0.0');
    const sameGlobal = candidate(sameManifest, 'global', 'identical');
    const sameWorkspace = candidate(sameManifest, 'workspace', 'identical');
    const duplicateProfile = profile([{ id: 'same.mod', version: '1.0.0', source: 'any' }]);
    const coalesced = resolverCore.resolveModProfile(duplicateProfile, [sameGlobal, sameWorkspace], '1.84.32');
    check(coalesced.ok, 'same-hash cross-scope candidates coalesce');
    equal(coalesced.lock.packages[0].source, 'workspace', 'workspace is canonical source for same-hash source:any');
    const variant = resolverCore.resolveModProfile(duplicateProfile, [sameGlobal, candidate(sameManifest, 'workspace', 'different')], '1.84.32');
    equal(errorCodes(variant), ['DUPLICATE_VARIANT'], 'different cross-scope variants reject');
    const sourceRestricted = resolverCore.resolveModProfile(
        profile([{ id: 'same.mod', version: '1.0.0', source: 'global' }]),
        [sameGlobal, candidate(sameManifest, 'workspace', 'different')],
        '1.84.32',
    );
    check(sourceRestricted.ok && sourceRestricted.lock.packages[0].source === 'global', 'explicit source excludes the other variant');
    const sameSourceDuplicate = resolverCore.resolveModProfile(duplicateProfile, [sameWorkspace, { ...sameWorkspace }], '1.84.32');
    equal(errorCodes(sameSourceDuplicate), ['SAME_SOURCE_DUPLICATE'], 'same-source duplicate rejects');

    const cycleB = candidate(manifest('cycle.b', '1.0.0', { dependencies: [{ id: 'cycle.a', version: '*' }] }));
    const cycleA2 = candidate(manifest('cycle.a', '2.0.0', { dependencies: [{ id: 'cycle.b', version: '*' }] }));
    const cycleA1 = candidate(manifest('cycle.a', '1.0.0'));
    const cycleResolved = resolverCore.resolveModProfile(profile([{ id: 'cycle.a', version: '*', source: 'any' }]), [cycleA2, cycleA1, cycleB], '1.84.32');
    check(cycleResolved.ok, 'cycle in highest candidate branch backtracks');
    equal(cycleResolved.lock.packages.find(item => item.id === 'cycle.a').version, '1.0.0', 'cycle branch selects lower candidate');

    const conflictA = candidate(manifest('conflict.a', '1.0.0', { conflicts: [{ id: 'conflict.b', version: '*', reason: 'exclusive' }] }));
    const conflictB = candidate(manifest('conflict.b', '1.0.0'));
    const conflictResult = resolverCore.resolveModProfile(profile([
        { id: 'conflict.a', version: '*', source: 'any' },
        { id: 'conflict.b', version: '*', source: 'any' },
    ]), [conflictB, conflictA], '1.84.32');
    check(errorCodes(conflictResult).includes('DECLARED_CONFLICT'), 'matching conflict is visible and rejects');
    const optionalA = candidate(manifest('optional.a', '1.0.0', { optionalDependencies: [{ id: 'optional.b', version: '*' }] }));
    const optionalB = candidate(manifest('optional.b', '1.0.0', { dependencies: [{ id: 'optional.a', version: '*' }] }));
    const optionalCycle = resolverCore.resolveModProfile(profile([
        { id: 'optional.a', version: '*', source: 'any' },
        { id: 'optional.b', version: '*', source: 'any' },
    ]), [optionalA, optionalB], '1.84.32');
    check(optionalCycle.ok, 'optional ordering cycle never invalidates required assignment');
    check(optionalCycle.warnings.some(item => item.code === 'OPTIONAL_DEPENDENCY_CYCLE_OMITTED'), 'optional cycle edge is deterministically omitted with a warning');
    const missingResult = resolverCore.resolveModProfile(profile([{ id: 'missing.mod', version: '1.0.0', source: 'any' }]), [], '1.84.32');
    equal(errorCodes(missingResult), ['REQUIRED_PACKAGE_UNAVAILABLE'], 'missing required package rejects');

    const engineManifest = manifest('engine.mod', '1.0.0', { lorerelay: { minVersion: '1.84.32', maxVersionExclusive: '1.85.0' } });
    check(resolverCore.resolveModProfile(profile([{ id: 'engine.mod', version: '*', source: 'any' }]), [candidate(engineManifest)], '1.84.32').ok, 'engine inclusive minimum passes');
    equal(errorCodes(resolverCore.resolveModProfile(profile([{ id: 'engine.mod', version: '*', source: 'any' }]), [candidate(engineManifest)], '1.84.31')), ['ENGINE_INCOMPATIBLE'], 'below engine minimum rejects');
    equal(errorCodes(resolverCore.resolveModProfile(profile([{ id: 'engine.mod', version: '*', source: 'any' }]), [candidate(engineManifest)], '1.85.0')), ['ENGINE_INCOMPATIBLE'], 'engine max-exclusive boundary rejects');

    const adultManifest = manifest('adult.mod', '1.0.0', { contentRating: 'adult', contentTags: ['sexual-content'] });
    const adultCandidate = candidate(adultManifest, 'workspace', 'adult-v1');
    const exactApproval = {
        id: adultManifest.id,
        version: adultManifest.version,
        manifestHash: adultCandidate.manifestHash,
        contentHash: adultCandidate.contentHash,
    };
    const adultProfile = profile([{ id: 'adult.mod', version: '1.0.0', source: 'any' }], { adultAllow: true, approvals: [exactApproval] });
    const adultResolved = resolverCore.resolveModProfile(adultProfile, [adultCandidate], '1.84.32');
    check(adultResolved.ok, 'exact four-value adult approval passes');
    const changedAdult = candidate(adultManifest, 'workspace', 'adult-v2');
    equal(errorCodes(resolverCore.resolveModProfile(adultProfile, [changedAdult], '1.84.32')), ['ADULT_REAPPROVAL_REQUIRED'], 'contentHash change invalidates adult approval');
    check(!resolverCore.resolveModProfile(profile([{ id: 'adult.mod', version: '*', source: 'any' }]), [adultCandidate], '1.84.32').ok, 'adult allow and approval are independent requirements');

    const exactLimitCandidates = Array.from({ length: resolverCore.MAX_MOD_RESOLVER_CANDIDATES }, (_, index) => {
        const id = `limit${String(index).padStart(3, '0')}.mod`;
        return candidate(manifest(id, '1.0.0'));
    });
    const exactCandidateLimit = resolverCore.resolveModProfile(
        profile([{ id: 'limit000.mod', version: '*', source: 'any' }]),
        exactLimitCandidates,
        '1.84.32',
    );
    check(exactCandidateLimit.ok, 'resolver passes at the exact physical candidate limit');
    const tooManyCandidates = [...exactLimitCandidates, adultCandidate];
    equal(errorCodes(resolverCore.resolveModProfile(adultProfile, tooManyCandidates, '1.84.32')), ['RESOLUTION_COMPLEXITY_LIMIT'], 'candidate complexity limit is explicit');
    const exactStepCandidates = [];
    const exactStepEnabled = [];
    const exactStepRadices = [4, 3, 2, 5, 2, 2, 19];
    exactStepRadices.forEach((count, index) => {
        const id = `step${String(index).padStart(2, '0')}.mod`;
        exactStepEnabled.push({ id, version: '*', source: 'any' });
        for (let version = 1; version <= count; version += 1) exactStepCandidates.push(candidate(manifest(id, `${version}.0.0`)));
    });
    exactStepEnabled.push({ id: 'z.missing', version: '*', source: 'any' });
    const exactStepLimit = resolverCore.resolveModProfile(profile(exactStepEnabled), exactStepCandidates, '1.84.32');
    equal(exactStepLimit.metrics.searchSteps, resolverCore.MAX_MOD_RESOLVER_SEARCH_STEPS, 'resolver explores exactly the configured search-step limit');
    equal(errorCodes(exactStepLimit), ['REQUIRED_PACKAGE_UNAVAILABLE'], 'exact search-step limit fails for graph reasons, not complexity');
    const exponentialCandidates = [];
    const exponentialEnabled = [];
    for (let index = 0; index < 14; index += 1) {
        const id = `a${String(index).padStart(2, '0')}.mod`;
        exponentialEnabled.push({ id, version: '*', source: 'any' });
        exponentialCandidates.push(candidate(manifest(id, '2.0.0')), candidate(manifest(id, '1.0.0')));
    }
    exponentialEnabled.push({ id: 'z.missing', version: '*', source: 'any' });
    const complexityResult = resolverCore.resolveModProfile(profile(exponentialEnabled), exponentialCandidates, '1.84.32');
    equal(errorCodes(complexityResult), ['RESOLUTION_COMPLEXITY_LIMIT'], 'search-step complexity limit is explicit');
    equal(complexityResult.metrics.searchSteps, resolverCore.MAX_MOD_RESOLVER_SEARCH_STEPS + 1, 'search limit uses deterministic steps rather than time');

    const denseCandidates = [];
    for (let index = 0; index < resolverCore.MAX_MOD_RESOLVER_CANDIDATES; index += 1) {
        const id = `dense${String(index).padStart(3, '0')}.mod`;
        const dependencies = [];
        for (let dependencyIndex = Math.max(0, index - 64); dependencyIndex < index; dependencyIndex += 1) {
            dependencies.push({ id: `dense${String(dependencyIndex).padStart(3, '0')}.mod`, version: '1.0.0' });
        }
        denseCandidates.push(candidate(manifest(id, '1.0.0', { dependencies })));
    }
    const denseResolved = resolverCore.resolveModProfile(
        profile([{ id: 'dense511.mod', version: '1.0.0', source: 'any' }]),
        denseCandidates,
        '1.84.32',
    );
    check(denseResolved.ok, 'maximum-size dense dependency graph resolves within the bounded lock schema');
    const denseLockText = profileCore.serializeModLock(denseResolved.lock);
    check(Buffer.byteLength(denseLockText, 'utf8') > profileCore.MAX_MOD_PROFILE_BYTES, 'lock fixture exceeds the smaller profile JSON bound');
    check(Buffer.byteLength(denseLockText, 'utf8') <= profileCore.MAX_MOD_LOCK_BYTES, 'resolver never emits a lock larger than the lock parser bound');
    check(profileCore.parseModLockText(denseLockText).ok, 'resolver output round-trips through the bounded lock parser');

    const parsedLock = profileCore.validateModLock(adultResolved.lock);
    check(parsedLock.ok, 'generated lock schema validates');
    const tamperedLock = JSON.parse(JSON.stringify(adultResolved.lock));
    tamperedLock.packages[0].contentHash = hashCore.sha256ModBytes(Buffer.from('tampered'));
    check(profileCore.validateModLock(tamperedLock).issues.some(issue => issue.code === 'LOCK_AGGREGATE_HASH_MISMATCH'), 'lock body tampering invalidates aggregate hash');
    equal(profileCore.serializeModProfile(profile([...backtrackProfile.enabled].reverse())), profileCore.serializeModProfile(backtrackProfile), 'profile serialization ignores profile array order');
    const serializedLock = profileCore.serializeModLock(adultResolved.lock);
    check(!serializedLock.includes('C:\\') && !serializedLock.includes('file:') && !serializedLock.includes(os.userInfo().username), 'lock contains no absolute path, URI, or username');

    const normalOpen = safeModeCore.assessModCampaignOpen({
        lock: adultResolved.lock,
        installedCandidates: [adultCandidate],
        currentLoreRelayVersion: '1.84.32',
        adultSessionAllowed: true,
        activeProfileHash: adultResolved.lock.profileHash,
    });
    equal(normalOpen.mode, 'normal', 'exact lock opens normally');
    const modContext = normalOpen.modContext;
    check(modContext && modContext.adultActive, 'coarse modContext is emitted only after exact lock verification');
    const driftOpen = safeModeCore.assessModCampaignOpen({
        lock: adultResolved.lock,
        installedCandidates: [adultCandidate],
        currentLoreRelayVersion: '1.84.33',
        adultSessionAllowed: true,
    });
    equal(driftOpen.mode, 'normal', 'compatible engine drift remains normal');
    check(driftOpen.warnings.some(item => item.code === 'ENGINE_VERSION_DRIFT'), 'compatible engine drift warns');
    equal(safeModeCore.assessModCampaignOpen({ lock: adultResolved.lock, installedCandidates: [], currentLoreRelayVersion: '1.84.32', adultSessionAllowed: true }).mode, 'safe-required', 'missing locked package requires Safe Mode');
    const adultBlocked = safeModeCore.assessModCampaignOpen({ lock: adultResolved.lock, installedCandidates: [adultCandidate], currentLoreRelayVersion: '1.84.32', adultSessionAllowed: false });
    equal(adultBlocked.mode, 'safe-required', 'adult session permission off requires Safe Mode');
    equal(adultBlocked.providerRequestsAllowed, false, 'Safe Mode forbids provider requests');
    equal(adultBlocked.canonicalWritesAllowed, false, 'Safe Mode forbids canonical writes');
    check(safeModeCore.isSafeModeActionAllowed('diagnostics-export'), 'Safe Mode permits diagnostics export');
    check(!safeModeCore.isSafeModeActionAllowed('canonical-mutation'), 'Safe Mode blocks canonical mutation');
    equal(safeModeCore.decideSafeModeHistoryPresentation({ author: 'machine', modContext, adultVisibilityAllowed: false, campaignMayHaveAdultModHistory: true }).presentation, 'placeholder', 'whole adult machine entry is placeholdered');
    equal(safeModeCore.decideSafeModeHistoryPresentation({ author: 'machine', modContext: undefined, adultVisibilityAllowed: false, campaignMayHaveAdultModHistory: true }).reason, 'MISSING_OR_INVALID_CONTEXT', 'missing marker conservatively hides potentially adult history');
    equal(safeModeCore.decideSafeModeHistoryPresentation({ author: 'machine', modContext: undefined, adultVisibilityAllowed: false, campaignMayHaveAdultModHistory: false }).presentation, 'show', 'ordinary unmodded history is unchanged');
    equal(safeModeCore.decideSafeModeHistoryPresentation({ author: 'user', modContext, adultVisibilityAllowed: false, campaignMayHaveAdultModHistory: true }).presentation, 'show', 'user-authored history is not classified by MOD marker');
    const forgedNonAdultContext = { ...modContext, adultActive: false };
    equal(safeModeCore.decideSafeModeHistoryPresentation({
        author: 'machine',
        modContext: forgedNonAdultContext,
        adultVisibilityAllowed: false,
        campaignMayHaveAdultModHistory: true,
        knownLockContexts: [modContext],
    }).presentation, 'placeholder', 'verified adult lock classification overrides a forged non-adult history marker');
    const unknownContext = { ...modContext, adultActive: false, lockFingerprint: hashCore.sha256ModBytes(Buffer.from('unknown-lock')) };
    equal(safeModeCore.decideSafeModeHistoryPresentation({
        author: 'machine',
        modContext: unknownContext,
        adultVisibilityAllowed: false,
        campaignMayHaveAdultModHistory: true,
    }).reason, 'MISSING_OR_INVALID_CONTEXT', 'omitting the fingerprint allowlist never treats unknown history as safe');
    equal(safeModeCore.decideSafeModeHistoryPresentation({
        author: 'machine',
        modContext: unknownContext,
        adultVisibilityAllowed: false,
        campaignMayHaveAdultModHistory: true,
        knownLockContexts: [modContext],
    }).reason, 'MISSING_OR_INVALID_CONTEXT', 'unknown lock fingerprint is conservatively treated as invalid provenance');
    const nonAdultOpen = safeModeCore.assessModCampaignOpen({
        lock: backtracked.lock,
        installedCandidates: [a1, b1, c1],
        currentLoreRelayVersion: '1.84.32',
        adultSessionAllowed: false,
    });
    equal(nonAdultOpen.mode, 'normal', 'verified non-adult lock opens normally');
    equal(safeModeCore.decideSafeModeHistoryPresentation({
        author: 'machine',
        modContext: nonAdultOpen.modContext,
        adultVisibilityAllowed: false,
        campaignMayHaveAdultModHistory: true,
        knownLockContexts: [nonAdultOpen.modContext],
    }).presentation, 'show', 'matching verified non-adult lock context permits history display');
    equal(safeModeCore.assessModCampaignOpen({ installedCandidates: [], currentLoreRelayVersion: '1.84.32', adultSessionAllowed: false, modProfilePresent: true }).mode, 'safe-required', 'missing lock with a profile is never treated as unmodded');
    equal(safeModeCore.assessModCampaignOpen({ installedCandidates: [], currentLoreRelayVersion: '1.84.32', adultSessionAllowed: false, checkpointLockFingerprints: [adultResolved.lock.aggregateHash] }).mode, 'safe-required', 'missing lock with checkpoint provenance is never treated as unmodded');
    equal(safeModeCore.assessModCampaignOpen({ installedCandidates: [], currentLoreRelayVersion: '1.84.32', adultSessionAllowed: false }).mode, 'unmodded', 'missing lock without any MOD evidence is genuinely unmodded');
    const downgradedAdultLock = JSON.parse(JSON.stringify(adultResolved.lock));
    downgradedAdultLock.packages[0].contentRating = 'general';
    downgradedAdultLock.packages[0].contentTags = [];
    downgradedAdultLock.adultContentAllowed = false;
    const { aggregateHash: ignoredAggregateHash, ...downgradedLockBody } = downgradedAdultLock;
    downgradedAdultLock.aggregateHash = profileCore.computeModLockAggregateHash(downgradedLockBody);
    check(profileCore.validateModLock(downgradedAdultLock).ok, 'downgrade fixture is internally self-consistent before manifest binding');
    const downgradeOpen = safeModeCore.assessModCampaignOpen({
        lock: downgradedAdultLock,
        installedCandidates: [adultCandidate],
        currentLoreRelayVersion: '1.84.32',
        adultSessionAllowed: false,
    });
    equal(downgradeOpen.mode, 'safe-required', 'self-consistent lock cannot downgrade the installed manifest adult classification');
    check(downgradeOpen.blockers.some(item => item.code === 'ADULT_SESSION_PERMISSION_REQUIRED' || item.code === 'LOCK_GRAPH_BINDING_MISMATCH'), 'classification downgrade returns an explicit Safe Mode blocker');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-mod-v1-'));
    try {
        const globalStorageRoot = path.join(tempRoot, 'global-storage');
        const globalRoot = path.join(globalStorageRoot, 'mods', 'packages');
        const workspaceRoot = path.join(tempRoot, 'workspace');
        const writeManifest = (packageRoot, packageManifest) => {
            fs.mkdirSync(packageRoot, { recursive: true });
            fs.writeFileSync(path.join(packageRoot, 'lorerelay.mod.json'), `${JSON.stringify(packageManifest, null, 2)}\n`, 'utf8');
        };
        const hashPackage = (id, version, expectedManifestHash, options = {}) => discoveryHost.hashDiscoveredModPackage({
            globalStorageRoot,
            workspaceRoot,
            source: 'global',
            id,
            version,
            expectedManifestHash,
            allowAdultContentRead: false,
            ...options,
        });
        const validRoot = path.join(globalRoot, 'discover.mod', '1.0.0');
        const discoverManifest = manifest('discover.mod', '1.0.0');
        writeManifest(validRoot, discoverManifest);
        fs.writeFileSync(path.join(validRoot, 'README.md'), 'declarative only\r\n', 'utf8');
        const discovered = await discoveryHost.discoverModPackageManifests({ globalStorageRoot, workspaceRoot });
        equal(discovered.diagnostics, [], 'bounded discovery accepts an ordinary contained package');
        equal(discovered.manifests.length, 1, 'metadata discovery emits one validated manifest without reading payloads');
        equal(discovered.manifests[0].source, 'global', 'discovery preserves the derived package source');
        const validHashed = await hashPackage('discover.mod', '1.0.0', discovered.manifests[0].manifestHash);
        equal(validHashed.diagnostics, [], 'explicit exact-package request performs bounded hashing');
        check(validHashed.candidate && validHashed.candidate.contentHash.startsWith('sha256:'), 'explicit hash request emits a resolver candidate');

        const activationProfile = profile([{ id: 'discover.mod', version: '1.0.0', source: 'global' }]);
        const activationResolved = resolverCore.resolveModProfile(activationProfile, [validHashed.candidate], '1.84.32');
        check(activationResolved.ok, 'activation fixture resolves before it is persisted');
        const campaignDir = path.join(workspaceRoot, '.text-adventure');
        fs.mkdirSync(campaignDir, { recursive: true });
        fs.writeFileSync(path.join(campaignDir, 'mod-profile.json'), profileCore.serializeModProfile(activationProfile), 'utf8');
        fs.writeFileSync(path.join(campaignDir, 'mod-lock.json'), profileCore.serializeModLock(activationResolved.lock), 'utf8');

        activationHost.clearModActivationGateRuntime();
        equal(activationHost.areModCanonicalWritesAllowed(workspaceRoot), false, 'unevaluated campaign with MOD files fails closed for canonical writes');
        equal(await activationHost.acquireModCanonicalAuthorization(workspaceRoot), undefined, 'no mutation lease is issued before campaign activation evaluation');
        const activated = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(activated.decision.mode, 'normal', 'campaign startup verifies profile, lock, manifest, and exact package hash');
        equal(activated.contentActivationAllowed, false, 'activation gate never enables package content in this slice');
        equal(activationHost.areModCanonicalWritesAllowed(workspaceRoot), true, 'verified active lock permits ordinary canonical writes');
        equal(activationHost.getVerifiedActiveModContext(workspaceRoot).lockFingerprint, activationResolved.lock.aggregateHash, 'runtime exposes only verified coarse provenance');

        const initialAuthorization = await activationHost.acquireModCanonicalAuthorization(workspaceRoot);
        equal(initialAuthorization.mode, 'modded', 'exact package revalidation issues a modded canonical-mutation lease');
        check(activationHost.isModCanonicalAuthorizationCurrent(initialAuthorization), 'fresh MOD authorization is current');
        fs.writeFileSync(path.join(validRoot, 'README.md'), 'package drift after startup\n', 'utf8');
        equal(await activationHost.acquireModCanonicalAuthorization(workspaceRoot), undefined, 'package-tree drift after startup invalidates canonical mutation authorization');
        check(!activationHost.isModCanonicalAuthorizationCurrent(initialAuthorization), 'failed package revalidation revokes the prior lease generation');
        fs.writeFileSync(path.join(validRoot, 'README.md'), 'declarative only\r\n', 'utf8');
        const packageDriftRecovered = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(packageDriftRecovered.decision.mode, 'normal', 'restored exact package tree may be explicitly reverified');

        fs.appendFileSync(path.join(campaignDir, 'mod-profile.json'), ' ', 'utf8');
        equal(activationHost.areModCanonicalWritesAllowed(workspaceRoot), false, 'profile file replacement or edit invalidates the runtime write gate');
        const reverified = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(reverified.decision.mode, 'normal', 'semantically unchanged profile may reopen only after complete re-verification');

        const driftProfile = profile([{ id: 'discover.mod', version: '*', source: 'global' }]);
        fs.writeFileSync(path.join(campaignDir, 'mod-profile.json'), profileCore.serializeModProfile(driftProfile), 'utf8');
        const profileDrift = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(profileDrift.decision.mode, 'safe-required', 'profile hash drift blocks normal startup');
        check(profileDrift.decision.blockers.some(item => item.code === 'PROFILE_LOCK_HASH_MISMATCH'), 'profile drift emits a stable activation blocker');
        fs.writeFileSync(path.join(campaignDir, 'mod-profile.json'), profileCore.serializeModProfile(activationProfile), 'utf8');

        const incompatibleProfile = profile([{ id: 'discover.mod', version: '2.0.0', source: 'global' }]);
        const forgedPairLock = JSON.parse(JSON.stringify(activationResolved.lock));
        forgedPairLock.profileHash = profileCore.computeModProfileHash(incompatibleProfile);
        const { aggregateHash: ignoredForgedPairHash, ...forgedPairBody } = forgedPairLock;
        forgedPairLock.aggregateHash = profileCore.computeModLockAggregateHash(forgedPairBody);
        fs.writeFileSync(path.join(campaignDir, 'mod-profile.json'), profileCore.serializeModProfile(incompatibleProfile), 'utf8');
        fs.writeFileSync(path.join(campaignDir, 'mod-lock.json'), profileCore.serializeModLock(forgedPairLock), 'utf8');
        const forgedPair = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(forgedPair.decision.mode, 'safe-required', 'self-consistent profileHash cannot bind a lock that the exact profile does not resolve');
        check(forgedPair.decision.blockers.some(item => item.code.startsWith('PROFILE_')), 'profile-to-lock resolution failure emits a stable blocker');
        fs.writeFileSync(path.join(campaignDir, 'mod-profile.json'), profileCore.serializeModProfile(activationProfile), 'utf8');
        fs.writeFileSync(path.join(campaignDir, 'mod-lock.json'), profileCore.serializeModLock(activationResolved.lock), 'utf8');

        const workspaceVariantRoot = path.join(workspaceRoot, '.text-adventure', 'mods', 'discover.mod', '1.0.0');
        fs.cpSync(validRoot, workspaceVariantRoot, { recursive: true });
        const workspaceVariant = await discoveryHost.hashDiscoveredModPackage({
            globalStorageRoot,
            workspaceRoot,
            source: 'workspace',
            id: 'discover.mod',
            version: '1.0.0',
            expectedManifestHash: hashCore.hashCanonicalModJson(discoverManifest),
            allowAdultContentRead: false,
        });
        const anySourceProfile = profile([{ id: 'discover.mod', version: '1.0.0', source: 'any' }]);
        const anySourceResolved = resolverCore.resolveModProfile(
            anySourceProfile,
            [validHashed.candidate, workspaceVariant.candidate],
            '1.84.32',
        );
        check(anySourceResolved.ok, 'same-hash cross-scope activation fixture resolves');
        equal(anySourceResolved.lock.packages[0].source, 'workspace', 'same-hash cross-scope lock canonicalizes to workspace source');
        fs.writeFileSync(path.join(campaignDir, 'mod-profile.json'), profileCore.serializeModProfile(anySourceProfile), 'utf8');
        fs.writeFileSync(path.join(campaignDir, 'mod-lock.json'), profileCore.serializeModLock(anySourceResolved.lock), 'utf8');
        const sameHashCrossScope = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(sameHashCrossScope.decision.mode, 'normal', 'activation hashes both same-hash scopes and accepts the canonical workspace source');
        fs.writeFileSync(path.join(workspaceVariantRoot, 'README.md'), 'different workspace variant\n', 'utf8');
        const differentCrossScope = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(differentCrossScope.decision.mode, 'safe-required', 'different cross-scope id@version variants fail closed during activation');
        check(differentCrossScope.decision.blockers.some(item => item.code === 'PROFILE_DUPLICATE_VARIANT'), 'cross-scope variant failure is explicit');
        fs.rmSync(path.join(workspaceRoot, '.text-adventure', 'mods'), { recursive: true, force: true });
        fs.writeFileSync(path.join(campaignDir, 'mod-profile.json'), profileCore.serializeModProfile(activationProfile), 'utf8');
        fs.writeFileSync(path.join(campaignDir, 'mod-lock.json'), profileCore.serializeModLock(activationResolved.lock), 'utf8');

        const tamperedLock = JSON.parse(JSON.stringify(activationResolved.lock));
        tamperedLock.packages[0].contentHash = hashCore.sha256ModBytes(Buffer.from('tampered-lock'));
        fs.writeFileSync(path.join(campaignDir, 'mod-lock.json'), JSON.stringify(tamperedLock), 'utf8');
        const tamperedActivation = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(tamperedActivation.decision.mode, 'safe-required', 'tampered lock blocks normal startup');
        check(tamperedActivation.decision.blockers.some(item => item.code === 'LOCK_LOCK_AGGREGATE_HASH_MISMATCH'), 'tampered lock reports aggregate mismatch');
        fs.writeFileSync(path.join(campaignDir, 'mod-lock.json'), profileCore.serializeModLock(activationResolved.lock), 'utf8');

        const checkpointRoot = path.join(tempRoot, 'checkpoint-campaign');
        const checkpointCampaignDir = path.join(checkpointRoot, '.text-adventure');
        fs.mkdirSync(checkpointCampaignDir, { recursive: true });
        fs.writeFileSync(path.join(checkpointCampaignDir, 'mod-profile.json'), profileCore.serializeModProfile(activationProfile), 'utf8');
        fs.writeFileSync(path.join(checkpointCampaignDir, 'mod-lock.json'), profileCore.serializeModLock(activationResolved.lock), 'utf8');
        await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot: checkpointRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        const checkpointAuthorization = await activationHost.acquireModCanonicalAuthorization(checkpointRoot);
        const historyContext = activated.decision.modContext;
        const checkpointMeta = checkpoint.saveCheckpointFile(checkpointRoot, [{
            id: 'turn-1',
            role: 'gm',
            sender: 'Game Master',
            content: 'verified history',
            modContext: historyContext,
        }], 'MOD checkpoint', {
            gameState: { schemaVersion: 2, entries: [] },
            modLockSnapshot: activationResolved.lock,
            modAuthorization: checkpointAuthorization,
        });
        check(checkpointMeta, 'checkpoint 1.3 save succeeds with a verified lock snapshot');
        const loadedCheckpoint = checkpoint.loadCheckpointFile(checkpointRoot, checkpointMeta.id);
        equal(loadedCheckpoint.format, 'text-adventure-checkpoint/1.3', 'modded checkpoint uses complete-state format 1.3');
        equal(loadedCheckpoint.modLockFingerprint, activationResolved.lock.aggregateHash, 'checkpoint fingerprint binds the complete snapshot');
        equal(loadedCheckpoint.history[0].modContext, historyContext, 'checkpoint history preserves coarse MOD provenance');
        equal(activationCore.assessModCheckpointRestore({
            activeDecision: activated.decision,
            activeLock: activationResolved.lock,
            checkpoint: loadedCheckpoint,
        }).allowed, true, 'matching active lock permits checkpoint restore');
        equal(activationCore.assessModCheckpointRestore({
            activeDecision: normalOpen,
            activeLock: adultResolved.lock,
            checkpoint: loadedCheckpoint,
        }).code, 'CHECKPOINT_LOCK_MISMATCH', 'different active lock blocks checkpoint restore');
        equal(activationCore.assessModCheckpointRestore({
            activeDecision: {
                mode: 'unmodded', contributionsActive: false, canonicalWritesAllowed: true,
                providerRequestsAllowed: true, blockers: [], warnings: [],
            },
            checkpoint: loadedCheckpoint,
        }).code, 'MODDED_CHECKPOINT_REQUIRES_ACTIVE_LOCK', 'unmodded campaign cannot silently adopt a checkpoint lock');

        fs.unlinkSync(path.join(campaignDir, 'mod-lock.json'));
        fs.writeFileSync(path.join(workspaceRoot, 'game_history.json'), JSON.stringify([{
            id: 'turn-1', role: 'gm', sender: 'Game Master', content: 'history', modContext: historyContext,
        }]), 'utf8');
        const missingLock = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(missingLock.decision.mode, 'safe-required', 'history provenance prevents a missing lock from becoming unmodded');

        const unmoddedRoot = path.join(tempRoot, 'unmodded-campaign');
        fs.mkdirSync(unmoddedRoot, { recursive: true });
        const unmodded = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot: unmoddedRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(unmodded.decision.mode, 'unmodded', 'no profile, lock, or provenance preserves unmodded startup');
        const legacyMeta = checkpoint.saveCheckpointFile(unmoddedRoot, [{
            id: 'turn-legacy', role: 'gm', sender: 'Game Master', content: 'legacy',
        }], 'Complete checkpoint', { gameState: { schemaVersion: 2, entries: [] } });
        equal(checkpoint.loadCheckpointFile(unmoddedRoot, legacyMeta.id).format, 'text-adventure-checkpoint/1.3', 'new unmodded checkpoint uses complete-state format 1.3');

        const malformedEvidenceRoot = path.join(tempRoot, 'malformed-evidence-campaign');
        fs.mkdirSync(malformedEvidenceRoot, { recursive: true });
        fs.writeFileSync(path.join(malformedEvidenceRoot, 'game_history.json'), JSON.stringify([{
            id: 'forged', role: 'gm', sender: 'Game Master', content: 'forged', modContext: { adultActive: false },
        }]), 'utf8');
        const malformedEvidence = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot: malformedEvidenceRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(malformedEvidence.decision.mode, 'safe-required', 'malformed provenance cannot silently downgrade a campaign to unmodded');
        check(malformedEvidence.decision.blockers.some(item => item.code === 'CAMPAIGN_EVIDENCE_INVALID'), 'malformed provenance has an explicit blocker');

        const nonOrdinaryControlRoot = path.join(tempRoot, 'nonordinary-control-campaign');
        fs.mkdirSync(path.join(nonOrdinaryControlRoot, '.text-adventure', 'mod-profile.json'), { recursive: true });
        equal(activationHost.areModCanonicalWritesAllowed(nonOrdinaryControlRoot), false, 'a nonordinary control path is present, not absent');
        const nonOrdinaryControl = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot: nonOrdinaryControlRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(nonOrdinaryControl.decision.mode, 'safe-required', 'a nonordinary profile path requires Safe Mode');

        const manyLegacyRoot = path.join(tempRoot, 'many-legacy-checkpoints');
        const manyLegacyDir = path.join(manyLegacyRoot, '.text-adventure', 'checkpoints');
        fs.mkdirSync(manyLegacyDir, { recursive: true });
        // The old 2,048-file cutoff must not reject a normal legacy campaign.
        for (let i = 0; i < 2_049; i += 1) {
            fs.writeFileSync(path.join(manyLegacyDir, `cp-${i}.json`), '{"format":"text-adventure-checkpoint/1.0"}', 'utf8');
        }
        const manyLegacy = await activationHost.evaluateModActivationGate({
            globalStorageRoot,
            workspaceRoot: manyLegacyRoot,
            currentLoreRelayVersion: '1.84.32',
            adultSessionAllowed: false,
        });
        equal(manyLegacy.decision.mode, 'unmodded', 'more than 2048 genuine legacy checkpoints do not create false MOD evidence');

        const mismatchRoot = path.join(globalRoot, 'mismatch.mod', '1.0.0');
        writeManifest(mismatchRoot, manifest('other.mod', '1.0.0'));
        const mismatch = await discoveryHost.discoverModPackageManifests({ globalStorageRoot });
        check(mismatch.diagnostics.some(item => item.code === 'DIRECTORY_ID_MISMATCH'), 'discovery enforces directory ID/manifest equality');

        const scriptRoot = path.join(globalRoot, 'script.mod', '1.0.0');
        const scriptManifest = manifest('script.mod', '1.0.0');
        writeManifest(scriptRoot, scriptManifest);
        fs.writeFileSync(path.join(scriptRoot, 'payload.js'), 'throw new Error("must never execute")', 'utf8');
        const scriptDiscovery = await discoveryHost.discoverModPackageManifests({ globalStorageRoot });
        check(scriptDiscovery.manifests.some(item => item.manifest.id === 'script.mod'), 'manifest-only discovery does not inspect an unselected package payload');
        check(!scriptDiscovery.diagnostics.some(item => item.packageId === 'script.mod' && item.code === 'PACKAGE_FILE_TYPE_FORBIDDEN'), 'metadata discovery cannot leak payload classification');
        const scriptResult = await hashPackage('script.mod', '1.0.0', hashCore.hashCanonicalModJson(scriptManifest));
        check(scriptResult.diagnostics.some(item => item.code === 'PACKAGE_FILE_TYPE_FORBIDDEN'), 'exact hashing rejects executable/script payloads without execution');

        const adultPayloadRoot = path.join(globalRoot, 'adult.payload', '1.0.0');
        const adultPayloadManifest = manifest('adult.payload', '1.0.0', { contentRating: 'adult', contentTags: ['sexual-content'] });
        writeManifest(adultPayloadRoot, adultPayloadManifest);
        fs.writeFileSync(path.join(adultPayloadRoot, 'payload.js'), 'adult payload must not be read before approval', 'utf8');
        const adultPayloadDiscovery = await discoveryHost.discoverModPackageManifests({ globalStorageRoot });
        check(adultPayloadDiscovery.manifests.some(item => item.manifest.id === 'adult.payload'), 'adult manifest metadata can be discovered without payload reads');
        const adultPayloadBlocked = await hashPackage('adult.payload', '1.0.0', hashCore.hashCanonicalModJson(adultPayloadManifest));
        equal(adultPayloadBlocked.diagnostics.map(item => item.code), ['ADULT_CONTENT_READ_NOT_AUTHORIZED'], 'adult payload read requires an explicit exact-package authorization');
        const adultPayloadAllowed = await hashPackage('adult.payload', '1.0.0', hashCore.hashCanonicalModJson(adultPayloadManifest), { allowAdultContentRead: true });
        check(adultPayloadAllowed.diagnostics.some(item => item.code === 'PACKAGE_FILE_TYPE_FORBIDDEN'), 'authorized adult payload remains subject to ordinary declarative file validation');

        const outside = path.join(tempRoot, 'outside');
        fs.mkdirSync(outside, { recursive: true });
        fs.writeFileSync(path.join(outside, 'escape.txt'), 'outside', 'utf8');
        const linkRoot = path.join(globalRoot, 'linked.mod');
        fs.mkdirSync(linkRoot, { recursive: true });
        fs.symlinkSync(outside, path.join(linkRoot, '1.0.0'), 'junction');
        const linked = await discoveryHost.discoverModPackageManifests({ globalStorageRoot });
        check(linked.diagnostics.some(item => item.packageId === 'linked.mod' && item.code === 'PACKAGE_LINK_FORBIDDEN'), 'junction/symlink package root rejects before traversal');

        const hardLinkRoot = path.join(globalRoot, 'hardlink.mod', '1.0.0');
        const hardLinkManifest = manifest('hardlink.mod', '1.0.0');
        writeManifest(hardLinkRoot, hardLinkManifest);
        fs.writeFileSync(path.join(hardLinkRoot, 'README.md'), 'linked text', 'utf8');
        fs.linkSync(path.join(hardLinkRoot, 'README.md'), path.join(hardLinkRoot, 'LICENSE.txt'));
        const hardLinkDiscovery = await discoveryHost.discoverModPackageManifests({ globalStorageRoot });
        check(hardLinkDiscovery.manifests.some(item => item.manifest.id === 'hardlink.mod'), 'metadata discovery does not traverse hard-linked payload files');
        const hardLinked = await hashPackage('hardlink.mod', '1.0.0', hashCore.hashCanonicalModJson(hardLinkManifest));
        check(hardLinked.diagnostics.some(item => item.packageId === 'hardlink.mod' && item.code === 'PACKAGE_HARD_LINK_FORBIDDEN'), 'unexpected hard-link count rejects');

        const undeclaredRoot = path.join(globalRoot, 'undeclared.mod', '1.0.0');
        const undeclaredManifest = manifest('undeclared.mod', '1.0.0');
        writeManifest(undeclaredRoot, undeclaredManifest);
        fs.writeFileSync(path.join(undeclaredRoot, 'notes.txt'), 'not declared by the manifest closure', 'utf8');
        const undeclared = await hashPackage('undeclared.mod', '1.0.0', hashCore.hashCanonicalModJson(undeclaredManifest));
        check(undeclared.diagnostics.some(item => item.code === 'UNDECLARED_PACKAGE_FILE'), 'safe-extension files outside the validated manifest closure reject');

        const growthRoot = path.join(globalRoot, 'growth.mod', '1.0.0');
        const growthManifest = manifest('growth.mod', '1.0.0');
        writeManifest(growthRoot, growthManifest);
        const growthFile = path.join(growthRoot, 'README.md');
        fs.writeFileSync(growthFile, 'stable-size', 'utf8');
        let injectedGrowth = false;
        const growth = await hashPackage('growth.mod', '1.0.0', hashCore.hashCanonicalModJson(growthManifest), {
            afterFileStatForTest: async relativePath => {
                if (relativePath === 'README.md' && !injectedGrowth) {
                    injectedGrowth = true;
                    fs.appendFileSync(growthFile, '-grew-after-stat', 'utf8');
                }
            },
        });
        check(growth.diagnostics.some(item => item.code === 'PACKAGE_CHANGED_DURING_READ'), 'file growth after stat rejects without an unbounded allocation');

        const additionRoot = path.join(globalRoot, 'tree-add.mod', '1.0.0');
        const additionManifest = manifest('tree-add.mod', '1.0.0');
        writeManifest(additionRoot, additionManifest);
        fs.writeFileSync(path.join(additionRoot, 'README.md'), 'enumerated before addition', 'utf8');
        let injectedAddition = false;
        const addition = await hashPackage('tree-add.mod', '1.0.0', hashCore.hashCanonicalModJson(additionManifest), {
            afterFileStatForTest: async relativePath => {
                if (relativePath === 'README.md' && !injectedAddition) {
                    injectedAddition = true;
                    fs.writeFileSync(path.join(additionRoot, 'payload.js'), 'added after package enumeration', 'utf8');
                }
            },
        });
        equal(addition.diagnostics.map(item => item.code), ['PACKAGE_TREE_CHANGED_DURING_HASH'], 'final package tree revalidation rejects an added file');

        const deletionRoot = path.join(globalRoot, 'tree-delete.mod', '1.0.0');
        const deletionManifest = manifest('tree-delete.mod', '1.0.0');
        writeManifest(deletionRoot, deletionManifest);
        const deletionTarget = path.join(deletionRoot, 'LICENSE');
        fs.writeFileSync(deletionTarget, 'read before deletion', 'utf8');
        fs.writeFileSync(path.join(deletionRoot, 'README.md'), 'trigger deletion', 'utf8');
        let injectedDeletion = false;
        const deletion = await hashPackage('tree-delete.mod', '1.0.0', hashCore.hashCanonicalModJson(deletionManifest), {
            afterFileStatForTest: async relativePath => {
                if (relativePath === 'README.md' && !injectedDeletion) {
                    injectedDeletion = true;
                    fs.unlinkSync(deletionTarget);
                }
            },
        });
        equal(deletion.diagnostics.map(item => item.code), ['PACKAGE_TREE_CHANGED_DURING_HASH'], 'final package tree revalidation rejects a deleted file');

        const renameRoot = path.join(globalRoot, 'tree-rename.mod', '1.0.0');
        const renameManifest = manifest('tree-rename.mod', '1.0.0');
        writeManifest(renameRoot, renameManifest);
        const renameSource = path.join(renameRoot, 'LICENSE');
        fs.writeFileSync(renameSource, 'read before rename', 'utf8');
        fs.writeFileSync(path.join(renameRoot, 'README.md'), 'trigger rename', 'utf8');
        let injectedRename = false;
        const rename = await hashPackage('tree-rename.mod', '1.0.0', hashCore.hashCanonicalModJson(renameManifest), {
            afterFileStatForTest: async relativePath => {
                if (relativePath === 'README.md' && !injectedRename) {
                    injectedRename = true;
                    fs.renameSync(renameSource, path.join(renameRoot, 'LICENSE.txt'));
                }
            },
        });
        equal(rename.diagnostics.map(item => item.code), ['PACKAGE_TREE_CHANGED_DURING_HASH'], 'final package tree revalidation rejects a renamed file');

        const magicRoot = path.join(globalRoot, 'magic.mod', '1.0.0');
        const magicManifest = manifest('magic.mod', '1.0.0');
        writeManifest(magicRoot, magicManifest);
        fs.writeFileSync(path.join(magicRoot, 'image.png'), Buffer.from('MZ-not-a-png', 'utf8'));
        const magic = await hashPackage('magic.mod', '1.0.0', hashCore.hashCanonicalModJson(magicManifest), { validatedTransitivePaths: ['image.png'] });
        check(magic.diagnostics.some(item => item.code === 'PACKAGE_BINARY_MAGIC_MISMATCH'), 'safe media extension requires matching binary magic');

        const missingEntryRoot = path.join(globalRoot, 'missing.entry', '1.0.0');
        const missingEntryManifest = manifest('missing.entry', '1.0.0', {
            capabilities: ['prompt-fragment'],
            entrypoints: { promptFragments: [{ path: 'content/prompts.json' }] },
        });
        writeManifest(missingEntryRoot, missingEntryManifest);
        const missingEntry = await hashPackage('missing.entry', '1.0.0', hashCore.hashCanonicalModJson(missingEntryManifest));
        check(missingEntry.diagnostics.some(item => item.code === 'DECLARED_PACKAGE_FILE_MISSING'), 'direct manifest entrypoint must exist in the validated package closure');
    } finally {
        const resolvedTemp = path.resolve(tempRoot);
        check(resolvedTemp.startsWith(path.resolve(os.tmpdir()) + path.sep), 'test cleanup target stays under OS temp');
        fs.rmSync(resolvedTemp, { recursive: true, force: true });
    }

    const productionEntry = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    check(productionEntry.includes("./mods/modActivationGateHost"), 'production startup is wired only to the activation gate host');
    check(!productionEntry.includes('mods/contributions'), 'activation gate does not load any MOD contribution adapter');
    check(productionEntry.includes('dispatchGateCheckedWebviewMessage'), 'webview messages pass through one centralized Safe Mode dispatcher guard');
    check(productionEntry.indexOf('requireModCanonicalMutationAllowed())) return;') < productionEntry.indexOf('if (isParlorMode())'), 'provider authorization precedes Parlor and InWorld branches');
    const syncSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'gameStateSync.ts'), 'utf8');
    check(syncSource.includes('trustedAcceptedModContextByEntryId'), 'Accepted GM provenance uses a host-owned entry witness');
    check(!syncSource.includes('const incomingModContext = parseModContext(entry.modContext)'), 'external game_state synchronization cannot overwrite history provenance');
    const sanitizeSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'gameStateSanitize.ts'), 'utf8');
    check(!sanitizeSource.includes('out.modContext'), 'salvage strips externally supplied game_state provenance');
    for (const file of ['modManifestCore.ts', 'modPathCore.ts', 'modHashCore.ts', 'modProfileCore.ts', 'modResolverCore.ts', 'modSafeModeCore.ts', 'modActivationGateCore.ts']) {
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'mods', file), 'utf8');
        check(!/from ['"](?:vscode|child_process|net|http|https|vm)['"]/.test(source), `${file} has no code, process, VS Code, or network authority`);
        check(!/Date\.now|setTimeout|performance\.now/.test(source), `${file} has no wall-clock resolver authority`);
    }

    console.log(`MOD Substrate V1 focused tests passed (${assertions} assertions)`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
