import { CHARACTER_ID_PATTERN } from './characterId';

export type RelationshipType = 'ally' | 'friend' | 'rival' | 'enemy' | 'romance' | 'neutral';

const RELATIONSHIP_TYPES = new Set<RelationshipType>([
    'ally', 'friend', 'rival', 'enemy', 'romance', 'neutral'
]);

export interface PartyDirectorGlobal {
    npcBanterEnabled: boolean;
    combatQuietMode: boolean;
}

export interface PartyMemberDirector {
    verbosity: number;
    muted: boolean;
    forceSpeak: boolean;
    relationships: Record<string, RelationshipType>;
}

export interface PartyDirectorTemplate {
    global: PartyDirectorGlobal;
    members: Record<string, PartyMemberDirector>;
}

export interface GameStatePartyMember {
    verbosity?: number;
    muted?: boolean;
    forceSpeak?: boolean;
    relationships?: Record<string, RelationshipType>;
}

export interface GameStatePartyDirector {
    members?: Record<string, GameStatePartyMember>;
    notes?: string;
}

export interface PartyMemberDirectorView extends PartyMemberDirector {
    hasRuntimeOverrides: boolean;
    templateSnapshot?: Partial<Pick<PartyMemberDirector, 'verbosity' | 'muted' | 'forceSpeak'>>;
}

export interface PartyDirectorView {
    global: PartyDirectorGlobal;
    members: Record<string, PartyMemberDirectorView>;
    notes?: string;
    hasRuntimeOverrides: boolean;
}

function clampVerbosity(value: unknown, fallback = 50): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return fallback;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
}

function pickRelationship(value: unknown): RelationshipType | undefined {
    return typeof value === 'string' && RELATIONSHIP_TYPES.has(value as RelationshipType)
        ? value as RelationshipType
        : undefined;
}

function parseRelationships(value: unknown): Record<string, RelationshipType> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const out: Record<string, RelationshipType> = {};
    for (const [key, rel] of Object.entries(value as Record<string, unknown>)) {
        if (!CHARACTER_ID_PATTERN.test(key)) {
            continue;
        }
        const picked = pickRelationship(rel);
        if (picked) {
            out[key] = picked;
        }
    }
    return out;
}

function parseMemberBlock(value: unknown, fallbackVerbosity = 50): PartyMemberDirector | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const m = value as Record<string, unknown>;
    return {
        verbosity: clampVerbosity(m.verbosity, fallbackVerbosity),
        muted: m.muted === true,
        forceSpeak: m.forceSpeak === true,
        relationships: parseRelationships(m.relationships)
    };
}

function parseMembersMap(value: unknown): Record<string, PartyMemberDirector> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const out: Record<string, PartyMemberDirector> = {};
    for (const [id, block] of Object.entries(value as Record<string, unknown>)) {
        if (!CHARACTER_ID_PATTERN.test(id)) {
            continue;
        }
        const member = parseMemberBlock(block);
        if (member) {
            out[id] = member;
        }
    }
    return out;
}

export function defaultPartyDirectorGlobal(): PartyDirectorGlobal {
    return { npcBanterEnabled: true, combatQuietMode: false };
}

export function defaultPartyMemberDirector(): PartyMemberDirector {
    return {
        verbosity: 50,
        muted: false,
        forceSpeak: false,
        relationships: {}
    };
}

export function parsePartyDirectorTemplate(raw: unknown): PartyDirectorTemplate | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const doc = raw as Record<string, unknown>;
    const globalRaw = doc.global;
    const global: PartyDirectorGlobal = defaultPartyDirectorGlobal();
    if (globalRaw && typeof globalRaw === 'object' && !Array.isArray(globalRaw)) {
        const g = globalRaw as Record<string, unknown>;
        if (g.npcBanterEnabled === false) {
            global.npcBanterEnabled = false;
        }
        if (g.combatQuietMode === true) {
            global.combatQuietMode = true;
        }
    }
    return {
        global,
        members: parseMembersMap(doc.members)
    };
}

