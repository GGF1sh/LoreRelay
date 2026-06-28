import { createHmac, timingSafeEqual } from 'crypto';

/** Default signed media URL lifetime (seconds). */
export const DEFAULT_MEDIA_URL_TTL_SEC = 300;
export const MIN_MEDIA_URL_TTL_SEC = 60;
export const MAX_MEDIA_URL_TTL_SEC = 3600;

export type MediaSignatureFailure = 'missing' | 'expired' | 'invalid';

export function clampMediaUrlTtlSec(value: unknown): number {
    const n = typeof value === 'number' && Number.isFinite(value)
        ? Math.floor(value)
        : DEFAULT_MEDIA_URL_TTL_SEC;
    return Math.max(MIN_MEDIA_URL_TTL_SEC, Math.min(MAX_MEDIA_URL_TTL_SEC, n));
}

export function buildMediaSignPayload(file: string, exp: number): string {
    return `${exp}:${file}`;
}

export function computeMediaSignature(secret: string, file: string, exp: number): string {
    return createHmac('sha256', secret)
        .update(buildMediaSignPayload(file, exp))
        .digest('hex');
}

export function signaturesMatch(provided: unknown, expected: string): boolean {
    if (typeof provided !== 'string' || provided.length !== expected.length) {
        return false;
    }
    try {
        return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
        return false;
    }
}

export function verifyMediaSignature(
    file: string,
    exp: number,
    sig: string,
    secret: string,
    nowSec?: number
): { ok: true } | { ok: false; reason: MediaSignatureFailure } {
    if (!file || !sig || !Number.isFinite(exp) || exp <= 0) {
        return { ok: false, reason: 'missing' };
    }
    const now = nowSec ?? Math.floor(Date.now() / 1000);
    if (exp < now) {
        return { ok: false, reason: 'expired' };
    }
    const expected = computeMediaSignature(secret, file, exp);
    if (!signaturesMatch(sig, expected)) {
        return { ok: false, reason: 'invalid' };
    }
    return { ok: true };
}

export function buildSignedMediaQuery(
    file: string,
    secret: string,
    ttlSec: number,
    nowSec?: number
): string {
    const now = nowSec ?? Math.floor(Date.now() / 1000);
    const ttl = clampMediaUrlTtlSec(ttlSec);
    const exp = now + ttl;
    const sig = computeMediaSignature(secret, file, exp);
    return `file=${encodeURIComponent(file)}&exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

export function buildSignedMediaPath(
    file: string,
    secret: string,
    ttlSec: number,
    nowSec?: number
): string {
    return `/media?${buildSignedMediaQuery(file, secret, ttlSec, nowSec)}`;
}