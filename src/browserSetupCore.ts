// Browser-produced packages are data, never commands or file paths.
import { normalizeGameRules } from './gameRulesCore';

type Schema = {
    type?: string; const?: unknown; enum?: unknown[]; properties?: Record<string, Schema>;
    required?: string[]; additionalProperties?: boolean; items?: Schema;
    minimum?: number; maximum?: number; minLength?: number; maxLength?: number;
    minItems?: number; maxItems?: number;
};

function validate(value: unknown, schema: Schema, field: string): void {
    const fail = (detail: string): never => { throw new Error(`${field}: ${detail}`); };
    if ('const' in schema && value !== schema.const) fail(`expected ${schema.const}`);
    if (schema.enum && !schema.enum.includes(value)) fail(`choose ${schema.enum.join(', ')}`);
    switch (schema.type) {
        case 'object': {
            if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected object');
            const record = value as Record<string, unknown>;
            for (const key of schema.required ?? []) {
                if (!Object.prototype.hasOwnProperty.call(record, key)) fail(`missing ${key}`);
            }
            for (const [key, item] of Object.entries(record)) {
                if (['__proto__', 'prototype', 'constructor'].includes(key)) fail(`unsupported key ${key}`);
                const child = schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, key)
                    ? schema.properties[key] : undefined;
                if (!child) fail(`unsupported key ${key}`);
                validate(item, child!, `${field}.${key}`);
            }
            break;
        }
        case 'array':
            if (!Array.isArray(value)) fail('expected array');
            if ((value as unknown[]).length < (schema.minItems ?? 0)
                || (value as unknown[]).length > (schema.maxItems ?? 200)) fail('invalid array length');
            (value as unknown[]).forEach((item, i) => validate(item, schema.items ?? {}, `${field}[${i}]`));
            break;
        case 'string':
            if (typeof value !== 'string') fail('expected string');
            if ((value as string).trim().length < (schema.minLength ?? 0)
                || (value as string).length > (schema.maxLength ?? 20000)) fail('invalid text length');
            break;
        case 'boolean': if (typeof value !== 'boolean') fail('expected boolean'); break;
        case 'number':
        case 'integer':
            if (typeof value !== 'number' || !Number.isFinite(value)
                || (schema.type === 'integer' && !Number.isInteger(value))) fail(`expected ${schema.type}`);
            if ((value as number) < (schema.minimum ?? -Infinity)
                || (value as number) > (schema.maximum ?? Infinity)) fail(`range ${schema.minimum}..${schema.maximum}`);
            break;
    }
}

/** Validate the entire package before a host writes any gameplay data. */
export function parseBrowserSetup(text: string, schema: Schema) {
    if (Buffer.byteLength(text, 'utf8') > 256 * 1024) throw new Error('JSON: maximum size is 256 KiB');
    const trimmed = text.replace(/^\uFEFF/, '').trim();
    const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
    let raw: unknown;
    try { raw = JSON.parse(fenced ? fenced[1] : trimmed); }
    catch { throw new Error('JSON: paste one JSON object or one JSON code block, without surrounding explanations'); }
    validate(raw, schema, 'package');
    const data = raw as {
        format: string; scenario: Record<string, unknown>;
        gameRules: Record<string, unknown>; settings: Record<string, unknown>; recommendations: string[];
    };
    const rules = normalizeGameRules(data.gameRules);
    // Reject silent clamping, canonicalization and contradictory dependent flags.
    for (const [key, value] of Object.entries(data.gameRules)) {
        if (JSON.stringify(value) !== JSON.stringify((rules as unknown as Record<string, unknown>)[key])) {
            throw new Error(`gameRules.${key}: invalid value or conflicting dependent setting`);
        }
    }
    const setup = data.scenario.setup as Record<string, string>;
    // scenario.setup is retained on disk, but the regular GM context reads Lorebook.
    const lorebook = { entries: [
        { id: 'browser-start-style', comment: '遊び方・文体', keys: [], enabled: true, pinned: true,
            content: [setup.tone, setup.rules].filter(Boolean).join('\n'), priority: 100, insertion_order: 0 },
        { id: 'browser-start-world', comment: '世界観', keys: [], enabled: true, pinned: true,
            content: setup.world, priority: 100, insertion_order: 1 },
    ] };
    return { ...data, gameRules: rules, lorebook };
}
