import { DOMAIN_EVENTS, DOMAIN_EVENT_GM_HINTS } from './domainCore';
import { GUILD_EVENTS, GUILD_EVENT_GM_HINTS } from './guildCore';
import { PETITION_DEFS } from './domainAudienceCore';
import { toExcludedEventId, EventKind } from './gameRulesCore';
import { generateText } from './llmClient';

export interface EventManagementCatalogEntry {
    namespacedId: string;
    kind: EventKind;
    label: string;
    description?: string;
}

export function getEventManagementCatalog(): EventManagementCatalogEntry[] {
    const catalog: EventManagementCatalogEntry[] = [];

    for (const e of DOMAIN_EVENTS) {
        if (e.id === 'domain_quiet_month') continue;
        catalog.push({
            namespacedId: toExcludedEventId('domain', e.id),
            kind: 'domain',
            label: `domain_${e.id}`,
            description: DOMAIN_EVENT_GM_HINTS[e.id],
        });
    }

    for (const e of GUILD_EVENTS) {
        if (e.id === 'guild_quiet_week') continue;
        catalog.push({
            namespacedId: toExcludedEventId('guild', e.id),
            kind: 'guild',
            label: `guild_${e.id}`,
            description: GUILD_EVENT_GM_HINTS[e.id],
        });
    }

    for (const e of PETITION_DEFS) {
        catalog.push({
            namespacedId: toExcludedEventId('audience', e.id),
            kind: 'audience',
            label: `audience_${e.id}`,
            description: e.summary,
        });
    }

    return catalog;
}

export async function getSuggestedExclusions(
    genre: string,
    freeformNotes: string
): Promise<string[]> {
    const catalog = getEventManagementCatalog();
    const validIds = new Set(catalog.map(e => e.namespacedId));

    const eventsList = catalog.map(e => `${e.namespacedId}: ${e.description ?? ''}`).join('\n');

    const systemPrompt = `You are the Game Master for LoreRelay, an agentic text adventure game.
Your task is to recommend which game events to exclude based on the world's genre and the player's world notes.
Follow these rules:
1. Be extremely conservative and loose: only suggest excluding events that are absolutely, obviously incompatible with the world setting.
2. If an event can be adapted or reinterpreted to fit (even with a different theme or flavor), do NOT exclude it. For example, a 'bad harvest' or 'festival' or 'brawl' can happen in almost any genre (Xianxia, Cyberpunk, Sci-Fi, Horror, Modern, Post-Apocalypse).
3. Do not suggest excluding events unless they are clearly and logically impossible (e.g. sci-fi tech events in a low-magic medieval world, or feudal taxation in a futuristic space station, but only if they cannot be adapted).
4. Output ONLY a valid JSON array of event namespaced IDs that should be excluded. Do not output any other text, reasoning, or markdown formatting. E.g. ["domain:bad_harvest", "guild:wealthy_patron"]`;

    const userPrompt = `World Genre: ${genre}
World Notes: ${freeformNotes}

Available Events:
${eventsList}

Exclusion Recommendations (JSON array of namespaced IDs):`;

    try {
        const response = await generateText(systemPrompt, userPrompt, { temperature: 0.1, maxTokens: 400 });
        if (!response) return [];

        let parsed: string[] = [];
        try {
            // Clean markdown
            let clean = response.trim();
            if (clean.startsWith('```')) {
                clean = clean.replace(/^```(json)?/, '').replace(/```$/, '').trim();
            }
            const arr = JSON.parse(clean);
            if (Array.isArray(arr)) {
                parsed = arr.map(x => String(x));
            }
        } catch {
            // Regex fallback
            const matches = response.match(/(?:domain|guild|audience):[a-zA-Z0-9_-]+/g);
            if (matches) {
                parsed = Array.from(new Set(matches));
            }
        }

        // Validate against event catalog (no hallucinations or quiet events allowed)
        return parsed.filter(id => validIds.has(id));
    } catch (e) {
        console.error('Failed to get suggested exclusions from LLM:', e);
        return [];
    }
}
