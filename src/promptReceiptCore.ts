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

export interface PromptDeliveryReceiptDiagnostics {
    transportPayloadHash?: string;
    stageTransportPayloadHashes?: Array<{ stage: string; hash: string }>;
}

export interface PromptDeliveryReceipt {
    receiptId: string;
    provider: PromptReceiptProvider;
    assemblyDigest: string;
    selectedChunks: PromptReceiptChunkRecord[];
    selectedTokens: PromptConsumableAckToken[];
    diagnostics?: PromptDeliveryReceiptDiagnostics;
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

export function createPromptDeliveryReceipt(input: {
    receiptId: string;
    provider: PromptReceiptProvider;
    selectedChunks: Array<{ id: string; text: string; priority: number }>;
    selectedTokens: PromptConsumableAckToken[];
    budgetMode: string;
    targetTokens: number;
    diagnostics?: PromptDeliveryReceiptDiagnostics;
}): PromptDeliveryReceipt {
    return {
        receiptId: input.receiptId,
        provider: input.provider,
        assemblyDigest: createPromptAssemblyDigest({
            selectedChunks: input.selectedChunks,
            selectedTokens: input.selectedTokens,
            budgetMode: input.budgetMode,
            targetTokens: input.targetTokens,
        }),
        selectedChunks: input.selectedChunks.map((chunk) => ({
            id: chunk.id,
            contentDigest: hashPromptReceiptText(chunk.text),
            charCount: chunk.text.length,
            priority: chunk.priority,
        })),
        selectedTokens: input.selectedTokens.map((token) => ({ ...token })),
        diagnostics: input.diagnostics
            ? {
                transportPayloadHash: input.diagnostics.transportPayloadHash,
                stageTransportPayloadHashes: input.diagnostics.stageTransportPayloadHashes
                    ? input.diagnostics.stageTransportPayloadHashes.map((entry) => ({ ...entry }))
                    : undefined,
            }
            : undefined,
    };
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
