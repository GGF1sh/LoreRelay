import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { t } from './i18n';
import {
    buildProductionPromptAssembly,
    postPromptContextToWebview,
} from './gmPromptBuilder';
import {
    buildFallbackNarration,
    buildNarratorPrompt,
    buildRefereePrompt,
    isAgenticCapableProvider,
    MAX_AGENTIC_TEXT_BYTES,
    mergeAgenticTurnResult,
    parseNarratorResultJson,
    parseRefereeResultJson,
    suggestNextTurnId,
    type AgenticGmProvider,
} from './agenticGmCore';
import {
    formatRedactedAction,
    safeUnlinkPlayerActionFile,
    writePromptFile,
} from './playerAction';
import { getGmProvider, getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import type { DiceLedgerEntry } from './types/TurnResult';
import {
    beginGmRun,
    finishGmRun,
} from './turnResultFallback';
import {
    buildTurnResultPromptReceiptMeta,
    hashPromptReceiptText,
} from './promptReceiptCore';
import {
    getGmBridgeOutputChannel,
    createPromptAcceptedCallbackForTests,
    GrokPromptRunResult,
    runGrokPromptFile,
    runLocalAgenticStage,
    runVscodeLmAgenticStage,
    setAgenticBridgeBusy,
} from './gmBridgeRunner';
import { notifyRemoteGmBusy } from './remotePlayServer';

export interface AgenticBridgeResult {
    handled: boolean;
    success: boolean;
    fallbackToSingleStage: boolean;
    fallbackReason?: string;
}

function getAgenticDir(cwd: string): string {
    return path.join(cwd, '.text-adventure', 'agentic');
}

function ensureAgenticDir(cwd: string): string {
    const dir = getAgenticDir(cwd);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function readBoundedText(filePath: string): string {
    if (!fs.existsSync(filePath)) {
        return '';
    }
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_AGENTIC_TEXT_BYTES) {
        throw new Error(`Agentic file too large: ${path.basename(filePath)}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
}

function writeAgenticText(cwd: string, name: string, content: string): string {
    const dir = ensureAgenticDir(cwd);
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

function safeUnlinkAgenticFile(filePath: string): void {
    try {
        fs.unlinkSync(filePath);
    } catch {
        // Missing or locked stage files should not block a new GM run.
    }
}

function buildAgenticBasePrompt(playerAction: string, promptContext: string): string {
    return [
        '[LoreRelay Agentic GM Context]',
        `Player action: ${playerAction}`,
        '',
        'Use the context below, but follow the current agentic stage instructions over any general GM behavior.',
        'Do not write game_state.json directly.',
        promptContext,
    ].join('\n');
}

function loadSuggestedTurnId(cwd: string): string {
    const statePath = path.join(cwd, 'game_state.json');
    if (!fs.existsSync(statePath)) {
        return suggestNextTurnId([]);
    }
    try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
        return suggestNextTurnId(state.entries);
    } catch {
        return suggestNextTurnId([]);
    }
}

function readStageCandidate<T>(
    filePath: string,
    stdout: string,
    parser: (text: string) => T | null
): T | null {
    try {
        const fromFile = readBoundedText(filePath);
        if (fromFile.trim()) {
            const parsed = parser(fromFile);
            if (parsed) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('[agenticGm] stage file read failed', e);
    }
    return parser(stdout);
}

function persistStageJson(filePath: string, value: unknown): void {
    writeJsonAtomic(filePath, value);
}

function getAgenticConfig(): {
    enabled: boolean;
    fallbackToSingleStage: boolean;
    stageTimeoutMs: number;
} {
    const config = vscode.workspace.getConfiguration('textAdventure');
    return {
        enabled: config.get<boolean>('gmBridge.agentic.enabled', false),
        fallbackToSingleStage: config.get<boolean>('gmBridge.agentic.fallbackToSingleStage', true),
        stageTimeoutMs: Math.max(30_000, config.get<number>('gmBridge.agentic.stageTimeoutMs', 180_000)),
    };
}

function isProviderReady(provider: AgenticGmProvider): boolean {
    const config = vscode.workspace.getConfiguration('textAdventure');
    if (provider === 'grok') {
        return config.get<boolean>('grokBridge.enabled', true);
    }
    return true;
}

async function runAgenticStage(options: {
    provider: AgenticGmProvider;
    cwd: string;
    prompt: string;
    promptFile: string;
    stageLabel: string;
    playerAction: string;
    timeoutMs: number;
    getOpenRouterApiKey?: () => Promise<string>;
}): Promise<GrokPromptRunResult> {
    if (options.provider === 'grok') {
        return runGrokPromptFile({
            cwd: options.cwd,
            promptFile: options.promptFile,
            continueSession: false,
            timeoutMs: options.timeoutMs,
            stageLabel: options.stageLabel,
            playerAction: options.playerAction,
        });
    }
    if (options.provider === 'vscode-lm') {
        return runVscodeLmAgenticStage({
            prompt: options.prompt,
            stageLabel: options.stageLabel,
            timeoutMs: options.timeoutMs,
            playerAction: options.playerAction,
        });
    }
    if (!options.getOpenRouterApiKey) {
        return { exitCode: 1, timedOut: false, stdout: '' };
    }
    return runLocalAgenticStage({
        provider: options.provider,
        cwd: options.cwd,
        promptFile: options.promptFile,
        timeoutMs: options.timeoutMs,
        stageLabel: options.stageLabel,
        playerAction: options.playerAction,
        getOpenRouterApiKey: options.getOpenRouterApiKey,
    });
}

function markAgenticProviderSession(provider: AgenticGmProvider): void {
    void provider;
    // Phase 9B keeps single-stage session flags unchanged; stages always run fresh.
}

export async function maybeInvokeAgenticBridge(
    playerAction: string,
    diceLedger: DiceLedgerEntry[] | undefined,
    getPanel: () => vscode.WebviewPanel | undefined,
    getOpenRouterApiKey?: () => Promise<string>
): Promise<AgenticBridgeResult> {
    const agenticCfg = getAgenticConfig();
    if (!agenticCfg.enabled) {
        return { handled: false, success: false, fallbackToSingleStage: true };
    }

    const providerName = getGmProvider();
    if (!isAgenticCapableProvider(providerName)) {
        return { handled: false, success: false, fallbackToSingleStage: true };
    }
    const provider = providerName;

    if (!isProviderReady(provider)) {
        return { handled: false, success: false, fallbackToSingleStage: true };
    }

    const cwd = getWorkspacePath();
    if (!cwd || !vscode.workspace.isTrusted) {
        return {
            handled: true,
            success: false,
            fallbackToSingleStage: agenticCfg.fallbackToSingleStage,
            fallbackReason: 'workspace unavailable or untrusted',
        };
    }

    const channel = getGmBridgeOutputChannel();
    channel.appendLine(`\n[Agentic GM] provider=${provider}`);
    const suggestedTurnId = loadSuggestedTurnId(cwd);
    const promptAssembly = buildProductionPromptAssembly(playerAction, 'agentic');
    const basePrompt = buildAgenticBasePrompt(playerAction, promptAssembly.promptText);
    const agenticDir = ensureAgenticDir(cwd);

    const refereePrompt = buildRefereePrompt({
        basePrompt,
        playerAction,
        suggestedTurnId,
        diceLedger,
    });
    writeAgenticText(cwd, 'referee_prompt.md', refereePrompt);
    const refereePromptFile = writePromptFile(cwd, refereePrompt);
    const refereeResultPath = path.join(agenticDir, 'referee_result.json');
    const narratorResultPath = path.join(agenticDir, 'narrator_result.json');
    safeUnlinkAgenticFile(refereeResultPath);
    safeUnlinkAgenticFile(narratorResultPath);
    safeUnlinkAgenticFile(path.join(agenticDir, 'final_turn_result.json'));

    channel.appendLine('[Agentic GM] State Referee stage starting...');
    getPanel()?.webview.postMessage({ type: 'gmStart' });
    postPromptContextToWebview(playerAction);
    notifyRemoteGmBusy(true);
    setAgenticBridgeBusy(true);
    vscode.window.setStatusBarMessage(`Agentic GM (${provider}): State Referee...`, 0);

    const prevGmState = beginGmRun(createPromptAcceptedCallbackForTests(
        {
            ...promptAssembly.receipt,
            diagnostics: {
                stageTransportPayloadHashes: [{
                    stage: 'referee',
                    hash: hashPromptReceiptText(refereePrompt),
                }],
            },
        },
        channel
    ));

    try {
        const refereeRun = await runAgenticStage({
            provider,
            cwd,
            prompt: refereePrompt,
            promptFile: refereePromptFile,
            stageLabel: 'State Referee',
            playerAction,
            timeoutMs: agenticCfg.stageTimeoutMs,
            getOpenRouterApiKey,
        });

        if (refereeRun.timedOut || refereeRun.exitCode !== 0) {
            finishGmRun(prevGmState, playerAction, false);
            notifyRemoteGmBusy(false);
            setAgenticBridgeBusy(false);
            vscode.window.setStatusBarMessage('');
            getPanel()?.webview.postMessage({ type: 'gmEnd', success: false });
            return {
                handled: true,
                success: false,
                fallbackToSingleStage: agenticCfg.fallbackToSingleStage,
                fallbackReason: refereeRun.timedOut ? 'referee timeout' : `referee exit ${refereeRun.exitCode}`,
            };
        }

        let referee = readStageCandidate(
            refereeResultPath,
            refereeRun.stdout,
            parseRefereeResultJson
        );
        if (referee && !fs.existsSync(refereeResultPath)) {
            persistStageJson(refereeResultPath, referee);
        }
        if (!referee) {
            finishGmRun(prevGmState, playerAction, false);
            notifyRemoteGmBusy(false);
            setAgenticBridgeBusy(false);
            vscode.window.setStatusBarMessage('');
            getPanel()?.webview.postMessage({ type: 'gmEnd', success: false });
            channel.appendLine('[Agentic GM] Referee stage produced no valid candidate.');
            return {
                handled: true,
                success: false,
                fallbackToSingleStage: agenticCfg.fallbackToSingleStage,
                fallbackReason: 'invalid referee candidate',
            };
        }

        channel.appendLine('[Agentic GM] Narrator stage starting...');
        vscode.window.setStatusBarMessage(`Agentic GM (${provider}): Narrator...`, 0);

        const narratorPrompt = buildNarratorPrompt({
            basePrompt,
            playerAction,
            referee,
        });
        writeAgenticText(cwd, 'narrator_prompt.md', narratorPrompt);
        const narratorPromptFile = writePromptFile(cwd, narratorPrompt);
        safeUnlinkAgenticFile(narratorResultPath);

        const narratorRun = await runAgenticStage({
            provider,
            cwd,
            prompt: narratorPrompt,
            promptFile: narratorPromptFile,
            stageLabel: 'Narrator',
            playerAction,
            timeoutMs: agenticCfg.stageTimeoutMs,
            getOpenRouterApiKey,
        });

        safeUnlinkPlayerActionFile(narratorPromptFile);

        let narrator = null;
        if (!narratorRun.timedOut && narratorRun.exitCode === 0) {
            narrator = readStageCandidate(
                narratorResultPath,
                narratorRun.stdout,
                parseNarratorResultJson
            );
            if (narrator && !fs.existsSync(narratorResultPath)) {
                persistStageJson(narratorResultPath, narrator);
            }
        } else {
            channel.appendLine(
                `[Agentic GM] Narrator stage failed (${narratorRun.timedOut ? 'timeout' : `exit ${narratorRun.exitCode}`}); using fallback narration.`
            );
        }

        const merged = mergeAgenticTurnResult({
            playerAction,
            referee,
            narrator,
            fallbackNarration: buildFallbackNarration(referee),
            provider,
            promptReceipt: buildTurnResultPromptReceiptMeta({
                ...promptAssembly.receipt,
                diagnostics: {
                    stageTransportPayloadHashes: [
                        { stage: 'referee', hash: hashPromptReceiptText(refereePrompt) },
                        { stage: 'narrator', hash: hashPromptReceiptText(narratorPrompt) },
                    ],
                },
            }),
        });
        if (!merged.ok || !merged.result) {
            finishGmRun(prevGmState, playerAction, false);
            notifyRemoteGmBusy(false);
            setAgenticBridgeBusy(false);
            vscode.window.setStatusBarMessage('');
            getPanel()?.webview.postMessage({ type: 'gmEnd', success: false });
            return {
                handled: true,
                success: false,
                fallbackToSingleStage: agenticCfg.fallbackToSingleStage,
                fallbackReason: merged.reason ?? 'merge failed',
            };
        }

        writeJsonAtomic(path.join(agenticDir, 'final_turn_result.json'), merged.result);
        writeJsonAtomic(path.join(cwd, 'turn_result.json'), merged.result);

        markAgenticProviderSession(provider);
        finishGmRun(prevGmState, playerAction, true);
        notifyRemoteGmBusy(false);
        setAgenticBridgeBusy(false);
        vscode.window.setStatusBarMessage('');
        getPanel()?.webview.postMessage({ type: 'gmEnd', success: true });
        channel.appendLine('[Agentic GM] Final turn_result.json written.');
        vscode.window.showInformationMessage(t('extension.info.grokDone'));
        return { handled: true, success: true, fallbackToSingleStage: agenticCfg.fallbackToSingleStage };
    } finally {
        setAgenticBridgeBusy(false);
        safeUnlinkPlayerActionFile(refereePromptFile);
    }
}
