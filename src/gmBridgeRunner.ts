import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { t, getConfiguredLocale } from './i18n';
import {
    formatRedactedAction,
    maskSensitiveFileInArgs,
    safeUnlinkPlayerActionFile,
    writePlayerActionFile,
    writePromptFile
} from './playerAction';
import { getWorkspacePath, getGmProvider, writeJsonAtomic } from './workspacePaths';
import { sanitizeGameStateForPersist } from './gameStateSanitize';
import { clearMediaAgentCaches } from './mediaAgent';
import {
    buildLocalGmEnv,
    resolveGmBridgeScript,
    resolvePythonCommand
} from './skillScriptRunner';
import { DiceLedgerEntry } from './types/TurnResult';
import { dispatchStreamMediaHints, parseGmStreamChunk, resetMediaStreamCache } from './mediaAgent';
import { notifyRemoteGmBusy } from './remotePlayServer';
import { beginGmRun, finishGmRun } from './turnResultFallback';
import { getTriggeredLoreLabels, postPromptContextToWebview } from './gmPromptBuilder';
import { getCachedGameState } from './gameStateSync';
import { enqueueVlmAnalysis, buildVlmMetaFromGameState, isVlmEnabled } from './vlmQueue';
import {
    buildVscodeLmTurnResult,
    extractVscodeLmJsonBlock,
    stripVscodeLmJsonBlock,
    substituteDiceMarkersSimple,
    type VscodeLmGmJson,
} from './vscodeLmTurnResultCore';


let grokOutputChannel: vscode.OutputChannel | undefined;
let grokProcess: ChildProcess | undefined;
let gmProcess: ChildProcess | undefined;
let grokSessionActive = false;
let localGmSessionActive = false;
let agenticBridgeBusy = false;
let pendingDiceLedgerWritten = false;

export interface GmBridgeRunnerDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
    buildGrokPrompt: (playerAction: string, isContinuation: boolean) => string;
    getOpenRouterApiKey: () => Promise<string>;
    subscriptions: vscode.Disposable[];
}

let deps: GmBridgeRunnerDeps | undefined;

export function initGmBridgeRunner(runnerDeps: GmBridgeRunnerDeps): void {
    deps = runnerDeps;
}

function requireDeps(): GmBridgeRunnerDeps {
    if (!deps) {
        throw new Error('initGmBridgeRunner must be called before using GM bridge');
    }
    return deps;
}

export function getGmBridgeOutputChannel(): vscode.OutputChannel {
    if (!grokOutputChannel) {
        grokOutputChannel = vscode.window.createOutputChannel('LoreRelay: GM Bridge');
        deps?.subscriptions.push(grokOutputChannel);
    }
    return grokOutputChannel;
}

function resolveGrokCommand(configured: string): string {
    if (configured && configured !== 'grok') {
        return configured;
    }
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const defaultPath = process.platform === 'win32'
        ? path.join(home, '.grok', 'bin', 'grok.exe')
        : path.join(home, '.grok', 'bin', 'grok');
    if (fs.existsSync(defaultPath)) {
        return defaultPath;
    }
    return 'grok';
}

export function isGmBridgeBusy(): boolean {
    return Boolean(grokProcess || gmProcess || agenticBridgeBusy);
}

export function setAgenticBridgeBusy(busy: boolean): void {
    agenticBridgeBusy = busy;
}

function clearDiceLedgerIfPending(): void {
    if (!pendingDiceLedgerWritten) {
        return;
    }
    pendingDiceLedgerWritten = false;
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
        return;
    }
    const ledgerPath = path.join(workspacePath, 'dice_ledger.json');
    try {
        if (fs.existsSync(ledgerPath)) {
            fs.unlinkSync(ledgerPath);
        }
    } catch (e) {
        console.warn('[gmBridge] Failed to clear dice_ledger after GM failure', e);
    }
}

function handleGmBridgeFailure(): void {
    clearDiceLedgerIfPending();
    notifyRemoteGmBusy(false);
    vscode.window.setStatusBarMessage('');
}

export function killGmBridgeProcesses(): void {
    const wasBusy = Boolean(grokProcess || gmProcess || agenticBridgeBusy);
    if (grokProcess) {
        grokProcess.kill();
        grokProcess = undefined;
    }
    if (gmProcess) {
        gmProcess.kill();
        gmProcess = undefined;
    }
    agenticBridgeBusy = false;
    if (wasBusy) {
        handleGmBridgeFailure();
    }
}

export function resetGmBridgeSessions(): void {
    grokSessionActive = false;
    localGmSessionActive = false;
}

export interface GrokPromptRunResult {
    exitCode: number | null;
    timedOut: boolean;
    stdout: string;
}

