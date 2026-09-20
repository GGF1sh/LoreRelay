/** ST V2 character_book の1エントリ */
export interface CharacterBookEntry {
    id?: number | string;
    keys?: string[];
    secondary_keys?: string[];
    content?: string;
    enabled?: boolean;
    insertion_order?: number;
    priority?: number;
    comment?: string;
    use_regex?: boolean;
    extensions?: Record<string, unknown>;
}

/** ST V2 character_book（キャラに埋め込まれたロアブック） */
export interface CharacterBook {
    name?: string;
    description?: string;
    scan_depth?: number;
    token_budget?: number;
    recursive_scanning?: boolean;
    /** ST では object-of-entries か array かが混在するため両対応 */
    entries: Record<string, CharacterBookEntry> | CharacterBookEntry[];
    extensions?: Record<string, unknown>;
}

export interface CharacterStSource {
    format?: string;
    spec_version?: string;
    // V1 core
    first_mes?: string;
    mes_example?: string;
    scenario?: string;
    // V2 additions
    system_prompt?: string;
    post_history_instructions?: string;
    alternate_greetings?: string[];
    creator_notes?: string;
    creator?: string;
    character_version?: string;
    tags?: string[];
    extensions?: Record<string, unknown>;
    character_book?: CharacterBook;
    [key: string]: unknown;
}

export interface CharacterProfile {
    id: string;
    name: string;
    description: string;
    personality: string;
    portrait?: string;
    expressions?: Record<string, string>;
    controlledBy?: 'player' | 'ai' | 'gm';
    llmProvider?: string;
    llmModel?: string;
    stSource?: CharacterStSource;
    baseStatus?: {
        hp?: number;
        mp?: number;
        inventory?: string[];
        skills?: string[];
    };
    equipment?: {
        weapon?: string;
        armor?: string;
        accessory?: string;
    };
}
