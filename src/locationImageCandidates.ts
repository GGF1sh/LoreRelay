import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { writeJsonAtomic } from './workspacePaths';
import { isValidEventId } from './worldEventLogCore';
import { resolveAllowedImagePath as resolveUnderRoots } from './mediaPathCore';

/** Presentation receipts only: never feed generated scenery back into GM memory. */
export interface LocationImageCandidate {
    worldKey: string;
    locationId: string;
    imagePath: string;
    prompt: string;
    createdAt: string;
    worldTurn?: number;
}

function directory(workspace: string): string {
    const root = fs.realpathSync(workspace);
    let dir = root;
    for (const part of ['.text-adventure', 'location-images']) {
        dir = path.join(dir, part);
        if (fs.existsSync(dir) && (fs.lstatSync(dir).isSymbolicLink() || !fs.statSync(dir).isDirectory())) {
            throw new Error('Unsafe location image directory');
        }
    }
    return dir;
}

export function saveLocationImageCandidate(workspace: string, candidate: LocationImageCandidate): void {
    if (!isValidEventId(candidate.locationId) || !candidate.worldKey) throw new Error('Invalid location image target');
    const imagePath = resolveUnderRoots(candidate.imagePath, [workspace]);
    if (!imagePath) throw new Error('Generated location image must be inside its workspace');
    const dir = directory(workspace);
    fs.mkdirSync(dir, { recursive: true });
    // One immutable receipt per result: retries preserve earlier candidates and cannot lose another writer's result.
    writeJsonAtomic(path.join(dir, `${randomUUID()}.json`), { ...candidate, imagePath: path.relative(workspace, imagePath) });
}

export function loadLocationImageCandidates(workspace: string, worldKey: string, locationId: string): LocationImageCandidate[] {
    try {
        const dir = directory(workspace);
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(name => /^[a-f0-9-]+\.json$/.test(name)).flatMap(name => {
            try {
                const file = path.join(dir, name);
                if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 32_768) return [];
                const c = JSON.parse(fs.readFileSync(file, 'utf8')) as LocationImageCandidate;
                if (c.worldKey !== worldKey || c.locationId !== locationId || typeof c.createdAt !== 'string'
                    || typeof c.imagePath !== 'string' || typeof c.prompt !== 'string') return [];
                const imagePath = resolveUnderRoots(path.resolve(workspace, c.imagePath), [workspace]);
                return imagePath ? [{ ...c, imagePath }] : [];
            } catch { return []; }
        }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch { return []; }
}
