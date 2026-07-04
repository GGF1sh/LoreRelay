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

const TURN_RESULT_FILENAME = 'turn_result.json';

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('LoreRelay State Orchestrator');
    }
    return outputChannel;
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
    emitGmTurnTransactionPlanReport(plan);

    const plannedCount = plan.steps.filter((step) => step.status === 'planned').length;
    void vscode.window.showInformationMessage(
        t('extension.info.gmTurnPlanComplete', { plannedCount: String(plannedCount) })
    );

    return plan;
}