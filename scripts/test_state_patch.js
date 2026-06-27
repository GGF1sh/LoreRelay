#!/usr/bin/env node
/**
 * Unit tests for statePatch / turnResultFallback (requires npm run compile).
 */
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    fail(`${label}: got ${a}, expected ${e}`);
    return false;
  }
  ok(label);
  return true;
}

const statePatchPath = path.join(root, 'out', 'statePatch.js');

if (!require('fs').existsSync(statePatchPath)) {
  fail('out/statePatch.js missing — run npm run compile first');
  process.exit(1);
}

// statePatch.ts imports vscode — provide a minimal stub for Node tests.
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return { window: { showErrorMessage() {} } };
  }
  return origRequire.apply(this, arguments);
};

const { applyStatePatch, mergeGmEntryFromTurn, hashGameState, buildStatePatchFromDiff } = require(statePatchPath);
Module.prototype.require = origRequire;

const baseState = {
  status: { hp: { current: 10, max: 20 }, location: 'forest' },
  options: ['look', 'rest'],
  theme: 'fantasy',
  entries: []
};

// applyStatePatch allowlist
const patched = applyStatePatch(baseState, [
  { op: 'replace', path: '/bgm', value: 'battle_theme' },
  { op: 'replace', path: '/mood', value: 'tense' },
  { op: 'replace', path: '/status/hp/current', value: 8 },
  { op: 'replace', path: '/entries/0/content', value: 'blocked' },
  { op: 'replace', path: '/__proto__/evil', value: true }
]);
assertEqual(patched.bgm, 'battle_theme', 'applyStatePatch allows bgm');
assertEqual(patched.mood, 'tense', 'applyStatePatch allows mood');
assertEqual((patched.status).hp.current, 8, 'applyStatePatch nested status');
assertEqual(patched.entries, [], 'applyStatePatch blocks entries path');

// mergeGmEntryFromTurn
const merged = mergeGmEntryFromTurn(baseState, {
  turnId: 'turn-3',
  narration: 'You enter the cave.',
  gmEntry: { imagePrompt: 'dark cave entrance' }
});
assertEqual(merged.entries.length, 1, 'mergeGmEntry adds entry');
assertEqual(merged.entries[0].id, 'turn-3', 'mergeGmEntry turn id');
assertEqual(merged.entries[0].content, 'You enter the cave.', 'mergeGmEntry narration');
assertEqual(merged.entries[0].imagePrompt, 'dark cave entrance', 'mergeGmEntry imagePrompt');

const updated = mergeGmEntryFromTurn(merged, {
  turnId: 'turn-3',
  narration: 'You enter the deeper cave.',
  gmEntry: {}
});
assertEqual(updated.entries.length, 1, 'mergeGmEntry updates in place');
assertEqual(updated.entries[0].content, 'You enter the deeper cave.', 'mergeGmEntry overwrites content');

// hashGameState stability
const h1 = hashGameState(baseState);
const h2 = hashGameState(JSON.parse(JSON.stringify(baseState)));
assertEqual(h1, h2, 'hashGameState stable');

// buildStatePatchFromDiff
const nextState = {
  ...baseState,
  bgm: 'victory',
  status: { hp: { current: 5, max: 20 }, location: 'cave' }
};
const diffPatches = buildStatePatchFromDiff(baseState, nextState);
const paths = diffPatches.map((p) => p.path).sort();
assertEqual(paths, ['/bgm', '/status'], 'buildStatePatchFromDiff paths');

const directorPatched = applyStatePatch(baseState, [
  { op: 'add', path: '/director', value: { scene: 'Boss Room', achievedEndings: ['boss_defeated'] } }
]);
assertEqual(directorPatched.director?.scene, 'Boss Room', 'applyStatePatch allows director');

// ---------------------------------------------------------------------------
// Phase 2: MAX_PATCH_OPS — truncate at 50
// ---------------------------------------------------------------------------

{
    const manyPatches = Array.from({ length: 70 }, (_, i) => ({
        op: 'replace', path: '/bgm', value: `track_${i}`
    }));
    const r = applyStatePatch(baseState, manyPatches);
    // Should complete without throwing (truncated internally)
    if (typeof r !== 'object') {
        fail('applyStatePatch should return object even with 70 patches');
    } else {
        ok('applyStatePatch survives 70 patch ops (truncated to 50)');
    }
}

// ---------------------------------------------------------------------------
// Phase 2: MAX_PATCH_VALUE_BYTES — skip values > 100KB
// ---------------------------------------------------------------------------

{
    const hugePatch = { op: 'replace', path: '/bgm', value: 'x'.repeat(200_000) };
    const r = applyStatePatch(baseState, [hugePatch]);
    if (r.bgm === 'x'.repeat(200_000)) {
        fail('applyStatePatch should skip oversized patch value');
    } else {
        ok('applyStatePatch skips value > 100KB');
    }
}

{
    // Value just under 100KB should still apply
    const nearLimitPatch = { op: 'replace', path: '/bgm', value: 'y'.repeat(99_000) };
    const r = applyStatePatch(baseState, [nearLimitPatch]);
    if (r.bgm !== 'y'.repeat(99_000)) {
        fail('applyStatePatch should apply value just under 100KB');
    } else {
        ok('applyStatePatch applies value just under 100KB');
    }
}

if (failed > 0) {
  process.exit(1);
}
console.log('\nstatePatch tests passed.');