import { canonicalizeModJson, ModDataError, normalizeModPackageFile, parseStrictJsonBytes, type ModPackageHashFile } from '../modHashCore';
import type { ModManifest } from '../modManifestCore';
import { compareUnicodeCodePointOrder, isValidLocalResourceId, toCanonicalModResourceId } from '../modPathCore';
import type { ModLock } from '../modProfileCore';
import type { LorebookEntry } from '../../lorebookMatcher';
import { parsePlayerPersonaPreset, type PlayerPersonaPreset } from '../../personaPresetCore';

/** Slice 2A is self-contained text data. No file references, regex, media or scripts. */
export interface ModScenarioDefinition {
    format: 'text-adventure-scenario/1.0';
    meta: { title: string; description?: string };
    setup?: { theme?: string };
    opening: { narrative: string; summary?: string; options?: string[] };
}

export interface ModContribution<T> {
    id: string;
    modId: string;
    version: string;
    value: T;
}

export interface ModContentRegistry {
    lockFingerprint: string;
    scenarios: ModContribution<ModScenarioDefinition>[];
    lorebooks: ModContribution<LorebookEntry>[];
    personas: ModContribution<PlayerPersonaPreset>[];
}

export interface ModContentPackage {
    manifest: ModManifest;
    source: 'global' | 'workspace';
    manifestHash: string;
    contentHash: string;
    files: readonly ModPackageHashFile[];
}

function reject(code = 'MOD_CONTENT_SCHEMA_INVALID'): never {
    // Diagnostics deliberately never quote package-authored text.
    throw new ModDataError(code, 'MOD content does not satisfy the Slice 2A contract');
}

function object(value: unknown, allowed: readonly string[], required: readonly string[] = []): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return reject();
    const result = value as Record<string, unknown>;
    if (Object.keys(result).some(key => !allowed.includes(key)) || required.some(key => !Object.prototype.hasOwnProperty.call(result, key))) return reject();
    return result;
}

function text(value: unknown, maxBytes: number, maxChars = maxBytes): string {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim()
        || value.length > maxChars || Buffer.byteLength(value, 'utf8') > maxBytes
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
        || /<|!\[|:\/\/|(?:data|file|command|vscode):/i.test(value)) return reject();
    return value;
}

function strings(value: unknown, count: number, bytes: number): string[] {
    if (!Array.isArray(value) || value.length > count) return reject();
    return value.map(item => text(item, bytes));
}

function localId(value: unknown): string {
    if (!isValidLocalResourceId(value)) return reject('MOD_CONTENT_ID_INVALID');
    return value;
}

function parseScenario(raw: unknown): ModScenarioDefinition {
    const doc = object(raw, ['format', 'meta', 'setup', 'opening'], ['format', 'meta', 'opening']);
    if (doc.format !== 'text-adventure-scenario/1.0') return reject();
    const meta = object(doc.meta, ['title', 'description'], ['title']);
    text(meta.title, 480, 120);
    if (meta.description !== undefined) text(meta.description, 4000);
    if (doc.setup !== undefined) {
        const setup = object(doc.setup, ['theme']);
        if (setup.theme !== undefined && (typeof setup.theme !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(setup.theme))) return reject();
    }
    const opening = object(doc.opening, ['narrative', 'summary', 'options'], ['narrative']);
    text(opening.narrative, 32768);
    if (opening.summary !== undefined) text(opening.summary, 8192);
    if (opening.options !== undefined) strings(opening.options, 8, 512);
    return doc as unknown as ModScenarioDefinition;
}

function parseLorebook(raw: unknown): LorebookEntry[] {
    const doc = object(raw, ['format', 'entries'], ['format', 'entries']);
    if (doc.format !== 'text-adventure-lorebook/1.0' || !Array.isArray(doc.entries) || doc.entries.length > 128) return reject();
    return doc.entries.map(rawEntry => {
        const entry = object(rawEntry, ['id', 'comment', 'keys', 'secondary_keys', 'content', 'enabled', 'use_regex', 'priority', 'insertion_order', 'pinned'], ['id', 'keys', 'content']);
        localId(entry.id);
        text(entry.content, 8192);
        if (strings(entry.keys, 16, 200).length === 0) return reject();
        if (entry.secondary_keys !== undefined) strings(entry.secondary_keys, 16, 200);
        if (entry.comment !== undefined) text(entry.comment, 480);
        for (const key of ['enabled', 'pinned']) if (entry[key] !== undefined && typeof entry[key] !== 'boolean') return reject();
        // Regex execution is intentionally deferred, rather than falling back after malformed input.
        if (entry.use_regex !== undefined && entry.use_regex !== false) return reject('MOD_CONTENT_REGEX_UNSUPPORTED');
        for (const key of ['priority', 'insertion_order']) {
            if (entry[key] !== undefined && (!Number.isInteger(entry[key]) || Math.abs(entry[key] as number) > 100)) return reject();
        }
        return entry as LorebookEntry;
    });
}

