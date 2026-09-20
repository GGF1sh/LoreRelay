// MEDIA-M1.1 generated artifact stdout contract (pure; no fs/vscode).

export const MEDIA_ARTIFACT_RESULT_PREFIX = 'TA_MEDIA_RESULT ';

export interface MediaArtifactResult {
    success: boolean;
    outputPath: string;
    createdAt: string;
    characterId?: string;
    error?: string;
}

function sanitizeArtifactResult(value: unknown): MediaArtifactResult | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { return undefined; }
    const source = value as Record<string, unknown>;
    const outputPath = typeof source.outputPath === 'string' ? source.outputPath.trim() : '';
    const createdAt = typeof source.createdAt === 'string' ? source.createdAt.trim() : '';
    if (typeof source.success !== 'boolean' || !outputPath || !createdAt || !Number.isFinite(Date.parse(createdAt))) {
        return undefined;
    }
    const result: MediaArtifactResult = { success: source.success, outputPath, createdAt };
    if (typeof source.characterId === 'string') { result.characterId = source.characterId.trim().slice(0, 64); }
    if (typeof source.error === 'string') { result.error = source.error.trim().slice(0, 1000); }
    return result;
}

/** Parse the last complete machine-readable result line from subprocess stdout. */
export function parseMediaArtifactResult(stdout: string): MediaArtifactResult | undefined {
    let parsed: MediaArtifactResult | undefined;
    for (const line of String(stdout ?? '').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith(MEDIA_ARTIFACT_RESULT_PREFIX)) { continue; }
        try {
            const candidate = sanitizeArtifactResult(JSON.parse(trimmed.slice(MEDIA_ARTIFACT_RESULT_PREFIX.length)));
            if (candidate) { parsed = candidate; }
        } catch {
            // Ignore incomplete/non-JSON diagnostic lines.
        }
    }
    return parsed;
}

export interface PortraitGeneratedMessage {
    type: 'portraitGenerated';
    id: string;
    uri: string;
    createdAt: string;
}

export function buildPortraitGeneratedMessage(
    id: string,
    uri: string,
    createdAt: string
): PortraitGeneratedMessage {
    return { type: 'portraitGenerated', id, uri, createdAt };
}
