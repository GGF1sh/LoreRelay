// State Orchestrator SO2b: opt-in GM-turn transaction plan preview command (read-only).

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { t } from './i18n';
import { loadGameRules } from './gameRules';
import { getWorkspacePath } from './workspacePaths';
import {
    buildGmTurnTransactionPlanFromTurnResult,
    formatGmTurnTransactionPlanReportLines,
    type GmTurnPlanTurnResultInput,
} from './stateOrchestratorPlanHostCore';
import type { StateTransactionPlan } from './stateOrchestratorPlanCore';
import { formatWorldStateParseWarning } from './worldStateCore';
import { loadWorldState, peekLastWorldStateParseWarnings } from './worldState';
import {
    buildTransactionExecutionSequence,
    generateStateOrchestratorMermaid,
    type TransactionExecutionResult
} from './stateOrchestratorExecutorCore';

const TURN_RESULT_FILENAME = 'turn_result.json';

let outputChannel: vscode.OutputChannel | undefined;
let getWebviewPanel: (() => vscode.WebviewPanel | undefined) | undefined;
let lastBuiltPlan: StateTransactionPlan | undefined;
let lastExecutionResult: TransactionExecutionResult | undefined;

export function initStateOrchestratorPlanRunner(deps: { getPanel: () => vscode.WebviewPanel | undefined }): void {
    getWebviewPanel = deps.getPanel;
}

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('LoreRelay State Orchestrator');
    }
    return outputChannel;
}

function sendStateOrchestratorUpdateToWebview(): void {
    const webviewPanel = getWebviewPanel?.();
    if (!webviewPanel) { return; }
    if (!lastBuiltPlan) { return; }
    const mermaidCode = generateStateOrchestratorMermaid(lastBuiltPlan, lastExecutionResult);
    webviewPanel.webview.postMessage({
        type: 'stateOrchestratorUpdate',
        mermaid: mermaidCode,
        status: lastExecutionResult ? lastExecutionResult.status : 'planned',
        errorMessage: lastExecutionResult?.errorMessage
    });
}

type TurnResultReadResult =
    | { ok: true; data: GmTurnPlanTurnResultInput }
    | { ok: false; reason: 'missing' | 'invalid_json' | 'invalid_shape' };

function readTurnResultFile(wsPath: string): TurnResultReadResult {
    const filePath = path.join(wsPath, TURN_RESULT_FILENAME);
    if (!fs.existsSync(filePath)) {
        return { ok: false, reason: 'missing' };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { ok: false, reason: 'invalid_shape' };
        }
        return { ok: true, data: raw as GmTurnPlanTurnResultInput };
    } catch {
        return { ok: false, reason: 'invalid_json' };
    }
}

export function emitGmTurnTransactionPlanReport(plan: StateTransactionPlan): void {
    const channel = getOutputChannel();
    const worldStateParseWarnings = peekLastWorldStateParseWarnings().map(formatWorldStateParseWarning);
    channel.appendLine('');
    channel.appendLine('--- SO2 GM-turn transaction plan preview ---');
    for (const line of formatGmTurnTransactionPlanReportLines(plan, { worldStateParseWarnings })) {
        channel.appendLine(line);
    }
    channel.show(true);
}

/** Opt-in command: read turn_result.json, build SO2 plan, show Output Channel. */
export async function runPreviewGmTurnTransactionPlanCommand(): Promise<StateTransactionPlan | undefined> {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        void vscode.window.showWarningMessage(t('extension.warning.gmTurnPlanNoFolder'));
        return undefined;
    }

    const read = readTurnResultFile(wsPath);
    if (!read.ok) {
        if (read.reason === 'missing') {
            void vscode.window.showWarningMessage(t('extension.warning.gmTurnPlanNoTurnResult'));
        } else {
            void vscode.window.showErrorMessage(t('extension.error.gmTurnPlanInvalidTurnResult'));
        }
        return undefined;
    }

    void loadWorldState();

    const rules = loadGameRules();
    const plan = buildGmTurnTransactionPlanFromTurnResult(read.data, rules);
    lastBuiltPlan = plan;
    lastExecutionResult = undefined; // reset status on new plan

    emitGmTurnTransactionPlanReport(plan);
    sendStateOrchestratorUpdateToWebview();

    const plannedCount = plan.steps.filter((step) => step.status === 'planned').length;
    void vscode.window.showInformationMessage(
        t('extension.info.gmTurnPlanComplete', { plannedCount: String(plannedCount) })
    );

    return plan;
}

/** Trigger retry of failed transaction actions */
export async function runRetryFailedTransactionsCommand(): Promise<void> {
    vscode.window.showInformationMessage('State Orchestrator retry is queued automatically for queue_retry ledgers; no manual retry is available yet.');
    sendStateOrchestratorUpdateToWebview();
}
