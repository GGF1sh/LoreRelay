import * as fs from 'fs';
import { getConfiguredLocale } from './i18n';
import { getTriggeredLoreLabels } from './gmPromptBuilder';
import { getCachedGameState } from './gameStateSync';
import { getGameStatePath } from './workspacePaths';
import { loadLorebookForUi } from './lorebookLoader';
import { loadPlayerPersona } from './persona';
import { buildParlorPersonaContext } from './personaCore';
import { loadWorldForgeDocument } from './worldForge';
import { loadWorldState } from './worldState';
import type { CharacterProfile } from './types/Character';
import type { ParlorSession } from './parlorSessionCore';
import {
    buildInWorldContextBlock,
    buildInWorldUserPrompt,
} from './inWorldPromptBuilderCore';

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

function readGameStateForInWorld(): Record<string, unknown> | undefined {
    const cached = getCachedGameState();
    if (cached) {
        return cached as unknown as Record<string, unknown>;
    }
    const gameStatePath = getGameStatePath();
    if (!gameStatePath || !fs.existsSync(gameStatePath)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(gameStatePath, 'utf-8'));
        return raw && typeof raw === 'object' && !Array.isArray(raw)
            ? raw as Record<string, unknown>
            : undefined;
    } catch {
        return undefined;
    }
}

export function buildInWorldChatPrompt(
    character: CharacterProfile,
    session: ParlorSession,
    userMessage: string
): string {
    const locale = getConfiguredLocale();
    const forge = loadWorldForgeDocument();
    const worldState = loadWorldState() as unknown as Record<string, unknown> | undefined;
    const gameState = readGameStateForInWorld();
    const worldContext = buildInWorldContextBlock({ forge, worldState, gameState });
    const hint = `${userMessage}\n${character.name}\n${worldContext}`;
    const loreLabels = getTriggeredLoreLabels(hint, 5);
    const loreSnippets = loreLabelsToSnippets(loreLabels);
    const persona = loadPlayerPersona();
    const personaContext = buildParlorPersonaContext(persona, locale);
    return buildInWorldUserPrompt({
        locale,
        character,
        session,
        userMessage,
        personaContext,
        loreSnippets,
        worldContext,
    });
}
