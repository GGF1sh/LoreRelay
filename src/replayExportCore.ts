// F5 Replay Export: deterministic markdown/html from entries + chronicle (no vscode/fs).

import type { ChronicleChapter } from './chronicleCore';
import type { MapOverlaySnapshot } from './mapOverlayCore';
import { pickOverlayMarkerKeys } from './mapOverlayCore';
import { pickReplayExportEntries } from './replayExportSanitizeCore';
import type { DiceLedgerEntry } from './types/TurnResult';

export interface GameEntryLike {
    id: string;
    role: 'gm' | 'user';
    sender: string;
    content: string;
    speakerNpcId?: string;
    image?: string;
    rawImagePath?: string;
    imagePrompt?: string;
    imageBlocked?: boolean;
    excludedFromPrompt?: boolean;
}

export interface GalleryLike {
    imagePath: string;
    locationId?: string;
    worldTurn?: number;
    prompt?: string;
    description?: string;
}

export interface ReplayJournalTurn {
    diceLedger?: DiceLedgerEntry[];
}

export type ReplayFormat = 'markdown' | 'html';

export interface ReplayOptions {
    includeImages: boolean;
    includeGm: boolean;
    includeDice: boolean;
    format: ReplayFormat;
}

export interface ReplayBuildInput {
    entries: GameEntryLike[];
    chapters?: ChronicleChapter[];
    gallery?: GalleryLike[];
    journalTurns?: ReplayJournalTurn[];
    options: ReplayOptions;
    title?: string;
    /** Absolute export path — used to build relative image URLs. */
    exportPath?: string;
    resolveRelativeImage?: (imagePath: string) => string | undefined;
    /** FoW-safe map overlay at export time (M2 choke point). */
    mapOverlay?: MapOverlaySnapshot;
}

