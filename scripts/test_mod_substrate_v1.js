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
    assert.throws(() => hashCore.hashNormalizedModPackage([
        { path: 'A.json', kind: 'json', bytes: Buffer.from('{}') },
        { path: 'a.json', kind: 'json', bytes: Buffer.from('{}') },
    ]), error => error.code === 'PACKAGE_PATH_COLLISION');
    assertions += 1;
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
    const modContext = safeModeCore.buildModContext(adultResolved.lock);
    equal(modContext.adultActive, true, 'coarse modContext records adult-active lock');
    equal(safeModeCore.decideSafeModeHistoryPresentation({ author: 'machine', modContext, adultVisibilityAllowed: false, campaignMayHaveAdultModHistory: true }).presentation, 'placeholder', 'whole adult machine entry is placeholdered');
    equal(safeModeCore.decideSafeModeHistoryPresentation({ author: 'machine', modContext: undefined, adultVisibilityAllowed: false, campaignMayHaveAdultModHistory: true }).reason, 'MISSING_OR_INVALID_CONTEXT', 'missing marker conservatively hides potentially adult history');
    equal(safeModeCore.decideSafeModeHistoryPresentation({ author: 'machine', modContext: undefined, adultVisibilityAllowed: false, campaignMayHaveAdultModHistory: false }).presentation, 'show', 'ordinary unmodded history is unchanged');
    equal(safeModeCore.decideSafeModeHistoryPresentation({ author: 'user', modContext, adultVisibilityAllowed: false, campaignMayHaveAdultModHistory: true }).presentation, 'show', 'user-authored history is not classified by MOD marker');
    const unknownContext = { ...modContext, adultActive: false, lockFingerprint: hashCore.sha256ModBytes(Buffer.from('unknown-lock')) };
    equal(safeModeCore.decideSafeModeHistoryPresentation({
        author: 'machine',
        modContext: unknownContext,
        adultVisibilityAllowed: false,
        campaignMayHaveAdultModHistory: true,
        knownLockFingerprints: [modContext.lockFingerprint],
    }).reason, 'MISSING_OR_INVALID_CONTEXT', 'unknown lock fingerprint is conservatively treated as invalid provenance');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-mod-v1-'));
    try {
        const globalRoot = path.join(tempRoot, 'global', 'packages');
        const workspaceRoot = path.join(tempRoot, 'workspace', '.text-adventure', 'mods');
        const validRoot = path.join(globalRoot, 'discover.mod', '1.0.0');
        fs.mkdirSync(validRoot, { recursive: true });
        const discoverManifest = manifest('discover.mod', '1.0.0');
        fs.writeFileSync(path.join(validRoot, 'lorerelay.mod.json'), `${JSON.stringify(discoverManifest, null, 2)}\n`, 'utf8');
        fs.writeFileSync(path.join(validRoot, 'README.md'), 'declarative only\r\n', 'utf8');
        const discovered = await discoveryHost.discoverModPackages({ globalPackagesRoot: globalRoot, workspaceModsRoot: workspaceRoot });
        equal(discovered.diagnostics, [], 'bounded discovery accepts an ordinary contained package');
        equal(discovered.candidates.length, 1, 'bounded discovery emits one validated candidate');
        equal(discovered.candidates[0].source, 'global', 'discovery preserves configured source');

        const mismatchRoot = path.join(globalRoot, 'mismatch.mod', '1.0.0');
        fs.mkdirSync(mismatchRoot, { recursive: true });
        fs.writeFileSync(path.join(mismatchRoot, 'lorerelay.mod.json'), JSON.stringify(manifest('other.mod', '1.0.0')), 'utf8');
        const mismatch = await discoveryHost.discoverModPackages({ globalPackagesRoot: globalRoot });
        check(mismatch.diagnostics.some(item => item.code === 'DIRECTORY_ID_MISMATCH'), 'discovery enforces directory ID/manifest equality');

        const scriptRoot = path.join(globalRoot, 'script.mod', '1.0.0');
        fs.mkdirSync(scriptRoot, { recursive: true });
        fs.writeFileSync(path.join(scriptRoot, 'lorerelay.mod.json'), JSON.stringify(manifest('script.mod', '1.0.0')), 'utf8');
        fs.writeFileSync(path.join(scriptRoot, 'payload.js'), 'throw new Error("must never execute")', 'utf8');
        const scriptResult = await discoveryHost.discoverModPackages({ globalPackagesRoot: globalRoot });
        check(scriptResult.diagnostics.some(item => item.packageId === 'script.mod' && item.code === 'PACKAGE_FILE_TYPE_FORBIDDEN'), 'executable/script file type rejects without execution');

        const outside = path.join(tempRoot, 'outside');
        fs.mkdirSync(outside, { recursive: true });
        fs.writeFileSync(path.join(outside, 'escape.txt'), 'outside', 'utf8');
        const linkRoot = path.join(globalRoot, 'linked.mod');
        fs.mkdirSync(linkRoot, { recursive: true });
        fs.symlinkSync(outside, path.join(linkRoot, '1.0.0'), 'junction');
        const linked = await discoveryHost.discoverModPackages({ globalPackagesRoot: globalRoot });
        check(linked.diagnostics.some(item => item.packageId === 'linked.mod' && item.code === 'PACKAGE_LINK_FORBIDDEN'), 'junction/symlink package root rejects before traversal');

        const hardLinkRoot = path.join(globalRoot, 'hardlink.mod', '1.0.0');
        fs.mkdirSync(hardLinkRoot, { recursive: true });
        fs.writeFileSync(path.join(hardLinkRoot, 'lorerelay.mod.json'), JSON.stringify(manifest('hardlink.mod', '1.0.0')), 'utf8');
        fs.writeFileSync(path.join(hardLinkRoot, 'README.md'), 'linked text', 'utf8');
        fs.linkSync(path.join(hardLinkRoot, 'README.md'), path.join(hardLinkRoot, 'LICENSE.txt'));
        const hardLinked = await discoveryHost.discoverModPackages({ globalPackagesRoot: globalRoot });
        check(hardLinked.diagnostics.some(item => item.packageId === 'hardlink.mod' && item.code === 'PACKAGE_HARD_LINK_FORBIDDEN'), 'unexpected hard-link count rejects');
    } finally {
        const resolvedTemp = path.resolve(tempRoot);
        check(resolvedTemp.startsWith(path.resolve(os.tmpdir()) + path.sep), 'test cleanup target stays under OS temp');
        fs.rmSync(resolvedTemp, { recursive: true, force: true });
    }

    const productionEntry = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    check(!productionEntry.includes("./mods/"), 'Slice 1 remains dormant and is not wired into production activation');
    for (const file of ['modManifestCore.ts', 'modPathCore.ts', 'modHashCore.ts', 'modProfileCore.ts', 'modResolverCore.ts', 'modSafeModeCore.ts']) {
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
