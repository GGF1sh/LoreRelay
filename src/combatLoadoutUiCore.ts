import { AbilityDefinition, StatusDefinition } from './combatAbilityTypes';
import { AbilityValidationResult, validateAbilityDefinition } from './combatAbilityValidator';
import { BattleSpec, CombatMode } from './gambitCombatCore';
import { MechanicsCombatant, MechanicsReceipt } from './combatMechanicsResolver';

export interface AbilityLoadout { normalAttackAbilityId?: string; healAbilityId?: string; supportAbilityId?: string; }
export interface CombatLoadoutState { mode: CombatMode; loadouts: Record<string, AbilityLoadout>; }
export interface AbilityOption { ability: AbilityDefinition; validation: AbilityValidationResult; selectable: boolean; summary: string; }
export const defaultCombatLoadoutState = (): CombatLoadoutState => ({ mode: 'legacy_gambit', loadouts: {} });
export function normalizeCombatLoadoutState(value: unknown): CombatLoadoutState {
    if (!value || typeof value !== 'object') return defaultCombatLoadoutState();
    const raw = value as Partial<CombatLoadoutState>;
    return { mode: raw.mode === 'mechanics_v1' ? 'mechanics_v1' : 'legacy_gambit', loadouts: raw.loadouts && typeof raw.loadouts === 'object' ? structuredClone(raw.loadouts) : {} };
}
export function describeAbility(ability: AbilityDefinition, validation: AbilityValidationResult): string {
    const effects = ability.effects.map(effect => effect.kind + (effect.statusId ? `:${effect.statusId}` : '')).join(', ');
    const targets = ability.effects.flatMap(effect => effect.targetRequirement).join(', ') || 'any target';
    const budget = validation.powerBudget ? `${validation.powerBudget.cost}/${validation.powerBudget.toleratedBudget}` : 'not calculated';
    return `${ability.name} · ${ability.delivery.shape} · ${ability.effects[0]?.vector || 'none'} · cd ${ability.auto.cooldown}s · ${effects} · ${targets} · counters: ${ability.counters.join(', ')} · budget ${budget}`;
}
export function buildAbilityOptions(abilities: readonly AbilityDefinition[], statuses: readonly StatusDefinition[]): AbilityOption[] {
    return abilities.map(ability => { const validation = validateAbilityDefinition(ability, { statuses }); return { ability, validation, selectable: validation.valid, summary: describeAbility(ability, validation) }; });
}
export function applyLoadoutsToBattleSpec(spec: BattleSpec, state: CombatLoadoutState, abilities: readonly AbilityDefinition[], statuses: readonly StatusDefinition[]): BattleSpec {
    const normalized = normalizeCombatLoadoutState(state);
    if (normalized.mode === 'legacy_gambit') { const legacy = structuredClone(spec); delete legacy.combatMode; delete legacy.mechanics; return legacy; }
    const byId = new Map(buildAbilityOptions(abilities, statuses).filter(option => option.selectable).map(option => [option.ability.id, option.ability]));
    const output = structuredClone(spec); output.combatMode = 'mechanics_v1'; output.mechanics = { statuses: structuredClone([...statuses]) };
    for (const side of [output.initialState.units.allies, output.initialState.units.enemies]) for (const unit of side) {
        const loadout = normalized.loadouts[unit.name] || {}; unit.normalAttackAbility = byId.get(loadout.normalAttackAbilityId || ''); unit.healAbility = byId.get(loadout.healAbilityId || '');
        if (!unit.normalAttackAbility) delete unit.normalAttackAbility; if (!unit.healAbility) delete unit.healAbility;
    }
    return output;
}
export function formatMechanicsReceipt(receipt: MechanicsReceipt): string {
    if (receipt.kind === 'barrier_absorbed') return `Barrier absorbed ${receipt.amount} damage.`;
    if (receipt.kind === 'status_applied') return `${receipt.statusId} took effect.`;
    if (receipt.kind === 'buildup_added') return `${receipt.statusId} buildup +${receipt.amount}.`;
    if (receipt.kind === 'subsystem_disabled') return `${receipt.subsystemTag} subsystem disabled.`;
    if (receipt.kind === 'sleep_broken') return 'Sleep was broken by damage.';
    if (receipt.kind === 'healed') return `Recovered ${receipt.amount} HP.`;
    return receipt.kind.replaceAll('_', ' ') + (receipt.amount !== undefined ? ` (${receipt.amount})` : '.');
}
export function mechanicsDisplayModel(state: MechanicsCombatant, receipts: readonly MechanicsReceipt[]) {
    return { hp: state.hp, barrier: state.barrier?.amount || 0, statuses: state.statuses || [], buildup: state.buildup || {}, healBlocked: (state.statuses || []).some(item => item.id === 'heal_block'), cannotAct: (state.statuses || []).some(item => ['stun','sleep','petrify'].includes(item.id)), cannotMove: (state.statuses || []).some(item => ['stun','sleep','petrify','paralysis'].includes(item.id)), subsystems: (state.subsystems || []).filter(item => item.disabledSeconds > 0), receipts: receipts.map(formatMechanicsReceipt) };
}
