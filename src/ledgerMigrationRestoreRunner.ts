// World Intent WI7b: explicit user-selected vehicle_state migration backup restore command.

import * as vscode from 'vscode';
import { t } from './i18n';
import {
    formatMigrationBackupQuickPickLabel,
    formatRestoreReportLines,
} from './ledgerMigrationRestoreCore';
import {
    listVehicleStateMigrationBackups,
    restoreVehicleStateMigrationBackup,
} from './ledgerMigrationRestoreHost';
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

function emitRestoreReport(
    workspaceName: string | undefined,
    result: Parameters<typeof formatRestoreReportLines>[0]
): void {
    const channel = getOutputChannel();
    channel.appendLine('');
    for (const line of formatRestoreReportLines({
        workspaceName,
        ...result,
    })) {
        channel.appendLine(line);
    }
    channel.show(true);
}

/** Opt-in command: restore vehicle_state.json from a WI7 migration backup. */
export async function runRestoreVehicleStateMigrationBackupCommand(): Promise<void> {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        void vscode.window.showWarningMessage(t('extension.warning.restoreVehicleMigrationNoFolder'));
        return;
    }

    const workspaceName = workspaceDisplayName(wsPath);
    const { candidates } = listVehicleStateMigrationBackups(wsPath);
    if (candidates.length === 0) {
        emitRestoreReport(workspaceName, {
            outcome: 'aborted',
            reasonCode: 'no_backups',
        });
        void vscode.window.showInformationMessage(t('extension.info.restoreVehicleMigrationNoBackups'));
        return;
    }

    const pick = await vscode.window.showQuickPick(
        candidates.map((candidate) => ({
            label: formatMigrationBackupQuickPickLabel(candidate),
            description: candidate.backupDirRel,
            candidate,
        })),
        {
            placeHolder: t('extension.prompt.restoreVehicleMigrationSelectBackup'),
            matchOnDescription: true,
        }
    );
    if (!pick) {
        emitRestoreReport(workspaceName, {
            outcome: 'aborted',
            reasonCode: 'user_dismissed_selection',
        });
        return;
    }

    const restoreLabel = t('extension.action.restoreVehicleMigration');
    const cancelLabel = t('extension.action.cancel');
    const choice = await vscode.window.showWarningMessage(
        t('extension.warning.restoreVehicleMigrationConfirm', {
            timestamp: pick.candidate.timestamp,
            fromVersion: String(pick.candidate.meta.fromVersion),
            toVersion: String(pick.candidate.meta.toVersion),
        }),
        { modal: true },
        restoreLabel,
        cancelLabel
    );
    if (choice !== restoreLabel) {
        emitRestoreReport(workspaceName, {
            outcome: 'aborted',
            reasonCode: 'user_cancelled',
        });
        return;
    }

    const result = restoreVehicleStateMigrationBackup(wsPath, pick.candidate.timestamp, {
        clearVehicleStateCache,
    });
    emitRestoreReport(workspaceName, {
        outcome: result.outcome,
        reasonCode: result.reasonCode,
        restoredFromRel: result.restoredFromRel,
        preRestoreBackupRel: result.preRestoreBackupRel,
        preRestoreBackupCreated: result.preRestoreBackupCreated,
    });

    if (result.outcome === 'success') {
        void vscode.window.showInformationMessage(t('extension.info.restoreVehicleMigrationSuccess', {
            backup: result.restoredFromRel ?? '',
        }));
        return;
    }

    if (result.outcome === 'write_failed') {
        void vscode.window.showErrorMessage(t('extension.error.restoreVehicleMigrationWriteFailed', {
            reason: result.reasonCode ?? 'write_failed',
            preBackup: result.preRestoreBackupRel ?? '',
        }));
        return;
    }

    void vscode.window.showWarningMessage(t('extension.warning.restoreVehicleMigrationAborted', {
        reason: result.reasonCode ?? 'invalid_meta',
    }));
}
