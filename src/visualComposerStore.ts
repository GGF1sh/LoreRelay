import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { VisualPresentation, VisualBrief, VisualCandidate, visualComposerEdits, visualComposerHash, visualComposerImageFormat, visualComposerPrompt } from './visualComposerCore';

/** Dedicated presentation store. Does not write game_state/history or visual_memory. */
export class VisualComposerStore {
    private root: string;
    constructor(workspace: string) { this.root = fs.realpathSync(workspace); }
    private directory(): string {
        let dir = this.root;
        for (const part of ['.text-adventure', 'visuals']) {
            dir = path.join(dir, part);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir);
            if (fs.lstatSync(dir).isSymbolicLink() || fs.realpathSync(dir) !== dir) throw new Error('Unsafe visual store path');
        }
        return dir;
    }
    private file(name: string): string {
        if (!/^[a-zA-Z0-9.-]+$/.test(name)) throw new Error('Invalid visual file');
        const file = path.join(this.directory(), name);
        if (fs.existsSync(file) && (fs.lstatSync(file).isSymbolicLink() || !fs.lstatSync(file).isFile())) throw new Error('Unsafe visual file');
        return file;
    }
    read(): VisualPresentation {
        const file = this.file('presentation.json');
        if (!fs.existsSync(file)) return { schemaVersion: 1, drafts: [], candidates: [], bindings: [] };
        if (fs.statSync(file).size > 64 * 1024 * 1024) throw new Error('Visual store is too large');
        const value = JSON.parse(fs.readFileSync(file, 'utf8')) as VisualPresentation;
        if (value.schemaVersion !== 1 || !Array.isArray(value.drafts) || !Array.isArray(value.candidates) || !Array.isArray(value.bindings)) throw new Error('Invalid visual store');
        const checkBrief = (b: VisualBrief) => {
            if (!b || b.schemaVersion !== 1 || typeof b.id !== 'string' || !b.source || typeof b.source.sessionId !== 'string' || typeof b.source.epochId !== 'string' || typeof b.source.turnId !== 'string' || typeof b.source.content !== 'string' || visualComposerHash(b.source.content) !== b.source.contentHash) throw new Error('Invalid saved brief');
            visualComposerEdits(b.edits);
        };
        value.drafts.forEach(checkBrief);
        value.candidates.forEach(c => {
            checkBrief(c.brief);
            if (!/^[a-f0-9]{64}$/.test(c.imageHash) || !['png', 'jpg', 'webp'].includes(c.extension) || c.canonicalEffect !== 'none' || c.briefId !== c.brief.id || visualComposerHash(JSON.stringify(c.brief)) !== c.briefHash || visualComposerHash(c.prompt) !== c.promptHash) throw new Error('Invalid saved candidate');
        });
        if (value.bindings.some(b => !['turn', 'background'].includes(b.target) || !value.candidates.some(c => c.id === b.candidateId))) throw new Error('Invalid visual binding');
        return value;
    }
    change<T>(edit: (value: VisualPresentation) => T): T {
        // Cross-window exclusion, held only for synchronous read/modify/rename (never over dialogs).
        const lock = this.file('write.lock');
        let fd: number;
        try { fd = fs.openSync(lock, 'wx'); } catch { throw new Error('Visual store is busy (write.lock). Retry after the other window finishes.'); }
        let temp: string | undefined;
        try {
            const value = this.read(); const result = edit(value);
            const json = JSON.stringify(value, null, 2);
            if (Buffer.byteLength(json) > 64 * 1024 * 1024) throw new Error('Visual store is full');
            temp = this.file(`${randomUUID()}.tmp`);
            fs.writeFileSync(temp, json, { flag: 'wx' });
            fs.renameSync(temp, this.file('presentation.json'));
            return result;
        } finally {
            fs.closeSync(fd);
            fs.unlinkSync(lock);
            if (temp && fs.existsSync(temp)) fs.unlinkSync(temp);
        }
    }
    imagePath(candidate: VisualCandidate): string { return this.file(`${candidate.imageHash}.${candidate.extension}`); }
    import(value: VisualPresentation, brief: VisualBrief, bytes: Buffer, service: string): VisualCandidate {
        const extension = visualComposerImageFormat(bytes); const imageHash = visualComposerHash(bytes);
        const briefHash = visualComposerHash(JSON.stringify(brief));
        const existing = value.candidates.find(c => c.imageHash === imageHash && c.briefHash === briefHash && c.serviceReportedByUser === service);
        if (existing) return existing;
        const prompt = visualComposerPrompt(brief);
        const candidate: VisualCandidate = { id: randomUUID(), briefId: brief.id, imageHash, extension, briefHash, promptHash: visualComposerHash(prompt), prompt, brief: JSON.parse(JSON.stringify(brief)), createdAt: new Date().toISOString(), serviceReportedByUser: service, canonicalEffect: 'none' };
        const target = this.imagePath(candidate);
        if (fs.existsSync(target)) {
            if (visualComposerHash(fs.readFileSync(target)) !== imageHash) throw new Error('Stored image hash mismatch');
        } else fs.writeFileSync(target, bytes, { flag: 'wx' });
        value.candidates.push(candidate);
        return candidate;
    }
}