function parsePersona(raw: unknown, descriptorId: string): PlayerPersonaPreset {
    const doc = object(raw, ['version', 'id', 'name', 'description', 'speakingStyle'], ['version', 'id', 'name']);
    if (doc.id !== descriptorId || doc.version !== 1) return reject('MOD_CONTENT_ID_INVALID');
    text(doc.name, 320, 80);
    for (const key of ['description', 'speakingStyle']) if (doc[key] !== undefined) text(doc[key], 8000, 2000);
    const parsed = parsePlayerPersonaPreset(doc);
    if (!parsed) return reject();
    return parsed;
}

/** Pure construction; the host alone supplies hash-verified bytes and a manifest-bound active lock. */
export function buildModContentRegistry(lock: ModLock, packages: readonly ModContentPackage[]): ModContentRegistry {
    const registry: ModContentRegistry = { lockFingerprint: lock.aggregateHash, scenarios: [], lorebooks: [], personas: [] };
    const seen = new Set<string>();
    let documentBytes = 0;
    const append = <T>(list: ModContribution<T>[], pkg: ModContentPackage, id: string, value: T): void => {
        const canonicalId = toCanonicalModResourceId(pkg.manifest.id, localId(id));
        if (seen.has(canonicalId)) return reject('MOD_CONTENT_ID_COLLISION');
        seen.add(canonicalId);
        if (seen.size > 1024) return reject('MOD_CONTENT_LIMIT');
        list.push({ id: canonicalId, modId: pkg.manifest.id, version: pkg.manifest.version, value });
    };
    for (const id of lock.loadOrder) {
        const locked = lock.packages.find(item => item.id === id);
        const matches = packages.filter(item => item.manifest.id === id && item.source === locked?.source);
        const pkg = matches[0];
        if (!locked || matches.length !== 1 || pkg.manifest.version !== locked.version
            || pkg.manifestHash !== locked.manifestHash || pkg.contentHash !== locked.contentHash) return reject('MOD_CONTENT_LOCK_MISMATCH');
        if (pkg.manifest.capabilities.some(capability => !['scenario', 'lorebook', 'persona'].includes(capability))) return reject('MOD_CONTENT_CAPABILITY_UNSUPPORTED');
        for (const kind of ['scenarios', 'lorebooks', 'personas'] as const) {
            const descriptors = [...(pkg.manifest.entrypoints[kind] ?? [])].sort((a, b) => compareUnicodeCodePointOrder(a.id, b.id));
            for (const descriptor of descriptors) {
                const file = pkg.files.find(item => item.path === descriptor.path);
                if (!file || file.kind !== 'json' || file.bytes.byteLength > 256 * 1024) return reject('MOD_CONTENT_DOCUMENT_LIMIT');
                documentBytes += file.bytes.byteLength;
                if (documentBytes > 4 * 1024 * 1024) return reject('MOD_CONTENT_LIMIT');
                const raw = parseStrictJsonBytes(normalizeModPackageFile(file));
                if (kind === 'scenarios') append(registry.scenarios, pkg, descriptor.id, parseScenario(raw));
                if (kind === 'personas') {
                    const preset = parsePersona(raw, descriptor.id);
                    append(registry.personas, pkg, descriptor.id, { ...preset, id: toCanonicalModResourceId(id, descriptor.id) });
                }
                if (kind === 'lorebooks') {
                    const entries = parseLorebook(raw).sort((a, b) => compareUnicodeCodePointOrder(a.id!, b.id!));
                    for (const entry of entries) {
                        const canonicalId = toCanonicalModResourceId(id, entry.id!);
                        append(registry.lorebooks, pkg, entry.id!, { ...entry, id: canonicalId, comment: `${canonicalId} — ${entry.comment ?? entry.id}` });
                    }
                }
            }
        }
    }
    // Detach every returned object from the caller's mutable buffers/manifest.
    return JSON.parse(canonicalizeModJson(registry)) as ModContentRegistry;
}
