// F1 Chronicle: deterministic timeline from journal + world events (no vscode/fs).

import type { JournalTurnLike } from './chronicleJournalCore';
import {
    findDirectorSceneChange,
    findLocationChange,
    isCombatTurn,
} from './journalBeatCore';
import type { WorldChangeEvent } from './worldEventLogCore';
import type { QuestHook } from './worldStateCore';

export const MAX_CHRONICLE_EVENT_TEXT = 120;
export const DEFAULT_CHRONICLE_RECAP_LINES = 5;
export const DEFAULT_CHRONICLE_RECAP_CHARS = 800;
export const CHAPTER_ELAPSED_JUMP = 3;
export const CHAPTER_TURN_ACCUM = 10;
export const MAX_CHRONICLE_CHAPTERS = 50;
export const MAX_CHRONICLE_EVENTS = 500;

export type ChronicleEventKind = 'quest' | 'world' | 'travel' | 'combat' | 'milestone';

export interface ChronicleEvent {
    worldTurn: number;
    gmTurn?: number;
    kind: ChronicleEventKind;
    text: string;
    regionId?: string;
    factionId?: string;
    npcId?: string;
}

export interface ChronicleChapter {
    index: number;
    title: string;
    events: ChronicleEvent[];
}

export interface ChronicleInput {
    journalTurns: JournalTurnLike[];
    recentChanges?: WorldChangeEvent[];
    questHooks?: QuestHook[];
    regionNames?: Record<string, string>;
    chapterTurnThreshold?: number;
}

function clampEventText(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length <= MAX_CHRONICLE_EVENT_TEXT) { return trimmed; }
    return `${trimmed.slice(0, MAX_CHRONICLE_EVENT_TEXT - 1)}…`;
}

function questTitleById(questHooks: QuestHook[] | undefined, id: string): string {
    const hook = questHooks?.find((q) => q.id === id);
    return hook?.title?.trim() || id;
}

function regionLabel(regionId: string, regionNames?: Record<string, string>): string {
    return regionNames?.[regionId]?.trim() || regionId;
}

function extractJournalEvents(
    turn: JournalTurnLike,
    gmTurn: number,
    questHooks: QuestHook[] | undefined,
    regionNames: Record<string, string> | undefined
): ChronicleEvent[] {
    const events: ChronicleEvent[] = [];
    const worldTurn = gmTurn;

    for (const questId of turn.resolvedQuests ?? []) {
        const title = questTitleById(questHooks, questId);
        events.push({
            worldTurn,
            gmTurn,
            kind: 'quest',
            text: clampEventText(`Quest completed: ${title}`)
        });
    }

    if (turn.elapsedWorldTurns && turn.elapsedWorldTurns > 0) {
        events.push({
            worldTurn,
            gmTurn,
            kind: 'travel',
            text: clampEventText(`${turn.elapsedWorldTurns} day(s) passed`)
        });
    }

    const locationId = findLocationChange(turn.statePatch);
    if (locationId) {
        events.push({
            worldTurn,
            gmTurn,
            kind: 'travel',
            text: clampEventText(`Moved to ${locationId}`)
        });
    }

    for (const region of turn.cartographyReveal?.regions ?? []) {
        const label = regionLabel(region.regionId, regionNames);
        const strength = region.strength === 'rumored' ? 'rumor' : 'discovery';
        events.push({
            worldTurn,
            gmTurn,
            kind: 'milestone',
            regionId: region.regionId,
            text: clampEventText(`Map ${strength}: ${label}`)
        });
    }

    const scene = findDirectorSceneChange(turn.statePatch);
    if (scene) {
        events.push({
            worldTurn,
            gmTurn,
            kind: 'milestone',
            text: clampEventText(`Scene: ${scene}`)
        });
    }

    if (isCombatTurn(turn)) {
        const topRoll = turn.diceLedger?.[0];
        const detail = topRoll
            ? `${topRoll.formula}=${topRoll.total}${topRoll.reason ? ` (${topRoll.reason})` : ''}`
            : 'Combat';
        events.push({
            worldTurn,
            gmTurn,
            kind: 'combat',
            text: clampEventText(detail)
        });
    }

    return events;
}

function extractWorldChangeEvents(changes: WorldChangeEvent[] | undefined): ChronicleEvent[] {
    const events: ChronicleEvent[] = [];
    for (const ev of changes ?? []) {
        if (ev.severity === 'info') { continue; }
        events.push({
            worldTurn: ev.worldTurn,
            kind: 'world',
            text: clampEventText(ev.message),
            regionId: ev.regionId,
            factionId: ev.factionId
        });
    }
    return events;
}

function shouldStartNewChapter(
    turn: JournalTurnLike,
    turnsInChapter: number,
    chapterTurnThreshold: number
): boolean {
    if ((turn.elapsedWorldTurns ?? 0) >= CHAPTER_ELAPSED_JUMP) { return true; }
    if (findDirectorSceneChange(turn.statePatch)) { return true; }
    if (turnsInChapter >= chapterTurnThreshold) { return true; }
    return false;
}

