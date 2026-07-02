// LW3-L — NPC Life Events / relationship milestones (deepest North Star layer).
//
// ガンパレの「関係が決定的な転機を迎える」を決定論で。affinity(npcRelationshipCore)が
// 極端な閾値を跨いだ瞬間だけ「マイルストーン」を一度だけ発火し、世界の伝聞イベントにする。
// GM がそれを解釈して narrate する(黄金律)。
//
// 破壊的な NPC 削除はしない。転機は「出来事」として提示し、意味づけ(恋/義兄弟/決裂の顛末)は
// 世界観に応じて GM に委ねる = theme-neutral(BRIEF「世界観はデータ」)。
//
// 完全自己完結(vscode/fs/他モジュール非依存)。ホストは registry を写して呼ぶ。

import {
    getAffinity,
    MAX_NAMED_NPC_RELATIONSHIP,
    type NpcRelationshipMap,
    type RelationshipRegistryLike,
} from './npcRelationshipCore';

// 閾値(通常のラベル ally70/enemy-70 より深い「決定的」水準)
export const MILESTONE_SWORN_ALLIES_MIN = 85;
export const MILESTONE_INSEPARABLE_MIN = 95;
export const MILESTONE_BITTER_ENEMIES_MAX = -85;
export const MILESTONE_RECONCILE_MIN = 10;   // 宿敵だった二人がここまで戻れば和解
export const MILESTONE_ESTRANGE_MAX = 0;      // 契りを交わした二人がここを割れば決別

export const MAX_MILESTONES_PER_PAIR = 8;     // 1ペアが保持する履歴の上限
export const MAX_LIFE_EVENTS_PER_TICK = 4;    // 1tick に昇格する転機イベントの上限

export type NpcLifeEventKind =
    | 'sworn_allies'    // 固い盟友の契り
    | 'inseparable'     // 離れがたい間柄(深い友情/恋/義兄弟 — 解釈は GM)
    | 'bitter_enemies'  // 宿敵
    | 'estranged'       // かつて親しかった二人の決別
    | 'reconciled';     // いがみ合った二人の和解

/** ペアキー "idA|idB" → 到達済みマイルストーン id の配列(一度きり発火の記録)。 */
export type NpcMilestoneMap = Record<string, string[]>;

export interface NpcLifeEvent {
    a: string;
    b: string;
    kind: NpcLifeEventKind;
    affinity: number;
    worldTurn: number;
}

