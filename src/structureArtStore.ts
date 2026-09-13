import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { structureArtHash, type StructureArtTarget } from './structureArtCore';
import type { readCartographyImage } from './cartographyAssetStore';

interface ArtImage { file: string; sourceHash: string; createdAt: string }
interface ArtState { revision: string; slots: Record<string, ArtImage>; history: ArtImage[] }
export class StructureArtStore {
    readonly root: string;
    constructor(workspace: string, readonly world: string, readonly target: StructureArtTarget) {
        this.root = path.join(workspace, '.lorerelay-structure-art');
        if (!fs.existsSync(this.root)) fs.mkdirSync(this.root);
        if (fs.lstatSync(this.root).isSymbolicLink() || path.dirname(fs.realpathSync(this.root)).toLowerCase() !== fs.realpathSync(workspace).toLowerCase()) throw new Error('Invalid art directory');
    }
    private manifest(): string { return path.join(this.root, structureArtHash([this.world, this.target.id]) + '.json'); }
    read(): ArtState {
        const f = this.manifest();
        if (!fs.existsSync(f)) return { revision: '', slots: {}, history: [] };
        if (fs.lstatSync(f).isSymbolicLink()) throw new Error('Invalid manifest');
        const state = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (typeof state.revision !== 'string' || !state.slots || !Array.isArray(state.history)) throw new Error('Invalid manifest');
        return state;
    }
    imagePath(image: ArtImage): string {
        if (!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(image.file)) throw new Error('Invalid image');
        const file = path.join(this.root, image.file);
        if (fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw new Error('Invalid image');
        if (structureArtHash(fs.readFileSync(file)) !== image.file.split('.')[0]) throw new Error('Image changed');
        return file;
    }
    adopt(slot: string, image: ReturnType<typeof readCartographyImage>, expected: string): void {
        const state = this.read();
        if (state.revision !== expected) throw new Error('画像が更新されました。開き直してください。');
        const file = `${structureArtHash(image.bytes)}.${image.extension}`;
        if (!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(file)) throw new Error('Invalid image format');
        const record = { file, sourceHash: this.target.sourceHash, createdAt: new Date().toISOString() };
        const destination = path.join(this.root, file);
        if (!fs.existsSync(destination)) fs.writeFileSync(destination, image.bytes, { flag: 'wx' });
        this.imagePath(record);
        const next = { revision: randomUUID(), slots: { ...state.slots, [slot]: record }, history: [...state.history, ...(state.slots[slot] ? [state.slots[slot]] : [])] };
        const temporary = this.manifest() + '.' + randomUUID() + '.tmp';
        fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { flag: 'wx' });
        fs.renameSync(temporary, this.manifest());
    }
    export(prompt: string, slot: string, images: { name: string; bytes: Buffer }[]): string {
        const dir = path.join(this.root, 'export-' + randomUUID()); fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'brief.md'), prompt);
        for (const image of images) {
            if (!/^[a-z0-9-]+\.png$/.test(image.name)) throw new Error('Invalid export image');
            fs.writeFileSync(path.join(dir, image.name), image.bytes, { flag: 'wx' });
        }
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 1, world: this.world, target: this.target.id, slot, sourceHash: this.target.sourceHash, createdAt: new Date().toISOString(), files: images.map(i => i.name) }, null, 2));
        return dir;
    }
}
