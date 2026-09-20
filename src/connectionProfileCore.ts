/** Pure connection profile types for Parlor GM backends. */

import type { GmProvider } from './archivePrompt';

export interface VscodeLmProfileOptions {
    vendor?: string;
    family?: string;
    model?: string;
}

export interface ConnectionProfile {
    id: string;
    label: string;
    provider: GmProvider;
    vscodeLm?: VscodeLmProfileOptions;
}

export interface ConnectionProfilesFile {
    version: 1;
    profiles: ConnectionProfile[];
    activeId: string;
}

export const CONNECTION_PROFILES_FILENAME = 'connection_profiles.json';

const PROFILE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const PARLOR_PROVIDERS: GmProvider[] = [
    'vscode-lm', 'clipboard', 'grok', 'ollama', 'koboldcpp', 'openrouter',
];

export const DEFAULT_CONNECTION_PROFILES: ConnectionProfilesFile = {
    version: 1,
    activeId: 'vscode-lm-default',
    profiles: [
        {
            id: 'vscode-lm-default',
            label: 'VS Code LM (auto)',
            provider: 'vscode-lm',
            vscodeLm: { vendor: '', family: '', model: '' },
        },
        {
            id: 'clipboard-gemini',
            label: 'Clipboard (Antigravity / manual)',
            provider: 'clipboard',
        },
        {
            id: 'grok-build',
            label: 'Grok Build',
            provider: 'grok',
        },
    ],
};

function parseVscodeLm(raw: unknown): VscodeLmProfileOptions | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const o = raw as Record<string, unknown>;
    const out: VscodeLmProfileOptions = {};
    if (typeof o.vendor === 'string' && o.vendor.length <= 64) {
        out.vendor = o.vendor;
    }
    if (typeof o.family === 'string' && o.family.length <= 120) {
        out.family = o.family;
    }
    if (typeof o.model === 'string' && o.model.length <= 120) {
        out.model = o.model;
    }
    return out;
}

function parseProfile(raw: unknown): ConnectionProfile | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== 'string' || !PROFILE_ID_PATTERN.test(o.id)) {
        return undefined;
    }
    if (typeof o.label !== 'string' || !o.label.trim()) {
        return undefined;
    }
    if (typeof o.provider !== 'string' || !PARLOR_PROVIDERS.includes(o.provider as GmProvider)) {
        return undefined;
    }
    const profile: ConnectionProfile = {
        id: o.id,
        label: o.label.trim().slice(0, 80),
        provider: o.provider as GmProvider,
    };
    const vscodeLm = parseVscodeLm(o.vscodeLm);
    if (vscodeLm) {
        profile.vscodeLm = vscodeLm;
    }
    return profile;
}

export function parseConnectionProfiles(raw: unknown): ConnectionProfilesFile {
    if (!raw || typeof raw !== 'object') {
        return { ...DEFAULT_CONNECTION_PROFILES, profiles: [...DEFAULT_CONNECTION_PROFILES.profiles] };
    }
    const o = raw as Record<string, unknown>;
    const profiles: ConnectionProfile[] = [];
    if (Array.isArray(o.profiles)) {
        for (const item of o.profiles.slice(0, 32)) {
            const p = parseProfile(item);
            if (p) {
                profiles.push(p);
            }
        }
    }
    const merged = profiles.length > 0 ? profiles : [...DEFAULT_CONNECTION_PROFILES.profiles];
    let activeId = typeof o.activeId === 'string' ? o.activeId : DEFAULT_CONNECTION_PROFILES.activeId;
    if (!merged.some((p) => p.id === activeId)) {
        activeId = merged[0].id;
    }
    return { version: 1, profiles: merged, activeId };
}

export function getActiveConnectionProfile(file: ConnectionProfilesFile): ConnectionProfile {
    return file.profiles.find((p) => p.id === file.activeId) ?? file.profiles[0];
}

export function setActiveConnectionProfileId(file: ConnectionProfilesFile, id: string): ConnectionProfilesFile {
    if (!PROFILE_ID_PATTERN.test(id) || !file.profiles.some((p) => p.id === id)) {
        return file;
    }
    return { ...file, activeId: id };
}