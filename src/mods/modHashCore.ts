import { createHash } from 'crypto';
import {
    compareUtf8ByteOrder,
    modPathCollisionKey,
    validateModRelativePath,
} from './modPathCore';

export const MOD_HASH_PREFIX = 'sha256:';
export const MOD_SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export type ModPackageFileKind = 'json' | 'text' | 'binary';

export interface ModPackageHashFile {
    path: string;
    kind: ModPackageFileKind;
    bytes: Uint8Array;
}

export interface NormalizedModPackageHash {
    contentHash: string;
    normalizedFiles: ReadonlyArray<{
        path: string;
        byteLength: number;
        hash: string;
    }>;
}

export class ModDataError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
        this.name = 'ModDataError';
    }
}

function hasUnpairedSurrogate(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(index + 1);
            if (!(next >= 0xdc00 && next <= 0xdfff)) {
                return true;
            }
            index += 1;
        } else if (code >= 0xdc00 && code <= 0xdfff) {
            return true;
        }
    }
    return false;
}

class StrictJsonParser {
    private index = 0;

    constructor(private readonly source: string) {}

    parse(): unknown {
        this.skipWhitespace();
        const value = this.parseValue();
        this.skipWhitespace();
        if (this.index !== this.source.length) {
            this.fail('JSON_TRAILING_DATA', 'Unexpected data after the JSON value');
        }
        return value;
    }

    private parseValue(): unknown {
        const character = this.source[this.index];
        if (character === '{') return this.parseObject();
        if (character === '[') return this.parseArray();
        if (character === '"') return this.parseString();
        if (character === 't') return this.parseLiteral('true', true);
        if (character === 'f') return this.parseLiteral('false', false);
        if (character === 'n') return this.parseLiteral('null', null);
        if (character === '-' || (character >= '0' && character <= '9')) return this.parseNumber();
        this.fail('JSON_INVALID_TOKEN', 'Expected a JSON value');
    }

    private parseObject(): Record<string, unknown> {
        this.index += 1;
        this.skipWhitespace();
        const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
        const exactKeys = new Set<string>();
        const normalizedKeys = new Set<string>();
        if (this.source[this.index] === '}') {
            this.index += 1;
            return result;
        }
        while (this.index < this.source.length) {
            if (this.source[this.index] !== '"') {
                this.fail('JSON_OBJECT_KEY_REQUIRED', 'Expected a quoted JSON object key');
            }
            const key = this.parseString();
            const normalizedKey = key.normalize('NFC');
            if (exactKeys.has(key)) {
                this.fail('JSON_DUPLICATE_KEY', `Duplicate JSON key: ${key}`);
            }
            if (normalizedKeys.has(normalizedKey)) {
                this.fail('JSON_NORMALIZED_KEY_COLLISION', `JSON keys collide after NFC normalization: ${key}`);
            }
            exactKeys.add(key);
            normalizedKeys.add(normalizedKey);
            this.skipWhitespace();
            if (this.source[this.index] !== ':') {
                this.fail('JSON_COLON_REQUIRED', 'Expected a colon after a JSON object key');
            }
            this.index += 1;
            this.skipWhitespace();
            result[normalizedKey] = this.parseValue();
            this.skipWhitespace();
            const delimiter = this.source[this.index];
            if (delimiter === '}') {
                this.index += 1;
                return result;
            }
            if (delimiter !== ',') {
                this.fail('JSON_OBJECT_DELIMITER_REQUIRED', 'Expected a comma or closing brace');
            }
            this.index += 1;
            this.skipWhitespace();
        }
        this.fail('JSON_UNTERMINATED_OBJECT', 'Unterminated JSON object');
    }

    private parseArray(): unknown[] {
        this.index += 1;
        this.skipWhitespace();
        const result: unknown[] = [];
        if (this.source[this.index] === ']') {
            this.index += 1;
            return result;
        }
        while (this.index < this.source.length) {
            result.push(this.parseValue());
            this.skipWhitespace();
            const delimiter = this.source[this.index];
            if (delimiter === ']') {
                this.index += 1;
                return result;
            }
            if (delimiter !== ',') {
                this.fail('JSON_ARRAY_DELIMITER_REQUIRED', 'Expected a comma or closing bracket');
            }
            this.index += 1;
            this.skipWhitespace();
        }
        this.fail('JSON_UNTERMINATED_ARRAY', 'Unterminated JSON array');
    }

