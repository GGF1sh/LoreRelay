import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseBrowserSetup } from './browserSetupCore';
import { loadScenarioPackFromDir } from './scenarioPack';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { clearGameRulesCache } from './gameRules';

let running = false;

function readOwnedFile(file: string, maxBytes: number): string {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maxBytes) {
        throw new Error(`${path.basename(file)}: expected a regular file (maximum ${maxBytes} bytes)`);
    }
    return fs.readFileSync(file, 'utf8');
}

/** Only launcher-created, empty, trusted workspaces can receive a new campaign. */
export async function initializeBrowserAdventure(context: vscode.ExtensionContext): Promise<void> {
    if (running || !vscode.workspace.isTrusted || vscode.workspace.workspaceFolders?.length !== 1) return;
    const root = getWorkspacePath();
    if (!root) return;
    const markerPath = path.join(root, 'lorerelay-start.json');
    if (!fs.existsSync(markerPath)) return;
    running = true;
    let claimed = false;
    try {
        const marker = JSON.parse(readOwnedFile(markerPath, 4096));
        if (marker.format !== 'lorerelay-launch/1' || !['pending', 'initializing', 'failed', 'complete'].includes(marker.status)) {
            throw new Error('lorerelay-start.json: unsupported launcher marker');
        }
        if (marker.status === 'complete') {
            if (!fs.existsSync(path.join(root, 'game_state.json'))) throw new Error('Saved adventure is missing. Start a new adventure from the launcher.');
            await vscode.commands.executeCommand('textadventure.openGame');
            return;
        }
        if (marker.status !== 'pending') {
            throw new Error('Previous import did not finish. The input is preserved. Start it again with LoreRelay_Start.bat to create a new folder.');
        }
        if (fs.lstatSync(root).isSymbolicLink() || fs.readdirSync(root).some(name => !['browser-setup.json', 'lorerelay-start.json'].includes(name))) {
            throw new Error('Import requires a new launcher folder containing only the input JSON and marker. Existing adventure data will not be overwritten.');
        }
        const schemaPath = path.join(context.extensionPath, 'resources', 'browser-start', 'settings.schema.json');
        const data = parseBrowserSetup(readOwnedFile(path.join(root, 'browser-setup.json'), 256 * 1024), JSON.parse(fs.readFileSync(schemaPath, 'utf8')));
        // An exclusive persistent claim prevents concurrent/restarted hosts from importing twice.
        const lock = fs.openSync(path.join(root, '.lorerelay-import.lock'), 'wx');
        fs.closeSync(lock);
        claimed = true;
        writeJsonAtomic(markerPath, { format: 'lorerelay-launch/1', status: 'initializing' });
        const config = vscode.workspace.getConfiguration(undefined, vscode.workspace.workspaceFolders[0].uri);
        const settings: Record<string, unknown> = {
            ...data.settings,
            // Startup never invokes image/audio generation, regardless of global preferences.
            'textAdventure.mediaAgent.enabled': false,
            'textAdventure.mediaAgent.autoImage': false,
            'textAdventure.imageGen.autoOnLocationChange': false,
            'textAdventure.cartography.autoLocationImage': false,
            'textAdventure.tts.external.enabled': false,
        };
        for (const [key, value] of Object.entries(settings)) {
            await config.update(key, value, vscode.ConfigurationTarget.Workspace);
        }
        const source = path.join(root, '.lorerelay-start-source');
        fs.mkdirSync(source);
        writeJsonAtomic(path.join(source, 'scenario.json'), data.scenario);
        writeJsonAtomic(path.join(source, 'game_rules.json'), data.gameRules);
        // Put rules in place before protagonist creation and the opening scene are published.
        writeJsonAtomic(path.join(root, 'game_rules.json'), data.gameRules);
        writeJsonAtomic(path.join(root, 'lorebook.json'), data.lorebook);
        clearGameRulesCache();
        if (!await loadScenarioPackFromDir(source)) throw new Error('Scenario initialization failed. The input is preserved.');
        writeJsonAtomic(path.join(root, 'recommendations.json'), data.recommendations);
        writeJsonAtomic(markerPath, { format: 'lorerelay-launch/1', status: 'complete' });
    } catch (error) {
        if (claimed) {
            try { writeJsonAtomic(markerPath, { format: 'lorerelay-launch/1', status: 'failed' }); }
            catch { /* The initializing marker and claim still prevent a destructive retry. */ }
        }
        void vscode.window.showErrorMessage(`LoreRelay: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        running = false;
    }
}
