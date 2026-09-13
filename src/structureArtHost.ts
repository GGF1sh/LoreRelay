import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { readCartographyImage } from './cartographyAssetStore';
import { safeImageUri } from './gameStateSync';
import { structureArtPrompt, structureArtSlot, type StructureArtTarget } from './structureArtCore';
import { StructureArtStore } from './structureArtStore';

let catalog: { workspace: string; world: string; targets: StructureArtTarget[] } | undefined;
let pending: { token: string; world: string; workspace: string; target: string; hash: string; slot: string; revision: string; image: ReturnType<typeof readCartographyImage> } | undefined;
let lastExport: { workspace: string; path: string } | undefined;
export function registerStructureArtTargets(workspace: string, world: string, targets: StructureArtTarget[]): StructureArtTarget[] {
    catalog = { workspace, world, targets }; return targets;
}
export async function handleStructureArt(message: Record<string, unknown>, workspace: string, panel: vscode.WebviewPanel): Promise<void> {
    const post = (data: object) => panel.webview.postMessage({ type: 'structureArt', target: message.target, world: message.world, sourceHash: message.sourceHash, slot: message.slot, ...data });
    try {
        const c = catalog;
        const target = c?.workspace === workspace && c.world === message.world ? c.targets.find(t => t.id === message.target) : undefined;
        if (!c || !target || target.sourceHash !== message.sourceHash) throw new Error('対象・世界・配置が変わりました。資料画面を開き直してください。');
        const slot = structureArtSlot(target, message.slot);
        const store = new StructureArtStore(workspace, c.world, target);
        const prompt = structureArtPrompt(target, slot, message.edits);
        if (message.action === 'copy') await vscode.env.clipboard.writeText(prompt);
        else if (message.action === 'export') {
            const raw = message.images;
            if (!Array.isArray(raw) || raw.length > target.layers.length * 2) throw new Error('Invalid image list');
            const allowed = new Set(target.layers.flatMap(l => [`plan-${l.layerId}.png`, `iso-${l.layerId}.png`]));
            const images = raw.map(r => {
                if (!r || !allowed.delete(r.name) || typeof r.data !== 'string' || r.data.length > 8 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(r.data)) throw new Error('Invalid PNG export');
                const bytes = Buffer.from(r.data, 'base64');
                if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid PNG');
                return { name: r.name, bytes };
            });
            const folder = store.export(prompt, slot, images);
            lastExport = { workspace, path: folder };
            await post({ notice: `資料を保存しました: ${folder}` });
        } else if (message.action === 'reveal') {
            if (lastExport?.workspace === workspace) await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(lastExport.path));
        } else if (message.action === 'import') {
            // Keep the visible preview usable until another image has been selected and validated.
            const revision = store.read().revision;
            const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Images: ['png','jpg','jpeg','webp'] }, title: '完成画像を取り込む' });
            if (!uris?.[0]) { await post({ notice: 'キャンセルしました' }); return; }
            if (catalog !== c) throw new Error('画面が更新されました。もう一度取り込んでください。');
            const image = readCartographyImage(uris[0].fsPath);
            pending = { token: randomUUID(), workspace, world: c.world, target: target.id, hash: target.sourceHash, slot, revision, image };
            await post({ preview: { token: pending.token, uri: `data:${image.mime};base64,${image.bytes.toString('base64')}`, name: target.name, slot } }); return;
        } else if (message.action === 'cancel') {
            if (pending?.token === message.token) pending = undefined;
        } else if (message.action === 'adopt') {
            const p = pending;
            if (!p || message.token !== p.token || p.workspace !== workspace || p.world !== c.world || p.target !== target.id || p.hash !== target.sourceHash || p.slot !== slot) throw new Error('古いプレビューです。画像を選び直してください。');
            store.adopt(slot, p.image, p.revision); pending = undefined;
        } else if (message.action !== 'list') throw new Error('Unknown art action');
        const state = store.read();
        const images = Object.entries(state.slots).filter(([s]) => s === 'exterior' || target.layers.some(l => l.layerId === s)).map(([s, i]) => {
            try { return { slot: s, uri: safeImageUri(store.imagePath(i)), stale: i.sourceHash !== target.sourceHash }; }
            catch { return { slot: s, error: '保存画像を読み込めません' }; }
        });
        await post({ images, prompt, adopted: message.action === 'adopt', notice: message.action === 'copy' ? '説明文をコピーしました' : undefined });
    } catch (e) { await post({ error: e instanceof Error ? e.message : String(e) }); }
}
