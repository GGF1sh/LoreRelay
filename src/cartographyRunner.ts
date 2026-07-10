import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ChildProcess } from 'child_process';
import { spawnWithTimeout } from './spawnWithTimeout';
import { t } from './i18n';
import { buildImageGenEnv, getResolvedImageMode } from './imageGenRunner';
import { getWorkspacePath } from './workspacePaths';
import { resolveAllowedImagePath } from './mediaPaths';
import { resolvePythonCommand } from './skillScriptRunner';
import {
    formatCartographyLoraPresetHint,
    suggestCartographyLoraPreset,
} from './cartographyLoraPresets';
import {
    WORLD_MAP_IMAGE_BASENAME,
    WORLD_MAP_LAYOUT_BASENAME,
    validateCartographyGeneratedImagePath,
    validateCartographyOutputDir,
    validateCartographyOutputPath,
    validateForgePathInWorkspace,
    resolveWorldMapImagePath as resolveWorldMapImagePathCore,
    resolveWorldMapLayoutPath as resolveWorldMapLayoutPathCore,
} from './cartographyPathCore';
import {
    executeAfterMediaPreflight,
    preflightWorldMapGeneration,
} from './mediaCompatibility';

export const WORLD_MAP_IMAGE_FILENAME = WORLD_MAP_IMAGE_BASENAME;
export const WORLD_MAP_LAYOUT_FILENAME = WORLD_MAP_LAYOUT_BASENAME;

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
    return root ? resolveWorldMapImagePathCore(root) : undefined;
}