    private parseString(): string {
        const start = this.index;
        this.index += 1;
        let escaped = false;
        while (this.index < this.source.length) {
            const code = this.source.charCodeAt(this.index);
            if (!escaped && code === 0x22) {
                this.index += 1;
                let value: string;
                try {
                    value = JSON.parse(this.source.slice(start, this.index)) as string;
                } catch {
                    this.fail('JSON_INVALID_STRING', 'Invalid JSON string escape');
                }
                if (hasUnpairedSurrogate(value!)) {
                    this.fail('JSON_INVALID_UNICODE', 'JSON strings must contain Unicode scalar values');
                }
                return value!;
            }
            if (!escaped && code < 0x20) {
                this.fail('JSON_CONTROL_IN_STRING', 'Unescaped control character in JSON string');
            }
            if (!escaped && code === 0x5c) {
                escaped = true;
            } else {
                escaped = false;
            }
            this.index += 1;
        }
        this.fail('JSON_UNTERMINATED_STRING', 'Unterminated JSON string');
    }

    private parseNumber(): number {
        const remaining = this.source.slice(this.index);
        const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(remaining);
        if (!match) {
            this.fail('JSON_INVALID_NUMBER', 'Invalid JSON number');
        }
        const raw = match![0];
        const following = remaining[raw.length];
        if (following !== undefined && !/[\s,}\]]/.test(following)) {
            this.fail('JSON_INVALID_NUMBER', 'Invalid character after JSON number');
        }
        this.index += raw.length;
        const value = Number(raw);
        if (!Number.isFinite(value)) {
            this.fail('JSON_NON_FINITE_NUMBER', 'JSON number is outside the finite IEEE-754 range');
        }
        return value;
    }

    private parseLiteral<T>(token: string, value: T): T {
        if (this.source.slice(this.index, this.index + token.length) !== token) {
            this.fail('JSON_INVALID_LITERAL', `Invalid JSON literal near ${this.source.slice(this.index, this.index + 8)}`);
        }
        this.index += token.length;
        return value;
    }

    private skipWhitespace(): void {
        while (this.index < this.source.length && /[\u0009\u000a\u000d\u0020]/.test(this.source[this.index])) {
            this.index += 1;
        }
    }

    private fail(code: string, message: string): never {
        throw new ModDataError(code, `${message} at character ${this.index}`);
    }
}

export function isModSha256(value: unknown): value is string {
    return typeof value === 'string' && MOD_SHA256_PATTERN.test(value);
}

export function decodeStrictUtf8(bytes: Uint8Array): string {
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        throw new ModDataError('UTF8_BOM_FORBIDDEN', 'UTF-8 BOM is forbidden');
    }
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (hasUnpairedSurrogate(text)) {
            throw new ModDataError('UTF8_INVALID_UNICODE', 'Text must contain Unicode scalar values');
        }
        return text;
    } catch (error) {
        if (error instanceof ModDataError) throw error;
        throw new ModDataError('UTF8_INVALID', 'Input is not strict UTF-8');
    }
}

export function parseStrictJson(text: string): unknown {
    if (text.charCodeAt(0) === 0xfeff) {
        throw new ModDataError('UTF8_BOM_FORBIDDEN', 'UTF-8 BOM is forbidden');
    }
    return new StrictJsonParser(text).parse();
}

export function parseStrictJsonBytes(bytes: Uint8Array): unknown {
    return parseStrictJson(decodeStrictUtf8(bytes));
}

