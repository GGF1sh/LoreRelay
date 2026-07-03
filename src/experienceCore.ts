/** Pure experience profile types — no vscode/fs dependency. */

export type ExperienceProfile = 'parlor' | 'campaign' | 'inworld';

export interface ExperienceParlorOptions {
    maxHistoryMessages?: number;
    lorebookEnabled?: boolean;
    /** backgrounds/{filename} selection id */
    backgroundId?: string;
}

export interface ExperienceCampaignOptions {
    frozenAt?: string | null;
}

export interface ExperienceParlorSnapshot {
    promotedAt: string;
    parlorSessionPath?: string;
    characterId?: string;
}

export interface ExperienceConfig {
    version: 1;
    profile: ExperienceProfile;
    connectionProfileId?: string;
    activeCharacterId?: string;
    parlor?: ExperienceParlorOptions;
    campaign?: ExperienceCampaignOptions;
    /** Set after Parlor → Campaign promote for optional rollback (Phase C). */
    lastParlorSnapshot?: ExperienceParlorSnapshot;
}

export const EXPERIENCE_CONFIG_VERSION = 1 as const;
export const EXPERIENCE_FILENAME = 'experience.json';
export const PARLOR_SESSION_FILENAME = 'parlor_session.json';
export const INWORLD_SESSION_FILENAME = 'inworld_session.json';

export const DEFAULT_EXPERIENCE: ExperienceConfig = {
    version: 1,
    profile: 'campaign',
};

export function isExperienceProfile(value: unknown): value is ExperienceProfile {
    return value === 'parlor' || value === 'campaign' || value === 'inworld';
}

export function parseExperienceConfig(raw: unknown): ExperienceConfig {
    if (!raw || typeof raw !== 'object') {
        return { ...DEFAULT_EXPERIENCE };
    }
    const o = raw as Record<string, unknown>;
    const profile = isExperienceProfile(o.profile) ? o.profile : DEFAULT_EXPERIENCE.profile;
    const out: ExperienceConfig = {
        version: 1,
        profile,
    };
    if (typeof o.connectionProfileId === 'string' && o.connectionProfileId.length <= 64) {
        out.connectionProfileId = o.connectionProfileId;
    }
    if (typeof o.activeCharacterId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(o.activeCharacterId)) {
        out.activeCharacterId = o.activeCharacterId;
    }
    if (o.parlor && typeof o.parlor === 'object') {
        const p = o.parlor as Record<string, unknown>;
        out.parlor = {};
        if (typeof p.maxHistoryMessages === 'number' && Number.isFinite(p.maxHistoryMessages)) {
            out.parlor.maxHistoryMessages = Math.max(10, Math.min(500, Math.floor(p.maxHistoryMessages)));
        }
        if (typeof p.lorebookEnabled === 'boolean') {
            out.parlor.lorebookEnabled = p.lorebookEnabled;
        }
        if (typeof p.backgroundId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(p.backgroundId)) {
            out.parlor.backgroundId = p.backgroundId;
        }
    }
    if (o.campaign && typeof o.campaign === 'object') {
        const c = o.campaign as Record<string, unknown>;
        out.campaign = {};
        if (c.frozenAt === null) {
            out.campaign.frozenAt = null;
        } else if (typeof c.frozenAt === 'string' && c.frozenAt.length <= 40) {
            out.campaign.frozenAt = c.frozenAt;
        }
    }
    if (o.lastParlorSnapshot && typeof o.lastParlorSnapshot === 'object') {
        const s = o.lastParlorSnapshot as Record<string, unknown>;
        if (typeof s.promotedAt === 'string' && s.promotedAt.length <= 40) {
            const snap: ExperienceParlorSnapshot = { promotedAt: s.promotedAt };
            if (typeof s.parlorSessionPath === 'string' && s.parlorSessionPath.length <= 120) {
                snap.parlorSessionPath = s.parlorSessionPath;
            }
            if (typeof s.characterId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(s.characterId)) {
                snap.characterId = s.characterId;
            }
            out.lastParlorSnapshot = snap;
        }
    }
    return out;
}

export function mergeExperiencePatch(
    current: ExperienceConfig,
    patch: Partial<ExperienceConfig>
): ExperienceConfig {
    const next = parseExperienceConfig({ ...current, ...patch });
    if (patch.parlor) {
        next.parlor = { ...current.parlor, ...parseExperienceConfig({ parlor: patch.parlor }).parlor };
    }
    if (patch.campaign) {
        next.campaign = { ...current.campaign, ...parseExperienceConfig({ campaign: patch.campaign }).campaign };
    }
    return next;
}
