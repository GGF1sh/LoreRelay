import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import type { ProfileUpdate } from './types/GameState';
import {
    t,
    getConfiguredLocale,
    type SupportedLocale
} from './i18n';
import { buildSagaPromptContext, matchMemories, type MemoryChunk } from './memoryBank';
import {
    computeArchiveMilestone,
    getArchiveRemindStep,
    getArchiveThreshold,
    getContextTier,
    isArchiveAutoPromptEnabled,
    supportsArchivePrompt
} from './archivePrompt';
import { isValidCharacterId } from './characterId';
import { getWorkspacePath, getGameStatePath, getGmProvider, writeJsonAtomic } from './workspacePaths';
import { getCachedGameState, getGameEntryHistory } from './gameStateSync';
import { getGmBridgeOutputChannel } from './gmBridgeRunner';
import {
    getMemoryBackendSetting,
    resolveGmBridgeScript,
    resolvePythonCommand,
    runSkillScript
} from './skillScriptRunner';
import { loadGameRules } from './gameRules';
import { flushScheduledCommercePersist } from './livingWorldCommercePersist';
import {
    getCharactersDir,
    getPartyIds,
    loadCharacterById,
    loadDynamicProfiles
} from './characterManager';
import { type LorebookEntry, matchEntriesAgainstText } from './lorebookMatcher';
import { loadScenarioDirector } from './scenarioDirector';
import { loadPartyDirector } from './partyDirector';
import type { RelationshipType } from './partyDirectorCore';
import { loadNpcRegistry } from './npcRegistry';
import { loadWorldForge, loadWorldForgeDocument, resolveCurrentLocation, isWorldForgeEnabled } from './worldForge';
import {
    buildLivingWorldBondPromptBlocks,
    buildLivingWorldGmLines,
    livingWorldEnabled,
    resolveCommerceForge,
} from './livingWorldBridge';
import { TRUST_WHEREABOUTS_EXACT_MIN, TRUST_WHEREABOUTS_UNKNOWN_MAX } from './npcWhereaboutsTrustCore';
import { loadWorldState, isWorldStateEnabled, markWorldChangeSummaryInjected, markChronicleInjected } from './worldState';
import {
    buildHintTextFromContents,
    buildWorldChangeSummaryFromChanges,
    resolveWorldChangeSummaryTurn,
    buildActiveQuestObjective,
    buildChronicleRecapLine,
    buildReputationPromptLine,
    buildTravelEncounterPromptLines,
    MAX_REPUTATION_PROMPT_FACTIONS,
    MAX_TRAVEL_ENCOUNTER_LINES,
    type TravelEncounter,
    clampTextForPrompt,
    resolvePromptBudgetPolicy,
    type PromptBudgetPolicy,
    buildFogUnexploredPromptLine,
    CARTOGRAPHY_REVEAL_PROMPT_LINE,
    buildNarrativeTimePromptBlock,
    TRADE_OPS_PROMPT_LINE,
    NPC_AGENCY_OPS_PROMPT_LINE,
    RELATIONSHIP_OPS_PROMPT_LINE,
    evictPromptChunksByBudget,
    clampSimulationPromptModule,
    resolvePromptChunkPriority,
    type PromptContextChunkSpec,
} from './gmPromptBuilderCore';
import {
    buildChronicle,
    buildChronicleRecap,
    shouldInjectChronicle,
    resolveChronicleSourceTurn,
    DEFAULT_CHRONICLE_RECAP_LINES,
} from './chronicleCore';
import { readJournalTurnsFromPath } from './chronicleLoader';
import {
    analyzeRecentPacing,
    buildPacingHintLine,
    DEFAULT_PACING_DOMINANCE_THRESHOLD,
    DEFAULT_PACING_WINDOW_SIZE,
    type Beat,
} from './pacingCore';
import { parseNarrativeTimePassage } from './narrativeTimePassageCore';
import {
    findRegionPath,
    rollTravelEncounters,
    type EncounterDensity,
} from './travelEncounterCore';
import { cargoWeight } from './commerceCore';
import { planTravel, resolveTransportForTheme } from './transportCore';
import { buildDomainPromptContext } from './domainBridge';
import { buildGuildPromptContext } from './guildBridge';
import { buildCampaignKitPromptContext } from './campaignKit';
import { buildCampaignJobBoardPromptContext } from './campaignKitBridge';
import { buildDiscoveryLedgerPromptContext } from './discoveryLedger';
import { buildCampaignResourcesPromptContext } from './campaignResources';
import type { CargoEntry } from './livingWorldTypes';
import { listUnexploredRegionNames } from './fogOfWarCore';
import { pruneExpiredEvents } from './worldEventLogCore';
import { getVisualMemoryEntry } from './visualMemory';
import { buildVisualContextSnippet } from './visualMemoryCore';
import { isVlmEnabled } from './vlmQueue';
import { sanitizeVlmDescription } from './vlmQueueCore';
import {
    buildSection,
    finalizeBreakdown,
    previewText,
    type PromptContextBreakdown,
    type PromptLoreMatch,
    type PromptMemoryMatch,
    type PromptBudgetLimitSpec
} from './promptContext';

export interface GmPromptBuilderDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
    onArchiveNow: () => void | Promise<void>;
}

let deps: GmPromptBuilderDeps | undefined;
let lastArchivePromptMilestone = 0;

export function initGmPromptBuilder(builderDeps: GmPromptBuilderDeps): void {
    deps = builderDeps;
}

function requireDeps(): GmPromptBuilderDeps {
    if (!deps) {
        throw new Error('initGmPromptBuilder must be called before using GM prompt builder');
    }
    return deps;
}

export function resetArchivePromptMilestone(value = 0): void {
    lastArchivePromptMilestone = value;
}

export function computeAndSetArchiveMilestone(count: number, threshold: number, remindStep: number): void {
    lastArchivePromptMilestone =
        computeArchiveMilestone(count, threshold, remindStep) ?? 0;
}

function gmLanguageName(locale?: SupportedLocale): string {
    const loc = locale ?? getConfiguredLocale();
    return t(`gm.languageName.${loc}`, undefined, loc);
}

