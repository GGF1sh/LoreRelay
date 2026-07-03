// Campaign Kit Phase B: workspace discoveries.json loader.

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath } from './workspacePaths';
import { resolveActiveCampaignKit } from './campaignKit';
import {
    buildDiscoveryLedgerPromptBlock,
    parseDiscoveryLedger,
    type DiscoveryLedgerDocument,
} from './discoveryLedgerCore';

export const DISCOVERIES_FILENAME = 'discoveries.json';

let cachedPath = '';
let cachedMtime = 0;
let cachedLedger: DiscoveryLedgerDocument | undefined;

export function getDiscoveriesPath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, DISCOVERIES_FILENAME) : undefined;
}

export function clearDiscoveryLedgerCache(): void {
    cachedPath = '';
    cachedMtime = 0;
    cachedLedger = undefined;
}

export function loadDiscoveryLedger(): DiscoveryLedgerDocument | undefined {
    const ledgerPath = getDiscoveriesPath();
    if (!ledgerPath || !fs.existsSync(ledgerPath)) {
        return undefined;
    }
    try {
        const stat = fs.statSync(ledgerPath);
        if (cachedLedger && cachedPath === ledgerPath && cachedMtime === stat.mtimeMs) {
            return cachedLedger;
        }
        const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
        const parsed = parseDiscoveryLedger(raw);
        if (!parsed) {
            clearDiscoveryLedgerCache();
            return undefined;
        }
        cachedPath = ledgerPath;
        cachedMtime = stat.mtimeMs;
        cachedLedger = parsed;
        return parsed;
    } catch {
        return undefined;
    }
}

export function buildDiscoveryLedgerPromptContext(): string {
    if (!resolveActiveCampaignKit()) {
        return '';
    }
    return buildDiscoveryLedgerPromptBlock(loadDiscoveryLedger(), 12, resolveActiveCampaignKit());
}