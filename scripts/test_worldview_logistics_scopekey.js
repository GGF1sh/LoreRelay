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
  .replace('workspacePath?: string, scenarioId?: string', 'workspacePath, scenarioId')
  .replace(': string {', ' {');
const context = { Math, String };
context.globalThis = context;
vm.runInNewContext(`${helper}\nglobalThis.scopeKey=deriveEconomyLogisticsScopeKey;`, context);
const key = context.scopeKey;

const first = key('C:\\Users\\Keisuke\\campaign-a', 'seed-1');
assert.strictEqual(first, key('C:\\Users\\Keisuke\\campaign-a', 'seed-1'));
assert.notStrictEqual(first, key('D:\\other\\campaign-a', 'seed-1'));
assert.notStrictEqual(first, key('C:\\Users\\Keisuke\\campaign-a', 'seed-2'));
assert.match(first, /^[a-z0-9_-]{1,32}$/);
assert.ok(!first.includes('keisuke') && !first.includes('campaign'));
assert.strictEqual(key(undefined, 'seed-1'), 'default');
assert.ok(source.includes('scopeKey: deriveEconomyLogisticsScopeKey(wsPath, forge.meta.worldSeed)'));
console.log('worldView logistics scopeKey: all tests passed.');
