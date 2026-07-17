#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'worldView.ts'), 'utf8');
const start = source.indexOf('export function deriveEconomyLogisticsScopeKey');
const end = source.indexOf('\nexport function initWorldView', start);
if (start < 0 || end < 2) throw new Error('scopeKey helper not found');
const helper = source.slice(start, end)
  .replace('export function ', 'function ')
  .replace('workspacePath?: string, worldName?: string, worldSeed?: string', 'workspacePath, worldName, worldSeed')
  .replace(': string {', ' {');
const context = { Math, String };
context.globalThis = context;
vm.runInNewContext(`${helper}\nglobalThis.scopeKey=deriveEconomyLogisticsScopeKey;`, context);
const key = context.scopeKey;

const first = key('C:\\Users\\Keisuke\\campaign-a', 'World A', 'seed-1');
// Normalized Windows paths remain equivalent.
assert.strictEqual(first, key('c:/users/keisuke/campaign-a/', 'World A', 'seed-1'));
assert.notStrictEqual(first, key('D:\\other\\campaign-a', 'World A', 'seed-1'));
// Same seed, renamed world → same scope (worldName ignored when seed present).
assert.strictEqual(first, key('C:\\Users\\Keisuke\\campaign-a', 'World Renamed', 'seed-1'));
assert.strictEqual(first, key('C:\\Users\\Keisuke\\campaign-a', '完全に別の名前', 'seed-1'));
// Different seed → different scope.
assert.notStrictEqual(first, key('C:\\Users\\Keisuke\\campaign-a', 'World A', 'seed-2'));
// No seed, different world names → different scope.
const namedA = key('C:\\Users\\Keisuke\\campaign-a', 'World A', undefined);
const namedB = key('C:\\Users\\Keisuke\\campaign-a', 'World B', undefined);
assert.notStrictEqual(namedA, namedB);
// Unicode NFC equivalence for names when seed is absent.
const nfc = 'cafe\u0301';
const composed = 'caf\u00e9';
assert.strictEqual(
  key('C:\\Users\\Keisuke\\campaign-a', nfc, undefined),
  key('C:\\Users\\Keisuke\\campaign-a', composed, undefined)
);
// workspace absent + seed → non-default, seed-stable.
assert.notStrictEqual(key(undefined, 'World A', 'seed-1'), 'default');
assert.strictEqual(key(undefined, 'World A', 'seed-1'), key(undefined, 'World B', 'seed-1'));
// No meaningful identity → default.
assert.strictEqual(key(undefined, undefined, undefined), 'default');
assert.strictEqual(key('', '', ''), 'default');
// Compact key; raw path/name/seed fragments must not appear.
assert.match(first, /^[a-z0-9_-]{1,32}$/);
assert.ok(!first.includes('keisuke') && !first.includes('campaign'));
assert.ok(!first.includes('seed-1') && !first.includes('World'));
assert.ok(!namedA.includes('World'));

console.log('worldView logistics scopeKey: all tests passed.');
