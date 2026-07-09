import * as crypto from 'crypto';
import * as path from 'path';
import type { TurnResult } from './types/TurnResult';

export const ANTIGRAVITY_RELAY_REQUEST_SCHEMA_VERSION = 1;
export const ANTIGRAVITY_RELAY_REQUEST_DIR = '.text-adventure';
export const ANTIGRAVITY_RELAY_REQUEST_FILE = 'antigravity_relay_request.json';
export const ANTIGRAVITY_RELAY_EXPECTED_OUTPUT = 'turn_result.json';

export interface AntigravityRelayRequestIdInput {
    workspacePath: string;
    playerAction: string;
    createdAt: string;
    turnIndex: number;
}

export interface AntigravityRelayRequest {
    schemaVersion: 1;
    kind: 'antigravity_relay_request';
    requestId: string;
    createdAt: string;
    playerAction: string;
    minimalContext: Record<string, unknown>;
    availableOptions: string[];
    expectedOutputPath: 'turn_result.json';
}

export interface RelayTurnResultMatch {
    ok: boolean;
    reason?: string;
    requestId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampString(value: unknown, max = 2000): string {
    if (typeof value !== 'string') { return ''; }
    return value.slice(0, max);
}

export function getAntigravityRelayRequestPath(workspacePath: string): string {
    return path.join(workspacePath, ANTIGRAVITY_RELAY_REQUEST_DIR, ANTIGRAVITY_RELAY_REQUEST_FILE);
}

export function buildAntigravityRelayRequestId(input: AntigravityRelayRequestIdInput): string {
    const hash = crypto
        .createHash('sha256')
        .update([
            path.resolve(input.workspacePath),
            input.createdAt,
            String(input.turnIndex),
            input.playerAction,
        ].join('\n'), 'utf8')
        .digest('hex')
        .slice(0, 20);
    return `agr-${input.turnIndex}-${hash}`;
}

export function buildAntigravityRelayRequest(input: {
    requestId: string;
    createdAt: string;
    playerAction: string;
    minimalContext: Record<string, unknown>;
    availableOptions: unknown;
}): AntigravityRelayRequest {
    const availableOptions = Array.isArray(input.availableOptions)
        ? input.availableOptions
            .filter((option): option is string => typeof option === 'string')
            .map((option) => option.slice(0, 500))
            .slice(0, 12)
        : [];
    return {
        schemaVersion: ANTIGRAVITY_RELAY_REQUEST_SCHEMA_VERSION,
        kind: 'antigravity_relay_request',
        requestId: input.requestId,
        createdAt: input.createdAt,
        playerAction: clampString(input.playerAction, 4000),
        minimalContext: input.minimalContext,
        availableOptions,
        expectedOutputPath: ANTIGRAVITY_RELAY_EXPECTED_OUTPUT,
    };
}

export function parseAntigravityRelayRequest(value: unknown): AntigravityRelayRequest | undefined {
    if (!isRecord(value)) { return undefined; }
    if (value.schemaVersion !== ANTIGRAVITY_RELAY_REQUEST_SCHEMA_VERSION) { return undefined; }
    if (value.kind !== 'antigravity_relay_request') { return undefined; }
    if (typeof value.requestId !== 'string' || !value.requestId.trim()) { return undefined; }
    if (typeof value.createdAt !== 'string' || !value.createdAt.trim()) { return undefined; }
    if (typeof value.playerAction !== 'string') { return undefined; }
    if (!isRecord(value.minimalContext)) { return undefined; }
    if (!Array.isArray(value.availableOptions)) { return undefined; }
    if (value.expectedOutputPath !== ANTIGRAVITY_RELAY_EXPECTED_OUTPUT) { return undefined; }
    return buildAntigravityRelayRequest({
        requestId: value.requestId.trim(),
        createdAt: value.createdAt,
        playerAction: value.playerAction,
        minimalContext: value.minimalContext,
        availableOptions: value.availableOptions,
    });
}

export function getRelayRequestIdFromTurnResult(turnResult: TurnResult): string | undefined {
    const direct = (turnResult as unknown as Record<string, unknown>).requestId;
    if (typeof direct === 'string' && direct.trim()) {
        return direct.trim();
    }
    const metadata = (turnResult as unknown as Record<string, unknown>).metadata;
    if (isRecord(metadata)) {
        const metadataRequestId = metadata.requestId;
        if (typeof metadataRequestId === 'string' && metadataRequestId.trim()) {
            return metadataRequestId.trim();
        }
        const relay = metadata.antigravityRelay;
        if (isRecord(relay) && typeof relay.requestId === 'string' && relay.requestId.trim()) {
            return relay.requestId.trim();
        }
    }
    return undefined;
}

export function validateTurnResultForPendingRelayRequest(
    pendingRequest: AntigravityRelayRequest | undefined,
    turnResult: TurnResult
): RelayTurnResultMatch {
    if (!pendingRequest) {
        return { ok: true, reason: 'no pending relay request' };
    }
    const requestId = getRelayRequestIdFromTurnResult(turnResult);
    if (!requestId) {
        return { ok: false, reason: 'pending relay request requires turn_result metadata.requestId' };
    }
    if (requestId !== pendingRequest.requestId) {
        return {
            ok: false,
            reason: `turn_result requestId mismatch: expected ${pendingRequest.requestId}, got ${requestId}`,
            requestId,
        };
    }
    return { ok: true, requestId };
}
