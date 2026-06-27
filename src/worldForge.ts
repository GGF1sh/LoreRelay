import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath } from './workspacePaths';
import { loadGameRules } from './gameRules';
import {
    type WorldForge,
    type Region,
    type WorldLocation,
    type Faction,
    parseWorldForge
} from './worldForgeCore';

export type { WorldForge, Region, WorldLocation, Faction };

const WORLD_FORGE_FILENAME = 'world_forge.json';

let cachePath = '';
let cacheMtime = 0;
let cachedForge: WorldForge | undefined | null = undefined; // null = file checked, doesn't exist

function getWorldForgePath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, WORLD_FORGE_FILENAME) : undefined;
}

export function clearWorldForgeCache(): void {
    cachedForge = undefined;
    cachePath = '';
    cacheMtime = 0;
}

export function isWorldForgeEnabled(): boolean {
    if (!loadGameRules().enableWorldForge) { return false; }
    const forgePath = getWorldForgePath();
    return Boolean(forgePath && fs.existsSync(forgePath));
}

export function loadWorldForge(): WorldForge | undefined {
    const forgePath = getWorldForgePath();
    if (!forgePath) { return undefined; }

    if (!fs.existsSync(forgePath)) {
        cachedForge = null;
        return undefined;
    }

    try {
        const mtime = fs.statSync(forgePath).mtimeMs;
        if (forgePath === cachePath && mtime === cacheMtime && cachedForge !== undefined) {
            return cachedForge ?? undefined;
        }
        const raw = JSON.parse(fs.readFileSync(forgePath, 'utf-8'));
        const parsed = parseWorldForge(raw);
        cachePath = forgePath;
        cacheMtime = mtime;
        cachedForge = parsed ?? null;
        return parsed;
    } catch {
        return undefined;
    }
}

export function getWorldForgeLocation(id: string): WorldLocation | undefined {
    return loadWorldForge()?.geography.locations.find((l) => l.id === id);
}

export function getWorldForgeLocationByName(name: string): WorldLocation | undefined {
    const lower = name.toLowerCase();
    return loadWorldForge()?.geography.locations.find(
        (l) => l.name.toLowerCase() === lower || l.id.toLowerCase() === lower
    );
}

export function getWorldForgeRegion(id: string): Region | undefined {
    return loadWorldForge()?.geography.regions.find((r) => r.id === id);
}

export function getWorldForgeFaction(id: string): Faction | undefined {
    return loadWorldForge()?.factions.find((f) => f.id === id);
}

/** game_state.status.location の文字列から最も近い WorldLocation を探す。 */
export function resolveCurrentLocation(statusLocation: string | undefined): WorldLocation | undefined {
    if (!statusLocation) { return undefined; }
    return getWorldForgeLocationByName(statusLocation);
}
