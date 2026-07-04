#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'modSystemCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/modSystemCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    parseModManifest,
    parseModProfile,
    resolveModProfile,
} = require(corePath);

function mod(id, records, extra = {}) {
    return {
        manifestVersion: 1,
        id,
        name: id,
        version: '1.0.0',
        provides: records,
        ...extra,
    };
}

{
    if (parseModManifest(null) !== undefined) {
        fail('null manifest rejected');
    } else if (parseModManifest({ manifestVersion: 2, id: 'a.b', name: 'X' }) !== undefined) {
        fail('wrong manifestVersion rejected');
    } else if (parseModManifest({ id: 'BAD ID', name: 'X' }) !== undefined) {
        fail('invalid mod id rejected');
    } else if (parseModManifest({ id: 'author.mod', name: '' }) !== undefined) {
        fail('empty name rejected');
    } else {
        ok('invalid manifest rejected safely');
    }
}

{
    const parsed = parseModManifest({
        manifestVersion: 1,
        id: 'author.safe-mod',
        name: 'Safe Mod',
        version: '1.2.3',
        author: 'Author',
        categories: ['world', 'bogus', 'scenario'],
        dependencies: [{ modId: 'base.core' }, { modId: 'bad id' }],
        provides: [
            { domain: 'scenario', id: 'harbor', data: { title: 'Harbor' } },
            { domain: 'scenario', id: 'harbor', data: { dup: true } },
            { domain: 'bad', id: 'x' },
        ],
        aliasRules: [
            { domain: 'scenario', fromId: 'old_id', toId: 'new_id', reason: 'compat' },
            { domain: 'scenario', fromId: 'same', toId: 'same' },
        ],
        files: [{ path: '../escape', role: 'data' }, { path: 'data/world.json', role: 'data' }],
        safety: { dataOnly: true },
    });
    if (!parsed || parsed.id !== 'author.safe-mod') {
        fail('valid manifest parsed');
    } else if (parsed.categories.length !== 2 || parsed.categories[1] === 'bogus') {
        fail('categories sanitized');
    } else if (parsed.dependencies.length !== 1 || parsed.dependencies[0].modId !== 'base.core') {
        fail('dependencies sanitized');
    } else if (parsed.records.length !== 1 || parsed.records[0].id !== 'harbor') {
        fail('provides deduped and parsed');
    } else if (parsed.aliasRules.length !== 1 || parsed.aliasRules[0].fromId !== 'old_id') {
        fail('alias rules parsed');
    } else if (parsed.files.length !== 1 || !parsed.files[0].path.includes('world.json')) {
        fail('unsafe file paths filtered');
    } else if (!parsed.safety?.dataOnly) {
        fail('safety parsed');
    } else {
        ok('valid manifest parsed');
    }
}

{
    const profile = parseModProfile({
        profileVersion: 1,
        name: 'Test Profile',
        enabledMods: [
            { modId: 'a.base', enabled: true, priority: 10 },
            { modId: 'b.patch', enabled: false, priority: 20 },
            { modId: 'a.base', enabled: true, priority: 99 },
            { modId: 'bad id', enabled: true, priority: 5 },
        ],
    });
    const patchEntry = profile.enabledMods.find((e) => e.modId === 'b.patch');
    const baseEntry = profile.enabledMods.find((e) => e.modId === 'a.base');
    if (profile.name !== 'Test Profile' || profile.enabledMods.length !== 2) {
        fail('profile parses enabled mods with dedupe');
    } else if (!patchEntry || patchEntry.enabled !== false) {
        fail('disabled mod entry preserved with enabled:false');
    } else if (!baseEntry || baseEntry.priority !== 10) {
        fail('duplicate mod id keeps first profile entry');
    } else {
        ok('profile parsed with dedupe');
    }
}

