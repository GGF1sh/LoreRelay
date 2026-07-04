// Mod System MOD1: pure manifest/profile resolution (no vscode/fs/DOM).

export const MOD_MANIFEST_VERSION = 1 as const;
export const MOD_PROFILE_VERSION = 1 as const;

export const MAX_MOD_NAME = 120;
export const MAX_MOD_DESC = 500;
export const MAX_MOD_STRING = 240;
export const MAX_MOD_DEPS = 32;
export const MAX_MOD_RECORDS = 256;
export const MAX_MOD_FILES = 64;
export const MAX_MOD_CONFLICTS = 32;
export const MAX_MOD_ALIAS_RULES = 32;
export const MAX_PROFILE_MODS = 128;
export const MAX_RESOLVED_RECORDS = 512;

const MOD_ID_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const RECORD_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export const MOD_CATEGORIES = [
    'scenario',
    'world',
    'lorebook',
    'character',
    'vehicle',
    'mobile_base',
    'settlement',
    'commerce',
    'transport',
    'image_preset',
    'tts',
    'prompt',
    'ui_theme',
    'asset',
    'compat_patch',
    'other',
] as const;
export type ModCategory = (typeof MOD_CATEGORIES)[number];

export const MOD_RECORD_DOMAINS = [
    'scenario',
    'world_region',
    'world_location',
    'faction',
    'lore_entry',
    'character',
    'vehicle',
    'mobile_base',
    'settlement_template',
    'transport_contract_template',
    'image_preset',
    'tts_voice',
    'prompt_snippet',
    'asset',
] as const;
export type ModRecordDomain = (typeof MOD_RECORD_DOMAINS)[number];

export const MOD_MERGE_STRATEGIES = [
    'replace',
    'append',
    'append_unique',
    'patch_fields',
    'delete',
    'disabled',
] as const;
export type ModMergeStrategy = (typeof MOD_MERGE_STRATEGIES)[number];

export interface ModRecordKey {
    domain: ModRecordDomain;
    id: string;
}

export interface ModDependency {
    modId: string;
    version?: string;
}

export interface ModConflictDeclaration {
    modId: string;
    reason?: string;
}

export interface ModFileDeclaration {
    path: string;
    role?: string;
}

export interface ModSafetyDeclaration {
    dataOnly?: boolean;
    notes?: string;
}

export interface ModAliasRule {
    domain: ModRecordDomain;
    fromId: string;
    toId: string;
    reason?: string;
}

export interface ModProvidedRecord {
    domain: ModRecordDomain;
    id: string;
    data?: unknown;
    mergeStrategy?: ModMergeStrategy;
}

export interface ParsedModManifest {
    manifestVersion: 1;
    id: string;
    name: string;
    version: string;
    author?: string;
    description?: string;
    license?: string;
    homepage?: string;
    categories: ModCategory[];
    dependencies: ModDependency[];
    conflicts: ModConflictDeclaration[];
    records: ModProvidedRecord[];
    aliasRules: ModAliasRule[];
    files: ModFileDeclaration[];
    safety?: ModSafetyDeclaration;
}

export interface ModLoadEntry {
    modId: string;
    enabled: boolean;
    priority: number;
    note?: string;
}

export interface ModProfile {
    profileVersion: 1;
    name: string;
    enabledMods: ModLoadEntry[];
}

export interface ModRecordConflict {
    key: ModRecordKey;
    winnerModId: string;
    overriddenModIds: string[];
    reason: 'same_record_id' | 'asset_path' | 'declared_conflict' | 'dependency_order';
}

export interface ModDependencyIssue {
    modId: string;
    dependencyModId: string;
    kind: 'missing' | 'disabled' | 'cycle';
    message: string;
}

export interface ModConflictReport {
    profileName: string;
    conflicts: ModRecordConflict[];
    missingDependencies: ModDependencyIssue[];
    loadOrderWarnings: string[];
}

export interface ResolvedModRecord {
    key: ModRecordKey;
    modId: string;
    data: unknown;
}

export interface ModResolveInput {
    profile: ModProfile;
    mods: Readonly<Record<string, ParsedModManifest>>;
}

export interface ModResolveResult {
    profileName: string;
    records: ResolvedModRecord[];
    report: ModConflictReport;
}

