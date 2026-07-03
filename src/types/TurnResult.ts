export interface DiceLedgerEntry {
    formula: string;    // e.g. "1d20+2"
    rolls: number[];    // e.g. [13]
    modifier: number;   // e.g. 2
    total: number;      // e.g. 15
    reason?: string;    // e.g. "罠発見"
    dc?: number;        // e.g. 15
    success?: boolean;  // e.g. true if total >= dc
}

export interface StatePatchOp {
    op: "replace" | "add" | "remove";
    path: string;       // e.g. "/status/hp/current"
    value?: any;
}

export interface TurnMediaRequest {
    bgm?: string;
    mood?: string;
    sfx?: string | string[];
    imagePrompt?: string;
    imageMode?: string;
}

export interface TurnGmEntryMeta {
    imagePrompt?: string;
    image?: string;
    /** Override default "Game Master" sender for TTS attribution. */
    sender?: string;
    /** npc_registry key for explicit NPC voice (Phase 11B). */
    speakerNpcId?: string;
}

/** Optional protagonist snapshot from GM interview / world bootstrap (Phase 12). */
export type CartographyRevealStrength = 'discovered' | 'rumored';
export type CartographyRevealItemKind = 'map' | 'rumor' | 'informant';

export interface CartographyRevealRegion {
    regionId: string;
    strength?: CartographyRevealStrength;
    source?: string;
}

export interface CartographyRevealGrantItem {
    id: string;
    name: string;
    kind?: CartographyRevealItemKind;
    consumable?: boolean;
}

/** Cartography C9: validated remote FoW reveal channel (not statePatch /world). */
export interface CartographyReveal {
    regions?: CartographyRevealRegion[];
    grantItems?: CartographyRevealGrantItem[];
    consumedItemIds?: string[];
}

export interface TurnResultPlayerCharacter {
    name: string;
    description: string;
    personality?: string;
    scenario?: string;
    arrivalReason?: string;
    equipment?: {
        weapon?: string;
        armor?: string;
        accessory?: string;
    };
}

export interface TurnResultAgenticMeta {
    mode: 'referee-narrator';
    refereeOk: boolean;
    narratorOk: boolean;
    refereeProvider?: string;
    narratorProvider?: string;
}

export interface TurnResult {
    turnId: string;
    playerAction?: string;
    diceLedger?: DiceLedgerEntry[];
    statePatch?: StatePatchOp[];
    resolvedQuests?: string[];
    narration: string;
    /** Optional explicit media requests (parallel to statePatch media paths). */
    media?: TurnMediaRequest;
    /** GM entry metadata (imagePrompt etc.) merged into entries by extension. */
    gmEntry?: TurnGmEntryMeta;
    /** Integrity hashes (extension may add on journal write). */
    beforeHash?: string;
    afterHash?: string;
    appliedAt?: string;
    triggeredLore?: string[];
    /** Optional metadata for Phase 9 agentic GM runs. Not required for legacy turn_result files. */
    agentic?: TurnResultAgenticMeta;
    /** When set, LoreRelay can offer to create characters/{id}.json for the player protagonist. */
    playerCharacter?: TurnResultPlayerCharacter;
    /** Cartography C9: extension-validated map/rumor region reveals. */
    cartographyReveal?: CartographyReveal;
    /** Layer B: advance emergent world simulation by N steps (GM narration accompanies). */
    elapsedWorldTurns?: number;
    /** F3: extension-validated faction reputation deltas (optional). */
    reputationOps?: Array<{ factionId: string; delta: number; reason?: string }>;
    /** LW1: validated buy/sell ops (Commerce ON). */
    tradeOps?: Array<{ op: 'buy' | 'sell'; marketLocationId: string; commodityId: string; qty: number }>;
    /** LW2: GM-confirmed NPC positions (Agency ON). */
    npcAgencyOps?: Array<{ npcId: string; locationId: string; arrivesTurn: number }>;
    /** LW3: GM の例外的な関係確定 (Relationships ON)。通常は世界tickが決定論で動かす。 */
    relationshipOps?: Array<{ a: string; b: string; delta: number; reason?: string }>;
    /** Domain Mode: monthly policy / officer appointments / audience / missions / battle rounds (Domain ON). */
    domainOps?: {
        kind: 'monthly_commit' | 'appoint_officer' | 'dismiss_officer' | 'audience_ruling' | 'dispatch_officer' | 'battle_round';
        actions?: string[];
        intelligence?: 'gather_rumors' | 'scout_border' | 'none';
        officer?: { npcId: string; role: string; skill?: number };
        /** §F7 audience_ruling: petition being judged and the ruling. */
        petitionId?: string;
        rulingId?: 'grant' | 'deny' | 'compromise';
        /** §F9 dispatch_officer: which appointed officer, on what kind of mission. */
        mission?: { npcId: string; kind: string; targetId?: string; months?: number };
        /** §F10 battle_round: the player's tactic for the current round of an active battle. */
        tactic?: 'assault' | 'hold' | 'stratagem';
    };
    /** Guild Master Mode: weekly policy / adventurer roster / request board (Guild ON). */
    guildOps?: {
        kind: 'weekly_commit' | 'recruit_adventurer' | 'dismiss_adventurer' | 'resolve_request' | 'assign_party';
        actions?: string[];
        adventurer?: { npcId: string; klass: string; skill?: number };
        /** §G2 resolve_request: which open request and how it was ruled. */
        requestId?: string;
        rulingId?: 'accept' | 'decline' | 'negotiate';
        /** §G3 assign_party: dispatch roster on an accepted quest. */
        quest?: { questId: string; npcIds: string[]; weeks?: number };
    };
}
