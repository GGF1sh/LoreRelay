import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { t } from './i18n';
import { buildGrokPrompt, postPromptContextToWebview } from './gmPromptBuilder';
import {
    buildFallbackNarration,
    buildNarratorPrompt,
    buildRefereePrompt,
    MAX_AGENTIC_TEXT_BYTES,
    mergeAgenticTurnResult,
    parseNarratorResultJson,
    parseRefereeResultJson,
    suggestNextTurnId,
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
    getGmBridgeOutputChannel,
    runGrokPromptFile,
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

export async function maybeInvokeAgenticBridge(
    playerAction: string,
    diceLedger: DiceLedgerEntry[] | undefined,
    getPanel: () => vscode.WebviewPanel | undefined
): Promise<AgenticBridgeResult> {
    const agenticCfg = getAgenticConfig();
    if (!agenticCfg.enabled) {
        return { handled: false, success: false, fallbackToSingleStage: true };
    }

    const provider = getGmProvider();
    if (provider !== 'grok') {
        return { handled: false, success: false, fallbackToSingleStage: true };
    }

    const config = vscode.workspace.getConfiguration('textAdventure');
    if (!config.get<boolean>('grokBridge.enabled', true)) {
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
    const suggestedTurnId = loadSuggestedTurnId(cwd);
    const basePrompt = buildGrokPrompt(playerAction, false);
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

    channel.appendLine('\n[Agentic GM] State Referee stage starting...');
    getPanel()?.webview.postMessage({ type: 'gmStart' });
    postPromptContextToWebview(playerAction);
    notifyRemoteGmBusy(true);
    vscode.window.setStatusBarMessage('Agentic GM: State Referee...', 0);

    const prevGmState = beginGmRun();

    try {
        const refereeRun = await runGrokPromptFile({
            cwd,
            promptFile: refereePromptFile,
            continueSession: false,
            timeoutMs: agenticCfg.stageTimeoutMs,
            stageLabel: 'State Referee',
            playerAction,
        });

        if (refereeRun.timedOut || refereeRun.exitCode !== 0) {
            finishGmRun(prevGmState, playerAction, false);
            notifyRemoteGmBusy(false);
            vscode.window.setStatusBarMessage('');
            getPanel()?.webview.postMessage({ type: 'gmEnd', success: false });
            return {
                handled: true,
                success: false,
                fallbackToSingleStage: agenticCfg.fallbackToSingleStage,
                fallbackReason: refereeRun.timedOut ? 'referee timeout' : `referee exit ${refereeRun.exitCode}`,
            };
        }

        const referee = readStageCandidate(
            refereeResultPath,
            refereeRun.stdout,
            parseRefereeResultJson
        );
        if (!referee) {
            finishGmRun(prevGmState, playerAction, false);
            notifyRemoteGmBusy(false);
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
        vscode.window.setStatusBarMessage('Agentic GM: Narrator...', 0);

        const narratorPrompt = buildNarratorPrompt({
            basePrompt,
            playerAction,
            referee,
        });
        writeAgenticText(cwd, 'narrator_prompt.md', narratorPrompt);
        const narratorPromptFile = writePromptFile(cwd, narratorPrompt);
        const narratorResultPath = path.join(agenticDir, 'narrator_result.json');

        const narratorRun = await runGrokPromptFile({
            cwd,
            promptFile: narratorPromptFile,
            continueSession: false,
            timeoutMs: agenticCfg.stageTimeoutMs,
            stageLabel: 'Narrator',
            playerAction,
        });

        safeUnlinkPlayerActionFile(narratorPromptFile);

        let narrator = null;
        if (!narratorRun.timedOut && narratorRun.exitCode === 0) {
            narrator = readStageCandidate(
                narratorResultPath,
                narratorRun.stdout,
                parseNarratorResultJson
            );
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
        });
        if (!merged.ok || !merged.result) {
            finishGmRun(prevGmState, playerAction, false);
            notifyRemoteGmBusy(false);
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

        finishGmRun(prevGmState, playerAction, true);
        notifyRemoteGmBusy(false);
        vscode.window.setStatusBarMessage('');
        getPanel()?.webview.postMessage({ type: 'gmEnd', success: true });
        channel.appendLine('[Agentic GM] Final turn_result.json written.');
        vscode.window.showInformationMessage(t('extension.info.grokDone'));
        return { handled: true, success: true, fallbackToSingleStage: agenticCfg.fallbackToSingleStage };
    } finally {
        safeUnlinkPlayerActionFile(refereePromptFile);
    }
}