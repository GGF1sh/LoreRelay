/**
 * Lightweight PNG Chunk Parser & Injector for SillyTavern V2/V3 compatibility.
 * Allows embedding JSON metadata into the tEXt chunk of a PNG file.
 */

// CRC32 table initialization
const crcTable: number[] = [];
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        if (c & 1) {
            c = 0xedb88320 ^ (c >>> 1);
        } else {
            c = c >>> 1;
        }
    }
    crcTable[i] = c;
}

function crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) {
        crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Injects a tEXt chunk into a PNG buffer.
 * @param pngBuffer Original PNG buffer
 * @param keyword The keyword for the tEXt chunk (e.g., 'chara')
 * @param text The text data to embed (e.g., base64 string)
 * @returns A new PNG buffer with the embedded chunk
 */
export function injectPngMetadata(pngBuffer: Buffer, keyword: string, text: string): Buffer {
    // Check PNG signature
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (pngBuffer.length < 8 || !pngBuffer.subarray(0, 8).equals(signature)) {
        throw new Error('Invalid PNG file format.');
    }

    // Prepare tEXt chunk
    const keywordBuffer = Buffer.from(keyword, 'latin1');
    const separator = Buffer.from([0]);
    const textBuffer = Buffer.from(text, 'latin1');
    
    const chunkData = Buffer.concat([keywordBuffer, separator, textBuffer]);
    
    const chunkType = Buffer.from('tEXt', 'latin1');
    const chunkLength = Buffer.alloc(4);
    chunkLength.writeUInt32BE(chunkData.length, 0);
    
    const crcInput = Buffer.concat([chunkType, chunkData]);
    const chunkCrc = Buffer.alloc(4);
    chunkCrc.writeUInt32BE(crc32(crcInput), 0);
    
    const newChunk = Buffer.concat([chunkLength, crcInput, chunkCrc]);

    // Find the end of the IHDR chunk (always the first chunk, normally ends at offset 33)
    // 8 (signature) + 4 (length) + 4 (type 'IHDR') + 13 (data) + 4 (crc) = 33
    // We insert our new chunk right after IHDR.
    
    let offset = 8;
    // Just to be safe, find IHDR dynamically
    const firstChunkLength = pngBuffer.readUInt32BE(offset);
    const firstChunkType = pngBuffer.subarray(offset + 4, offset + 8).toString('latin1');
    
    if (firstChunkType !== 'IHDR' || firstChunkLength !== 13) {
        throw new Error('Invalid PNG: First chunk is not IHDR.');
    }
    
    const ihdrEnd = offset + 8 + firstChunkLength + 4;
    if (ihdrEnd > pngBuffer.length) {
        throw new Error('Invalid PNG: IHDR chunk is truncated.');
    }
    
    const before = pngBuffer.subarray(0, ihdrEnd);
    const after = pngBuffer.subarray(ihdrEnd);
    
    return Buffer.concat([before, newChunk, after]);
}
