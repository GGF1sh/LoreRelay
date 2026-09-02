import * as vscode from 'vscode';
import { loadScenarioPack, validateScenarioPack, exportScenarioPack } from '../scenarioPack';
import { importTavernCard } from '../tavernCardImporter';
// importStLorebook will be moved or imported
import { runListImageModels, runScanLocalModelFiles } from '../imageGenRunner';
import { checkForUpdates } from '../updateManager';

export function registerCoreCommands(
    context: vscode.ExtensionContext,
    importStLorebook: () => void,
    requireMutationAllowed: () => Promise<boolean>,
) {
    const listModelsCmd = vscode.commands.registerCommand('textadventure.listImageModels', () => {
        runListImageModels();
    });

    const scanLocalModelsCmd = vscode.commands.registerCommand('textadventure.scanLocalModels', () => {
        runScanLocalModelFiles();
    });

    const loadScenarioCmd = vscode.commands.registerCommand('textadventure.loadScenario', async () => {
        if (await requireMutationAllowed()) await loadScenarioPack();
    });

    const importStCharCmd = vscode.commands.registerCommand('textadventure.importStCharacter', async () => {
        if (await requireMutationAllowed()) await importTavernCard();
    });

    const importStLoreCmd = vscode.commands.registerCommand('textadventure.importStLorebook', async () => {
        if (await requireMutationAllowed()) importStLorebook();
    });

    const exportScenarioCmd = vscode.commands.registerCommand('textadventure.exportScenario', () => {
        exportScenarioPack();
    });

    const validateScenarioCmd = vscode.commands.registerCommand('textadventure.validateScenario', () => {
        validateScenarioPack();
    });

    const checkForUpdatesCmd = vscode.commands.registerCommand('textadventure.checkForUpdates', () => {
        void checkForUpdates(false, context);
    });

    context.subscriptions.push(
        listModelsCmd,
        scanLocalModelsCmd,
        loadScenarioCmd,
        importStCharCmd,
        importStLoreCmd,
        exportScenarioCmd,
        validateScenarioCmd,
        checkForUpdatesCmd
    );
}