function escapeHtml(text: string): string {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeMarkdown(text: string): string {
    return String(text ?? '').replace(/\r\n/g, '\n');
}

export function formatMapOverlayMarkdownAppendix(snapshot: MapOverlaySnapshot | undefined): string {
    if (!snapshot?.markers?.length) { return ''; }
    const lines = [
        '',
        '---',
        '',
        '## Map overlay (export snapshot)',
        '',
        'FoW-safe qualitative markers at export time.',
        '',
    ];
    for (const marker of snapshot.markers) {
        const picked = pickOverlayMarkerKeys(marker);
        const kind = String(picked.kind ?? 'marker');
        const label = escapeMarkdown(String(picked.label ?? ''));
        const x = Number(picked.x ?? 0);
        const y = Number(picked.y ?? 0);
        const vis = picked.fogVisibility === 'rumored' ? 'rumored' : 'discovered';
        lines.push(`- [${kind}] ${label} @ (${x},${y}) — ${vis}`);
    }
    return `${lines.join('\n')}\n`;
}

export function formatMapOverlayHtmlAppendix(snapshot: MapOverlaySnapshot | undefined): string {
    if (!snapshot?.markers?.length) { return ''; }
    const items = snapshot.markers.map((marker) => {
        const picked = pickOverlayMarkerKeys(marker);
        const kind = escapeHtml(String(picked.kind ?? 'marker'));
        const label = escapeHtml(String(picked.label ?? ''));
        const x = Number(picked.x ?? 0);
        const y = Number(picked.y ?? 0);
        const vis = picked.fogVisibility === 'rumored' ? 'rumored' : 'discovered';
        return `<li><code>${kind}</code> ${label} @ (${x},${y}) — ${vis}</li>`;
    }).join('\n');
    return `
<section class="map-overlay-appendix">
<h2>Map overlay (export snapshot)</h2>
<p><em>FoW-safe qualitative markers at export time.</em></p>
<ul>
${items}
</ul>
</section>`;
}

/** Markdown image ref safe for paths with spaces or parentheses. */
export function formatMarkdownImageRef(relativePath: string, alt = 'Scene'): string {
    const p = String(relativePath ?? '').trim();
    if (!p) { return ''; }
    const dest = /[\s()]/.test(p) ? `<${p}>` : p;
    return `![${alt}](${dest})`;
}

function shouldIncludeEntry(entry: GameEntryLike, options: ReplayOptions): boolean {
    if (entry.excludedFromPrompt) { return false; }
    if (entry.role === 'gm' && !options.includeGm) { return false; }
    const content = (entry.content || '').trim();
    if (!content && !entry.image) { return false; }
    return true;
}

function buildChapterHeadings(chapters: ChronicleChapter[] | undefined): Map<number, string> {
    const headings = new Map<number, string>();
    for (const chapter of chapters ?? []) {
        const gmTurn = chapter.events.find((e) => e.gmTurn !== undefined)?.gmTurn;
        if (gmTurn !== undefined && chapter.title) {
            headings.set(gmTurn, chapter.title);
        }
    }
    return headings;
}

function formatDiceBlock(ledger: DiceLedgerEntry[] | undefined, format: ReplayFormat): string {
    if (!ledger?.length) { return ''; }
    const lines = ledger.map((d) => {
        const reason = d.reason ? ` (${d.reason})` : '';
        const dc = d.dc !== undefined ? ` vs DC ${d.dc}` : '';
        const outcome = d.success !== undefined ? (d.success ? ' success' : ' fail') : '';
        return `${d.formula} → ${d.total}${dc}${outcome}${reason}`;
    });
    if (format === 'html') {
        return `<div class="dice"><strong>Dice</strong><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul></div>`;
    }
    return `> **Dice:** ${lines.join('; ')}\n`;
}

function resolveEntryImage(
    entry: GameEntryLike,
    gallery: GalleryLike[],
    options: ReplayOptions,
    resolveRelativeImage?: (imagePath: string) => string | undefined
): string | undefined {
    if (!options.includeImages || entry.imageBlocked) { return undefined; }
    const candidates = [
        entry.rawImagePath,
        entry.image?.replace(/^file:\/\//i, '').replace(/\//g, '\\'),
    ].filter((p): p is string => typeof p === 'string' && p.length > 0);
    for (const candidate of candidates) {
        const rel = resolveRelativeImage?.(candidate);
        if (rel) { return rel; }
    }
    return undefined;
}

function pickGalleryExtras(
    gmTurn: number,
    gallery: GalleryLike[],
    usedPaths: Set<string>,
    options: ReplayOptions,
    resolveRelativeImage?: (imagePath: string) => string | undefined
): string[] {
    if (!options.includeImages) { return []; }
    const out: string[] = [];
    for (const item of gallery) {
        if (!item.imagePath || usedPaths.has(item.imagePath)) { continue; }
        if (item.worldTurn !== undefined && item.worldTurn !== gmTurn) { continue; }
        const rel = resolveRelativeImage?.(item.imagePath);
        if (rel) {
            usedPaths.add(item.imagePath);
            out.push(rel);
        }
    }
    return out;
}

export function buildReplayDocument(input: ReplayBuildInput): string {
    if (input.options.format === 'html') {
        return buildReplayHtml(input);
    }
    return buildReplayMarkdown(input);
}

export function buildReplayMarkdown(input: ReplayBuildInput): string {
    const options = input.options;
    const title = escapeMarkdown(input.title?.trim() || 'LoreRelay Replay');
    const chapterHeadings = buildChapterHeadings(input.chapters);
    const usedGallery = new Set<string>();
    const lines: string[] = [`# ${title}`, ''];
    const entries = pickReplayExportEntries(input.entries as unknown[]);

    let gmTurn = 0;
    let journalIndex = 0;

    for (const entry of entries) {
        if (!shouldIncludeEntry(entry, options)) { continue; }

        if (entry.role === 'gm') {
            gmTurn++;
            const heading = chapterHeadings.get(gmTurn);
            if (heading) {
                lines.push(`## ${heading}`, '');
            }
        }

        const speaker = escapeMarkdown(entry.sender || (entry.role === 'gm' ? 'GM' : 'Player'));
        lines.push(`**${speaker}**`, '');
        lines.push(escapeMarkdown(entry.content || ''), '');

        if (entry.role === 'gm' && options.includeDice) {
            const dice = input.journalTurns?.[journalIndex]?.diceLedger;
            if (dice?.length) {
                lines.push(formatDiceBlock(dice, 'markdown'), '');
            }
            journalIndex++;
        }

        const imageRel = resolveEntryImage(entry, input.gallery ?? [], options, input.resolveRelativeImage);
        if (imageRel) {
            lines.push(formatMarkdownImageRef(imageRel), '');
            if (entry.rawImagePath) { usedGallery.add(entry.rawImagePath); }
        }

        if (entry.role === 'gm') {
            for (const extra of pickGalleryExtras(
                gmTurn,
                input.gallery ?? [],
                usedGallery,
                options,
                input.resolveRelativeImage
            )) {
                lines.push(formatMarkdownImageRef(extra), '');
            }
        }
    }

    if (lines.length <= 2) {
        const empty = `# ${title}\n\n_(No exportable entries.)_\n`;
        return `${empty}${formatMapOverlayMarkdownAppendix(input.mapOverlay)}`;
    }
    return `${lines.join('\n').trim()}\n${formatMapOverlayMarkdownAppendix(input.mapOverlay)}`;
}

export function buildReplayHtml(input: ReplayBuildInput): string {
    const options = input.options;
    const title = escapeHtml(input.title?.trim() || 'LoreRelay Replay');
    const chapterHeadings = buildChapterHeadings(input.chapters);
    const usedGallery = new Set<string>();
    const body: string[] = [];
    const entries = pickReplayExportEntries(input.entries as unknown[]);

    let gmTurn = 0;
    let journalIndex = 0;

    for (const entry of entries) {
        if (!shouldIncludeEntry(entry, options)) { continue; }

        if (entry.role === 'gm') {
            gmTurn++;
            const heading = chapterHeadings.get(gmTurn);
            if (heading) {
                body.push(`<h2>${escapeHtml(heading)}</h2>`);
            }
        }

        const roleClass = entry.role === 'gm' ? 'gm' : 'user';
        const speaker = escapeHtml(entry.sender || (entry.role === 'gm' ? 'GM' : 'Player'));
        body.push(`<article class="entry ${roleClass}">`);
        body.push(`<div class="speaker">${speaker}</div>`);
        body.push(`<div class="content">${escapeHtml(entry.content || '')}</div>`);

        if (entry.role === 'gm' && options.includeDice) {
            const dice = input.journalTurns?.[journalIndex]?.diceLedger;
            const diceHtml = formatDiceBlock(dice, 'html');
            if (diceHtml) { body.push(diceHtml); }
            journalIndex++;
        }

        const imageRel = resolveEntryImage(entry, input.gallery ?? [], options, input.resolveRelativeImage);
        if (imageRel) {
            body.push(`<figure class="scene"><img src="${escapeHtml(imageRel)}" alt="Scene" /></figure>`);
            if (entry.rawImagePath) { usedGallery.add(entry.rawImagePath); }
        }

        if (entry.role === 'gm') {
            for (const extra of pickGalleryExtras(
                gmTurn,
                input.gallery ?? [],
                usedGallery,
                options,
                input.resolveRelativeImage
            )) {
                body.push(`<figure class="scene"><img src="${escapeHtml(extra)}" alt="Scene" /></figure>`);
            }
        }

        body.push('</article>');
    }

    const inner = body.length > 0
        ? body.join('\n')
        : '<p><em>No exportable entries.</em></p>';

    const overlayAppendix = formatMapOverlayHtmlAppendix(input.mapOverlay);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: Georgia, "Noto Serif JP", serif; background: #1a1a1e; color: #e8e6e3; padding: 2rem; max-width: 46rem; margin: 0 auto; line-height: 1.65; }
  h1 { font-size: 1.6rem; border-bottom: 1px solid #444; padding-bottom: 0.5rem; }
  h2 { font-size: 1.15rem; color: #c9b896; margin-top: 2rem; }
  .entry { margin: 1.25rem 0; padding: 1rem 1.1rem; border-radius: 8px; background: #25252b; border-left: 4px solid #555; }
  .entry.user { border-left-color: #4a8fd4; }
  .entry.gm { border-left-color: #c07070; }
  .speaker { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.75; margin-bottom: 0.5rem; }
  .content { white-space: pre-wrap; }
  .scene img { max-width: 100%; border-radius: 6px; margin-top: 0.75rem; }
  .dice { font-size: 0.85rem; opacity: 0.85; margin-top: 0.5rem; }
  .dice ul { margin: 0.35rem 0 0 1.1rem; padding: 0; }
  .map-overlay-appendix { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #444; font-size: 0.92rem; }
  .map-overlay-appendix ul { margin: 0.5rem 0 0 1.1rem; padding: 0; }
</style>
</head>
<body>
<h1>${title}</h1>
${inner}
${overlayAppendix}
</body>
</html>
`;
}