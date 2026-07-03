import type { WorldChangeEvent } from './worldEventLogCore';
import { pruneExpiredEvents } from './worldEventLogCore';
import type { QuestHook } from './worldStateCore';

/** Cap lorebook / memory hint text injected into GM prompts. */
export const MAX_HINT_TEXT_CHARS = 6000;

/** Max world-change lines injected after a simulation step. */
export const MAX_WORLD_CHANGE_SUMMARY_LINES = 4;

export type PromptBudgetMode = 'auto' | 'compact' | 'balanced' | 'expanded';
export type ResolvedPromptBudgetMode = 'compact' | 'balanced' | 'expanded';
export type PromptBudgetContextTier = 'small' | 'large';

export interface PromptBudgetPolicy {
    mode: ResolvedPromptBudgetMode;
    requestedMode: PromptBudgetMode;
    targetTokens: number;
    hintChars: number;
    summaryChars: number;
    sagaChapters: number;
    sagaChars: number;
    memoryMatches: number;
    memoryChars: number;
    loreMatches: number;
    loreChars: number;
    partyFieldChars: number;
    partyExampleChars: number;
    dynamicProfileChars: number;
    worldFactionCount: number;
    worldLoreCount: number;
    worldStateFactionCount: number;
    worldEventCount: number;
    worldChangeCount: number;
    npcCountWithLocation: number;
    npcCountWithoutLocation: number;
    npcMemoryChars: number;
    npcHintChars: number;
    visionChars: number;
    chronicleChars: number;
}

const PROMPT_BUDGET_PRESETS: Record<ResolvedPromptBudgetMode, Omit<PromptBudgetPolicy, 'mode' | 'requestedMode'>> = {
    compact: {
        targetTokens: 3500,
        hintChars: 3000,
        summaryChars: 1200,
        sagaChapters: 1,
        sagaChars: 1600,
        memoryMatches: 2,
        memoryChars: 900,
        loreMatches: 3,
        loreChars: 900,
        partyFieldChars: 800,
        partyExampleChars: 900,
        dynamicProfileChars: 900,
        worldFactionCount: 3,
        worldLoreCount: 1,
        worldStateFactionCount: 4,
        worldEventCount: 2,
        worldChangeCount: 2,
        npcCountWithLocation: 3,
        npcCountWithoutLocation: 3,
        npcMemoryChars: 80,
        npcHintChars: 220,
        visionChars: 800,
        chronicleChars: 400
    },
    balanced: {
        targetTokens: 7000,
        hintChars: 6000,
        summaryChars: 2500,
        sagaChapters: 2,
        sagaChars: 3200,
        memoryMatches: 3,
        memoryChars: 1600,
        loreMatches: 5,
        loreChars: 1600,
        partyFieldChars: 1400,
        partyExampleChars: 1600,
        dynamicProfileChars: 1600,
        worldFactionCount: 4,
        worldLoreCount: 2,
        worldStateFactionCount: 6,
        worldEventCount: 3,
        worldChangeCount: 3,
        npcCountWithLocation: 3,
        npcCountWithoutLocation: 4,
        npcMemoryChars: 100,
        npcHintChars: 320,
        visionChars: 1200,
        chronicleChars: 800
    },
    expanded: {
        targetTokens: 12000,
        hintChars: 9000,
        summaryChars: 5000,
        sagaChapters: 3,
        sagaChars: 6000,
        memoryMatches: 5,
        memoryChars: 2500,
        loreMatches: 8,
        loreChars: 2500,
        partyFieldChars: 2400,
        partyExampleChars: 3000,
        dynamicProfileChars: 3000,
        worldFactionCount: 8,
        worldLoreCount: 4,
        worldStateFactionCount: 10,
        worldEventCount: 5,
        worldChangeCount: 4,
        npcCountWithLocation: 4,
        npcCountWithoutLocation: 6,
        npcMemoryChars: 140,
        npcHintChars: 480,
        visionChars: 2200,
        chronicleChars: 1200
    }
};