{
    const base = parseModManifest(mod('a.base', [
        { domain: 'scenario', id: 'shared', data: { from: 'base' } },
    ]));
    const patch = parseModManifest(mod('b.patch', [
        { domain: 'scenario', id: 'shared', data: { from: 'patch' } },
        { domain: 'lore_entry', id: 'only_patch', data: { lore: 1 } },
    ]));
    const profile = parseModProfile({
        name: 'Load Order',
        enabledMods: [
            { modId: 'a.base', enabled: true, priority: 10 },
            { modId: 'b.patch', enabled: true, priority: 20 },
        ],
    });
    const result = resolveModProfile({
        profile,
        mods: { 'a.base': base, 'b.patch': patch },
    });
    const shared = result.records.find((r) => r.key.id === 'shared');
    if (!shared || shared.modId !== 'b.patch' || shared.data?.from !== 'patch') {
        fail('later load order wins exact conflict');
    } else if (result.records.length !== 2) {
        fail(`expected 2 resolved records, got ${result.records.length}`);
    } else {
        ok('later load order wins exact conflict');
    }
}

{
    const base = parseModManifest(mod('a.base', [
        { domain: 'vehicle', id: 'truck', data: { hp: 10 } },
    ]));
    const mid = parseModManifest(mod('b.mid', [
        { domain: 'vehicle', id: 'truck', data: { hp: 20 } },
    ]));
    const top = parseModManifest(mod('c.top', [
        { domain: 'vehicle', id: 'truck', data: { hp: 30 } },
    ]));
    const profile = parseModProfile({
        name: 'Conflict Report',
        enabledMods: [
            { modId: 'a.base', enabled: true, priority: 0 },
            { modId: 'b.mid', enabled: true, priority: 10 },
            { modId: 'c.top', enabled: true, priority: 20 },
        ],
    });
    const result = resolveModProfile({
        profile,
        mods: { 'a.base': base, 'b.mid': mid, 'c.top': top },
    });
    const conflict = result.report.conflicts.find((c) => c.key.id === 'truck');
    if (!conflict) {
        fail('conflict report present');
    } else if (conflict.winnerModId !== 'c.top') {
        fail(`winner should be c.top, got ${conflict.winnerModId}`);
    } else if (conflict.overriddenModIds.join(',') !== 'a.base,b.mid') {
        fail(`overridden mods expected a.base,b.mid got ${conflict.overriddenModIds.join(',')}`);
    } else {
        ok('conflict report lists winner and overridden mods');
    }
}

{
    const child = parseModManifest(mod('child.mod', [], { dependencies: [{ modId: 'missing.parent' }] }));
    const profile = parseModProfile({
        name: 'Missing Dep',
        enabledMods: [{ modId: 'child.mod', enabled: true, priority: 0 }],
    });
    const result = resolveModProfile({ profile, mods: { 'child.mod': child } });
    const issue = result.report.missingDependencies.find((i) => i.kind === 'missing');
    if (!issue || issue.dependencyModId !== 'missing.parent') {
        fail('missing dependency reported');
    } else {
        ok('missing dependency reported');
    }
}

{
    const a = parseModManifest(mod('mod.a', [], { dependencies: [{ modId: 'mod.b' }] }));
    const b = parseModManifest(mod('mod.b', [], { dependencies: [{ modId: 'mod.a' }] }));
    const profile = parseModProfile({
        name: 'Cycle',
        enabledMods: [
            { modId: 'mod.a', enabled: true, priority: 0 },
            { modId: 'mod.b', enabled: true, priority: 10 },
        ],
    });
    const result = resolveModProfile({ profile, mods: { 'mod.a': a, 'mod.b': b } });
    const cycle = result.report.missingDependencies.find((i) => i.kind === 'cycle');
    if (!cycle || !cycle.message.includes('cycle')) {
        fail('dependency cycle reported');
    } else {
        ok('dependency cycle reported');
    }
}

