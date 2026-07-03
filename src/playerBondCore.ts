// LW3-P — Player-to-NPC bonds & milestones (put the protagonist in the web).
//
// NPC↔NPC(npcRelationshipCore/npcLifeEventsCore)に対し、こちらは「あなた(プレイヤー)と
// NPC の決定的な転機」を扱う。信号は既存 disposition(playerTrust/playerRomance/playerFear)。
// GM/ゲームプレイが disposition を動かし、その閾値超えを決定論で検出して一度だけ発火する。
// 太閤の「顔の見える駆け引き」をプレイヤー本人に適用する層。
//
// 完全自己完結(vscode/fs/他モジュール非依存)。ホストは registry を写して渡す。

export const PLAYER_TRUST_COMPANION_MIN = 85;  // 固い盟友
export const PLAYER_ROMANCE_MIN = 80;          // 特別な想い
export const PLAYER_TRUST_NEMESIS_MAX = 15;    // 敵対
export const PLAYER_FEAR_MIN = 80;             // 畏怖
export const PLAYER_TRUST_ESTRANGE_MAX = 25;   // 一度築いた絆が崩れる閾値

export const MAX_PLAYER_BONDS = 16;            // 走査する名ありNPCの上限
export const MAX_PLAYER_BOND_MILESTONES = 8;   // 1 NPC が保持する履歴上限
export const MAX_PLAYER_BOND_EVENTS_PER_TICK = 6;

export type PlayerBondKind =
    | 'trusted_companion'
    | 'romance'
    | 'nemesis'
    | 'feared'
    | 'estrangement';

/** npcId → 到達済みマイルストーン id 配列(一度きり発火の記録)。 */
export type PlayerBondMilestoneMap = Record<string, string[]>;

export interface PlayerDispositionLike {
    name: string;
    playerTrust?: number;
    playerRomance?: number;
    playerFear?: number;
}
export type PlayerBondRegistryLike = Record<string, PlayerDispositionLike>;

export interface PlayerBondEvent {
    npcId: string;
    name: string;
    kind: PlayerBondKind;
    worldTurn: number;
}

export interface PlayerBondStanding {
    npcId: string;
    name: string;
    /** 現在を最もよく表す1つ(反転系優先)。 */
    kind: PlayerBondKind;
}

