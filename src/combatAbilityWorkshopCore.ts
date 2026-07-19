import { AbilityDefinition, AbilityFixtureDocument, StatusDefinition } from './combatAbilityTypes';
import { validateAbilityDefinition } from './combatAbilityValidator';
import { MechanicsCombatant, resolveMechanics } from './combatMechanicsResolver';

export interface CustomAbilityLibrary { schemaVersion: 'combat-ability-workshop-v1'; abilities: AbilityDefinition[]; }
export const emptyCustomAbilityLibrary = (): CustomAbilityLibrary => ({ schemaVersion: 'combat-ability-workshop-v1', abilities: [] });
export function validateWorkshopAbility(ability: AbilityDefinition, statuses: readonly StatusDefinition[]) { return validateAbilityDefinition(ability, { statuses }); }
export function saveCustomAbility(library: CustomAbilityLibrary, ability: AbilityDefinition, statuses: readonly StatusDefinition[]): CustomAbilityLibrary {
    const result = validateWorkshopAbility(ability, statuses); if (!result.valid) throw new Error(result.errors.map(error => error.code).join(','));
    if (library.abilities.some(item => item.id === ability.id)) throw new Error('DUPLICATE_ABILITY_ID');
    return { ...library, abilities: [...library.abilities, structuredClone(ability)] };
}
export function duplicateBuiltinAbility(ability: AbilityDefinition, id: string): AbilityDefinition { return { ...structuredClone(ability), id, name: `${ability.name} Copy` }; }
export function importCustomAbilityLibrary(json: string, existing: CustomAbilityLibrary, statuses: readonly StatusDefinition[]): { library: CustomAbilityLibrary; error?: string } {
    try { const parsed = JSON.parse(json) as CustomAbilityLibrary; if (parsed.schemaVersion !== 'combat-ability-workshop-v1' || !Array.isArray(parsed.abilities)) throw new Error('INVALID_SCHEMA'); let next = emptyCustomAbilityLibrary(); for (const ability of parsed.abilities) next = saveCustomAbility(next, ability, statuses); return { library: next }; } catch (error) { return { library: existing, error: error instanceof Error ? error.message : 'INVALID_JSON' }; }
}
export function exportCustomAbilityLibrary(library: CustomAbilityLibrary): string { return JSON.stringify(library, null, 2); }
export function workshopShot(ability: AbilityDefinition, attacker: MechanicsCombatant, target: MechanicsCombatant, statuses: readonly StatusDefinition[]) { const first = resolveMechanics({ ability, attacker, target, statuses }); const second = resolveMechanics({ ability, attacker, target, statuses }); return { resolution: first, deterministic: JSON.stringify(first) === JSON.stringify(second) }; }
export function splitBuiltinAndCustom(fixture: AbilityFixtureDocument, custom: CustomAbilityLibrary) { return { builtin: fixture.abilities.map(structuredClone), custom: custom.abilities.map(structuredClone) }; }