{
    const one = parseModManifest(mod('one.mod', [
        { domain: 'character', id: 'hero_alpha', data: { name: 'Alpha' } },
    ]));
    const two = parseModManifest(mod('two.mod', [
        { domain: 'character', id: 'hero-alpha', data: { name: 'Beta' } },
    ]));
    const profile = parseModProfile({
        name: 'Similar IDs',
        enabledMods: [
            { modId: 'one.mod', enabled: true, priority: 0 },
            { modId: 'two.mod', enabled: true, priority: 10 },
        ],
    });
    const result = resolveModProfile({ profile, mods: { 'one.mod': one, 'two.mod': two } });
    if (result.records.length !== 2) {
        fail('similar IDs should not merge records');
    } else if (!result.report.loadOrderWarnings.some((w) => w.includes('Similar IDs'))) {
        fail('similar ID warning emitted');
    } else {
        ok('similar IDs warn but do not auto-remap');
    }
}

{
    const withAlias = parseModManifest(mod('alias.mod', [
        { domain: 'scenario', id: 'canonical', data: { ok: true } },
    ], {
        aliasRules: [{ domain: 'scenario', fromId: 'legacy', toId: 'canonical' }],
    }));
    const profile = parseModProfile({
        name: 'Alias Parse Only',
        enabledMods: [{ modId: 'alias.mod', enabled: true, priority: 0 }],
    });
    const result = resolveModProfile({ profile, mods: { 'alias.mod': withAlias } });
    if (result.records.some((r) => r.key.id === 'legacy')) {
        fail('alias rule must not be applied in MOD1');
    } else if (result.records.length !== 1 || result.records[0].key.id !== 'canonical') {
        fail('canonical record remains without alias remap');
    } else {
        ok('alias rule parsed but not applied');
    }
}

{
    const disabled = parseModManifest(mod('off.mod', [
        { domain: 'scenario', id: 'ghost', data: { hidden: true } },
    ]));
    const profile = parseModProfile({
        name: 'Disabled',
        enabledMods: [{ modId: 'off.mod', enabled: false, priority: 0 }],
    });
    const result = resolveModProfile({ profile, mods: { 'off.mod': disabled } });
    if (result.records.length !== 0) {
        fail('disabled mod ignored in resolution');
    } else {
        ok('disabled mod ignored');
    }
}

{
    const a = parseModManifest(mod('a.mod', [{ domain: 'faction', id: 'zeta', data: 1 }]));
    const b = parseModManifest(mod('b.mod', [{ domain: 'faction', id: 'alpha', data: 2 }]));
    const profile = parseModProfile({
        name: 'Deterministic',
        enabledMods: [
            { modId: 'b.mod', enabled: true, priority: 5 },
            { modId: 'a.mod', enabled: true, priority: 0 },
        ],
    });
    const input = { profile, mods: { 'a.mod': a, 'b.mod': b } };
    const r1 = resolveModProfile(input);
    const r2 = resolveModProfile(input);
    const j1 = JSON.stringify(r1);
    const j2 = JSON.stringify(r2);
    if (j1 !== j2) {
        fail('output deterministic');
    } else if (r1.records[0].key.id !== 'alpha') {
        fail('records sorted by domain+id');
    } else {
        ok('output deterministic');
    }
}

{
    const rawManifest = {
        manifestVersion: 1,
        id: 'mut.test',
        name: 'Mutable',
        provides: [{ domain: 'scenario', id: 'keep', data: { n: 1 } }],
        aliasRules: [{ domain: 'scenario', fromId: 'a', toId: 'b' }],
    };
    const rawProfile = {
        name: 'Mutable Profile',
        enabledMods: [{ modId: 'mut.test', enabled: true, priority: 0 }],
    };
    const manifestSnap = JSON.stringify(rawManifest);
    const profileSnap = JSON.stringify(rawProfile);
    const manifest = parseModManifest(rawManifest);
    const profile = parseModProfile(rawProfile);
    resolveModProfile({ profile, mods: { 'mut.test': manifest } });
    if (JSON.stringify(rawManifest) !== manifestSnap) {
        fail('manifest input mutated');
    } else if (JSON.stringify(rawProfile) !== profileSnap) {
        fail('profile input mutated');
    } else {
        ok('input not mutated');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll mod_system_core tests passed.');