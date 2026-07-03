// PR3 — replay/saga export sanitization (pure, no vscode/fs).

import type { GameEntryLike } from './replayExportCore';

/** Fields allowed in replay / saga HTML exports (public narrative surface only). */
export const REPLAY_EXPORT_ENTRY_KEYS = [
    'id',
    'role',
    'sender',
    'content',
    'speakerNpcId',
    'image',
    'rawImagePath',
    'imageBlocked',
    'excludedFromPrompt',
] as const;

const WINDOWS_ABS_PATH = /[A-Za-z]:\\(?:[^\\\s<>"']+\\)*[^\\\s<>"']*/g;
const UNIX_ABS_PATH = /\/(?:Users|home|tmp|var|opt)(?:\/[^\s<>"']+)+/g;
const SENSITIVE_JSON_MARKERS = [
    '"hiddenState"',
    '"profileUpdates"',
    '"npcMemoryUpdates"',
    '"director"',
    '/hiddenState',
    '/director/notes',
    '"lastParlorSnapshot"',
    '"parlorSessionPath"',
    '"frozenAt"',
    '"parlor_session"',
    '"guildSinceLastVisit"',
    '"domainSinceLastVisit"',
    '"guildSnapshotAtDepart"',
    '"domainSnapshotAtDepart"',
    '"playerNpcMilestones"',
    '"npcRelationships"',
];

function pickShallow(raw: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(raw, key)) {
            out[key] = raw[key];
        }
    }
    return out;
}

function containsSensitiveMarker(block: string): boolean {
    return SENSITIVE_JSON_MARKERS.some((marker) => block.includes(marker));
}

/** Redact absolute paths and GM-only JSON blobs from exported narrative text. */
export function sanitizeExportText(text: string): string {
    let out = String(text ?? '');
    if (!out) {
        return '';
    }

    out = out.replace(WINDOWS_ABS_PATH, '[path redacted]');
    out = out.replace(UNIX_ABS_PATH, '[path redacted]');

    out = out.replace(/```(?:json)?\s*[\s\S]*?```/gi, (fence) => (
        containsSensitiveMarker(fence) ? '```\n[redacted]\n```' : fence
    ));

    return out;
}

export function pickReplayExportEntry(raw: Record<string, unknown>): GameEntryLike {
    const picked = pickShallow(raw, REPLAY_EXPORT_ENTRY_KEYS);
    const role = picked.role === 'gm' || picked.role === 'user' ? picked.role : 'user';
    const content = typeof picked.content === 'string'
        ? sanitizeExportText(picked.content)
        : '';
    const sender = typeof picked.sender === 'string' ? picked.sender : (role === 'gm' ? 'GM' : 'Player');

    return {
        id: typeof picked.id === 'string' ? picked.id : 'unknown',
        role,
        sender,
        content,
        speakerNpcId: typeof picked.speakerNpcId === 'string' ? picked.speakerNpcId : undefined,
        image: typeof picked.image === 'string' ? picked.image : undefined,
        rawImagePath: typeof picked.rawImagePath === 'string' ? picked.rawImagePath : undefined,
        imagePrompt: undefined,
        imageBlocked: picked.imageBlocked === true,
        excludedFromPrompt: picked.excludedFromPrompt === true,
    };
}

export function pickReplayExportEntries(entries: unknown[]): GameEntryLike[] {
    if (!Array.isArray(entries)) {
        return [];
    }
    return entries
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
        .map((entry) => pickReplayExportEntry(entry));
}