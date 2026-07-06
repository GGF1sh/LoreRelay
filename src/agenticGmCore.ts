// Pure helpers for Phase 9 split-role GM (no vscode/fs/spawn imports).

import { isValidEntryId } from './entryId';
import { MAX_ENTRY_CONTENT_LEN } from './gameStateSanitize';
import type {
    CartographyReveal,
    DiceLedgerEntry,
    StatePatchOp,
    TurnGmEntryMeta,
    TurnMediaRequest,
    TurnResult,
    TurnResultPromptReceiptMeta,
} from './types/TurnResult';
import { parseCartographyReveal } from './cartographyRevealCore';
import { parseTradeOps } from './commerceCore';
import { parseNpcAgencyOps } from './npcAgencyCore';
import { clampElapsedWorldTurns } from './narrativeTimePassageCore';
import { parseDomainOps } from './domainCore';
import { parseDiscoveryOps } from './discoveryTurnOpsCore';
import { isValidEventId } from './worldEventLogCore';

export type AgenticStage = 'referee' | 'narrator';

/** Providers that can run Phase 9 split-role GM when agentic mode is enabled. */
export type AgenticGmProvider = 'grok' | 'vscode-lm' | 'ollama' | 'koboldcpp' | 'openrouter';

export const AGENTIC_CAPABLE_PROVIDERS: readonly AgenticGmProvider[] = [
    'grok',
    'vscode-lm',
    'ollama',
    'koboldcpp',
    'openrouter',
];

export function isAgenticCapableProvider(provider: string): provider is AgenticGmProvider {
    return (AGENTIC_CAPABLE_PROVIDERS as readonly string[]).includes(provider);
}

export interface AgenticConfigSnapshot {
    enabled: boolean;
    fallbackToSingleStage: boolean;
    refereeProvider: AgenticGmProvider;
    narratorProvider: AgenticGmProvider;
    stageTimeoutMs: number;
}

export interface RefereeResultCandidate {
    turnId: string;
    playerAction?: string;
    diceLedger?: DiceLedgerEntry[];
    statePatch?: StatePatchOp[];
    resolvedQuests?: string[];
    media?: TurnMediaRequest;
    refereeNotes?: string;
    cartographyReveal?: CartographyReveal;
    elapsedWorldTurns?: number;
    tradeOps?: TurnResult['tradeOps'];
    npcAgencyOps?: TurnResult['npcAgencyOps'];
    domainOps?: TurnResult['domainOps'];
    discoveryOps?: TurnResult['discoveryOps'];
}

export interface NarratorResultCandidate {
    narration: string;
    gmEntry?: TurnGmEntryMeta;
    media?: TurnMediaRequest;
    triggeredLore?: string[];
}

export interface AgenticMergeResult {
    ok: boolean;
    result?: TurnResult;
    reason?: string;
}

export const MAX_AGENTIC_TEXT_BYTES = 1_048_576;
export const MAX_REFEREE_NOTES_LEN = 400;
export const MAX_TRIGGERED_LORE = 20;
export const MAX_TRIGGERED_LORE_LABEL_LEN = 120;
export const MAX_STATE_PATCH_OPS = 50;

const REFEREE_INSTRUCTIONS = `
You are LoreRelay's State Referee.

Your job is to produce mechanical state changes only.
Do not write narrative prose.
Do not edit game_state.json directly.
Do not write turn_result.json.

Write JSON only to:
.text-adventure/agentic/referee_result.json

If your runtime cannot write files, output the same JSON object to stdout instead.
Do not add prose before or after the JSON.

Required JSON shape:
{
  "turnId": "stable-turn-id",
  "playerAction": "...",
  "diceLedger": [],
  "statePatch": [],
  "resolvedQuests": [],
  "media": {},
  "refereeNotes": "short summary for narrator",
  "elapsedWorldTurns": 0,
  "tradeOps": [],
  "discoveryOps": [],
  "npcAgencyOps": [],
  "domainOps": null,
  "cartographyReveal": {}
}

Rules:
- Use only safe JSON Patch paths that LoreRelay already allows.
- Keep patches minimal.
- If no mechanical change is needed, statePatch may be [].
- resolvedQuests must contain only completed Quest Hook ids.
- refereeNotes must be short and must not include hidden chain-of-thought.
- elapsedWorldTurns (0-100, default 0): advance world sim ONLY on committed overnight rest, multi-day travel, or explicit time skip. Keep 0 during same-scene conversation, investigation, or combat rounds.
- tradeOps (max 16): buy/sell at markets — Core applies prices; narrate negotiation only.
- discoveryOps (max 8): Campaign Kit findings { op: add|update|remove, id, label?, discoveryKind?, status?, siteId?, identifiedLabel? }.
- npcAgencyOps (max 10): NPC relocations { npcId, locationId, arrivesTurn }.
- domainOps: monthly_commit { kind, actions[], intelligence? } when player commits domain policy; set elapsedWorldTurns to domainMonthDays. appoint_officer / dismiss_officer optional.
- cartographyReveal: optional map FoW reveal (regions array).
`.trim();

