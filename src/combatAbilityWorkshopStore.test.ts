import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { AbilityDefinition, StatusDefinition } from './combatAbilityTypes';
import { emptyCustomAbilityLibrary, saveCustomAbility } from './combatAbilityWorkshopCore';
import { combatAbilityWorkshopFile, loadCustomAbilityLibrary, writeCustomAbilityLibrary } from './combatAbilityWorkshopStore';

const statuses: StatusDefinition[] = [];
const ability: AbilityDefinition = { id: 'workshop_store_test', name: 'Stored', tier: 'normal', delivery: { shape: 'single_target', range: 1, maxTargets: 1, falloff: 1, dodgeable: true, blockedByCover: false, pierces: false }, effects: [{ kind: 'damage', vector: 'physical', penetration: { barrier: 'passes', armor: 'passes', requiresBodyContact: false, requiresDamageDealt: false }, targetRequirement: [], magnitude: 1 }], auto: { cooldown: 1, gambitTags: [] }, scaleBehavior: { individual: 'full', huge: 'full', squad: 'full', fleet: 'full' }, counters: ['armor'], tags: [] };

test('workspace custom ability library round-trips and malformed storage remains recoverable', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'combat-workshop-'));
    try {
        const library = saveCustomAbility(emptyCustomAbilityLibrary(), ability, statuses);
        writeCustomAbilityLibrary(workspace, library, statuses);
        assert.equal(loadCustomAbilityLibrary(workspace, statuses).library.abilities[0].id, ability.id);
        fs.writeFileSync(combatAbilityWorkshopFile(workspace), '{', 'utf8');
        assert.equal(loadCustomAbilityLibrary(workspace, statuses).library.abilities.length, 0);
        assert.ok(loadCustomAbilityLibrary(workspace, statuses).error);
    } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});
