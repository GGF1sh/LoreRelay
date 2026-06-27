// Pure NPC event propagation — no vscode or fs imports.
// Translates WorldChangeEvents from the simulator into NpcRegistry need updates.

import type { WorldChangeEvent } from './worldEventLogCore';
import type { WorldForge } from './worldForgeCore';
import type { NpcRegistry, NpcNeed, NpcEntry } from './npcRegistryCore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NEEDS_PER_NPC = 10;
const MAX_EVENTS_PER_BRIDGE = 30;

function foodCrisisKey(factionId: string): string {
    return `faction_${factionId}_food_crisis`;
}

function regionSafetyKey(regionId: string): string {
    return `region_${regionId}_danger`;
}
const FOOD_CRISIS_URGENCY = 75;
const FOOD_CRISIS_URGENCY_INCREMENT = 20;
const SAFETY_URGENCY_BASE = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function makeNeedId(prefix: string, npcId: string, eventId: string): string {
    // Keep the ID short and safe (no spaces/special chars)
    const suffix = eventId.slice(0, 24);
    return `${prefix}_${npcId.slice(0, 16)}_${suffix}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Find or update an existing need by relatedEventId; if absent, push a new one. */
function upsertNeed(
    entry: NpcEntry,
    candidateId: string,
    relatedEventId: string,
    buildNew: () => NpcNeed,
    updateExisting: (n: NpcNeed) => void
): void {
    const idx = entry.needs.findIndex((n) => n.relatedEventId === relatedEventId);
    if (idx >= 0) {
        updateExisting(entry.needs[idx]);
        return;
    }
    if (entry.needs.length >= MAX_NEEDS_PER_NPC) {
        // Replace the lowest-urgency need to stay within the cap
        let minIdx = 0;
        for (let i = 1; i < entry.needs.length; i++) {
            if (entry.needs[i].urgency < entry.needs[minIdx].urgency) { minIdx = i; }
        }
        entry.needs[minIdx] = buildNew();
    } else {
        entry.needs.push(buildNew());
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface NpcBridgeResult {
    /** A new registry with modified entries (original is not mutated). */
    registry: NpcRegistry;
    /** IDs of NPCs that received need updates. */
    updatedIds: string[];
}

/**
 * Translates WorldChangeEvents into NPC need additions/updates.
 *
 * Handles:
 * - 'resource' events with factionId: NPCs in that faction get a material need
 *   (food crisis → urgency 75; subsequent triggers increment by 20, capped at 95).
 * - 'region' events with mapHighlight: NPCs whose locationId is in that region
 *   get a safety/emotional need (urgency 60).
 *
 * Returns a deep-cloned registry so the caller can diff/save freely.
 */
export function applyEventsToNpcRegistry(
    events: WorldChangeEvent[],
    registry: NpcRegistry,
    forge: WorldForge
): NpcBridgeResult {
    // Deep-clone so we never mutate the input
    const next: NpcRegistry = JSON.parse(JSON.stringify(registry)) as NpcRegistry;
    const updatedIds = new Set<string>();

    // Pre-build lookup: regionId → Set<locationId>
    const regionLocationIds = new Map<string, Set<string>>();
    for (const loc of forge.geography.locations) {
        if (loc.regionId) {
            const s = regionLocationIds.get(loc.regionId) ?? new Set();
            s.add(loc.id);
            regionLocationIds.set(loc.regionId, s);
        }
    }

    for (const event of events.slice(0, MAX_EVENTS_PER_BRIDGE)) {
        // ── Scenario A: food crisis ──────────────────────────────────────────
        if (event.category === 'resource' && event.factionId && event.severity !== 'info') {
            const factionId = event.factionId;
            const crisisKey = foodCrisisKey(factionId);
            for (const [npcId, entry] of Object.entries(next.npcs)) {
                if (entry.factionId !== factionId) { continue; }

                upsertNeed(
                    entry,
                    makeNeedId('need_food', npcId, factionId),
                    crisisKey,
                    () => ({
                        id: makeNeedId('need_food', npcId, factionId),
                        type: 'material',
                        description: '食料の確保が急務',
                        urgency: FOOD_CRISIS_URGENCY,
                        relatedEventId: crisisKey,
                    }),
                    (existing) => {
                        existing.urgency = clamp(
                            existing.urgency + FOOD_CRISIS_URGENCY_INCREMENT,
                            0, 95
                        );
                    }
                );
                updatedIds.add(npcId);
            }
        }

        // ── Scenario B: region danger rising ────────────────────────────────
        if (event.category === 'region' && event.regionId && event.mapHighlight) {
            const regionId = event.regionId;
            const safetyKey = regionSafetyKey(regionId);
            const locIds = regionLocationIds.get(regionId);
            if (!locIds) { continue; }

            for (const [npcId, entry] of Object.entries(next.npcs)) {
                if (!entry.locationId || !locIds.has(entry.locationId)) { continue; }

                upsertNeed(
                    entry,
                    makeNeedId('need_safety', npcId, regionId),
                    safetyKey,
                    () => ({
                        id: makeNeedId('need_safety', npcId, regionId),
                        type: 'emotional',
                        description: `地域が不安定化している (${regionId})`,
                        urgency: SAFETY_URGENCY_BASE,
                        relatedEventId: safetyKey,
                    }),
                    (existing) => {
                        existing.urgency = clamp(existing.urgency + 10, 0, 90);
                    }
                );
                updatedIds.add(npcId);
            }
        }
    }

    return { registry: next, updatedIds: [...updatedIds] };
}

// ---------------------------------------------------------------------------
// Utility: extract regionIds that should be highlighted on the map
// ---------------------------------------------------------------------------

/**
 * Returns the set of regionIds that have a recent event with mapHighlight=true.
 * Used by worldMapGenerator to add 🔥 to subgraph labels.
 */
export function extractHighlightRegionIds(events: WorldChangeEvent[]): Set<string> {
    const ids = new Set<string>();
    for (const ev of events) {
        if (ev.mapHighlight && ev.regionId) { ids.add(ev.regionId); }
    }
    return ids;
}