const NARRATOR_INSTRUCTIONS = `
You are LoreRelay's Narrator.

You receive an already accepted State Referee candidate.
You may write prose, mood, image prompt, and presentation hints.
You must not change mechanics.
Do not include statePatch, diceLedger, or resolvedQuests.
Do not edit game_state.json directly.
Do not write turn_result.json.

Write JSON only to:
.text-adventure/agentic/narrator_result.json

If your runtime cannot write files, output the same JSON object to stdout instead.
Do not add prose before or after the JSON.

Required JSON shape:
{
  "narration": "rich GM narration",
  "gmEntry": {
    "imagePrompt": "optional concise image prompt"
  },
  "media": {
    "mood": "optional",
    "sfx": []
  },
  "triggeredLore": []
}
`.trim();

export function suggestNextTurnId(entries: unknown): string {
    if (!Array.isArray(entries) || entries.length === 0) {
        return 'turn-1';
    }
    const last = entries[entries.length - 1];
    if (typeof last !== 'object' || last === null) {
        return 'turn-1';
    }
    const lastId = (last as { id?: unknown }).id;
    if (typeof lastId !== 'string') {
        return 'turn-1';
    }
    const m = /turn-(\d+)$/.exec(lastId);
    if (m) {
        return `turn-${parseInt(m[1], 10) + 1}`;
    }
    return 'turn-1';
}

export function buildRefereePrompt(input: {
    basePrompt: string;
    playerAction: string;
    suggestedTurnId: string;
    diceLedger?: DiceLedgerEntry[];
}): string {
    const diceBlock = input.diceLedger?.length
        ? `\n\n[Dice ledger for this turn]\n${JSON.stringify(input.diceLedger, null, 2)}`
        : '';
    return [
        input.basePrompt,
        REFEREE_INSTRUCTIONS,
        `\n[Suggested turnId] ${input.suggestedTurnId}`,
        `\n[Player action] ${input.playerAction}`,
        diceBlock,
    ].join('\n');
}

export function buildNarratorPrompt(input: {
    basePrompt: string;
    playerAction: string;
    referee: RefereeResultCandidate;
}): string {
    const patchSummary = input.referee.statePatch?.length
        ? JSON.stringify(input.referee.statePatch, null, 2)
        : '[]';
    const notes = input.referee.refereeNotes?.trim() || '(none)';
    return [
        input.basePrompt,
        NARRATOR_INSTRUCTIONS,
        `\n[Player action] ${input.playerAction}`,
        `\n[Referee turnId] ${input.referee.turnId}`,
        `\n[Referee statePatch summary]\n${patchSummary}`,
        `\n[Referee notes]\n${notes}`,
        '\nWrite narration only. Do not modify mechanics.',
    ].join('\n');
}

function clampString(value: unknown, maxLen: number): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function parseDiceLedger(raw: unknown): DiceLedgerEntry[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const out: DiceLedgerEntry[] = [];
    for (const item of raw.slice(0, 20)) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const d = item as Record<string, unknown>;
        if (typeof d.formula !== 'string' || typeof d.total !== 'number' || !Number.isFinite(d.total)) {
            continue;
        }
        const entry: DiceLedgerEntry = {
            formula: d.formula.slice(0, 64),
            rolls: Array.isArray(d.rolls)
                ? d.rolls.filter((r): r is number => typeof r === 'number' && Number.isFinite(r)).slice(0, 20)
                : [],
            modifier: typeof d.modifier === 'number' && Number.isFinite(d.modifier) ? d.modifier : 0,
            total: d.total,
        };
        if (typeof d.reason === 'string') {
            entry.reason = d.reason.slice(0, 200);
        }
        if (typeof d.dc === 'number' && Number.isFinite(d.dc)) {
            entry.dc = d.dc;
        }
        if (typeof d.success === 'boolean') {
            entry.success = d.success;
        }
        out.push(entry);
    }
    return out.length > 0 ? out : undefined;
}

