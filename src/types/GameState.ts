export interface ResourceBar {
    current: number;
    max: number;
}

export interface GameStatus {
    location?: string;
    time?: string;
    hp?: ResourceBar;
    mp?: ResourceBar;
    condition?: string[];
    inventory?: string[];
    skills?: string[];
    funds?: string;
    [key: string]: unknown; // 将来の拡張用
}

export interface DiceRequest {
    notation: string;   // e.g. "1d20", "2d6"
    purpose?: string;   // e.g. "筋力チェック"
    id?: string;        // dedup key; omit to auto-generate from notation+purpose
}

export interface HiddenDiceEntry {
    id?: string;
    notation: string;   // e.g. "1d20", "2d6"
    purpose?: string;   // e.g. "遭遇判定" — shown to user as label
}

export interface ProfileUpdate {
    characterId: string;
    dynamicProfile: string;
}

export interface NpcMemoryUpdate {
    npcId: string;
    dispositionDelta?: Record<string, unknown>;
    newMemory?: Record<string, unknown>;
    needUpdates?: unknown[];
}

export interface SceneSprite {
    name?: string;
    image?: string;
    expression?: string;
    position?: "left" | "center" | "right";
}

export interface GameEntry {
    id: string;
    role: "gm" | "user";
    sender: string;
    content: string;
    /** Optional npc_registry key when GM tags quoted NPC speech (Phase 11B). */
    speakerNpcId?: string;
    image?: string;
    rawImagePath?: string;
    imagePrompt?: string;
    imageBlocked?: boolean;
    excludedFromPrompt?: boolean;
    editedAt?: string;
}

export interface GameOverState {
    active: boolean;
    message?: string;
    /** true = victory ending, false = defeat/death */
    victory?: boolean;
}

export type MapItemKind = 'map' | 'rumor' | 'informant';

/** Player-held map/rumor item for World tab "unfold" UX (Cartography C9). */
export interface HeldMapItem {
    id: string;
    name: string;
    kind: MapItemKind;
    consumable?: boolean;
}

/** World Forge: プレイヤーの現在地・訪問済み場所をトラッキング。 */
export interface GameStateWorld {
    currentLocationId?: string;
    visitedLocationIds?: string[];
    /** Region IDs the player has explored (extension-derived from currentLocationId visits). */
    discoveredRegionIds?: string[];
    knownFactionIds?: string[];
    regions?: Record<string, {
        controllingFaction?: string | null;
        dangerLevel?: number;
    }>;
    worldTurnAtLastSync?: number;
    lastGeneratedImage?: string;
    lastGeneratedLocationId?: string;
    /** GM turn index when an auto location image was last queued (cartography.autoLocationImage). */
    lastAutoImageGmTurn?: number;
    /** C9: weak remote reveals (hearsay). Merged into rumored display. */
    rumorKnownRegionIds?: string[];
    /** C9: held map/rumor items for World tab unfold actions. */
    mapItems?: HeldMapItem[];
    /** C9: consumed one-shot map item ids. */
    mapItemsConsumed?: string[];
}

/** ランタイムのシナリオ進行（scenario.json director の上書き）。v0.6c */
export interface GameStateDirector {
    act?: string;
    chapter?: string;
    scene?: string;
    objective?: string;
    guidanceMode?: 'sandbox' | 'guided' | 'railroad';
    achievedEndings?: string[];
    notes?: string;
}

export interface GameState {
    entries: GameEntry[];
    status?: GameStatus;
    options?: string[];
    theme?: string;
    bgm?: string;
    mood?: string;
    sfx?: string | string[];
    latestImage?: string;
    latestImageDescription?: string;
    background?: string;
    sprite?: SceneSprite | string;
    hiddenDice?: HiddenDiceEntry[];
    diceRequest?: DiceRequest;
    profileUpdates?: ProfileUpdate[];
    npcMemoryUpdates?: NpcMemoryUpdate[];
    /** Compressed story synopsis (Context Summarizer / manual edit). */
    summary?: string;
    /** GM's secret notes and parameters not shown to the player. */
    hiddenState?: Record<string, unknown>;
    /** When active, Webview locks input and shows ending overlay (DREAMIO-style game over). */
    gameOver?: GameOverState;
    /** Live scenario progression overlay (merged with scenario.json director). */
    director?: GameStateDirector;
    /** World Forge: player location tracking within world_forge.json geography. */
    world?: GameStateWorld;
    /** LW1: player credits/cargo when Commerce is ON. */
    commerce?: {
        credits: number;
        cargo: Array<{ commodityId: string; qty: number }>;
        transportId: string;
        playerRole?: string;
    };
}
