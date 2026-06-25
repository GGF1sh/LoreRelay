export interface CharacterStSource {
    format?: string;
    spec_version?: string;
    first_mes?: string;
    mes_example?: string;
    tags?: string[];
}

export interface CharacterProfile {
    id: string;
    name: string;
    description: string;
    personality: string;
    portrait?: string;
    expressions?: Record<string, string>;
    stSource?: CharacterStSource;
    baseStatus?: {
        hp?: number;
        mp?: number;
        inventory?: string[];
        skills?: string[];
    };
}
