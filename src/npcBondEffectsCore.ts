// LW3-W — Bonds feed back into the world (deterministic Tier-1 feedback).
//
// 名ありNPC同士の絆が「世界へ波及」する決定論ロジック:
//   盟友(ally)   → 二人の居場所の市場間に物流が生まれ、共通商品の在庫が増える
//   敵対(enemy)  → 二人の居場所の市場が軋み、価格指数がじわりと上がる
// 世界→関係(evolveRelationships)と合わせて双方向ループが閉じる。
// GM/LLM は関与しない(黄金律)。プレイヤーは相場の動きとして体感する。
//
// 依存は npcRelationshipCore(自作)のみ。市場側は構造的型で受ける(commerceCore 非依存)。

import {
    describeRelationship,
    MAX_NAMED_NPC_RELATIONSHIP,
    type NpcRelationshipMap,
    type RelationshipPositionsLike,
    type RelationshipRegistryLike,
} from './npcRelationshipCore';

export const ALLY_TRADE_STOCK_BONUS = 1;        // 盟友物流: 共通商品の在庫 +1/tick(両市場)
export const ALLY_TRADE_MAX_STOCK = 60;         // 物流で積み上がる在庫の上限
export const ENEMY_FRICTION_PRICE_BUMP = 0.05;  // 敵対摩擦: priceIndex +0.05/tick(両市場)
export const ENEMY_FRICTION_PRICE_MAX = 4;      // worldSimCommerceCore.MAX_PRICE_INDEX と揃える
export const MAX_BOND_EFFECTS_PER_TICK = 8;     // 1tick に適用する効果ペアの上限

export interface BondMarketDefLike {
    locationId: string;
    commodityIds: string[];
}

export interface BondMarketEntryLike {
    stock: number;
    priceIndex: number;
}

export type BondMarketStateLike = Record<string, Record<string, BondMarketEntryLike>>;

export type BondMarketEffectType = 'ally_trade' | 'enemy_friction';

export interface BondMarketEffect {
    type: BondMarketEffectType;
    a: string;
    b: string;
    locationIds: string[];
    commodityIds: string[];
}

export interface BondMarketEffectsInput {
    relationships: NpcRelationshipMap;
    registry: RelationshipRegistryLike;
    positions: RelationshipPositionsLike;
    worldTurn: number;
    markets: BondMarketDefLike[];
    marketState: BondMarketStateLike;
}

export interface BondMarketEffectsResult {
    marketState: BondMarketStateLike;
    effects: BondMarketEffect[];
}

function cloneMarketState(state: BondMarketStateLike): BondMarketStateLike {
    const out: BondMarketStateLike = {};
    for (const [loc, commodities] of Object.entries(state)) {
        out[loc] = {};
        for (const [cid, entry] of Object.entries(commodities)) {
            out[loc][cid] = { stock: entry.stock, priceIndex: entry.priceIndex };
        }
    }
    return out;
}

/** このtickの実効ロケーション(移動中=不在は undefined)。evolveRelationships と同じ規則。 */
function effectiveLocation(
    id: string,
    registry: RelationshipRegistryLike,
    positions: RelationshipPositionsLike,
    worldTurn: number
): string | undefined {
    const pos = positions[id];
    if (pos) {
        if (pos.arrivesTurn <= worldTurn) { return pos.locationId; }
        return undefined;
    }
    return registry[id]?.locationId;
}

/**
 * 絆の市場効果を1tick適用する(決定論・純関数)。
 * 呼び出し順は「市場recovery(Tier1)の後」を想定 — 物流ボーナスが回復に食われない。
 */
export function applyBondMarketEffects(
    input: BondMarketEffectsInput,
    maxNamedNpcCount = MAX_NAMED_NPC_RELATIONSHIP
): BondMarketEffectsResult {
    const allowed = new Set(Object.keys(input.registry).slice(0, maxNamedNpcCount));
    const marketByLocation = new Map<string, BondMarketDefLike>();
    for (const m of input.markets) { marketByLocation.set(m.locationId, m); }

    const next = cloneMarketState(input.marketState);
    const effects: BondMarketEffect[] = [];

    // 全ペア総当り(O(N^2))を避け、affinity が記録された疎なペア(実際に交流があった
    // ペアのみ)を見る(O(E))。ally/enemy に届かないペアは relationships に記録されないか
    // 閾値未満なので、ここで弾いても結果は変わらない。
    for (const [key, affinity] of Object.entries(input.relationships)) {
        if (effects.length >= MAX_BOND_EFFECTS_PER_TICK) { break; }
        if (typeof affinity !== 'number' || !Number.isFinite(affinity)) { continue; }
        const idx = key.indexOf('|');
        if (idx <= 0 || idx >= key.length - 1) { continue; }
        const a = key.slice(0, idx);
        const b = key.slice(idx + 1);
        if (!allowed.has(a) || !allowed.has(b)) { continue; }
        const label = describeRelationship(affinity);
        if (label !== 'ally' && label !== 'enemy') { continue; }

        const locA = effectiveLocation(a, input.registry, input.positions, input.worldTurn);
        const locB = effectiveLocation(b, input.registry, input.positions, input.worldTurn);
        if (!locA || !locB) { continue; }
        const marketA = marketByLocation.get(locA);
        const marketB = marketByLocation.get(locB);

        if (label === 'ally') {
            // 物流は「別々の市場」の間にだけ生まれる(同居なら既に同じ市場)
            if (locA === locB || !marketA || !marketB) { continue; }
            const shared = marketA.commodityIds.filter((c) => marketB.commodityIds.includes(c));
            if (shared.length === 0) { continue; }
            for (const cid of shared) {
                for (const loc of [locA, locB]) {
                    const entry = next[loc]?.[cid];
                    if (!entry) { continue; }
                    entry.stock = Math.min(ALLY_TRADE_MAX_STOCK, entry.stock + ALLY_TRADE_STOCK_BONUS);
                }
            }
            effects.push({ type: 'ally_trade', a, b, locationIds: [locA, locB], commodityIds: shared });
            continue;
        }

        // enemy friction: それぞれの居場所の市場全商品の priceIndex がじわり上がる
        const frictionLocs = [...new Set([locA, locB])].filter((loc) => marketByLocation.has(loc));
        if (frictionLocs.length === 0) { continue; }
        const touched: string[] = [];
        for (const loc of frictionLocs) {
            for (const cid of marketByLocation.get(loc)!.commodityIds) {
                const entry = next[loc]?.[cid];
                if (!entry) { continue; }
                entry.priceIndex = Math.min(
                    ENEMY_FRICTION_PRICE_MAX,
                    Math.round((entry.priceIndex + ENEMY_FRICTION_PRICE_BUMP) * 100) / 100
                );
                if (!touched.includes(cid)) { touched.push(cid); }
            }
        }
        if (touched.length > 0) {
            effects.push({ type: 'enemy_friction', a, b, locationIds: frictionLocs, commodityIds: touched });
        }
    }

    return { marketState: next, effects };
}
