import * as fs from 'fs';
import * as path from 'path';
import { isValidCharacterId, resolveCharacterJsonPath } from './characterId';
import { resolveAllowedImagePath } from './mediaPathCore';
import type { MediaArtifactResult } from './mediaArtifactCore';

export interface VerifiedPortraitArtifact {
    ok: true;
    portraitPath: string;
    createdAt: string;
}

export interface RejectedPortraitArtifact {
    ok: false;
    reason: string;
}

export type PortraitArtifactVerification = VerifiedPortraitArtifact | RejectedPortraitArtifact;

/** Verify that the subprocess result was durably adopted by exactly one character profile. */
export function verifyAdoptedPortraitArtifact(
    workspacePath: string,
    characterId: string,
    artifact: MediaArtifactResult | undefined,
    notBeforeMs: number
): PortraitArtifactVerification {
    if (!isValidCharacterId(characterId)) { return { ok: false, reason: 'invalid characterId' }; }
    if (!artifact?.success) { return { ok: false, reason: artifact?.error || 'generation did not return a successful artifact' }; }
    if (artifact.characterId && artifact.characterId !== characterId) {
        return { ok: false, reason: 'artifact characterId does not match the requested character' };
    }
    const createdAtMs = Date.parse(artifact.createdAt);
    if (!Number.isFinite(createdAtMs) || createdAtMs < notBeforeMs - 2000) {
        return { ok: false, reason: 'artifact freshness evidence predates this generation attempt' };
    }
    const workspace = path.resolve(workspacePath);
    const resolvedArtifact = resolveAllowedImagePath(artifact.outputPath, [workspace]);
    if (!resolvedArtifact) { return { ok: false, reason: 'adopted portrait path is missing or outside the workspace' }; }
    const charactersDir = path.resolve(workspace, 'characters');
    const relative = path.relative(charactersDir, resolvedArtifact);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return { ok: false, reason: 'adopted portrait is not inside the characters directory' };
    }
    const ownedName = new RegExp(`^${characterId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_portrait_[0-9a-f]{16}\\.(png|jpe?g|webp)$`, 'i');
    if (!ownedName.test(path.basename(resolvedArtifact))) {
        return { ok: false, reason: 'adopted portrait does not use the versioned character portrait name' };
    }
    const jsonPath = resolveCharacterJsonPath(charactersDir, characterId);
    if (!jsonPath || !fs.existsSync(jsonPath)) { return { ok: false, reason: 'character profile is missing' }; }
    try {
        const character = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Record<string, unknown>;
        if (character.id !== characterId || typeof character.portrait !== 'string') {
            return { ok: false, reason: 'character profile was not updated with a portrait' };
        }
        const resolvedProfilePortrait = resolveAllowedImagePath(character.portrait, [workspace]);
        if (!resolvedProfilePortrait || path.normalize(resolvedProfilePortrait) !== path.normalize(resolvedArtifact)) {
            return { ok: false, reason: 'character profile does not point to the exact adopted artifact' };
        }
    } catch (error) {
        return { ok: false, reason: `character profile verification failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    return { ok: true, portraitPath: resolvedArtifact, createdAt: artifact.createdAt };
}
