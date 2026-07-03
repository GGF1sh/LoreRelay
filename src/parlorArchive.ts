import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import type { ParlorSession } from './parlorSessionCore';
import {
    PARLOR_ARCHIVE_FILENAME,
    ParlorArchiveRecord,
    buildParlorArchiveSummaryDelta,
    extractParlorArchiveBatch,
    mergeParlorSessionSummary,
    serializeParlorArchiveRecord,
} from './parlorArchiveCore';

function resolveParlorArchivePath(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const base = path.resolve(ws);
    const resolved = path.resolve(base, PARLOR_ARCHIVE_FILENAME);
    if (!resolved.startsWith(base + path.sep)) {
        return undefined;
    }
    return resolved;
}

export function appendParlorArchiveRecords(records: ParlorArchiveRecord[]): void {
    const filePath = resolveParlorArchivePath();
    if (!filePath || records.length === 0) {
        return;
    }
    const lines = records.map((r) => serializeParlorArchiveRecord(r)).join('\n') + '\n';
    fs.appendFileSync(filePath, lines, 'utf-8');
}

export function compactParlorSessionWithArchive(
    session: ParlorSession,
    characterName: string,
    locale = 'en'
): ParlorSession {
    const { session: compacted, archived } = extractParlorArchiveBatch(session);
    if (archived.length === 0) {
        return session;
    }
    appendParlorArchiveRecords([{
        archivedAt: new Date().toISOString(),
        activeCharacterId: session.activeCharacterId,
        messages: archived,
    }]);
    const delta = buildParlorArchiveSummaryDelta(archived, characterName, locale);
    const summary = mergeParlorSessionSummary(compacted.summary, delta);
    return summary ? { ...compacted, summary } : compacted;
}