function chapterTitle(index: number, scene?: string): string {
    if (scene) {
        return clampEventText(`Chapter ${index} — ${scene}`);
    }
    return `Chapter ${index}`;
}

/** Build chapter-grouped chronicle from journal + world changes + quest metadata. */
export function buildChronicle(input: ChronicleInput): ChronicleChapter[] {
    const journalTurns = input.journalTurns ?? [];
    const chapterTurnThreshold = Math.max(3, Math.min(50, input.chapterTurnThreshold ?? CHAPTER_TURN_ACCUM));
    const regionNames = input.regionNames;

    const timeline: ChronicleEvent[] = [];
    for (let i = 0; i < journalTurns.length; i++) {
        const gmTurn = i + 1;
        timeline.push(...extractJournalEvents(journalTurns[i], gmTurn, input.questHooks, regionNames));
    }
    timeline.push(...extractWorldChangeEvents(input.recentChanges));

    if (timeline.length === 0) { return []; }

    timeline.sort((a, b) => {
        if (a.worldTurn !== b.worldTurn) { return a.worldTurn - b.worldTurn; }
        return (a.gmTurn ?? 0) - (b.gmTurn ?? 0);
    });

    const capped = timeline.slice(-MAX_CHRONICLE_EVENTS);
    const chapters: ChronicleChapter[] = [];
    let chapterIndex = 1;
    let turnsInChapter = 0;
    let currentEvents: ChronicleEvent[] = [];
    let currentScene: string | undefined;

    for (let i = 0; i < journalTurns.length; i++) {
        const turn = journalTurns[i];
        const gmTurn = i + 1;
        const scene = findDirectorSceneChange(turn.statePatch);
        if (chapters.length === 0 && currentEvents.length === 0) {
            currentScene = scene;
        } else if (shouldStartNewChapter(turn, turnsInChapter, chapterTurnThreshold)) {
            if (currentEvents.length > 0) {
                chapters.push({
                    index: chapterIndex,
                    title: chapterTitle(chapterIndex, currentScene),
                    events: currentEvents
                });
                chapterIndex++;
                if (chapters.length >= MAX_CHRONICLE_CHAPTERS) { break; }
            }
            currentEvents = [];
            currentScene = scene;
            turnsInChapter = 0;
        } else if (scene) {
            currentScene = scene;
        }
        turnsInChapter++;

        const turnEvents = capped.filter((e) => e.gmTurn === gmTurn);
        currentEvents.push(...turnEvents);
    }

    const worldOnly = capped.filter((e) => e.gmTurn === undefined);
    currentEvents.push(...worldOnly);

    if (currentEvents.length > 0 && chapters.length < MAX_CHRONICLE_CHAPTERS) {
        chapters.push({
            index: chapterIndex,
            title: chapterTitle(chapterIndex, currentScene),
            events: currentEvents
        });
    }

    if (chapters.length === 0 && capped.length > 0) {
        chapters.push({
            index: 1,
            title: chapterTitle(1),
            events: capped
        });
    }

    return chapters;
}

/** Flatten chapters into a recap string capped by line/char limits. */
export function buildChronicleRecap(
    chapters: ChronicleChapter[],
    maxLines: number = DEFAULT_CHRONICLE_RECAP_LINES,
    maxChars: number = DEFAULT_CHRONICLE_RECAP_CHARS
): string {
    const lineCap = Math.max(1, Math.min(20, Math.floor(maxLines)));
    const charCap = Math.max(80, Math.min(4000, Math.floor(maxChars)));
    const allEvents = chapters.flatMap((ch) => ch.events);
    if (allEvents.length === 0) { return ''; }

    const sorted = [...allEvents].sort((a, b) => {
        if (a.worldTurn !== b.worldTurn) { return a.worldTurn - b.worldTurn; }
        return (a.gmTurn ?? 0) - (b.gmTurn ?? 0);
    });

    const lines = sorted.slice(-lineCap).map((e) => e.text).filter(Boolean);
    let recap = lines.join('\n').trim();
    if (!recap) { return ''; }
    if (recap.length > charCap) {
        recap = recap.slice(-charCap);
        const nl = recap.indexOf('\n');
        if (nl > 0 && nl < recap.length - 24) {
            recap = recap.slice(nl + 1);
        }
    }
    return recap.trim();
}

/** Whether chronicle recap should inject (session resume or new journal content). */
export function shouldInjectChronicle(
    chronicleSourceTurn: number,
    lastInjectedTurn: number | undefined,
    sessionPending: boolean
): boolean {
    if (chronicleSourceTurn <= 0) { return false; }
    if (sessionPending) { return true; }
    return (lastInjectedTurn ?? -1) < chronicleSourceTurn;
}

export function resolveChronicleSourceTurn(journalTurnCount: number): number {
    return Math.max(0, Math.floor(journalTurnCount));
}