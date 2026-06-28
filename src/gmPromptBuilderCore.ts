import type { WorldChangeEvent } from './worldEventLogCore';
import { pruneExpiredEvents } from './worldEventLogCore';

/** Cap lorebook / memory hint text injected into GM prompts. */
export const MAX_HINT_TEXT_CHARS = 6000;

/** Max world-change lines injected after a simulation step. */
export const MAX_WORLD_CHANGE_SUMMARY_LINES = 4;

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
        recent = `…${recent.slice(-(budget - 1))}`;
    }
    return `${recent}\n${actionPart}`;
}

/**
 * Summarize the latest simulation step's non-info world events for GM injection.
 * Returns empty string when nothing noteworthy should be injected.
 */
export function buildWorldChangeSummaryFromChanges(
    recentChanges: WorldChangeEvent[],
    currentWorldTurn: number
): string {
    const pruned = pruneExpiredEvents(recentChanges, currentWorldTurn);
    if (pruned.length === 0) {
        return '';
    }

    const latestTurn = Math.max(...pruned.map((e) => e.worldTurn));
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