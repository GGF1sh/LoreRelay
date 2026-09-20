import { createHash } from 'crypto';
import { inflateSync } from 'zlib';
import { ModDataError, normalizeModPackageFile, parseStrictJsonBytes, type ModPackageHashFile } from '../modHashCore';
import type { ModManifest } from '../modManifestCore';
import { compareUnicodeCodePointOrder, isValidLocalResourceId, modPathCollisionKey, toCanonicalModResourceId, validateModRelativePath } from '../modPathCore';

export interface ModAssetMetadata {
    kind: 'image' | 'background' | 'icon' | 'bgm' | 'sfx' | 'audio';
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'audio/mpeg' | 'audio/ogg' | 'audio/wav';
    alt?: string;
    byteHash: string;
    byteLength: number;
    width?: number;
    height?: number;
    /** Conservative upper bound, not a tag-provided duration. */
    durationSeconds?: number;
}

export interface ModCatalogAsset { id: string; path: string; value: ModAssetMetadata }

function invalid(): never { throw new ModDataError('MOD_ASSET_INVALID', 'Asset catalog or media violates the bounded static-media contract'); }
function check(condition: unknown): asserts condition { if (!condition) invalid(); }
const ascii = (b: Buffer, start: number, size: number): string => b.toString('ascii', start, start + size);
const reflectedCrc = Array.from({ length: 256 }, (_, n) => {
    for (let bit = 0; bit < 8; bit++) n = (n & 1) ? (n >>> 1) ^ 0xedb88320 : n >>> 1;
    return n >>> 0;
});
const oggCrc = Array.from({ length: 256 }, (_, n) => {
    n <<= 24;
    for (let bit = 0; bit < 8; bit++) n = (n & 0x80000000) ? (n << 1) ^ 0x04c11db7 : n << 1;
    return n >>> 0;
});

function dimensions(width: number, height: number): { width: number; height: number } {
    check(width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 40_000_000);
    return { width, height };
}

