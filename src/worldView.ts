import * as vscode from 'vscode';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import { loadWorldState, isWorldStateEnabled } from './worldState';
import { generateWorldMap } from './worldMapGenerator';
import { extractHighlightRegionIds } from './npcBridgeCore';
import type { Faction } from './worldForgeCore';
import type { FactionWorldState, RegionWorldState, GlobalEvent } from './worldStateCore';

let getPanelRef: (() => vscode.WebviewPanel | undefined) | undefined;

export function initWorldView(deps: { getPanel: () => vscode.WebviewPanel | undefined }): void {
    getPanelRef = deps.getPanel;
}

export interface WorldViewFaction {
    id: string;
    name: string;
    type: string;
    power?: number;
    description?: string;
    goals?: string[];
    enemies?: string[];
    allies?: string[];
}

function serializeFaction(f: Faction): WorldViewFaction {
    const out: WorldViewFaction = { id: f.id, name: f.name, type: f.type };
    if (f.power !== undefined) { out.power = f.power; }
    if (f.description) { out.description = f.description; }
    if (f.goals && f.goals.length > 0) { out.goals = f.goals; }
    if (f.enemies && f.enemies.length > 0) { out.enemies = f.enemies; }
    if (f.allies && f.allies.length > 0) { out.allies = f.allies; }
    return out;
}

/**
 * World Forge データを Webview の World タブへ送信する。
 * gameStateSync から呼ばれる（scenarioDirector の push パターンに倣う）。
 */
export function pushWorldViewToWebview(currentLocationId?: string): void {
    const panel = getPanelRef?.();
    if (!panel) { return; }

    if (!isWorldForgeEnabled()) {
        panel.webview.postMessage({ type: 'worldView', enabled: false });
        return;
    }

    const forge = loadWorldForge();
    if (!forge) {
        panel.webview.postMessage({ type: 'worldView', enabled: false });
        return;
    }

    // シミュレーション状態（有効かつファイルが存在する場合のみ）
    const simEnabled = isWorldStateEnabled();
    const worldState = simEnabled ? loadWorldState() : undefined;
    const factionStates: Record<string, FactionWorldState> | undefined = worldState?.factions;
    const regionStates: Record<string, RegionWorldState> | undefined = worldState?.regions;
    const globalEvents: GlobalEvent[] | undefined = worldState?.globalEvents;
    const worldTurn: number | undefined = worldState?.worldTurn;

    const highlightRegionIds = extractHighlightRegionIds(worldState?.recentChanges ?? []);
    const worldMap = generateWorldMap(forge, currentLocationId, regionStates, factionStates, highlightRegionIds);
    const factions = forge.factions.map(serializeFaction);

    panel.webview.postMessage({
        type: 'worldView',
        enabled: true,
        worldName: forge.meta.worldName,
        theme: forge.meta.theme ?? '',
        worldMap,
        factions,
        factionStates: factionStates ?? null,
        regionStates: regionStates ?? null,
        globalEvents: globalEvents ?? [],
        recentChanges: worldState?.recentChanges ?? [],
        worldTurn: worldTurn ?? null,
        simEnabled,
        currentLocationId: currentLocationId ?? null,
        locationCount: forge.geography.locations.length,
        regionCount: forge.geography.regions.length
    });
}
