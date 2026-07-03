// Settlement Mode M1: workspace settlement_state.json loader.

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath } from './workspacePaths';
import { loadGameRules } from './gameRules';
import {
    buildSettlementPromptBlock,
    parseSettlementState,
    settlementModeEnabled,
    type SettlementStateV1,
} from './settlementCore';

export const SETTLEMENT_STATE_FILENAME = 'settlement_state.json';

let cachedPath = '';
let cachedMtime = 0;
let cachedDoc: SettlementStateV1 | undefined;

export function getSettlementStatePath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, SETTLEMENT_STATE_FILENAME) : undefined;
}

export function clearSettlementStateCache(): void {
    cachedPath = '';
    cachedMtime = 0;
    cachedDoc = undefined;
}

export function readSettlementStateFromDisk(statePath?: string): SettlementStateV1 | undefined {
    const resolved = statePath ?? getSettlementStatePath();
    if (!resolved || !fs.existsSync(resolved)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        return parseSettlementState(raw);
    } catch {
        return undefined;
    }
}

export function loadSettlementState(): SettlementStateV1 | undefined {
    const statePath = getSettlementStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        const stat = fs.statSync(statePath);
        if (cachedDoc && cachedPath === statePath && cachedMtime === stat.mtimeMs) {
            return cachedDoc;
        }
        const parsed = readSettlementStateFromDisk(statePath);
        if (!parsed) {
            clearSettlementStateCache();
            return undefined;
        }
        cachedPath = statePath;
        cachedMtime = stat.mtimeMs;
        cachedDoc = parsed;
        return parsed;
    } catch {
        return undefined;
    }
}

export function buildSettlementPromptContext(): string {
    const rules = loadGameRules();
    if (!settlementModeEnabled(rules)) { return ''; }
    return buildSettlementPromptBlock(loadSettlementState(), true);
}