export type GuidanceMode = 'sandbox' | 'guided' | 'railroad';

const GUIDANCE_MODES = new Set<GuidanceMode>(['sandbox', 'guided', 'railroad']);

export interface ScenarioDirectorTemplate {
    scenarioTitle?: string;
    act?: string;
    chapter?: string;
    scene?: string;
    objective?: string;
    successConditions: string[];
    failConditions: string[];
    guidanceMode?: GuidanceMode;
    endingFlags: string[];
    optionalEncounters: string[];
}

export interface GameStateDirector {
    act?: string;
    chapter?: string;
    scene?: string;
    objective?: string;
    guidanceMode?: GuidanceMode;
    achievedEndings?: string[];
    notes?: string;
}

export interface ScenarioDirectorView extends ScenarioDirectorTemplate {
    achievedEndings: string[];
    hasRuntimeOverrides: boolean;
    templateSnapshot?: {
        act?: string;
        chapter?: string;
        scene?: string;
        objective?: string;
        guidanceMode?: GuidanceMode;
    };
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map(String).map((s) => s.trim()).filter(Boolean);
}

function pickGuidanceMode(value: unknown): GuidanceMode | undefined {
    return typeof value === 'string' && GUIDANCE_MODES.has(value as GuidanceMode)
        ? value as GuidanceMode
        : undefined;
}

export function parseScenarioDirectorTemplate(
    director: Record<string, unknown> | undefined,
    meta?: Record<string, unknown>
): ScenarioDirectorTemplate | undefined {
    if (!director) {
        return undefined;
    }
    return {
        scenarioTitle: typeof meta?.title === 'string' ? meta.title : undefined,
        act: typeof director.act === 'string' ? director.act : undefined,
        chapter: typeof director.chapter === 'string' ? director.chapter : undefined,
        scene: typeof director.scene === 'string' ? director.scene : undefined,
        objective: typeof director.objective === 'string' ? director.objective : undefined,
        successConditions: asStringArray(director.successConditions),
        failConditions: asStringArray(director.failConditions),
        guidanceMode: pickGuidanceMode(director.guidanceMode),
        endingFlags: asStringArray(director.endingFlags),
        optionalEncounters: asStringArray(director.optionalEncounters)
    };
}

export function parseGameStateDirector(value: unknown): GameStateDirector | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const d = value as Record<string, unknown>;
    const out: GameStateDirector = {};
    for (const key of ['act', 'chapter', 'scene', 'objective', 'notes'] as const) {
        if (typeof d[key] === 'string') {
            out[key] = d[key];
        }
    }
    const mode = pickGuidanceMode(d.guidanceMode);
    if (mode) {
        out.guidanceMode = mode;
    }
    const achieved = asStringArray(d.achievedEndings);
    if (achieved.length > 0) {
        out.achievedEndings = achieved;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export function mergeScenarioDirector(
    template: ScenarioDirectorTemplate | undefined,
    runtime: GameStateDirector | undefined
): ScenarioDirectorView | undefined {
    if (!template && !runtime) {
        return undefined;
    }
    const base = template || {
        successConditions: [],
        failConditions: [],
        endingFlags: [],
        optionalEncounters: []
    };
    const merged: ScenarioDirectorView = {
        ...base,
        act: runtime?.act ?? base.act,
        chapter: runtime?.chapter ?? base.chapter,
        scene: runtime?.scene ?? base.scene,
        objective: runtime?.objective ?? base.objective,
        guidanceMode: runtime?.guidanceMode ?? base.guidanceMode,
        achievedEndings: runtime?.achievedEndings ?? [],
        hasRuntimeOverrides: false,
        templateSnapshot: template
            ? {
                act: template.act,
                chapter: template.chapter,
                scene: template.scene,
                objective: template.objective,
                guidanceMode: template.guidanceMode
            }
            : undefined
    };
    if (runtime) {
        merged.hasRuntimeOverrides = (
            (runtime.act !== undefined && runtime.act !== base.act) ||
            (runtime.chapter !== undefined && runtime.chapter !== base.chapter) ||
            (runtime.scene !== undefined && runtime.scene !== base.scene) ||
            (runtime.objective !== undefined && runtime.objective !== base.objective) ||
            (runtime.guidanceMode !== undefined && runtime.guidanceMode !== base.guidanceMode) ||
            Boolean(runtime.notes) ||
            (runtime.achievedEndings?.length ?? 0) > 0
        );
    }
    return merged;
}

export function validateScenarioDirectorBlock(director: unknown): string[] {
    const errors: string[] = [];
    if (director === undefined) {
        return errors;
    }
    if (typeof director !== 'object' || director === null || Array.isArray(director)) {
        errors.push('director must be an object');
        return errors;
    }
    const d = director as Record<string, unknown>;
    for (const key of ['act', 'chapter', 'scene', 'objective'] as const) {
        if (d[key] !== undefined && typeof d[key] !== 'string') {
            errors.push(`director.${key} must be a string`);
        }
    }
    if (d.guidanceMode !== undefined && !pickGuidanceMode(d.guidanceMode)) {
        errors.push('director.guidanceMode must be sandbox, guided, or railroad');
    }
    for (const key of ['successConditions', 'failConditions', 'endingFlags', 'optionalEncounters'] as const) {
        if (d[key] === undefined) {
            continue;
        }
        if (!Array.isArray(d[key])) {
            errors.push(`director.${key} must be an array of strings`);
            continue;
        }
        (d[key] as unknown[]).forEach((item, i) => {
            if (typeof item !== 'string') {
                errors.push(`director.${key}[${i}] must be a string`);
            }
        });
    }
    return errors;
}

export function validateGameStateDirector(director: unknown): string[] {
    const errors: string[] = [];
    if (director === undefined) {
        return errors;
    }
    if (typeof director !== 'object' || director === null || Array.isArray(director)) {
        errors.push('"director" must be an object');
        return errors;
    }
    const d = director as Record<string, unknown>;
    for (const key of ['act', 'chapter', 'scene', 'objective', 'notes'] as const) {
        if (d[key] !== undefined && typeof d[key] !== 'string') {
            errors.push(`director.${key} must be a string`);
        }
    }
    if (d.guidanceMode !== undefined && !pickGuidanceMode(d.guidanceMode)) {
        errors.push('director.guidanceMode must be sandbox, guided, or railroad');
    }
    if (d.achievedEndings !== undefined) {
        if (!Array.isArray(d.achievedEndings)) {
            errors.push('director.achievedEndings must be an array of strings');
        } else {
            (d.achievedEndings as unknown[]).forEach((item, i) => {
                if (typeof item !== 'string') {
                    errors.push(`director.achievedEndings[${i}] must be a string`);
                }
            });
        }
    }
    return errors;
}

/** scenario.json director → game_state.director 初期シード */
export function seedDirectorFromTemplate(template: ScenarioDirectorTemplate): GameStateDirector {
    const seed: GameStateDirector = {};
    if (template.act) { seed.act = template.act; }
    if (template.chapter) { seed.chapter = template.chapter; }
    if (template.scene) { seed.scene = template.scene; }
    if (template.objective) { seed.objective = template.objective; }
    if (template.guidanceMode) { seed.guidanceMode = template.guidanceMode; }
    return seed;
}