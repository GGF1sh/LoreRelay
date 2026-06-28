import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { t } from './i18n';
import { buildImageGenEnv, getResolvedImageMode } from './imageGenRunner';
import { getWorkspacePath } from './workspacePaths';
import { resolvePythonCommand } from './skillScriptRunner';

export const WORLD_MAP_IMAGE_FILENAME = 'world_map.png';
export const WORLD_MAP_LAYOUT_FILENAME = 'world_map.layout.png';

let cartographyOutputChannel: vscode.OutputChannel | undefined;
let cartographyProcess: ChildProcess | undefined;
let extensionPathRef = '';

export interface CartographyRunnerDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
    extensionPath: string;
    subscriptions: vscode.Disposable[];
}

let deps: CartographyRunnerDeps | undefined;

export function initCartographyRunner(runnerDeps: CartographyRunnerDeps): void {
    deps = runnerDeps;
    extensionPathRef = runnerDeps.extensionPath;
}

function requireDeps(): CartographyRunnerDeps {
    if (!deps) {
        throw new Error('initCartographyRunner must be called before cartography generation');
    }
    return deps;
}

export function getCartographyOutputChannel(): vscode.OutputChannel {
    if (!cartographyOutputChannel) {
        cartographyOutputChannel = vscode.window.createOutputChannel('LoreRelay: Cartography');
        deps?.subscriptions.push(cartographyOutputChannel);
    }
    return cartographyOutputChannel;
}

export function isCartographyGenerationBusy(): boolean {
    return Boolean(cartographyProcess);
}

export function killCartographyProcess(): void {
    if (cartographyProcess) {
        cartographyProcess.kill();
        cartographyProcess = undefined;
    }
}

export function resolveWorldMapImagePath(wsPath?: string): string | undefined {
    const root = wsPath ?? getWorkspacePath();
    return root ? path.join(root, WORLD_MAP_IMAGE_FILENAME) : undefined;
}

export function resolveWorldMapLayoutPath(wsPath?: string): string | undefined {
    const root = wsPath ?? getWorkspacePath();
    return root ? path.join(root, WORLD_MAP_LAYOUT_FILENAME) : undefined;
}

function resolveCartographyScript(extPath: string): string {
    return path.join(extPath, 'scripts', 'comfyui_generate_cartography.py');
}

function resolveLayoutScript(extPath: string): string {
    return path.join(extPath, 'scripts', 'render_cartography_layout.py');
}

function resolveCartographyWorkflow(extPath: string): string {
    return path.join(extPath, 'comfyui', 'workflow_cartography_sdxl_canny.json');
}

function buildCartographyEnv(wsPath: string, extPath: string): NodeJS.ProcessEnv {
    const env = buildImageGenEnv(wsPath);
    env.TA_WORKFLOW = resolveCartographyWorkflow(extPath);
    env.TA_MODE = getResolvedImageMode();
    const controlNet = vscode.workspace.getConfiguration('textAdventure')
        .get<string>('imageGen.controlNet', '')
        .trim();
    if (controlNet) {
        env.TA_CONTROL_NET = controlNet;
    }
    return env;
}

function spawnAndWait(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    channel: vscode.OutputChannel
): Promise<{ code: number | null; lastPngLine: string }> {
    return new Promise((resolve) => {
        const child = spawn(command, args, { shell: false, env });
        let lastPngLine = '';
        let finished = false;

        const finish = (code: number | null) => {
            if (finished) { return; }
            finished = true;
            resolve({ code, lastPngLine });
        };

        child.stdout.on('data', (data) => {
            const out = data.toString();
            channel.append(out);
            for (const line of out.split('\n')) {
                const trimmed = line.trim();
                if (trimmed.endsWith('.png') && trimmed.length > 4) {
                    lastPngLine = trimmed;
                }
            }
        });

        child.stderr.on('data', (data) => channel.append(data.toString()));

        child.on('error', (err) => {
            channel.appendLine(`\n[Error: ${err.message}]`);
            finish(null);
        });

        child.on('close', (code) => finish(code));
    });
}

