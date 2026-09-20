import type { WorldForge } from './worldForgeCore';
import type { WorldState } from './worldStateCore';

export interface LocationImagePromptOptions {
    includeFaction?: boolean;
    includeDanger?: boolean;
}

export function buildLocationImagePromptCore(
    forge: WorldForge,
    locationId: string,
    worldState?: WorldState,
    options: LocationImagePromptOptions = {}
): string {
    const includeFaction = options.includeFaction !== false;
    const includeDanger = options.includeDanger !== false;

    const location = forge.geography.locations.find((l) => l.id === locationId);
    if (!location) {
        return '';
    }

    const region = forge.geography.regions.find((r) => r.id === location.regionId);
    const theme = forge.meta.theme || 'fantasy';
    const promptParts: string[] = [];

    if (region) {
        if (region.imagePromptHint) {
            promptParts.push(region.imagePromptHint);
        } else {
            promptParts.push(`${region.name}, ${region.type} environment`);
        }
    }

    if (location.imagePromptHint) {
        promptParts.push(location.imagePromptHint);
    } else {
        promptParts.push(`focus on ${location.name}, a ${location.type}`);
    }

    if (location.description) {
        promptParts.push(location.description);
    }

    if (includeDanger && region) {
        let dangerLevel = region.dangerLevel ?? 0;
        if (worldState?.regions?.[region.id]) {
            dangerLevel = worldState.regions[region.id].dangerLevel ?? dangerLevel;
        }
        if (dangerLevel >= 7) {
            promptParts.push('dangerous atmosphere, ominous, dark');
        } else if (dangerLevel <= 3) {
            promptParts.push('peaceful atmosphere, calm');
        }
    }

    if (includeFaction) {
        let controllingFactionId = location.factionControl;
        if (worldState?.regions && region && worldState.regions[region.id]?.controllingFaction) {
            controllingFactionId = worldState.regions[region.id].controllingFaction || undefined;
        }

        if (controllingFactionId) {
            const faction = forge.factions.find((f) => f.id === controllingFactionId);
            if (faction) {
                promptParts.push(`controlled by ${faction.name}`);
                if (faction.type === 'hostile') {
                    promptParts.push('hostile territory');
                } else if (faction.type === 'friendly' || faction.type === 'player-faction') {
                    promptParts.push('friendly territory');
                }
            }
        }
    }

    promptParts.push(`${theme} style, high quality, masterpiece`);

    return promptParts.filter(Boolean).join(', ');
}