import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import * as path from 'path';
import type { WorldForge } from './worldForgeCore';
import { cartographyWorldKey } from './cartographyOverlayCore';
import { adoptCartographyAsset, readCartographyImage, saveCartographyOverlay,
    loadCartographyAsset, saveCartographyMarker } from './cartographyAssetStore';

let pending: { token: string; workspace: string; worldKey: string; revision?: string;
    image: ReturnType<typeof readCartographyImage> } | undefined;
let importSequence = 0;

export async function handleWorldMapAsset(message: Record<string, unknown>, deps: {
    workspace: string; forge: () => WorldForge | undefined; post: (value: unknown) => void; refresh: () => void;
}): Promise<void> {
    const post = (value: object) => deps.post({ type: 'worldMapAssetState', ...value });
    try {
        const forge = deps.forge();
        if (!forge) throw new Error('World is unavailable');
        const worldKey = cartographyWorldKey(forge);
        if (message.action === 'import') {
            const sequence = ++importSequence;
            pending = undefined;
            const revision = loadCartographyAsset(deps.workspace, forge)?.revision;
            const selected = await vscode.window.showOpenDialog({ canSelectMany: false,
                filters: { 'Map image': ['png', 'jpg', 'jpeg', 'webp'] }, title: '地図画像を取り込む' });
            if (sequence !== importSequence) return;
            if (!selected?.[0]) return;
            if (cartographyWorldKey(deps.forge()!) !== worldKey) throw new Error('World changed; import again');
            const image = readCartographyImage(selected[0].fsPath);
            pending = { token: randomUUID(), workspace: deps.workspace, worldKey, revision, image };
            post({ status: 'preview', token: pending.token, worldKey,
                image: `data:${image.mime};base64,${image.bytes.toString('base64')}` });
        } else if (message.action === 'cancel') {
            if (message.token === pending?.token) pending = undefined;
            post({ status: 'cancelled' });
        } else if (message.action === 'adopt') {
            if (!pending || pending.token !== message.token || pending.workspace !== deps.workspace
                || pending.worldKey !== worldKey || pending.revision !== loadCartographyAsset(deps.workspace, forge)?.revision) {
                throw new Error('Map or world changed; import again');
            }
            adoptCartographyAsset(deps.workspace, forge, pending.image);
            pending = undefined;
            deps.refresh();
            post({ status: 'adopted' });
        } else if (message.action === 'prepareEdit') {
            if (message.worldKey !== worldKey) throw new Error('World changed; reopen the map');
            if (!loadCartographyAsset(deps.workspace, forge)) {
                adoptCartographyAsset(deps.workspace, forge, readCartographyImage(path.join(deps.workspace, 'world_map.png')));
            }
            deps.refresh();
            post({ status: 'edit' });
        } else if (message.action === 'markerMode' || message.action === 'markerImage') {
            if (message.worldKey !== worldKey) throw new Error('World changed; reopen the map');
            let image;
            if (message.action === 'markerImage') {
                const selected = await vscode.window.showOpenDialog({ canSelectMany: false,
                    filters: { 'Marker image': ['png', 'jpg', 'jpeg', 'webp'] }, title: '主人公アイコンを設定（最大4 MiB）' });
                if (!selected?.[0]) { post({ status: 'markerCancelled' }); return; }
                if (!deps.forge() || cartographyWorldKey(deps.forge()!) !== worldKey) throw new Error('World changed; choose the icon again');
                image = readCartographyImage(selected[0].fsPath);
            }
            saveCartographyMarker(deps.workspace, forge, message.revision,
                image ? 'custom' : message.mode, image);
            deps.refresh();
            post({ status: 'markerSaved' });
        } else if (message.action === 'save') {
            if (message.worldKey !== worldKey) throw new Error('World changed; reopen the map');
            saveCartographyOverlay(deps.workspace, forge, message.revision, message.overlay);
            deps.refresh();
            post({ status: 'saved' });
        }
    } catch (error) {
        post({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
}
