import * as fs from 'fs';
import * as vscode from 'vscode';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import { loadWorldState, isWorldStateEnabled } from './worldState';
import { generateWorldMap } from './worldMapGenerator';
import { extractHighlightRegionIds } from './npcBridgeCore';
import { pruneExpiredEvents } from './worldEventLogCore';
import type { Faction } from './worldForgeCore';
import type { FactionWorldState, RegionWorldState, GlobalEvent } from './worldStateCore';
import { loadNpcRegistry } from './npcRegistry';
import { buildNpcTtsCatalog, countNpcVoices } from './ttsProviderCore';
import { getEntriesByLocation } from './visualMemory';
import { safeImageUri } from './gameStateSync';
import { buildCartographyPinPositions, buildCartographyRegionLabels } from './cartographyLayoutCore';
import { resolveWorldMapImagePath } from './cartographyRunner';
import { getWorkspacePath } from './workspacePaths';

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

    const activeChanges = pruneExpiredEvents(
        worldState?.recentChanges ?? [],
        worldState?.worldTurn ?? 0
    );
    const highlightRegionIds = extractHighlightRegionIds(activeChanges);
    const worldMap = generateWorldMap(forge, currentLocationId, regionStates, factionStates, highlightRegionIds);
    const factions = forge.factions.map(serializeFaction);

    // Location image history — up to 4 most-recent analyzed entries for current location
    const locationImages = currentLocationId
        ? getEntriesByLocation(currentLocationId)
            .slice(0, 4)
            .map((e) => ({
                src: safeImageUri(e.imagePath) ?? '',
                rawImagePath: e.imagePath,
                description: e.description,
                worldTurn: e.worldTurn,
            }))
            .filter((e) => e.src)
        : [];

    // NPCs at current location with portrait URIs
    const registry = loadNpcRegistry();
    const MAX_NPCS_AT_LOCATION = 10;
    const npcsAtLocation = currentLocationId
        ? Object.entries(registry.npcs)
            .filter(([, npc]) => npc.locationId === currentLocationId)
            .sort(([, a], [, b]) => a.name.localeCompare(b.name))
            .slice(0, MAX_NPCS_AT_LOCATION)
            .map(([id, npc]) => ({
                id,
                name: npc.name,
                mood: npc.disposition.mood,
                playerTrust: npc.disposition.playerTrust,
                portraitUri: npc.portraitImagePath ? (safeImageUri(npc.portraitImagePath) ?? undefined) : undefined,
                hasPortrait: Boolean(npc.portraitImagePath),
                hasVoice: Boolean(npc.voice),
                voiceLabel: npc.voice?.label,
                voice: npc.voice,
                urgentNeedCount: npc.needs.filter((n) => n.urgency >= 70).length,
            }))
        : [];

    const ttsConfig = vscode.workspace.getConfiguration('textAdventure');
    const ttsExternalEnabled = ttsConfig.get<boolean>('tts.external.enabled', false);
    const npcTtsCatalog = buildNpcTtsCatalog(registry);
    const npcVoiceCount = countNpcVoices(registry);

    const wsPath = getWorkspacePath();
    const worldMapImagePath = resolveWorldMapImagePath(wsPath);
    const cartographyImage = worldMapImagePath && fs.existsSync(worldMapImagePath)
        ? safeImageUri(worldMapImagePath) ?? null
        : null;
    const cartographyPins = buildCartographyPinPositions(forge);
    const cartographyRegionLabels = buildCartographyRegionLabels(forge);

    panel.webview.postMessage({
        type: 'worldView',
        enabled: true,
        worldName: forge.meta.worldName,
        theme: forge.meta.theme ?? '',
        worldMap,
        cartographyImage,
        cartographyPins,
        cartographyRegionLabels,
        cartographyHasImage: Boolean(cartographyImage),
        factions,
        factionStates: factionStates ?? null,
        regionStates: regionStates ?? null,
        globalEvents: globalEvents ?? [],
        recentChanges: activeChanges,
        questHooks: worldState?.questHooks ?? [],
        worldTurn: worldTurn ?? null,
        simEnabled,
        currentLocationId: currentLocationId ?? null,
        locationCount: forge.geography.locations.length,
        regionCount: forge.geography.regions.length,
        locationImages,
        npcsAtLocation,
        npcTtsCatalog,
        ttsExternalEnabled,
        npcVoiceCount,
    });
}
