/** Pure Parlor → Campaign promotion — no vscode/fs. */

import type { GameEntry } from './types/GameState';
import type { ParlorMessage, ParlorSession } from './parlorSessionCore';
import {
    MAX_PARLOR_SUMMARY_CHARS,
    clampParlorContent,
    recentParlorMessagesForPrompt,
} from './parlorSessionCore';
import { CURRENT_SCHEMA_VERSION } from './migrateGameState';

export const MAX_PROMOTE_HISTORY_ENTRIES = 30;
export const MAX_PROMOTE_OPENING_CHARS = 4_000;

export interface ParlorPromoteCharacterInput {
    id: string;
    name: string;
    description?: string;
    personality?: string;
    scenario?: string;
}

export interface ParlorPromotePersonaInput {
    name?: string;
    description?: string;
}

export interface ParlorPromoteOptions {
    campaignTitle: string;
    includeRecentHistory: boolean;
    historyEntryLimit?: number;
    enableRpgMechanics?: boolean;
    enableWorldForge?: boolean;
    playerName?: string;
    playerDescription?: string;
    locale?: string;
}

export interface ParlorPromoteOutput {
    gameState: Record<string, unknown>;
    scenario: Record<string, unknown>;
    gameRules: Record<string, unknown>;
    parlorSummary: string;
}

function clampTitle(text: string, max = 120): string {
    const t = text.trim();
    return t.length <= max ? t : t.slice(0, max);
}

export function buildParlorSessionSummary(
    session: ParlorSession,
    characterName: string,
    locale = 'en'
): string {
    const recent = session.messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-8);
    const header = locale === 'ja'
        ? `[Parlor からインポート] ${characterName} との会話要約（全 ${session.messages.length} 件）`
        : `[Imported from Parlor] Conversation summary with ${characterName} (${session.messages.length} messages total)`;
    const lines = recent.map((m) => {
        const who = m.role === 'user'
            ? (locale === 'ja' ? 'プレイヤー' : 'Player')
            : characterName;
        const snippet = m.content.replace(/\s+/g, ' ').slice(0, 120);
        return `${who}: ${snippet}`;
    });
    if (session.summary?.trim()) {
        lines.unshift(session.summary.trim());
    }
    const merged = [header, ...lines].join('\n');
    return clampParlorContent(merged, MAX_PARLOR_SUMMARY_CHARS);
}

export function mapParlorMessagesToGameEntries(
    messages: ParlorMessage[],
    characterName: string,
    maxEntries = MAX_PROMOTE_HISTORY_ENTRIES
): GameEntry[] {
    const window = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-Math.max(1, maxEntries));
    return window.map((m, index) => ({
        id: m.id && m.id.length <= 64 ? m.id : `parlor-${index + 1}`,
        role: m.role === 'user' ? 'user' : 'gm',
        sender: m.role === 'user' ? 'Player' : characterName,
        content: clampParlorContent(m.content, 8_000),
    }));
}

export function buildParlorSafeGameRules(options: Pick<ParlorPromoteOptions, 'enableRpgMechanics' | 'enableWorldForge'>): Record<string, unknown> {
    return {
        enableRpgMechanics: options.enableRpgMechanics === true,
        defaultMaxHp: 100,
        defaultMaxMp: 50,
        diceDifficulty: 'Normal',
        skillCommentary: false,
        backgroundSimulation: false,
        autoLorebookGrowth: false,
        enableNpcRegistry: false,
        enableWorldForge: options.enableWorldForge === true,
        enableEmergentSimulation: false,
        simIntervalTurns: 5,
        enableFactionReputation: false,
        enableTravelEncounters: false,
        travelEncounterDensity: 'medium',
        enableCommerce: false,
        enableCommerceUi: false,
        playerRole: 'adventurer',
        enableNpcAgency: false,
        enableNpcRelationships: false,
    };
}

function resolveOpeningNarrative(
    session: ParlorSession,
    character: ParlorPromoteCharacterInput,
    summary: string,
    locale: string
): string {
    const lastAssistant = [...session.messages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant?.content.trim()) {
        return clampParlorContent(lastAssistant.content, MAX_PROMOTE_OPENING_CHARS);
    }
    if (character.scenario?.trim()) {
        return clampParlorContent(character.scenario, MAX_PROMOTE_OPENING_CHARS);
    }
    return locale === 'ja'
        ? `${character.name} との Parlor 会話から物語が始まる。\n\n${summary.slice(0, 600)}`
        : `The story continues from your Parlor chat with ${character.name}.\n\n${summary.slice(0, 600)}`;
}