function canonicalizeJsonValue(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new ModDataError('JSON_NON_FINITE_NUMBER', 'Canonical JSON cannot contain a non-finite number');
        }
        return JSON.stringify(value);
    }
    if (typeof value === 'string') {
        if (hasUnpairedSurrogate(value)) {
            throw new ModDataError('JSON_INVALID_UNICODE', 'Canonical JSON strings must contain Unicode scalar values');
        }
        return JSON.stringify(value.normalize('NFC'));
    }
    if (Array.isArray(value)) {
        return `[${value.map(item => canonicalizeJsonValue(item)).join(',')}]`;
    }
    if (typeof value !== 'object' || value === undefined) {
        throw new ModDataError('JSON_UNSUPPORTED_VALUE', 'Canonical JSON accepts only JSON values');
    }
    const record = value as Record<string, unknown>;
    const normalizedEntries = new Map<string, unknown>();
    for (const key of Object.keys(record)) {
        const normalizedKey = key.normalize('NFC');
        if (normalizedEntries.has(normalizedKey)) {
            throw new ModDataError('JSON_NORMALIZED_KEY_COLLISION', `JSON keys collide after NFC normalization: ${key}`);
        }
        normalizedEntries.set(normalizedKey, record[key]);
    }
    const keys = [...normalizedEntries.keys()].sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalizeJsonValue(normalizedEntries.get(key))}`).join(',')}}`;
}

/** RFC 8785-compatible canonical JSON for the I-JSON subset accepted above. */
export function canonicalizeModJson(value: unknown): string {
    return canonicalizeJsonValue(value);
}

export function normalizeModText(bytes: Uint8Array): Uint8Array {
    const text = decodeStrictUtf8(bytes);
    const lf = text.replace(/\r\n?/g, '\n').normalize('NFC');
    for (let index = 0; index < lf.length; index += 1) {
        const code = lf.charCodeAt(index);
        if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f) {
            throw new ModDataError('TEXT_CONTROL_CHARACTER', `Disallowed control character at index ${index}`);
        }
    }
    return Buffer.from(lf, 'utf8');
}

export function sha256ModBytes(bytes: Uint8Array): string {
    return `${MOD_HASH_PREFIX}${createHash('sha256').update(bytes).digest('hex')}`;
}

export function hashCanonicalModJson(value: unknown): string {
    return sha256ModBytes(Buffer.from(canonicalizeModJson(value), 'utf8'));
}

export function normalizeModPackageFile(file: ModPackageHashFile): Buffer {
    if (file.kind === 'binary') {
        return Buffer.from(file.bytes);
    }
    if (file.kind === 'text') {
        return Buffer.from(normalizeModText(file.bytes));
    }
    const value = parseStrictJsonBytes(file.bytes);
    return Buffer.from(canonicalizeModJson(value), 'utf8');
}

export function hashNormalizedModPackage(files: readonly ModPackageHashFile[]): NormalizedModPackageHash {
    if (files.length === 0) {
        throw new ModDataError('PACKAGE_EMPTY', 'A MOD package must contain files');
    }
    const collisionKeys = new Set<string>();
    const normalized = files.map(file => {
        const pathValidation = validateModRelativePath(file.path);
        if (!pathValidation.ok || !pathValidation.normalized) {
            throw new ModDataError('PACKAGE_PATH_INVALID', `${file.path}: ${pathValidation.code ?? 'UNKNOWN'}`);
        }
        const collisionKey = modPathCollisionKey(pathValidation.normalized);
        if (collisionKeys.has(collisionKey)) {
            throw new ModDataError('PACKAGE_PATH_COLLISION', `Duplicate normalized package path: ${file.path}`);
        }
        collisionKeys.add(collisionKey);
        const content = normalizeModPackageFile(file);
        return { path: pathValidation.normalized, content };
    }).sort((left, right) => compareUtf8ByteOrder(left.path, right.path));

    const hash = createHash('sha256');
    const normalizedFiles: Array<{ path: string; byteLength: number; hash: string }> = [];
    for (const file of normalized) {
        const pathBytes = Buffer.from(file.path, 'utf8');
        const pathLength = Buffer.alloc(4);
        pathLength.writeUInt32BE(pathBytes.length);
        const contentLength = Buffer.alloc(8);
        contentLength.writeBigUInt64BE(BigInt(file.content.length));
        hash.update(pathLength);
        hash.update(pathBytes);
        hash.update(contentLength);
        hash.update(file.content);
        normalizedFiles.push({
            path: file.path,
            byteLength: file.content.length,
            hash: sha256ModBytes(file.content),
        });
    }
    return {
        contentHash: `${MOD_HASH_PREFIX}${hash.digest('hex')}`,
        normalizedFiles,
    };
}
