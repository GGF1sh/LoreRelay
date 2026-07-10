// Media Profile M1: pure profile schema, lookup, graph evidence, and compatibility rules.

export type MediaKind = 'scene' | 'portrait' | 'expression' | 'world_map';
export type MediaModelFamily = 'sdxl' | 'pony' | 'anima' | 'unknown';
export type MediaGraphFamily =
    | 'sdxl_checkpoint_simple'
    | 'sdxl_cartography_canny'
    | 'sdxl_cartography_direct'
    | 'unknown';
export type MediaPromptMode = 'pony' | 'illustrious' | 'natural' | 'standard';

export interface MediaGenerationDefaults {
    steps: number;
    cfg: number;
    width: number;
    height: number;
}

export interface MediaProfile {
    schemaVersion: 1;
    id: string;
    displayName: string;
    modelFamily: Exclude<MediaModelFamily, 'unknown'>;
    graphFamily: Exclude<MediaGraphFamily, 'unknown'>;
    mediaKinds: MediaKind[];
    promptModes: MediaPromptMode[];
    requiredNodeClasses: string[];
    defaults: MediaGenerationDefaults;
}

export type MediaCompatibilityReasonCode =
    | 'PROFILE_NOT_FOUND'
    | 'WORKFLOW_NOT_FOUND'
    | 'WORKFLOW_INVALID'
    | 'GRAPH_FAMILY_UNKNOWN'
    | 'GRAPH_FAMILY_MISMATCH'
    | 'REQUIRED_NODE_MISSING'
    | 'CHECKPOINT_MISSING'
    | 'MODEL_FAMILY_AMBIGUOUS'
    | 'MODEL_PROFILE_MISMATCH'
    | 'MODEL_GRAPH_MISMATCH'
    | 'PROMPT_MODE_MISMATCH'
    | 'MEDIA_KIND_UNSUPPORTED';

export interface MediaCompatibilityReason {
    code: MediaCompatibilityReasonCode;
    message: string;
    detail?: string;
}

export interface MediaWorkflowEvidence {
    exists: boolean;
    readable: boolean;
    path: string;
    graphFamily: MediaGraphFamily;
    nodeClasses: string[];
    checkpointBinding?: string;
    error?: string;
}

export interface MediaCompatibilityInput {
    profile?: MediaProfile;
    requestedProfileId: string;
    modelFamily: MediaModelFamily;
    checkpoint: string;
    checkpointFamilyHint?: MediaModelFamily;
    promptMode: MediaPromptMode;
    mediaKind: MediaKind;
    workflow: MediaWorkflowEvidence;
}

export interface MediaCompatibilityResult {
    ok: boolean;
    profileId: string;
    modelFamily: MediaModelFamily;
    graphFamily: MediaGraphFamily;
    mediaKind: MediaKind;
    workflowPath: string;
    checkpoint: string;
    reasons: MediaCompatibilityReason[];
    message: string;
}

const SIMPLE_REQUIRED = ['CheckpointLoaderSimple', 'CLIPTextEncode', 'KSampler'];
const CARTOGRAPHY_REQUIRED = [
    'CheckpointLoaderSimple',
    'CLIPTextEncode',
    'KSampler',
    'LoadImage',
    'ControlNetLoader',
    'ControlNetApplyAdvanced',
];

