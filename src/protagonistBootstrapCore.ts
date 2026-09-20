import type { GameEntry } from './types/GameState';
import type { TurnResult } from './types/TurnResult';
import type { CharacterProfile } from './types/Character';
import { isValidCharacterId } from './characterId';

export interface ProtagonistDraft {
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

const INTERVIEW_MARKERS = [
    'ジャンル・主人公',
    'genre, protagonist',
    '質問しながら',
    'build the world together',
    '世界を組み立て',
    'これで始めて',
    'start now',
];

const START_TRIGGERS = [
    'これで始めて',
    'これで開始',
    '世界を作って',
    '世界を生成',
    'start now',
    'generate the world',
    'begin the adventure',
];

/** FNV-1a style hash for stable non-ASCII character IDs (e.g. Japanese names). */
function stableNameHash(name: string): string {
    let h = 2166136261;
    const normalized = name.trim().toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
        h ^= normalized.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

export function slugifyCharacterId(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
    return base || `char_${stableNameHash(name)}`;
}

export function resolveUniqueCharacterId(name: string, existingIds: Iterable<string>): string {
    const taken = new Set(existingIds);
    let id = slugifyCharacterId(name);
    if (!isValidCharacterId(id)) {
        id = `char_${stableNameHash(name)}`;
    }
    if (!taken.has(id)) {
        return id;
    }
    for (let i = 2; i < 1000; i++) {
        const candidate = `${id}_${i}`;
        if (!taken.has(candidate)) {
            return candidate;
        }
    }
    return `${id}_${Date.now()}`;
}

function trimText(value: unknown, max: number): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed.slice(0, max);
}

export function parseProtagonistDraft(raw: unknown): ProtagonistDraft | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const obj = raw as Record<string, unknown>;
    const name = trimText(obj.name, 120);
    const description = trimText(obj.description, 8000)
        ?? trimText(obj.background, 8000)
        ?? trimText(obj.bio, 8000);
    if (!name || !description) {
        return null;
    }
    const equipmentRaw = obj.equipment;
    let equipment: ProtagonistDraft['equipment'];
    if (equipmentRaw && typeof equipmentRaw === 'object' && !Array.isArray(equipmentRaw)) {
        const eq = equipmentRaw as Record<string, unknown>;
        equipment = {
            weapon: trimText(eq.weapon, 200),
            armor: trimText(eq.armor, 200),
            accessory: trimText(eq.accessory, 200),
        };
    }
    return {
        name,
        description,
        personality: trimText(obj.personality, 4000),
        scenario: trimText(obj.scenario, 4000),
        arrivalReason: trimText(obj.arrivalReason, 2000),
        equipment,
    };
}

export function protagonistDraftToProfile(draft: ProtagonistDraft, id: string): CharacterProfile {
    return {
        id,
        name: draft.name,
        description: draft.description,
        personality: draft.personality ?? '',
        controlledBy: 'player',
        equipment: draft.equipment,
        stSource: {
            creator: 'LoreRelay',
            creator_notes: draft.arrivalReason
                ? `Interview bootstrap. ${draft.arrivalReason}`
                : 'Interview / Quickstart bootstrap',
            scenario: draft.scenario,
            tags: ['protagonist', 'bootstrap'],
            character_version: '1.0',
        },
    };
}

export function formatInterviewTranscript(entries: GameEntry[], maxChars = 12000): string {
    const lines: string[] = [];
    for (const entry of entries) {
        if (!entry?.content?.trim()) {
            continue;
        }
        const role = entry.role === 'user' ? 'Player' : (entry.sender || 'GM');
        lines.push(`${role}: ${entry.content.trim()}`);
    }
    const joined = lines.join('\n\n');
    if (joined.length <= maxChars) {
        return joined;
    }
    return joined.slice(joined.length - maxChars);
}

export function looksLikeInterviewSession(entries: GameEntry[]): boolean {
    if (!entries.length) {
        return false;
    }
    const text = entries.map((e) => e.content ?? '').join('\n').toLowerCase();
    if (INTERVIEW_MARKERS.some((m) => text.includes(m.toLowerCase()))) {
        return true;
    }
    const userMsgs = entries.filter((e) => e.role === 'user');
    return userMsgs.length >= 2 && userMsgs.some((e) =>
        START_TRIGGERS.some((t) => (e.content ?? '').toLowerCase().includes(t))
    );
}

export function extractProtagonistFromTurnResult(turnResult: TurnResult): ProtagonistDraft | null {
    const raw = (turnResult as TurnResult & { playerCharacter?: unknown }).playerCharacter;
    return parseProtagonistDraft(raw);
}

export function summarizeProtagonistDraft(draft: ProtagonistDraft): string {
    const parts = [draft.description];
    if (draft.personality) {
        parts.push(`Personality: ${draft.personality}`);
    }
    if (draft.equipment) {
        const gear = [draft.equipment.weapon, draft.equipment.armor, draft.equipment.accessory]
            .filter(Boolean)
            .join(' / ');
        if (gear) {
            parts.push(`Gear: ${gear}`);
        }
    }
    const text = parts.join('\n');
    return text.length > 280 ? `${text.slice(0, 277)}…` : text;
}