import * as vscode from 'vscode';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { getWorkspacePath } from './workspacePaths';
import { loadExistingAcceptedTurnScope, getAcceptedTurnLedgerPath } from './acceptedTurnReplayGuard';
import { parseAcceptedTurnLedger } from './acceptedTurnReplayGuardCore';
import { getGameEntryHistory, safeImageUri } from './gameStateSync';
import { VisualBrief, VisualPresentation, visualComposerEdits, visualComposerHash, visualComposerImageLimit, visualComposerPrompt, visualComposerSourceCurrent } from './visualComposerCore';
import { VisualComposerStore } from './visualComposerStore';

/** Local webview only; no remote/MCP route and no provider requests. */
export async function visualComposerHandle(message: Record<string, unknown>, panel: vscode.WebviewPanel | undefined): Promise<void> {
    if (!panel) return;
    const reply = (payload: Record<string, unknown>) => panel.webview.postMessage({ type: 'visualComposer', requestId: message.requestId, ...payload });
    try {
        const workspace = getWorkspacePath();
        if (!workspace) throw new Error('Open a campaign workspace first / ワークスペースを開いてください');
        const store = new VisualComposerStore(workspace);
        const scope = () => {
            const s = loadExistingAcceptedTurnScope(workspace);
            return { sessionId: s?.campaignInstanceId ?? `legacy-${visualComposerHash(workspace)}`, epochId: s?.timelineEpochId ?? 'legacy' };
        };
        const current = (brief: VisualBrief) => {
            if (getWorkspacePath() !== workspace) return false;
            const s = scope();
            return visualComposerSourceCurrent(brief, s.sessionId, s.epochId, getGameEntryHistory());
        };
        const find = (value: VisualPresentation): VisualBrief => {
            const brief = value.drafts.find(b => b.id === message.briefId && b.source.sessionId === scope().sessionId);
            if (!brief) throw new Error('Brief not found / 下書きが見つかりません');
            return brief;
        };
        const edit = (brief: VisualBrief) => {
            const edits = visualComposerEdits(message.edits);
            if (JSON.stringify(edits) !== JSON.stringify(brief.edits)) { brief.edits = edits; brief.updatedAt = new Date().toISOString(); }
        };
        let selected: VisualBrief | undefined;
        let notice = '';
        if (message.action === 'open') {
            const entry = getGameEntryHistory().find(e => e.id === message.entryId && e.role === 'gm');
            if (!entry || !entry.content.trim()) throw new Error('This published turn is no longer available / 対象の確定ターンがありません');
            const s = scope();
            selected = store.change(value => {
                const prior = value.drafts.find(b => b.source.turnId === entry.id && current(b));
                if (prior) return prior;
                // Read only an existing receipt. Never repair/initialize the canonical ledger here.
                const ledgerPath = getAcceptedTurnLedgerPath(workspace);
                const ledger = fs.existsSync(ledgerPath) ? parseAcceptedTurnLedger(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')), s.sessionId) : undefined;
                const receipt = ledger?.records.find(r => r.turnId === entry.id && r.timelineEpochId === s.epochId);
                const now = new Date().toISOString();
                const brief: VisualBrief = { schemaVersion: 1, id: randomUUID(), source: { ...s, turnId: entry.id, content: entry.content, contentHash: visualComposerHash(entry.content), ...(receipt ? { acceptedIdentity: receipt.identityHash } : {}) }, edits: { scene: '', preserve: '', avoid: '', composition: '', style: '', aspectRatio: '16:9', tags: '', negative: '', destination: 'generic' }, createdAt: now, updatedAt: now };
                value.drafts.push(brief); return brief;
            });
        } else if (message.action === 'preview') {
            const brief = find(store.read()); edit(brief);
            await reply({ preview: visualComposerPrompt(brief) }); return;
        } else if (['save', 'copy', 'export'].includes(String(message.action))) {
            selected = store.change(value => { const brief = find(value); edit(brief); return brief; });
            const prompt = visualComposerPrompt(selected);
            if (message.action === 'copy') await vscode.env.clipboard.writeText(prompt);
            if (message.action === 'export') {
                const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(vscode.Uri.file(workspace), `scene-${selected.id}.txt`), filters: { Text: ['txt'] } });
                if (uri) await vscode.workspace.fs.writeFile(uri, Buffer.from(prompt, 'utf8'));
            }
            notice = message.action === 'copy' ? 'Copied / コピーしました' : 'Saved / 保存しました';
        } else if (message.action === 'import') {
            // Snapshot before a native dialog; reload and revalidate workspace/draft after it.
            find(store.read());
            let bytes: Buffer;
            if (message.data !== undefined) {
                if (typeof message.data !== 'string' || message.data.length > Math.ceil(visualComposerImageLimit / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(message.data)) throw new Error('Invalid image upload');
                bytes = Buffer.from(message.data, 'base64');
                if (bytes.toString('base64') !== message.data) throw new Error('Invalid image upload');
            } else {
                const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Images: ['png', 'jpg', 'jpeg', 'webp'] } });
                if (!uris?.length) { await reply({ notice: 'Cancelled / キャンセルしました' }); return; }
                const uri = uris[0];
                if (uri.scheme !== 'file' || !fs.statSync(uri.fsPath).isFile() || fs.statSync(uri.fsPath).size > visualComposerImageLimit) throw new Error('Image must be at most 20 MiB');
                bytes = fs.readFileSync(uri.fsPath);
            }
            if (getWorkspacePath() !== workspace) throw new Error('Workspace changed; reopen the composer');
            const service = typeof message.service === 'string' && message.service.length <= 100 ? message.service : '';
            selected = store.change(value => { const brief = find(value); edit(brief); store.import(value, brief, bytes, service); return brief; });
            notice = 'Imported to gallery / ギャラリーに取り込みました';
        } else if (message.action === 'bind') {
            store.change(value => {
                const c = value.candidates.find(c => c.id === message.candidateId && c.brief.source.sessionId === scope().sessionId);
                if (!c) throw new Error('Candidate not found');
                const target = message.target;
                if (target !== 'turn' && target !== 'background') throw new Error('Invalid adoption target');
                if (message.enabled !== false && !current(c.brief)) throw new Error('Source turn changed. Image remains in gallery / 元のターンが無効です。画像はギャラリーに残ります');
                value.bindings = value.bindings.filter(b => {
                    if (b.target !== target) return true;
                    if (message.enabled === false) return b.candidateId !== c.id;
                    const other = value.candidates.find(x => x.id === b.candidateId)!;
                    return target === 'turn' && (other.brief.source.turnId !== c.brief.source.turnId || other.brief.source.sessionId !== c.brief.source.sessionId);
                });
                if (message.enabled !== false) value.bindings.push({ candidateId: c.id, target });
            });
        } else if (message.action === 'resume') {
            selected = find(store.read());
        } else if (message.action !== 'list') throw new Error('Unknown visual action');

        if (getWorkspacePath() !== workspace) throw new Error('Workspace changed; reopen the composer');
        const value = store.read(); const s = scope();
        await reply({
            ...(selected ? { brief: selected, prompt: visualComposerPrompt(selected), valid: current(selected) } : {}), notice,
            drafts: value.drafts.filter(b => b.source.sessionId === s.sessionId).map(b => ({ id: b.id, turnId: b.source.turnId, valid: current(b) })),
            candidates: value.candidates.filter(c => c.brief.source.sessionId === s.sessionId).map(c => ({ id: c.id, briefId: c.briefId, turnId: c.brief.source.turnId, uri: safeImageUri(store.imagePath(c)), createdAt: c.createdAt, service: c.serviceReportedByUser, valid: current(c.brief), targets: current(c.brief) ? value.bindings.filter(b => b.candidateId === c.id).map(b => b.target) : [], savedTargets: value.bindings.filter(b => b.candidateId === c.id).map(b => b.target) })),
        });
    } catch (error) {
        await reply({ error: error instanceof Error ? error.message : String(error) });
    }
}