function clampText(raw: unknown, max: number): string {
    if (typeof raw !== 'string') { return ''; }
    return raw.trim().replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').slice(0, max);
}

function asModId(raw: unknown): string {
    if (typeof raw !== 'string') { return ''; }
    const id = raw.trim();
    return MOD_ID_RE.test(id) ? id : '';
}

function asRecordId(raw: unknown): string {
    if (typeof raw !== 'string') { return ''; }
    const id = raw.trim();
    return RECORD_ID_RE.test(id) ? id : '';
}

function pickUnion<T extends string>(raw: unknown, valid: readonly T[], fallback: T): T {
    return typeof raw === 'string' && (valid as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function recordKey(domain: ModRecordDomain, id: string): string {
    return `${domain}\0${id}`;
}

function parseDependency(raw: unknown): ModDependency | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const modId = asModId(r.modId);
    if (!modId) { return undefined; }
    const dep: ModDependency = { modId };
    const version = clampText(r.version, 32);
    if (version) { dep.version = version; }
    return dep;
}

function parseDependencies(raw: unknown): ModDependency[] {
    if (!Array.isArray(raw)) { return []; }
    const out: ModDependency[] = [];
    const seen = new Set<string>();
    for (const item of raw.slice(0, MAX_MOD_DEPS * 2)) {
        const dep = parseDependency(item);
        if (!dep || seen.has(dep.modId)) { continue; }
        out.push(dep);
        seen.add(dep.modId);
        if (out.length >= MAX_MOD_DEPS) { break; }
    }
    return out;
}

function parseConflictDeclaration(raw: unknown): ModConflictDeclaration | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const modId = asModId(r.modId);
    if (!modId) { return undefined; }
    const decl: ModConflictDeclaration = { modId };
    const reason = clampText(r.reason, MAX_MOD_STRING);
    if (reason) { decl.reason = reason; }
    return decl;
}

function parseConflictDeclarations(raw: unknown): ModConflictDeclaration[] {
    if (!Array.isArray(raw)) { return []; }
    const out: ModConflictDeclaration[] = [];
    const seen = new Set<string>();
    for (const item of raw.slice(0, MAX_MOD_CONFLICTS * 2)) {
        const decl = parseConflictDeclaration(item);
        if (!decl || seen.has(decl.modId)) { continue; }
        out.push(decl);
        seen.add(decl.modId);
        if (out.length >= MAX_MOD_CONFLICTS) { break; }
    }
    return out;
}

function parseAliasRule(raw: unknown): ModAliasRule | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (typeof r.domain !== 'string' || !(MOD_RECORD_DOMAINS as readonly string[]).includes(r.domain)) {
        return undefined;
    }
    const domain = r.domain as ModRecordDomain;
    const fromId = asRecordId(r.fromId);
    const toId = asRecordId(r.toId);
    if (!fromId || !toId || fromId === toId) { return undefined; }
    const rule: ModAliasRule = { domain, fromId, toId };
    const reason = clampText(r.reason, MAX_MOD_STRING);
    if (reason) { rule.reason = reason; }
    return rule;
}

function parseAliasRules(raw: unknown): ModAliasRule[] {
    if (!Array.isArray(raw)) { return []; }
    const out: ModAliasRule[] = [];
    for (const item of raw.slice(0, MAX_MOD_ALIAS_RULES * 2)) {
        const rule = parseAliasRule(item);
        if (!rule) { continue; }
        out.push(rule);
        if (out.length >= MAX_MOD_ALIAS_RULES) { break; }
    }
    return out;
}

function parseProvidedRecord(raw: unknown): ModProvidedRecord | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (typeof r.domain !== 'string' || !(MOD_RECORD_DOMAINS as readonly string[]).includes(r.domain)) {
        return undefined;
    }
    const domain = r.domain as ModRecordDomain;
    const id = asRecordId(r.id);
    if (!id) { return undefined; }
    const rec: ModProvidedRecord = { domain, id };
    if ('data' in r) { rec.data = r.data; }
    const mergeStrategy = pickUnion(r.mergeStrategy, MOD_MERGE_STRATEGIES, 'replace');
    if (mergeStrategy !== 'replace') {
        rec.mergeStrategy = mergeStrategy;
    }
    return rec;
}

