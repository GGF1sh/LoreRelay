// NOAI-GAMEPLAY-SPINE-003: pure query/preview vocabulary and canonical token helpers.

import * as crypto from 'crypto';
import type { ActionAdmissionStatus, ActionKey } from './gameplaySpineCore';

export type GameplaySpinePreviewVisibility = 'public' | 'internal' | 'hidden';

export interface GameplaySpineClockSpan {
    clock: 'world' | 'gm' | 'domainMonth' | 'guildDrift' | 'simTick';
    amount: number;
}

export interface GameplaySpineQueryAdmission {
    status: ActionAdmissionStatus;
    reasonCode?: string;
}

export interface GameplaySpineUnavailableReason {
    kind: 'rejected' | 'configuration_failure' | 'invalid_query';
    reasonCode: string;
}

export interface GameplaySpineConfirmationBinding {
    policy: 'explicit';
    /**
     * Deterministic content token. It is not a signature, authentication proof,
     * durable request identity, or commit receipt.
     */
    token: string;
}

export interface GameplaySpineShadowQuery<TPreview, TInternal> {
    requestId: string;
    actionKey: ActionKey;
    actionVersion: number;
    previewVersion: number;
    admission: GameplaySpineQueryAdmission;
    mechanicalPreview?: TPreview;
    confirmation?: GameplaySpineConfirmationBinding;
    unavailable?: GameplaySpineUnavailableReason;
    /** Host-side evidence. A public projector must remove this field. */
    internal?: TInternal;
}

export type GameplaySpinePublicShadowQuery<TPreview> = Omit<
    GameplaySpineShadowQuery<TPreview, never>,
    'internal'
>;

export type CanonicalJsonValue =
    | null
    | boolean
    | number
    | string
    | CanonicalJsonValue[]
    | { [key: string]: CanonicalJsonValue };

function canonicalize(value: CanonicalJsonValue): string {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? JSON.stringify(value) : 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalize).join(',')}]`;
    }
    const entries = Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
    return `{${entries.join(',')}}`;
}

/** Stable JSON text for already-bounded canonical data. Object keys are sorted. */
export function stableCanonicalStringify(value: CanonicalJsonValue): string {
    return canonicalize(value);
}

/** SHA-256 digest for bounded canonical evidence, never a whole-file hash. */
export function digestCanonicalValue(value: CanonicalJsonValue): string {
    return crypto.createHash('sha256').update(stableCanonicalStringify(value), 'utf8').digest('hex');
}

/**
 * Build a bounded Webview-safe equality token from canonical evidence.
 * This has no secret and intentionally makes no authenticity claim.
 */
export function buildOpaqueConfirmationToken(
    domain: string,
    value: CanonicalJsonValue
): string {
    const safeDomain = /^[a-z0-9_]{1,24}$/.test(domain) ? domain : 'preview';
    const digest = crypto
        .createHash('sha256')
        .update(`${safeDomain}\0${stableCanonicalStringify(value)}`, 'utf8')
        .digest('base64url');
    return `${safeDomain}.${digest}`;
}
