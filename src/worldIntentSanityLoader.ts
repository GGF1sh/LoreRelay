// World Intent WI5b: read-only workspace ledger loader (fs only, no vscode).

import * as fs from 'fs';
import * as path from 'path';
import { parseModManifest, parseModProfile, type ParsedModManifest } from './modSystemCore';
import { parseSettlementState } from './settlementCore';
import { normalizeGameRules } from './gameRulesCore';
import { diagnoseVehicleStateRaw, parseVehicleState } from './vehicleCore';
import type { WorkspaceSanitySnapshot, WorkspaceSanitySources } from './worldIntentSanityHostCore';

export const MOD_MANIFEST_FILENAME = 'lorerelay_mod.json';
export const MAX_MOD_DIRS_SCANNED = 128;

export interface ReadWorkspaceSanitySnapshotOptions {
    vehicleBridgeMode?: unknown;
}

interface JsonReadResult {
    data?: unknown;
    parseError?: string;
    exists: boolean;
}

function readJsonFile(filePath: string): JsonReadResult {
    if (!fs.existsSync(filePath)) { return { exists: false }; }
    try {
        return { exists: true, data: JSON.parse(fs.readFileSync(filePath, 'utf-8')) };
    } catch {
        return { exists: true, parseError: 'invalid JSON' };
    }
}

function recordLedgerParseError(
    snapshot: WorkspaceSanitySnapshot,
    file: string,
    message: string
): void {
    const issue = { file, code: 'json_parse_error' as const, message };
    snapshot.ledgerLoadIssues = [...(snapshot.ledgerLoadIssues ?? []), issue];
    const sources = snapshot.sources ?? {};
    const errs = sources.ledgerParseErrors ?? [];
    if (!errs.includes(file)) {
        sources.ledgerParseErrors = [...errs, file];
    }
    snapshot.sources = sources;
}

function readVehicleStateFile(statePath: string): {
    parsed?: ReturnType<typeof parseVehicleState>;
    rawIssues?: ReturnType<typeof diagnoseVehicleStateRaw>;
} | undefined {
    const read = readJsonFile(statePath);
    if (!read.exists) { return undefined; }
    if (read.parseError || read.data === undefined) { return { rawIssues: undefined }; }
    const rawIssues = diagnoseVehicleStateRaw(read.data);
    const parsed = parseVehicleState(read.data);
    return {
        parsed: parsed.vehicles.length ? parsed : undefined,
        rawIssues: rawIssues.length ? rawIssues : undefined,
    };
}

function readSettlementStateFile(statePath: string) {
    const read = readJsonFile(statePath);
    if (!read.exists || read.parseError || read.data === undefined) { return undefined; }
    return parseSettlementState(read.data);
}

function readGameRuleFlags(wsPath: string): WorkspaceSanitySnapshot['gameRules'] {
    const read = readJsonFile(path.join(wsPath, 'game_rules.json'));
    const rules = normalizeGameRules(read.data);
    return {
        enableVehicleSystem: rules.enableVehicleSystem === true,
        enableSettlementMode: rules.enableSettlementMode === true,
        enableMobileBaseSystem: rules.enableMobileBaseSystem === true,
    };
}

function listModDirectories(...roots: Array<string | undefined>): string[] {
    const dirs: string[] = [];
    const seen = new Set<string>();
    for (const root of roots) {
        if (!root || !fs.existsSync(root)) { continue; }
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(root, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) { continue; }
            const full = path.join(root, entry.name);
            if (seen.has(full)) { continue; }
            seen.add(full);
            dirs.push(full);
            if (dirs.length >= MAX_MOD_DIRS_SCANNED) { return dirs; }
        }
    }
    return dirs;
}

function parseManifestAt(modDir: string): ParsedModManifest | undefined {
    const manifestPath = path.join(modDir, MOD_MANIFEST_FILENAME);
    const read = readJsonFile(manifestPath);
    if (!read.exists || read.parseError || read.data === undefined) { return undefined; }
    return parseModManifest(read.data);
}

function discoverModProfilePath(wsPath: string): string | undefined {
    const candidates = [
        path.join(wsPath, '.lorerelay', 'mod_profile.json'),
        path.join(wsPath, 'mod_profile.json'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) { return candidate; }
    }
    return undefined;
}

function discoverModManifest(
    wsPath: string,
    modId: string,
    indexed: Map<string, ParsedModManifest>
): ParsedModManifest | undefined {
    const cached = indexed.get(modId);
    if (cached) { return cached; }

    const parent = path.dirname(wsPath);
    const searchDirs = [
        path.join(wsPath, '.lorerelay', 'mods', modId),
        path.join(wsPath, 'mods', modId),
        path.join(parent, 'LoreRelayMods', 'mods', modId),
    ];
    for (const dir of searchDirs) {
        const parsed = parseManifestAt(dir);
        if (parsed) { return parsed; }
    }
    return undefined;
}

