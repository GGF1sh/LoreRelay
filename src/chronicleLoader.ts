// F1 Chronicle: workspace journal reader (fs allowed).

import * as fs from 'fs';
import * as path from 'path';
import { parseJournalNdjsonContent, MAX_JOURNAL_PARSE_LINES } from './chronicleJournalCore';
import { buildChronicle, type ChronicleChapter } from './chronicleCore';
import { loadWorldState } from './worldState';
import { loadWorldForge } from './worldForge';

export const MAX_JOURNAL_READ_BYTES = 2 * 1024 * 1024;

export function readJournalTurnsFromPath(
    journalPath: string,
    maxLines: number = MAX_JOURNAL_PARSE_LINES
): ReturnType<typeof parseJournalNdjsonContent> {
    try {
        if (!fs.existsSync(journalPath)) { return []; }
        const stats = fs.statSync(journalPath);
        if (stats.size > MAX_JOURNAL_READ_BYTES) { return []; }
        const raw = fs.readFileSync(journalPath, 'utf-8');
        return parseJournalNdjsonContent(raw, maxLines);
    } catch {
        return [];
    }
}

export function buildChronicleForWorkspace(wsPath: string): ChronicleChapter[] {
    const journalPath = path.join(wsPath, 'state_journal.ndjson');
    const journalTurns = readJournalTurnsFromPath(journalPath);
    const worldState = loadWorldState();
    const forge = loadWorldForge();
    const regionNames: Record<string, string> = {};
    if (forge?.geography?.regions) {
        for (const region of forge.geography.regions) {
            if (region.id && region.name) {
                regionNames[region.id] = region.name;
            }
        }
    }
    return buildChronicle({
        journalTurns,
        recentChanges: worldState?.recentChanges,
        questHooks: worldState?.questHooks,
        regionNames
    });
}