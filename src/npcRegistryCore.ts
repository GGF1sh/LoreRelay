export type NpcMood = 'happy' | 'worried' | 'angry' | 'sad' | 'neutral' | 'excited' | 'fearful';
export type EmotionalWeight = 'positive' | 'negative' | 'neutral' | 'suspicious';
export type NpcNeedType = 'quest' | 'emotional' | 'material' | 'information';

export interface Disposition {
    playerTrust: number;
    playerRomance: number;
    playerFear: number;
    mood: NpcMood;
    lastInteractionTurn: number;
}

export interface NpcNeed {
    id: string;
    type: NpcNeedType;
    description: string;
    urgency: number;
    relatedEventId: string | null;
}

export interface NpcMemoryEntry {
    id: string;
    turn: number;
    content: string;
    emotionalWeight: EmotionalWeight;
    tags: string[];
}

export interface NpcDialogueHints {
    highTrust?: string;
    lowTrust?: string;
    highUrgency?: string;
    highFear?: string;
    romance?: string;
}

export interface NpcEntry {
    name: string;
    locationId?: string;
    factionId?: string;
    disposition: Disposition;
    needs: NpcNeed[];
    memories: NpcMemoryEntry[];
    personalityTraits?: string[];
    dialogueHints?: NpcDialogueHints;
}

export interface NpcRegistry {
    format: string;
    npcs: Record<string, NpcEntry>;
}

export interface NpcDispositionDelta {
    playerTrust?: number;
    playerRomance?: number;
    playerFear?: number;
    mood?: NpcMood;
}

export interface NpcNeedUpdate {
    id: string;
    urgencyDelta?: number;
    resolved?: boolean;
}

export interface NpcMemoryUpdate {
    npcId: string;
    dispositionDelta?: NpcDispositionDelta;
    newMemory?: Omit<NpcMemoryEntry, 'id'>;
    needUpdates?: NpcNeedUpdate[];
}

const VALID_MOODS = new Set<NpcMood>(['happy', 'worried', 'angry', 'sad', 'neutral', 'excited', 'fearful']);
const VALID_EMOTIONAL_WEIGHTS = new Set<EmotionalWeight>(['positive', 'negative', 'neutral', 'suspicious']);
const VALID_NEED_TYPES = new Set<NpcNeedType>(['quest', 'emotional', 'material', 'information']);

export function isValidMood(v: unknown): v is NpcMood {
    return typeof v === 'string' && VALID_MOODS.has(v as NpcMood);
}

export function isValidEmotionalWeight(v: unknown): v is EmotionalWeight {
    return typeof v === 'string' && VALID_EMOTIONAL_WEIGHTS.has(v as EmotionalWeight);
}

export function isValidNeedType(v: unknown): v is NpcNeedType {
    return typeof v === 'string' && VALID_NEED_TYPES.has(v as NpcNeedType);
}

export function clampDispositionValue(v: unknown, fallback = 50): number {
    if (typeof v !== 'number' || Number.isNaN(v)) { return fallback; }
    return Math.max(0, Math.min(100, Math.round(v)));
}

export function defaultDisposition(): Disposition {
    return { playerTrust: 50, playerRomance: 0, playerFear: 0, mood: 'neutral', lastInteractionTurn: 0 };
}