export function parseGameStatePartyDirector(value: unknown): GameStatePartyDirector | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const d = value as Record<string, unknown>;
    const out: GameStatePartyDirector = {};
    if (typeof d.notes === 'string' && d.notes.trim()) {
        out.notes = d.notes.trim();
    }
    if (d.members !== undefined) {
        if (!d.members || typeof d.members !== 'object' || Array.isArray(d.members)) {
            return { notes: out.notes, members: {} };
        }
        const members: Record<string, GameStatePartyMember> = {};
        for (const [id, block] of Object.entries(d.members as Record<string, unknown>)) {
            if (!CHARACTER_ID_PATTERN.test(id) || !block || typeof block !== 'object' || Array.isArray(block)) {
                continue;
            }
            const m = block as Record<string, unknown>;
            const entry: GameStatePartyMember = {};
            if (m.verbosity !== undefined) {
                entry.verbosity = clampVerbosity(m.verbosity);
            }
            if (m.muted === true) {
                entry.muted = true;
            } else if (m.muted === false) {
                entry.muted = false;
            }
            if (m.forceSpeak === true) {
                entry.forceSpeak = true;
            } else if (m.forceSpeak === false) {
                entry.forceSpeak = false;
            }
            const rels = parseRelationships(m.relationships);
            if (Object.keys(rels).length > 0) {
                entry.relationships = rels;
            }
            if (Object.keys(entry).length > 0) {
                members[id] = entry;
            }
        }
        if (Object.keys(members).length > 0) {
            out.members = members;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function mergeMember(
    template: PartyMemberDirector | undefined,
    runtime: GameStatePartyMember | undefined
): PartyMemberDirectorView | undefined {
    if (!template && !runtime) {
        return undefined;
    }
    const base = template || defaultPartyMemberDirector();
    const merged: PartyMemberDirectorView = {
        verbosity: runtime?.verbosity ?? base.verbosity,
        muted: runtime?.muted ?? base.muted,
        forceSpeak: runtime?.forceSpeak ?? base.forceSpeak,
        relationships: { ...base.relationships, ...(runtime?.relationships || {}) },
        hasRuntimeOverrides: false,
        templateSnapshot: template
            ? {
                verbosity: template.verbosity,
                muted: template.muted,
                forceSpeak: template.forceSpeak
            }
            : undefined
    };
    if (runtime) {
        merged.hasRuntimeOverrides = (
            (runtime.verbosity !== undefined && runtime.verbosity !== base.verbosity) ||
            (runtime.muted !== undefined && runtime.muted !== base.muted) ||
            (runtime.forceSpeak !== undefined && runtime.forceSpeak !== base.forceSpeak) ||
            Boolean(runtime.relationships && Object.keys(runtime.relationships).length > 0)
        );
    }
    return merged;
}

export function mergePartyDirector(
    template: PartyDirectorTemplate | undefined,
    runtime: GameStatePartyDirector | undefined,
    memberIds: string[]
): PartyDirectorView | undefined {
    if (!template && !runtime && memberIds.length === 0) {
        return undefined;
    }
    const base = template || { global: defaultPartyDirectorGlobal(), members: {} };
    const ids = [...new Set([
        ...memberIds,
        ...Object.keys(base.members),
        ...Object.keys(runtime?.members || {})
    ])];

    const members: Record<string, PartyMemberDirectorView> = {};
    const activeIds = new Set(memberIds);
    let anyRuntime = Boolean(runtime?.notes);
    for (const id of ids) {
        let merged = mergeMember(base.members[id], runtime?.members?.[id]);
        if (!merged && activeIds.has(id)) {
            merged = { ...defaultPartyMemberDirector(), hasRuntimeOverrides: false };
        }
        if (merged) {
            members[id] = merged;
            if (merged.hasRuntimeOverrides) {
                anyRuntime = true;
            }
        }
    }

    return {
        global: base.global,
        members,
        notes: runtime?.notes,
        hasRuntimeOverrides: anyRuntime
    };
}

export function validatePartyDirectorFile(doc: unknown): string[] {
    const errors: string[] = [];
    if (doc === undefined) {
        return errors;
    }
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
        errors.push('party_director must be an object');
        return errors;
    }
    const root = doc as Record<string, unknown>;
    if (root.global !== undefined) {
        if (typeof root.global !== 'object' || root.global === null || Array.isArray(root.global)) {
            errors.push('global must be an object');
        } else {
            const g = root.global as Record<string, unknown>;
            for (const key of ['npcBanterEnabled', 'combatQuietMode'] as const) {
                if (g[key] !== undefined && typeof g[key] !== 'boolean') {
                    errors.push(`global.${key} must be a boolean`);
                }
            }
        }
    }
    if (root.members !== undefined) {
        errors.push(...validateMembersBlock(root.members, 'members'));
    }
    return errors;
}

function validateMembersBlock(value: unknown, pathPrefix: string): string[] {
    const errors: string[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${pathPrefix} must be an object`);
        return errors;
    }
    for (const [id, block] of Object.entries(value as Record<string, unknown>)) {
        if (!CHARACTER_ID_PATTERN.test(id)) {
            errors.push(`${pathPrefix}.${id} has invalid character id`);
            continue;
        }
        if (!block || typeof block !== 'object' || Array.isArray(block)) {
            errors.push(`${pathPrefix}.${id} must be an object`);
            continue;
        }
        const m = block as Record<string, unknown>;
        if (m.verbosity !== undefined && (typeof m.verbosity !== 'number' || m.verbosity < 0 || m.verbosity > 100)) {
            errors.push(`${pathPrefix}.${id}.verbosity must be a number 0–100`);
        }
        for (const flag of ['muted', 'forceSpeak'] as const) {
            if (m[flag] !== undefined && typeof m[flag] !== 'boolean') {
                errors.push(`${pathPrefix}.${id}.${flag} must be a boolean`);
            }
        }
        if (m.relationships !== undefined) {
            if (typeof m.relationships !== 'object' || m.relationships === null || Array.isArray(m.relationships)) {
                errors.push(`${pathPrefix}.${id}.relationships must be an object`);
            } else {
                for (const [otherId, rel] of Object.entries(m.relationships as Record<string, unknown>)) {
                    if (!CHARACTER_ID_PATTERN.test(otherId)) {
                        errors.push(`${pathPrefix}.${id}.relationships.${otherId} has invalid character id`);
                    } else if (!pickRelationship(rel)) {
                        errors.push(`${pathPrefix}.${id}.relationships.${otherId} must be ally, friend, rival, enemy, romance, or neutral`);
                    }
                }
            }
        }
    }
    return errors;
}

export function validateGameStatePartyDirector(director: unknown): string[] {
    const errors: string[] = [];
    if (director === undefined) {
        return errors;
    }
    if (typeof director !== 'object' || director === null || Array.isArray(director)) {
        errors.push('"partyDirector" must be an object');
        return errors;
    }
    const d = director as Record<string, unknown>;
    if (d.notes !== undefined && typeof d.notes !== 'string') {
        errors.push('partyDirector.notes must be a string');
    }
    if (d.members !== undefined) {
        errors.push(...validateMembersBlock(d.members, 'partyDirector.members'));
    }
    return errors;
}

/** Build a serializable party_director.json document from a merged view. */
export function serializePartyDirectorTemplate(view: PartyDirectorView): Record<string, unknown> {
    const members: Record<string, unknown> = {};
    for (const [id, m] of Object.entries(view.members)) {
        const block: Record<string, unknown> = {
            verbosity: m.verbosity,
            muted: m.muted,
            forceSpeak: m.forceSpeak
        };
        if (Object.keys(m.relationships).length > 0) {
            block.relationships = m.relationships;
        }
        members[id] = block;
    }
    return {
        format: 'lorerelay-party-director/1.0',
        global: view.global,
        members
    };
}