export function normalizePromptBudgetMode(value: unknown): PromptBudgetMode {
    return value === 'compact' || value === 'balanced' || value === 'expanded' || value === 'auto'
        ? value
        : 'auto';
}

export function resolvePromptBudgetPolicy(
    requestedMode: unknown,
    contextTier: PromptBudgetContextTier,
    targetTokensOverride = 0
): PromptBudgetPolicy {
    const normalized = normalizePromptBudgetMode(requestedMode);
    const resolvedMode: ResolvedPromptBudgetMode =
        normalized === 'auto'
            ? contextTier === 'large' ? 'balanced' : 'compact'
            : normalized;
    const preset = PROMPT_BUDGET_PRESETS[resolvedMode];
    const targetTokens = Number.isFinite(targetTokensOverride) && targetTokensOverride > 0
        ? Math.max(1000, Math.min(100000, Math.floor(targetTokensOverride)))
        : preset.targetTokens;
    return {
        ...preset,
        mode: resolvedMode,
        requestedMode: normalized,
        targetTokens
    };
}

export function clampTextForPrompt(value: unknown, maxChars: number): string {
    const text = String(value ?? '').trim();
    if (!text) {
        return '';
    }
    const limit = Math.max(0, Math.floor(maxChars));
    if (limit === 0) {
        return '';
    }
    if (text.length <= limit) {
        return text;
    }
    if (limit <= 3) {
        return text.slice(0, limit);
    }
    return `${text.slice(0, limit - 3)}...`;
}

/**
 * Build hint text from recent entry contents + current player action.
 * Truncates from the start of history when over budget; player action is preserved.
 */
export function buildHintTextFromContents(
    recentContents: string[],
    playerAction: string,
    maxChars: number = MAX_HINT_TEXT_CHARS
): string {
    const actionPart = (playerAction || '').trim();
    const recentJoined = recentContents.map((c) => (c || '').trim()).filter(Boolean).join('\n');
    if (!recentJoined) {
        return actionPart.slice(0, maxChars);
    }
    const raw = `${recentJoined}\n${actionPart}`;
    if (raw.length <= maxChars) {
        return raw;
    }
    const budget = Math.max(0, maxChars - actionPart.length - 1);
    if (budget <= 0) {
        return actionPart.slice(0, maxChars);
    }
    let recent = recentJoined;
    if (recent.length > budget) {
        recent = budget <= 3 ? '.'.repeat(budget) : `...${recent.slice(-(budget - 3))}`;
    }
    return `${recent}\n${actionPart}`;
}

/**
 * Summarize the latest simulation step's non-info world events for GM injection.
 * Skips when that worldTurn summary was already injected (lastInjectedTurn).
 * Returns empty string when nothing noteworthy should be injected.
 */
export function buildWorldChangeSummaryFromChanges(
    recentChanges: WorldChangeEvent[],
    currentWorldTurn: number,
    lastInjectedTurn?: number
): string {
    const pruned = pruneExpiredEvents(recentChanges, currentWorldTurn);
    if (pruned.length === 0) {
        return '';
    }

    const latestTurn = Math.max(...pruned.map((e) => e.worldTurn));
    if (lastInjectedTurn !== undefined && latestTurn <= lastInjectedTurn) {
        return '';
    }

    const stepEvents = pruned.filter(
        (e) => e.worldTurn === latestTurn && e.severity !== 'info'
    );
    if (stepEvents.length === 0) {
        return '';
    }

    const lines = [`[Since Last Visit — World Turn ${latestTurn}]`];
    for (const ev of stepEvents.slice(0, MAX_WORLD_CHANGE_SUMMARY_LINES)) {
        const prefix = ev.severity === 'critical' ? '🔴' : '🟡';
        lines.push(`${prefix} ${ev.message}`);
    }
    lines.push('Reflect these developments naturally in the next narrative beat.');
    return lines.join('\n');
}