/** Spawn Grok CLI for a single prompt file (used by Phase 9 agentic stages). */
export async function runGrokPromptFile(options: {
    cwd: string;
    promptFile: string;
    continueSession: boolean;
    timeoutMs: number;
    stageLabel: string;
    playerAction?: string;
}): Promise<GrokPromptRunResult> {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const grokCmd = resolveGrokCommand(config.get<string>('grokBridge.command', 'grok') || 'grok');
    const autoApprove = config.get<boolean>('grokBridge.autoApprove', false);
    const args = ['--prompt-file', options.promptFile, '--cwd', options.cwd];
    if (autoApprove) {
        args.push('--always-approve');
    }
    if (options.continueSession) {
        args.push('--continue');
    }

    const channel = getGmBridgeOutputChannel();
    channel.appendLine(
        `\n[${options.stageLabel}] > ${grokCmd} --prompt-file <redacted-file> --cwd ${options.cwd}`
    );
    if (options.playerAction) {
        channel.appendLine(`Player action: ${formatRedactedAction(options.playerAction)}\n`);
    }

    return new Promise((resolve) => {
        let stdout = '';
        let finished = false;
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            if (grokProcess) {
                grokProcess.kill();
            }
        }, options.timeoutMs);

        const finish = (exitCode: number | null) => {
            if (finished) { return; }
            finished = true;
            clearTimeout(timer);
            grokProcess = undefined;
            resolve({ exitCode, timedOut, stdout });
        };

        grokProcess = spawn(grokCmd, args, {
            cwd: options.cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env,
        });

        grokProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            stdout += text;
            if (stdout.length > GM_STREAM_BUFFER_MAX) {
                stdout = stdout.slice(-GM_STREAM_BUFFER_MAX);
            }
            channel.append(text);
        });

        grokProcess.stderr?.on('data', (data: Buffer) => {
            channel.append(data.toString());
        });

        grokProcess.on('error', (err) => {
            channel.appendLine(`\n[${options.stageLabel} error: ${err.message}]`);
            finish(null);
        });

        grokProcess.on('close', (code) => {
            channel.appendLine(`\n[${options.stageLabel} exited with code ${code ?? 'unknown'}]`);
            finish(code ?? null);
        });
    });
}

/** vscode-lm agentic stage: prompt in, stdout text out (no game_state writes). */
export async function runVscodeLmAgenticStage(options: {
    prompt: string;
    stageLabel: string;
    timeoutMs: number;
    playerAction?: string;
}): Promise<GrokPromptRunResult> {
    const channel = getGmBridgeOutputChannel();
    const config = vscode.workspace.getConfiguration('textAdventure');
    const vendor = config.get<string>('gmBridge.vscodeLm.vendor', '').trim() || undefined;
    const family = config.get<string>('gmBridge.vscodeLm.family', '').trim() || undefined;
    const modelId = config.get<string>('gmBridge.vscodeLm.model', '').trim() || undefined;

    const selector: vscode.LanguageModelChatSelector = {};
    if (vendor) { selector.vendor = vendor; }
    if (family) { selector.family = family; }
    if (modelId) { selector.id = modelId; }

    const models = await vscode.lm.selectChatModels(Object.keys(selector).length ? selector : {});
    if (!models.length) {
        channel.appendLine(`[${options.stageLabel}] vscode-lm: no model available`);
        return { exitCode: 1, timedOut: false, stdout: '' };
    }
    const model = models[0];
    channel.appendLine(`\n[${options.stageLabel}] vscode-lm model=${model.name} (${model.vendor}/${model.family})`);
    if (options.playerAction) {
        channel.appendLine(`Player action: ${formatRedactedAction(options.playerAction)}\n`);
    }

    const cts = new vscode.CancellationTokenSource();
    const timer = setTimeout(() => cts.cancel(), options.timeoutMs);
    let stdout = '';
    let timedOut = false;

    try {
        const response = await model.sendRequest(
            [vscode.LanguageModelChatMessage.User(options.prompt)],
            {},
            cts.token
        );
        for await (const chunk of response.stream) {
            if (chunk instanceof vscode.LanguageModelTextPart) {
                stdout += chunk.value;
                if (stdout.length > GM_STREAM_BUFFER_MAX) {
                    stdout = stdout.slice(-GM_STREAM_BUFFER_MAX);
                }
                channel.append(chunk.value);
            }
        }
        channel.appendLine(`\n[${options.stageLabel} vscode-lm: complete]`);
        return { exitCode: 0, timedOut: false, stdout };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        timedOut = cts.token.isCancellationRequested;
        channel.appendLine(`\n[${options.stageLabel} vscode-lm error: ${msg}]`);
        return { exitCode: 1, timedOut, stdout };
    } finally {
        clearTimeout(timer);
        cts.dispose();
    }
}

