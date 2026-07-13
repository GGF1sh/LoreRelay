import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    buildDebugCommandContext,
    executeDebugScenarioTurn,
    isActiveDebugScenario,
} from './debugScenarioRunnerCore';
import { checkPendingTurnResultFile } from './gameStateSync';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';

export { isActiveDebugScenario } from './debugScenarioRunnerCore';

/** Try to handle player input as a debug-sandbox command. Returns true if handled (no GM call). */
export async function tryExecuteDebugScenarioCommand(
    playerAction: string,
    presentationOptions: readonly string[] = []
): Promise<boolean> {
    const wsPath = getWorkspacePath();
    if (!wsPath || !isActiveDebugScenario(wsPath)) {
        return false;
    }

    const ctx = buildDebugCommandContext(wsPath);
    if (!ctx) {
        return false;
    }

    const result = executeDebugScenarioTurn(wsPath, playerAction, ctx, presentationOptions);
    if (!result.handled) {
        return false;
    }

    if (result.turnResult) {
        writeJsonAtomic(path.join(wsPath, 'turn_result.json'), result.turnResult);
        await checkPendingTurnResultFile();
    }

    if (result.infoMessage) {
        vscode.window.showInformationMessage(result.infoMessage);
    }
    if (result.warningMessage) {
        vscode.window.showWarningMessage(result.warningMessage);
    }

    return true;
}