/** Latest world turn referenced by buildWorldChangeSummaryFromChanges (for ack after GM send). */
export function resolveWorldChangeSummaryTurn(
    recentChanges: WorldChangeEvent[],
    currentWorldTurn: number,
    lastInjectedTurn?: number
): number | undefined {
    const pruned = pruneExpiredEvents(recentChanges, currentWorldTurn);
    if (pruned.length === 0) {
        return undefined;
    }
    const latestTurn = Math.max(...pruned.map((e) => e.worldTurn));
    if (lastInjectedTurn !== undefined && latestTurn <= lastInjectedTurn) {
        return undefined;
    }
    const hasNotable = pruned.some((e) => e.worldTurn === latestTurn && e.severity !== 'info');
    return hasNotable ? latestTurn : undefined;
}

/**
 * Builds the quest objective string for the GM prompt if there is an active quest.
 */
/** F1 Chronicle: inject-once "[Previously]" block for session resume / new journal content. */
export { buildReputationPromptLine, MAX_REPUTATION_PROMPT_FACTIONS } from './factionReputationCore';
export {
    buildTravelEncounterPromptLines,
    MAX_TRAVEL_ENCOUNTER_LINES,
    type TravelEncounter,
} from './travelEncounterCore';

export function buildChronicleRecapLine(recap: string): string {
    const trimmed = String(recap ?? '').trim();
    if (!trimmed) { return ''; }
    return `[Previously]\n${trimmed}\n(Weave these facts into the opening beat; do not contradict them.)`;
}

export function buildActiveQuestObjective(questHooks?: QuestHook[]): string {
    if (!questHooks) return '';
    const active = questHooks.find(q => q.status === 'active');
    if (!active) return '';
    const title = active.title.slice(0, 120);
    const objective = active.description.slice(0, 600);
    return `[Active Quest]\nTitle: ${title}\nObjective: ${objective}\n(GM MUST advance or react to this quest if the player pursues it.)`;
}

export const MAX_FOG_PROMPT_REGION_NAMES = 5;
export const MAX_FOG_PROMPT_CHARS = 120;

/** Cartography C9: one-line GM instruction for cartographyReveal channel. */
/** Layer B: GM may advance world simulation when player rests or travels. */
export const ELAPSED_WORLD_TURNS_PROMPT_LINE =
    'When the player explicitly rests overnight or travels for multiple days, '
    + 'set turn_result.elapsedWorldTurns (1–100) for world simulation steps. '
    + 'Narrate the passage in the same turn. FoW does not clear from time alone; '
    + 'use cartographyReveal or location visits for map discovery.';

export const CARTOGRAPHY_REVEAL_PROMPT_LINE =
    'When the player obtains a map, hears a named distant region, or receives location intel, '
    + 'you MAY reveal it via turn_result.cartographyReveal.regions '
    + '(strength "discovered" for a real map, "rumored" for hearsay). Narrate in the same turn. '
    + 'Max 3 regions per turn. Do NOT use statePatch /world for FoW.';

/** LW1: dedicated tradeOps channel (C9 cartographyReveal pattern). */
export const TRADE_OPS_PROMPT_LINE =
    'When the player buys or sells goods at a market, set turn_result.tradeOps '
    + '(max 16): [{ "op": "buy"|"sell", "marketLocationId": "<locationId>", '
    + '"commodityId": "<id>", "qty": <1-999> }]. Core applies prices, stock, credits, and cargo; '
    + 'narrate negotiation only — do not invent final numbers.';

/** LW2: GM-confirmed NPC relocations (world sim may also move NPCs). */
export const NPC_AGENCY_OPS_PROMPT_LINE =
    'When an NPC must relocate for story or mechanical reasons, set turn_result.npcAgencyOps '
    + '(max 10): [{ "npcId": "<id>", "locationId": "<locationId>", "arrivesTurn": <worldTurn> }]. '
    + 'Core reconciles with registry and world sim.';

/** LW3: NPC-to-NPC bonds evolve deterministically; GM may nudge via relationshipOps. */
export const RELATIONSHIP_OPS_PROMPT_LINE =
    'NPC-to-NPC bonds ([Living World — Bonds]) evolve from world events (co-location, shared '
    + 'crises, faction conflict) — treat them as hearsay to narrate, never invent numeric values. '
    + 'Only when the story itself decisively changes a bond (betrayal, sworn oath), set '
    + 'turn_result.relationshipOps: [{ "a": "<npcId>", "b": "<npcId>", "delta": <-100..100>, '
    + '"reason": "manual" }]. Do not exceed 2 ops per turn.';

