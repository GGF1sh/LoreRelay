// Explicit user command for the one-way v1 -> v2 Gameplay Spine vehicle document upgrade.

import * as vscode from 'vscode';
import { upgradeVehicleStateForGameplaySpine } from './gameplaySpineVehicleRepairCommitHost';
import { getWorkspacePath } from './workspacePaths';

export async function runUpgradeVehicleStateForGameplaySpineCommand(): Promise<void> {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
        void vscode.window.showWarningMessage('Open a workspace before upgrading vehicle state.');
        return;
    }
    const confirm = 'Upgrade Vehicle State';
    const choice = await vscode.window.showWarningMessage(
        'Upgrade vehicle_state.json from v1 to v2 for the Gameplay Spine? A strict backup is required first.',
        { modal: true }, confirm
    );
    if (choice !== confirm) { return; }
    const result = upgradeVehicleStateForGameplaySpine(workspacePath);
    if (result.status === 'migrated') {
        void vscode.window.showInformationMessage('Vehicle state upgraded for Gameplay Spine.');
    } else if (result.status === 'already_current') {
        void vscode.window.showInformationMessage('Vehicle state is already Gameplay Spine v2.');
    } else {
        void vscode.window.showErrorMessage(`Vehicle state upgrade failed: ${result.reasonCode ?? result.status}`);
    }
}
