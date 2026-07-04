// Settlement Mode M1: workspace settlement_state.json loader.

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath } from './workspacePaths';
import { loadGameRules } from './gameRules';
import {
    buildSettlementPromptBlock,
    parseSettlementLayout,
    parseSettlementState,
    settlementModeEnabled,
    type SettlementLayoutV1,
    type SettlementStateV1,
} from './settlementCore';
import type { PromptBudgetPolicy } from './gmPromptBuilderCore';

export const SETTLEMENT_STATE_FILENAME = 'settlement_state.json';
export const SETTLEMENT_LAYOUT_FILENAME = 'settlement_layout.json';

let cachedPath = '';
let cachedMtime = 0;
let cachedDoc: SettlementStateV1 | undefined;

let cachedLayoutPath = '';
let cachedLayoutMtime = 0;
let cachedLayoutDoc: SettlementLayoutV1 | undefined;

export function getSettlementStatePath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, SETTLEMENT_STATE_FILENAME) : undefined;
}

export function clearSettlementLayoutCache(): void {
    cachedLayoutPath = '';
    cachedLayoutMtime = 0;
    cachedLayoutDoc = undefined;
}

export function clearSettlementStateCache(): void {
    cachedPath = '';
    cachedMtime = 0;
    cachedDoc = undefined;
    clearSettlementLayoutCache();
}

/** Fresh disk read for serialized mutations (bypasses loader cache). */
export function readSettlementLayoutFromDisk(layoutPath?: string): SettlementLayoutV1 | undefined {
    const resolved = layoutPath ?? getSettlementLayoutPath();
    if (!resolved || !fs.existsSync(resolved)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        return parseSettlementLayout(raw);
    } catch {
        return undefined;
    }
}

export function getSettlementLayoutPath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, SETTLEMENT_LAYOUT_FILENAME) : undefined;
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

export function loadSettlementLayout(): SettlementLayoutV1 | undefined {
    const layoutPath = getSettlementLayoutPath();
    if (!layoutPath || !fs.existsSync(layoutPath)) {
        return undefined;
    }
    try {
        const stat = fs.statSync(layoutPath);
        if (cachedLayoutDoc && cachedLayoutPath === layoutPath && cachedLayoutMtime === stat.mtimeMs) {
            return cachedLayoutDoc;
        }
        const parsed = readSettlementLayoutFromDisk(layoutPath);
        if (!parsed) {
            clearSettlementLayoutCache();
            return undefined;
        }
        cachedLayoutPath = layoutPath;
        cachedLayoutMtime = stat.mtimeMs;
        cachedLayoutDoc = parsed;
        return parsed;
    } catch {
        return undefined;
    }
}

export function buildSettlementPromptContext(policy?: Pick<PromptBudgetPolicy, 'mode'>): string {
    const rules = loadGameRules();
    if (!settlementModeEnabled(rules)) { return ''; }
    return buildSettlementPromptBlock(loadSettlementState(), true, {
        summaryOnly: policy?.mode === 'compact',
    });
}