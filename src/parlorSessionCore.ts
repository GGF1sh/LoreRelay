/** Pure Parlor session contract — no vscode/fs dependency. */

import { isValidCharacterId } from './characterId';

export type ParlorRole = 'user' | 'assistant' | 'system';

export interface ParlorMessage {
    id: string;
    role: ParlorRole;
    content: string;
    characterId?: string;
    createdAt: string;
    provider?: string;
    model?: string;
}

export interface ParlorSession {
    version: 1;
    activeCharacterId: string;
    messages: ParlorMessage[];
    summary?: string;
    updatedAt: string;
}

export const PARLOR_SESSION_VERSION = 1 as const;
export const MAX_PARLOR_MESSAGES = 500;
export const MAX_PARLOR_MESSAGE_CHARS = 32_000;
export const MAX_PARLOR_SUMMARY_CHARS = 4_000;
export const DEFAULT_PARLOR_PROMPT_MESSAGE_WINDOW = 40;

const PARLOR_ROLE_SET = new Set<ParlorRole>(['user', 'assistant', 'system']);

export function clampParlorContent(text: unknown, max = MAX_PARLOR_MESSAGE_CHARS): string {
    if (typeof text !== 'string') {
        return '';
    }
    const trimmed = text.trim();
    if (trimmed.length <= max) {
        return trimmed;
    }
    return trimmed.slice(0, max);
}

export function isParlorRole(value: unknown): value is ParlorRole {
    return typeof value === 'string' && PARLOR_ROLE_SET.has(value as ParlorRole);
}

export function sanitizeParlorMessage(raw: unknown): ParlorMessage | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const o = raw as Record<string, unknown>;
    if (!isParlorRole(o.role)) {
        return undefined;
    }
    const content = clampParlorContent(o.content);
    if (!content && o.role !== 'system') {
        return undefined;
    }
    const id = typeof o.id === 'string' && o.id.length <= 80 ? o.id : `parlor-${Date.now()}`;
    const createdAt = typeof o.createdAt === 'string' && o.createdAt.length <= 40
        ? o.createdAt
        : new Date().toISOString();
    const msg: ParlorMessage = { id, role: o.role, content, createdAt };
    if (typeof o.characterId === 'string' && isValidCharacterId(o.characterId)) {
        msg.characterId = o.characterId;
    }
    if (typeof o.provider === 'string' && o.provider.length <= 32) {
        msg.provider = o.provider;
    }
    if (typeof o.model === 'string' && o.model.length <= 120) {
        msg.model = o.model;
    }
    return msg;
}

export function parseParlorSession(raw: unknown, fallbackCharacterId: string): ParlorSession | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const o = raw as Record<string, unknown>;
    let activeCharacterId: string | undefined;
    if (typeof o.activeCharacterId === 'string') {
        if (!isValidCharacterId(o.activeCharacterId)) {
            return undefined;
        }
        activeCharacterId = o.activeCharacterId;
    } else {
        activeCharacterId = isValidCharacterId(fallbackCharacterId) ? fallbackCharacterId : undefined;
    }
    if (!activeCharacterId) {
        return undefined;
    }
    const messages: ParlorMessage[] = [];
    if (Array.isArray(o.messages)) {
        for (const item of o.messages.slice(-MAX_PARLOR_MESSAGES)) {
            const msg = sanitizeParlorMessage(item);
            if (msg) {
                messages.push(msg);
            }
        }
    }
    const updatedAt = typeof o.updatedAt === 'string' && o.updatedAt.length <= 40
        ? o.updatedAt
        : new Date().toISOString();
    const session: ParlorSession = {
        version: 1,
        activeCharacterId,
        messages,
        updatedAt,
    };
    if (typeof o.summary === 'string') {
        session.summary = clampParlorContent(o.summary, MAX_PARLOR_SUMMARY_CHARS);
    }
    return session;
}

export function createEmptyParlorSession(activeCharacterId: string): ParlorSession {
    const now = new Date().toISOString();
    return {
        version: 1,
        activeCharacterId,
        messages: [],
        updatedAt: now,
    };
}

export function appendParlorMessage(
    session: ParlorSession,
    message: Omit<ParlorMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): ParlorSession {
    const next: ParlorSession = {
        ...session,
        messages: [...session.messages],
        updatedAt: new Date().toISOString(),
    };
    const entry: ParlorMessage = {
        id: message.id || `parlor-${next.messages.length + 1}-${Date.now()}`,
        role: message.role,
        content: clampParlorContent(message.content),
        createdAt: message.createdAt || next.updatedAt,
    };
    if (message.characterId && isValidCharacterId(message.characterId)) {
        entry.characterId = message.characterId;
    }
    if (message.provider) {
        entry.provider = message.provider.slice(0, 32);
    }
    if (message.model) {
        entry.model = message.model.slice(0, 120);
    }
    next.messages.push(entry);
    if (next.messages.length > MAX_PARLOR_MESSAGES) {
        next.messages = next.messages.slice(-MAX_PARLOR_MESSAGES);
    }
    return next;
}

export function parlorMessagesToChatEntries(
    session: ParlorSession,
    characterName: string
): Array<{ id: string; role: 'gm' | 'user'; sender: string; content: string }> {
    return session.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
            id: m.id,
            role: m.role === 'user' ? 'user' as const : 'gm' as const,
            sender: m.role === 'user' ? 'Player' : characterName,
            content: m.content,
        }));
}

export function recentParlorMessagesForPrompt(
    session: ParlorSession,
    maxMessages = DEFAULT_PARLOR_PROMPT_MESSAGE_WINDOW
): ParlorMessage[] {
    return session.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-Math.max(1, maxMessages));
}

/** Filename for a character-owned Parlor transcript. */
export function getCharacterParlorSessionFilename(characterId: string): string | undefined {
    if (!isValidCharacterId(characterId)) {
        return undefined;
    }
    return `parlor_session.${characterId}.json`;
}

/**
 * The former shared transcript is only safe to read when it explicitly names
 * the requested character. Old files with no owner are deliberately ignored:
 * assigning their history to whichever character was opened last would leak a
 * different character's conversation.
 */
export function legacyParlorSessionBelongsToCharacter(raw: unknown, characterId: string): boolean {
    if (!isValidCharacterId(characterId) || !raw || typeof raw !== 'object') {
        return false;
    }
    return (raw as Record<string, unknown>).activeCharacterId === characterId;
}