/** Local LLM agentic stage via agentic_stage_gm.py (stdout only, no game_state writes). */
export async function runLocalAgenticStage(options: {
    provider: 'ollama' | 'koboldcpp' | 'openrouter';
    cwd: string;
    promptFile: string;
    timeoutMs: number;
    stageLabel: string;
    playerAction?: string;
    getOpenRouterApiKey: () => Promise<string>;
}): Promise<GrokPromptRunResult> {
    const scriptPath = resolveGmBridgeScript('agentic_stage_gm.py');
    if (!scriptPath) {
        const channel = getGmBridgeOutputChannel();
        channel.appendLine(`[${options.stageLabel}] agentic_stage_gm.py not found`);
        return { exitCode: 1, timedOut: false, stdout: '' };
    }

    const python = resolvePythonCommand();
    const config = vscode.workspace.getConfiguration('textAdventure');
    const args = [
        scriptPath,
        '--cwd', options.cwd,
        '--provider', options.provider,
        '--prompt-file', options.promptFile,
    ];

    if (options.provider === 'ollama') {
        const model = config.get<string>('gmBridge.ollama.model', '').trim();
        const url = config.get<string>('gmBridge.ollama.url', '').trim();
        if (model) { args.push('--model', model); }
        if (url) { args.push('--url', url); }
    } else if (options.provider === 'koboldcpp') {
        const url = config.get<string>('gmBridge.koboldcpp.url', '').trim();
        if (url) { args.push('--url', url); }
    }
    let openRouterApiKey = '';
    if (options.provider === 'openrouter') {
        openRouterApiKey = await options.getOpenRouterApiKey();
        const apiKey = openRouterApiKey;
        if (!apiKey) {
            return { exitCode: 1, timedOut: false, stdout: '' };
        }
        const model = config.get<string>('gmBridge.openRouter.model', '').trim();
        if (model) { args.push('--model', model); }
    }

    const channel = getGmBridgeOutputChannel();
    channel.appendLine(
        `\n[${options.stageLabel}] > ${python} ${maskSensitiveFileInArgs(args, options.promptFile).join(' ')}`
    );
    if (options.playerAction) {
        channel.appendLine(`Player action: ${formatRedactedAction(options.playerAction)}\n`);
    }

    const env = buildLocalGmEnv(options.provider);
    if (options.provider === 'openrouter') {
        env.OPENROUTER_API_KEY = openRouterApiKey;
    }

    return new Promise((resolve) => {
        let stdout = '';
        let finished = false;
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            if (gmProcess) {
                gmProcess.kill();
            }
        }, options.timeoutMs);

        const finish = (exitCode: number | null) => {
            if (finished) { return; }
            finished = true;
            clearTimeout(timer);
            gmProcess = undefined;
            resolve({ exitCode, timedOut, stdout });
        };

        gmProcess = spawn(python, args, {
            cwd: options.cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env,
        });

        gmProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            stdout += text;
            if (stdout.length > GM_STREAM_BUFFER_MAX) {
                stdout = stdout.slice(-GM_STREAM_BUFFER_MAX);
            }
            channel.append(text);
        });
        gmProcess.stderr?.on('data', (data: Buffer) => channel.append(data.toString()));
        gmProcess.on('error', (err) => {
            channel.appendLine(`\n[${options.stageLabel} error: ${err.message}]`);
            finish(null);
        });
        gmProcess.on('close', (code) => {
            channel.appendLine(`\n[${options.stageLabel} exited with code ${code ?? 'unknown'}]`);
            finish(code ?? null);
        });
    });
}

const GM_STREAM_BUFFER_MAX = 64 * 1024;

/** Parse GM stdout for early BGM/SFX/imagePrompt and dispatch without blocking the GM process. */
function createGmStreamMediaTap(): { append(chunk: string): void; reset(): void } {
    let buffer = '';
    return {
        reset() {
            buffer = '';
            resetMediaStreamCache();
            clearMediaAgentCaches();
        },
        append(chunk: string) {
            buffer += chunk;
            if (buffer.length > GM_STREAM_BUFFER_MAX) {
                buffer = buffer.slice(-GM_STREAM_BUFFER_MAX);
            }
            const hints = parseGmStreamChunk(buffer);
            if (hints.bgm || hints.mood || hints.sfx || hints.imagePrompt) {
                dispatchStreamMediaHints(hints);
            }
        }
    };
}

