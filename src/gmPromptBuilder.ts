import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import type { ProfileUpdate } from './types/GameState';
import type { CharacterProfile } from './types/Character';
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
import { filterValidCharacterIds, isValidCharacterId, resolveCharacterJsonPath } from './characterId';
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
    tryGetCharactersDirReadOnly,
    getPartyIds,
    loadCharacterById,
    loadDynamicProfiles
} from './characterManager';
import { type LorebookEntry, matchEntriesAgainstText } from './lorebookMatcher';
import { loadScenarioDirector } from './scenarioDirector';
import { loadPartyDirector } from './partyDirector';
import {
    mergePartyDirector,
    parseGameStatePartyDirector,
    parsePartyDirectorTemplate,
    type PartyDirectorView,
    type RelationshipType,
} from './partyDirectorCore';
import { loadNpcRegistry } from './npcRegistry';
import { loadWorldForge, loadWorldForgeDocument, resolveCurrentLocation, isWorldForgeEnabled } from './worldForge';
import {
    buildLivingWorldBondPromptBlocks,
    buildLivingWorldGmLines,
    livingWorldEnabled,
    resolveCommerceForge,
} from './livingWorldBridge';
import { TRUST_WHEREABOUTS_EXACT_MIN, TRUST_WHEREABOUTS_UNKNOWN_MAX } from './npcWhereaboutsTrustCore';
import {
    loadWorldState,
    readWorldStateSnapshotReadOnly,
    isWorldStateEnabled,
    markWorldChangeSummaryInjected,
    markChronicleInjected,
    ackWorldChangeSummaryToken,
    ackChronicleTokenMarker,
    type WorldState,
} from './worldState';
import { formatWorldStateParseWarning } from './worldStateCore';
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
    applyPromptChunkBudgetRecords,
    evictPromptChunksByBudget,
    clampSimulationPromptModule,
    resolvePromptChunkPriority,
    shouldIncludePromptChunk,
    type PromptChunkActivationContext,
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
import { buildCampaignKitPromptContext, getCampaignKitPath } from './campaignKit';
import { buildCampaignJobBoardPromptContext } from './campaignKitBridge';
import { buildDiscoveryLedgerPromptContext } from './discoveryLedger';
import { buildCampaignResourcesPromptContext } from './campaignResources';
import { buildSettlementPromptContext } from './settlementState';
import { buildVehiclePromptContext } from './vehicleState';
import { buildMobileBasePromptContext } from './mobileBaseBridge';
import type { CargoEntry } from './livingWorldTypes';
import { listUnexploredRegionNames } from './fogOfWarCore';
import { buildRegionHazardPromptLine } from './regionHazardPromptCore';
import { pruneExpiredEvents } from './worldEventLogCore';
import { getVisualMemoryEntry } from './visualMemory';
import { buildVisualContextSnippet } from './visualMemoryCore';
import { isVlmEnabled } from './vlmQueue';
import { sanitizeVlmDescription } from './vlmQueueCore';
import { buildContextInspectorReport } from './contextInspectorCore';
import {
    buildSection,
    finalizeBreakdown,
    previewText,
    type PromptContextBreakdown,
    type PromptContextSection,
    type PromptLoreMatch,
    type PromptMemoryMatch,
    type PromptBudgetLimitSpec
} from './promptContext';
import {
    createPromptDeliveryReceipt,
    createPromptReceiptAckWorkItem,
    createPromptReceiptId,
    hashPromptReceiptText,
    turnResultMatchesPromptReceipt,
    type PromptConsumableAckToken,
    type PromptDeliveryReceipt,
    type PromptReceiptProvider,
    type PromptReceiptAckOutcome,
    type ChronicleAckToken,
    type WorldChangeSummaryAckToken,
} from './promptReceiptCore';
import type { TurnResult } from './types/TurnResult';

interface PromptContextCandidateSpec extends PromptContextChunkSpec {
    ackToken?: PromptConsumableAckToken;
}

export interface GmPromptChunkBuildMeta {
    specs: PromptContextCandidateSpec[];
    inactiveIds: string[];
    emptyIds: string[];
    orderedIds: string[];
}

interface InspectorPromptAssembly {
    sections: PromptContextSection[];
    specs: PromptContextChunkSpec[];
    inactiveIds: string[];
    emptyIds: string[];
    orderedIds: string[];
    matchedLore: PromptLoreMatch[];
    memoryMatches: PromptMemoryMatch[];
    memoryBackend: string;
    hintPreview: string;
    worldStateParseWarnings?: string[];
}

export interface ProductionPromptAssembly {
    promptText: string;
    receipt: PromptDeliveryReceipt;
    selectedSpecs: PromptContextCandidateSpec[];
    policy: PromptBudgetPolicy;
}

interface PromptReceiptAckFailure {
    receiptId: string;
    tokenId: string;
    chunkId: PromptConsumableAckToken['chunkId'];
    message: string;
}

export interface PromptReceiptAckResult {
    correlated: boolean;
    attemptedTokenIds: string[];
    succeededTokenIds: string[];
    /** Exact-duplicate idempotent no-ops: truthful, not failures, never queued for compensation. */
    alreadySatisfiedTokenIds: string[];
    failedTokenIds: string[];
}

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

function readJsonDocument<T>(filePath: string): T | undefined {
    if (!fs.existsSync(filePath)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    } catch {
        return undefined;
    }
}