const FOG_PROMPT_SUFFIX = '. Do not narrate their interiors as known facts.';

/**
 * One-line GM FoW summary (Phase 8 PR6). Empty when all regions are discovered.
 */
export function buildFogUnexploredPromptLine(
    regionNames: readonly string[],
    maxNames = MAX_FOG_PROMPT_REGION_NAMES,
    maxChars = MAX_FOG_PROMPT_CHARS
): string {
    if (regionNames.length === 0) { return ''; }

    const prefix = 'Unexplored (player has not been): ';
    const overflow = Math.max(0, regionNames.length - maxNames);
    let names = [...regionNames.slice(0, maxNames)];

    const buildLine = (): string => {
        const list = names.join(', ');
        const overflowSuffix = overflow > 0 ? `, …and ${overflow} more` : '';
        return `${prefix}${list}${overflowSuffix}${FOG_PROMPT_SUFFIX}`;
    };

    let line = buildLine();
    while (line.length > maxChars && names.length > 1) {
        names = names.slice(0, -1);
        line = buildLine();
    }

    if (line.length > maxChars) {
        line = line.slice(0, maxChars).trimEnd();
        if (!line.endsWith('.')) { line += '.'; }
    }

    return line;
}

/** Prompt block with eviction priority (higher = keep longer when over global budget). */
export interface PromptContextChunkSpec {
    id: string;
    text: string;
    priority: number;
}

/** Lower numbers are evicted first when total context exceeds targetChars. */
export const PROMPT_CHUNK_PRIORITIES: Record<string, number> = {
    gameRules: 100,
    director: 95,
    chronicle: 90,
    summary: 85,
    party: 80,
    partyDirector: 75,
    travelEncounters: 70,
    livingWorldTravel: 72,
    worldState: 68,
    livingWorldNpcBonds: 62,
    livingWorldPlayerBonds: 61,
    worldChangeSummary: 66,
    worldForge: 65,
    npcRegistry: 55,
    saga: 50,
    memory: 45,
    lorebook: 40,
    vision: 35,
};

export function resolvePromptChunkPriority(id: string): number {
    return PROMPT_CHUNK_PRIORITIES[id] ?? 50;
}

/**
 * Enforce a global char budget by dropping or truncating lowest-priority blocks first.
 * Returns chunk texts in original assembly order (empty chunks omitted).
 */
export function evictPromptChunksByBudget(
    chunks: PromptContextChunkSpec[],
    targetChars: number
): string[] {
    const limit = Math.max(0, Math.floor(targetChars));
    const working = chunks
        .map((c) => ({
            ...c,
            text: String(c.text ?? '').trim(),
            priority: Number.isFinite(c.priority) ? c.priority : resolvePromptChunkPriority(c.id),
        }))
        .filter((c) => c.text.length > 0);

    if (working.length === 0) {
        return [];
    }

    let total = working.reduce((sum, c) => sum + c.text.length, 0);
    if (total <= limit) {
        return working.map((c) => c.text);
    }

    const order = [...working].sort((a, b) => a.priority - b.priority);
    for (const victim of order) {
        if (total <= limit) {
            break;
        }
        const idx = working.findIndex((c) => c.id === victim.id);
        if (idx < 0) {
            continue;
        }
        const current = working[idx];
        const excess = total - limit;
        if (current.text.length <= excess) {
            total -= current.text.length;
            working.splice(idx, 1);
            continue;
        }
        const keep = Math.max(0, current.text.length - excess);
        const trimmed = keep <= 3
            ? ''
            : `${current.text.slice(0, keep - 20)}...[truncated]`;
        total -= current.text.length - trimmed.length;
        if (!trimmed) {
            working.splice(idx, 1);
        } else {
            working[idx] = { ...current, text: trimmed };
        }
    }

    return working.map((c) => c.text);
}