async function invokeGrokBridge(playerAction: string): Promise<boolean> {
    const { getPanel, buildGrokPrompt } = requireDeps();
    const config = vscode.workspace.getConfiguration('textAdventure');
    if (!config.get<boolean>('grokBridge.enabled', true)) {
        return false;
    }

    const cwd = getWorkspacePath();
    if (!cwd) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return false;
    }

    const grokCmd = resolveGrokCommand(config.get<string>('grokBridge.command', 'grok') || 'grok');
    const autoApprove = config.get<boolean>('grokBridge.autoApprove', false);
    const isContinuation = grokSessionActive;
    const prompt = buildGrokPrompt(playerAction, isContinuation);
    const promptFile = writePromptFile(cwd, prompt);

    const args = ['--prompt-file', promptFile, '--cwd', cwd];
    if (autoApprove) {
        args.push('--always-approve');
    }
    if (isContinuation) {
        args.push('--continue');
    }

    const channel = getGmBridgeOutputChannel();
    channel.clear();
    channel.appendLine(`> ${grokCmd} --prompt-file <redacted-file> --cwd ${cwd}${autoApprove ? ' --always-approve' : ''}${isContinuation ? ' --continue' : ''}`);
    channel.appendLine(`Player action: ${formatRedactedAction(playerAction)}\n`);
    channel.show(true);

    getPanel()?.webview.postMessage({ type: 'gmStart' });
    postPromptContextToWebview(playerAction);
    notifyRemoteGmBusy(true);
    vscode.window.setStatusBarMessage(t('extension.status.gmProcessing'), 0);

    const mediaTap = createGmStreamMediaTap();
    mediaTap.reset();
    const prevGmState = beginGmRun();

    return new Promise((resolve) => {
        let finished = false;
        const finishGrok = (success: boolean) => {
            if (finished) { return; }
            finished = true;
            grokProcess = undefined;
            safeUnlinkPlayerActionFile(promptFile);
            vscode.window.setStatusBarMessage('');
            notifyRemoteGmBusy(false);
            getPanel()?.webview.postMessage({ type: 'gmEnd', success });
            resolve(success);
        };

        grokProcess = spawn(grokCmd, args, {
            cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env
        });

        grokProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            channel.append(text);
            mediaTap.append(text);
        });

        grokProcess.stderr?.on('data', (data: Buffer) => {
            channel.append(data.toString());
        });

        grokProcess.on('error', (err) => {
            channel.appendLine(`\n[Error: ${err.message}]`);
            finishGmRun(prevGmState, playerAction, false);
            handleGmBridgeFailure();
            vscode.window.showErrorMessage(t('extension.error.grokFailed', { message: err.message }));
            finishGrok(false);
        });

        grokProcess.on('close', (code) => {
            channel.appendLine(`\n[grok exited with code ${code ?? 'unknown'}]`);

            if (code === 0) {
                pendingDiceLedgerWritten = false;
                grokSessionActive = true;
                finishGmRun(prevGmState, playerAction, true);
                vscode.window.showInformationMessage(t('extension.info.grokDone'));
                finishGrok(true);
            } else {
                finishGmRun(prevGmState, playerAction, false);
                handleGmBridgeFailure();
                vscode.window.showWarningMessage(
                    t('extension.warning.grokExit', { code: String(code ?? 'unknown') })
                );
                finishGrok(false);
            }
        });
    });
}

