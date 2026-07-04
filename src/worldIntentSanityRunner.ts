// World Intent WI5b: opt-in workspace sanity check command (read-only).

import * as vscode from 'vscode';
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
    channel.clear();
    for (const line of formatWorldSanityReportLines(report, sources)) {
        channel.appendLine(line);
    }
    channel.show(true);
}

/** Opt-in command: load workspace ledgers, run WI5 report, show Output Channel. */
export async function runWorkspaceSanityCheckCommand(): Promise<WorldSanityReport | undefined> {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        void vscode.window.showWarningMessage('LoreRelay: Open a workspace folder before running the sanity check.');
        return undefined;
    }

    const snapshot = readWorkspaceSanitySnapshot(wsPath, {
        vehicleBridgeMode: readVehicleBridgeModeFromConfig(),
    });
    const report = runWorkspaceSanityCheckFromSnapshot(snapshot);
    emitWorkspaceSanityReport(report, snapshot.sources);

    const status = report.ok
        ? `LoreRelay: Workspace sanity OK (${report.issueCount} issues). See "LoreRelay World Intent" output.`
        : `LoreRelay: Workspace sanity found ${report.errorCount} error(s), ${report.warningCount} warning(s). See "LoreRelay World Intent" output.`;
    if (report.ok && report.warningCount === 0) {
        void vscode.window.showInformationMessage(status);
    } else if (report.ok) {
        void vscode.window.showWarningMessage(status);
    } else {
        void vscode.window.showErrorMessage(status);
    }

    return report;
}