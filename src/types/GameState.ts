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
    image?: string;
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

/** World Forge: プレイヤーの現在地・訪問済み場所をトラッキング。 */
export interface GameStateWorld {
    currentLocationId?: string;
    visitedLocationIds?: string[];
    knownFactionIds?: string[];
    worldTurnAtLastSync?: number;
    lastGeneratedImage?: string;
    lastGeneratedLocationId?: string;
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
}
