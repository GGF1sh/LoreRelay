import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { AbilityFixtureDocument, AbilityDefinition } from './combatAbilityTypes';
import {
    AbilityValidationErrorCode,
    isJsonSerializable,
    validateAbilityDefinition,
    validateAbilityFixtureDocument,
} from './combatAbilityValidator';

const fixturePath = path.join(__dirname, '../test/fixtures/combat-abilities/v1-reference-abilities.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as AbilityFixtureDocument;
const get = (id: string): AbilityDefinition => {
    const ability = fixture.abilities.find(entry => entry.id === id);
    assert.ok(ability, `fixture ability ${id} exists`);
    return structuredClone(ability);
};
const validate = (ability: unknown) => validateAbilityDefinition(ability, { statuses: fixture.statuses });
const hasError = (ability: unknown, code: AbilityValidationErrorCode) => validate(ability).errors.some(error => error.code === code);

describe('Combat Ability Schema V1', () => {
    test('ships all twenty §10 representative abilities as JSON fixtures', () => {
        assert.equal(fixture.schemaVersion, 'combat-ability-v1');
        assert.equal(fixture.abilities.length, 20);
        assert.ok(isJsonSerializable(fixture));
        assert.equal(validateAbilityFixtureDocument(fixture).length, 20);
    });

    test('accepts normal automated and direct-control examples', () => {
        const slash = validate(get('basic_slash'));
        assert.equal(slash.valid, true);
        assert.deepEqual(slash.powerBudget, { cost: 14, budget: 13.5, toleratedBudget: 14.850000000000001 });
        const blink = validate(get('blink'));
        assert.equal(blink.valid, true);
        assert.equal(get('perfect_dodge').direct?.justWindowMs, 120);
    });

    test('Naval Bombardment is re-priced to fit the target-count budget', () => {
        // Previously shipped deliberately over budget as a worked example. Now that fan-out makes
        // maxTargets real, it is priced by expected targets and re-tuned to 4 targets on a 7s cooldown.
        const result = validate(get('naval_bombardment'));
        assert.equal(result.valid, true);
        assert.ok(result.powerBudget!.cost <= result.powerBudget!.toleratedBudget);
        assert.ok(!result.errors.some(error => error.code === AbilityValidationErrorCode.POWER_BUDGET_EXCEEDED));
    });

    test('every shipped ability fits its budget', () => {
        for (const ability of fixture.abilities) {
            const result = validate(ability);
            assert.equal(result.valid, true, `${ability.id} must validate: ${result.errors.map(e => e.code).join(',')}`);
        }
    });

    test('enforces poison, bleed, target tags, hard-control cures, and subsystem conversion', () => {
        const poison = get('poison_arrow');
        poison.effects[1].penetration.requiresBodyContact = false;
        assert.ok(hasError(poison, AbilityValidationErrorCode.POISON_REQUIRES_BODY_CONTACT));

        const bleed = get('rend');
        bleed.effects[1].penetration.requiresDamageDealt = false;
        assert.ok(hasError(bleed, AbilityValidationErrorCode.BLEED_REQUIRES_DAMAGE_DEALT));

        const incompatible = get('poison_arrow');
        incompatible.effects[1].targetRequirement = ['construct'];
        assert.ok(hasError(incompatible, AbilityValidationErrorCode.VECTOR_TARGET_INCOMPATIBLE));

        const subsystem = get('petrify_ray');
        delete subsystem.scaleBehavior.hugeSubsystemTags;
        assert.ok(hasError(subsystem, AbilityValidationErrorCode.SUBSYSTEM_TAG_REQUIRED));

        const statuses = structuredClone(fixture.statuses);
        statuses.find(status => status.id === 'petrify')!.cureChannels = ['time'];
        const result = validateAbilityDefinition(get('petrify_ray'), { statuses });
        assert.ok(result.errors.some(error => error.code === AbilityValidationErrorCode.HARD_CC_COUNTER_REQUIRED));

        statuses.find(status => status.id === 'poison')!.buildupThreshold = 99;
        const invalidStatus = validateAbilityDefinition(get('basic_slash'), { statuses });
        assert.ok(invalidStatus.errors.some(error => error.code === AbilityValidationErrorCode.STATUS_INVALID));
    });

    test('rejects damage ordering, callbacks, cycles, and runtime classes', () => {
        const ordered = get('rend');
        [ordered.effects[0], ordered.effects[1]] = [ordered.effects[1], ordered.effects[0]];
        assert.ok(hasError(ordered, AbilityValidationErrorCode.DAMAGE_BEFORE_BUILDUP_REQUIRED));

        const callback = get('basic_slash') as unknown as Record<string, unknown>;
        callback.callback = () => undefined;
        assert.ok(hasError(callback, AbilityValidationErrorCode.NON_JSON_VALUE));

        const cyclic = get('basic_slash') as unknown as Record<string, unknown>;
        cyclic.self = cyclic;
        assert.ok(hasError(cyclic, AbilityValidationErrorCode.CYCLIC_REFERENCE));

        const runtimeClass = get('basic_slash') as unknown as Record<string, unknown>;
        runtimeClass.createdAt = new Date();
        assert.ok(hasError(runtimeClass, AbilityValidationErrorCode.RUNTIME_CLASS_FORBIDDEN));
    });
});
