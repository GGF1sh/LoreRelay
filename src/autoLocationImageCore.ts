import type { GameStateWorld } from './types/GameState';
import type { ImageGenConfig } from './imageGenConfig';

export const DEFAULT_AUTO_LOCATION_IMAGE_COOLDOWN_TURNS = 3;

export interface AutoLocationImageTriggerInput {
    enabled: boolean;
    comfyConfigured: boolean;
    cooldownTurns: number;
    prevLocationId?: string;
    newLocationId?: string;
    lastGeneratedLocationId?: string;
    lastAutoImageGmTurn?: number;
    currentGmTurn: number;
}

export interface AutoLocationImageRequest {
    locationId: string;
    gmTurn: number;
}

/** ComfyUI URL or workspace checkpoint must be configured. */
export function isComfyUiConfigured(comfyuiUrl: string, workspaceConfig?: ImageGenConfig): boolean {
    if (comfyuiUrl.trim()) { return true; }
    if (workspaceConfig?.checkpoint?.trim()) { return true; }
    return false;
}

export function countGmTurns(entries: unknown): number {
    if (!Array.isArray(entries)) { return 0; }
    return entries.filter((e) => typeof e === 'object' && e !== null && (e as { role?: string }).role === 'gm').length;
}

export function normalizeAutoImageCooldownTurns(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_AUTO_LOCATION_IMAGE_COOLDOWN_TURNS;
    }
    return Math.max(0, Math.min(20, Math.floor(value)));
}

/** Decide whether to queue auto location image after a location change turn. */
export function shouldTriggerAutoLocationImage(input: AutoLocationImageTriggerInput): boolean {
    if (!input.enabled || !input.comfyConfigured) { return false; }
    if (!input.newLocationId || input.newLocationId === input.prevLocationId) { return false; }
    if (input.lastGeneratedLocationId === input.newLocationId) { return false; }

    if (input.lastAutoImageGmTurn !== undefined) {
        const elapsed = input.currentGmTurn - input.lastAutoImageGmTurn;
        if (elapsed < input.cooldownTurns) { return false; }
    }

    return true;
}

export function buildAutoImageWorldTrackingPatch(
    world: GameStateWorld | undefined,
    locationId: string,
    gmTurn: number
): GameStateWorld {
    return {
        ...(world ?? {}),
        lastGeneratedLocationId: locationId,
        lastAutoImageGmTurn: gmTurn,
    };
}