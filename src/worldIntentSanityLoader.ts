// World Intent WI5b: read-only workspace ledger loader (fs only, no vscode).

import * as fs from 'fs';
import * as path from 'path';
import { parseModManifest, parseModProfile, type ParsedModManifest } from './modSystemCore';
import { parseSettlementState } from './settlementCore';
import { parseVehicleState } from './vehicleCore';
import type { WorkspaceSanitySnapshot, WorkspaceSanitySources } from './worldIntentSanityHostCore';

export const MOD_MANIFEST_FILENAME = 'lorerelay_mod.json';
export const MAX_MOD_DIRS_SCANNED = 128;

export interface ReadWorkspaceSanitySnapshotOptions {
    vehicleBridgeMode?: unknown;
}

function readJsonFile(filePath: string): unknown | undefined {
    if (!fs.existsSync(filePath)) { return undefined; }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return undefined;
    }
}

function readVehicleStateFile(statePath: string) {
    const raw = readJsonFile(statePath);
    if (!raw) { return undefined; }
    const parsed = parseVehicleState(raw);
    return parsed.vehicles.length ? parsed : undefined;
}

function readSettlementStateFile(statePath: string) {
    const raw = readJsonFile(statePath);
    return raw ? parseSettlementState(raw) : undefined;
}

function readGameRuleFlags(wsPath: string): WorkspaceSanitySnapshot['gameRules'] {
    const raw = readJsonFile(path.join(wsPath, 'game_rules.json'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            enableVehicleSystem: false,
            enableSettlementMode: false,
            enableMobileBaseSystem: false,
        };
    }
    const rules = raw as Record<string, unknown>;
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
    const raw = readJsonFile(manifestPath);
    return raw ? parseModManifest(raw) : undefined;
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
    const rawProfile = readJsonFile(profilePath);
    const modProfile = parseModProfile(rawProfile);
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

    const vehicleState = readVehicleStateFile(path.join(wsPath, 'vehicle_state.json'));
    if (vehicleState) {
        snapshot.vehicleState = vehicleState;
        sources.vehicleState = true;
    }

    const settlementState = readSettlementStateFile(path.join(wsPath, 'settlement_state.json'));
    if (settlementState) {
        snapshot.settlementState = settlementState;
        sources.settlementState = true;
    }

    snapshot.gameRules = readGameRuleFlags(wsPath);
    sources.gameRules = true;

    const modBundle = loadWorkspaceMods(wsPath);
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