function parseStatePatchOps(raw: unknown): StatePatchOp[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const out: StatePatchOp[] = [];
    for (const item of raw.slice(0, MAX_STATE_PATCH_OPS)) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const p = item as Record<string, unknown>;
        if (p.op !== 'replace' && p.op !== 'add' && p.op !== 'remove') {
            continue;
        }
        if (typeof p.path !== 'string' || !p.path.startsWith('/')) {
            continue;
        }
        const op: StatePatchOp = { op: p.op, path: p.path.slice(0, 256) };
        if (p.op !== 'remove' && 'value' in p) {
            op.value = p.value;
        }
        out.push(op);
    }
    return out.length > 0 ? out : undefined;
}

function parseMedia(raw: unknown): TurnMediaRequest | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const m = raw as Record<string, unknown>;
    const media: TurnMediaRequest = {};
    if (typeof m.bgm === 'string') {
        media.bgm = m.bgm.slice(0, 200);
    }
    if (typeof m.mood === 'string') {
        media.mood = m.mood.slice(0, 200);
    }
    if (typeof m.imagePrompt === 'string') {
        media.imagePrompt = m.imagePrompt.slice(0, 2000);
    }
    if (typeof m.imageMode === 'string') {
        media.imageMode = m.imageMode.slice(0, 64);
    }
    if (typeof m.sfx === 'string') {
        media.sfx = m.sfx.slice(0, 200);
    } else if (Array.isArray(m.sfx)) {
        media.sfx = m.sfx
            .filter((s): s is string => typeof s === 'string')
            .map((s) => s.slice(0, 200))
            .slice(0, 10);
    }
    return Object.keys(media).length > 0 ? media : undefined;
}

function parseGmEntry(raw: unknown): TurnGmEntryMeta | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const g = raw as Record<string, unknown>;
    const entry: TurnGmEntryMeta = {};
    if (typeof g.imagePrompt === 'string') {
        entry.imagePrompt = g.imagePrompt.slice(0, 2000);
    }
    if (typeof g.image === 'string') {
        entry.image = g.image.slice(0, 500);
    }
    if (typeof g.sender === 'string') {
        const sender = g.sender.trim().slice(0, 120);
        if (sender) { entry.sender = sender; }
    }
    if (typeof g.speakerNpcId === 'string' && isValidEntryId(g.speakerNpcId)) {
        entry.speakerNpcId = g.speakerNpcId;
    }
    return Object.keys(entry).length > 0 ? entry : undefined;
}

export interface JsonParseAttemptResult {
    value: unknown | null;
    error?: string;
    repaired: boolean;
}

/** Remove common LLM JSON defects before parse (trailing commas, etc.). */
export function repairJsonForParse(text: string): string {
    let s = String(text ?? '').trim();
    if (!s) {
        return s;
    }
    s = s.replace(/,\s*([}\]])/g, '$1');
    return s;
}