async function invokeLocalLlmBridge(
    provider: 'ollama' | 'koboldcpp' | 'openrouter',
    playerAction: string
): Promise<boolean> {
    const { getPanel, getOpenRouterApiKey } = requireDeps();
    let scriptName = 'ollama_gm.py';
    if (provider === 'koboldcpp') { scriptName = 'koboldcpp_gm.py'; }
    if (provider === 'openrouter') { scriptName = 'openrouter_gm.py'; }

    const scriptPath = resolveGmBridgeScript(scriptName);
    if (!scriptPath) {
        vscode.window.showErrorMessage(
            t('extension.error.scriptNotFound', { script: scriptName })
        );
        return false;
    }

    const cwd = getWorkspacePath();
    if (!cwd) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return false;
    }

    const python = resolvePythonCommand();
    const config = vscode.workspace.getConfiguration('textAdventure');
    const actionFile = writePlayerActionFile(cwd, playerAction);
    const args = [scriptPath, '--cwd', cwd, '--action-file', actionFile, '--locale', getConfiguredLocale()];
    let openRouterApiKey = '';
    if (localGmSessionActive || grokSessionActive) {
        args.push('--continue-game');
    }

    if (provider === 'ollama') {
        const model = config.get<string>('gmBridge.ollama.model', '').trim();
        const url = config.get<string>('gmBridge.ollama.url', '').trim();
        if (model) { args.push('--model', model); }
        if (url) { args.push('--url', url); }
    } else if (provider === 'koboldcpp') {
        const url = config.get<string>('gmBridge.koboldcpp.url', '').trim();
        if (url) { args.push('--url', url); }
    } else if (provider === 'openrouter') {
        openRouterApiKey = await getOpenRouterApiKey();
        const model = config.get<string>('gmBridge.openRouter.model', '').trim();
        if (!openRouterApiKey) {
            safeUnlinkPlayerActionFile(actionFile);
            vscode.window.showErrorMessage(t('extension.error.openRouterKeyMissing'));
            return false;
        }
        if (model) { args.push('--model', model); }
    }

    const channel = getGmBridgeOutputChannel();
    channel.clear();
    channel.appendLine(`> ${python} ${maskSensitiveFileInArgs(args, actionFile).join(' ')}`);
    channel.appendLine(`Provider: ${provider}`);
    channel.appendLine(`Player action: ${formatRedactedAction(playerAction)}\n`);
    channel.show(true);

    getPanel()?.webview.postMessage({ type: 'gmStart' });
    postPromptContextToWebview(playerAction);
    notifyRemoteGmBusy(true);
    vscode.window.setStatusBarMessage(t('extension.status.gmProcessing'), 0);

    const env = buildLocalGmEnv(provider);
    if (provider === 'openrouter') {
        env.OPENROUTER_API_KEY = openRouterApiKey;
    }

    const mediaTap = createGmStreamMediaTap();
    mediaTap.reset();
    const prevGmState = beginGmRun();

    return new Promise((resolve) => {
        gmProcess = spawn(python, args, {
            cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env
        });

        gmProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            channel.append(text);
            mediaTap.append(text);
        });
        gmProcess.stderr?.on('data', (data: Buffer) => channel.append(data.toString()));

        let finished = false;
        const finishGm = (code: number | null) => {
            if (finished) { return; }
            finished = true;
            safeUnlinkPlayerActionFile(actionFile);
            gmProcess = undefined;
            vscode.window.setStatusBarMessage('');
            notifyRemoteGmBusy(false);
            getPanel()?.webview.postMessage({ type: 'gmEnd', success: code === 0 });
            channel.appendLine(`\n[${provider} exited with code ${code ?? 'unknown'}]`);

            if (code === 0) {
                pendingDiceLedgerWritten = false;
                localGmSessionActive = true;
                finishGmRun(prevGmState, playerAction, true);
                let msgKey = 'extension.info.gmDone';
                if (provider === 'ollama') { msgKey = 'extension.info.ollamaDone'; }
                if (provider === 'koboldcpp') { msgKey = 'extension.info.koboldDone'; }
                vscode.window.showInformationMessage(t(msgKey));
                resolve(true);
            } else {
                finishGmRun(prevGmState, playerAction, false);
                handleGmBridgeFailure();
                vscode.window.showWarningMessage(
                    t('extension.warning.localExit', { provider, code: String(code ?? 'unknown') })
                );
                resolve(false);
            }
        };

        gmProcess.on('error', (err) => {
            channel.appendLine(`\n[Error: ${err.message}]`);
            finishGmRun(prevGmState, playerAction, false);
            handleGmBridgeFailure();
            vscode.window.showErrorMessage(t('extension.error.gmBridgeFailed', { provider, message: err.message }));
            finishGm(null);
        });

        gmProcess.on('close', (code) => finishGm(code));
    });
}

function substituteBridgeArgs(args: string[], playerAction: string, cwd: string, actionFile?: string): string[] {
    return args.map((arg) =>
        arg
            .replace(/\{actionFile\}/g, actionFile ?? '')
            .replace(/\{action\}/g, playerAction)
            .replace(/\{cwd\}/g, cwd)
    );
}