function parseProvidedRecords(raw: unknown): ModProvidedRecord[] {
    if (!Array.isArray(raw)) { return []; }
    const out: ModProvidedRecord[] = [];
    const seen = new Set<string>();
    for (const item of raw.slice(0, MAX_MOD_RECORDS * 2)) {
        const rec = parseProvidedRecord(item);
        if (!rec) { continue; }
        const key = recordKey(rec.domain, rec.id);
        if (seen.has(key)) { continue; }
        out.push(rec);
        seen.add(key);
        if (out.length >= MAX_MOD_RECORDS) { break; }
    }
    return out;
}

function parseFileDeclaration(raw: unknown): ModFileDeclaration | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const filePath = clampText(r.path, 220);
    if (!filePath || filePath.includes('..')) { return undefined; }
    const decl: ModFileDeclaration = { path: filePath };
    const role = clampText(r.role, 64);
    if (role) { decl.role = role; }
    return decl;
}

function parseFileDeclarations(raw: unknown): ModFileDeclaration[] {
    if (!Array.isArray(raw)) { return []; }
    const out: ModFileDeclaration[] = [];
    for (const item of raw.slice(0, MAX_MOD_FILES * 2)) {
        const decl = parseFileDeclaration(item);
        if (!decl) { continue; }
        out.push(decl);
        if (out.length >= MAX_MOD_FILES) { break; }
    }
    return out;
}

function parseCategories(raw: unknown): ModCategory[] {
    if (!Array.isArray(raw)) { return []; }
    const out: ModCategory[] = [];
    const seen = new Set<string>();
    for (const item of raw.slice(0, 16)) {
        if (typeof item !== 'string' || !(MOD_CATEGORIES as readonly string[]).includes(item)) {
            continue;
        }
        const cat = item as ModCategory;
        if (seen.has(cat)) { continue; }
        out.push(cat);
        seen.add(cat);
    }
    return out;
}

function parseSafety(raw: unknown): ModSafetyDeclaration | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const safety: ModSafetyDeclaration = {};
    if (typeof r.dataOnly === 'boolean') { safety.dataOnly = r.dataOnly; }
    const notes = clampText(r.notes, MAX_MOD_STRING);
    if (notes) { safety.notes = notes; }
    return Object.keys(safety).length ? safety : undefined;
}

/** Parse and sanitize a mod manifest. Returns undefined for invalid or unsafe manifests. */
export function parseModManifest(input: unknown): ParsedModManifest | undefined {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return undefined;
    }
    const r = input as Record<string, unknown>;
    if (r.manifestVersion !== undefined && r.manifestVersion !== MOD_MANIFEST_VERSION) {
        return undefined;
    }
    const id = asModId(r.id);
    const name = clampText(r.name, MAX_MOD_NAME);
    const version = clampText(r.version, 32) || '0.0.0';
    if (!id || !name) { return undefined; }

    const manifest: ParsedModManifest = {
        manifestVersion: MOD_MANIFEST_VERSION,
        id,
        name,
        version,
        categories: parseCategories(r.categories),
        dependencies: parseDependencies(r.dependencies),
        conflicts: parseConflictDeclarations(r.conflicts),
        records: parseProvidedRecords(r.provides ?? r.records),
        aliasRules: parseAliasRules(r.aliasRules),
        files: parseFileDeclarations(r.files),
    };

    const author = clampText(r.author, MAX_MOD_NAME);
    if (author) { manifest.author = author; }
    const description = clampText(r.description, MAX_MOD_DESC);
    if (description) { manifest.description = description; }
    const license = clampText(r.license, 64);
    if (license) { manifest.license = license; }
    const homepage = clampText(r.homepage, 220);
    if (homepage) { manifest.homepage = homepage; }
    const safety = parseSafety(r.safety);
    if (safety) { manifest.safety = safety; }

    return manifest;
}

function parseLoadEntry(raw: unknown): ModLoadEntry | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const modId = asModId(r.modId);
    if (!modId) { return undefined; }
    const enabled = r.enabled !== false;
    const priority = typeof r.priority === 'number' && Number.isFinite(r.priority)
        ? Math.trunc(r.priority)
        : 0;
    const entry: ModLoadEntry = { modId, enabled, priority };
    const note = clampText(r.note, MAX_MOD_STRING);
    if (note) { entry.note = note; }
    return entry;
}

