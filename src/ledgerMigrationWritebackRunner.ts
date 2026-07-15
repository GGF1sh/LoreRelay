// World Intent WI7: explicit user-confirmed vehicle_state migration write-back command.

import * as vscode from 'vscode';
import { t } from './i18n';
import { buildWorkspaceMigrationPreview } from './ledgerMigrationLoader';
import {
    formatWorkspaceMigrationPreviewLines,
} from './ledgerMigrationHostCore';
import {
    formatWritebackReportLines,
    VEHICLE_STATE_WRITEBACK_FROM_VERSION,
    VEHICLE_STATE_WRITEBACK_TO_VERSION,
} from './ledgerMigrationWritebackCore';
import {
    applyVehicleStateMigrationWriteback,
    prepareVehicleStateWriteback,
} from './ledgerMigrationWritebackHost';
import { clearVehicleStateCache } from './vehicleState';
import { getWorkspacePath } from './workspacePaths';

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('LoreRelay World Intent');
    }
    return outputChannel;
}

function workspaceDisplayName(wsPath: string): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) { return undefined; }
    const match = folders.find((folder) => folder.uri.fsPath === wsPath);
    return match?.name ?? undefined;
}

function emitWritebackReport(
    workspaceName: string | undefined,
    result: ReturnType<typeof applyVehicleStateMigrationWriteback>
): void {
    const channel = getOutputChannel();
    for (const line of formatWritebackReportLines({
        workspaceName,
        outcome: result.outcome,
        reasonCode: result.reasonCode,
        backupFileRel: result.backupFileRel,
        backupCreated: result.backupCreated,
    })) {
        channel.appendLine(line);
    }
    channel.show(true);
}

function emitPostSuccessPreview(wsPath: string, workspaceName: string | undefined): void {
    const channel = getOutputChannel();
    const report = buildWorkspaceMigrationPreview(wsPath, {
        workspaceName,
        generatedAt: new Date().toISOString(),
    });
    channel.appendLine('');
    channel.appendLine('--- WI6b post-write migration preview ---');
    for (const line of formatWorkspaceMigrationPreviewLines(report)) {
        channel.appendLine(line);
    }
}

/** Opt-in command: apply vehicle_state v0 -> v1 with confirmation, backup, and validation. */
export async function runApplyVehicleStateMigrationCommand(): Promise<void> {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        void vscode.window.showWarningMessage(t('extension.warning.applyVehicleMigrationNoFolder'));
        return;
    }

    const workspaceName = workspaceDisplayName(wsPath);
    const prepared = prepareVehicleStateWriteback(wsPath);
    if (prepared.outcome !== 'success') {
        emitWritebackReport(workspaceName, prepared);
        void vscode.window.showWarningMessage(t('extension.warning.applyVehicleMigrationAborted', {
            reason: prepared.reasonCode ?? 'not_eligible',
        }));
        return;
    }

    const confirmLabel = t('extension.action.applyVehicleMigration');
    const cancelLabel = t('extension.action.cancel');
    const choice = await vscode.window.showWarningMessage(
        t('extension.warning.applyVehicleMigrationConfirm', {
            fromVersion: String(VEHICLE_STATE_WRITEBACK_FROM_VERSION),
            toVersion: String(VEHICLE_STATE_WRITEBACK_TO_VERSION),
        }),
        { modal: true },
        confirmLabel,
        cancelLabel
    );

    if (choice !== confirmLabel) {
        const cancelled = {
            outcome: 'aborted' as const,
            reasonCode: 'user_cancelled' as const,
            backupCreated: false,
        };
        emitWritebackReport(workspaceName, cancelled);
        return;
    }

    const result = applyVehicleStateMigrationWriteback(wsPath, {
        clearVehicleStateCache,
    });
    emitWritebackReport(workspaceName, result);

    if (result.outcome === 'success') {
        emitPostSuccessPreview(wsPath, workspaceName);
        void vscode.window.showInformationMessage(t('extension.info.applyVehicleMigrationSuccess', {
            backup: result.backupFileRel ?? '',
        }));
        return;
    }

    if (result.outcome === 'write_failed') {
        void vscode.window.showErrorMessage(t('extension.error.applyVehicleMigrationWriteFailed', {
            reason: result.reasonCode ?? 'write_failed',
            backup: result.backupFileRel ?? '',
        }));
        return;
    }

    void vscode.window.showWarningMessage(t('extension.warning.applyVehicleMigrationAborted', {
        reason: result.reasonCode ?? 'not_eligible',
    }));
}