function tryParseJsonCandidate(candidate: string): { value: unknown } | { error: string } {
    try {
        return { value: JSON.parse(candidate) };
    } catch (e) {
        const repaired = repairJsonForParse(candidate);
        if (repaired !== candidate) {
            try {
                return { value: JSON.parse(repaired) };
            } catch (repairedErr) {
                return {
                    error: repairedErr instanceof Error ? repairedErr.message : String(repairedErr),
                };
            }
        }
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export function parseJsonObjectWithRecovery(text: string): JsonParseAttemptResult {
    const trimmed = text.trim();
    if (!trimmed) {
        return { value: null, error: 'empty input', repaired: false };
    }

    const candidates: Array<{ body: string; repaired: boolean }> = [
        { body: trimmed, repaired: false },
        { body: repairJsonForParse(trimmed), repaired: true },
    ];

    const fenced = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i.exec(trimmed);
    if (fenced) {
        candidates.push({ body: fenced[1], repaired: false });
        candidates.push({ body: repairJsonForParse(fenced[1]), repaired: true });
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
        const slice = trimmed.slice(start, end + 1);
        candidates.push({ body: slice, repaired: false });
        candidates.push({ body: repairJsonForParse(slice), repaired: true });
    }

    let lastError = 'no parse candidate succeeded';
    const seen = new Set<string>();
    for (const candidate of candidates) {
        if (!candidate.body || seen.has(candidate.body)) {
            continue;
        }
        seen.add(candidate.body);
        const parsed = tryParseJsonCandidate(candidate.body);
        if ('value' in parsed) {
            return {
                value: parsed.value,
                repaired: candidate.repaired || candidate.body !== trimmed,
            };
        }
        lastError = parsed.error;
    }

    return { value: null, error: lastError, repaired: false };
}

export function extractJsonObject(text: string): unknown | null {
    return parseJsonObjectWithRecovery(text).value;
}

export function parseRefereeResultJson(text: string): RefereeResultCandidate | null {
    const raw = extractJsonObject(text);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const doc = raw as Record<string, unknown>;
    const turnId = typeof doc.turnId === 'string' ? doc.turnId.trim() : '';
    if (!isValidEntryId(turnId)) {
        return null;
    }

    const candidate: RefereeResultCandidate = { turnId };
    const playerAction = clampString(doc.playerAction, 4000);
    if (playerAction) {
        candidate.playerAction = playerAction;
    }
    const diceLedger = parseDiceLedger(doc.diceLedger);
    if (diceLedger) {
        candidate.diceLedger = diceLedger;
    }
    const statePatch = parseStatePatchOps(doc.statePatch);
    if (statePatch) {
        candidate.statePatch = statePatch;
    }
    if (Array.isArray(doc.resolvedQuests)) {
        const resolved = doc.resolvedQuests
            .filter((id): id is string => typeof id === 'string' && isValidEventId(id))
            .slice(0, 20);
        if (resolved.length > 0) {
            candidate.resolvedQuests = resolved;
        }
    }
    const media = parseMedia(doc.media);
    if (media) {
        candidate.media = media;
    }
    const refereeNotes = clampString(doc.refereeNotes, MAX_REFEREE_NOTES_LEN);
    if (refereeNotes) {
        candidate.refereeNotes = refereeNotes;
    }
    const cartographyReveal = parseCartographyReveal(doc.cartographyReveal);
    if (cartographyReveal) {
        candidate.cartographyReveal = cartographyReveal;
    }
    const elapsedWorldTurns = clampElapsedWorldTurns(doc.elapsedWorldTurns, 100);
    if (elapsedWorldTurns > 0) {
        candidate.elapsedWorldTurns = elapsedWorldTurns;
    }
    const tradeOps = parseTradeOps(doc.tradeOps);
    if (tradeOps.length > 0) {
        candidate.tradeOps = tradeOps;
    }
    const npcAgencyOps = parseNpcAgencyOps(doc.npcAgencyOps);
    if (npcAgencyOps.length > 0) {
        candidate.npcAgencyOps = npcAgencyOps;
    }
    const domainOps = parseDomainOps(doc.domainOps);
    if (domainOps) {
        candidate.domainOps = domainOps;
    }
    const discoveryOps = parseDiscoveryOps(doc.discoveryOps);
    if (discoveryOps.length > 0) {
        candidate.discoveryOps = discoveryOps;
    }
    return candidate;
}

export function parseNarratorResultJson(text: string): NarratorResultCandidate | null {
    const raw = extractJsonObject(text);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const doc = raw as Record<string, unknown>;
    // Narrator must never supply mechanical fields.
    void doc.statePatch;
    void doc.diceLedger;
    void doc.resolvedQuests;

    const narration = clampString(doc.narration, MAX_ENTRY_CONTENT_LEN);
    if (!narration) {
        return null;
    }

    const candidate: NarratorResultCandidate = { narration };
    const gmEntry = parseGmEntry(doc.gmEntry);
    if (gmEntry) {
        candidate.gmEntry = gmEntry;
    }
    const media = parseMedia(doc.media);
    if (media) {
        candidate.media = media;
    }
    if (Array.isArray(doc.triggeredLore)) {
        const lore = doc.triggeredLore
            .filter((l): l is string => typeof l === 'string')
            .map((l) => l.trim().slice(0, MAX_TRIGGERED_LORE_LABEL_LEN))
            .filter(Boolean)
            .slice(0, MAX_TRIGGERED_LORE);
        if (lore.length > 0) {
            candidate.triggeredLore = lore;
        }
    }
    return candidate;
}

export function mergeAgenticMedia(
    referee?: TurnMediaRequest,
    narrator?: TurnMediaRequest
): TurnMediaRequest | undefined {
    if (!referee && !narrator) {
        return undefined;
    }
    const merged: TurnMediaRequest = { ...(referee ?? {}) };
    if (!narrator) {
        return Object.keys(merged).length > 0 ? merged : undefined;
    }
    if (narrator.bgm) { merged.bgm = narrator.bgm; }
    if (narrator.mood) { merged.mood = narrator.mood; }
    if (narrator.imagePrompt) { merged.imagePrompt = narrator.imagePrompt; }
    if (narrator.imageMode) { merged.imageMode = narrator.imageMode; }
    if (narrator.sfx !== undefined) {
        merged.sfx = narrator.sfx;
    }
    return Object.keys(merged).length > 0 ? merged : undefined;
}

export function buildFallbackNarration(referee: RefereeResultCandidate): string {
    const notes = referee.refereeNotes?.trim();
    if (notes) {
        return `The world shifts in response to your action. ${notes}`;
    }
    return 'The world shifts in response to your action.';
}

export function mergeAgenticTurnResult(input: {
    playerAction: string;
    referee: RefereeResultCandidate;
    narrator?: NarratorResultCandidate | null;
    fallbackNarration: string;
    provider: AgenticGmProvider;
    promptReceipt?: TurnResultPromptReceiptMeta;
}): AgenticMergeResult {
    const { referee, narrator, fallbackNarration } = input;
    if (!isValidEntryId(referee.turnId)) {
        return { ok: false, reason: 'invalid referee turnId' };
    }

    const narration = clampString(narrator?.narration, MAX_ENTRY_CONTENT_LEN)
        ?? clampString(fallbackNarration, MAX_ENTRY_CONTENT_LEN);
    if (!narration) {
        return { ok: false, reason: 'missing narration' };
    }

    const playerAction = clampString(input.playerAction, 4000) ?? referee.playerAction;

    const result: TurnResult = {
        turnId: referee.turnId,
        narration,
        ...(input.promptReceipt ? { promptReceipt: input.promptReceipt } : {}),
        agentic: {
            mode: 'referee-narrator',
            refereeOk: true,
            narratorOk: Boolean(narrator?.narration),
            refereeProvider: input.provider,
            narratorProvider: input.provider,
        },
    };

    if (playerAction) {
        result.playerAction = playerAction;
    }
    if (referee.diceLedger?.length) {
        result.diceLedger = referee.diceLedger;
    }
    if (referee.statePatch?.length) {
        result.statePatch = referee.statePatch;
    }
    if (referee.resolvedQuests?.length) {
        result.resolvedQuests = referee.resolvedQuests;
    }
    if (referee.cartographyReveal) {
        result.cartographyReveal = referee.cartographyReveal;
    }
    if (referee.elapsedWorldTurns && referee.elapsedWorldTurns > 0) {
        result.elapsedWorldTurns = referee.elapsedWorldTurns;
    }
    if (referee.tradeOps?.length) {
        result.tradeOps = referee.tradeOps;
    }
    if (referee.npcAgencyOps?.length) {
        result.npcAgencyOps = referee.npcAgencyOps;
    }
    if (referee.domainOps) {
        result.domainOps = referee.domainOps;
    }
    if (referee.discoveryOps?.length) {
        result.discoveryOps = referee.discoveryOps;
    }
    const media = mergeAgenticMedia(referee.media, narrator?.media);
    if (media) {
        result.media = media;
    }
    if (narrator?.gmEntry) {
        result.gmEntry = narrator.gmEntry;
    }
    if (narrator?.triggeredLore?.length) {
        result.triggeredLore = narrator.triggeredLore;
    }

    return { ok: true, result };
}