/** Parse a mod profile with defensive defaults. */
export function parseModProfile(input: unknown): ModProfile {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { profileVersion: MOD_PROFILE_VERSION, name: 'default', enabledMods: [] };
    }
    const r = input as Record<string, unknown>;
    const name = clampText(r.name, MAX_MOD_NAME) || 'default';
    const enabledMods: ModLoadEntry[] = [];
    if (Array.isArray(r.enabledMods)) {
        const seen = new Set<string>();
        for (const item of r.enabledMods.slice(0, MAX_PROFILE_MODS * 2)) {
            const entry = parseLoadEntry(item);
            if (!entry || seen.has(entry.modId)) { continue; }
            enabledMods.push(entry);
            seen.add(entry.modId);
            if (enabledMods.length >= MAX_PROFILE_MODS) { break; }
        }
    }
    return {
        profileVersion: MOD_PROFILE_VERSION,
        name,
        enabledMods,
    };
}

function normalizeIdForSimilarity(id: string): string {
    return id.toLowerCase().replace(/[-_\s]+/g, '');
}

function collectSimilarIdWarnings(records: ResolvedModRecord[]): string[] {
    const warnings: string[] = [];
    const byDomain = new Map<ModRecordDomain, Array<{ id: string; modId: string }>>();
    for (const rec of records) {
        const list = byDomain.get(rec.key.domain) ?? [];
        list.push({ id: rec.key.id, modId: rec.modId });
        byDomain.set(rec.key.domain, list);
    }
    for (const [domain, entries] of byDomain) {
        for (let i = 0; i < entries.length; i++) {
            for (let j = i + 1; j < entries.length; j++) {
                const a = entries[i];
                const b = entries[j];
                if (a.id === b.id) { continue; }
                const na = normalizeIdForSimilarity(a.id);
                const nb = normalizeIdForSimilarity(b.id);
                if (na === nb) {
                    warnings.push(
                        `Similar IDs in ${domain}: "${a.id}" (${a.modId}) vs "${b.id}" (${b.modId}) — no auto-remap`
                    );
                }
            }
        }
    }
    return warnings.sort();
}

function sortEnabledMods(profile: ModProfile): ModLoadEntry[] {
    return profile.enabledMods
        .filter((e) => e.enabled)
        .slice()
        .sort((a, b) => (a.priority - b.priority) || a.modId.localeCompare(b.modId));
}

