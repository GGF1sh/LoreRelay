import { inflateRawSync } from 'zlib';
import { decodeStrictUtf8, ModDataError } from './modHashCore';
import { modPathCollisionKey, validateModRelativePath } from './modPathCore';

/** Random access supplied by the host; preflight never reads payloads. */
export interface ModZipReader {
    size: number;
    read(offset: number, length: number): Promise<Uint8Array>;
}

interface ZipEntry {
    path: string;
    directory: boolean;
    method: number;
    crc: number;
    compressed: number;
    expanded: number;
    dataOffset: number;
}

const MAX_ZIP_BYTES = 128 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let n = index;
    for (let bit = 0; bit < 8; bit++) n = (n & 1) ? (n >>> 1) ^ 0xedb88320 : n >>> 1;
    return n >>> 0;
});
function reject(code = 'MOD_ZIP_INVALID'): never { throw new ModDataError(code, 'ZIP does not satisfy the bounded MOD import contract'); }
function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
}
async function read(reader: ModZipReader, offset: number, length: number): Promise<Buffer> {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > reader.size) return reject();
    const bytes = Buffer.from(await reader.read(offset, length));
    if (bytes.length !== length) return reject('MOD_ZIP_TRUNCATED');
    return bytes;
}
function extras(bytes: Buffer): void {
    // Ignore only bounded timestamp/uid metadata. Never honor alternate paths,
    // ZIP64 sizes, UNIX link metadata, encryption or unknown extension semantics.
    const seen = new Set<number>();
    for (let at = 0; at < bytes.length;) {
        if (at + 4 > bytes.length) return reject();
        const id = bytes.readUInt16LE(at), size = bytes.readUInt16LE(at + 2);
        if (![0x5455, 0x7875, 0x000a].includes(id) || seen.has(id) || size > 64 || at + 4 + size > bytes.length) return reject('MOD_ZIP_EXTRA_UNSUPPORTED');
        seen.add(id); at += 4 + size;
    }
}
function fileLimit(name: string): number {
    if (name === 'lorerelay.mod.json') return 64 * 1024;
    if (/\.(json|md|txt)$/i.test(name) || name.split('/').pop() === 'LICENSE') return 4 * 1024 * 1024;
    if (/\.(png|jpe?g|webp|mp3|ogg|wav)$/i.test(name)) return 25 * 1024 * 1024;
    return reject('MOD_ZIP_FILE_TYPE_FORBIDDEN');
}