function getPartyIdsReadOnly(): string[] {
    const charDir = tryGetCharactersDirReadOnly();
    if (!charDir) { return []; }
    const raw = readJsonDocument<unknown>(path.join(charDir, 'party.json'));
    return Array.isArray(raw) ? filterValidCharacterIds(raw) : [];
}

function loadCharacterByIdReadOnly(id: string): CharacterProfile | undefined {
    if (!isValidCharacterId(id)) { return undefined; }
    const charDir = tryGetCharactersDirReadOnly();
    if (!charDir) { return undefined; }
    const filePath = resolveCharacterJsonPath(charDir, id);
    if (!filePath) { return undefined; }
    return readJsonDocument<CharacterProfile>(filePath);
}

function loadDynamicProfilesReadOnly(): Record<string, string> {
    const charDir = tryGetCharactersDirReadOnly();
    if (!charDir) { return {}; }
    const raw = readJsonDocument<unknown>(path.join(charDir, 'dynamic_profiles.json'));
    return raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, string>
        : {};
}

function loadPartyDirectorReadOnly(): PartyDirectorView | undefined {
    const charDir = tryGetCharactersDirReadOnly();
    const templateRaw = charDir
        ? readJsonDocument<unknown>(path.join(charDir, 'party_director.json'))
        : undefined;
    const template = parsePartyDirectorTemplate(templateRaw);
    const runtime = parseGameStatePartyDirector(readGameStateForPrompt()?.partyDirector);
    return mergePartyDirector(template, runtime, getPartyIdsReadOnly());
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
        {
            id: 'settlement',
            label: 'Settlement',
            limitChars: policy.mode === 'compact' ? 520 : 1200,
        },
        {
            id: 'vehicles',
            label: 'Vehicles',
            limitChars: policy.mode === 'compact' ? 800 : 1200,
        },
        {
            id: 'mobileBase',
            label: 'Mobile Base',
            limitChars: policy.mode === 'compact' ? 800 : 1200,
        },
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

function buildPartyPromptContextFromData(
    policy: PromptBudgetPolicy,
    ids: readonly string[],
    dynProfiles: Record<string, string>,
    loadCharacter: (id: string) => CharacterProfile | undefined
): string {
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
        const char = loadCharacter(id);
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

function buildPartyPromptContext(policy: PromptBudgetPolicy): string {
    return buildPartyPromptContextFromData(policy, getPartyIds(), loadDynamicProfiles(), loadCharacterById);
}

function buildPartyPromptContextReadOnly(policy: PromptBudgetPolicy): string {
    return buildPartyPromptContextFromData(
        policy,
        getPartyIdsReadOnly(),
        loadDynamicProfilesReadOnly(),
        loadCharacterByIdReadOnly
    );
}

function buildPartyDirectorPromptContextFromData(
    director: PartyDirectorView | undefined,
    loadCharacter: (id: string) => CharacterProfile | undefined
): string {
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
        const char = loadCharacter(id);
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

function buildPartyDirectorPromptContext(): string {
    return buildPartyDirectorPromptContextFromData(loadPartyDirector(), loadCharacterById);
}

function buildPartyDirectorPromptContextReadOnly(): string {
    return buildPartyDirectorPromptContextFromData(loadPartyDirectorReadOnly(), loadCharacterByIdReadOnly);
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

function buildCampaignJobBoardPromptContextFromWorldState(worldState: WorldState | undefined): string {
    const state = readGameStateForPrompt();
    const world = state?.world as { currentLocationId?: string } | undefined;
    const currentLocationId = typeof world?.currentLocationId === 'string'
        ? world.currentLocationId
        : undefined;
    const worldTurn = typeof worldState?.worldTurn === 'number' ? worldState.worldTurn : 0;
    return buildCampaignJobBoardPromptContext(currentLocationId, worldTurn);
}

function buildCampaignJobBoardPromptContextForGm(): string {
    const simWorld = isWorldStateEnabled() ? loadWorldState() : undefined;
    return buildCampaignJobBoardPromptContextFromWorldState(simWorld);
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
        const hazardLine = buildRegionHazardPromptLine(region);
        if (hazardLine) { lines.push(`  ${hazardLine}`); }
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

function buildLivingWorldBondPromptContextsFromWorldState(
    worldState: WorldState | undefined
): { npcBonds: string; playerBonds: string; factionRelations: string } {
    if (!isWorldStateEnabled() || !livingWorldEnabled(loadGameRules())) {
        return { npcBonds: '', playerBonds: '', factionRelations: '' };
    }
    if (!worldState) {
        return { npcBonds: '', playerBonds: '', factionRelations: '' };
    }
    const forge = isWorldForgeEnabled() ? loadWorldForge() : undefined;
    return buildLivingWorldBondPromptBlocks(worldState, loadNpcRegistry(), loadGameRules(), forge ?? undefined);
}

function buildLivingWorldBondPromptContexts(): { npcBonds: string; playerBonds: string; factionRelations: string } {
    if (!isWorldStateEnabled() || !livingWorldEnabled(loadGameRules())) {
        return { npcBonds: '', playerBonds: '', factionRelations: '' };
    }
    return buildLivingWorldBondPromptContextsFromWorldState(loadWorldState());
}

function buildWorldStatePromptContextFromWorldState(
    policy: PromptBudgetPolicy,
    worldState: WorldState | undefined
): string {
    if (!isWorldStateEnabled()) { return ''; }
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

function buildWorldStatePromptContext(policy: PromptBudgetPolicy): string {
    if (!isWorldStateEnabled()) { return ''; }
    return buildWorldStatePromptContextFromWorldState(policy, loadWorldState());
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
function buildWorldChangeSummaryContextFromWorldState(worldState: WorldState | undefined): string {
    if (!worldState?.recentChanges?.length) { return ''; }
    return buildWorldChangeSummaryFromChanges(
        worldState.recentChanges,
        worldState.worldTurn,
        undefined
    );
}

function shouldOfferWorldChangeSummaryCandidate(
    summaryTurn: number | undefined,
    sourceDigest: string,
    worldState: WorldState | undefined
): boolean {
    if (summaryTurn === undefined) {
        return false;
    }
    const lastInjectedTurn = worldState?.lastInjectedWorldChangeSummaryTurn ?? -1;
    const lastInjectedDigest = worldState?.lastInjectedWorldChangeSummaryDigest;
    if (lastInjectedTurn > summaryTurn) {
        return false;
    }
    if (lastInjectedTurn === summaryTurn && lastInjectedDigest === sourceDigest) {
        return false;
    }
    return true;
}

function buildWorldChangeSummaryCandidateFromWorldState(
    worldState: WorldState | undefined
): { text: string; ackToken: WorldChangeSummaryAckToken } | undefined {
    if (!worldState?.recentChanges?.length) {
        return undefined;
    }
    const summary = buildWorldChangeSummaryContextFromWorldState(worldState);
    if (!summary) {
        return undefined;
    }
    const summaryTurn = resolveWorldChangeSummaryTurn(
        worldState.recentChanges,
        worldState.worldTurn,
        undefined
    );
    const sourceDigest = hashPromptReceiptText(summary);
    if (!shouldOfferWorldChangeSummaryCandidate(summaryTurn, sourceDigest, worldState) || summaryTurn === undefined) {
        return undefined;
    }
    return {
        text: summary,
        ackToken: {
            tokenId: `worldChangeSummary:${summaryTurn}:${sourceDigest}`,
            chunkId: 'worldChangeSummary',
            summaryTurn,
            sourceDigest,
        },
    };
}

function peekWorldChangeSummaryContext(): string {
    if (!isWorldStateEnabled()) { return ''; }
    const worldState = loadWorldState();
    return buildWorldChangeSummaryCandidateFromWorldState(worldState)?.text ?? '';
}

/**
 * Inject once per simulation worldTurn — marks consumed after building so later GM turns
 * do not repeat the same "[Since Last Visit]" block until the next sim tick.
 */
function consumeWorldChangeSummaryContext(): string {
    if (!isWorldStateEnabled()) { return ''; }
    const worldState = loadWorldState();
    const candidate = buildWorldChangeSummaryCandidateFromWorldState(worldState);
    if (!candidate) { return ''; }
    markWorldChangeSummaryInjected(candidate.ackToken.summaryTurn, candidate.ackToken.sourceDigest);
    return candidate.text;
}

let chronicleSessionPending = true;
let chronicleSessionPendingGeneration = 1;
const promptAckCompensationQueue = new Map<string, PromptReceiptAckFailure>();

/** Reset on extension activate so the first GM turn after resume can inject recap. */
export function resetChronicleSessionPending(): void {
    chronicleSessionPending = true;
    chronicleSessionPendingGeneration += 1;
}

function peekChronicleSessionPending(): boolean {
    return chronicleSessionPending;
}

function peekChronicleSessionPendingGeneration(): number {
    return chronicleSessionPendingGeneration;
}

function clearChronicleSessionPending(): void {
    chronicleSessionPending = false;
}

/**
 * `alreadySatisfied` when pending was already cleared (by this or an earlier exact ACK) — a
 * truthful no-op, not a failure. A generation mismatch (a newer reset occurred) remains `failed`
 * so an old token cannot be mistaken for having cleared the newer generation.
 */
function clearChronicleSessionPendingForGeneration(pendingGeneration: number): PromptReceiptAckOutcome {
    if (!chronicleSessionPending) {
        return 'alreadySatisfied';
    }
    if (chronicleSessionPendingGeneration !== pendingGeneration) {
        return 'failed';
    }
    chronicleSessionPending = false;
    return 'applied';
}

function buildChronicleRecapContextWithWorldState(
    consume: boolean,
    policy: PromptBudgetPolicy,
    worldState: WorldState | undefined
): string {
    const recapInPrompt = vscode.workspace.getConfiguration('textAdventure.chronicle')
        .get<boolean>('recapInPrompt', false);
    if (!recapInPrompt) { return ''; }

    const ws = getWorkspacePath();
    if (!ws) { return ''; }

    const journalTurns = readJournalTurnsFromPath(path.join(ws, 'state_journal.ndjson'));
    const sourceTurn = resolveChronicleSourceTurn(journalTurns.length);
    if (sourceTurn <= 0) { return ''; }

    const sessionPending = peekChronicleSessionPending();
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
    const lineDigest = hashPromptReceiptText(line);
    const lastInjected = worldState?.lastInjectedChronicleTurn;
    const lastInjectedDigest = worldState?.lastInjectedChronicleDigest;
    const visible = sessionPending
        || shouldInjectChronicle(sourceTurn, lastInjected, false)
        || (lastInjected === sourceTurn && lastInjectedDigest !== lineDigest);
    if (!visible) {
        return '';
    }

    if (consume) {
        markChronicleInjected(sourceTurn, lineDigest);
        clearChronicleSessionPendingForGeneration(peekChronicleSessionPendingGeneration());
    }
    return line;
}

function buildChronicleRecapContext(consume: boolean, policy: PromptBudgetPolicy): string {
    return buildChronicleRecapContextWithWorldState(consume, policy, loadWorldState());
}

function buildChronicleRecapCandidate(
    policy: PromptBudgetPolicy
): { text: string; ackToken: ChronicleAckToken } | undefined {
    const worldState = loadWorldState();
    const text = buildChronicleRecapContextWithWorldState(false, policy, worldState);
    if (!text) {
        return undefined;
    }
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const journalTurns = readJournalTurnsFromPath(path.join(ws, 'state_journal.ndjson'));
    const sourceTurn = resolveChronicleSourceTurn(journalTurns.length);
    if (sourceTurn <= 0) {
        return undefined;
    }
    const sourceDigest = hashPromptReceiptText(text);
    return {
        text,
        ackToken: {
            tokenId: `chronicle:${sourceTurn}:${sourceDigest}:${peekChronicleSessionPendingGeneration()}`,
            chunkId: 'chronicle',
            sourceTurn,
            sourceDigest,
            pendingGeneration: peekChronicleSessionPendingGeneration(),
        },
    };
}

function peekChronicleRecapContext(policy: PromptBudgetPolicy): string {
    return buildChronicleRecapContext(false, policy);
}

function consumeChronicleRecapContext(policy: PromptBudgetPolicy): string {
    return buildChronicleRecapContext(true, policy);
}

/**
 * Inspector builds sections and accounting from one local pass so preview text and
 * Context Inspector decisions cannot diverge or re-trigger mutating read paths.
 */
function buildInspectorPromptAssembly(
    playerAction: string,
    policy: PromptBudgetPolicy
): InspectorPromptAssembly {
    const ws = getWorkspacePath();
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

    const activation = resolvePromptChunkActivationContext();
    const worldStateSnapshot = isWorldStateEnabled()
        ? readWorldStateSnapshotReadOnly()
        : { state: undefined, warnings: [] as const };
    const inspectorWorldState = worldStateSnapshot.state;
    const assembly: InspectorPromptAssembly = {
        sections: [],
        specs: [],
        inactiveIds: [],
        emptyIds: [],
        orderedIds: [],
        matchedLore,
        memoryMatches,
        memoryBackend,
        hintPreview: previewText(hint, 240),
        worldStateParseWarnings: worldStateSnapshot.warnings.length > 0
            ? worldStateSnapshot.warnings.map(formatWorldStateParseWarning)
            : undefined,
    };

    const considerInspectorChunk = (
        id: string,
        label: string,
        build: () => string | undefined
    ): void => {
        assembly.orderedIds.push(id);
        if (!shouldIncludePromptChunk(id, activation)) {
            assembly.inactiveIds.push(id);
            return;
        }
        const section = buildSection(id, label, String(build() ?? ''));
        if (!section) {
            assembly.emptyIds.push(id);
            return;
        }
        assembly.sections.push(section);
        assembly.specs.push({
            id,
            text: section.text,
            priority: resolvePromptChunkPriority(id),
        });
    };

    const lwBonds = shouldIncludePromptChunk('livingWorldNpcBonds', activation)
        || shouldIncludePromptChunk('livingWorldPlayerBonds', activation)
        || shouldIncludePromptChunk('livingWorldFactionRelations', activation)
        ? buildLivingWorldBondPromptContextsFromWorldState(inspectorWorldState)
        : { npcBonds: '', playerBonds: '', factionRelations: '' };

    considerInspectorChunk('gameRules', 'Game Rules', buildGameRulesPromptContext);
    considerInspectorChunk('narrativeTime', 'Narrative Time', buildNarrativeTimePromptContext);
    considerInspectorChunk('campaignKit', 'Campaign Kit', buildCampaignKitPromptContext);
    considerInspectorChunk('discoveryLedger', 'Discoveries', buildDiscoveryLedgerPromptContext);
    considerInspectorChunk('campaignJobBoard', 'Campaign Job Board', () =>
        buildCampaignJobBoardPromptContextFromWorldState(inspectorWorldState)
    );
    considerInspectorChunk('campaignResources', 'Campaign Resources', buildCampaignResourcesPromptContext);
    considerInspectorChunk('settlement', 'Settlement', () => buildSettlementPromptContext(policy));
    considerInspectorChunk('vehicles', 'Vehicles', () => buildVehiclePromptContext(policy));
    considerInspectorChunk('mobileBase', 'Mobile Base', buildMobileBasePromptContext);
    considerInspectorChunk('domain', 'Domain', () => buildDomainPromptContextForGm(hint));
    considerInspectorChunk('guild', 'Guild', () => buildGuildPromptContextForGm(hint));
    considerInspectorChunk('director', 'Scenario Director', buildScenarioDirectorPromptContext);
    considerInspectorChunk('chronicle', 'Chronicle Recap', () =>
        buildChronicleRecapContextWithWorldState(false, policy, inspectorWorldState)
    );
    considerInspectorChunk('summary', 'Story Synopsis', () => {
        const summary = loadStorySummary();
        return summary ? `[Story Synopsis]\n${clampTextForPrompt(summary, policy.summaryChars)}` : '';
    });

    if (ws) {
        considerInspectorChunk('saga', 'Saga Archive', () =>
            clampTextForPrompt(buildSagaPromptContext(ws, policy.sagaChapters), policy.sagaChars)
        );
    }

    considerInspectorChunk('party', 'Party', () => buildPartyPromptContextReadOnly(policy));
    considerInspectorChunk('partyDirector', 'Party Director', buildPartyDirectorPromptContextReadOnly);

    if (ws) {
        considerInspectorChunk('memory', 'Memory Bank', () => buildMemoryContextForPrompt(ws, hint, policy));
    }

    considerInspectorChunk('travelEncounters', 'Travel Encounters', () =>
        buildTravelEncounterPromptContext(playerAction)
    );
    considerInspectorChunk('livingWorldTravel', 'Living World Travel', () =>
        buildLivingWorldTravelPromptContext(playerAction)
    );
    considerInspectorChunk('worldForge', 'World', () => buildWorldForgePromptContext(policy));
    considerInspectorChunk('worldState', 'World State', () =>
        buildWorldStatePromptContextFromWorldState(policy, inspectorWorldState)
    );
    considerInspectorChunk('livingWorldNpcBonds', 'LW NPC Bonds', () => lwBonds.npcBonds);
    considerInspectorChunk('livingWorldPlayerBonds', 'LW Your Bonds', () => lwBonds.playerBonds);
    considerInspectorChunk('livingWorldFactionRelations', 'LW Faction Relations', () => lwBonds.factionRelations);
    considerInspectorChunk('worldChangeSummary', 'World Changes', () =>
        buildWorldChangeSummaryCandidateFromWorldState(inspectorWorldState)?.text ?? ''
    );
    considerInspectorChunk('lorebook', 'Lorebook', () => buildLorebookPromptContext(hint, policy));
    considerInspectorChunk('npcRegistry', 'NPC Awareness', () => buildNpcRegistryPromptContext(policy));
    considerInspectorChunk('vision', 'Vision', () => buildVisionContext(policy));

    return assembly;
}

function resolveMemoryMatches(ws: string, hint: string, policy: PromptBudgetPolicy): MemoryChunk[] {
    const backend = getMemoryBackendSetting();
    if (backend === 'tfidf') {
        return matchMemories(ws, hint, policy.memoryMatches);
    }
    return resolveMemoriesViaPython(ws, hint, backend, policy.memoryMatches);
}

export function buildGmPromptBreakdown(playerAction: string): PromptContextBreakdown {
    const policy = getPromptBudgetPolicy();
    const assembly = buildInspectorPromptAssembly(playerAction, policy);
    const targetChars = policy.targetTokens * 4;
    const contextInspector = buildContextInspectorReport(assembly.specs, targetChars, {
        inactiveIds: assembly.inactiveIds,
        emptyIds: assembly.emptyIds,
        orderedIds: assembly.orderedIds,
    });

    return finalizeBreakdown(
        assembly.sections,
        assembly.memoryBackend,
        assembly.matchedLore,
        assembly.memoryMatches,
        assembly.hintPreview,
        {
            mode: policy.mode,
            requestedMode: policy.requestedMode,
            targetTokens: policy.targetTokens
        },
        buildPromptBudgetLimitSpecs(policy),
        contextInspector,
        assembly.worldStateParseWarnings
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

function resolvePromptChunkActivationContext(): PromptChunkActivationContext {
    const rules = loadGameRules();
    const chronicleRecapInPrompt = vscode.workspace.getConfiguration('textAdventure.chronicle')
        .get<boolean>('recapInPrompt', false);
    const kitPath = getCampaignKitPath();
    return {
        enableCampaignKit: rules.enableCampaignKit === true,
        hasCampaignKitFile: Boolean(kitPath && fs.existsSync(kitPath)),
        enableDomainMode: rules.enableDomainMode === true,
        enableGuildMode: rules.enableGuildMode === true,
        enableEmergentSimulation: rules.enableEmergentSimulation === true,
        enableWorldObservatory: rules.enableWorldObservatory === true,
        chronicleRecapInPrompt,
        enableCommerce: rules.enableCommerce === true,
        enableNpcRegistry: rules.enableNpcRegistry === true,
        enableNpcRelationships: rules.enableNpcRelationships === true,
        livingWorldEnabled: livingWorldEnabled(rules),
        worldStateEnabled: isWorldStateEnabled(),
        worldForgeEnabled: isWorldForgeEnabled(),
        enableTravelEncounters: rules.enableTravelEncounters === true,
        enableSettlementMode: rules.enableSettlementMode === true,
        enableVehicleSystem: rules.enableVehicleSystem === true,
        enableMobileBaseSystem: rules.enableMobileBaseSystem === true,
    };
}

function maybeBuildSection(
    id: string,
    label: string,
    activation: PromptChunkActivationContext,
    build: () => string
): ReturnType<typeof buildSection> | undefined {
    if (!shouldIncludePromptChunk(id, activation)) {
        return undefined;
    }
    return buildSection(id, label, build());
}

function considerPromptChunk(
    meta: GmPromptChunkBuildMeta,
    id: string,
    activation: PromptChunkActivationContext,
    build: () => string | { text: string; ackToken?: PromptConsumableAckToken } | undefined
): void {
    meta.orderedIds.push(id);
    if (!shouldIncludePromptChunk(id, activation)) {
        meta.inactiveIds.push(id);
        return;
    }
    const built = build();
    const trimmed = typeof built === 'string'
        ? built.trim()
        : String(built?.text ?? '').trim();
    if (!trimmed) {
        meta.emptyIds.push(id);
        return;
    }
    meta.specs.push({
        id,
        text: trimmed,
        priority: resolvePromptChunkPriority(id),
        ...(typeof built === 'object' && built?.ackToken ? { ackToken: built.ackToken } : {}),
    });
}

/**
 * Explicit, required strategy for the two consumables whose builders can either
 * peek (side-effect free) or consume (advance durable ACK markers / clear session
 * pending). This is a named authority contract, not a boolean/default switch —
 * every caller of `buildGmPromptChunkSpecsWithMeta` must supply one explicitly.
 */
interface GmPromptConsumableBuilders {
    chronicle: (policy: PromptBudgetPolicy) => string | { text: string; ackToken?: PromptConsumableAckToken } | undefined;
    worldChangeSummary: () => string | { text: string; ackToken?: PromptConsumableAckToken } | undefined;
}

/**
 * PURE authority: chronicle/worldChangeSummary use peek-only builders and are
 * structurally unable to reach markWorldChangeSummaryInjected, markChronicleInjected,
 * clearChronicleSessionPending, or the consume* functions. Used by Inspector/Preview only.
 */
const PURE_CANDIDATE_CONSUMABLE_BUILDERS: GmPromptConsumableBuilders = {
    chronicle: (policy) => buildChronicleRecapCandidate(policy),
    worldChangeSummary: () => buildWorldChangeSummaryCandidateFromWorldState(loadWorldState()),
};

/**
 * LEGACY authority: preserves current production behavior during PROMPT-001A staging.
 * Only this builder set may advance durable ACK markers / clear session pending.
 * Used by production prompt assembly only. PROMPT-001C owns switching production
 * off this legacy authority.
 */
const LEGACY_PRODUCTION_CONSUMABLE_BUILDERS: GmPromptConsumableBuilders = {
    chronicle: (policy) => consumeChronicleRecapContext(policy),
    worldChangeSummary: () => consumeWorldChangeSummaryContext(),
};

function buildGmPromptChunkSpecsWithMeta(
    playerAction: string,
    policy: PromptBudgetPolicy,
    consumableBuilders: GmPromptConsumableBuilders
): GmPromptChunkBuildMeta {
    const hint = buildHintText(playerAction, policy);
    const ws = getWorkspacePath();
    const activation = resolvePromptChunkActivationContext();
    const meta: GmPromptChunkBuildMeta = {
        specs: [],
        inactiveIds: [],
        emptyIds: [],
        orderedIds: [],
    };

    considerPromptChunk(meta, 'gameRules', activation, buildGameRulesPromptContext);
    considerPromptChunk(meta, 'narrativeTime', activation, buildNarrativeTimePromptContext);
    considerPromptChunk(meta, 'campaignKit', activation, buildCampaignKitPromptContext);
    considerPromptChunk(meta, 'discoveryLedger', activation, buildDiscoveryLedgerPromptContext);
    considerPromptChunk(meta, 'campaignJobBoard', activation, buildCampaignJobBoardPromptContextForGm);
    considerPromptChunk(meta, 'campaignResources', activation, buildCampaignResourcesPromptContext);
    considerPromptChunk(meta, 'settlement', activation, () => buildSettlementPromptContext(policy));
    considerPromptChunk(meta, 'vehicles', activation, () => buildVehiclePromptContext(policy));
    considerPromptChunk(meta, 'mobileBase', activation, buildMobileBasePromptContext);
    considerPromptChunk(meta, 'domain', activation, () =>
        clampSimulationPromptModule(buildDomainPromptContextForGm(playerAction))
    );
    considerPromptChunk(meta, 'guild', activation, () =>
        clampSimulationPromptModule(buildGuildPromptContextForGm(playerAction))
    );
    considerPromptChunk(meta, 'director', activation, buildScenarioDirectorPromptContext);
    considerPromptChunk(meta, 'chronicle', activation, () => consumableBuilders.chronicle(policy));

    if (loadStorySummary()) {
        considerPromptChunk(meta, 'summary', activation, () => {
            const summary = loadStorySummary();
            return summary ? `[Story Synopsis]\n${clampTextForPrompt(summary, policy.summaryChars)}` : '';
        });
    }

    if (ws) {
        considerPromptChunk(meta, 'saga', activation, () =>
            clampTextForPrompt(buildSagaPromptContext(ws, policy.sagaChapters), policy.sagaChars)
        );
    }

    considerPromptChunk(meta, 'party', activation, () => buildPartyPromptContext(policy));
    considerPromptChunk(meta, 'partyDirector', activation, buildPartyDirectorPromptContext);

    if (ws) {
        considerPromptChunk(meta, 'memory', activation, () => buildMemoryContextForPrompt(ws, hint, policy));
    }

    considerPromptChunk(meta, 'travelEncounters', activation, () =>
        buildTravelEncounterPromptContext(playerAction)
    );
    considerPromptChunk(meta, 'livingWorldTravel', activation, () =>
        buildLivingWorldTravelPromptContext(playerAction)
    );
    considerPromptChunk(meta, 'worldForge', activation, () => buildWorldForgePromptContext(policy));
    considerPromptChunk(meta, 'worldState', activation, () => buildWorldStatePromptContext(policy));

    const lwBonds = shouldIncludePromptChunk('livingWorldNpcBonds', activation)
        || shouldIncludePromptChunk('livingWorldPlayerBonds', activation)
        || shouldIncludePromptChunk('livingWorldFactionRelations', activation)
        ? buildLivingWorldBondPromptContexts()
        : { npcBonds: '', playerBonds: '', factionRelations: '' };
    considerPromptChunk(meta, 'livingWorldNpcBonds', activation, () => lwBonds.npcBonds);
    considerPromptChunk(meta, 'livingWorldPlayerBonds', activation, () => lwBonds.playerBonds);
    considerPromptChunk(meta, 'livingWorldFactionRelations', activation, () => lwBonds.factionRelations);
    considerPromptChunk(meta, 'worldChangeSummary', activation, () => consumableBuilders.worldChangeSummary());
    considerPromptChunk(meta, 'lorebook', activation, () => buildLorebookPromptContext(hint, policy));
    considerPromptChunk(meta, 'npcRegistry', activation, () => buildNpcRegistryPromptContext(policy));
    considerPromptChunk(meta, 'vision', activation, () => buildVisionContext(policy));

    return meta;
}

/**
 * Explicit PURE authority entry point. Structurally cannot reach consumeChronicleRecapContext,
 * consumeWorldChangeSummaryContext, markWorldChangeSummaryInjected, markChronicleInjected, or
 * clearChronicleSessionPending — it only closes over PURE_CANDIDATE_CONSUMABLE_BUILDERS, whose
 * chronicle/worldChangeSummary fields are peek-only. Inspector uses its own local assembly;
 * production receipt prep uses this pure path for candidate selection.
 */
function buildPureCandidateSpecsWithMeta(
    playerAction: string,
    policy: PromptBudgetPolicy
): GmPromptChunkBuildMeta {
    return buildGmPromptChunkSpecsWithMeta(playerAction, policy, PURE_CANDIDATE_CONSUMABLE_BUILDERS);
}

/**
 * Explicit LEGACY authority entry point retained only for regression proof / staging compatibility.
 * Production prompt assembly must no longer route through this path after PROMPT-001C.
 */
function buildLegacyProductionSpecsWithMeta(
    playerAction: string,
    policy: PromptBudgetPolicy
): GmPromptChunkBuildMeta {
    return buildGmPromptChunkSpecsWithMeta(playerAction, policy, LEGACY_PRODUCTION_CONSUMABLE_BUILDERS);
}

function buildLegacyProductionSpecs(playerAction: string, policy: PromptBudgetPolicy): PromptContextChunkSpec[] {
    return buildLegacyProductionSpecsWithMeta(playerAction, policy).specs;
}

function buildSelectedPromptSpecs(
    specs: PromptContextCandidateSpec[],
    targetChars: number
): PromptContextCandidateSpec[] {
    const records = applyPromptChunkBudgetRecords(specs, targetChars);
    const finalById = new Map(records.map((record) => [record.id, record.finalText]));
    return specs
        .map((spec) => {
            const finalText = finalById.get(spec.id) ?? '';
            if (!finalText) {
                return undefined;
            }
            return {
                ...spec,
                text: finalText,
            };
        })
        .filter((spec): spec is PromptContextCandidateSpec => Boolean(spec));
}

/**
 * Receipt authority is created here, after budget selection and before provider transport
 * wrapping. The receipt binds the exact selected assembly, not a mutable later rebuild.
 */
export function buildProductionPromptAssembly(
    playerAction: string,
    provider: PromptReceiptProvider
): ProductionPromptAssembly {
    flushScheduledCommercePersist();
    const policy = getPromptBudgetPolicy();
    const candidateMeta = buildPureCandidateSpecsWithMeta(playerAction, policy);
    const targetChars = policy.targetTokens * 4;
    const selectedSpecs = buildSelectedPromptSpecs(candidateMeta.specs, targetChars);
    const promptText = selectedSpecs.length
        ? `\n\n${selectedSpecs.map((spec) => spec.text).join('\n\n')}`
        : '';
    const receipt = createPromptDeliveryReceipt({
        receiptId: createPromptReceiptId(),
        provider,
        selectedChunks: selectedSpecs.map((spec) => ({
            id: spec.id,
            text: spec.text,
            priority: spec.priority,
        })),
        selectedTokens: selectedSpecs
            .map((spec) => spec.ackToken)
            .filter((token): token is PromptConsumableAckToken => Boolean(token)),
        budgetMode: policy.mode,
        targetTokens: policy.targetTokens,
    });
    return {
        promptText,
        receipt,
        selectedSpecs,
        policy,
    };
}

function resolvePromptReceiptProvider(provider: string): PromptReceiptProvider {
    switch (provider) {
        case 'grok':
        case 'ollama':
        case 'koboldcpp':
        case 'openrouter':
        case 'command':
        case 'vscode-lm':
            return provider;
        default:
            return 'grok';
    }
}

export function buildGmPromptContext(playerAction: string): string {
    return buildProductionPromptAssembly(
        playerAction,
        resolvePromptReceiptProvider(getGmProvider())
    ).promptText;
}

function recordPromptAckFailure(failure: PromptReceiptAckFailure): void {
    promptAckCompensationQueue.set(`${failure.receiptId}:${failure.tokenId}`, failure);
}

function clearPromptAckFailure(receiptId: string, tokenId: string): void {
    promptAckCompensationQueue.delete(`${receiptId}:${tokenId}`);
}

/**
 * Combines two independent sub-outcomes into one token-level outcome: any real state change
 * ('applied') wins outright; otherwise any genuine 'failed' sub-outcome wins so a real failure is
 * never masked; only when neither happened do we report the truthful 'alreadySatisfied' no-op.
 */
function combinePromptReceiptAckOutcomes(
    a: PromptReceiptAckOutcome,
    b: PromptReceiptAckOutcome
): PromptReceiptAckOutcome {
    if (a === 'applied' || b === 'applied') {
        return 'applied';
    }
    if (a === 'failed' || b === 'failed') {
        return 'failed';
    }
    return 'alreadySatisfied';
}

function applyChronicleAckToken(token: ChronicleAckToken): PromptReceiptAckOutcome {
    const markerOutcome = ackChronicleTokenMarker(token);
    const pendingOutcome = clearChronicleSessionPendingForGeneration(token.pendingGeneration);
    return combinePromptReceiptAckOutcomes(markerOutcome, pendingOutcome);
}

function applyWorldChangeSummaryAckToken(token: WorldChangeSummaryAckToken): PromptReceiptAckOutcome {
    return ackWorldChangeSummaryToken(token);
}

/**
 * ACK happens only after Accepted and trusted receipt correlation. We intentionally keep this
 * process-local only: after restart there is no durable receipt recovery and skipped ACKs may repeat,
 * but we do not guess with latest-pending or heuristic consume.
 *
 * The receipt itself is frozen at construction, but ACK additionally copies it into an immutable
 * work item here so authority never depends on iterating a live receipt reference that some other
 * holder of the original object could still be pointing at.
 */
export function acknowledgePromptReceiptAfterAccepted(
    receipt: PromptDeliveryReceipt,
    acceptedTurn: TurnResult | undefined,
    options: {
        applyChronicleToken?: (token: ChronicleAckToken) => PromptReceiptAckOutcome;
        applyWorldChangeSummaryToken?: (token: WorldChangeSummaryAckToken) => PromptReceiptAckOutcome;
    } = {}
): PromptReceiptAckResult {
    if (!turnResultMatchesPromptReceipt(acceptedTurn, receipt)) {
        return {
            correlated: false,
            attemptedTokenIds: [],
            succeededTokenIds: [],
            alreadySatisfiedTokenIds: [],
            failedTokenIds: [],
        };
    }

    const ackWorkItem = createPromptReceiptAckWorkItem(receipt);
    const applyChronicle = options.applyChronicleToken ?? applyChronicleAckToken;
    const applyWorldChangeSummary = options.applyWorldChangeSummaryToken ?? applyWorldChangeSummaryAckToken;
    const attemptedTokenIds: string[] = [];
    const succeededTokenIds: string[] = [];
    const alreadySatisfiedTokenIds: string[] = [];
    const failedTokenIds: string[] = [];

    for (const token of ackWorkItem.selectedTokens) {
        attemptedTokenIds.push(token.tokenId);
        try {
            // Three-way outcome, not a bare boolean: 'applied' and 'alreadySatisfied' are both
            // truthful non-failures (an exact-duplicate no-op must never enter the compensation
            // queue), while only 'failed' is a genuine compensation-queue failure. Each token is
            // still independent — one token's outcome never blocks the other's attempt.
            const outcome = token.chunkId === 'chronicle'
                ? applyChronicle(token)
                : applyWorldChangeSummary(token);
            if (outcome === 'failed') {
                recordPromptAckFailure({
                    receiptId: ackWorkItem.receiptId,
                    tokenId: token.tokenId,
                    chunkId: token.chunkId,
                    message: 'ACK reported failed outcome',
                });
                failedTokenIds.push(token.tokenId);
            } else {
                clearPromptAckFailure(ackWorkItem.receiptId, token.tokenId);
                if (outcome === 'alreadySatisfied') {
                    alreadySatisfiedTokenIds.push(token.tokenId);
                } else {
                    succeededTokenIds.push(token.tokenId);
                }
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            recordPromptAckFailure({
                receiptId: ackWorkItem.receiptId,
                tokenId: token.tokenId,
                chunkId: token.chunkId,
                message,
            });
            failedTokenIds.push(token.tokenId);
        }
    }

    return {
        correlated: true,
        attemptedTokenIds,
        succeededTokenIds,
        alreadySatisfiedTokenIds,
        failedTokenIds,
    };
}

export function peekPromptAckCompensationQueueForTests(): PromptReceiptAckFailure[] {
    return [...promptAckCompensationQueue.values()].map((entry) => ({ ...entry }));
}

export function resetPromptReceiptStateForTests(): void {
    promptAckCompensationQueue.clear();
    chronicleSessionPending = true;
    chronicleSessionPendingGeneration = 1;
}

export function peekChronicleSessionPendingGenerationForTests(): number {
    return peekChronicleSessionPendingGeneration();
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
    return buildGrokPromptFromContext(playerAction, isContinuation, buildGmPromptContext(playerAction));
}

export function buildGrokPromptFromContext(
    playerAction: string,
    isContinuation: boolean,
    context: string
): string {
    const locale = getConfiguredLocale();
    const base = t('gm.prompt.playerAction', { action: playerAction }, locale);
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
