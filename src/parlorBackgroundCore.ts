/** Pure Parlor background gallery helpers. */

export const PARLOR_BACKGROUNDS_DIR = 'backgrounds';
const BG_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const BG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export interface ParlorBackgroundEntry {
    id: string;
    filename: string;
    label: string;
}

export function isParlorBackgroundFilename(filename: string): boolean {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    return BG_EXT.has(ext) && !filename.includes('..') && !filename.includes('/') && !filename.includes('\\');
}

export function backgroundIdFromFilename(filename: string): string {
    const base = filename.replace(/\.[^.]+$/, '');
    const id = base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    return BG_ID_PATTERN.test(id) ? id : `bg_${id.slice(0, 58)}`;
}

export function listParlorBackgroundEntries(filenames: string[]): ParlorBackgroundEntry[] {
    const entries: ParlorBackgroundEntry[] = [];
    const seen = new Set<string>();
    for (const filename of filenames) {
        if (!isParlorBackgroundFilename(filename)) {
            continue;
        }
        let id = backgroundIdFromFilename(filename);
        if (seen.has(id)) {
            id = `${id}_${entries.length}`;
        }
        seen.add(id);
        entries.push({
            id,
            filename,
            label: filename.replace(/\.[^.]+$/, ''),
        });
    }
    return entries.slice(0, 48);
}