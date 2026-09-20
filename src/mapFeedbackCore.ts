import type { GameStateWorld } from './types/GameState';
import type { WorldForge, Faction } from './worldForgeCore';
import type { RegionWorldState } from './worldStateCore';
import type { WorldChangeEvent, WorldChangeSeverity } from './worldEventLogCore';
import {
    type FogViewPayload,
    getRegionFogVisibility,
    type RegionFogVisibility,
} from './fogOfWarCore';

export type DangerFeedbackTier = 'none' | 'low' | 'medium' | 'high';

export type FactionTintKind = 'friendly' | 'hostile' | 'neutral' | 'player-faction' | null;

export interface RegionHighlightMeta {
    mapHighlight: boolean;
    severity: WorldChangeSeverity;
}

export interface RegionMapFeedback {
    regionId: string;
    fogVisibility: RegionFogVisibility;
    dangerLevel?: number;
    dangerTier: DangerFeedbackTier;
    controllingFactionId?: string | null;
    controllingFactionName?: string;
    factionType?: string;
    factionTint: FactionTintKind;
    mapHighlight: boolean;
    highlightSeverity?: WorldChangeSeverity;
}

const SEVERITY_RANK: Record<WorldChangeSeverity, number> = {
    info: 0,
    warning: 1,
    critical: 2,
};

/** 0–3 low (normal), 4–6 medium (amber), 7–10 high (red + warning). */
export function classifyDangerTier(dangerLevel?: number): DangerFeedbackTier {
    if (dangerLevel === undefined || !Number.isFinite(dangerLevel)) {
        return 'none';
    }
    const d = Math.max(0, Math.min(10, Math.floor(dangerLevel)));
    if (d < 4) { return 'low'; }
    if (d < 7) { return 'medium'; }
    return 'high';
}

export function resolveFactionTint(factionType?: string): FactionTintKind {
    if (!factionType) { return null; }
    if (factionType === 'friendly' || factionType === 'hostile' || factionType === 'neutral' || factionType === 'player-faction') {
        return factionType;
    }
    return 'neutral';
}

export function mergeRegionDangerLevel(
    regionId: string,
    forge: WorldForge,
    simRegions?: Record<string, RegionWorldState>,
    worldOverlay?: GameStateWorld['regions']
): number | undefined {
    const overlay = worldOverlay?.[regionId]?.dangerLevel;
    if (overlay !== undefined) { return overlay; }
    const sim = simRegions?.[regionId]?.dangerLevel;
    if (sim !== undefined) { return sim; }
    return forge.geography.regions.find((r) => r.id === regionId)?.dangerLevel;
}

export function mergeRegionControllingFaction(
    regionId: string,
    simRegions?: Record<string, RegionWorldState>,
    worldOverlay?: GameStateWorld['regions']
): string | null | undefined {
    if (worldOverlay && regionId in worldOverlay) {
        return worldOverlay[regionId]?.controllingFaction;
    }
    return simRegions?.[regionId]?.controllingFaction;
}

/** Per-region highlight from recentChanges (mapHighlight only, FoW applied later). */
export function buildRegionHighlightMeta(events: readonly WorldChangeEvent[]): Map<string, RegionHighlightMeta> {
    const map = new Map<string, RegionHighlightMeta>();
    for (const ev of events) {
        if (!ev.mapHighlight || !ev.regionId) { continue; }
        const prev = map.get(ev.regionId);
        if (!prev || SEVERITY_RANK[ev.severity] >= SEVERITY_RANK[prev.severity]) {
            map.set(ev.regionId, { mapHighlight: true, severity: ev.severity });
        }
    }
    return map;
}

export function buildRegionMapFeedback(
    forge: WorldForge,
    fog: FogViewPayload,
    recentChanges: readonly WorldChangeEvent[],
    simRegions?: Record<string, RegionWorldState>,
    worldOverlay?: GameStateWorld['regions']
): RegionMapFeedback[] {
    const discovered = new Set(fog.discoveredRegionIds);
    const rumored = new Set(fog.rumoredRegionIds);
    const factionById = new Map(forge.factions.map((f) => [f.id, f]));
    const highlights = buildRegionHighlightMeta(recentChanges);

    return forge.geography.regions.map((region) => {
        const fogVisibility = getRegionFogVisibility(region.id, discovered, rumored);
        const highlight = highlights.get(region.id);
        const showFeedback = fogVisibility === 'discovered';

        const dangerLevel = showFeedback
            ? mergeRegionDangerLevel(region.id, forge, simRegions, worldOverlay)
            : undefined;
        const controllingFactionId = showFeedback
            ? mergeRegionControllingFaction(region.id, simRegions, worldOverlay)
            : undefined;
        const faction: Faction | undefined = controllingFactionId
            ? factionById.get(controllingFactionId)
            : undefined;

        return {
            regionId: region.id,
            fogVisibility,
            dangerLevel,
            dangerTier: showFeedback ? classifyDangerTier(dangerLevel) : 'none',
            controllingFactionId: showFeedback ? controllingFactionId : undefined,
            controllingFactionName: showFeedback ? faction?.name : undefined,
            factionType: showFeedback ? faction?.type : undefined,
            factionTint: showFeedback ? resolveFactionTint(faction?.type) : null,
            mapHighlight: showFeedback && Boolean(highlight?.mapHighlight),
            highlightSeverity: showFeedback ? highlight?.severity : undefined,
        };
    });
}