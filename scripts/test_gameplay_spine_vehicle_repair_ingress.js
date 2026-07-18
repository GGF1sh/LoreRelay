#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const runner = fs.readFileSync(path.join(root, 'src', 'gameplaySpineVehicleRepairRunner.ts'), 'utf8');
const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
const host = fs.readFileSync(path.join(root, 'src', 'gameplaySpineVehicleRepairCommitHost.ts'), 'utf8');

assert.strictEqual(pkg.contributes.configuration.properties['textAdventure.gameplaySpine.vehicleRepairMode'].default, 'off');
assert(pkg.activationEvents.includes('onCommand:textadventure.gameplaySpineRepairVehicle'));
assert(pkg.contributes.commands.some((command) => command.command === 'textadventure.gameplaySpineRepairVehicle'
    && command.title === 'LoreRelay: Repair Vehicle with Gameplay Spine'));
assert.match(extension, /textadventure\.gameplaySpineRepairVehicle/);
assert.match(extension, /runGameplaySpineVehicleRepairCommand/);
for (const symbol of [
    'reconcileVehicleRepairRequest', 'queryWorldIntent', 'executeWorldIntent',
    'planVehicleRepairPreview', 'buildVehicleRepairEffectPlan', 'commitVehicleRepairEffectPlan',
]) {
    assert.match(runner, new RegExp(`\\b${symbol}\\b`), `${symbol} must remain in the narrow command flow`);
}
assert.match(host, /reconcileVehicleRepairRequestWithDeps/);
assert.match(host, /request_id_conflict/);
assert.doesNotMatch(runner, /JSON\.parse\(.*EffectPlan|generic action executor/i);

console.log('Gameplay Spine vehicle repair production ingress registration and narrow flow tests passed.');
