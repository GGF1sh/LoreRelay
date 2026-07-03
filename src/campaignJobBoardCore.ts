// Campaign Kit Phase C: hub job/rumor board generation (pure, no vscode/fs).

import type { CampaignKitConfig, CampaignKitGenre } from './campaignKitCore';
import type { Region, WorldLocation } from './worldForgeCore';

export type JobBoardEntryKind = 'job' | 'rumor';

export interface CampaignJobBoardEntry {
    id: string;
    kind: JobBoardEntryKind;
    title: string;
    summary: string;
    siteId?: string;
    siteName?: string;
    difficultyHint?: string;
    rewardHint?: string;
}

export interface CampaignJobBoardContext {
    kit: CampaignKitConfig;
    hubLocationId: string;
    hubLocationName: string;
    locations: WorldLocation[];
    regions: Region[];
    worldSeed: string;
    worldTurn: number;
}

export const MAX_JOB_BOARD_SIZE = 4;
export const MAX_JOB_BOARD_TITLE = 100;
export const MAX_JOB_BOARD_SUMMARY = 280;

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function clampText(raw: unknown, max: number): string {
    if (typeof raw !== 'string') { return ''; }
    return raw.trim().replace(/\s+/g, ' ').slice(0, max);
}

function hashSeed(parts: readonly (string | number)[]): number {
    let h = 2166136261;
    for (const part of parts) {
        const s = String(part);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
    }
    return h >>> 0;
}

function pickTermName(kit: CampaignKitConfig, pool: 'siteTypes' | 'hazards' | 'resources' | 'services', seed: number): string {
    const terms = kit[pool];
    if (!terms.length) { return ''; }
    return terms[seed % terms.length].name;
}

function regionForLocation(regions: Region[], location: WorldLocation): Region | undefined {
    if (!location.regionId) { return undefined; }
    return regions.find((r) => r.id === location.regionId);
}

function hazardLabel(region: Region | undefined, kit: CampaignKitConfig, seed: number): string {
    if (region?.hazard) {
        const map: Record<string, string> = {
            radiation: 'radiation',
            toxic: 'toxic exposure',
            infested: 'infestation',
            quarantine: 'quarantine',
            anomaly: 'anomaly',
            haunted: 'haunting',
            storm: 'storms',
            corrupted: 'corruption',
        };
        return map[region.hazard] ?? region.hazard;
    }
    return pickTermName(kit, 'hazards', seed) || 'local hazards';
}

interface BoardTemplate {
    id: string;
    kind: JobBoardEntryKind;
    weight: number;
    genres?: readonly CampaignKitGenre[];
    build: (ctx: {
        kit: CampaignKitConfig;
        site: WorldLocation;
        siteRegion?: Region;
        hazard: string;
        siteType: string;
        hubName: string;
        seed: number;
    }) => { title: string; summary: string; difficultyHint?: string; rewardHint?: string };
}

