// Settlement Mode M5: host bridge from sanitized settlementView → diorama snapshot (no GM prompt).

import {
    buildSettlementDioramaSnapshot,
    type SettlementDioramaSnapshot,
    type SettlementDioramaTheme,
} from './settlementDioramaCore';
import type { SettlementViewSnapshot } from './settlementViewCore';
import type { OvermapThemeKey } from './tileOvermapCore';

export type SettlementDioramaRuleFlags = {
    enableSettlementMode?: boolean;
    enableSettlementDiorama?: boolean;
};

export function settlementDioramaEnabled(rules: SettlementDioramaRuleFlags | undefined): boolean {
    return rules?.enableSettlementMode === true && rules?.enableSettlementDiorama === true;
}

const OVERMAP_TO_DIORAMA_THEME: Partial<Record<OvermapThemeKey, SettlementDioramaTheme>> = {
    postapoc: 'postapoc',
    fantasy: 'fantasy',
    scifi: 'scifi',
    horror: 'horror',
    oriental: 'eastern',
    steampunk: 'industrial',
    cyberpunk: 'industrial',
    zombie: 'horror',
    modern: 'default',
};

export function resolveDioramaThemeFromOvermap(overmapThemeKey: OvermapThemeKey | undefined): SettlementDioramaTheme {
    if (!overmapThemeKey) { return 'default'; }
    return OVERMAP_TO_DIORAMA_THEME[overmapThemeKey] ?? 'default';
}

export function buildWorkspaceSettlementDiorama(
    view: SettlementViewSnapshot | undefined,
    rules: SettlementDioramaRuleFlags | undefined,
    options?: { theme?: SettlementDioramaTheme; includeLabels?: boolean }
): SettlementDioramaSnapshot | undefined {
    if (!settlementDioramaEnabled(rules) || !view) {
        return undefined;
    }
    return buildSettlementDioramaSnapshot({
        view,
        options: {
            theme: options?.theme,
            includeLabels: options?.includeLabels ?? true,
        },
    });
}