function png(b: Buffer): { width: number; height: number } {
    check(b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    let pos = 8, size: { width: number; height: number } | undefined, data = false, palette = false, color = -1;
    const seen = new Set<string>();
    const compressed: Buffer[] = [];
    let depth = 0, interlaced = false;
    while (pos < b.length) {
        check(pos + 12 <= b.length);
        const n = b.readUInt32BE(pos), end = pos + 12 + n, type = ascii(b, pos + 4, 4);
        check(end <= b.length);
        let crc = 0xffffffff;
        for (let i = pos + 4; i < end - 4; i++) crc = reflectedCrc[(crc ^ b[i]) & 255] ^ (crc >>> 8);
        check(((crc ^ 0xffffffff) >>> 0) === b.readUInt32BE(end - 4));
        // No text, EXIF/ICC, private, animation or unknown chunks. No trailing payload.
        check(['IHDR', 'PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'pHYs', 'IDAT', 'IEND'].includes(type));
        check(type === 'IDAT' || !seen.has(type));
        check(size || type === 'IHDR');
        if (type === 'IHDR') {
            check(pos === 8 && n === 13);
            size = dimensions(b.readUInt32BE(pos + 8), b.readUInt32BE(pos + 12));
            color = b[pos + 17];
            depth = b[pos + 16]; interlaced = b[pos + 20] === 1;
            const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
            check(depths[color]?.includes(b[pos + 16]) && b[pos + 18] === 0 && b[pos + 19] === 0 && b[pos + 20] <= 1);
        } else if (type === 'IDAT') {
            check(n > 0 && (color !== 3 || palette)); data = true;
            compressed.push(b.subarray(pos + 8, end - 4));
        } else if (type === 'IEND') {
            check(n === 0 && data && end === b.length);
            const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
            const rows: { bytes: number; count: number }[] = [];
            for (const [x, y, dx, dy] of interlaced ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]]) {
                const width = Math.max(0, Math.ceil((size!.width - x) / dx)), height = Math.max(0, Math.ceil((size!.height - y) / dy));
                if (width && height) rows.push({ bytes: 1 + Math.ceil(width * channels[color] * depth / 8), count: height });
            }
            const expected = rows.reduce((sum, row) => sum + row.bytes * row.count, 0), input = Buffer.concat(compressed);
            const inflated = inflateSync(input, { maxOutputLength: expected, info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
            check(inflated.buffer.length === expected && inflated.engine.bytesWritten === input.length);
            let offset = 0;
            for (const row of rows) for (let y = 0; y < row.count; y++) { check(inflated.buffer[offset] <= 4); offset += row.bytes; }
            return size!;
        } else {
            check(!data);
            if (type === 'PLTE') { check(n > 0 && n <= 768 && n % 3 === 0 && color !== 0 && color !== 4); palette = true; }
            if (type === 'tRNS') check((color === 0 && n === 2) || (color === 2 && n === 6) || (color === 3 && palette && n > 0 && n <= 256));
            if (type === 'gAMA') check(n === 4 && b.readUInt32BE(pos + 8) > 0);
            if (type === 'cHRM') check(n === 32);
            if (type === 'sRGB') check(n === 1 && b[pos + 8] <= 3);
            if (type === 'pHYs') check(n === 9 && b[pos + 16] <= 1);
        }
        seen.add(type); pos = end;
    }
    return invalid();
}

function jpeg(b: Buffer): { width: number; height: number } {
    check(b.length >= 4 && b.readUInt16BE(0) === 0xffd8);
    let pos = 2, size: { width: number; height: number } | undefined, scan = false;
    while (pos < b.length) {
        check(b[pos++] === 255);
        while (pos < b.length && b[pos] === 255) pos++;
        const marker = b[pos++];
        if (marker === 0xd9) { check(size && scan && pos === b.length); return size; }
        check([0xc0, 0xc2, 0xc4, 0xdb, 0xdd, 0xda, 0xe0].includes(marker));
        check(pos + 2 <= b.length);
        const n = b.readUInt16BE(pos), end = pos + n; check(n >= 2 && end <= b.length);
        if (marker === 0xe0) {
            // Metadata-bearing APP/COM segments are deliberately unsupported.
            check(!scan && n === 16 && ascii(b, pos + 2, 5) === 'JFIF\0' && b[pos + 14] === 0 && b[pos + 15] === 0);
        }
        if (marker === 0xc0 || marker === 0xc2) {
            check(!size && !scan && n >= 11 && b[pos + 2] === 8 && [1, 3].includes(b[pos + 7]) && n === 8 + 3 * b[pos + 7]);
            size = dimensions(b.readUInt16BE(pos + 5), b.readUInt16BE(pos + 3));
        }
        if (marker === 0xdd) check(n === 4);
        if (marker === 0xda) {
            check(size && n >= 8 && b[pos + 2] >= 1 && b[pos + 2] <= 3 && n === 6 + 2 * b[pos + 2]);
            scan = true; pos = end;
            while (pos < b.length) {
                if (b[pos] !== 255) { pos++; continue; }
                check(pos + 1 < b.length);
                if (b[pos + 1] === 0 || (b[pos + 1] >= 0xd0 && b[pos + 1] <= 0xd7)) { pos += 2; continue; }
                break;
            }
        } else pos = end;
    }
    return invalid();
}

function riffChunks(b: Buffer, form: string): { type: string; bytes: Buffer }[] {
    check(b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && b.readUInt32LE(4) === b.length - 8 && ascii(b, 8, 4) === form);
    const chunks: { type: string; bytes: Buffer }[] = [];
    let pos = 12;
    while (pos < b.length) {
        check(pos + 8 <= b.length && chunks.length < 16);
        const n = b.readUInt32LE(pos + 4), end = pos + 8 + n;
        check(end + (n & 1) <= b.length && (!(n & 1) || b[end] === 0));
        chunks.push({ type: ascii(b, pos, 4), bytes: b.subarray(pos + 8, end) }); pos = end + (n & 1);
    }
    return chunks;
}

function webp(b: Buffer): { width: number; height: number } {
    const chunks = riffChunks(b, 'WEBP');
    check(chunks.length > 0);
    let canvas: { width: number; height: number } | undefined, alpha = false;
    if (chunks[0].type === 'VP8X') {
        const x = chunks.shift()!.bytes;
        check(x.length === 10 && (x[0] & ~0x10) === 0 && x.subarray(1, 4).every(n => n === 0));
        alpha = !!(x[0] & 0x10); canvas = dimensions(x.readUIntLE(4, 3) + 1, x.readUIntLE(7, 3) + 1);
    }
    if (chunks[0]?.type === 'ALPH') {
        const a = chunks.shift()!.bytes;
        check(canvas && alpha && a.length > 1 && (a[0] & 0xc0) === 0 && (a[0] & 3) <= 1 && ((a[0] >> 4) & 3) <= 1 && String(chunks[0]?.type) === 'VP8 ');
    }
    check(chunks.length === 1);
    const { type, bytes: data } = chunks[0]; let size;
    if (type === 'VP8 ') {
        check(data.length >= 10 && (data[0] & 1) === 0 && (data[0] & 0x10) !== 0 && data.subarray(3, 6).equals(Buffer.from([0x9d, 1, 0x2a])));
        check((data.readUIntLE(0, 3) >>> 5) <= data.length - 10);
        size = dimensions(data.readUInt16LE(6) & 0x3fff, data.readUInt16LE(8) & 0x3fff);
    } else {
        check(type === 'VP8L' && data.length > 5 && data[0] === 0x2f && (data[4] & 0xe0) === 0);
        const bits = data.readUInt32LE(1); size = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (canvas) check(size.width === canvas.width && size.height === canvas.height);
    return size;
}

function wav(b: Buffer): number {
    const chunks = riffChunks(b, 'WAVE');
    check(chunks.length === 2 && chunks[0].type === 'fmt ' && chunks[1].type === 'data');
    const f = chunks[0].bytes, data = chunks[1].bytes;
    check(f.length === 16 && f.readUInt16LE(0) === 1);
    const channels = f.readUInt16LE(2), rate = f.readUInt32LE(4), align = f.readUInt16LE(12), bits = f.readUInt16LE(14);
    check([1, 2].includes(channels) && rate >= 8000 && rate <= 192000 && [8, 16, 24, 32].includes(bits));
    check(align === channels * bits / 8 && f.readUInt32LE(8) === rate * align && data.length > 0 && data.length % align === 0);
    return data.length / align / rate;
}

function mp3(b: Buffer): number {
    // Frame-count duration: never trust ID3, Xing or VBRI duration metadata.
    let pos = 0, duration = 0, stream = -1, frames = 0;
    while (pos < b.length) {
        check(pos + 4 <= b.length);
        const h = b.readUInt32BE(pos), version = (h >>> 19) & 3, bitrate = (h >>> 12) & 15, rateIndex = (h >>> 10) & 3;
        check((h >>> 21) === 0x7ff && version !== 1 && ((h >>> 17) & 3) === 1 && bitrate > 0 && bitrate < 15 && rateIndex < 3 && (h & 3) !== 2);
        const identity = (version << 4) | rateIndex;
        if (stream === -1) stream = identity; else check(stream === identity);
        const rate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
        const kbps = (version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrate];
        const n = Math.floor((version === 3 ? 144000 : 72000) * kbps / rate) + ((h >>> 9) & 1);
        check(n >= 24 && pos + n <= b.length && ++frames <= 200000);
        duration += (version === 3 ? 1152 : 576) / rate; pos += n;
    }
    check(frames >= 2); return duration;
}

function ogg(b: Buffer): number {
    let pos = 0, serial = -1, sequence = 0, lastGranule = 0n, ended = false, partial: Buffer[] = [], partialBytes = 0;
    const packets: Buffer[] = [];
    while (pos < b.length) {
        check(!ended && pos + 27 <= b.length && ascii(b, pos, 4) === 'OggS' && b[pos + 4] === 0 && sequence < 32768);
        const flags = b[pos + 5], n = b[pos + 26], headerEnd = pos + 27 + n;
        check(flags <= 7 && !!(flags & 1) === (partialBytes > 0) && !!(flags & 2) === (sequence === 0) && n > 0 && headerEnd <= b.length);
        const id = b.readUInt32LE(pos + 14); if (serial === -1) serial = id; else check(serial === id);
        check(b.readUInt32LE(pos + 18) === sequence++);
        let end = headerEnd; for (let i = pos + 27; i < headerEnd; i++) end += b[i]; check(end <= b.length);
        let crc = 0; for (let i = pos; i < end; i++) crc = (crc << 8) ^ oggCrc[((crc >>> 24) ^ (i >= pos + 22 && i < pos + 26 ? 0 : b[i])) & 255];
        check((crc >>> 0) === b.readUInt32LE(pos + 22));
        const granule = b.readBigInt64LE(pos + 6); check(granule === -1n || granule >= lastGranule);
        if (granule >= 0n) lastGranule = granule;
        let cursor = headerEnd;
        for (let i = pos + 27; i < headerEnd; i++) {
            const length = b[i]; partial.push(b.subarray(cursor, cursor + length)); cursor += length; partialBytes += length;
            check(partialBytes <= 1024 * 1024);
            if (length < 255) { check(partialBytes > 0 && packets.length < 65536); packets.push(Buffer.concat(partial, partialBytes)); partial = []; partialBytes = 0; }
        }
        ended = !!(flags & 4); if (ended) check(partialBytes === 0 && granule >= 0n); pos = end;
    }
    check(ended && partialBytes === 0 && packets.length >= 4);
    // Single-stream Vorbis only. Chained/multiplexed streams, Opus and comments are not guessed compatible.
    const h = packets[0]; check(h.length === 30 && h[0] === 1 && ascii(h, 1, 6) === 'vorbis' && h.readUInt32LE(7) === 0 && [1, 2].includes(h[11]) && h[29] === 1);
    const rate = h.readUInt32LE(12), small = h[28] & 15, large = h[28] >>> 4;
    check(rate >= 8000 && rate <= 192000 && small >= 6 && large >= small && large <= 13);
    const comments = packets[1]; check(comments.length >= 16 && comments[0] === 3 && ascii(comments, 1, 6) === 'vorbis');
    const vendor = comments.readUInt32LE(7); check(vendor <= 256 && comments.length === 16 + vendor && comments.readUInt32LE(11 + vendor) === 0 && comments[15 + vendor] === 1);
    check(packets[2][0] === 5 && ascii(packets[2], 1, 6) === 'vorbis');
    for (const packet of packets.slice(3)) check((packet[0] & 1) === 0);
    // Maximum block contribution per audio packet is conservative even with forged granules/modes.
    const upper = (packets.length - 3) * (2 ** large) / 2 / rate;
    check(Number(lastGranule) / rate <= upper);
    return upper;
}

/** Static, bounded container/header validation; deliberately rejects optional metadata and unknown codecs. */
export function validateModAssetBytes(kind: ModAssetMetadata['kind'], mediaType: ModAssetMetadata['mediaType'], relativePath: string, bytes: Uint8Array): ModAssetMetadata {
    const formats: Record<string, readonly string[]> = { 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'], 'audio/mpeg': ['mp3'], 'audio/ogg': ['ogg'], 'audio/wav': ['wav'] };
    const raster = ['image', 'background', 'icon'].includes(kind);
    check((raster || ['bgm', 'sfx', 'audio'].includes(kind)) && mediaType.startsWith(raster ? 'image/' : 'audio/'));
    check(formats[mediaType]?.includes(relativePath.split('.').pop()!.toLowerCase()) && bytes.length > 0 && bytes.length <= (raster ? 10 : 25) * 1024 * 1024);
    const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    try {
        let metadata: Partial<ModAssetMetadata>;
        if (raster) metadata = mediaType === 'image/png' ? png(b) : mediaType === 'image/jpeg' ? jpeg(b) : webp(b);
        else {
            const seconds = mediaType === 'audio/wav' ? wav(b) : mediaType === 'audio/mpeg' ? mp3(b) : ogg(b);
            check(Number.isFinite(seconds) && seconds > 0 && seconds <= (kind === 'sfx' ? 60 : 1200));
            metadata = { durationSeconds: seconds };
        }
        return { kind, mediaType, byteHash: createHash('sha256').update(b).digest('hex'), byteLength: b.length, ...metadata };
    } catch { return invalid(); }
}

/** Trusted closure from the very buffers being hashed, never a second package read. */
export function parseModAssetCatalogs(manifest: ModManifest, files: readonly ModPackageHashFile[]): ModCatalogAsset[] {
    const assets: ModCatalogAsset[] = [], ids = new Set<string>(), paths = new Set<string>();
    for (const descriptor of [...(manifest.entrypoints.assets ?? [])].sort((a, b) => compareUnicodeCodePointOrder(a.path, b.path))) {
        const file = files.find(item => item.path === descriptor.path);
        check(file?.kind === 'json' && file.bytes.length <= 256 * 1024);
        const doc = parseStrictJsonBytes(normalizeModPackageFile(file)) as Record<string, unknown>;
        check(doc && typeof doc === 'object' && !Array.isArray(doc) && Object.keys(doc).every(k => ['format', 'assets'].includes(k)) && doc.format === 'lorerelay-assets/1' && Array.isArray(doc.assets));
        for (const raw of doc.assets) {
            check(raw && typeof raw === 'object' && !Array.isArray(raw));
            const a = raw as Record<string, unknown>;
            check(Object.keys(a).every(k => ['id', 'kind', 'path', 'mediaType', 'alt'].includes(k)) && isValidLocalResourceId(a.id));
            const validation = validateModRelativePath(a.path); check(validation.ok && validation.normalized);
            const key = modPathCollisionKey(validation.normalized); check(!ids.has(a.id) && !paths.has(key) && assets.length < 256); ids.add(a.id); paths.add(key);
            check(typeof a.kind === 'string' && typeof a.mediaType === 'string');
            check(a.alt === undefined || (typeof a.alt === 'string' && a.alt.trim() === a.alt && a.alt.length > 0 && Buffer.byteLength(a.alt) <= 4096 && !/[\u0000-\u001f\u007f<>]/.test(a.alt)));
            const payload = files.find(item => item.path === validation.normalized); check(payload?.kind === 'binary');
            const value = validateModAssetBytes(a.kind as ModAssetMetadata['kind'], a.mediaType as ModAssetMetadata['mediaType'], validation.normalized, payload.bytes);
            assets.push({ id: toCanonicalModResourceId(manifest.id, a.id), path: validation.normalized, value: { ...value, ...(typeof a.alt === 'string' ? { alt: a.alt } : {}) } });
        }
    }
    return assets.sort((a, b) => compareUnicodeCodePointOrder(a.id, b.id));
}