const BUILT_IN_MEDIA_PROFILES: readonly MediaProfile[] = [
    {
        schemaVersion: 1,
        id: 'sdxl-illustrious-simple',
        displayName: 'SDXL Simple / Illustrious',
        modelFamily: 'sdxl',
        graphFamily: 'sdxl_checkpoint_simple',
        mediaKinds: ['scene', 'portrait', 'expression'],
        promptModes: ['illustrious'],
        requiredNodeClasses: SIMPLE_REQUIRED,
        defaults: { steps: 28, cfg: 7, width: 1024, height: 1024 },
    },
    {
        schemaVersion: 1,
        id: 'pony-sdxl-simple',
        displayName: 'Pony / SDXL Simple',
        modelFamily: 'pony',
        graphFamily: 'sdxl_checkpoint_simple',
        mediaKinds: ['scene', 'portrait', 'expression'],
        promptModes: ['pony'],
        requiredNodeClasses: SIMPLE_REQUIRED,
        defaults: { steps: 28, cfg: 7, width: 1024, height: 1024 },
    },
    {
        schemaVersion: 1,
        id: 'sdxl-generic-simple',
        displayName: 'SDXL Simple / Generic',
        modelFamily: 'sdxl',
        graphFamily: 'sdxl_checkpoint_simple',
        mediaKinds: ['scene', 'portrait', 'expression'],
        promptModes: ['natural', 'standard'],
        requiredNodeClasses: SIMPLE_REQUIRED,
        defaults: { steps: 28, cfg: 7, width: 1024, height: 1024 },
    },
    {
        schemaVersion: 1,
        id: 'm1-cartography-sdxl-canny-guard',
        displayName: 'SDXL Cartography Canny (M1 guard)',
        modelFamily: 'sdxl',
        graphFamily: 'sdxl_cartography_canny',
        mediaKinds: ['world_map'],
        promptModes: ['illustrious', 'natural', 'standard', 'pony'],
        requiredNodeClasses: [...CARTOGRAPHY_REQUIRED, 'Canny'],
        defaults: { steps: 28, cfg: 7, width: 1024, height: 1024 },
    },
    {
        schemaVersion: 1,
        id: 'm1-cartography-sdxl-direct-guard',
        displayName: 'SDXL Cartography Direct (M1 guard)',
        modelFamily: 'sdxl',
        graphFamily: 'sdxl_cartography_direct',
        mediaKinds: ['world_map'],
        promptModes: ['illustrious', 'natural', 'standard', 'pony'],
        requiredNodeClasses: CARTOGRAPHY_REQUIRED,
        defaults: { steps: 28, cfg: 7, width: 1024, height: 1024 },
    },
] as const;

const VALID_MEDIA_KINDS = new Set<MediaKind>(['scene', 'portrait', 'expression', 'world_map']);
const VALID_MODEL_FAMILIES = new Set<Exclude<MediaModelFamily, 'unknown'>>(['sdxl', 'pony', 'anima']);
const VALID_GRAPH_FAMILIES = new Set<Exclude<MediaGraphFamily, 'unknown'>>([
    'sdxl_checkpoint_simple',
    'sdxl_cartography_canny',
    'sdxl_cartography_direct',
]);
const VALID_PROMPT_MODES = new Set<MediaPromptMode>(['pony', 'illustrious', 'natural', 'standard']);

function cleanString(value: unknown, maxLength: number): string {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
    if (!Array.isArray(value)) { return []; }
    return [...new Set(value
        .map(item => cleanString(item, maxLength))
        .filter(Boolean))]
        .slice(0, maxItems);
}