async function invokeCustomGmBridge(playerAction: string): Promise<boolean> {
    const { getPanel } = requireDeps();
    const config = vscode.workspace.getConfiguration('textAdventure');
    const executable = config.get<string>('gmBridge.command', '').trim();
    if (!executable) {
        vscode.window.showErrorMessage(t('extension.error.gmCommandUnset'));
        return false;
    }

    const cwd = getWorkspacePath();
    if (!cwd) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return false;
    }

    const argTemplate = config.get<string[]>('gmBridge.commandArgs', ['--prompt-file', '{actionFile}', '--cwd', '{cwd}', '--always-approve']);
    const usesActionFile = argTemplate.some((arg) => arg.includes('{actionFile}'));
    const actionFile = usesActionFile ? writePlayerActionFile(cwd, playerAction) : undefined;
    const args = substituteBridgeArgs(argTemplate, playerAction, cwd, actionFile);

    const channel = getGmBridgeOutputChannel();
    channel.clear();
    channel.appendLine(`> ${executable} ${maskSensitiveFileInArgs(args, actionFile ?? '').join(' ')}`);
    channel.appendLine(`Player action: ${formatRedactedAction(playerAction)}\n`);
    channel.show(true);

    getPanel()?.webview.postMessage({ type: 'gmStart' });
    postPromptContextToWebview(playerAction);
    notifyRemoteGmBusy(true);
    vscode.window.setStatusBarMessage(t('extension.status.gmProcessing'), 0);

    const mediaTap = createGmStreamMediaTap();
    mediaTap.reset();
    const prevGmState = beginGmRun();

    return new Promise((resolve) => {
        let finished = false;
        const finishGm = (success: boolean) => {
            if (finished) { return; }
            finished = true;
            gmProcess = undefined;
            safeUnlinkPlayerActionFile(actionFile);
            vscode.window.setStatusBarMessage('');
            notifyRemoteGmBusy(false);
            getPanel()?.webview.postMessage({ type: 'gmEnd', success });
            resolve(success);
        };

        gmProcess = spawn(executable, args, {
            cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env
        });

        gmProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            channel.append(text);
            mediaTap.append(text);
        });
        gmProcess.stderr?.on('data', (data: Buffer) => channel.append(data.toString()));

        gmProcess.on('error', (err) => {
            channel.appendLine(`\n[Error: ${err.message}]`);
            finishGmRun(prevGmState, playerAction, false);
            handleGmBridgeFailure();
            vscode.window.showErrorMessage(t('extension.error.gmCommandFailed', { message: err.message }));
            finishGm(false);
        });

        gmProcess.on('close', (code) => {
            channel.appendLine(`\n[exited with code ${code ?? 'unknown'}]`);
            if (code === 0) {
                pendingDiceLedgerWritten = false;
                finishGmRun(prevGmState, playerAction, true);
                vscode.window.showInformationMessage(t('extension.info.gmDone'));
                finishGm(true);
            } else {
                finishGmRun(prevGmState, playerAction, false);
                handleGmBridgeFailure();
                vscode.window.showWarningMessage(t('extension.warning.gmCommandExit', { code: String(code ?? 'unknown') }));
                finishGm(false);
            }
        });
    });
}

// ===== vscode-lm プロバイダ =====

const VSCODE_LM_JSON_SCHEMA = `
JSON schema (output CHANGES only — LoreRelay merges into existing state):
{
  "entries": [{"id":"turn-N","role":"gm","sender":"Game Master","content":"(narrative)","imagePrompt":"(optional English scene prompt)"}],
  "status": {"location":"...","time":"...","hp":{"current":20,"max":20},"mp":{"current":10,"max":10},"condition":["..."],"inventory":["..."],"skills":["..."],"funds":"..."},
  "options": ["option1","option2","option3"],
  "theme": "fantasy",
  "bgm": "track_id",
  "mood": "tense",
  "sfx": "door_open",
  "profileUpdates": [{"characterId":"alice","dynamicProfile":"Updated memory..."}],
  "gameOver": {"active":true,"message":"Ending...","victory":false}
}
theme values: fantasy / cyberpunk / scifi / ff14 / postapoc / modern`;

const VSCODE_LM_SYSTEM_PROMPTS: Record<string, string> = {
    ja: `あなたはテキストアドベンチャーのゲームマスター（GM）です。プレイヤーの行動に対してリアルな描写・NPC反応・環境変化を返してください。\n\n【乱数ルール】公平な乱数が必要な場面では {{DICE:1d20}} のようにマーカーを出力してください。システムが実際のダイスを振ります。\n\n【出力形式】\n1. 日本語のナラティブを書く\n2. 最後に \`\`\`json ブロックを1つ付ける\n3. NPCとプレイヤーの関係性が変わった場合は profileUpdates を含める\n${VSCODE_LM_JSON_SCHEMA}`,
    en: `You are a text-adventure Game Master (GM). Respond to player actions with vivid narrative, NPC reactions, and environmental changes.\n\n[Dice] When fair randomness is needed, output markers like {{DICE:1d20}} — the system rolls real dice.\n\n[Output]\n1. Write narrative in the configured language\n2. End with one \`\`\`json block\n3. If NPC relationships change, include profileUpdates\n${VSCODE_LM_JSON_SCHEMA}`,
};

function vscodeLmSystemPrompt(locale: string): string {
    return VSCODE_LM_SYSTEM_PROMPTS[locale] ?? VSCODE_LM_SYSTEM_PROMPTS['en'];
}

function vscodeLmNextTurnId(wsPath: string): string {
    const statePath = path.join(wsPath, 'game_state.json');
    if (!fs.existsSync(statePath)) { return 'turn-1'; }
    try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        if (Array.isArray(state.entries) && state.entries.length > 0) {
            const lastId: string = state.entries[state.entries.length - 1].id ?? 'turn-0';
            const m = /turn-(\d+)$/.exec(lastId);
            if (m) { return `turn-${parseInt(m[1], 10) + 1}`; }
        }
    } catch { /* ignore */ }
    return 'turn-1';
}

