#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sampleDir = path.join(root, 'sample-scenarios', 'trade-routes');
const rules = JSON.parse(fs.readFileSync(path.join(sampleDir, 'game_rules.json'), 'utf8'));
const forge = JSON.parse(fs.readFileSync(path.join(sampleDir, 'world_forge.json'), 'utf8'));
const scenario = JSON.parse(fs.readFileSync(path.join(sampleDir, 'scenario.json'), 'utf8'));
const scenarioCore = fs.readFileSync(path.join(root, 'src', 'scenarioPackCore.ts'), 'utf8');
const scenarioLoader = fs.readFileSync(path.join(root, 'src', 'scenarioPack.ts'), 'utf8');

assert.equal(rules.enableCommerce, true, 'trade-routes enables Commerce');
assert.equal(rules.enableCommerceUi, true, 'trade-routes enables Commerce UI');
assert.equal(rules.playerRole, 'merchant', 'trade-routes starts as a merchant');
assert(scenarioCore.includes("'trade-routes'"), 'trade-routes is a bundled sample ID');

const markets = forge.commerce?.markets || [];
assert(markets.length >= 2, 'trade-routes provides at least two markets');
assert(markets.every((market) => market.locationId && (market.commodityIds || []).length > 0), 'each trading market is usable');
assert((forge.commerce?.transportKinds || []).some((transport) => transport.id === 'wagon'), 'trade-routes supplies wagon transport');
assert(/buy wheat[\s\S]*travel[\s\S]*sell/i.test(scenario.meta?.description || ''), 'sample describes the playable merchant loop');
assert.equal(scenario.opening?.commerce?.credits, 500, 'sample seeds usable starting credits');
assert.deepEqual(scenario.opening?.commerce?.cargo, [], 'sample starts with actionable empty cargo');
assert.equal(scenario.opening?.commerce?.transportId, 'wagon', 'sample seeds a caravan transport');
assert.equal(scenario.opening?.world?.currentLocationId, 'elda_shop', 'sample starts at a usable market');
assert(scenarioLoader.includes('normalizeOpeningCommerce(opening.commerce)'), 'normal scenario loading persists opt-in initial caravan data');
assert(scenarioLoader.includes('normalizeOpeningWorld(opening.world)'), 'normal scenario loading persists an opt-in starting location');

console.log('NOAI trading sample: all tests passed.');