function cleanNumber(value: unknown, min: number, max: number, fallback: number): number {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/** Sanitize a complete user-supplied profile. Invalid compatibility units are rejected. */
export function sanitizeMediaProfile(input: unknown): MediaProfile | undefined {
    if (!input || typeof input !== 'object') { return undefined; }
    const source = input as Record<string, unknown>;
    const id = cleanString(source.id, 80).toLowerCase();
    const displayName = cleanString(source.displayName, 120);
    const modelFamily = cleanString(source.modelFamily, 32) as Exclude<MediaModelFamily, 'unknown'>;
    const graphFamily = cleanString(source.graphFamily, 64) as Exclude<MediaGraphFamily, 'unknown'>;
    const mediaKinds = cleanStringArray(source.mediaKinds, 8, 32)
        .filter((kind): kind is MediaKind => VALID_MEDIA_KINDS.has(kind as MediaKind));
    const promptModes = cleanStringArray(source.promptModes, 8, 32)
        .filter((mode): mode is MediaPromptMode => VALID_PROMPT_MODES.has(mode as MediaPromptMode));
    const requiredNodeClasses = cleanStringArray(source.requiredNodeClasses, 32, 100);
    const defaultsSource = source.defaults && typeof source.defaults === 'object'
        ? source.defaults as Record<string, unknown>
        : {};
    if (!id || !displayName || !VALID_MODEL_FAMILIES.has(modelFamily)
        || !VALID_GRAPH_FAMILIES.has(graphFamily) || mediaKinds.length === 0
        || promptModes.length === 0 || requiredNodeClasses.length === 0) {
        return undefined;
    }
    return {
        schemaVersion: 1,
        id,
        displayName,
        modelFamily,
        graphFamily,
        mediaKinds,
        promptModes,
        requiredNodeClasses,
        defaults: {
            steps: Math.round(cleanNumber(defaultsSource.steps, 1, 150, 28)),
            cfg: cleanNumber(defaultsSource.cfg, 0, 30, 7),
            width: Math.round(cleanNumber(defaultsSource.width, 64, 2048, 1024)),
            height: Math.round(cleanNumber(defaultsSource.height, 64, 2048, 1024)),
        },
    };
}

export function listBuiltInMediaProfiles(): MediaProfile[] {
    return BUILT_IN_MEDIA_PROFILES.map(profile => ({
        ...profile,
        mediaKinds: [...profile.mediaKinds],
        promptModes: [...profile.promptModes],
        requiredNodeClasses: [...profile.requiredNodeClasses],
        defaults: { ...profile.defaults },
    }));
}

export function getBuiltInMediaProfile(id: string): MediaProfile | undefined {
    const profile = BUILT_IN_MEDIA_PROFILES.find(item => item.id === id.trim().toLowerCase());
    return profile ? listBuiltInMediaProfiles().find(item => item.id === profile.id) : undefined;
}

/** Weak evidence for migration/diagnostics only; never sufficient to override an explicit profile. */
export function inferCheckpointFamilyHint(checkpoint: string): MediaModelFamily {
    const normalized = checkpoint.toLowerCase();
    if (normalized.includes('anima')) { return 'anima'; }
    if (normalized.includes('pony')) { return 'pony'; }
    if (normalized.includes('illustrious') || normalized.includes('sdxl') || normalized.includes('xl_')) {
        return 'sdxl';
    }
    return 'unknown';
}

export function inferLegacyProfileId(checkpoint: string, promptMode: MediaPromptMode): string {
    const hint = inferCheckpointFamilyHint(checkpoint);
    if (hint === 'pony' && promptMode === 'pony') { return 'pony-sdxl-simple'; }
    if (hint === 'sdxl' && promptMode === 'illustrious') { return 'sdxl-illustrious-simple'; }
    if (hint === 'sdxl' && (promptMode === 'natural' || promptMode === 'standard')) {
        return 'sdxl-generic-simple';
    }
    return '';
}

export function detectMediaGraphFamily(nodeClasses: readonly string[]): MediaGraphFamily {
    const classes = new Set(nodeClasses);
    const simple = SIMPLE_REQUIRED.every(node => classes.has(node));
    if (!simple) { return 'unknown'; }
    const cartography = CARTOGRAPHY_REQUIRED.every(node => classes.has(node));
    if (cartography && classes.has('Canny')) { return 'sdxl_cartography_canny'; }
    if (cartography) { return 'sdxl_cartography_direct'; }
    return 'sdxl_checkpoint_simple';
}

export function isSdxlCompatibleModelFamily(family: MediaModelFamily): boolean {
    return family === 'sdxl' || family === 'pony';
}

function buildCompatibilityMessage(reasons: readonly MediaCompatibilityReason[]): string {
    if (reasons.length === 0) { return 'Media generation stack is compatible.'; }
    return `Media generation stack is incompatible: ${reasons.map(reason => reason.message).join(' ')}`;
}

export function validateMediaCompatibility(input: MediaCompatibilityInput): MediaCompatibilityResult {
    const reasons: MediaCompatibilityReason[] = [];
    const checkpoint = input.checkpoint.trim() || input.workflow.checkpointBinding?.trim() || '';
    const actualFamily = input.modelFamily !== 'unknown'
        ? input.modelFamily
        : input.checkpointFamilyHint || 'unknown';

    if (!input.profile) {
        reasons.push({
            code: 'PROFILE_NOT_FOUND',
            message: input.requestedProfileId
                ? `Media Profile "${input.requestedProfileId}" was not found.`
                : 'No compatible Media Profile could be resolved from the legacy settings.',
        });
    }
    if (!input.workflow.exists) {
        reasons.push({ code: 'WORKFLOW_NOT_FOUND', message: `Workflow file was not found: ${input.workflow.path}` });
    } else if (!input.workflow.readable) {
        reasons.push({
            code: 'WORKFLOW_INVALID',
            message: `Workflow file is not a readable ComfyUI API graph: ${input.workflow.path}`,
            detail: input.workflow.error,
        });
    } else if (input.workflow.graphFamily === 'unknown') {
        reasons.push({
            code: 'GRAPH_FAMILY_UNKNOWN',
            message: 'The workflow graph family could not be proven compatible.',
        });
    }
    if (!checkpoint) {
        reasons.push({
            code: 'CHECKPOINT_MISSING',
            message: 'No checkpoint/model binding is configured in the profile stack or workflow.',
        });
    }
    if (actualFamily === 'unknown') {
        reasons.push({
            code: 'MODEL_FAMILY_AMBIGUOUS',
            message: 'The checkpoint model family is ambiguous. Select a Media Profile explicitly.',
        });
    }
    if (input.checkpointFamilyHint && input.checkpointFamilyHint !== 'unknown'
        && input.modelFamily !== 'unknown' && input.checkpointFamilyHint !== input.modelFamily) {
        reasons.push({
            code: 'MODEL_PROFILE_MISMATCH',
            message: `Checkpoint diagnostic evidence indicates ${input.checkpointFamilyHint}, but the binding declares ${input.modelFamily}.`,
        });
    }
    if (input.workflow.graphFamily !== 'unknown'
        && actualFamily !== 'unknown'
        && !isSdxlCompatibleModelFamily(actualFamily)) {
        reasons.push({
            code: 'MODEL_GRAPH_MISMATCH',
            message: `Model family ${actualFamily} is incompatible with workflow family ${input.workflow.graphFamily}.`,
        });
    }

    const profile = input.profile;
    if (profile) {
        const profileAcceptsFamily = profile.mediaKinds.includes('world_map')
            ? isSdxlCompatibleModelFamily(actualFamily)
            : actualFamily === profile.modelFamily;
        if (actualFamily !== 'unknown' && !profileAcceptsFamily) {
            reasons.push({
                code: 'MODEL_PROFILE_MISMATCH',
                message: `Model family ${actualFamily} is incompatible with Media Profile ${profile.displayName}.`,
            });
        }
        if (input.workflow.graphFamily !== 'unknown' && profile.graphFamily !== input.workflow.graphFamily) {
            reasons.push({
                code: 'GRAPH_FAMILY_MISMATCH',
                message: `Workflow family ${input.workflow.graphFamily} does not match profile family ${profile.graphFamily}.`,
            });
        }
        const availableNodes = new Set(input.workflow.nodeClasses);
        for (const required of profile.requiredNodeClasses) {
            if (!availableNodes.has(required)) {
                reasons.push({
                    code: 'REQUIRED_NODE_MISSING',
                    message: `Workflow is missing required node class ${required}.`,
                    detail: required,
                });
            }
        }
        if (!profile.promptModes.includes(input.promptMode)) {
            reasons.push({
                code: 'PROMPT_MODE_MISMATCH',
                message: `Prompt mode ${input.promptMode} is incompatible with Media Profile ${profile.displayName}.`,
            });
        }
        if (!profile.mediaKinds.includes(input.mediaKind)) {
            reasons.push({
                code: 'MEDIA_KIND_UNSUPPORTED',
                message: `Media Profile ${profile.displayName} does not support ${input.mediaKind}.`,
            });
        }
    }

    const uniqueReasons = reasons.filter((reason, index) =>
        reasons.findIndex(other => other.code === reason.code && other.message === reason.message) === index);
    return {
        ok: uniqueReasons.length === 0,
        profileId: profile?.id || input.requestedProfileId,
        modelFamily: actualFamily,
        graphFamily: input.workflow.graphFamily,
        mediaKind: input.mediaKind,
        workflowPath: input.workflow.path,
        checkpoint,
        reasons: uniqueReasons,
        message: buildCompatibilityMessage(uniqueReasons),
    };
}
