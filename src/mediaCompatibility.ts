import * as fs from 'fs';
import * as path from 'path';
import { loadImageGenConfig } from './imageGenConfig';
import {
    detectMediaGraphFamily,
    getBuiltInMediaProfile,
    inferCheckpointFamilyHint,
    inferLegacyProfileId,
    validateMediaCompatibility,
    type MediaCompatibilityResult,
    type MediaKind,
    type MediaModelFamily,
    type MediaPromptMode,
    type MediaWorkflowEvidence,
} from './mediaProfileCore';

export interface MediaPreflightRequest {
    wsPath: string;
    env: NodeJS.ProcessEnv;
    mediaKind: MediaKind;
    defaultWorkflowPath: string;
    profileIdOverride?: string;
}

export interface MediaPreflightResult extends MediaCompatibilityResult {
    env: NodeJS.ProcessEnv;
}

function isPromptMode(value: string): value is MediaPromptMode {
    return value === 'pony' || value === 'illustrious' || value === 'natural' || value === 'standard';
}

function inspectWorkflow(workflowPath: string): MediaWorkflowEvidence {
    const resolvedPath = path.resolve(workflowPath);
    if (!workflowPath.trim() || path.extname(resolvedPath).toLowerCase() !== '.json' || !fs.existsSync(resolvedPath)) {
        return {
            exists: false,
            readable: false,
            path: resolvedPath,
            graphFamily: 'unknown',
            nodeClasses: [],
        };
    }
    try {
        const stat = fs.statSync(resolvedPath);
        if (!stat.isFile()) {
            return {
                exists: true,
                readable: false,
                path: resolvedPath,
                graphFamily: 'unknown',
                nodeClasses: [],
                error: 'Path is not a regular file.',
            };
        }
        const raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8')) as unknown;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            throw new Error('Workflow root must be a JSON object.');
        }
        const nodes = Object.values(raw as Record<string, unknown>)
            .filter((node): node is Record<string, unknown> => Boolean(node) && typeof node === 'object' && !Array.isArray(node));
        const nodeClasses = [...new Set(nodes
            .map(node => typeof node.class_type === 'string' ? node.class_type.trim() : '')
            .filter(Boolean))];
        const loader = nodes.find(node => node.class_type === 'CheckpointLoaderSimple');
        const inputs = loader?.inputs && typeof loader.inputs === 'object'
            ? loader.inputs as Record<string, unknown>
            : undefined;
        const checkpointBinding = typeof inputs?.ckpt_name === 'string' ? inputs.ckpt_name.trim() : undefined;
        return {
            exists: true,
            readable: nodeClasses.length > 0,
            path: resolvedPath,
            graphFamily: detectMediaGraphFamily(nodeClasses),
            nodeClasses,
            checkpointBinding,
            error: nodeClasses.length > 0 ? undefined : 'No ComfyUI class_type nodes found.',
        };
    } catch (error) {
        return {
            exists: true,
            readable: false,
            path: resolvedPath,
            graphFamily: 'unknown',
            nodeClasses: [],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

function resolveWorkflowPath(request: MediaPreflightRequest): string {
    const configured = String(request.env.TA_WORKFLOW || '').trim();
    const candidate = configured || request.defaultWorkflowPath;
    return path.isAbsolute(candidate) ? candidate : path.resolve(request.wsPath, candidate);
}

/** Resolve legacy/profile settings, inspect the graph, and produce a validated executor contract. */
export function preflightMediaGeneration(request: MediaPreflightRequest): MediaPreflightResult {
    const config = loadImageGenConfig(request.wsPath);
    const promptModeRaw = String(request.env.TA_MODE || config.mode || 'illustrious').toLowerCase();
    const promptMode: MediaPromptMode = isPromptMode(promptModeRaw) ? promptModeRaw : 'illustrious';
    const checkpoint = String(request.env.TA_CHECKPOINT || config.checkpoint || '').trim();
    const checkpointFamilyHint = inferCheckpointFamilyHint(checkpoint);
    const configuredFamily: MediaModelFamily = config.modelFamily || 'unknown';
    const requestedProfileId = request.profileIdOverride
        || config.profileId
        || inferLegacyProfileId(checkpoint, promptMode);
    const profile = getBuiltInMediaProfile(requestedProfileId);
    const workflow = inspectWorkflow(resolveWorkflowPath(request));
    const result = validateMediaCompatibility({
        profile,
        requestedProfileId,
        modelFamily: configuredFamily,
        checkpoint,
        checkpointFamilyHint,
        promptMode,
        mediaKind: request.mediaKind,
        workflow,
    });
    const env: NodeJS.ProcessEnv = { ...request.env };
    if (result.ok) {
        env.TA_WORKFLOW = result.workflowPath;
        env.TA_CHECKPOINT = result.checkpoint;
        env.TA_MODE = promptMode;
        env.TA_MEDIA_PROFILE_ID = result.profileId;
        env.TA_MODEL_FAMILY = result.modelFamily;
        env.TA_GRAPH_FAMILY = result.graphFamily;
        env.TA_MEDIA_PREFLIGHT = 'validated';
    }
    return { ...result, env };
}

export function preflightSceneGeneration(
    wsPath: string,
    env: NodeJS.ProcessEnv,
    defaultWorkflowPath: string
): MediaPreflightResult {
    return preflightMediaGeneration({ wsPath, env, defaultWorkflowPath, mediaKind: 'scene' });
}

export function preflightPortraitGeneration(
    wsPath: string,
    env: NodeJS.ProcessEnv,
    defaultWorkflowPath: string
): MediaPreflightResult {
    return preflightMediaGeneration({ wsPath, env, defaultWorkflowPath, mediaKind: 'portrait' });
}

export function preflightExpressionGeneration(
    wsPath: string,
    env: NodeJS.ProcessEnv,
    defaultWorkflowPath: string
): MediaPreflightResult {
    return preflightMediaGeneration({ wsPath, env, defaultWorkflowPath, mediaKind: 'expression' });
}

export function preflightWorldMapGeneration(
    wsPath: string,
    env: NodeJS.ProcessEnv,
    workflowPath: string
): MediaPreflightResult {
    const profileIdOverride = path.basename(workflowPath).includes('direct')
        ? 'm1-cartography-sdxl-direct-guard'
        : 'm1-cartography-sdxl-canny-guard';
    return preflightMediaGeneration({
        wsPath,
        env: { ...env, TA_WORKFLOW: workflowPath },
        defaultWorkflowPath: workflowPath,
        mediaKind: 'world_map',
        profileIdOverride,
    });
}

/** Shared execution seam: expected preflight failures never invoke queue/spawn callbacks. */
export function executeAfterMediaPreflight<T>(
    preflight: MediaPreflightResult,
    execute: (validatedEnv: NodeJS.ProcessEnv) => T
): { executed: boolean; value?: T } {
    if (!preflight.ok) { return { executed: false }; }
    return { executed: true, value: execute(preflight.env) };
}