const BOARD_TEMPLATES: readonly BoardTemplate[] = [
    {
        id: 'salvage_contract',
        kind: 'job',
        weight: 9,
        genres: ['postapocalypse'],
        build: ({ kit, site, hazard, hubName }) => ({
            title: `Salvage contract: ${site.name}`,
            summary: `${hubName}'s notice board lists a paid run into ${site.name}. Bring back usable ${kit.loop.lootLabel.toLowerCase()} and watch for ${hazard}.`,
            difficultyHint: 'moderate',
            rewardHint: 'credits or barter',
        }),
    },
    {
        id: 'power_rumor',
        kind: 'rumor',
        weight: 8,
        genres: ['postapocalypse', 'cyberpunk'],
        build: ({ site, hazard }) => ({
            title: `Rumor: lights in ${site.name}`,
            summary: `Travelers whisper that something still draws power near ${site.name}. Worth checking before ${hazard} worsens.`,
            difficultyHint: 'uncertain',
        }),
    },
    {
        id: 'guild_posting',
        kind: 'job',
        weight: 9,
        genres: ['fantasy', 'eastern_fantasy'],
        build: ({ kit, site, siteType, hubName }) => ({
            title: `${kit.loop.siteLabel} posting: ${site.name}`,
            summary: `A client at ${hubName} wants a party to investigate ${site.name} (${siteType}). Payment on return.`,
            difficultyHint: 'varies',
            rewardHint: kit.currencies[0]?.name ?? 'payment',
        }),
    },
    {
        id: 'haunted_whisper',
        kind: 'rumor',
        weight: 7,
        genres: ['fantasy', 'horror', 'modern_occult'],
        build: ({ site, hazard }) => ({
            title: `Whisper: trouble at ${site.name}`,
            summary: `Locals avoid ${site.name} after recent sightings. Some blame ${hazard}; others want proof.`,
        }),
    },
    {
        id: 'frontier_contract',
        kind: 'job',
        weight: 8,
        genres: ['space'],
        build: ({ kit, site, siteType, hubName }) => ({
            title: `Contract: ${site.name}`,
            summary: `A broker at ${hubName} offers hazard pay for a crew to survey ${site.name} (${siteType}) and report back with ${kit.loop.lootLabel.toLowerCase()}.`,
            difficultyHint: 'hazard pay',
            rewardHint: 'credits or shares',
        }),
    },
    {
        id: 'signal_rumor',
        kind: 'rumor',
        weight: 7,
        genres: ['space', 'cyberpunk'],
        build: ({ site }) => ({
            title: `Signal chatter: ${site.name}`,
            summary: `Encrypted traffic mentions activity near ${site.name}. No confirmed client yet — intel only.`,
        }),
    },
    {
        id: 'fixer_gig',
        kind: 'job',
        weight: 9,
        genres: ['cyberpunk'],
        build: ({ kit, site, hazard, hubName }) => ({
            title: `Gig: ${site.name}`,
            summary: `A fixer near ${hubName} wants quiet work at ${site.name}. Low profile; heat rises if ${hazard} spills into the streets.`,
            difficultyHint: 'stealth',
            rewardHint: kit.currencies[0]?.name ?? 'credits',
        }),
    },
    {
        id: 'survey_request',
        kind: 'job',
        weight: 7,
        build: ({ kit, site, siteType }) => ({
            title: `Survey: ${site.name}`,
            summary: `Someone needs a careful survey of ${site.name} (${siteType}) before a larger expedition. Map routes and note ${kit.loop.lootLabel.toLowerCase()} risks.`,
            difficultyHint: 'recon',
        }),
    },
    {
        id: 'escort_need',
        kind: 'job',
        weight: 6,
        build: ({ site, hubName }) => ({
            title: `Escort wanted toward ${site.name}`,
            summary: `A nervous client at ${hubName} seeks protection on the route toward ${site.name}.`,
            difficultyHint: 'travel',
            rewardHint: 'upfront fee',
        }),
    },
    {
        id: 'missing_goods',
        kind: 'rumor',
        weight: 6,
        build: ({ kit, site }) => ({
            title: `Missing shipment near ${site.name}`,
            summary: `Merchants mutter about lost cargo near ${site.name}. If found, ${kit.loop.appraisalLabel.toLowerCase()} might turn a profit.`,
        }),
    },
    {
        id: 'hazard_warning',
        kind: 'rumor',
        weight: 8,
        build: ({ site, hazard }) => ({
            title: `Warning: ${hazard} at ${site.name}`,
            summary: `Recent travelers report worsening ${hazard} around ${site.name}. Jobs may pay more — or no one may return.`,
        }),
    },
];

function templateWeight(template: BoardTemplate, genre: CampaignKitGenre): number {
    if (!template.genres || template.genres.length === 0) { return template.weight; }
    return template.genres.includes(genre) ? template.weight : Math.max(1, Math.floor(template.weight / 3));
}

function isExpeditionSite(location: WorldLocation, hubLocationId: string): boolean {
    if (location.id === hubLocationId) { return false; }
    return location.type === 'ruins'
        || location.type === 'dungeon'
        || location.type === 'wilderness'
        || location.type === 'landmark';
}

