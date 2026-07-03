import { getConfiguredLocale } from './i18n';
import { getTriggeredLoreLabels } from './gmPromptBuilder';
import type { CharacterProfile } from './types/Character';
import type { ParlorSession } from './parlorSessionCore';
import {
    assembleParlorUserPrompt,
    buildParlorPromptParts,
} from './parlorPromptBuilderCore';
import { loadLorebookForUi } from './lorebookLoader';
import { loadPlayerPersona } from './persona';
import { buildParlorPersonaContext } from './personaCore';

function loreLabelsToSnippets(labels: string[]): string[] {
    const book = loadLorebookForUi();
    const byLabel = new Map<string, string>();
    for (const entry of book.entries) {
        if (entry.label && entry.content) {
            byLabel.set(entry.label, entry.content);
        }
    }
    return labels.map((label) => byLabel.get(label) || label).filter(Boolean);
}

export function buildParlorUserPrompt(
    character: CharacterProfile,
    session: ParlorSession,
    userMessage: string
): string {
    const locale = getConfiguredLocale();
    const hint = `${userMessage}\n${character.name}`;
    const loreLabels = getTriggeredLoreLabels(hint, 5);
    const loreSnippets = loreLabelsToSnippets(loreLabels);
    const persona = loadPlayerPersona();
    const personaContext = buildParlorPersonaContext(persona, locale);
    const parts = buildParlorPromptParts({
        locale,
        character,
        session,
        userMessage,
        personaContext,
        loreSnippets,
    });
    return assembleParlorUserPrompt(parts, locale);
}