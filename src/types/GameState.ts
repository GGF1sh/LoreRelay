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
    [key: string]: any; // 将来の拡張用
}

export interface DiceRequest {
    notation: string;   // e.g. "1d20", "2d6"
    purpose?: string;   // e.g. "筋力チェック"
    id?: string;        // dedup key; omit to auto-generate from notation+purpose
}

export interface HiddenDiceEntry {
    notation: string;   // e.g. "1d20", "2d6"
    purpose?: string;   // e.g. "遭遇判定" — shown to user as label
}

export interface ProfileUpdate {
    characterId: string;
    dynamicProfile: string;
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
}

export interface GameOverState {
    active: boolean;
    message?: string;
    /** true = victory ending, false = defeat/death */
    victory?: boolean;
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
    background?: string;
    sprite?: SceneSprite | string;
    hiddenDice?: HiddenDiceEntry[];
    diceRequest?: DiceRequest;
    profileUpdates?: ProfileUpdate[];
    /** Compressed story synopsis (Context Summarizer / manual edit). */
    summary?: string;
    /** When active, Webview locks input and shows ending overlay (DREAMIO-style game over). */
    gameOver?: GameOverState;
}