function detectDependencyIssues(
    ordered: ModLoadEntry[],
    mods: Readonly<Record<string, ParsedModManifest>>
): ModDependencyIssue[] {
    const issues: ModDependencyIssue[] = [];
    const enabledIds = new Set(ordered.map((e) => e.modId));
    const indexById = new Map(ordered.map((e, i) => [e.modId, i]));

    for (const entry of ordered) {
        const manifest = mods[entry.modId];
        if (!manifest) {
            issues.push({
                modId: entry.modId,
                dependencyModId: entry.modId,
                kind: 'missing',
                message: `Enabled mod "${entry.modId}" is not in the mod registry`,
            });
            continue;
        }
        for (const dep of manifest.dependencies) {
            if (!mods[dep.modId]) {
                issues.push({
                    modId: entry.modId,
                    dependencyModId: dep.modId,
                    kind: 'missing',
                    message: `Mod "${entry.modId}" requires missing dependency "${dep.modId}"`,
                });
                continue;
            }
            if (!enabledIds.has(dep.modId)) {
                issues.push({
                    modId: entry.modId,
                    dependencyModId: dep.modId,
                    kind: 'disabled',
                    message: `Mod "${entry.modId}" requires disabled dependency "${dep.modId}"`,
                });
                continue;
            }
            const depIndex = indexById.get(dep.modId);
            const modIndex = indexById.get(entry.modId);
            if (depIndex !== undefined && modIndex !== undefined && depIndex > modIndex) {
                issues.push({
                    modId: entry.modId,
                    dependencyModId: dep.modId,
                    kind: 'disabled',
                    message: `Dependency "${dep.modId}" loads after dependent "${entry.modId}" — check load order`,
                });
            }
        }
    }

    const graph = new Map<string, string[]>();
    for (const entry of ordered) {
        const manifest = mods[entry.modId];
        if (!manifest) { continue; }
        graph.set(
            entry.modId,
            manifest.dependencies
                .map((d) => d.modId)
                .filter((id) => enabledIds.has(id))
        );
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();

    function dfs(node: string, stack: string[]): void {
        if (visited.has(node)) { return; }
        if (visiting.has(node)) {
            const cycleStart = stack.indexOf(node);
            const cycle = stack.slice(cycleStart).concat(node);
            const message = `Dependency cycle detected: ${cycle.join(' -> ')}`;
            if (!issues.some((i) => i.kind === 'cycle' && i.message === message)) {
                issues.push({
                    modId: node,
                    dependencyModId: cycle[cycle.length - 2] ?? node,
                    kind: 'cycle',
                    message,
                });
            }
            return;
        }
        visiting.add(node);
        stack.push(node);
        for (const next of graph.get(node) ?? []) {
            dfs(next, stack);
        }
        stack.pop();
        visiting.delete(node);
        visited.add(node);
    }

    for (const entry of ordered) {
        dfs(entry.modId, []);
    }

    return issues;
}

function collectDeclaredConflicts(
    ordered: ModLoadEntry[],
    mods: Readonly<Record<string, ParsedModManifest>>
): ModRecordConflict[] {
    const enabledIds = new Set(ordered.map((e) => e.modId));
    const conflicts: ModRecordConflict[] = [];
    const seen = new Set<string>();

    for (const entry of ordered) {
        const manifest = mods[entry.modId];
        if (!manifest) { continue; }
        for (const decl of manifest.conflicts) {
            if (!enabledIds.has(decl.modId)) { continue; }
            const pairKey = [entry.modId, decl.modId].sort().join('\0');
            if (seen.has(pairKey)) { continue; }
            seen.add(pairKey);
            conflicts.push({
                key: { domain: 'scenario', id: `declared:${entry.modId}:${decl.modId}` },
                winnerModId: entry.modId,
                overriddenModIds: [decl.modId],
                reason: 'declared_conflict',
            });
        }
    }
    return conflicts;
}

/** Resolve enabled mods in load order into a virtual record set with conflict reporting. */
export function resolveModProfile(input: ModResolveInput): ModResolveResult {
    const profile = input.profile;
    const mods = input.mods;
    const ordered = sortEnabledMods(profile);
    const missingDependencies = detectDependencyIssues(ordered, mods);

    const providersByKey = new Map<string, string[]>();
    const dataByKey = new Map<string, unknown>();
    const keyMeta = new Map<string, ModRecordKey>();

    for (const entry of ordered) {
        const manifest = mods[entry.modId];
        if (!manifest) { continue; }

        for (const rec of manifest.records) {
            const key = recordKey(rec.domain, rec.id);
            keyMeta.set(key, { domain: rec.domain, id: rec.id });
            const prev = providersByKey.get(key) ?? [];
            providersByKey.set(key, [...prev, entry.modId]);
            dataByKey.set(key, rec.data);
        }
    }

    const conflicts: ModRecordConflict[] = [];
    for (const [key, modIds] of providersByKey) {
        if (modIds.length < 2) { continue; }
        const meta = keyMeta.get(key);
        if (!meta) { continue; }
        conflicts.push({
            key: meta,
            winnerModId: modIds[modIds.length - 1],
            overriddenModIds: modIds.slice(0, -1),
            reason: 'same_record_id',
        });
    }

    const declaredConflicts = collectDeclaredConflicts(ordered, mods);
    const allConflicts = [...conflicts, ...declaredConflicts].sort((a, b) => {
        const ka = `${a.key.domain}\0${a.key.id}`;
        const kb = `${b.key.domain}\0${b.key.id}`;
        return ka.localeCompare(kb);
    });

    const records: ResolvedModRecord[] = [];
    for (const [key, modIds] of providersByKey) {
        const meta = keyMeta.get(key);
        if (!meta) { continue; }
        records.push({
            key: meta,
            modId: modIds[modIds.length - 1],
            data: dataByKey.get(key),
        });
    }
    records.sort((a, b) => {
        const ka = `${a.key.domain}\0${a.key.id}`;
        const kb = `${b.key.domain}\0${b.key.id}`;
        return ka.localeCompare(kb);
    });

    const loadOrderWarnings = collectSimilarIdWarnings(records);

    return {
        profileName: profile.name,
        records: records.slice(0, MAX_RESOLVED_RECORDS),
        report: {
            profileName: profile.name,
            conflicts: allConflicts,
            missingDependencies,
            loadOrderWarnings,
        },
    };
}