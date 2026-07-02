// LW1 v1+ — playerRole trade motivation for GM prompt (pure).

import type { PlayerRole } from './livingWorldTypes';
import { isValidPlayerRole } from './livingWorldCommerceUiCore';

export const PLAYER_ROLE_MOTIVATION: Record<PlayerRole, string> = {
    merchant: 'Profit from regional price spreads; buy cheap, sell where demand is high.',
    adventurer: 'Trade to fund expeditions; favor light, high-value cargo over bulk grain.',
    retainer: 'Procure supplies for your lord; reliability and duty over short-term margin.',
    smith: 'Source raw materials (steel, metal stock) for craft; avoid speculative hoarding.',
    ruler: 'Stabilize regional food supply and strategic stockpiles; leverage over quick profit.',
};

const PLAYER_ROLE_LABEL: Record<PlayerRole, string> = {
    merchant: 'Merchant',
    adventurer: 'Adventurer',
    retainer: 'Retainer',
    smith: 'Smith',
    ruler: 'Ruler',
};

export function resolvePlayerRoleForPrompt(role: unknown): PlayerRole {
    return isValidPlayerRole(role) ? role : 'merchant';
}

export function buildPlayerRoleMotivationLine(role: unknown): string {
    const resolved = resolvePlayerRoleForPrompt(role);
    return `Role: ${PLAYER_ROLE_LABEL[resolved]} — ${PLAYER_ROLE_MOTIVATION[resolved]}`;
}