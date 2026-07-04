// JSON contracts shared across Commerce / Transport / NPC Agency (host-agnostic).

export type PlayerRole = 'merchant' | 'adventurer' | 'retainer' | 'smith' | 'ruler';

export interface CommodityDef {
    id: string;
    name: string;
    basePrice: number;
    weight: number;
}

export interface MarketDef {
    /** Location pin id (v0: location only). */
    locationId: string;
    regionId?: string;
    commodityIds: string[];
    /** Multiplier on base price when market is well supplied. */
    supplyBias?: number;
    /** Target stock level per commodity after Tier-1 recovery ticks. */
    targetStock?: number;
}

export interface TransportKindDef {
    id: string;
    name: string;
    capacity: number;
    speed: number;
    /** Food units consumed per travel day. */
    foodPerDay?: number;
    themes?: string[];
}

export interface CommerceForge {
    commodities: CommodityDef[];
    markets: MarketDef[];
    transportKinds: TransportKindDef[];
}

export interface MarketStockEntry {
    stock: number;
    priceIndex: number;
}

export type MarketStateMap = Record<string, Record<string, MarketStockEntry>>;

export interface CargoEntry {
    commodityId: string;
    qty: number;
}

export interface PlayerCommerceState {
    credits: number;
    cargo: CargoEntry[];
    transportId: string;
    /** Travel rations (units). Clamped to 0 on consumption. */
    food?: number;
    playerRole?: PlayerRole;
}

export type TradeOpKind = 'buy' | 'sell' | 'sell_discovery';

export type TradeOp = 
    | { op: 'buy' | 'sell'; marketLocationId: string; commodityId: string; qty: number }
    | { op: 'sell_discovery'; discoveryId: string; value: number };

export type NpcAgendaKind =
    | 'restock_wheat'
    | 'restock_steel'
    | 'seek_buyer'
    | 'flee_danger'
    | 'visit_ally';

export interface NpcPositionState {
    locationId: string;
    arrivesTurn: number;
    agenda?: NpcAgendaKind;
    reason?: string;
}

export type NpcPositionsMap = Record<string, NpcPositionState>;

export interface NpcAgencyOp {
    npcId: string;
    locationId: string;
    arrivesTurn: number;
    agenda?: NpcAgendaKind;
    reason?: string;
}

export interface RegionGraphNode {
    id: string;
    connectedTo?: string[];
}

export interface LocationGraphNode {
    id: string;
    regionId?: string;
    connectedTo?: string[];
}

export type WorldChangeSeverity = 'info' | 'warning' | 'critical';

export interface WorldChangeEventLike {
    id?: string;
    worldTurn: number;
    category?: string;
    severity?: WorldChangeSeverity;
    message: string;
    regionId?: string;
    factionId?: string;
    targetFactionId?: string;
}

export interface FoodCrisisCondition {
    label: string;
    result: boolean;
    actual?: string | number | boolean;
    expected?: string | number | boolean;
}

export interface FoodCrisisEvaluation {
    matched: boolean;
    conditions: FoodCrisisCondition[];
}

function messageHasFoodKeyword(message: string): boolean {
    const msg = message.toLowerCase();
    return msg.includes('food')
        || msg.includes('wheat')
        || msg.includes('食料')
        || msg.includes('小麦');
}

/** Canonical food-crisis evaluation — single source for production rules and trace conditions. */
export function evaluateFoodCrisisEvent(ev: WorldChangeEventLike): FoodCrisisEvaluation {
    const keywordMatch = messageHasFoodKeyword(ev.message);
    const conditions: FoodCrisisCondition[] = [
        {
            label: 'category === resource',
            result: ev.category === 'resource',
            actual: ev.category,
            expected: 'resource',
        },
        {
            label: 'message includes food keyword',
            result: keywordMatch,
            actual: ev.message.slice(0, 120),
            expected: '(food|wheat|食料|小麦)',
        },
    ];
    return {
        matched: conditions.every((c) => c.result),
        conditions,
    };
}

/** Shared food-crisis semantics for commerce (Tier 1) and NPC agency (Tier 2). */
export function isFoodCrisisEvent(ev: WorldChangeEventLike): boolean {
    return evaluateFoodCrisisEvent(ev).matched;
}

export interface NpcRegistryEntryLike {
    name: string;
    locationId?: string;
    factionId?: string;
    /** NPC disposition playerTrust (0–100) for whereabouts precision (v1+). */
    playerTrust?: number;
}

export type NpcRegistryLike = Record<string, NpcRegistryEntryLike>;