export function buildParlorScenarioDraft(
    session: ParlorSession,
    character: ParlorPromoteCharacterInput,
    options: ParlorPromoteOptions,
    summary: string
): Record<string, unknown> {
    const locale = options.locale || 'en';
    const title = clampTitle(options.campaignTitle || `${character.name} — Parlor Campaign`);
    const protagonist = [
        options.playerName?.trim(),
        options.playerDescription?.trim(),
        character.scenario?.trim(),
    ].filter(Boolean).join(' — ').slice(0, 800) || (locale === 'ja' ? '旅人' : 'Traveler');
    const narrative = resolveOpeningNarrative(session, character, summary, locale);
    const location = character.scenario?.trim().slice(0, 120)
        || (locale === 'ja' ? '不明な場所' : 'Unknown location');

    return {
        format: 'text-adventure-scenario/1.0',
        meta: {
            title,
            author: 'LoreRelay Parlor Promote',
            version: '1.0.0',
            tags: ['parlor-import'],
        },
        setup: {
            theme: 'custom',
            protagonist,
            tone: locale === 'ja' ? 'Parlor からの継続' : 'Continued from Parlor',
        },
        director: {
            act: locale === 'ja' ? '序章' : 'Act I',
            scene: location,
            objective: locale === 'ja'
                ? `${character.name} との関係を深めながら物語を進める`
                : `Advance the story with ${character.name}`,
            guidanceMode: 'sandbox',
        },
        opening: {
            status: {
                location,
                time: locale === 'ja' ? 'Parlor からの移行直後' : 'Just after Parlor promotion',
            },
            options: locale === 'ja'
                ? ['周囲を見渡す', `${character.name} に話しかける`, 'これまでの出来事を整理する']
                : ['Look around', `Talk to ${character.name}`, 'Recap what happened so far'],
            narrative,
        },
    };
}

export function buildParlorPromoteGameState(
    session: ParlorSession,
    character: ParlorPromoteCharacterInput,
    options: ParlorPromoteOptions,
    summary: string
): Record<string, unknown> {
    const locale = options.locale || 'en';
    const limit = options.historyEntryLimit ?? MAX_PROMOTE_HISTORY_ENTRIES;
    const recent = recentParlorMessagesForPrompt(session, limit);
    const entries = options.includeRecentHistory
        ? mapParlorMessagesToGameEntries(recent, character.name, limit)
        : [{
            id: 'parlor-promote-opening',
            role: 'gm' as const,
            sender: 'Game Master',
            content: resolveOpeningNarrative(session, character, summary, locale),
        }];

    const location = character.scenario?.trim().slice(0, 120)
        || (locale === 'ja' ? '不明な場所' : 'Unknown location');

    return {
        entries,
        summary,
        status: {
            location,
            time: locale === 'ja' ? 'Parlor からの移行直後' : 'Just after Parlor promotion',
        },
        options: locale === 'ja'
            ? ['周囲を見渡す', `${character.name} に話しかける`]
            : ['Look around', `Talk to ${character.name}`],
        theme: 'custom',
        director: {
            objective: locale === 'ja'
                ? `${character.name} との物語を続ける`
                : `Continue the story with ${character.name}`,
            guidanceMode: 'sandbox',
        },
        hiddenState: {
            parlorSource: {
                characterId: character.id,
                sessionMessageCount: session.messages.length,
                promotedAt: new Date().toISOString(),
            },
        },
    };
}

const ENTRY_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** Ensure promoted state passes validateGameState (Gemini Phase C P1). */
export function sanitizePromotedGameState(raw: Record<string, unknown>): Record<string, unknown> {
    const state: Record<string, unknown> = {
        ...raw,
        schemaVersion: CURRENT_SCHEMA_VERSION,
    };
    if (Array.isArray(state.entries)) {
        state.entries = (state.entries as unknown[]).map((item, index) => {
            const e = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
            let id = typeof e.id === 'string' ? e.id.trim() : `parlor-promote-${index + 1}`;
            if (!ENTRY_ID_PATTERN.test(id)) {
                id = `parlor-promote-${index + 1}`;
            }
            const role = e.role === 'user' ? 'user' : 'gm';
            const sender = typeof e.sender === 'string' && e.sender.trim()
                ? e.sender.trim().slice(0, 120)
                : (role === 'user' ? 'Player' : 'Game Master');
            const content = typeof e.content === 'string' ? clampParlorContent(e.content, 32_000) : '';
            return { id, role, sender, content };
        });
    } else {
        state.entries = [];
    }
    if (!Array.isArray(state.options)) {
        state.options = [];
    } else {
        state.options = (state.options as unknown[])
            .filter((o) => typeof o === 'string')
            .map((o) => String(o).slice(0, 500))
            .slice(0, 12);
    }
    if (!state.status || typeof state.status !== 'object') {
        state.status = { location: 'Unknown', time: 'After Parlor promotion' };
    }
    if (!state.theme || typeof state.theme !== 'string') {
        state.theme = 'custom';
    }
    if (!state.director || typeof state.director !== 'object') {
        state.director = { guidanceMode: 'sandbox' };
    }
    return state;
}

export function runParlorPromoteCore(input: {
    session: ParlorSession;
    character: ParlorPromoteCharacterInput;
    persona?: ParlorPromotePersonaInput;
    options: ParlorPromoteOptions;
}): ParlorPromoteOutput {
    const locale = input.options.locale || 'en';
    const playerName = input.options.playerName?.trim() || input.persona?.name?.trim();
    const playerDescription = input.options.playerDescription?.trim() || input.persona?.description?.trim();
    const options: ParlorPromoteOptions = {
        ...input.options,
        playerName,
        playerDescription,
    };
    const summary = buildParlorSessionSummary(input.session, input.character.name, locale);
    const gameState = sanitizePromotedGameState(
        buildParlorPromoteGameState(input.session, input.character, options, summary)
    );
    return {
        gameState,
        scenario: buildParlorScenarioDraft(input.session, input.character, options, summary),
        gameRules: buildParlorSafeGameRules(options),
        parlorSummary: summary,
    };
}