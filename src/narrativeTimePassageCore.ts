// Layer B: narrative time passage parsing (rest / travel). No vscode/fs imports.

export interface NarrativeLocationRef {
    id: string;
    name: string;
}

export interface NarrativeTimePassage {
    kind: 'rest' | 'travel';
    steps: number;
    /** Travel destination location id (travel only). */
    locationId?: string;
    healHp: boolean;
}

const DEFAULT_REST_STEPS = 1;

function extractDaySteps(text: string): number | undefined {
    const m = /(\d+)\s*(?:日|日間|days?)/i.exec(text);
    if (m) {
        const n = parseInt(m[1], 10);
        return Number.isFinite(n) && n > 0 ? n : undefined;
    }
    return undefined;
}

function resolveLocationId(text: string, locations: readonly NarrativeLocationRef[]): string | undefined {
    const lower = text.toLowerCase();
    for (const loc of locations) {
        if (lower.includes(loc.id.toLowerCase()) || lower.includes(loc.name.toLowerCase())) {
            return loc.id;
        }
    }
    for (const loc of locations) {
        for (const part of loc.name.split(/[\s・]/).filter((p) => p.length >= 2)) {
            if (lower.includes(part.toLowerCase())) {
                return loc.id;
            }
        }
        for (let len = Math.min(8, loc.name.length); len >= 2; len--) {
            const suffix = loc.name.slice(-len).toLowerCase();
            if (lower.includes(suffix)) {
                return loc.id;
            }
        }
    }
    return undefined;
}

function isRestRequest(text: string): boolean {
    return /宿|休む|一晩|休息|眠る|sleep|rest\b|camp\b/i.test(text)
        && !/旅|移動|向か|travel|go\s+to/i.test(text);
}

function isTravelRequest(text: string): boolean {
    return /旅|移動|向か|旅する|travel|go\s+to|head\s+to/i.test(text)
        || (extractDaySteps(text) !== undefined && resolveLocationId(text, []) === undefined
            && /へ|に向|toward/i.test(text));
}

/**
 * Parse player text for narrative rest or travel.
 * Returns null if not a time-passage request.
 */
export function parseNarrativeTimePassage(
    input: string,
    locations: readonly NarrativeLocationRef[]
): NarrativeTimePassage | null {
    const text = input.trim().replace(/\s+/g, ' ');
    if (!text) {
        return null;
    }

    if (isRestRequest(text)) {
        const steps = extractDaySteps(text) ?? DEFAULT_REST_STEPS;
        return { kind: 'rest', steps, healHp: true };
    }

    if (isTravelRequest(text)) {
        const locationId = resolveLocationId(text, locations);
        const steps = extractDaySteps(text) ?? (locationId ? 1 : undefined);
        if (!locationId && steps === undefined) {
            return null;
        }
        return {
            kind: 'travel',
            steps: steps ?? 1,
            locationId,
            healHp: false,
        };
    }

    return null;
}

/** Clamp elapsed world turns for GM turn_result / debug commands. */
export function clampElapsedWorldTurns(raw: unknown, maxSteps = 100): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return 0;
    }
    const n = Math.floor(raw);
    if (n < 1) {
        return 0;
    }
    return Math.min(n, maxSteps);
}