export function resolveWorldMapLayoutPath(wsPath?: string): string | undefined {
    const root = wsPath ?? getWorkspacePath();
    return root ? resolveWorldMapLayoutPathCore(root) : undefined;
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

function resolveCartographyLoraFromConfig(): { lora?: string; weight: string; source: 'env' | 'settings' | 'none' } {
    const envLora = process.env.TA_LORA?.trim();
    if (envLora) {
        const envWeight = process.env.TA_LORA_WEIGHT?.trim();
        return {
            lora: envLora,
            weight: envWeight && Number.isFinite(parseFloat(envWeight)) ? envWeight : '0.45',
            source: 'env',
        };
    }

    const config = vscode.workspace.getConfiguration('textAdventure');
    const settingsLora = config.get<string>('cartography.lora', '').trim();
    if (!settingsLora) {
        return { weight: '0.45', source: 'none' };
    }

    const settingsWeight = config.get<number>('cartography.loraWeight', 0);
    const weight = settingsWeight > 0 && Number.isFinite(settingsWeight)
        ? String(settingsWeight)
        : '0.45';
    return { lora: settingsLora, weight, source: 'settings' };
}

function buildCartographyEnv(wsPath: string, extPath: string): NodeJS.ProcessEnv {
    const env = buildImageGenEnv(wsPath);
    env.TA_LAYOUT_MODE = process.env.TA_LAYOUT_MODE || 'voronoi';
    env.TA_FORCE_LAYOUT = '1';
    env.TA_MODE = getResolvedImageMode();
    const layoutMode = env.TA_LAYOUT_MODE;
    env.TA_WORKFLOW = layoutMode === 'lineart'
        ? path.join(extPath, 'comfyui', 'workflow_cartography_sdxl_direct.json')
        : resolveCartographyWorkflow(extPath);
    const controlNet = vscode.workspace.getConfiguration('textAdventure')
        .get<string>('imageGen.controlNet', '')
        .trim();
    if (controlNet) {
        env.TA_CONTROL_NET = controlNet;
    }
    const loraConfig = resolveCartographyLoraFromConfig();
    if (loraConfig.lora) {
        env.TA_LORA = loraConfig.lora;
        env.TA_LORA_WEIGHT = loraConfig.weight;
        env.TA_LORA_SOURCE = loraConfig.source;
    }
    const controlStrength = process.env.TA_CONTROL_STRENGTH?.trim();
    if (controlStrength) {
        env.TA_CONTROL_STRENGTH = controlStrength;
    }
    return env;
}

function spawnAndWait(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    channel: vscode.OutputChannel,
    trackProcess?: (child: ChildProcess | undefined) => void,
    timeoutMs = 120_000
): Promise<{ code: number | null; timedOut: boolean }> {
    const { child, result } = spawnWithTimeout(command, args, { env, timeoutMs }, {
        stdout: (out) => channel.append(out),
        stderr: (err) => channel.append(err),
    });
    trackProcess?.(child);
    return result.then(({ code, timedOut }) => {
        trackProcess?.(undefined);
        if (timedOut) {
            channel.appendLine(`\n[Process timed out after ${timeoutMs / 1000}s — killed]`);
        }
        return { code, timedOut };
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
    const { code, timedOut } = await spawnAndWait(
        python,
        [script, forgePath, layoutPath, '--size', String(Number.isFinite(size) && size > 0 ? size : 1024)],
        env,
        channel,
        (child) => { cartographyProcess = child; },
        120_000
    );
    return !timedOut && code === 0 && fs.existsSync(layoutPath);
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

    const validatedForge = validateForgePathInWorkspace(forgePath, wsPath);
    if (!validatedForge) {
        vscode.window.showErrorMessage('world_forge.json must exist in the workspace root.');
        return false;
    }

    const layoutPath = validateCartographyOutputPath(
        path.join(wsPath, WORLD_MAP_LAYOUT_FILENAME),
        wsPath,
        WORLD_MAP_LAYOUT_FILENAME
    );
    const targetMapPath = validateCartographyOutputPath(
        path.join(wsPath, WORLD_MAP_IMAGE_FILENAME),
        wsPath,
        WORLD_MAP_IMAGE_FILENAME
    );
    const validatedOutputDir = validateCartographyOutputDir(wsPath, wsPath);
    if (!layoutPath || !targetMapPath || !validatedOutputDir) {
        vscode.window.showErrorMessage('Invalid cartography output paths.');
        return false;
    }

    const channel = getCartographyOutputChannel();
    const rawEnv = buildCartographyEnv(wsPath, extPath);
    const workflowPath = String(rawEnv.TA_WORKFLOW || '');
    const preflight = preflightWorldMapGeneration(wsPath, rawEnv, workflowPath);
    if (!preflight.ok) {
        channel.show(true);
        channel.appendLine('[Compatibility] World-map generation rejected before layout/ComfyUI spawn.');
        channel.appendLine(`[Compatibility] profile=${preflight.profileId || '(unresolved)'} model=${preflight.modelFamily} graph=${preflight.graphFamily}`);
        for (const reason of preflight.reasons) {
            channel.appendLine(`[Compatibility:${reason.code}] ${reason.message}${reason.detail ? ` (${reason.detail})` : ''}`);
        }
        vscode.window.showErrorMessage(t('extension.error.worldMapMediaCompatibility', { detail: preflight.message }));
        return false;
    }
    const env = preflight.env;

    channel.show(true);
    channel.appendLine('=== Cartography world map generation ===');
    channel.appendLine(`Forge: ${validatedForge}`);
    channel.appendLine(`Backend: ${env.COMFYUI_URL || 'http://127.0.0.1:8188 (default)'}`);
    channel.appendLine(`Workflow: ${env.TA_WORKFLOW}`);
    channel.appendLine(`LoRA: ${env.TA_LORA || '(none — ControlNet + prompt only)'}`);
    if (env.TA_LORA) {
        channel.appendLine(`LoRA weight: ${env.TA_LORA_WEIGHT || '0.45'}`);
        const loraSource = env.TA_LORA_SOURCE === 'env'
            ? 'TA_LORA env'
            : env.TA_LORA_SOURCE === 'settings'
                ? 'textAdventure.cartography.lora'
                : '';
        if (loraSource) {
            channel.appendLine(`LoRA source: ${loraSource}`);
        }
    } else {
        try {
            const forge = JSON.parse(fs.readFileSync(validatedForge, 'utf-8')) as { meta?: { theme?: string } };
            const preset = suggestCartographyLoraPreset(forge.meta?.theme);
            channel.appendLine(formatCartographyLoraPresetHint(preset));
            channel.appendLine('(Set textAdventure.cartography.lora in User Settings, or TA_LORA env.)');
        } catch {
            /* preset hint is best-effort */
        }
    }

    getPanel()?.webview.postMessage({ type: 'worldMapGenStart' });

    const layoutOk = await renderStableLayout(validatedForge, layoutPath, extPath, env, channel);
    if (!layoutOk) {
        channel.appendLine('Layout preview failed — continuing with ComfyUI pipeline.');
    }

    const python = resolvePythonCommand();
    const CARTOGRAPHY_TIMEOUT_MS = 300_000;
    let generatedImagePath = '';
    let genFinished = false;

    const execution = executeAfterMediaPreflight(preflight, validatedEnv => spawnWithTimeout(
        python,
        [scriptPath, validatedForge, validatedOutputDir],
        { env: validatedEnv, timeoutMs: CARTOGRAPHY_TIMEOUT_MS },
        {
            stdout: (out) => {
                channel.append(out);
                for (const line of out.split('\n')) {
                    const trimmed = line.trim();
                    if (trimmed.endsWith('.png') && trimmed.length > 4) {
                        generatedImagePath = trimmed;
                    }
                }
            },
            stderr: (err) => channel.append(err),
        }
    ));
    if (!execution.executed || !execution.value) { return false; }
    const { child, result } = execution.value;
    cartographyProcess = child;

    return result.then(({ code, timedOut }) => {
        if (genFinished) { return false; }
        genFinished = true;
        cartographyProcess = undefined;
        const finish = (success: boolean) => {
            getPanel()?.webview.postMessage({ type: 'worldMapGenEnd', success });
            return success;
        };
        if (timedOut) {
            channel.appendLine(`\nCartography generation timed out after ${CARTOGRAPHY_TIMEOUT_MS / 1000}s — process killed.`);
            return finish(false);
        }
        channel.appendLine(`\nProcess exited with code ${code}`);
        if (code !== 0 || !generatedImagePath) {
            return finish(false);
        }
        const srcPath = validateCartographyGeneratedImagePath(generatedImagePath, wsPath);
        const allowedPath = resolveAllowedImagePath(generatedImagePath);
        if (!srcPath || !allowedPath || srcPath !== allowedPath) {
            channel.appendLine(`Generated path rejected (outside workspace or invalid name): ${generatedImagePath}`);
            return finish(false);
        }
        try {
            fs.copyFileSync(srcPath, targetMapPath);
            channel.appendLine(`Saved world map → ${targetMapPath}`);
            if (srcPath !== targetMapPath && path.basename(srcPath).startsWith('world_map_')) {
                try { fs.unlinkSync(srcPath); } catch { /* temp cleanup best-effort */ }
            }
            return finish(true);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            channel.appendLine(`Failed to save world_map.png: ${msg}`);
            return finish(false);
        }
    });
}