/** ZIP32 stored/deflate only. Validate the entire directory/local-header graph before extracting anything. */
export async function parseModZipArchive(reader: ModZipReader): Promise<readonly ZipEntry[]> {
    if (!Number.isSafeInteger(reader.size) || reader.size < 22 || reader.size > MAX_ZIP_BYTES) return reject('MOD_ZIP_SIZE_LIMIT');
    // V1 excludes archive comments. No backward payload scan or ambiguous EOCD.
    const end = reader.size - 22, eocd = await read(reader, end, 22);
    if (eocd.readUInt32LE() !== 0x06054b50 || eocd.readUInt16LE(20) !== 0) return reject('MOD_ZIP_COMMENT_OR_TRAILER_UNSUPPORTED');
    const count = eocd.readUInt16LE(10), directorySize = eocd.readUInt32LE(12), directoryOffset = eocd.readUInt32LE(16);
    if (eocd.readUInt16LE(4) !== 0 || eocd.readUInt16LE(6) !== 0 || eocd.readUInt16LE(8) !== count
        || count < 1 || count > 2304 || directorySize > 2 * 1024 * 1024 || directoryOffset + directorySize !== end) return reject();
    const central = await read(reader, directoryOffset, directorySize);
    const paths = new Map<string, { path: string; directory: boolean; explicit: boolean }>();
    let directories = 1, files = 0, expandedTotal = 0, compressedTotal = 0, cursor = 0;
    const records: Array<ZipEntry & { offset: number; flags: number; name: Buffer; version: number }> = [];
    const reservePath = (name: string, directory: boolean, explicit: boolean): void => {
        if (!validateModRelativePath(name).ok) return reject('MOD_ZIP_PATH_INVALID');
        const key = modPathCollisionKey(name), previous = paths.get(key);
        if (previous) {
            if (previous.path !== name || !previous.directory || !directory || (explicit && previous.explicit)) return reject('MOD_ZIP_PATH_COLLISION');
            previous.explicit ||= explicit;
        } else {
            paths.set(key, { path: name, directory, explicit });
            if (directory ? ++directories > 256 : ++files > 2048) return reject('MOD_ZIP_ENTRY_LIMIT');
        }
    };
    for (let index = 0; index < count; index++) {
        if (cursor + 46 > central.length || central.readUInt32LE(cursor) !== 0x02014b50) return reject();
        const h = central.subarray(cursor, cursor + 46);
        const version = h.readUInt16LE(6), flags = h.readUInt16LE(8), method = h.readUInt16LE(10);
        const compressed = h.readUInt32LE(20), expanded = h.readUInt32LE(24);
        const nameSize = h.readUInt16LE(28), extraSize = h.readUInt16LE(30), commentSize = h.readUInt16LE(32);
        const attr = h.readUInt32LE(38), platform = h.readUInt16LE(4) >>> 8, mode = (attr >>> 16) & 0xf000;
        if (version > 20 || ![0, 8].includes(method) || (flags & ~0x080e) !== 0 || (method === 0 && (flags & 6))
            || h.readUInt16LE(34) !== 0 || ![0, 3, 10, 19].includes(platform) || (attr & 0xffc8) !== 0
            || nameSize < 1 || nameSize > 241 || extraSize > 256 || cursor + 46 + nameSize + extraSize + commentSize > central.length) return reject('MOD_ZIP_FEATURE_UNSUPPORTED');
        const name = central.subarray(cursor + 46, cursor + 46 + nameSize);
        if (!(flags & 0x800) && name.some(byte => byte > 127)) return reject('MOD_ZIP_FILENAME_ENCODING');
        const decoded = decodeStrictUtf8(name), directory = decoded.endsWith('/'), entryPath = directory ? decoded.slice(0, -1) : decoded;
        if (mode !== 0 && mode !== (directory ? 0x4000 : 0x8000)) return reject('MOD_ZIP_LINK_OR_SPECIAL');
        if (!directory && (attr & 0x10)) return reject('MOD_ZIP_LINK_OR_SPECIAL');
        reservePath(entryPath, directory, true);
        const segments = entryPath.split('/');
        for (let length = 1; length < segments.length; length++) reservePath(segments.slice(0, length).join('/'), true, false);
        if (directory ? (compressed !== 0 || expanded !== 0 || method !== 0 || (flags & 8))
            : (expanded > fileLimit(entryPath) || expanded > 100 * Math.max(compressed, 1))) return reject('MOD_ZIP_EXPANSION_LIMIT');
        if (method === 0 && compressed !== expanded) return reject();
        expandedTotal += expanded; compressedTotal += compressed;
        if (expandedTotal > MAX_EXPANDED_BYTES) return reject('MOD_ZIP_EXPANSION_LIMIT');
        extras(central.subarray(cursor + 46 + nameSize, cursor + 46 + nameSize + extraSize));
        records.push({ path: entryPath, directory, method, crc: h.readUInt32LE(16), compressed, expanded, flags, name, version, offset: h.readUInt32LE(42), dataOffset: 0 });
        cursor += 46 + nameSize + extraSize + commentSize;
    }
    if (cursor !== central.length || expandedTotal > 50 * Math.max(compressedTotal, 1)
        || !records.some(entry => entry.path === 'lorerelay.mod.json' && !entry.directory)) return reject('MOD_ZIP_PACKAGE_INVALID');
    let nextOffset = 0;
    for (const entry of [...records].sort((a, b) => a.offset - b.offset)) {
        if (entry.offset !== nextOffset || entry.offset + 30 > directoryOffset) return reject('MOD_ZIP_LAYOUT_INVALID');
        const h = await read(reader, entry.offset, 30), nameSize = h.readUInt16LE(26), extraSize = h.readUInt16LE(28);
        if (h.readUInt32LE() !== 0x04034b50 || h.readUInt16LE(4) !== entry.version || h.readUInt16LE(6) !== entry.flags
            || h.readUInt16LE(8) !== entry.method || nameSize !== entry.name.length || extraSize > 256) return reject('MOD_ZIP_HEADER_MISMATCH');
        entry.dataOffset = entry.offset + 30 + nameSize + extraSize;
        if (entry.dataOffset + entry.compressed > directoryOffset) return reject('MOD_ZIP_LAYOUT_INVALID');
        const extra = await read(reader, entry.offset + 30, nameSize + extraSize);
        if (!extra.subarray(0, nameSize).equals(entry.name)) return reject('MOD_ZIP_HEADER_MISMATCH');
        extras(extra.subarray(nameSize));
        for (const [offset, expected] of [[14, entry.crc], [18, entry.compressed], [22, entry.expanded]]) {
            const actual = h.readUInt32LE(offset);
            if (actual !== expected && (!(entry.flags & 8) || actual !== 0)) return reject('MOD_ZIP_HEADER_MISMATCH');
        }
        nextOffset = entry.dataOffset + entry.compressed;
        if (entry.flags & 8) {
            const signature = await read(reader, nextOffset, 4), hasSignature = signature.readUInt32LE() === 0x08074b50;
            const descriptor = await read(reader, nextOffset, hasSignature ? 16 : 12), at = hasSignature ? 4 : 0;
            if (descriptor.readUInt32LE(at) !== entry.crc || descriptor.readUInt32LE(at + 4) !== entry.compressed
                || descriptor.readUInt32LE(at + 8) !== entry.expanded) return reject('MOD_ZIP_DESCRIPTOR_MISMATCH');
            nextOffset += descriptor.length;
        }
        if (nextOffset > directoryOffset) return reject('MOD_ZIP_LAYOUT_INVALID');
    }
    if (nextOffset !== directoryOffset) return reject('MOD_ZIP_LAYOUT_INVALID');
    return records.map(({ path, directory, method, crc, compressed, expanded, dataOffset }) => ({ path, directory, method, crc, compressed, expanded, dataOffset }));
}

/** Extraction is bounded by the preflight reservation, then independently checks actual size, consumption and CRC. */
export async function readModZipEntry(reader: ModZipReader, entry: ZipEntry): Promise<Buffer> {
    const compressed = await read(reader, entry.dataOffset, entry.compressed);
    let bytes: Buffer;
    try {
        if (entry.method === 0) bytes = compressed;
        else {
            const inflated = inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.expanded), info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
            if (inflated.engine.bytesWritten !== compressed.length) return reject('MOD_ZIP_TRAILING_COMPRESSED_DATA');
            bytes = inflated.buffer;
        }
    } catch { return reject('MOD_ZIP_DECOMPRESSION_FAILED'); }
    if (bytes.length !== entry.expanded || crc32(bytes) !== entry.crc) return reject('MOD_ZIP_CONTENT_MISMATCH');
    return bytes;
}
