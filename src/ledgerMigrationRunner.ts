// World Intent WI6b: opt-in workspace migration preview command (read-only).

import * as vscode from 'vscode';
import { t } from './i18n';
import {
    formatWorkspaceMigrationPreviewLines,
    type WorkspaceMigrationPreviewReport,
} from './ledgerMigrationHostCore';
import { buildWorkspaceMigrationPreview } from './ledgerMigrationLoader';
import { getWorkspacePath } from './workspacePaths';

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('LoreRelay World Intent');
    }
    return outputChannel;
}

export function emitWorkspaceMigrationPreview(report: WorkspaceMigrationPreviewReport): void {
    const channel = getOutputChannel();
    channel.appendLine('');
    channel.appendLine('--- WI6b workspace migration preview ---');
    for (const line of formatWorkspaceMigrationPreviewLines(report)) {
        channel.appendLine(line);
    }
    channel.show(true);
}

function workspaceDisplayName(wsPath: string): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) { return undefined; }
    const match = folders.find((folder) => folder.uri.fsPath === wsPath);
    return match?.name ?? undefined;
}

/** Opt-in command: preview known ledger migrations without writing files. */
export async function runPreviewWorkspaceMigrationsCommand(): Promise<WorkspaceMigrationPreviewReport | undefined> {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        void vscode.window.showWarningMessage(t('extension.warning.migrationPreviewNoFolder'));
        return undefined;
    }

    const report = buildWorkspaceMigrationPreview(wsPath, {
        workspaceName: workspaceDisplayName(wsPath),
        generatedAt: new Date().toISOString(),
    });
    emitWorkspaceMigrationPreview(report);

    const { totals } = report;
    const actionable = totals.migratable + totals.blocked + totals.invalid + totals.unsupported + totals.readError;
    if (actionable === 0 && totals.missing === report.entries.length) {
        void vscode.window.showInformationMessage(t('extension.info.migrationPreviewAllMissing'));
    } else if (totals.migratable > 0) {
        void vscode.window.showWarningMessage(t('extension.warning.migrationPreviewMigratable', {
            count: String(totals.migratable),
        }));
    } else {
        void vscode.window.showInformationMessage(t('extension.info.migrationPreviewComplete'));
    }

    return report;
}