function readGameStateForPrompt(): Record<string, unknown> | undefined {
    const cached = getCachedGameState();
    if (cached) {
        return cached;
    }
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

function loadStorySummary(): string {
    const state = readGameStateForPrompt();
    if (!state) {
        return '';
    }
    return typeof state.summary === 'string' ? state.summary.trim() : '';
}

function getPromptBudgetPolicy(): PromptBudgetPolicy {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const provider = getGmProvider();
    const orModel = config.get<string>('gmBridge.openRouter.model', '');
    const tier = getContextTier(provider, orModel);
    return resolvePromptBudgetPolicy(
        config.get<string>('promptBudget.mode', 'auto'),
        tier,
        config.get<number>('promptBudget.maxTokens', 0)
    );
}

function buildPromptBudgetLimitSpecs(policy: PromptBudgetPolicy): PromptBudgetLimitSpec[] {
    const npcCount = Math.max(policy.npcCountWithLocation, policy.npcCountWithoutLocation);
    return [
        { id: 'campaignKit', label: 'Campaign Kit', limitChars: 1800 },
        { id: 'discoveryLedger', label: 'Discoveries', limitChars: 1200 },
        { id: 'campaignJobBoard', label: 'Campaign Job Board', limitChars: 1400 },
        { id: 'campaignResources', label: 'Campaign Resources', limitChars: 900 },
        { id: 'summary', label: 'Story Synopsis', limitChars: policy.summaryChars },
        { id: 'saga', label: 'Saga Archive', limitChars: policy.sagaChars },
        { id: 'memory', label: 'Memory Bank', limitChars: policy.memoryMatches * policy.memoryChars },
        { id: 'lorebook', label: 'Lorebook', limitChars: policy.loreMatches * policy.loreChars },
        {
            id: 'party',
            label: 'Party',
            limitChars: (policy.partyFieldChars * 5) + policy.partyExampleChars + policy.dynamicProfileChars
        },
        {
            id: 'worldForge',
            label: 'World',
            limitChars: 1000 + (policy.worldFactionCount * 280) + (policy.worldLoreCount * 220)
        },
        {
            id: 'worldState',
            label: 'World State',
            limitChars: 800 + (policy.worldStateFactionCount * 160) + (policy.worldEventCount * 220) + (policy.worldChangeCount * 220)
        },
        {
            id: 'npcRegistry',
            label: 'NPC Awareness',
            limitChars: npcCount * ((policy.npcMemoryChars * 3) + policy.npcHintChars + 360)
        },
        { id: 'vision', label: 'Vision', limitChars: policy.visionChars }
    ];
}

let lorebookCachePath = '';
let lorebookCacheMtime = 0;
let lorebookCacheEntries: LorebookEntry[] = [];

function loadAllLorebookEntriesRaw(): LorebookEntry[] {
    const ws = getWorkspacePath();
    if (!ws) {
        return [];
    }
    const candidates = [path.join(ws, 'lorebook.json'), path.join(ws, 'world_info.json')];
    for (const p of candidates) {
        if (!fs.existsSync(p)) {
            continue;
        }
        try {
            const mtime = fs.statSync(p).mtimeMs;
            if (p === lorebookCachePath && mtime === lorebookCacheMtime) {
                return lorebookCacheEntries;
            }
            const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (Array.isArray(raw.entries)) {
                lorebookCachePath = p;
                lorebookCacheMtime = mtime;
                lorebookCacheEntries = raw.entries as LorebookEntry[];
                return lorebookCacheEntries;
            }
        } catch {
            /* try next */
        }
    }
    return [];
}

function resolveLorebookForPrompt(hintText: string, maxEntries = 5): LorebookEntry[] {
    const enabled = loadAllLorebookEntriesRaw().filter((e) => e.enabled !== false);
    const pinned = enabled.filter((e) => e.pinned === true);
    const pinnedIds = new Set(pinned.map((e) => e.id).filter(Boolean));
    const keywordPool = enabled.filter((e) => !e.pinned);
    const matched = matchEntriesAgainstText(keywordPool, hintText, maxEntries);
    const merged = [
        ...pinned,
        ...matched.filter((m) => !m.id || !pinnedIds.has(m.id))
    ];
    return merged.slice(0, Math.max(1, maxEntries));
}

function matchLorebookEntries(text: string, maxEntries = 5): LorebookEntry[] {
    return resolveLorebookForPrompt(text, maxEntries);
}

function resolveMemoriesViaPython(ws: string, hintText: string, backend: string, maxResults: number): MemoryChunk[] {
    const scriptPath = resolveGmBridgeScript('memory_bank.py');
    if (!scriptPath) {
        return [];
    }
    const python = resolvePythonCommand();
    const result = spawnSync(
        python,
        [
            scriptPath,
            '--cwd', ws,
            '--resolve',
            '--json',
            '--text', hintText,
            '--max', String(Math.max(1, maxResults)),
            '--backend', backend
        ],
        { encoding: 'utf-8', timeout: 15000 }
    );
    if (result.status !== 0 || !result.stdout?.trim()) {
        return [];
    }
    try {
        const parsed = JSON.parse(result.stdout.trim());
        return Array.isArray(parsed) ? parsed as MemoryChunk[] : [];
    } catch {
        return [];
    }
}

function formatMemoryPromptFromChunks(matches: MemoryChunk[], maxCharsPerMatch: number): string {
    if (matches.length === 0) {
        return '';
    }
    const parts = ['[Memory Bank — relevant memories]'];
    for (const m of matches) {
        parts.push(`--- ${m.label || m.id} (${m.source}) ---`);
        parts.push(clampTextForPrompt(m.text, maxCharsPerMatch));
    }
    return parts.join('\n');
}

function buildMemoryContextForPrompt(ws: string, hintText: string, policy: PromptBudgetPolicy): string {
    const backend = getMemoryBackendSetting();
    if (backend === 'tfidf') {
        return formatMemoryPromptFromChunks(
            matchMemories(ws, hintText, policy.memoryMatches),
            policy.memoryChars
        );
    }
    const viaPy = formatMemoryPromptFromChunks(
        resolveMemoriesViaPython(ws, hintText, backend, policy.memoryMatches),
        policy.memoryChars
    );
    if (viaPy) {
        return viaPy;
    }
    return formatMemoryPromptFromChunks(
        matchMemories(ws, hintText, policy.memoryMatches),
        policy.memoryChars
    );
}

function relationshipLabel(rel: RelationshipType): string {
    return rel;
}

function buildPartyPromptContext(policy: PromptBudgetPolicy): string {
    const dynProfiles = loadDynamicProfiles();
    const ids = getPartyIds();
    if (ids.length === 0) {
        return '';
    }
    const lines = ['[Party Members]'];
    const pushField = (label: string, value: unknown, maxChars: number): void => {
        const clipped = clampTextForPrompt(value, maxChars);
        if (clipped) {
            lines.push(`${label}: ${clipped}`);
        }
    };
    for (const id of ids) {
        const char = loadCharacterById(id);
        if (!char) {
            continue;
        }
        lines.push(`--- ${char.name} (ID: ${id}) ---`);
        pushField('Description', char.description, policy.partyFieldChars);
        pushField('Personality', char.personality, policy.partyFieldChars);
        const src = char.stSource;
        if (src?.scenario) {
            pushField('Scenario', src.scenario, policy.partyFieldChars);
        }
        if (src?.system_prompt) {
            pushField('Character rules', src.system_prompt, policy.partyFieldChars);
        }
        if (src?.first_mes) {
            pushField('Opening line hint', src.first_mes, policy.partyFieldChars);
        }
        if (src?.mes_example) {
            const clipped = clampTextForPrompt(src.mes_example, policy.partyExampleChars);
            if (clipped) {
                lines.push(`Example dialogue:\n${clipped}`);
            }
        }
        if (dynProfiles[id]) {
            pushField('Dynamic memory', dynProfiles[id], policy.dynamicProfileChars);
        }
    }
    lines.push('Have party members react in character, converse with each other, and adapt gear to the current world theme.');
    return lines.join('\n');
}

function buildPartyDirectorPromptContext(): string {
    const director = loadPartyDirector();
    if (!director) {
        return '';
    }
    const lines = ['[Party Director — NPC speech & relationships]'];
    const g = director.global;
    if (!g.npcBanterEnabled) {
        lines.push('NPC banter: OFF — party NPCs speak only when addressed or plot-critical.');
    } else {
        lines.push('NPC banter: ON — allow natural party dialogue when pacing fits.');
    }
    if (g.combatQuietMode) {
        lines.push('Combat quiet mode: ON — minimize cross-talk during tense combat turns.');
    }
    if (director.notes) {
        lines.push(`Director notes: ${director.notes}`);
    }

    const idToName = new Map<string, string>();
    for (const id of Object.keys(director.members)) {
        const char = loadCharacterById(id);
        idToName.set(id, char?.name || id);
    }

    for (const [id, cfg] of Object.entries(director.members)) {
        const name = idToName.get(id) || id;
        const tags: string[] = [];
        if (cfg.muted) {
            tags.push('MUTED — do not give this character dialogue unless the player addresses them');
        }
        if (cfg.forceSpeak) {
            tags.push('FORCE SPEAK — include a brief in-character line this turn if possible');
        }
        if (!cfg.muted && !cfg.forceSpeak) {
            if (cfg.verbosity <= 20) {
                tags.push('verbosity: low — rare optional lines only');
            } else if (cfg.verbosity >= 80) {
                tags.push('verbosity: high — frequent reactions and banter');
            } else {
                tags.push(`verbosity: ${cfg.verbosity}/100`);
            }
        }
        lines.push(`--- ${name} (${id}) ---`);
        if (tags.length > 0) {
            lines.push(tags.join('; '));
        }
        const relParts = Object.entries(cfg.relationships)
            .filter(([otherId]) => otherId !== id)
            .map(([otherId, rel]) => `${idToName.get(otherId) || otherId}: ${relationshipLabel(rel)}`);
        if (relParts.length > 0) {
            lines.push(`Relationships: ${relParts.join('; ')}`);
        }
    }
    lines.push('Respect muted/verbosity flags. Use relationship tone when NPCs address each other.');
    return lines.join('\n');
}

function formatTravelEncounterLine(enc: TravelEncounter): string {
    const locale = getConfiguredLocale();
    const key = `gm.travel.encounter.${enc.templateId}`;
    const localized = t(key, { region: enc.regionName ?? enc.regionId }, locale);
    if (localized && localized !== key) {
        return localized;
    }
    return enc.text;
}

function buildTravelEncounterPromptContext(playerAction: string): string {
    const rules = loadGameRules();
    if (!rules.enableTravelEncounters || !isWorldForgeEnabled()) {
        return '';
    }
    const forge = loadWorldForge();
    if (!forge) { return ''; }

    const locations = forge.geography.locations.map((loc) => ({
        id: loc.id,
        name: loc.name
    }));
    const passage = parseNarrativeTimePassage(playerAction, locations);
    if (!passage || passage.kind !== 'travel' || !passage.locationId) {
        return '';
    }

    const gameState = readGameStateForPrompt();
    const world = gameState?.world as Record<string, unknown> | undefined;
    const currentLocationId = typeof world?.currentLocationId === 'string'
        ? world.currentLocationId
        : undefined;
    const fromLoc = forge.geography.locations.find((l) => l.id === currentLocationId);
    const toLoc = forge.geography.locations.find((l) => l.id === passage.locationId);
    const fromRegionId = fromLoc?.regionId;
    const toRegionId = toLoc?.regionId;
    if (!fromRegionId || !toRegionId) { return ''; }

    const path = findRegionPath(forge.geography.regions, fromRegionId, toRegionId);
    if (!path?.length) { return ''; }

    const worldSeed = forge.meta.worldSeed ?? forge.meta.worldName ?? 'world';
    const density = (rules.travelEncounterDensity ?? 'medium') as EncounterDensity;
    const regionNames: Record<string, string> = {};
    for (const region of forge.geography.regions) {
        regionNames[region.id] = region.name;
    }
    const encounters = rollTravelEncounters({
        worldSeed,
        regions: forge.geography.regions,
        fromRegionId,
        toRegionId,
        travelDays: passage.steps,
        density,
        regionNames
    });
    return buildTravelEncounterPromptLines(
        encounters,
        MAX_TRAVEL_ENCOUNTER_LINES,
        formatTravelEncounterLine
    );
}

function buildLivingWorldTravelPromptContext(playerAction: string): string {
    const rules = loadGameRules();
    if (!rules.enableCommerce || !isWorldForgeEnabled()) {
        return '';
    }
    const forge = loadWorldForge();
    const rawForge = loadWorldForgeDocument();
    const commerce = forge && rawForge ? resolveCommerceForge(forge, rawForge) : undefined;
    if (!forge || !commerce) { return ''; }

    const locations = forge.geography.locations.map((loc) => ({
        id: loc.id,
        name: loc.name
    }));
    const passage = parseNarrativeTimePassage(playerAction, locations);
    if (!passage || passage.kind !== 'travel' || !passage.locationId) {
        return '';
    }

    const gameState = readGameStateForPrompt() as ({
        commerce?: { cargo?: unknown[]; transportId?: string };
        world?: { currentLocationId?: string };
    } | undefined);
    const fromLocationId = typeof gameState?.world?.currentLocationId === 'string'
        ? gameState.world.currentLocationId
        : undefined;
    if (!fromLocationId || fromLocationId === passage.locationId) { return ''; }

    const transport = resolveTransportForTheme(commerce, forge.meta.theme, gameState?.commerce?.transportId);
    if (!transport) { return ''; }
    const cargo = Array.isArray(gameState?.commerce?.cargo) ? gameState.commerce.cargo : [];
    const weight = cargoWeight(commerce, cargo as CargoEntry[]);
    const plan = planTravel({
        fromLocationId,
        toLocationId: passage.locationId,
        locations: forge.geography.locations,
        regions: forge.geography.regions,
        transportId: transport.id,
        forge: commerce,
    }, weight);
    if (!plan) { return ''; }

    const fromName = forge.geography.locations.find((loc) => loc.id === fromLocationId)?.name ?? fromLocationId;
    const toName = forge.geography.locations.find((loc) => loc.id === passage.locationId)?.name ?? passage.locationId;
    const regionPath = plan.regionPath.length > 0 ? ` Region path: ${plan.regionPath.join(' -> ')}.` : '';

    return `[Living World — Travel Plan]
Detected travel intent: ${fromName} -> ${toName}.
Transport: ${plan.transportName}. Estimated duration: ${plan.days} world turn(s). Estimated food cost: ${plan.foodCost}.${regionPath}
If the travel proceeds, set turn_result.elapsedWorldTurns=${plan.days} and include a statePatch replacing /world/currentLocationId with "${passage.locationId}". If the travel is interrupted or cancelled, use the actual elapsedWorldTurns and do not move the final location.`;
}

function buildPacingHintPromptContext(): string {
    const hintInPrompt = vscode.workspace.getConfiguration('textAdventure.pacing')
        .get<boolean>('hintInPrompt', false);
    if (!hintInPrompt) { return ''; }

    const ws = getWorkspacePath();
    if (!ws) { return ''; }

    const windowSize = vscode.workspace.getConfiguration('textAdventure.pacing')
        .get<number>('windowSize', DEFAULT_PACING_WINDOW_SIZE);
    const threshold = vscode.workspace.getConfiguration('textAdventure.pacing')
        .get<number>('dominanceThreshold', DEFAULT_PACING_DOMINANCE_THRESHOLD);
    const journalTurns = readJournalTurnsFromPath(path.join(ws, 'state_journal.ndjson'));
    const pacingWindow = analyzeRecentPacing(journalTurns, windowSize);
    const locale = getConfiguredLocale();
    return buildPacingHintLine(pacingWindow, threshold, (beat: Beat) =>
        t(`gm.pacing.hint.${beat}`, undefined, locale)
    );
}

function buildScenarioDirectorPromptContext(): string {
    const director = loadScenarioDirector();
    const pacingHint = buildPacingHintPromptContext();
    if (!director) {
        return pacingHint;
    }
    const lines = ['[Scenario Director]'];
    if (director.scenarioTitle) {
        lines.push(`Scenario: ${director.scenarioTitle}`);
    }
    if (director.act || director.chapter) {
        lines.push(`Act/Chapter: ${[director.act, director.chapter].filter(Boolean).join(' / ')}`);
    }
    if (director.scene) {
        lines.push(`Scene: ${director.scene}`);
    }
    if (director.objective) {
        lines.push(`Objective: ${director.objective}`);
    }
    if (director.successConditions.length > 0) {
        lines.push(`Success: ${director.successConditions.join('; ')}`);
    }
    if (director.failConditions.length > 0) {
        lines.push(`Fail if: ${director.failConditions.join('; ')}`);
    }
    if (director.guidanceMode === 'sandbox') {
        lines.push('Guidance: sandbox — prioritize player agency; use director beats as optional color only.');
    } else if (director.guidanceMode === 'guided') {
        lines.push('Guidance: guided — follow the objective and scene structure while allowing minor detours.');
    } else if (director.guidanceMode === 'railroad') {
        lines.push('Guidance: railroad — keep the plot on the listed objective and success path.');
    }
    if (director.optionalEncounters.length > 0) {
        lines.push(`Optional encounters: ${director.optionalEncounters.join('; ')}`);
    }
    if (director.achievedEndings && director.achievedEndings.length > 0) {
        lines.push(`Achieved ending flags: ${director.achievedEndings.join(', ')}`);
    }
    if (pacingHint) {
        lines.push(pacingHint);
    }
    return lines.join('\n');
}

function buildNarrativeTimePromptContext(): string {
    const rules = loadGameRules();
    return buildNarrativeTimePromptBlock({ emergentSimulation: rules.enableEmergentSimulation });
}

function buildDomainPromptContextForGm(playerAction: string): string {
    const state = readGameStateForPrompt();
    return buildDomainPromptContext(state, playerAction);
}

function buildGuildPromptContextForGm(playerAction: string): string {
    const state = readGameStateForPrompt();
    return buildGuildPromptContext(state, playerAction);
}

function buildCampaignJobBoardPromptContextForGm(): string {
    const state = readGameStateForPrompt();
    const world = state?.world as { currentLocationId?: string } | undefined;
    const currentLocationId = typeof world?.currentLocationId === 'string'
        ? world.currentLocationId
        : undefined;
    const simWorld = isWorldStateEnabled() ? loadWorldState() : undefined;
    const worldTurn = typeof simWorld?.worldTurn === 'number' ? simWorld.worldTurn : 0;
    return buildCampaignJobBoardPromptContext(currentLocationId, worldTurn);
}

function buildGameRulesPromptContext(): string {
    const rules = loadGameRules();
    const lines = ['[Game Rules]'];
    if (!rules.enableRpgMechanics) {
        lines.push('RPG mechanics (HP/MP numeric tracking) are DISABLED. Focus on narrative flow; omit combat stats unless the player explicitly requests them.');
    } else {
        lines.push(`RPG mechanics ENABLED. Default max HP: ${rules.defaultMaxHp}, max MP: ${rules.defaultMaxMp}. Dice difficulty tone: ${rules.diceDifficulty}. Track HP/MP changes via status patches only when mechanics are relevant.`);
    }

    if (rules.skillCommentary) {
        lines.push('SKILL COMMENTARY ENABLED: Give personalities to the player\'s skills/stats. When a skill check occurs or a skill is relevant, have the skill itself "speak" as a voice in the player\'s head (e.g. "LOGIC [Easy: Success] - That doesn\'t make sense.").');
    }
    if (rules.backgroundSimulation) {
        lines.push('BACKGROUND SIMULATION ENABLED: The world is alive. Even if the player does nothing, time passes, NPCs act on their own agendas, and events occur in the background. Report these changes naturally in the narrative.');
    }
    if (rules.autoLorebookGrowth) {
        lines.push('AUTO LOREBOOK GROWTH ENABLED: The world lore is expanding. If new important nouns (locations, factions, items) are introduced, naturally define them in the narrative so they can be extracted later.');
    }
    if (rules.enableCampaignKit) {
        const kitId = typeof rules.campaignKitId === 'string' && rules.campaignKitId.trim()
            ? rules.campaignKitId.trim()
            : '(theme auto-detect or campaign_kit.json)';
        lines.push(`CAMPAIGN KIT ENABLED (${kitId}): Frame play as hub → jobs/rumors → expedition site → findings → appraisal/services → world reaction. Use discoveryOps for ledger updates.`);
    }

    return lines.join('\n');
}

function buildWorldForgePromptContext(policy: PromptBudgetPolicy): string {
    if (!isWorldForgeEnabled()) { return ''; }
    const forge = loadWorldForge();
    if (!forge) { return ''; }

    const state = readGameStateForPrompt();
    const statusLocation = typeof state?.status === 'object' && state.status !== null
        ? (state.status as Record<string, unknown>).location as string | undefined
        : undefined;
    const worldState = state?.world as Record<string, unknown> | undefined;
    const currentLocationId = typeof worldState?.currentLocationId === 'string'
        ? worldState.currentLocationId
        : undefined;

    const resolvedLoc = currentLocationId
        ? forge.geography.locations.find((l) => l.id === currentLocationId)
        : resolveCurrentLocation(statusLocation);

    const lines = [`[World — ${forge.meta.worldName}]`];
    if (forge.meta.theme) { lines.push(`Theme: ${forge.meta.theme}`); }

    if (resolvedLoc) {
        const region = resolvedLoc.regionId
            ? forge.geography.regions.find((r) => r.id === resolvedLoc.regionId)
            : undefined;
        lines.push(`Player location: ${resolvedLoc.name}${region ? ` (${region.name})` : ''}`);
        if (resolvedLoc.description) { lines.push(`  ${resolvedLoc.description}`); }
        const locParts: string[] = [resolvedLoc.type];
        if (resolvedLoc.population) { locParts.push(`pop.${resolvedLoc.population}`); }
        if (resolvedLoc.factionControl) {
            const fc = forge.factions.find((f) => f.id === resolvedLoc.factionControl);
            locParts.push(`controlled by ${fc?.name ?? resolvedLoc.factionControl}`);
        }
        if (resolvedLoc.services && resolvedLoc.services.length > 0) {
            locParts.push(`services: ${resolvedLoc.services.join(', ')}`);
        }
        lines.push(`  → ${locParts.join(', ')}`);
        if (region?.dangerLevel !== undefined) {
            lines.push(`  Danger: ${region.dangerLevel}/10${region.description ? ` — ${region.description}` : ''}`);
        }
    } else if (statusLocation) {
        lines.push(`Player location: ${statusLocation} (not mapped in world_forge.json)`);
    }

    const fogInPrompt = vscode.workspace.getConfiguration('textAdventure.cartography')
        .get<boolean>('fogInPrompt', false);
    if (fogInPrompt) {
        const discovered = Array.isArray(worldState?.discoveredRegionIds)
            ? (worldState.discoveredRegionIds as string[])
            : [];
        const unexplored = listUnexploredRegionNames(forge, discovered);
        const fogLine = buildFogUnexploredPromptLine(unexplored);
        if (fogLine) { lines.push(fogLine); }
    }

    const revealInPrompt = vscode.workspace.getConfiguration('textAdventure.cartography')
        .get<boolean>('revealInPrompt', false);
    if (revealInPrompt) {
        lines.push(CARTOGRAPHY_REVEAL_PROMPT_LINE);
    }

    const rules = loadGameRules();
    if (rules.enableCommerce) {
        lines.push(TRADE_OPS_PROMPT_LINE);
        const gameState = readGameStateForPrompt() as { commerce?: { food?: number } } | undefined;
        const food = gameState?.commerce?.food;
        if (typeof food === 'number' && food <= 0) {
            lines.push(
                '[Living World — Supplies] Travel rations depleted (food: 0). '
                + 'Narrate hunger risk; further travel cannot consume more food until resupplied.'
            );
        }
    }
    if (rules.enableNpcAgency && rules.enableNpcRegistry) {
        lines.push(NPC_AGENCY_OPS_PROMPT_LINE);
        if (rules.enableNpcRelationships) {
            lines.push(RELATIONSHIP_OPS_PROMPT_LINE);
        }
    }

    if (forge.factions.length > 0) {
        lines.push('Factions:');
        for (const faction of forge.factions.slice(0, policy.worldFactionCount)) {
            const parts: string[] = [faction.type];
            if (faction.power !== undefined) { parts.push(`power:${faction.power}`); }
            let line = `  ${faction.name} (${parts.join(', ')})`;
            if (faction.goals && faction.goals.length > 0) {
                line += ` — ${faction.goals.slice(0, 2).join(', ')}`;
            }
            if (faction.enemies && faction.enemies.length > 0) {
                const enemyNames = faction.enemies
                    .map((eid) => forge.factions.find((f) => f.id === eid)?.name ?? eid)
                    .slice(0, 2).join(', ');
                line += ` [enemy of: ${enemyNames}]`;
            }
            lines.push(line);
        }
    }

    if (forge.loreHistory.length > 0) {
        lines.push('World lore:');
        const recent = forge.loreHistory.slice(-policy.worldLoreCount);
        for (const entry of recent) {
            const prefix = entry.era
                ? `${entry.era}${entry.yearsBefore !== undefined ? ` (-${entry.yearsBefore}yr)` : ''}`
                : entry.yearsBefore !== undefined ? `-${entry.yearsBefore}yr` : '';
            lines.push(`  ${prefix ? `${prefix}: ` : ''}${entry.event}`);
        }
    }

    lines.push('Shape narration, NPC reactions, and world events to reflect this world context.');
    return lines.join('\n');
}

function buildLivingWorldBondPromptContexts(): { npcBonds: string; playerBonds: string } {
    if (!isWorldStateEnabled() || !livingWorldEnabled(loadGameRules())) {
        return { npcBonds: '', playerBonds: '' };
    }
    const worldState = loadWorldState();
    if (!worldState) {
        return { npcBonds: '', playerBonds: '' };
    }
    return buildLivingWorldBondPromptBlocks(worldState, loadNpcRegistry(), loadGameRules());
}

function buildWorldStatePromptContext(policy: PromptBudgetPolicy): string {
    if (!isWorldStateEnabled()) { return ''; }
    const worldState = loadWorldState();
    if (!worldState) { return ''; }

    const forge = isWorldForgeEnabled() ? loadWorldForge() : undefined;
    const lines = [`[World State — Turn ${worldState.worldTurn}]`];

    // 派閥パワー・モラル
    const factionEntries = Object.entries(worldState.factions);
    if (factionEntries.length > 0) {
        const parts: string[] = [];
        for (const [id, fs] of factionEntries.slice(0, policy.worldStateFactionCount)) {
            const name = forge?.factions.find((f) => f.id === id)?.name ?? id;
            const power = Math.round(fs.power);
            const moraleTag = (fs.morale ?? 50) >= 70 ? '↑morale'
                : (fs.morale ?? 50) <= 30 ? '↓morale' : '';
            const recentTag = fs.recentEvents?.[0] ? ` [${fs.recentEvents[0]}]` : '';
            parts.push(`${name} power:${power}${moraleTag ? ` ${moraleTag}` : ''}${recentTag}`);
        }
        lines.push(`Factions: ${parts.join(' | ')}`);
    }

    // アクティブなグローバルイベント
    const activeEvents = worldState.globalEvents ?? [];
    for (const ev of activeEvents.slice(0, policy.worldEventCount)) {
        const remaining = ev.turnsRemaining !== undefined ? `, ${ev.turnsRemaining} turns left` : '';
        lines.push(`⚠ [${ev.severity}] ${ev.description}${remaining}`);
    }

    // 最近のシミュレーション変化（gmHint が設定された warning/critical のみ、最大3件）
    const recentChanges = pruneExpiredEvents(worldState.recentChanges ?? [], worldState.worldTurn);
    const notableChanges = recentChanges
        .filter((c) => c.severity !== 'info' && c.gmHint)
        .slice(-policy.worldChangeCount);
    for (const c of notableChanges) {
        lines.push(`⚡ [${c.category}] ${c.gmHint}`);
    }

    // Active Quest Objective
    const questObjective = buildActiveQuestObjective(worldState.questHooks);
    if (questObjective) {
        lines.push('');
        lines.push(questObjective);
    }

    const rules = loadGameRules();
    const reputationInPrompt = vscode.workspace.getConfiguration('textAdventure.reputation')
        .get<boolean>('inPrompt', false);
    if (rules.enableFactionReputation && reputationInPrompt) {
        const repFactions = factionEntries
            .map(([id, fs]) => ({
                id,
                name: forge?.factions.find((f) => f.id === id)?.name ?? id,
                rep: fs.playerReputation ?? 0
            }))
            .filter((f) => f.rep !== 0);
        const repLine = buildReputationPromptLine(repFactions, MAX_REPUTATION_PROMPT_FACTIONS);
        if (repLine) {
            lines.push('');
            lines.push(repLine);
        }
    }

    if (livingWorldEnabled(rules) && forge) {
        const gameState = readGameStateForPrompt();
        const world = gameState?.world as { currentLocationId?: string } | undefined;
        const playerLoc = typeof world?.currentLocationId === 'string'
            ? world.currentLocationId
            : undefined;
        const commerceState = gameState?.commerce as {
            credits?: number;
            food?: number;
            transportId?: string;
            playerRole?: string;
            cargo?: Array<{ commodityId: string; qty: number }>;
        } | undefined;
        const playerCommerce = (
            rules.enableCommerce
            && commerceState
            && typeof commerceState.credits === 'number'
        )
            ? {
                credits: Math.floor(commerceState.credits),
                food: typeof commerceState.food === 'number' ? Math.floor(commerceState.food) : 30,
                transportId: typeof commerceState.transportId === 'string'
                    ? commerceState.transportId
                    : 'wagon',
                playerRole: (
                    typeof commerceState.playerRole === 'string'
                        ? commerceState.playerRole
                        : rules.playerRole
                ) as import('./livingWorldTypes').PlayerRole,
                cargo: Array.isArray(commerceState.cargo) ? commerceState.cargo : [],
            }
            : undefined;
        const livingLines = buildLivingWorldGmLines(
            forge,
            worldState,
            loadNpcRegistry(),
            rules,
            loadWorldForgeDocument(),
            playerLoc,
            playerCommerce
        );
        if (livingLines) {
            lines.push('');
            lines.push(livingLines);
        }
    }

    lines.push('Weave faction dynamics and world threats into narration where naturally appropriate.');
    return lines.join('\n');
}

function buildNpcRegistryPromptContext(policy: PromptBudgetPolicy): string {
    if (!loadGameRules().enableNpcRegistry) { return ''; }
    const registry = loadNpcRegistry();
    if (Object.keys(registry.npcs).length === 0) { return ''; }

    // currentLocationId フィルタ: 同じ場所にいる NPC を優先、最大3人
    const gameState = readGameStateForPrompt();
    const worldState = gameState?.world as Record<string, unknown> | undefined;
    const currentLocationId = typeof worldState?.currentLocationId === 'string'
        ? worldState.currentLocationId : undefined;

    let entries = Object.entries(registry.npcs);
    if (currentLocationId) {
        // at location first, then no-locationId NPCs, skip others
        const atLocation = entries.filter(([, npc]) => npc.locationId === currentLocationId);
        const noLocation = entries.filter(([, npc]) => !npc.locationId);
        entries = [...atLocation, ...noLocation].slice(0, policy.npcCountWithLocation);
    } else {
        entries = entries.slice(0, policy.npcCountWithoutLocation);
    }
    if (entries.length === 0) { return ''; }

    const lines = ['[NPC Awareness]'];
    let npcCount = 0;
    for (const [id, npc] of entries) {
        if (npcCount >= (currentLocationId ? policy.npcCountWithLocation : policy.npcCountWithoutLocation)) { break; }
        const d = npc.disposition;
        const urgentNeeds = npc.needs.filter((n) => n.urgency >= 31).sort((a, b) => b.urgency - a.urgency);
        const recentMemories = npc.memories.slice(-3);

        const trustLabel = d.playerTrust >= TRUST_WHEREABOUTS_EXACT_MIN ? 'high — willing to share intel'
            : d.playerTrust <= TRUST_WHEREABOUTS_UNKNOWN_MAX ? 'low — guarded and cautious'
            : `${d.playerTrust}/100`;
        const romanceNote = d.playerRomance >= 60 ? ` romance:${d.playerRomance}` : '';
        const fearNote = d.playerFear >= 50 ? ` FEAR:${d.playerFear}` : '';

        lines.push(`--- ${npc.name} (${id}) ---`);
        lines.push(`Disposition: trust=${trustLabel}${romanceNote}${fearNote} mood=${d.mood}`);

        if (urgentNeeds.length > 0) {
            for (const need of urgentNeeds.slice(0, 2)) {
                const urgencyLabel = need.urgency >= 81 ? 'URGENT' : need.urgency >= 61 ? 'HIGH' : 'MED';
                lines.push(`Need [${urgencyLabel}]: ${need.description} (urgency:${need.urgency})`);
            }
        }

        if (recentMemories.length > 0) {
            const memLine = recentMemories
                .map((m) => `"${clampTextForPrompt(m.content, policy.npcMemoryChars)}" [${m.emotionalWeight}]`)
                .join(' / ');
            lines.push(`Memory: ${memLine}`);
        }

        if (npc.dialogueHints) {
            const hint = d.playerTrust >= TRUST_WHEREABOUTS_EXACT_MIN && npc.dialogueHints.highTrust ? npc.dialogueHints.highTrust
                : d.playerTrust <= TRUST_WHEREABOUTS_UNKNOWN_MAX && npc.dialogueHints.lowTrust ? npc.dialogueHints.lowTrust
                : urgentNeeds.length > 0 && urgentNeeds[0].urgency >= 61 && npc.dialogueHints.highUrgency ? npc.dialogueHints.highUrgency
                : d.playerFear >= 50 && npc.dialogueHints.highFear ? npc.dialogueHints.highFear
                : d.playerRomance >= 60 && npc.dialogueHints.romance ? npc.dialogueHints.romance
                : '';
            if (hint) { lines.push(`Hint: ${clampTextForPrompt(hint, policy.npcHintChars)}`); }
        }

        if (npc.personalityTraits && npc.personalityTraits.length > 0) {
            lines.push(`Traits: ${npc.personalityTraits.join(', ')}`);
        }
        npcCount++;
    }
    lines.push('Use disposition/memory/needs to shape NPC tone and what they volunteer to the player.');
    return lines.join('\n');
}

function buildLorebookPromptContext(hintText: string, policy: PromptBudgetPolicy): string {
    const matches = resolveLorebookForPrompt(hintText, policy.loreMatches);
    if (matches.length === 0) {
        return '';
    }
    const parts = ['[Lorebook — matched + pinned entries]'];
    for (const e of matches) {
        const tag = e.pinned ? '📌 ' : '';
        parts.push(`--- ${tag}${e.comment || e.id || 'entry'} ---`);
        parts.push(clampTextForPrompt(e.content, policy.loreChars));
    }
    return parts.join('\n');
}

/** Turn Inspector / turn_result 用に発火したロアブックのラベルを返す。 */
export function getTriggeredLoreLabels(hintText: string, maxEntries = 5): string[] {
    return resolveLorebookForPrompt(hintText, maxEntries).map((e) => {
        const label = String(e.comment || e.id || 'entry').trim();
        return e.pinned ? `📌 ${label}` : label;
    }).filter((label) => label.length > 0);
}

function buildHintText(playerAction: string, policy: PromptBudgetPolicy): string {
    const recent = getGameEntryHistory()
        .filter((e) => !e.excludedFromPrompt)
        .slice(-3)
        .map((e) => e.content);
    return buildHintTextFromContents(recent, playerAction, policy.hintChars);
}

/**
 * Preview for Turn Inspector — does not mark a summary as consumed.
 */
function peekWorldChangeSummaryContext(): string {
    if (!isWorldStateEnabled()) { return ''; }
    const worldState = loadWorldState();
    if (!worldState?.recentChanges?.length) { return ''; }
    return buildWorldChangeSummaryFromChanges(
        worldState.recentChanges,
        worldState.worldTurn,
        worldState.lastInjectedWorldChangeSummaryTurn
    );
}

/**
 * Inject once per simulation worldTurn — marks consumed after building so later GM turns
 * do not repeat the same "[Since Last Visit]" block until the next sim tick.
 */
function consumeWorldChangeSummaryContext(): string {
    if (!isWorldStateEnabled()) { return ''; }
    const worldState = loadWorldState();
    if (!worldState?.recentChanges?.length) { return ''; }
    const summary = buildWorldChangeSummaryFromChanges(
        worldState.recentChanges,
        worldState.worldTurn,
        worldState.lastInjectedWorldChangeSummaryTurn
    );
    if (!summary) { return ''; }
    const turn = resolveWorldChangeSummaryTurn(
        worldState.recentChanges,
        worldState.worldTurn,
        worldState.lastInjectedWorldChangeSummaryTurn
    );
    if (turn !== undefined) {
        markWorldChangeSummaryInjected(turn);
    }
    return summary;
}

let chronicleSessionPending = true;

/** Reset on extension activate so the first GM turn after resume can inject recap. */
export function resetChronicleSessionPending(): void {
    chronicleSessionPending = true;
}

function peekChronicleSessionPending(): boolean {
    return chronicleSessionPending;
}

function clearChronicleSessionPending(): void {
    chronicleSessionPending = false;
}

function buildChronicleRecapContext(consume: boolean, policy: PromptBudgetPolicy): string {
    const recapInPrompt = vscode.workspace.getConfiguration('textAdventure.chronicle')
        .get<boolean>('recapInPrompt', false);
    if (!recapInPrompt) { return ''; }

    const ws = getWorkspacePath();
    if (!ws) { return ''; }

    const journalTurns = readJournalTurnsFromPath(path.join(ws, 'state_journal.ndjson'));
    const sourceTurn = resolveChronicleSourceTurn(journalTurns.length);
    if (sourceTurn <= 0) { return ''; }

    const worldState = loadWorldState();
    const lastInjected = worldState?.lastInjectedChronicleTurn;
    const sessionPending = peekChronicleSessionPending();
    if (!shouldInjectChronicle(sourceTurn, lastInjected, sessionPending)) {
        return '';
    }

    const maxRecapLines = vscode.workspace.getConfiguration('textAdventure.chronicle')
        .get<number>('maxRecapLines', DEFAULT_CHRONICLE_RECAP_LINES);
    const chapters = buildChronicle({
        journalTurns,
        recentChanges: worldState?.recentChanges,
        questHooks: worldState?.questHooks
    });
    const recap = buildChronicleRecap(chapters, maxRecapLines, policy.chronicleChars);
    const line = buildChronicleRecapLine(recap);
    if (!line) { return ''; }

    if (consume) {
        markChronicleInjected(sourceTurn);
        clearChronicleSessionPending();
    }
    return line;
}

function peekChronicleRecapContext(policy: PromptBudgetPolicy): string {
    return buildChronicleRecapContext(false, policy);
}

function consumeChronicleRecapContext(policy: PromptBudgetPolicy): string {
    return buildChronicleRecapContext(true, policy);
}

function resolveMemoryMatches(ws: string, hint: string, policy: PromptBudgetPolicy): MemoryChunk[] {
    const backend = getMemoryBackendSetting();
    if (backend === 'tfidf') {
        return matchMemories(ws, hint, policy.memoryMatches);
    }
    return resolveMemoriesViaPython(ws, hint, backend, policy.memoryMatches);
}

export function buildGmPromptBreakdown(playerAction: string): PromptContextBreakdown {
    const ws = getWorkspacePath();
    const policy = getPromptBudgetPolicy();
    const hint = buildHintText(playerAction, policy);
    const memoryBackend = getMemoryBackendSetting();

    const loreMatches = matchLorebookEntries(hint, policy.loreMatches);
    const matchedLore: PromptLoreMatch[] = loreMatches.map((e) => ({
        id: String(e.id || e.comment || 'entry'),
        label: String(e.comment || e.id || 'entry'),
        preview: previewText(String(e.content || '')),
        keys: Array.isArray(e.keys) ? e.keys.map(String) : []
    }));

    const memoryChunks = ws ? resolveMemoryMatches(ws, hint, policy) : [];
    const memoryMatches: PromptMemoryMatch[] = memoryChunks.map((m) => ({
        id: m.id,
        label: m.label,
        source: m.source,
        preview: previewText(m.text)
    }));

    const lwBonds = buildLivingWorldBondPromptContexts();

    const sections = [
        buildSection('gameRules', 'Game Rules', buildGameRulesPromptContext()),
        buildSection('narrativeTime', 'Narrative Time', buildNarrativeTimePromptContext()),
        buildSection('campaignKit', 'Campaign Kit', buildCampaignKitPromptContext()),
        buildSection('discoveryLedger', 'Discoveries', buildDiscoveryLedgerPromptContext()),
        buildSection('campaignJobBoard', 'Campaign Job Board', buildCampaignJobBoardPromptContextForGm()),
        buildSection('campaignResources', 'Campaign Resources', buildCampaignResourcesPromptContext()),
        buildSection('domain', 'Domain', buildDomainPromptContextForGm(hint)),
        buildSection('guild', 'Guild', buildGuildPromptContextForGm(hint)),
        buildSection('director', 'Scenario Director', buildScenarioDirectorPromptContext()),
        buildSection('chronicle', 'Chronicle Recap', peekChronicleRecapContext(policy)),
        buildSection('summary', 'Story Synopsis', (() => {
            const summary = loadStorySummary();
            return summary ? `[Story Synopsis]\n${clampTextForPrompt(summary, policy.summaryChars)}` : '';
        })()),
        ws ? buildSection('saga', 'Saga Archive', clampTextForPrompt(buildSagaPromptContext(ws, policy.sagaChapters), policy.sagaChars)) : undefined,
        buildSection('party', 'Party', buildPartyPromptContext(policy)),
        buildSection('partyDirector', 'Party Director', buildPartyDirectorPromptContext()),
        ws ? buildSection('memory', 'Memory Bank', buildMemoryContextForPrompt(ws, hint, policy)) : undefined,
        buildSection('travelEncounters', 'Travel Encounters', buildTravelEncounterPromptContext(playerAction)),
        buildSection('livingWorldTravel', 'Living World Travel', buildLivingWorldTravelPromptContext(playerAction)),
        buildSection('worldForge', 'World', buildWorldForgePromptContext(policy)),
        buildSection('worldState', 'World State', buildWorldStatePromptContext(policy)),
        buildSection('livingWorldNpcBonds', 'LW NPC Bonds', lwBonds.npcBonds),
        buildSection('livingWorldPlayerBonds', 'LW Your Bonds', lwBonds.playerBonds),
        buildSection('worldChangeSummary', 'World Changes', peekWorldChangeSummaryContext()),
        buildSection('lorebook', 'Lorebook', buildLorebookPromptContext(hint, policy)),
        buildSection('npcRegistry', 'NPC Awareness', buildNpcRegistryPromptContext(policy)),
        buildSection('vision', 'Vision', buildVisionContext(policy))
    ];

    return finalizeBreakdown(
        sections,
        memoryBackend,
        matchedLore,
        memoryMatches,
        previewText(hint, 240),
        {
            mode: policy.mode,
            requestedMode: policy.requestedMode,
            targetTokens: policy.targetTokens
        },
        buildPromptBudgetLimitSpecs(policy)
    );
}

function pushPromptChunk(
    specs: PromptContextChunkSpec[],
    id: string,
    text: string | undefined
): void {
    const trimmed = (text || '').trim();
    if (!trimmed) {
        return;
    }
    specs.push({
        id,
        text: trimmed,
        priority: resolvePromptChunkPriority(id),
    });
}

function buildGmPromptChunkSpecs(playerAction: string, policy: PromptBudgetPolicy): PromptContextChunkSpec[] {
    const hint = buildHintText(playerAction, policy);
    const ws = getWorkspacePath();
    const specs: PromptContextChunkSpec[] = [];

    pushPromptChunk(specs, 'gameRules', buildGameRulesPromptContext());
    pushPromptChunk(specs, 'narrativeTime', buildNarrativeTimePromptContext());
    pushPromptChunk(specs, 'campaignKit', buildCampaignKitPromptContext());
    pushPromptChunk(specs, 'discoveryLedger', buildDiscoveryLedgerPromptContext());
    pushPromptChunk(specs, 'campaignJobBoard', buildCampaignJobBoardPromptContextForGm());
    pushPromptChunk(specs, 'campaignResources', buildCampaignResourcesPromptContext());
    pushPromptChunk(
        specs,
        'domain',
        clampSimulationPromptModule(buildDomainPromptContextForGm(playerAction))
    );
    pushPromptChunk(
        specs,
        'guild',
        clampSimulationPromptModule(buildGuildPromptContextForGm(playerAction))
    );
    pushPromptChunk(specs, 'director', buildScenarioDirectorPromptContext());
    pushPromptChunk(specs, 'chronicle', consumeChronicleRecapContext(policy));

    const summary = loadStorySummary();
    if (summary) {
        pushPromptChunk(
            specs,
            'summary',
            `[Story Synopsis]\n${clampTextForPrompt(summary, policy.summaryChars)}`
        );
    }

    if (ws) {
        pushPromptChunk(
            specs,
            'saga',
            clampTextForPrompt(buildSagaPromptContext(ws, policy.sagaChapters), policy.sagaChars)
        );
    }

    pushPromptChunk(specs, 'party', buildPartyPromptContext(policy));
    pushPromptChunk(specs, 'partyDirector', buildPartyDirectorPromptContext());

    if (ws) {
        pushPromptChunk(specs, 'memory', buildMemoryContextForPrompt(ws, hint, policy));
    }

    pushPromptChunk(specs, 'travelEncounters', buildTravelEncounterPromptContext(playerAction));
    pushPromptChunk(specs, 'livingWorldTravel', buildLivingWorldTravelPromptContext(playerAction));
    pushPromptChunk(specs, 'worldForge', buildWorldForgePromptContext(policy));
    pushPromptChunk(specs, 'worldState', buildWorldStatePromptContext(policy));
    const lwBonds = buildLivingWorldBondPromptContexts();
    pushPromptChunk(specs, 'livingWorldNpcBonds', lwBonds.npcBonds);
    pushPromptChunk(specs, 'livingWorldPlayerBonds', lwBonds.playerBonds);
    pushPromptChunk(specs, 'worldChangeSummary', consumeWorldChangeSummaryContext());
    pushPromptChunk(specs, 'lorebook', buildLorebookPromptContext(hint, policy));
    pushPromptChunk(specs, 'npcRegistry', buildNpcRegistryPromptContext(policy));
    pushPromptChunk(specs, 'vision', buildVisionContext(policy));

    return specs;
}

export function buildGmPromptContext(playerAction: string): string {
    flushScheduledCommercePersist();
    const policy = getPromptBudgetPolicy();
    const specs = buildGmPromptChunkSpecs(playerAction, policy);
    const targetChars = policy.targetTokens * 4;
    const chunks = evictPromptChunksByBudget(specs, targetChars);
    return chunks.length ? `\n\n${chunks.join('\n\n')}` : '';
}

export function postPromptContextToWebview(playerAction: string): void {
    const panel = requireDeps().getPanel();
    if (!panel) {
        return;
    }
    panel.webview.postMessage({
        type: 'promptContext',
        breakdown: buildGmPromptBreakdown(playerAction)
    });
}

function buildVisionContext(policy: PromptBudgetPolicy): string {
    const state = readGameStateForPrompt();
    if (!state || !state.latestImage) {
        return '';
    }

    // Prefer visual_memory.json entry (has locationId + richer metadata).
    const memEntry = getVisualMemoryEntry(state.latestImage as string);
    if (memEntry) {
        const snippet = clampTextForPrompt(buildVisualContextSnippet(memEntry), policy.visionChars);
        return `[Visual Context (Current Scene Image)]\n${snippet}\nPlease ensure your next narration aligns with these visual elements (e.g., characters present, background details, mood, colors, and lighting).`;
    }

    // Fallback: plain latestImageDescription from game_state.json.
    const safeDesc = clampTextForPrompt(sanitizeVlmDescription(state.latestImageDescription), policy.visionChars);
    if (safeDesc) {
        return `[Visual Context (Current Scene Image)]
The game has generated a visual representation of the current situation. Here is the description of what is depicted in the image:
"${safeDesc}"
Please ensure your next narration aligns with these visual elements (e.g., characters present, background details, mood, colors, and lighting).`;
    }

    if (!isVlmEnabled()) {
        return '';
    }

    return `[Vision Context]\n*A scene image is present; VLM analysis is in progress and will be available on a later turn.*`;
}

export function processProfileUpdates(updates: ProfileUpdate[]): void {
    const charDir = getCharactersDir();
    if (!charDir || updates.length === 0) {
        return;
    }
    const dynPath = path.join(charDir, 'dynamic_profiles.json');
    let dynProfiles = loadDynamicProfiles();
    let changed = false;
    for (const up of updates as unknown[]) {
        if (typeof up !== 'object' || up === null) {
            continue;
        }
        const record = up as Partial<ProfileUpdate>;
        if (isValidCharacterId(record.characterId) && typeof record.dynamicProfile === 'string') {
            const dynamicProfile = record.dynamicProfile.trim().slice(0, 20000);
            if (!dynamicProfile) {
                continue;
            }
            dynProfiles[record.characterId] = dynamicProfile;
            changed = true;
        }
    }
    if (changed) {
        writeJsonAtomic(dynPath, dynProfiles);
        getGmBridgeOutputChannel().appendLine(
            `[Dynamic Profiles] Updated memory for ${updates.length} character(s).`
        );
        const ws = getWorkspacePath();
        if (ws) {
            void runSkillScript('memory_bank.py', ['--rebuild', '--backend', getMemoryBackendSetting()]);
        }
    }
}

export function buildGrokPrompt(playerAction: string, isContinuation: boolean): string {
    const locale = getConfiguredLocale();
    const base = t('gm.prompt.playerAction', { action: playerAction }, locale);
    const context = buildGmPromptContext(playerAction);
    if (isContinuation) {
        return t('gm.prompt.continue', { base }, locale) + context;
    }
    return t('gm.prompt.start', { base, languageName: gmLanguageName(locale) }, locale) + context;
}

export function maybeSuggestArchive(): void {
    const panel = requireDeps().getPanel();
    if (!isArchiveAutoPromptEnabled() || !panel) {
        return;
    }
    const provider = getGmProvider();
    if (!supportsArchivePrompt(provider)) {
        return;
    }
    const config = vscode.workspace.getConfiguration('textAdventure');
    const orModel = config.get<string>('gmBridge.openRouter.model', '');
    const threshold = getArchiveThreshold(provider, orModel);
    const remindStep = getArchiveRemindStep();
    const count = getGameEntryHistory().length;
    const milestone = computeArchiveMilestone(count, threshold, remindStep);
    if (milestone === undefined || milestone <= lastArchivePromptMilestone) {
        return;
    }
    lastArchivePromptMilestone = milestone;

    const tier = getContextTier(provider, orModel);
    panel.webview.postMessage({
        type: 'archiveSuggest',
        count,
        threshold,
        tier
    });

    const msg = t('extension.info.archiveSuggest', { count: String(count), threshold: String(threshold) });
    const action = t('extension.archive.now');
    void vscode.window.showInformationMessage(msg, action).then((choice) => {
        if (choice === action) {
            void requireDeps().onArchiveNow();
        }
    });
}
