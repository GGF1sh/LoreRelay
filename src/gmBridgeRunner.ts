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
import { getWorkspacePath, getGmProvider } from './workspacePaths';
import {
    buildLocalGmEnv,
    resolveGmBridgeScript,
    resolvePythonCommand
} from './skillScriptRunner';

let grokOutputChannel: vscode.OutputChannel | undefined;
let grokProcess: ChildProcess | undefined;
let gmProcess: ChildProcess | undefined;
let grokSessionActive = false;
let localGmSessionActive = false;

export interface GmBridgeRunnerDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
    buildGrokPrompt: (playerAction: string, isContinuation: boolean) => string;
    getOpenRouterApiKey: () => Promise<string>;
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
        grokOutputChannel = vscode.window.createOutputChannel('Text Adventure: GM Bridge');
    }
    return grokOutputChannel;
}

function resolveGrokCommand(configured: string): string {
    if (configured && configured !== 'grok') {
        return configured;
    }
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const winPath = path.join(home, '.grok', 'bin', 'grok.exe');
    if (process.platform === 'win32' && fs.existsSync(winPath)) {
        return winPath;
    }
    return 'grok';
}

export function isGmBridgeBusy(): boolean {
    return Boolean(grokProcess || gmProcess);
}

export function killGmBridgeProcesses(): void {
    if (grokProcess) {
        grokProcess.kill();
        grokProcess = undefined;
    }
    if (gmProcess) {
        gmProcess.kill();
        gmProcess = undefined;
    }
}

export function resetGmBridgeSessions(): void {
    grokSessionActive = false;
    localGmSessionActive = false;
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

    if (grokProcess || gmProcess) {
        vscode.window.showWarningMessage(t('extension.error.gmBusy'));
        return false;
    }

    const grokCmd = resolveGrokCommand(config.get<string>('grokBridge.command', 'grok') || 'grok');
    const autoApprove = config.get<boolean>('grokBridge.autoApprove', true);
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
    vscode.window.setStatusBarMessage(t('extension.status.gmProcessing'), 0);

    return new Promise((resolve) => {
        grokProcess = spawn(grokCmd, args, {
            cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env
        });

        grokProcess.stdout?.on('data', (data: Buffer) => {
            channel.append(data.toString());
        });

        grokProcess.stderr?.on('data', (data: Buffer) => {
            channel.append(data.toString());
        });

        grokProcess.on('error', (err) => {
            grokProcess = undefined;
            safeUnlinkPlayerActionFile(promptFile);
            vscode.window.setStatusBarMessage('');
            getPanel()?.webview.postMessage({ type: 'gmEnd', success: false });
            channel.appendLine(`\n[Error: ${err.message}]`);
            vscode.window.showErrorMessage(t('extension.error.grokFailed', { message: err.message }));
            resolve(false);
        });

        grokProcess.on('close', (code) => {
            grokProcess = undefined;
            safeUnlinkPlayerActionFile(promptFile);
            vscode.window.setStatusBarMessage('');
            getPanel()?.webview.postMessage({ type: 'gmEnd', success: code === 0 });
            channel.appendLine(`\n[grok exited with code ${code ?? 'unknown'}]`);

            if (code === 0) {
                grokSessionActive = true;
                vscode.window.showInformationMessage(t('extension.info.grokDone'));
                resolve(true);
            } else {
                vscode.window.showWarningMessage(
                    t('extension.warning.grokExit', { code: String(code ?? 'unknown') })
                );
                resolve(false);
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

    if (gmProcess || grokProcess) {
        vscode.window.showWarningMessage(t('extension.error.gmBusy'));
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
    vscode.window.setStatusBarMessage(t('extension.status.gmProcessing'), 0);

    const env = buildLocalGmEnv(provider);
    if (provider === 'openrouter') {
        env.OPENROUTER_API_KEY = openRouterApiKey;
    }

    return new Promise((resolve) => {
        gmProcess = spawn(python, args, {
            cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env
        });

        gmProcess.stdout?.on('data', (data: Buffer) => channel.append(data.toString()));
        gmProcess.stderr?.on('data', (data: Buffer) => channel.append(data.toString()));

        const finishGm = (code: number | null) => {
            safeUnlinkPlayerActionFile(actionFile);
            gmProcess = undefined;
            vscode.window.setStatusBarMessage('');
            getPanel()?.webview.postMessage({ type: 'gmEnd', success: code === 0 });
            channel.appendLine(`\n[${provider} exited with code ${code ?? 'unknown'}]`);

            if (code === 0) {
                localGmSessionActive = true;
                let msgKey = 'extension.info.gmDone';
                if (provider === 'ollama') { msgKey = 'extension.info.ollamaDone'; }
                if (provider === 'koboldcpp') { msgKey = 'extension.info.koboldDone'; }
                vscode.window.showInformationMessage(t(msgKey));
                resolve(true);
            } else {
                vscode.window.showWarningMessage(
                    t('extension.warning.localExit', { provider, code: String(code ?? 'unknown') })
                );
                resolve(false);
            }
        };

        gmProcess.on('error', (err) => {
            channel.appendLine(`\n[Error: ${err.message}]`);
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

    if (gmProcess || grokProcess) {
        vscode.window.showWarningMessage(t('extension.error.gmBusy'));
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
    vscode.window.setStatusBarMessage(t('extension.status.gmProcessing'), 0);

    return new Promise((resolve) => {
        gmProcess = spawn(executable, args, {
            cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env
        });

        gmProcess.stdout?.on('data', (data: Buffer) => channel.append(data.toString()));
        gmProcess.stderr?.on('data', (data: Buffer) => channel.append(data.toString()));

        gmProcess.on('error', (err) => {
            gmProcess = undefined;
            safeUnlinkPlayerActionFile(actionFile);
            vscode.window.setStatusBarMessage('');
            getPanel()?.webview.postMessage({ type: 'gmEnd', success: false });
            channel.appendLine(`\n[Error: ${err.message}]`);
            vscode.window.showErrorMessage(t('extension.error.gmCommandFailed', { message: err.message }));
            resolve(false);
        });

        gmProcess.on('close', (code) => {
            gmProcess = undefined;
            safeUnlinkPlayerActionFile(actionFile);
            vscode.window.setStatusBarMessage('');
            getPanel()?.webview.postMessage({ type: 'gmEnd', success: code === 0 });
            channel.appendLine(`\n[exited with code ${code ?? 'unknown'}]`);
            if (code === 0) {
                vscode.window.showInformationMessage(t('extension.info.gmDone'));
                resolve(true);
            } else {
                vscode.window.showWarningMessage(t('extension.warning.gmCommandExit', { code: String(code ?? 'unknown') }));
                resolve(false);
            }
        });
    });
}

export async function invokeGmBridge(playerAction: string): Promise<boolean> {
    const provider = getGmProvider();
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