function vscodeLmLoadDiceLedger(wsPath: string): DiceLedgerEntry[] | undefined {
    const ledgerPath = path.join(wsPath, 'dice_ledger.json');
    if (!fs.existsSync(ledgerPath)) {
        return undefined;
    }
    try {
        const data = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
        return Array.isArray(data) ? data as DiceLedgerEntry[] : undefined;
    } catch {
        return undefined;
    }
}

function vscodeLmProcessProfileUpdates(wsPath: string, llmJson: VscodeLmGmJson | null): void {
    const profileUpdates = llmJson?.profileUpdates;
    if (!profileUpdates || profileUpdates.length === 0) {
        return;
    }
    const dynPath = path.join(wsPath, 'characters', 'dynamic_profiles.json');
    let profiles: Record<string, string> = {};
    if (fs.existsSync(dynPath)) {
        try { profiles = JSON.parse(fs.readFileSync(dynPath, 'utf-8')); } catch { /* ignore */ }
    }
    for (const up of profileUpdates) {
        if (up.characterId && up.dynamicProfile) {
            profiles[up.characterId] = up.dynamicProfile;
        }
    }
    writeJsonAtomic(dynPath, profiles);
}

/** Write turn_result.json for the extension pipeline (no direct game_state.json merge). */
function vscodeLmWriteTurnResult(
    wsPath: string,
    fullText: string,
    locale: string,
    playerAction: string
): void {
    const statePath = path.join(wsPath, 'game_state.json');
    let prev: Record<string, unknown> = {};
    if (fs.existsSync(statePath)) {
        try { prev = JSON.parse(fs.readFileSync(statePath, 'utf-8')); } catch { /* ignore */ }
    }

    const withDice = substituteDiceMarkersSimple(fullText);
    const llmJson = extractVscodeLmJsonBlock(withDice);
    const narrative = stripVscodeLmJsonBlock(withDice);
    const turnId = vscodeLmNextTurnId(wsPath);

    vscodeLmProcessProfileUpdates(wsPath, llmJson);

    const hint = `${playerAction}\n${narrative}`;
    const triggeredLore = getTriggeredLoreLabels(hint);
    const turnResult = buildVscodeLmTurnResult({
        prev,
        llmJson,
        narrative,
        turnId,
        locale,
        playerAction,
        diceLedger: vscodeLmLoadDiceLedger(wsPath),
        triggeredLore,
    });

    writeJsonAtomic(path.join(wsPath, 'turn_result.json'), turnResult);
}

async function invokeVscodeLmBridge(playerAction: string, isContinuation: boolean): Promise<boolean> {
    const { getPanel } = requireDeps();
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return false;
    }

    const config = vscode.workspace.getConfiguration('textAdventure');
    const vendor = config.get<string>('gmBridge.vscodeLm.vendor', '').trim() || undefined;
    const family = config.get<string>('gmBridge.vscodeLm.family', '').trim() || undefined;
    const modelId = config.get<string>('gmBridge.vscodeLm.model', '').trim() || undefined;

    const selector: vscode.LanguageModelChatSelector = {};
    if (vendor) { selector.vendor = vendor; }
    if (family) { selector.family = family; }
    if (modelId) { selector.id = modelId; }

    const models = await vscode.lm.selectChatModels(Object.keys(selector).length ? selector : {});
    if (!models.length) {
        vscode.window.showErrorMessage(
            'vscode-lm: AI モデルが見つかりません。GitHub Copilot / Claude Code / Codex 等の拡張機能をインストールしてサインインしてください。'
        );
        return false;
    }
    const model = models[0];

    const locale = getConfiguredLocale();
    const systemPrompt = vscodeLmSystemPrompt(locale);
    const { buildGmPromptContext } = await import('./gmPromptBuilder');
    const context = buildGmPromptContext(playerAction);
    const turnId = vscodeLmNextTurnId(wsPath);
    const contTailJa = '上記の行動に対して1ターン進め、JSONブロックを出力してください。';
    const startTailJa = 'テキストアドベンチャーを開始し、1ターン分のナラティブとJSONを出力してください。';
    const contTailEn = 'Advance one turn for the action above and output the JSON block.';
    const startTailEn = 'Start the text adventure — output one turn of narrative and JSON.';
    const tail = locale === 'ja' ? (isContinuation ? contTailJa : startTailJa) : (isContinuation ? contTailEn : startTailEn);

    const userPrompt = [
        systemPrompt,
        '',
        locale === 'ja' ? `【今ターンの entries[0].id】 ${turnId}` : `[Expected turn ID] ${turnId}`,
        locale === 'ja' ? `【プレイヤーの行動】\n${playerAction}` : `[Player Action]\n${playerAction}`,
        context,
        '',
        tail,
    ].join('\n');

    const channel = getGmBridgeOutputChannel();
    channel.clear();
    channel.appendLine(`[vscode-lm] model=${model.name} (${model.vendor}/${model.family})`);
    channel.appendLine(`Player action: ${playerAction.slice(0, 80)}`);
    channel.show(true);

    getPanel()?.webview.postMessage({ type: 'gmStart' });
    postPromptContextToWebview(playerAction);
    notifyRemoteGmBusy(true);
    vscode.window.setStatusBarMessage(t('extension.status.gmProcessing'), 0);

    const mediaTap = createGmStreamMediaTap();
    mediaTap.reset();
    const prevGmState = beginGmRun();
    const cts = new vscode.CancellationTokenSource();
    let fullText = '';

    try {
        const response = await model.sendRequest(
            [vscode.LanguageModelChatMessage.User(userPrompt)],
            {},
            cts.token
        );
        for await (const chunk of response.stream) {
            if (chunk instanceof vscode.LanguageModelTextPart) {
                fullText += chunk.value;
                channel.append(chunk.value);
                mediaTap.append(chunk.value);
            }
        }
        channel.appendLine('\n[vscode-lm: complete]');

        vscodeLmWriteTurnResult(wsPath, fullText, locale, playerAction);

        pendingDiceLedgerWritten = false;
        localGmSessionActive = true;
        finishGmRun(prevGmState, playerAction, true);
        vscode.window.setStatusBarMessage('');
        notifyRemoteGmBusy(false);
        getPanel()?.webview.postMessage({ type: 'gmEnd', success: true });
        vscode.window.showInformationMessage('GM (vscode-lm): Done');
        return true;

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        channel.appendLine(`\n[Error: ${msg}]`);
        finishGmRun(prevGmState, playerAction, false);
        vscode.window.setStatusBarMessage('');
        notifyRemoteGmBusy(false);
        getPanel()?.webview.postMessage({ type: 'gmEnd', success: false });
        vscode.window.showErrorMessage(`vscode-lm error: ${msg}`);
        return false;
    } finally {
        cts.dispose();
    }
}