function pairKeyOf(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function splitPairKey(key: string): [string, string] | undefined {
    const idx = key.indexOf('|');
    if (idx <= 0 || idx >= key.length - 1) { return undefined; }
    return [key.slice(0, idx), key.slice(idx + 1)];
}

function cloneMilestones(map: NpcMilestoneMap): NpcMilestoneMap {
    const out: NpcMilestoneMap = {};
    for (const [k, v] of Object.entries(map)) {
        out[k] = Array.isArray(v) ? v.slice(0, MAX_MILESTONES_PER_PAIR) : [];
    }
    return out;
}

export interface LifeEventsInput {
    relationships: NpcRelationshipMap;
    milestones: NpcMilestoneMap;
    registry: RelationshipRegistryLike;
    worldTurn: number;
}

export interface LifeEventsResult {
    milestones: NpcMilestoneMap;
    events: NpcLifeEvent[];
}

/**
 * affinity と過去マイルストーンから、このtickで新たに到達した転機を検出する(決定論)。
 * 各マイルストーンはペアごとに一度だけ発火(milestones に記録して抑制)。
 */
export function detectLifeEvents(input: LifeEventsInput): LifeEventsResult {
    const allowed = new Set(Object.keys(input.registry).slice(0, MAX_NAMED_NPC_RELATIONSHIP));
    const next = cloneMilestones(input.milestones);
    const events: NpcLifeEvent[] = [];

    // 対象ペア = 現在 affinity のあるペア ∪ 既に履歴のあるペア
    const keys = new Set<string>([...Object.keys(input.relationships), ...Object.keys(input.milestones)]);

    for (const key of keys) {
        if (events.length >= MAX_LIFE_EVENTS_PER_TICK) { break; }
        const pair = splitPairKey(key);
        if (!pair) { continue; }
        const [a, b] = pair;
        if (!allowed.has(a) || !allowed.has(b)) { continue; }

        const aff = getAffinity(input.relationships, a, b);
        const reached = next[key] ?? [];
        const has = (k: NpcLifeEventKind): boolean => reached.includes(k);
        const fire = (kind: NpcLifeEventKind): void => {
            reached.push(kind);
            next[key] = reached.slice(0, MAX_MILESTONES_PER_PAIR);
            events.push({ a, b, kind, affinity: aff, worldTurn: input.worldTurn });
        };

        // 上昇系(深い順に1つだけ)
        if (aff >= MILESTONE_INSEPARABLE_MIN && !has('inseparable')) {
            fire('inseparable');
        } else if (aff >= MILESTONE_SWORN_ALLIES_MIN && !has('sworn_allies')) {
            fire('sworn_allies');
        }

        if (events.length >= MAX_LIFE_EVENTS_PER_TICK) { break; }

        // 下降系
        if (aff <= MILESTONE_BITTER_ENEMIES_MAX && !has('bitter_enemies')) {
            fire('bitter_enemies');
        }

        // 反転系(履歴を使う)
        if (events.length >= MAX_LIFE_EVENTS_PER_TICK) { break; }
        if (aff < MILESTONE_ESTRANGE_MAX && !has('estranged') && (has('sworn_allies') || has('inseparable'))) {
            fire('estranged');
        }
        if (events.length >= MAX_LIFE_EVENTS_PER_TICK) { break; }
        if (aff >= MILESTONE_RECONCILE_MIN && !has('reconciled') && has('bitter_enemies')) {
            fire('reconciled');
        }
    }

    return { milestones: next, events };
}

const LIFE_EVENT_MESSAGE_JA: Record<NpcLifeEventKind, (a: string, b: string) => string> = {
    sworn_allies: (a, b) => `${a}と${b}は固い盟友の契りを結んだという`,
    inseparable: (a, b) => `${a}と${b}は今や離れがたい間柄だと囁かれている`,
    bitter_enemies: (a, b) => `${a}と${b}は宿敵と呼べる仲になってしまったらしい`,
    estranged: (a, b) => `かつて親しかった${a}と${b}が袂を分かったと噂されている`,
    reconciled: (a, b) => `いがみ合っていた${a}と${b}が和解したと聞く`,
};

/** 転機イベントの伝聞メッセージ(NPC 名解決込み)。 */
export function buildLifeEventMessage(event: NpcLifeEvent, registry: RelationshipRegistryLike): string {
    const nameA = registry[event.a]?.name ?? event.a;
    const nameB = registry[event.b]?.name ?? event.b;
    return LIFE_EVENT_MESSAGE_JA[event.kind](nameA, nameB);
}

/**
 * GM への解釈ヒント。"inseparable" は世界観次第で恋/深い友情/義兄弟のいずれにも読める、
 * と明示して押し付けない。数値は絶対に出さない。
 */
export function buildLifeEventGmHint(kind: NpcLifeEventKind): string {
    const base = 'Narrate this as hearsay/rumor the player overhears; never state numeric affinity.';
    if (kind === 'inseparable') {
        return base + ' Interpret "inseparable" to fit your world — deep friendship, romance, or sworn kinship.';
    }
    return base;
}

/** ペアの到達済みマイルストーン(共有史)を新しい順で。UI/プロンプト用。 */
export function listPairMilestones(
    milestones: NpcMilestoneMap,
    a: string,
    b: string
): NpcLifeEventKind[] {
    const list = milestones[pairKeyOf(a, b)];
    if (!Array.isArray(list)) { return []; }
    return list.slice(0, MAX_MILESTONES_PER_PAIR) as NpcLifeEventKind[];
}

// 現在の関係を最もよく表す「今の状態」の優先度(反転系 > 深い到達点)。
const MILESTONE_DISPLAY_PRIORITY: NpcLifeEventKind[] = [
    'estranged', 'reconciled', 'inseparable', 'sworn_allies', 'bitter_enemies',
];

/** ペアの共有史から「今を最も表す」マイルストーンを1つ選ぶ(UI バッジ用)。 */
export function deepestMilestone(
    milestones: NpcMilestoneMap,
    a: string,
    b: string
): NpcLifeEventKind | undefined {
    const reached = new Set(listPairMilestones(milestones, a, b));
    for (const kind of MILESTONE_DISPLAY_PRIORITY) {
        if (reached.has(kind)) { return kind; }
    }
    return undefined;
}
