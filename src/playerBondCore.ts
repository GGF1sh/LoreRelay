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
    lastInteractionTurn?: number;
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

// --- LW3-P2: 絆の交易波及(盟友の店では商いに情が乗り、敵の店では上乗せされる) ---

export const BOND_TRADE_ALLY_PCT = 10;     // 盟友NPC同席市場: 純支出の10%還元 / 純収入の10%上乗せ
export const BOND_TRADE_NEMESIS_PCT = 10;  // 敵対NPC同席市場: 逆方向に10%
export const BOND_TRADE_MAX_ADJUSTMENT = 500; // 1回の取引バッチでの調整上限(暴走防止)

export type BondTradeReason = 'ally_favor' | 'nemesis_markup';

export interface BondTradeAdjustment {
    /** credits への加算値(正=プレイヤー有利)。0 なら調整なし。 */
    adjustment: number;
    reason?: BondTradeReason;
    npcId?: string;
    npcName?: string;
}

/**
 * 取引バッチ後の credits 調整を計算する(純関数)。
 * - locationId に「固い盟友」(trusted_companion 到達済み・背信していない)が居れば有利に、
 *   「敵対」(nemesis)が居れば不利に、純増減 |creditsDelta| の一定割合を調整。
 * - 両方居る場合は相殺せず盟友を優先(顔なじみが取りなす)。
 * - npcAtLocation: npcId → 現在の locationId(ホストが resolveNpcLocation で解決して渡す)。
 */
export function applyPlayerBondTradeAdjustment(input: {
    milestones: PlayerBondMilestoneMap;
    registry: PlayerBondRegistryLike;
    npcAtLocation: Record<string, string | undefined>;
    locationId: string;
    creditsDelta: number;
}): BondTradeAdjustment {
    if (!input.locationId || !Number.isFinite(input.creditsDelta) || input.creditsDelta === 0) {
        return { adjustment: 0 };
    }

    let ally: string | undefined;
    let nemesis: string | undefined;
    for (const npcId of Object.keys(input.registry).slice(0, MAX_PLAYER_BONDS)) {
        if (input.npcAtLocation[npcId] !== input.locationId) { continue; }
        const reached = new Set(input.milestones[npcId] ?? []);
        if (reached.has('trusted_companion') && !reached.has('estrangement') && !ally) {
            ally = npcId;
        }
        if (reached.has('nemesis') && !nemesis) {
            nemesis = npcId;
        }
    }

    const magnitude = Math.abs(input.creditsDelta);
    if (ally) {
        const adjustment = Math.min(
            BOND_TRADE_MAX_ADJUSTMENT,
            Math.round((magnitude * BOND_TRADE_ALLY_PCT) / 100)
        );
        if (adjustment <= 0) { return { adjustment: 0 }; }
        return { adjustment, reason: 'ally_favor', npcId: ally, npcName: input.registry[ally]?.name };
    }
    if (nemesis) {
        const adjustment = Math.min(
            BOND_TRADE_MAX_ADJUSTMENT,
            Math.round((magnitude * BOND_TRADE_NEMESIS_PCT) / 100)
        );
        if (adjustment <= 0) { return { adjustment: 0 }; }
        return { adjustment: -adjustment, reason: 'nemesis_markup', npcId: nemesis, npcName: input.registry[nemesis]?.name };
    }
    return { adjustment: 0 };
}

export interface BondTradeLocationDelta {
    locationId: string;
    creditsDelta: number;
}

export interface BondTradeBatchResult {
    totalAdjustment: number;
    adjustments: BondTradeAdjustment[];
}

/** Global cap on summed bond trade adjustments per turn (per-location caps still apply). */
export const BOND_TRADE_BATCH_TOTAL_CAP = BOND_TRADE_MAX_ADJUSTMENT * 3;

/**
 * Queue bond trade effects by location and apply once at batch end (avoids per-op races).
 */
export function batchPlayerBondTradeAdjustments(input: {
    milestones: PlayerBondMilestoneMap;
    registry: PlayerBondRegistryLike;
    npcAtLocation: Record<string, string | undefined>;
    locationDeltas: BondTradeLocationDelta[];
}): BondTradeBatchResult {
    const adjustments: BondTradeAdjustment[] = [];
    let total = 0;

    for (const entry of input.locationDeltas) {
        if (!entry.locationId || !Number.isFinite(entry.creditsDelta) || entry.creditsDelta === 0) {
            continue;
        }
        const adj = applyPlayerBondTradeAdjustment({
            milestones: input.milestones,
            registry: input.registry,
            npcAtLocation: input.npcAtLocation,
            locationId: entry.locationId,
            creditsDelta: entry.creditsDelta,
        });
        if (adj.adjustment !== 0) {
            adjustments.push(adj);
            total += adj.adjustment;
        }
    }

    if (total > BOND_TRADE_BATCH_TOTAL_CAP) {
        total = BOND_TRADE_BATCH_TOTAL_CAP;
    } else if (total < -BOND_TRADE_BATCH_TOTAL_CAP) {
        total = -BOND_TRADE_BATCH_TOTAL_CAP;
    }

    return { totalAdjustment: total, adjustments };
}

export const PLAYER_BOND_GC_IDLE_TURNS = 50;
export const PLAYER_BOND_NEUTRAL_TRUST_MIN = 40;
export const PLAYER_BOND_NEUTRAL_TRUST_MAX = 60;

/**
 * Drop milestone records for removed NPCs and idle neutral relationships (save bloat GC).
 */
export function purgeStalePlayerBondMilestones(
    milestones: PlayerBondMilestoneMap,
    registry: Record<string, PlayerDispositionLike>,
    worldTurn: number,
    idleTurns = PLAYER_BOND_GC_IDLE_TURNS
): PlayerBondMilestoneMap {
    const next = cloneMilestones(milestones);
    const allowed = new Set(Object.keys(registry).slice(0, MAX_PLAYER_BONDS));

    for (const npcId of Object.keys(next)) {
        if (!allowed.has(npcId)) {
            delete next[npcId];
            continue;
        }
        const reached = next[npcId] ?? [];
        if (reached.length > 0) {
            continue;
        }
        const npc = registry[npcId];
        if (!npc) {
            delete next[npcId];
            continue;
        }
        const trust = num(npc.playerTrust, 50);
        const neutral = trust >= PLAYER_BOND_NEUTRAL_TRUST_MIN && trust <= PLAYER_BOND_NEUTRAL_TRUST_MAX;
        const lastTurn = typeof npc.lastInteractionTurn === 'number' ? npc.lastInteractionTurn : 0;
        if (neutral && worldTurn - lastTurn >= idleTurns) {
            delete next[npcId];
        }
    }

    return next;
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
