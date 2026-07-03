// Guild Master G1: pure turn_result.guildOps application (no vscode/fs).

import type { TurnResult } from './types/TurnResult';
import {
    validateGuild,
    parseGuildOps,
    applyGuildOps,
    normalizeGuildConfig,
    type GuildConfig,
    type GuildState,
} from './guildCore';
import { refreshGuildSnapshotOnCommit } from './guildHallDriftCore';

export function readGuildFromState(gameState: Record<string, unknown>): GuildState | undefined {
    return validateGuild(gameState.guild);
}

export function applyGuildOpsToGameState(
    turnResult: Pick<TurnResult, 'guildOps'>,
    gameState: Record<string, unknown>,
    enabled: boolean,
    config?: Partial<GuildConfig>,
    worldTurnSeed = 0,
    registryNpcIds?: ReadonlySet<string>
): Record<string, unknown> {
    if (!enabled) {
        return gameState;
    }

    const ops = parseGuildOps(turnResult.guildOps);
    if (!ops) {
        return gameState;
    }

    let existing = readGuildFromState(gameState);
    if (!existing || !existing.enabled) {
        return gameState;
    }

    if (ops.kind === 'recruit_adventurer' && ops.adventurer && registryNpcIds) {
        if (!registryNpcIds.has(ops.adventurer.npcId)) {
            return gameState;
        }
    }

    if (ops.kind === 'assign_party' && ops.quest && registryNpcIds) {
        if (!ops.quest.npcIds.every((id) => registryNpcIds.has(id))) {
            return gameState;
        }
    }

    const normalized = normalizeGuildConfig(config);
    const { guild } = applyGuildOps(existing, ops, normalized, worldTurnSeed);

    let next: Record<string, unknown> = {
        ...gameState,
        guild,
    };
    next = refreshGuildSnapshotOnCommit(next, worldTurnSeed);
    return next;
}