import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';

const journalName = '.water-navigation.json';
const ledgers = new Set(['game_state.json', 'vehicle_state.json']);
const active = new Set<string>();
export interface NavigationWrite { name: string; before: string; after: string }
interface Journal { version: 1; phase: 'prepared' | 'committed' | 'rolled_back'; worldHash: string; requestId: string; writes: NavigationWrite[]; receipts: string[] }
export const navigationDigest = (value: string): string => createHash('sha256').update(value).digest('hex');
const workspaceKey = (root: string): string => (fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root)).toLowerCase();
export function navigationWriteActive(root: string): boolean { return active.has(workspaceKey(root)); }
function safePath(root: string, name: string): string {
    const target = path.join(root, name);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw Error('航行保存先がリンクです。');
    return target;
}
function durableReplace(target: string, value: string): void {
    const temporary = target + '.' + randomUUID() + '.tmp';
    const fd = fs.openSync(temporary, 'wx');
    try { fs.writeFileSync(fd, value, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, target);
}
function readJournal(root: string): Journal | undefined {
    const file = safePath(root, journalName);
    if (!fs.existsSync(file)) return;
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as Journal;
    if (!j || j.version !== 1 || !['prepared', 'committed', 'rolled_back'].includes(j.phase) || typeof j.worldHash !== 'string' || typeof j.requestId !== 'string' || !Array.isArray(j.receipts) || j.receipts.some(s => typeof s !== 'string') || !Array.isArray(j.writes) || j.writes.length > 2 || new Set(j.writes.map(w => w.name)).size !== j.writes.length || j.writes.some(w => !w || !ledgers.has(w.name) || typeof w.before !== 'string' || typeof w.after !== 'string')) throw Error('航行の復元記録が不正です。保存を停止しました。');
    return j;
}
export function navigationPending(root: string): boolean { return readJournal(root)?.phase === 'prepared'; }
export function navigationReceiptExists(root: string, id: string): boolean {
    const journal = readJournal(root);
    return !!journal?.receipts.includes(id) && journal.worldHash === navigationDigest(fs.readFileSync(safePath(root, 'world_forge.json'), 'utf8'));
}

/** A crash before the committed marker restores both ledgers; unexpected third-party edits block recovery. */
export function recoverWaterNavigation(root: string): void {
    if (navigationWriteActive(root)) return;
    const journal = readJournal(root);
    if (!journal || journal.phase !== 'prepared') return;
    if (navigationDigest(fs.readFileSync(safePath(root, 'world_forge.json'), 'utf8')) !== journal.worldHash) throw Error('未完了の航行と現在の世界が異なります。復元確認が必要です。');
    for (const w of journal.writes) {
        const current = fs.readFileSync(safePath(root, w.name), 'utf8');
        if (current !== w.before && current !== w.after) throw Error('未完了の航行後にセーブが変更されています。自動上書きを停止しました。');
    }
    for (const w of journal.writes) durableReplace(safePath(root, w.name), w.before);
    durableReplace(safePath(root, journalName), JSON.stringify({ ...journal, phase: 'rolled_back', writes: [] }));
}

/** Synchronous, journalled multi-ledger owner. Existing .bak files are never touched. */
export function commitWaterNavigation(root: string, worldHash: string, requestId: string, writes: NavigationWrite[], afterStage?: (stage: number) => void): 'committed' | 'replayed' {
    recoverWaterNavigation(root);
    if (navigationReceiptExists(root, requestId)) return 'replayed';
    if (!writes.length || writes.length > 2 || new Set(writes.map(w => w.name)).size !== writes.length || writes.some(w => !w || !ledgers.has(w.name) || typeof w.before !== 'string' || typeof w.after !== 'string')) throw Error('Invalid navigation ledgers');
    if (navigationDigest(fs.readFileSync(safePath(root, 'world_forge.json'), 'utf8')) !== worldHash) throw Error('世界が変わりました。航路を再確認してください。');
    for (const w of writes) if (fs.readFileSync(safePath(root, w.name), 'utf8') !== w.before) throw Error('セーブが変わりました。航路を再確認してください。');
    const previous = readJournal(root);
    const receipts = previous?.worldHash === worldHash ? previous.receipts : [];
    const journal: Journal = { version: 1, phase: 'prepared', worldHash, requestId, writes, receipts };
    const key = workspaceKey(root);
    if (active.has(key)) throw Error('航行保存処理中です。');
    active.add(key);
    let committed = false;
    try {
        durableReplace(safePath(root, journalName), JSON.stringify(journal)); afterStage?.(0);
        for (let i = 0; i < writes.length; i++) { durableReplace(safePath(root, writes[i].name), writes[i].after); afterStage?.(i + 1); }
        durableReplace(safePath(root, journalName), JSON.stringify({ ...journal, phase: 'committed', writes: [], receipts: [...receipts, requestId].slice(-512) }));
        committed = true;
        return 'committed';
    } finally {
        active.delete(key);
        if (!committed) recoverWaterNavigation(root);
    }
}
