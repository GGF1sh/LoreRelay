import * as crypto from 'crypto';
import type { TurnResult } from './types/TurnResult';

export type PromptReceiptProvider =
    | 'grok'
    | 'ollama'
    | 'koboldcpp'
    | 'openrouter'
    | 'command'
    | 'vscode-lm'
    | 'agentic';

export interface PromptReceiptChunkRecord {
    id: string;
    contentDigest: string;
    charCount: number;
    priority: number;
}

export interface ChronicleAckToken {
    tokenId: string;
    chunkId: 'chronicle';
    sourceTurn: number;
    sourceDigest: string;
    pendingGeneration: number;
}

export interface WorldChangeSummaryAckToken {
    tokenId: string;
    chunkId: 'worldChangeSummary';
    summaryTurn: number;
    sourceDigest: string;
}

export type PromptConsumableAckToken = ChronicleAckToken | WorldChangeSummaryAckToken;

/**
 * Explicit three-way outcome for a single bounded ACK application, used instead of a bare
 * boolean so an already-satisfied idempotent no-op (e.g. a repeated exact token) can be told
 * apart from a genuine persistence/application failure. `false` alone cannot make this
 * distinction, which is why native appliers and the ACK loop must speak this contract.
 */
export type PromptReceiptAckOutcome = 'applied' | 'alreadySatisfied' | 'failed';

export interface PromptDeliveryReceiptDiagnostics {
    transportPayloadHash?: string;
    stageTransportPayloadHashes?: ReadonlyArray<Readonly<{ stage: string; hash: string }>>;
}

export interface PromptDeliveryReceipt {
    readonly receiptId: string;
    readonly provider: PromptReceiptProvider;
    readonly assemblyDigest: string;
    readonly selectedChunks: ReadonlyArray<Readonly<PromptReceiptChunkRecord>>;
    readonly selectedTokens: ReadonlyArray<Readonly<PromptConsumableAckToken>>;
    readonly diagnostics?: Readonly<PromptDeliveryReceiptDiagnostics>;
}

export interface TurnResultPromptReceiptMeta {
    receiptId: string;
    provider: PromptReceiptProvider;
    assemblyDigest: string;
    transportPayloadHash?: string;
    stageTransportPayloadHashes?: Array<{ stage: string; hash: string }>;
}

function stableJson(value: unknown): string {
    return JSON.stringify(value);
}

export function hashPromptReceiptText(text: string): string {
    return crypto.createHash('sha256').update(String(text ?? ''), 'utf-8').digest('hex');
}

export function createPromptReceiptId(): string {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
}

export function createPromptAssemblyDigest(input: {
    selectedChunks: Array<{ id: string; text: string; priority: number }>;
    selectedTokens: PromptConsumableAckToken[];
    budgetMode: string;
    targetTokens: number;
}): string {
    const authorityShape = {
        chunks: input.selectedChunks.map((chunk) => ({
            id: chunk.id,
            contentDigest: hashPromptReceiptText(chunk.text),
            priority: chunk.priority,
        })),
        tokens: input.selectedTokens.map((token) => {
            if (token.chunkId === 'chronicle') {
                return {
                    tokenId: token.tokenId,
                    chunkId: token.chunkId,
                    sourceTurn: token.sourceTurn,
                    sourceDigest: token.sourceDigest,
                    pendingGeneration: token.pendingGeneration,
                };
            }
            return {
                tokenId: token.tokenId,
                chunkId: token.chunkId,
                summaryTurn: token.summaryTurn,
                sourceDigest: token.sourceDigest,
            };
        }),
        budgetMode: input.budgetMode,
        targetTokens: input.targetTokens,
    };
    return hashPromptReceiptText(stableJson(authorityShape));
}

/**
 * Receipt authority is immutable from construction onward: chunk records, token records, and
 * their containing arrays are frozen so no later caller can mutate ACK authority in place after
 * a callback closure has captured this object. Callers must not rely on being able to reassign
 * receipt fields; consumption always goes through `createPromptReceiptAckWorkItem` below.
 */
export function createPromptDeliveryReceipt(input: {
    receiptId: string;
    provider: PromptReceiptProvider;
    selectedChunks: Array<{ id: string; text: string; priority: number }>;
    selectedTokens: PromptConsumableAckToken[];
    budgetMode: string;
    targetTokens: number;
    diagnostics?: PromptDeliveryReceiptDiagnostics;
}): PromptDeliveryReceipt {
    const assemblyDigest = createPromptAssemblyDigest({
        selectedChunks: input.selectedChunks,
        selectedTokens: input.selectedTokens,
        budgetMode: input.budgetMode,
        targetTokens: input.targetTokens,
    });
    const selectedChunks = Object.freeze(input.selectedChunks.map((chunk) => Object.freeze({
        id: chunk.id,
        contentDigest: hashPromptReceiptText(chunk.text),
        charCount: chunk.text.length,
        priority: chunk.priority,
    })));
    const selectedTokens = Object.freeze(input.selectedTokens.map((token) => Object.freeze({ ...token })));
    const diagnostics = input.diagnostics
        ? Object.freeze({
            transportPayloadHash: input.diagnostics.transportPayloadHash,
            stageTransportPayloadHashes: input.diagnostics.stageTransportPayloadHashes
                ? Object.freeze(input.diagnostics.stageTransportPayloadHashes.map((entry) => Object.freeze({ ...entry })))
                : undefined,
        })
        : undefined;
    return Object.freeze({
        receiptId: input.receiptId,
        provider: input.provider,
        assemblyDigest,
        selectedChunks,
        selectedTokens,
        diagnostics,
    });
}