export async function invokeGmBridge(playerAction: string, diceLedger?: DiceLedgerEntry[]): Promise<boolean> {
    if (isGmBridgeBusy()) {
        vscode.window.showWarningMessage(t('extension.error.gmBusy'));
        return false;
    }
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
        vscode.window.showErrorMessage('LoreRelay: Workspace not found.');
        return false;
    }

    const provider = getGmProvider();

    pendingDiceLedgerWritten = false;
    if (diceLedger && diceLedger.length > 0) {
        writeJsonAtomic(path.join(workspacePath, 'dice_ledger.json'), diceLedger);
        pendingDiceLedgerWritten = true;
    }

    if (provider !== 'clipboard') {
        if (!vscode.workspace.isTrusted) {
            vscode.window.showWarningMessage(t('extension.error.untrustedWorkspace'));
            return false;
        }
    }

    const state = getCachedGameState();
    if (isVlmEnabled() && state && state.latestImage && !state.latestImageDescription) {
        // Enqueue VLM analysis — cache hit is sync (fast path), miss is async (non-blocking).
        enqueueVlmAnalysis(
            state.latestImage as string,
            buildVlmMetaFromGameState()
        ).catch((e) => console.error('Soulgaze VLM enqueue failed', e));
    }

    const { maybeInvokeAgenticBridge } = await import('./agenticGmRunner');
    const agentic = await maybeInvokeAgenticBridge(
        playerAction,
        diceLedger,
        requireDeps().getPanel,
        requireDeps().getOpenRouterApiKey
    );
    if (agentic.handled) {
        if (agentic.success) {
            pendingDiceLedgerWritten = false;
            return true;
        }
        if (!agentic.fallbackToSingleStage) {
            handleGmBridgeFailure();
            return false;
        }
    }

    switch (provider) {
        case 'clipboard':
            return false;
        case 'command':
            return invokeCustomGmBridge(playerAction);
        case 'ollama':
            return invokeLocalLlmBridge('ollama', playerAction);
        case 'koboldcpp':
            return invokeLocalLlmBridge('koboldcpp', playerAction);
        case 'openrouter':
            return invokeLocalLlmBridge('openrouter', playerAction);
        case 'vscode-lm':
            return invokeVscodeLmBridge(playerAction, localGmSessionActive || grokSessionActive);
        case 'grok':
        default:
            return invokeGrokBridge(playerAction);
    }
}

export async function fallbackToClipboard(text: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('textAdventure');
    if (!config.get<boolean>('grokBridge.fallbackToClipboard', true)) {
        return;
    }
    await vscode.env.clipboard.writeText(text);
    vscode.window.showInformationMessage(t('extension.info.clipboard', { text }));
}