function indexModManifests(wsPath: string): Map<string, ParsedModManifest> {
    const indexed = new Map<string, ParsedModManifest>();
    const parent = path.dirname(wsPath);
    const modRoots = [
        path.join(wsPath, '.lorerelay', 'mods'),
        path.join(wsPath, 'mods'),
        path.join(parent, 'LoreRelayMods', 'mods'),
    ];
    for (const modDir of listModDirectories(...modRoots)) {
        const parsed = parseManifestAt(modDir);
        if (!parsed || indexed.has(parsed.id)) { continue; }
        indexed.set(parsed.id, parsed);
    }
    return indexed;
}

function loadWorkspaceMods(wsPath: string): {
    modProfile?: ReturnType<typeof parseModProfile>;
    mods?: Record<string, ParsedModManifest>;
    modProfileLoaded: boolean;
    modManifestCount: number;
} {
    const profilePath = discoverModProfilePath(wsPath);
    if (!profilePath) {
        return { modProfileLoaded: false, modManifestCount: 0 };
    }
    const profileRead = readJsonFile(profilePath);
    const modProfile = profileRead.data ? parseModProfile(profileRead.data) : undefined;
    if (!modProfile) { return { modProfileLoaded: false, modManifestCount: 0 }; }
    const indexed = indexModManifests(wsPath);
    const mods: Record<string, ParsedModManifest> = {};

    for (const entry of modProfile.enabledMods) {
        if (!entry.enabled) { continue; }
        const manifest = discoverModManifest(wsPath, entry.modId, indexed);
        if (manifest) {
            mods[entry.modId] = manifest;
        }
    }

    return {
        modProfile,
        mods,
        modProfileLoaded: true,
        modManifestCount: Object.keys(mods).length,
    };
}

/** Read parsed workspace ledgers for WI5 sanity (read-only, no writes). */
export function readWorkspaceSanitySnapshot(
    wsPath: string,
    options?: ReadWorkspaceSanitySnapshotOptions
): WorkspaceSanitySnapshot {
    const sources: WorkspaceSanitySources = {};
    const snapshot: WorkspaceSanitySnapshot = { sources };

    const vehiclePath = path.join(wsPath, 'vehicle_state.json');
    const vehicleRead = readJsonFile(vehiclePath);
    if (vehicleRead.exists && vehicleRead.parseError) {
        recordLedgerParseError(snapshot, 'vehicle_state.json', 'vehicle_state.json is not valid JSON.');
    } else {
        const vehicleBundle = readVehicleStateFile(vehiclePath);
        if (vehicleBundle) {
            if (vehicleBundle.parsed) {
                snapshot.vehicleState = vehicleBundle.parsed;
                sources.vehicleState = true;
            }
            if (vehicleBundle.rawIssues?.length) {
                snapshot.vehicleRawParseIssues = vehicleBundle.rawIssues;
            }
        }
    }

    const settlementPath = path.join(wsPath, 'settlement_state.json');
    const settlementRead = readJsonFile(settlementPath);
    if (settlementRead.exists && settlementRead.parseError) {
        recordLedgerParseError(snapshot, 'settlement_state.json', 'settlement_state.json is not valid JSON.');
    } else {
        const settlementState = readSettlementStateFile(settlementPath);
        if (settlementState) {
            snapshot.settlementState = settlementState;
            sources.settlementState = true;
        }
    }

    const gameRulesPath = path.join(wsPath, 'game_rules.json');
    const gameRulesRead = readJsonFile(gameRulesPath);
    if (gameRulesRead.exists && gameRulesRead.parseError) {
        recordLedgerParseError(snapshot, 'game_rules.json', 'game_rules.json is not valid JSON.');
        snapshot.gameRules = normalizeGameRules(undefined);
    } else {
        snapshot.gameRules = readGameRuleFlags(wsPath);
    }
    sources.gameRules = true;

    const modBundle = loadWorkspaceMods(wsPath);
    const modProfilePath = discoverModProfilePath(wsPath);
    if (modProfilePath) {
        const modProfileRead = readJsonFile(modProfilePath);
        if (modProfileRead.exists && modProfileRead.parseError) {
            recordLedgerParseError(snapshot, 'mod_profile.json', 'mod_profile.json is not valid JSON.');
        }
    }
    if (modBundle.modProfile) {
        snapshot.modProfile = modBundle.modProfile;
        snapshot.mods = modBundle.mods;
        sources.modProfile = modBundle.modProfileLoaded;
        sources.modManifestCount = modBundle.modManifestCount;
    }

    const bridgeMode = options?.vehicleBridgeMode;
    if (bridgeMode !== undefined) {
        snapshot.rawConfig = { vehicleBridgeMode: bridgeMode };
        sources.vehicleBridgeMode = true;
    }

    return snapshot;
}