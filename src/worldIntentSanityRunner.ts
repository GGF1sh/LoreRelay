// World Intent WI5b: opt-in workspace sanity check command (read-only).

import * as vscode from 'vscode';
import { t } from './i18n';
import { getWorkspacePath } from './workspacePaths';
import {
    formatWorldSanityReportLines,
    runWorkspaceSanityCheckFromSnapshot,
    type WorkspaceSanitySources,
} from './worldIntentSanityHostCore';
import { readWorkspaceSanitySnapshot } from './worldIntentSanityLoader';
import type { WorldSanityReport } from './worldIntentSanityCore';

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('LoreRelay World Intent');
    }
    return outputChannel;
}

function readVehicleBridgeModeFromConfig(): unknown {
    try {
        return vscode.workspace.getConfiguration('textAdventure').get('worldIntent.vehicleBridgeMode');
    } catch {
        return undefined;
    }
}

export function emitWorkspaceSanityReport(
    report: WorldSanityReport,
    sources?: WorkspaceSanitySources
): void {
    const channel = getOutputChannel();
    channel.appendLine('');
    channel.appendLine('--- WI5b workspace sanity check ---');
    for (const line of formatWorldSanityReportLines(report, sources)) {
        channel.appendLine(line);
    }
    channel.show(true);
}

/** Opt-in command: load workspace ledgers, run WI5 report, show Output Channel. */
export async function runWorkspaceSanityCheckCommand(): Promise<WorldSanityReport | undefined> {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        void vscode.window.showWarningMessage(t('extension.warning.workspaceSanityNoFolder'));
        return undefined;
    }

    const snapshot = readWorkspaceSanitySnapshot(wsPath, {
        vehicleBridgeMode: readVehicleBridgeModeFromConfig(),
    });
    const report = runWorkspaceSanityCheckFromSnapshot(snapshot);
    emitWorkspaceSanityReport(report, snapshot.sources);

    const status = report.ok
        ? t('extension.info.workspaceSanityOk', { issueCount: String(report.issueCount) })
        : t('extension.error.workspaceSanityIssues', {
            errorCount: String(report.errorCount),
            warningCount: String(report.warningCount),
        });
    if (report.ok && report.warningCount === 0) {
        void vscode.window.showInformationMessage(status);
    } else if (report.ok) {
        void vscode.window.showWarningMessage(status);
    } else {
        void vscode.window.showErrorMessage(status);
    }

    return report;
}