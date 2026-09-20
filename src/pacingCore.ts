// F2 Pacing Director: deterministic beat skew detection (no vscode/fs).

import type { JournalTurnLike } from './chronicleJournalCore';
import {
    type Beat,
    classifyTurnBeat,
    emptyBeatCounts,
} from './journalBeatCore';

export type { Beat };

export const DEFAULT_PACING_WINDOW_SIZE = 5;
export const DEFAULT_PACING_DOMINANCE_THRESHOLD = 0.8;
export const MIN_PACING_SAMPLE_SIZE = 2;

const BEAT_ORDER: Beat[] = ['combat', 'social', 'exploration', 'travel', 'downtime'];

export interface PacingWindow {
    counts: Record<Beat, number>;
    dominant: Beat;
    ratio: number;
    sampleSize: number;
}

export interface PacingHint {
    beat: Beat;
    ratio: number;
}

export function analyzeRecentPacing(
    turns: JournalTurnLike[],
    windowSize: number = DEFAULT_PACING_WINDOW_SIZE
): PacingWindow {
    const size = Math.max(1, Math.min(20, Math.floor(windowSize)));
    const window = (turns ?? []).slice(-size);
    const counts = emptyBeatCounts();
    for (const turn of window) {
        counts[classifyTurnBeat(turn)]++;
    }
    const sampleSize = window.length;
    const total = sampleSize > 0 ? sampleSize : 1;
    let dominant: Beat = 'downtime';
    let max = 0;
    for (const beat of BEAT_ORDER) {
        if (counts[beat] > max) {
            max = counts[beat];
            dominant = beat;
        }
    }
    return {
        counts,
        dominant,
        ratio: max / total,
        sampleSize
    };
}

/**
 * Returns hint metadata when dominance exceeds threshold; otherwise undefined.
 * Hint text is resolved by the caller (i18n).
 */
export function resolvePacingHint(
    window: PacingWindow,
    threshold: number = DEFAULT_PACING_DOMINANCE_THRESHOLD
): PacingHint | undefined {
    const minRatio = Math.max(0.5, Math.min(1, threshold));
    if (window.sampleSize < MIN_PACING_SAMPLE_SIZE) { return undefined; }
    if (window.ratio < minRatio) { return undefined; }
    return { beat: window.dominant, ratio: window.ratio };
}

/** Build a one-line pacing hint or empty string when no skew. */
export function buildPacingHintLine(
    window: PacingWindow,
    threshold: number,
    formatBeatHint: (beat: Beat) => string
): string {
    const hint = resolvePacingHint(window, threshold);
    if (!hint) { return ''; }
    const text = formatBeatHint(hint.beat).trim();
    if (!text) { return ''; }
    return `[Director — Pacing] ${text}`;
}