function num(v: number | undefined, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function cloneMilestones(map: PlayerBondMilestoneMap): PlayerBondMilestoneMap {
    const out: PlayerBondMilestoneMap = {};
    for (const [k, v] of Object.entries(map)) {
        out[k] = Array.isArray(v) ? v.slice(0, MAX_PLAYER_BOND_MILESTONES) : [];
    }
    return out;
}

export interface PlayerBondInput {
    registry: PlayerBondRegistryLike;
    milestones: PlayerBondMilestoneMap;
    worldTurn: number;
}

export interface PlayerBondResult {
    milestones: PlayerBondMilestoneMap;
    events: PlayerBondEvent[];
}

/**
 * disposition から、このtickで新たに到達したプレイヤー↔NPC の転機を検出する(決定論)。
 * 各マイルストーンは NPC ごとに一度だけ発火。
 */
export function detectPlayerBondEvents(input: PlayerBondInput): PlayerBondResult {
    const ids = Object.keys(input.registry).slice(0, MAX_PLAYER_BONDS);
    const next = cloneMilestones(input.milestones);
    const events: PlayerBondEvent[] = [];

    for (const npcId of ids) {
        if (events.length >= MAX_PLAYER_BOND_EVENTS_PER_TICK) { break; }
        const npc = input.registry[npcId];
        if (!npc) { continue; }
        const trust = num(npc.playerTrust, 50);
        const romance = num(npc.playerRomance, 0);
        const fear = num(npc.playerFear, 0);

        const reached = next[npcId] ?? [];
        const has = (k: PlayerBondKind): boolean => reached.includes(k);
        const fire = (kind: PlayerBondKind): void => {
            reached.push(kind);
            next[npcId] = reached.slice(0, MAX_PLAYER_BOND_MILESTONES);
            events.push({ npcId, name: npc.name, kind, worldTurn: input.worldTurn });
        };

        if (romance >= PLAYER_ROMANCE_MIN && !has('romance')) { fire('romance'); }
        if (trust >= PLAYER_TRUST_COMPANION_MIN && !has('trusted_companion')) { fire('trusted_companion'); }
        if (trust <= PLAYER_TRUST_NEMESIS_MAX && !has('nemesis')) { fire('nemesis'); }
        if (fear >= PLAYER_FEAR_MIN && !has('feared')) { fire('feared'); }
        // 反転: 一度築いた信頼/恋が崩れる
        if (
            trust <= PLAYER_TRUST_ESTRANGE_MAX
            && !has('estrangement')
            && (has('trusted_companion') || has('romance'))
        ) {
            fire('estrangement');
        }
    }

    return { milestones: next, events };
}

// 現在の立ち位置の優先度(反転 > 敵対 > 恋 > 盟友 > 畏怖)。
const STANDING_PRIORITY: PlayerBondKind[] = [
    'estrangement', 'nemesis', 'romance', 'trusted_companion', 'feared',
];

/** 各 NPC の「今の立ち位置」を1つに畳む(UI / GM プロンプト用)。 */
export function listPlayerBondStandings(
    registry: PlayerBondRegistryLike,
    milestones: PlayerBondMilestoneMap
): PlayerBondStanding[] {
    const out: PlayerBondStanding[] = [];
    for (const npcId of Object.keys(registry).slice(0, MAX_PLAYER_BONDS)) {
        const reached = new Set(milestones[npcId] ?? []);
        if (reached.size === 0) { continue; }
        const kind = STANDING_PRIORITY.find((k) => reached.has(k));
        if (!kind) { continue; }
        out.push({ npcId, name: registry[npcId]?.name ?? npcId, kind });
    }
    return out;
}

const PLAYER_BOND_MESSAGE_JA: Record<PlayerBondKind, (name: string) => string> = {
    trusted_companion: (n) => `${n}はあなたを固い盟友と認めた`,
    romance: (n) => `${n}はあなたに特別な想いを寄せているようだ`,
    nemesis: (n) => `${n}はあなたを敵と見なしている`,
    feared: (n) => `${n}はあなたを恐れている`,
    estrangement: (n) => `かつて信頼を寄せた${n}が、あなたに背を向けた`,
};

export function buildPlayerBondMessage(event: PlayerBondEvent): string {
    return PLAYER_BOND_MESSAGE_JA[event.kind](event.name);
}

export function buildPlayerBondGmHint(kind: PlayerBondKind): string {
    const base = 'This is a turning point in the player\'s own relationship with this NPC. '
        + 'Reflect it in how the NPC treats the player; never state numeric values.';
    if (kind === 'romance') {
        return base + ' Interpret "romance" per your world and tone (may be admiration, love, or devotion).';
    }
    return base;
}

const STANDING_LABEL_EN: Record<PlayerBondKind, string> = {
    trusted_companion: 'sworn ally',
    romance: 'holds you dear',
    nemesis: 'your enemy',
    feared: 'fears you',
    estrangement: 'turned away from you',
};

/**
 * GM プロンプト `[Living World — Your Bonds]` の行。
 * 現在の立ち位置(state)を毎ターン渡し、このtickで起きた転機(events)には ★ を付す。
 */
export function buildPlayerBondPromptLines(
    registry: PlayerBondRegistryLike,
    milestones: PlayerBondMilestoneMap,
    newEvents: PlayerBondEvent[] = [],
    maxLines = 8
): string[] {
    const freshByNpc = new Map<string, PlayerBondKind>();
    for (const ev of newEvents) { freshByNpc.set(ev.npcId, ev.kind); }

    const lines: string[] = [];
    for (const standing of listPlayerBondStandings(registry, milestones)) {
        const mark = freshByNpc.get(standing.npcId) === standing.kind ? '★ ' : '';
        lines.push(`${mark}${standing.name}: ${STANDING_LABEL_EN[standing.kind]}`);
        if (lines.length >= maxLines) { break; }
    }
    return lines;
}