/** Prefer settlement/hub locations; fallback to first forge location. */
export function resolveCampaignHubLocation(
    locations: WorldLocation[],
    preferredId?: string | null
): WorldLocation | undefined {
    if (!locations.length) { return undefined; }
    if (preferredId) {
        const preferred = locations.find((l) => l.id === preferredId);
        if (preferred) { return preferred; }
    }
    const settlements = locations.filter((l) => l.type === 'settlement');
    const hubHints = /(hub|market|guild|notice|inn|town|settlement|starport|safehouse)/i;
    const hinted = settlements.find((l) => hubHints.test(`${l.name} ${l.description ?? ''}`));
    if (hinted) { return hinted; }
    if (settlements.length) { return settlements[0]; }
    return locations[0];
}

function makeEntryId(templateId: string, siteId: string, index: number): string {
    const raw = `board_${templateId}_${siteId}_${index}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 64);
    return ID_RE.test(raw) ? raw : `board_${index}`;
}

/** Deterministic hub board from kit + forge geography. */
export function buildCampaignJobBoard(ctx: CampaignJobBoardContext, size = MAX_JOB_BOARD_SIZE): CampaignJobBoardEntry[] {
    const clampedSize = Math.max(1, Math.min(MAX_JOB_BOARD_SIZE, Math.floor(size)));
    const sites = ctx.locations.filter((l) => isExpeditionSite(l, ctx.hubLocationId));
    if (!sites.length) { return []; }

    const weighted = BOARD_TEMPLATES
        .map((t) => ({ template: t, w: templateWeight(t, ctx.kit.genre) }))
        .filter((e) => e.w > 0);
    if (!weighted.length) { return []; }

    let seed = hashSeed([
        ctx.worldSeed,
        ctx.kit.id,
        ctx.hubLocationId,
        ctx.worldTurn,
        'campaign_job_board',
    ]);

    const chosen: CampaignJobBoardEntry[] = [];
    const usedTemplates = new Set<string>();
    let siteIdx = seed % sites.length;

    while (chosen.length < clampedSize && weighted.length > 0) {
        const total = weighted.reduce((sum, e) => sum + e.w, 0);
        seed = hashSeed([seed, chosen.length]);
        let roll = seed % total;
        let pickIdx = 0;
        for (; pickIdx < weighted.length - 1; pickIdx++) {
            if (roll < weighted[pickIdx].w) { break; }
            roll -= weighted[pickIdx].w;
        }

        const { template } = weighted[pickIdx];
        if (usedTemplates.has(template.id)) {
            weighted.splice(pickIdx, 1);
            continue;
        }
        usedTemplates.add(template.id);

        const site = sites[siteIdx % sites.length];
        siteIdx += 1;
        const siteRegion = regionForLocation(ctx.regions, site);
        const built = template.build({
            kit: ctx.kit,
            site,
            siteRegion,
            hazard: hazardLabel(siteRegion, ctx.kit, seed),
            siteType: pickTermName(ctx.kit, 'siteTypes', seed),
            hubName: ctx.hubLocationName,
            seed,
        });

        chosen.push({
            id: makeEntryId(template.id, site.id, chosen.length),
            kind: template.kind,
            title: clampText(built.title, MAX_JOB_BOARD_TITLE),
            summary: clampText(built.summary, MAX_JOB_BOARD_SUMMARY),
            siteId: site.id,
            siteName: site.name,
            difficultyHint: built.difficultyHint ? clampText(built.difficultyHint, 40) : undefined,
            rewardHint: built.rewardHint ? clampText(built.rewardHint, 60) : undefined,
        });

        weighted.splice(pickIdx, 1);
    }

    return chosen;
}

export function buildCampaignJobBoardPromptBlock(
    kit: CampaignKitConfig | undefined,
    entries: CampaignJobBoardEntry[],
    hubLocationName: string
): string {
    if (!kit || !entries.length) { return ''; }
    const label = kit.loop.jobBoardLabel;
    const lines = [
        `[Campaign ${label} @ ${hubLocationName}]`,
        ...entries.map((e) => {
            const site = e.siteName ? ` (site: ${e.siteName})` : '';
            const reward = e.rewardHint ? ` [${e.rewardHint}]` : '';
            return `- ${e.kind}: ${e.title} — ${e.summary}${site}${reward}`;
        }),
        'These are optional hub prompts the player may notice. The player may accept a posting from the World tab (creates an active campaign quest hook) or pursue it narratively. Persist outcomes via quest hook completion, turn_result, or discoveryOps.',
    ];
    return lines.join('\n');
}