async function renderStableLayout(
    forgePath: string,
    layoutPath: string,
    extPath: string,
    env: NodeJS.ProcessEnv,
    channel: vscode.OutputChannel
): Promise<boolean> {
    const script = resolveLayoutScript(extPath);
    if (!fs.existsSync(script)) {
        channel.appendLine(`Layout script not found: ${script}`);
        return false;
    }
    const size = env.TA_WIDTH ? parseInt(String(env.TA_WIDTH), 10) : 1024;
    const python = resolvePythonCommand();
    channel.appendLine(`Rendering layout preview → ${layoutPath}`);
    const { code } = await spawnAndWait(
        python,
        [script, forgePath, layoutPath, '--size', String(Number.isFinite(size) && size > 0 ? size : 1024)],
        env,
        channel
    );
    return code === 0 && fs.existsSync(layoutPath);
}

/** Generate parchment world map via ComfyUI; saves world_map.png in workspace root. */
export async function runCartographyGeneration(forgePath: string): Promise<boolean> {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(t('extension.error.untrustedWorkspace'));
        return false;
    }

    const { getPanel } = requireDeps();
    const extPath = extensionPathRef || deps?.extensionPath || '';
    const wsPath = getWorkspacePath();
    if (!wsPath || !extPath) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return false;
    }

    if (isCartographyGenerationBusy()) {
        vscode.window.showWarningMessage('World map generation is already running.');
        return false;
    }

    const scriptPath = resolveCartographyScript(extPath);
    if (!fs.existsSync(scriptPath)) {
        vscode.window.showErrorMessage(`Cartography script not found: ${scriptPath}`);
        return false;
    }

    if (!fs.existsSync(forgePath)) {
        vscode.window.showErrorMessage('world_forge.json not found.');
        return false;
    }

    const channel = getCartographyOutputChannel();
    const env = buildCartographyEnv(wsPath, extPath);
    const layoutPath = path.join(wsPath, WORLD_MAP_LAYOUT_FILENAME);
    const targetMapPath = path.join(wsPath, WORLD_MAP_IMAGE_FILENAME);

    channel.show(true);
    channel.appendLine('=== Cartography world map generation ===');
    channel.appendLine(`Forge: ${forgePath}`);
    channel.appendLine(`Backend: ${env.COMFYUI_URL || 'http://127.0.0.1:8188 (default)'}`);
    channel.appendLine(`Workflow: ${env.TA_WORKFLOW}`);

    getPanel()?.webview.postMessage({ type: 'worldMapGenStart' });

    const layoutOk = await renderStableLayout(forgePath, layoutPath, extPath, env, channel);
    if (!layoutOk) {
        channel.appendLine('Layout preview failed — continuing with ComfyUI pipeline.');
    }

    const python = resolvePythonCommand();
    const child = spawn(python, [scriptPath, forgePath, wsPath], { shell: false, env });
    cartographyProcess = child;

    let generatedImagePath = '';
    let genFinished = false;

    return new Promise((resolve) => {
        const finish = (success: boolean) => {
            if (genFinished) { return; }
            genFinished = true;
            cartographyProcess = undefined;
            getPanel()?.webview.postMessage({ type: 'worldMapGenEnd', success });
            resolve(success);
        };

        child.stdout.on('data', (data) => {
            const out = data.toString();
            channel.append(out);
            for (const line of out.split('\n')) {
                const trimmed = line.trim();
                if (trimmed.endsWith('.png') && trimmed.length > 4) {
                    generatedImagePath = trimmed;
                }
            }
        });

        child.stderr.on('data', (data) => channel.append(data.toString()));

        child.on('error', (err) => {
            channel.appendLine(`\n[Error: ${err.message}]`);
            vscode.window.showErrorMessage(t('extension.error.pythonFailed', { message: err.message }));
            finish(false);
        });

        child.on('close', (code) => {
            channel.appendLine(`\nProcess exited with code ${code}`);
            if (code !== 0 || !generatedImagePath || !fs.existsSync(generatedImagePath)) {
                finish(false);
                return;
            }
            try {
                fs.copyFileSync(generatedImagePath, targetMapPath);
                channel.appendLine(`Saved world map → ${targetMapPath}`);
                if (generatedImagePath !== targetMapPath && path.basename(generatedImagePath).startsWith('world_map_')) {
                    try { fs.unlinkSync(generatedImagePath); } catch { /* temp cleanup best-effort */ }
                }
                finish(true);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                channel.appendLine(`Failed to save world_map.png: ${msg}`);
                finish(false);
            }
        });
    });
}