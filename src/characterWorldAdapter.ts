import { generateText } from './llmClient';
import type { CharacterProfile } from './types/Character';

export interface CharacterAdaptationDraft {
    description: string;
    personality: string;
    equipment: {
        weapon: string;
        armor: string;
        accessory: string;
    };
    arrivalReason: string;
}

/**
 * Ask the LLM for a world-themed rewrite of a character's flavor fields.
 * Returns a draft only — callers must not write it back onto the character
 * without explicit user confirmation.
 */
export async function adaptCharacterToWorld(
    character: Pick<CharacterProfile, 'name' | 'description' | 'personality' | 'equipment'>,
    theme: string
): Promise<CharacterAdaptationDraft | null> {
    const systemPrompt = `You are a worldbuilding assistant for a text adventure game.
The user has an existing character. Adapt this character to fit into a "${theme}" setting,
while keeping their name and core identity intact. Rewrite their description, personality,
equipment, and a short reason for how they ended up in this world, so everything reads
naturally within a ${theme} setting.
Respond with ONLY valid JSON in exactly this shape, no markdown fences:
{
  "description": "...",
  "personality": "...",
  "equipment": { "weapon": "...", "armor": "...", "accessory": "..." },
  "arrivalReason": "..."
}`;

    const userPrompt = `Character name: ${character.name}
Original description: ${character.description || '(none)'}
Original personality: ${character.personality || '(none)'}
Original equipment: weapon=${character.equipment?.weapon || '(none)'}, armor=${character.equipment?.armor || '(none)'}, accessory=${character.equipment?.accessory || '(none)'}`;

    let raw: string | null;
    try {
        raw = await generateText(systemPrompt, userPrompt, { temperature: 0.7, maxTokens: 500 });
    } catch (e) {
        console.error('adaptCharacterToWorld: LLM call failed', e);
        return null;
    }
    if (!raw) { return null; }

    try {
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
            description: typeof parsed.description === 'string' ? parsed.description : '',
            personality: typeof parsed.personality === 'string' ? parsed.personality : '',
            equipment: {
                weapon: typeof parsed.equipment?.weapon === 'string' ? parsed.equipment.weapon : '',
                armor: typeof parsed.equipment?.armor === 'string' ? parsed.equipment.armor : '',
                accessory: typeof parsed.equipment?.accessory === 'string' ? parsed.equipment.accessory : '',
            },
            arrivalReason: typeof parsed.arrivalReason === 'string' ? parsed.arrivalReason : '',
        };
    } catch (e) {
        console.error('adaptCharacterToWorld: failed to parse LLM JSON', e, raw);
        return null;
    }
}
