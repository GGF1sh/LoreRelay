import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import type { WorldForge } from './worldForgeCore';
import { cartographyWorldKey, validateCartographyOverlay, type CartographyOverlay } from './cartographyOverlayCore';

export interface CartographyAssetState {
    version: 1;
    worldKey: string;
    imageKey: string;
    file: string;
    revision: string;
    overlay: CartographyOverlay;
}
export function emptyCartographyOverlay(): CartographyOverlay {
    return { pins: {}, regions: {}, showLabels: true, showRoutes: true };
}

// A user-selected file is read once; adoption uses this snapshot, never a path sent by the webview.
export function readCartographyImage(file: string): { bytes: Buffer; extension: string; mime: string } {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024 || stat.size < 16) throw new Error('Image must be 16 bytes–32 MiB');
    const bytes = fs.readFileSync(file);
    if (bytes.length < 16 || bytes.length > 32 * 1024 * 1024) throw new Error('Invalid image size');
    let extension = '', mime = '', width = 0, height = 0;
    if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        && bytes.length >= 45 && bytes.toString('ascii', 12, 16) === 'IHDR'
        && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
        && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND') {
        extension = 'png'; mime = 'image/png'; width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
    }
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) {
        extension = 'jpg'; mime = 'image/jpeg';
        for (let offset = 2; offset + 9 < bytes.length;) {
            if (bytes[offset++] !== 255) break;
            while (bytes[offset] === 255) offset++;
            const marker = bytes[offset++];
            if (marker === 0xda || marker === 0xd9) break;
            if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
            const length = bytes.readUInt16BE(offset);
            if (length < 2 || offset + length > bytes.length) break;
            if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 8) {
                height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break;
            }
            offset += length;
        }
    }
    else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
        && bytes.readUInt32LE(4) + 8 === bytes.length && /^VP8[ LX]$/.test(bytes.toString('ascii', 12, 16)) && bytes.length >= 30) {
        extension = 'webp'; mime = 'image/webp';
        const kind = bytes.toString('ascii', 12, 16);
        if (kind === 'VP8X') { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3); }
        else if (kind === 'VP8L' && bytes[20] === 0x2f) {
            const bits = bytes.readUInt32LE(21); width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff);
        } else if (kind === 'VP8 ' && bytes.subarray(23, 26).equals(Buffer.from([0x9d,1,0x2a]))) {
            width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff;
        }
    }
    if (!extension || !width || !height || width > 16384 || height > 16384 || width * height > 40000000) {
        throw new Error('Invalid PNG / JPEG / WebP image or dimensions (maximum 40 megapixels)');
    }
    return { bytes, extension, mime };
}

function assetDir(workspace: string, create = false): string {
    const dir = path.join(workspace, '.lorerelay-map-assets');
    if (create && !fs.existsSync(dir)) fs.mkdirSync(dir);
    if (fs.existsSync(dir) && (fs.lstatSync(dir).isSymbolicLink()
        || path.dirname(fs.realpathSync(dir)).toLowerCase() !== fs.realpathSync(workspace).toLowerCase())) {
        throw new Error('Map asset directory must be inside the workspace');
    }
    return dir;
}
function regularFile(file: string): boolean {
    return fs.existsSync(file) && !fs.lstatSync(file).isSymbolicLink() && fs.statSync(file).isFile();
}
function digest(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

export function loadCartographyAsset(workspace: string, forge: WorldForge): CartographyAssetState | undefined {
    const worldKey = cartographyWorldKey(forge);
    const dir = assetDir(workspace), manifest = path.join(dir, `${worldKey}.json`);
    if (!regularFile(manifest)) return undefined;
    const raw = JSON.parse(fs.readFileSync(manifest, 'utf8')) as CartographyAssetState;
    if (raw.version !== 1 || raw.worldKey !== worldKey || !/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(raw.file)
        || raw.file.split('.')[0] !== raw.imageKey || typeof raw.revision !== 'string') throw new Error('Invalid map asset');
    const image = path.join(dir, raw.file);
    if (!regularFile(image) || digest(fs.readFileSync(image)) !== raw.imageKey) throw new Error('Map image changed or missing');
    return { ...raw, overlay: validateCartographyOverlay(raw.overlay, forge) };
}

export function cartographyAssetPath(workspace: string, state: CartographyAssetState): string {
    return path.join(assetDir(workspace), state.file);
}

function commit(workspace: string, state: CartographyAssetState): void {
    const dir = assetDir(workspace, true), file = path.join(dir, `${state.worldKey}.json`);
    if (fs.existsSync(file)) {
        if (!regularFile(file)) throw new Error('Invalid map manifest');
        fs.copyFileSync(file, path.join(dir, `${state.worldKey}.previous-${randomUUID()}.json`), fs.constants.COPYFILE_EXCL);
    }
    const temporary = path.join(dir, `${state.worldKey}.${randomUUID()}.tmp`);
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { flag: 'wx' });
    fs.renameSync(temporary, file);
}

export function adoptCartographyAsset(workspace: string, forge: WorldForge,
    image: ReturnType<typeof readCartographyImage>): CartographyAssetState {
    const dir = assetDir(workspace, true), imageKey = digest(image.bytes);
    const file = `${imageKey}.${image.extension}`;
    if (!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(file)) throw new Error('Invalid image extension');
    const target = path.join(dir, file);
    if (fs.existsSync(target)) {
        if (!regularFile(target) || digest(fs.readFileSync(target)) !== imageKey) throw new Error('Invalid existing map image');
    } else fs.writeFileSync(target, image.bytes, { flag: 'wx' });
    const state: CartographyAssetState = { version: 1, worldKey: cartographyWorldKey(forge), imageKey,
        file, revision: randomUUID(), overlay: emptyCartographyOverlay() };
    commit(workspace, state);
    return state;
}

export function saveCartographyOverlay(workspace: string, forge: WorldForge, expected: unknown,
    raw: unknown): CartographyAssetState {
    const current = loadCartographyAsset(workspace, forge);
    if (!current || expected !== current.revision) throw new Error('Map changed; reopen position adjustment');
    const state = { ...current, overlay: validateCartographyOverlay(raw, forge), revision: randomUUID() };
    commit(workspace, state);
    return state;
}
