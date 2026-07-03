// Domain §F10: mass battle resolver — 3 fixed rounds, deterministic (no vscode/fs).
// Type-only import from domainCore keeps runtime dependency one-directional (domainCore → this).

import type { DomainStatDelta } from './domainCore';

export const MAX_BATTLE_ROUNDS = 3;

export type BattleTactic = 'assault' | 'hold' | 'stratagem';
export type BattleOutcomeKind = 'victory' | 'costly_victory' | 'stalemate' | 'retreat' | 'rout';

export interface BattleSide {
    troops: number;
    /** 0–100 proxy for cohesion/training (domain.defense on the player side). */
    quality: number;
    /** 0–100; marshal officer skill on the player side, default 50. */
    commanderSkill: number;
    /** 0–100; only bonuses the `hold` tactic. */
    fortification?: number;
}

export interface BattleRoundResult {
    round: number;
    playerTactic: BattleTactic;
    enemyTactic: BattleTactic;
    playerLosses: number;
    enemyLosses: number;
    playerWonRound: boolean;
    narrativeHintId: string;
}

export interface BattleState {
    opponentLabel: string;
    maxRounds: number;
    playerTroopsStart: number;
    enemyTroopsStart: number;
    enemySide: BattleSide;
    playerTroopsRemaining: number;
    enemyTroopsRemaining: number;
    rounds: BattleRoundResult[];
}

export interface BattleOutcome {
    kind: BattleOutcomeKind;
    playerDelta: DomainStatDelta;
    /** Subtracted from a triggering rival's `strength`, if any (0 when not rival-triggered). */
    enemyStrengthDelta: number;
    reportLine: string;
}

const BATTLE_TACTICS: readonly BattleTactic[] = ['assault', 'hold', 'stratagem'];
const BATTLE_OUTCOME_KINDS: readonly BattleOutcomeKind[] = ['victory', 'costly_victory', 'stalemate', 'retreat', 'rout'];

export function isValidBattleTactic(value: unknown): value is BattleTactic {
    return typeof value === 'string' && (BATTLE_TACTICS as readonly string[]).includes(value);
}

export function isValidBattleOutcomeKind(value: unknown): value is BattleOutcomeKind {
    return typeof value === 'string' && (BATTLE_OUTCOME_KINDS as readonly string[]).includes(value);
}

/** assault beats hold, hold beats stratagem, stratagem beats assault — a light rock-paper-scissors. */
function tacticBeats(a: BattleTactic, b: BattleTactic): boolean {
    return (a === 'assault' && b === 'hold')
        || (a === 'hold' && b === 'stratagem')
        || (a === 'stratagem' && b === 'assault');
}

function hashSeed(parts: readonly (string | number)[]): number {
    let h = 2166136261;
    for (const part of parts) {
        const s = String(part);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
    }
    return h >>> 0;
}

export function clampBattleStat(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) { return 0; }
    return Math.max(0, Math.min(100, Math.floor(value)));
}

export function startBattle(opponentLabel: string, playerSide: BattleSide, enemySide: BattleSide, maxRounds = MAX_BATTLE_ROUNDS): BattleState {
    return {
        opponentLabel,
        maxRounds: Math.max(1, Math.min(MAX_BATTLE_ROUNDS, Math.floor(maxRounds))),
        playerTroopsStart: playerSide.troops,
        enemyTroopsStart: enemySide.troops,
        enemySide,
        playerTroopsRemaining: playerSide.troops,
        enemyTroopsRemaining: enemySide.troops,
        rounds: [],
    };
}

/** Deterministic enemy tactic pick from the current round + enemy posture. No randomness beyond the seed. */
export function resolveEnemyTactic(enemySide: BattleSide, seed: number, round: number): BattleTactic {
    const roll = hashSeed([seed, round, enemySide.troops, enemySide.quality]) % BATTLE_TACTICS.length;
    return BATTLE_TACTICS[roll];
}

function computeEffectivePower(side: BattleSide, tactic: BattleTactic, opposingTactic: BattleTactic): number {
    let power = side.troops * (1 + side.quality / 200) * (1 + side.commanderSkill / 200);
    if (tacticBeats(tactic, opposingTactic)) {
        power *= 1.15;
    } else if (tacticBeats(opposingTactic, tactic)) {
        power *= 0.87;
    }
    if (tactic === 'hold' && side.fortification) {
        power *= 1 + side.fortification / 300;
    }
    return power;
}