/**
 * Immutable ACK work item copied from the receipt at Accepted-callback-invocation time. ACK must
 * iterate this copy, never the live receipt reference held elsewhere, so a post-capture mutation
 * attempt on the original receipt/token arrays (even one that bypasses freeze via a fresh object)
 * cannot change what tokens actually get applied.
 */
export interface PromptReceiptAckWorkItem {
    readonly receiptId: string;
    readonly provider: PromptReceiptProvider;
    readonly assemblyDigest: string;
    readonly selectedTokens: ReadonlyArray<Readonly<PromptConsumableAckToken>>;
}

export function createPromptReceiptAckWorkItem(receipt: PromptDeliveryReceipt): PromptReceiptAckWorkItem {
    return Object.freeze({
        receiptId: receipt.receiptId,
        provider: receipt.provider,
        assemblyDigest: receipt.assemblyDigest,
        selectedTokens: Object.freeze(receipt.selectedTokens.map((token) => Object.freeze({ ...token }))),
    });
}

/**
 * Provider bridges attach transport/stage diagnostics to a receipt after construction (e.g. once
 * the actual outbound prompt text is known). This must not weaken the receipt's runtime
 * immutability: the returned receipt is a fresh, fully frozen object, reusing the already-frozen
 * `selectedChunks`/`selectedTokens` from the source receipt, so a diagnostics-wrapped receipt
 * captured by a provider Accepted callback (Grok, VS Code LM, Agentic) remains just as immutable
 * as the receipt returned by `createPromptDeliveryReceipt`.
 */
export function withPromptReceiptDiagnostics(
    receipt: PromptDeliveryReceipt,
    diagnostics: {
        transportPayloadHash?: string;
        stageTransportPayloadHashes?: ReadonlyArray<Readonly<{ stage: string; hash: string }>>;
    }
): PromptDeliveryReceipt {
    const transportPayloadHash = diagnostics.transportPayloadHash ?? receipt.diagnostics?.transportPayloadHash;
    const stageTransportPayloadHashes = diagnostics.stageTransportPayloadHashes
        ?? receipt.diagnostics?.stageTransportPayloadHashes;
    return Object.freeze({
        receiptId: receipt.receiptId,
        provider: receipt.provider,
        assemblyDigest: receipt.assemblyDigest,
        selectedChunks: receipt.selectedChunks,
        selectedTokens: receipt.selectedTokens,
        diagnostics: Object.freeze({
            transportPayloadHash,
            stageTransportPayloadHashes: stageTransportPayloadHashes
                ? Object.freeze(stageTransportPayloadHashes.map((entry) => Object.freeze({ ...entry })))
                : undefined,
        }),
    });
}

export function buildTurnResultPromptReceiptMeta(
    receipt: PromptDeliveryReceipt
): TurnResultPromptReceiptMeta {
    return {
        receiptId: receipt.receiptId,
        provider: receipt.provider,
        assemblyDigest: receipt.assemblyDigest,
        transportPayloadHash: receipt.diagnostics?.transportPayloadHash,
        stageTransportPayloadHashes: receipt.diagnostics?.stageTransportPayloadHashes
            ? receipt.diagnostics.stageTransportPayloadHashes.map((entry) => ({ ...entry }))
            : undefined,
    };
}

export function attachTurnResultPromptReceipt(
    turnResult: TurnResult,
    promptReceipt: TurnResultPromptReceiptMeta | undefined
): TurnResult {
    if (!promptReceipt) {
        return turnResult;
    }
    return {
        ...turnResult,
        promptReceipt: {
            receiptId: promptReceipt.receiptId,
            provider: promptReceipt.provider,
            assemblyDigest: promptReceipt.assemblyDigest,
            ...(promptReceipt.transportPayloadHash
                ? { transportPayloadHash: promptReceipt.transportPayloadHash }
                : {}),
            ...(promptReceipt.stageTransportPayloadHashes?.length
                ? {
                    stageTransportPayloadHashes: promptReceipt.stageTransportPayloadHashes.map((entry) => ({
                        stage: entry.stage,
                        hash: entry.hash,
                    })),
                }
                : {}),
        },
    };
}

export function turnResultMatchesPromptReceipt(
    turnResult: TurnResult | undefined,
    receipt: PromptDeliveryReceipt
): boolean {
    if (!turnResult?.promptReceipt) {
        return false;
    }
    return turnResult.promptReceipt.receiptId === receipt.receiptId
        && turnResult.promptReceipt.provider === receipt.provider
        && turnResult.promptReceipt.assemblyDigest === receipt.assemblyDigest;
}