/** One fixed round: current troop counts in, losses out. Fully deterministic for identical inputs. */
export function resolveBattleRound(
    playerSide: BattleSide,
    enemySide: BattleSide,
    playerTactic: BattleTactic,
    enemyTactic: BattleTactic,
    seed: number,
    round: number
): BattleRoundResult {
    const playerPower = computeEffectivePower(playerSide, playerTactic, enemyTactic);
    const enemyPower = computeEffectivePower(enemySide, enemyTactic, playerTactic);
    const total = playerPower + enemyPower;
    const playerShare = total > 0 ? playerPower / total : 0.5;
    const jitter = (hashSeed([seed, round, playerTactic, enemyTactic]) % 21 - 10) / 100;
    const playerWonRound = playerShare + jitter >= 0.5;

    const playerLossFrac = playerWonRound ? 0.05 : 0.15;
    const enemyLossFrac = playerWonRound ? 0.15 : 0.05;
    const playerLosses = Math.min(playerSide.troops, Math.max(1, Math.round(playerSide.troops * playerLossFrac)));
    const enemyLosses = Math.min(enemySide.troops, Math.max(1, Math.round(enemySide.troops * enemyLossFrac)));

    return {
        round,
        playerTactic,
        enemyTactic,
        playerLosses,
        enemyLosses,
        playerWonRound,
        narrativeHintId: `${playerTactic}_vs_${enemyTactic}_${playerWonRound ? 'player_win' : 'enemy_win'}`,
    };
}

/** Advances a battle by one round, mutating remaining troop counts (functionally — returns a new state). */
export function applyBattleRoundToState(state: BattleState, round: BattleRoundResult): BattleState {
    return {
        ...state,
        rounds: [...state.rounds, round],
        playerTroopsRemaining: Math.max(0, state.playerTroopsRemaining - round.playerLosses),
        enemyTroopsRemaining: Math.max(0, state.enemyTroopsRemaining - round.enemyLosses),
    };
}

function parseBattleSide(raw: unknown): BattleSide | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    if (typeof doc.troops !== 'number' || !Number.isFinite(doc.troops) || doc.troops < 0) { return undefined; }
    const side: BattleSide = {
        troops: Math.floor(doc.troops),
        quality: clampBattleStat(doc.quality),
        commanderSkill: clampBattleStat(doc.commanderSkill),
    };
    if (typeof doc.fortification === 'number' && Number.isFinite(doc.fortification)) {
        side.fortification = clampBattleStat(doc.fortification);
    }
    return side;
}

function parseBattleRoundResult(raw: unknown): BattleRoundResult | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    if (!isValidBattleTactic(doc.playerTactic) || !isValidBattleTactic(doc.enemyTactic)) { return undefined; }
    if (typeof doc.round !== 'number' || !Number.isFinite(doc.round)) { return undefined; }
    return {
        round: Math.max(1, Math.floor(doc.round)),
        playerTactic: doc.playerTactic,
        enemyTactic: doc.enemyTactic,
        playerLosses: Math.max(0, Math.floor(typeof doc.playerLosses === 'number' ? doc.playerLosses : 0)),
        enemyLosses: Math.max(0, Math.floor(typeof doc.enemyLosses === 'number' ? doc.enemyLosses : 0)),
        playerWonRound: doc.playerWonRound === true,
        narrativeHintId: typeof doc.narrativeHintId === 'string' ? doc.narrativeHintId.slice(0, 64) : 'unknown',
    };
}

/** Round-trips a persisted `domain.activeBattle` from game_state.json. */
export function parseBattleState(raw: unknown): BattleState | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const opponentLabel = typeof doc.opponentLabel === 'string' ? doc.opponentLabel.trim().slice(0, 64) : '';
    if (!opponentLabel) { return undefined; }
    const enemySide = parseBattleSide(doc.enemySide);
    if (!enemySide) { return undefined; }
    if (typeof doc.playerTroopsStart !== 'number' || typeof doc.enemyTroopsStart !== 'number') { return undefined; }

    const rounds: BattleRoundResult[] = [];
    if (Array.isArray(doc.rounds)) {
        for (const item of doc.rounds.slice(0, MAX_BATTLE_ROUNDS)) {
            const round = parseBattleRoundResult(item);
            if (round) { rounds.push(round); }
        }
    }

    return {
        opponentLabel,
        maxRounds: typeof doc.maxRounds === 'number' && doc.maxRounds >= 1 && doc.maxRounds <= MAX_BATTLE_ROUNDS
            ? Math.floor(doc.maxRounds)
            : MAX_BATTLE_ROUNDS,
        playerTroopsStart: Math.max(0, Math.floor(doc.playerTroopsStart)),
        enemyTroopsStart: Math.max(0, Math.floor(doc.enemyTroopsStart)),
        enemySide,
        playerTroopsRemaining: Math.max(0, Math.floor(
            typeof doc.playerTroopsRemaining === 'number' ? doc.playerTroopsRemaining : doc.playerTroopsStart
        )),
        enemyTroopsRemaining: Math.max(0, Math.floor(
            typeof doc.enemyTroopsRemaining === 'number' ? doc.enemyTroopsRemaining : doc.enemyTroopsStart
        )),
        rounds,
    };
}

export function isBattleConcluded(state: BattleState): boolean {
    return state.rounds.length >= state.maxRounds
        || state.playerTroopsRemaining <= 0
        || state.enemyTroopsRemaining <= 0;
}

const OUTCOME_DELTAS: Record<BattleOutcomeKind, DomainStatDelta> = {
    victory: { publicOrder: 2, prestige: 3, treasury: 10 },
    costly_victory: { publicOrder: 1, prestige: 1, treasury: -10 },
    stalemate: { publicOrder: -1 },
    retreat: { publicOrder: -3, prestige: -2, treasury: -15 },
    rout: { publicOrder: -6, prestige: -4, popularSupport: -4, treasury: -30 },
};

const OUTCOME_REPORT: Record<BattleOutcomeKind, string> = {
    victory: 'won a decisive victory over {opponent}',
    costly_victory: 'won a costly victory over {opponent}',
    stalemate: 'fought {opponent} to a stalemate',
    retreat: 'was forced to retreat from {opponent}',
    rout: 'suffered a rout at the hands of {opponent}',
};

function classifyBattleOutcome(state: BattleState): BattleOutcomeKind {
    if (state.enemyTroopsRemaining <= 0 && state.playerTroopsRemaining > 0) { return 'victory'; }
    if (state.playerTroopsRemaining <= 0) { return 'rout'; }

    const roundsWon = state.rounds.filter((r) => r.playerWonRound).length;
    const totalRounds = state.rounds.length;
    const majority = roundsWon * 2 > totalRounds;
    const tie = roundsWon * 2 === totalRounds;
    const playerLossRatio = state.playerTroopsStart > 0
        ? (state.playerTroopsStart - state.playerTroopsRemaining) / state.playerTroopsStart
        : 0;

    if (majority) {
        return playerLossRatio < 0.3 ? 'victory' : 'costly_victory';
    }
    if (tie) { return 'stalemate'; }
    return playerLossRatio < 0.5 ? 'retreat' : 'rout';
}

function safeOpponentLabel(label: string): string {
    return label.replace(/[\r\n\t\x00-\x1f]/g, ' ').slice(0, 64) || 'the enemy';
}

/** Only called once `isBattleConcluded` is true. Troop losses already reflected in playerTroopsRemaining. */
export function concludeBattle(state: BattleState): BattleOutcome {
    const kind = classifyBattleOutcome(state);
    const troopsLost = state.playerTroopsStart - state.playerTroopsRemaining;
    const enemyTroopsLost = state.enemyTroopsStart - state.enemyTroopsRemaining;
    const deltas = OUTCOME_DELTAS[kind];
    const label = safeOpponentLabel(state.opponentLabel);
    const reportLine = `Domain forces ${OUTCOME_REPORT[kind].replace('{opponent}', label)} (troops -${troopsLost}).`;

    return {
        kind,
        playerDelta: { ...deltas, troops: -troopsLost },
        enemyStrengthDelta: -Math.round(enemyTroopsLost / 3),
        reportLine,
    };
}

export const DOMAIN_BATTLE_OPS_PROMPT_LINE =
    'During an active battle, set turn_result.domainOps: '
    + '{ kind: "battle_round", tactic: "assault"|"hold"|"stratagem" } to commit this round\'s orders. '
    + 'assault beats hold, hold beats stratagem, stratagem beats assault. '
    + 'Core resolves losses and narrates the outcome; do not invent troop numbers.';

export function buildBattlePromptLines(state: BattleState): string[] {
    const roundNum = state.rounds.length + 1;
    const label = safeOpponentLabel(state.opponentLabel);
    return [
        '[Domain — Battle]',
        `Round ${roundNum}/${state.maxRounds} against ${label}.`,
        'Choose your tactic: assault (overwhelm), hold (entrench), or stratagem (outmaneuver).',
        DOMAIN_BATTLE_OPS_PROMPT_LINE,
        'Narrate the clash; Core already knows the true troop counts — do not invent different numbers.',
    ];
}

export function formatBattleChronicleText(
    outcome: BattleOutcome,
    opponentLabel: string,
    calendarMonth: number,
    calendarYear: number
): string {
    return `Year ${calendarYear} M${calendarMonth}: ${outcome.reportLine.replace(/^Domain forces /, '')}`;
}
