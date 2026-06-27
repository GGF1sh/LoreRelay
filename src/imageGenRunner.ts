import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { t } from './i18n';
import {
    getImageGenConfigPath,
    loadImageGenConfig,
    saveImageGenConfig,
    sanitizeImageGenConfig,
    type ImageGenConfig
} from './imageGenConfig';
import { isValidEntryId } from './entryId';
import { getWorkspacePath, getGameStatePath, writeJsonAtomic } from './workspacePaths';
import { findLastGmEntry } from './checkpoint';
import type { GameEntry } from './types/GameState';
import {
    getGameEntryHistory,
    safeImageUri,
    saveHistoryToDisk
} from './gameStateSync';
import { resolvePythonCommand } from './skillScriptRunner';
import { buildVlmMetaFromGameState } from './vlmQueue';

let imageOutputChannel: vscode.OutputChannel | undefined;
let imageGenerationProcess: ChildProcess | undefined;
let listModelsProcess: ChildProcess | undefined;

interface ImageGenJob {
    prompt: string;
    mode: string;
    entryId?: string;
}

const imageGenQueue: ImageGenJob[] = [];
let drainingImageQueue = false;
const queuedEntryIds = new Set<string>();

export interface ImageGenRunnerDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
    subscriptions: vscode.Disposable[];
}

let deps: ImageGenRunnerDeps | undefined;

export function initImageGenRunner(runnerDeps: ImageGenRunnerDeps): void {
    deps = runnerDeps;
}

function requireDeps(): ImageGenRunnerDeps {
    if (!deps) {
        throw new Error('initImageGenRunner must be called before using image generation');
    }
    return deps;
}

export function getImageOutputChannel(): vscode.OutputChannel {
    if (!imageOutputChannel) {
        imageOutputChannel = vscode.window.createOutputChannel('LoreRelay: Image Gen');
        deps?.subscriptions.push(imageOutputChannel);
    }
    return imageOutputChannel;
}

export function isImageGenerationBusy(): boolean {
    return Boolean(imageGenerationProcess);
}

export function getImageQueueLength(): number {
    return imageGenQueue.length;
}

/** 新ターン開始時に entry 重複抑止をリセット（同一 entry の再生成を許可）。 */
export function resetImageQueueDedup(): void {
    queuedEntryIds.clear();
}

export function killImageGenerationProcess(): void {
    if (imageGenerationProcess) {
        imageGenerationProcess.kill();
        imageGenerationProcess = undefined;
    }
    if (listModelsProcess) {
        listModelsProcess.kill();
        listModelsProcess = undefined;
    }
    imageGenQueue.length = 0;
    queuedEntryIds.clear();
    drainingImageQueue = false;
}

function getMaxImageQueueSize(): number {
    const max = vscode.workspace.getConfiguration('textAdventure').get<number>('mediaAgent.maxImageQueue', 5);
    return Math.max(1, Math.min(20, max));
}

/** Enqueue ComfyUI generation (MediaAgent / manual retry when busy). Returns false if duplicate or queue full. */
export function enqueueImageGeneration(prompt: string, mode: string, entryId?: string): boolean {
    if (entryId && queuedEntryIds.has(entryId)) {
        return false;
    }
    if (imageGenQueue.length >= getMaxImageQueueSize()) {
        getImageOutputChannel().appendLine(`[Queue] Dropped image job — queue full (${getMaxImageQueueSize()})`);
        return false;
    }
    imageGenQueue.push({ prompt, mode, entryId });
    if (entryId) {
        queuedEntryIds.add(entryId);
    }
    void drainImageQueue();
    return true;
}

async function drainImageQueue(): Promise<void> {
    if (drainingImageQueue || imageGenerationProcess) {
        return;
    }
    drainingImageQueue = true;
    try {
        while (imageGenQueue.length > 0 && !imageGenerationProcess) {
            const job = imageGenQueue.shift();
            if (!job) {
                break;
            }
            await executeImageGeneration(job.prompt, job.mode, job.entryId, { fromQueue: true });
            if (job.entryId) {
                queuedEntryIds.delete(job.entryId);
            }
        }
    } finally {
        drainingImageQueue = false;
    }
}

/** comfyui_generate.py の場所を設定・既知パスから解決する。 */
export function resolveComfyScript(wsPath: string): string | undefined {
    const config = vscode.workspace.getConfiguration('textAdventure');
    let scriptPath = config.get<string>('skillPath') || '';

    if (!scriptPath || !fs.existsSync(scriptPath)) {
        const possiblePaths = [
            path.join('C:', 'AI', 'TextAdventureGMSkill', 'scripts', 'comfyui_generate.py'),
            path.join(wsPath, '.agents', 'skills', 'text-adventure-gm', 'scripts', 'comfyui_generate.py'),
            path.join(wsPath, '.grok', 'skills', 'text-adventure-gm', 'scripts', 'comfyui_generate.py')
        ];
        scriptPath = '';
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) { scriptPath = p; break; }
        }
    }
    return scriptPath || undefined;
}

/** GM スキルフォルダ（comfyui_generate.py の2階層上）を解決する。同梱SE等の参照に使う。 */
export function getSkillDir(): string | undefined {
    const wsPath = getWorkspacePath() || process.cwd();
    const scriptPath = resolveComfyScript(wsPath);
    if (!scriptPath) { return undefined; }
    return path.dirname(path.dirname(scriptPath));
}

/** 画像生成バックエンド設定を comfyui_generate.py へ渡す環境変数として構築する。 */
export function buildImageGenEnv(wsPath?: string): NodeJS.ProcessEnv {
    const vsConfig = vscode.workspace.getConfiguration('textAdventure');
    const env: NodeJS.ProcessEnv = { ...process.env };
    const wsConfig = wsPath ? loadImageGenConfig(wsPath) : undefined;

    if (wsPath) {
        env.TA_IMAGE_CONFIG = getImageGenConfigPath(wsPath);
    }

    const url = vsConfig.get<string>('imageGen.comfyuiUrl', '').trim();
    if (url) { env.COMFYUI_URL = url; }

    const checkpoint = wsConfig?.checkpoint || vsConfig.get<string>('imageGen.checkpoint', '').trim();
    if (checkpoint) { env.TA_CHECKPOINT = checkpoint; }

    const workflowPath = wsConfig?.workflowPath || vsConfig.get<string>('imageGen.workflowPath', '').trim();
    if (workflowPath) { env.TA_WORKFLOW = workflowPath; }

    const steps = (wsConfig && wsConfig.steps > 0) ? wsConfig.steps : vsConfig.get<number>('imageGen.steps', 0);
    if (steps > 0) { env.TA_STEPS = String(steps); }
    const cfgVal = (wsConfig && wsConfig.cfg > 0) ? wsConfig.cfg : vsConfig.get<number>('imageGen.cfg', 0);
    if (cfgVal > 0) { env.TA_CFG = String(cfgVal); }
    const width = (wsConfig && wsConfig.width > 0) ? wsConfig.width : vsConfig.get<number>('imageGen.width', 0);
    if (width > 0) { env.TA_WIDTH = String(width); }
    const height = (wsConfig && wsConfig.height > 0) ? wsConfig.height : vsConfig.get<number>('imageGen.height', 0);
    if (height > 0) { env.TA_HEIGHT = String(height); }

    if (wsConfig?.samplerName) { env.TA_SAMPLER = wsConfig.samplerName; }
    if (wsConfig?.scheduler) { env.TA_SCHEDULER = wsConfig.scheduler; }
    if (wsConfig?.positivePrefix) { env.TA_POSITIVE_PREFIX = wsConfig.positivePrefix; }
    if (wsConfig?.positiveSuffix) { env.TA_POSITIVE_SUFFIX = wsConfig.positiveSuffix; }
    if (wsConfig?.negativePrompt) { env.TA_NEGATIVE_PROMPT = wsConfig.negativePrompt; }
    if (wsConfig?.mode) { env.TA_MODE = wsConfig.mode; }

    return env;
}

export function sendImageGenConfig(): void {
    const { getPanel } = requireDeps();
    const panel = getPanel();
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        panel?.webview.postMessage({ type: 'imageGenConfig', config: sanitizeImageGenConfig({}) });
        return;
    }
    panel?.webview.postMessage({ type: 'imageGenConfig', config: loadImageGenConfig(wsPath) });
}

export async function handleUpdateImageGenConfig(raw: unknown): Promise<void> {
    const { getPanel } = requireDeps();
    const panel = getPanel();
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    try {
        const current = loadImageGenConfig(wsPath);
        const partial = (raw && typeof raw === 'object') ? raw as Partial<ImageGenConfig> : {};
        const saved = saveImageGenConfig(wsPath, { ...current, ...partial, templates: { ...current.templates, ...(partial.templates || {}) } });
        panel?.webview.postMessage({ type: 'imageGenConfig', config: saved });
    } catch (e) {
        console.error('Failed to save image_gen_config.json:', e);
        vscode.window.showErrorMessage(t('extension.error.imageGenConfigSaveFailed'));
    }
}

/** 履歴・game_state を entry.id で画像更新し、Webview に patch を送る。 */
export function applyImageToEntryById(wsPath: string, entryId: string, imagePath: string, prompt: string): boolean {
    const { getPanel } = requireDeps();
    const history = getGameEntryHistory();
    const histIdx = history.findIndex((e) => e.id === entryId);
    if (histIdx < 0) {
        return false;
    }

    history[histIdx] = {
        ...history[histIdx],
        image: imagePath,
        imagePrompt: prompt
    };
    saveHistoryToDisk();

    const statePath = path.join(wsPath, 'game_state.json');
    if (fs.existsSync(statePath)) {
        try {
            const stateData = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
            let stateUpdated = false;
            const entries = stateData.entries;
            if (Array.isArray(entries)) {
                const ei = entries.findIndex(
                    (e) => typeof e === 'object' && e !== null && (e as GameEntry).id === entryId
                );
                if (ei >= 0) {
                    const row = entries[ei] as Record<string, unknown>;
                    row.image = imagePath;
                    row.imagePrompt = prompt;
                    stateUpdated = true;
                }
            }
            const lastGm = findLastGmEntry(history);
            if (lastGm?.id === entryId) {
                stateData.latestImage = imagePath;
                stateUpdated = true;
            }
            if (stateUpdated) {
                writeJsonAtomic(statePath, stateData);
            }
        } catch {
            // game_state 更新失敗は履歴更新だけでも続行
        }
    }

    const uri = safeImageUri(imagePath);
    const panel = getPanel();
    if (panel && uri) {
        const meta = buildVlmMetaFromGameState(prompt);
        panel.webview.postMessage({
            type: 'updateEntry',
            entry: {
                id: entryId,
                image: uri,
                imagePrompt: prompt,
                rawImagePath: imagePath,
                locationId: meta.locationId,
                worldTurn: meta.worldTurn,
            }
        });
    }
    return true;
}

const ALLOWED_IMAGE_MODES = ['pony', 'illustrious', 'natural', 'standard'] as const;

function resolveImageMode(mode: string, wsPath: string): string {
    const wsConfig = loadImageGenConfig(wsPath);
    const defaultMode = ALLOWED_IMAGE_MODES.includes(wsConfig.mode as typeof ALLOWED_IMAGE_MODES[number])
        ? wsConfig.mode
        : 'illustrious';
    return typeof mode === 'string' && ALLOWED_IMAGE_MODES.includes(mode as typeof ALLOWED_IMAGE_MODES[number])
        ? mode
        : defaultMode;
}

/** Workspace image_gen_config.json のモードを解決（空文字でデフォルト）。 */
export function getResolvedImageMode(mode = ''): string {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        return 'illustrious';
    }
    return resolveImageMode(mode, wsPath);
}

/** Core ComfyUI spawn — returns success. Used by queue drain and direct calls. */
export async function executeImageGeneration(
    prompt: string,
    mode: string,
    entryId?: string,
    options?: { fromQueue?: boolean }
): Promise<boolean> {
    const { getPanel } = requireDeps();
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        return false;
    }

    const safeMode = resolveImageMode(mode, wsPath);
    const scriptPath = resolveComfyScript(wsPath);
    const outputDir = path.join(wsPath, 'output');

    if (!scriptPath) {
        if (!options?.fromQueue) {
            vscode.window.showWarningMessage(t('extension.error.imageScriptNotFound'));
        }
        return false;
    }

    const channel = getImageOutputChannel();
    const env = buildImageGenEnv(wsPath);
    if (!options?.fromQueue) {
        channel.show(true);
    }
    channel.appendLine(`Backend: ${env.COMFYUI_URL || 'http://127.0.0.1:8188 (default)'}`);
    channel.appendLine(`Checkpoint: ${env.TA_CHECKPOINT || '(workflow default)'}`);
    channel.appendLine(`${options?.fromQueue ? '[Queue] ' : ''}Generating image with mode: ${safeMode}`);
    channel.appendLine(`Prompt: ${prompt}`);
    getPanel()?.webview.postMessage({ type: 'imageGenStart', source: options?.fromQueue ? 'queue' : 'direct' });

    const python = resolvePythonCommand();
    const child = spawn(python, [scriptPath, prompt, outputDir, safeMode], {
        shell: false,
        env
    });
    imageGenerationProcess = child;

    let generatedImagePath = '';
    let imageGenFinished = false;

    return new Promise((resolve) => {
        child.stdout.on('data', (data) => {
            const out = data.toString();
            channel.append(out);

            const lines = out.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.endsWith('.png') && trimmed.length > 4) {
                    generatedImagePath = trimmed;
                }
            }
        });

        child.stderr.on('data', (data) => {
            channel.append(data.toString());
        });

        const finishImageGeneration = (code: number | null) => {
            if (imageGenFinished) {
                return;
            }
            imageGenFinished = true;
            imageGenerationProcess = undefined;
            channel.appendLine(`\nProcess exited with code ${code}`);
            getPanel()?.webview.postMessage({ type: 'imageGenEnd', success: code === 0 });

            if (code === 0 && generatedImagePath && entryId && isValidEntryId(entryId)) {
                const ok = applyImageToEntryById(wsPath, entryId, generatedImagePath, prompt);
                if (ok) {
                    channel.appendLine(`Updated entry ${entryId} with new image`);
                } else {
                    channel.appendLine(`Entry ${entryId} not found in game history`);
                }
            }

            void drainImageQueue();
            resolve(code === 0);
        };

        child.on('error', (err) => {
            channel.appendLine(`\n[Error: ${err.message}]`);
            if (!options?.fromQueue) {
                vscode.window.showErrorMessage(t('extension.error.pythonFailed', { message: err.message }));
            }
            finishImageGeneration(null);
        });

        child.on('close', (code) => finishImageGeneration(code));
    });
}

export async function runImageGeneration(prompt: string, mode: string, entryId?: string): Promise<void> {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(t('extension.error.untrustedWorkspace'));
        return;
    }

    const wsPath = getWorkspacePath();
    if (!wsPath) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }

    if (typeof prompt !== 'string' || prompt.length > 2000) {
        vscode.window.showErrorMessage(t('extension.error.invalidPrompt'));
        return;
    }

    const safeMode = resolveImageMode(mode, wsPath);

    if (imageGenerationProcess) {
        const queued = enqueueImageGeneration(prompt, safeMode, entryId);
        if (queued) {
            vscode.window.setStatusBarMessage(t('extension.status.imageQueued'), 3000);
        } else {
            vscode.window.showWarningMessage(t('extension.warning.imageBusy'));
        }
        return;
    }

    await executeImageGeneration(prompt, safeMode, entryId);
}

export function runListImageModels(): void {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(t('extension.error.untrustedWorkspace'));
        return;
    }

    const wsPath = getWorkspacePath() || process.cwd();
    const scriptPath = resolveComfyScript(wsPath);
    if (!scriptPath) {
        vscode.window.showWarningMessage(t('extension.error.comfyScriptNotFound'));
        return;
    }

    const channel = getImageOutputChannel();
    const env = buildImageGenEnv(wsPath);
    channel.show(true);
    channel.appendLine(`\n=== List Image Models (${env.COMFYUI_URL || 'http://127.0.0.1:8188'}) ===`);

    const python = resolvePythonCommand();
    const child = spawn(python, [scriptPath, '--list-models'], { shell: false, env });
    listModelsProcess = child;

    let finished = false;
    const finishListModels = (code: number | null) => {
        if (finished) { return; }
        finished = true;
        listModelsProcess = undefined;
        channel.appendLine(`\n[exited with code ${code ?? 'unknown'}]`);
    };

    child.stdout.on('data', (data) => channel.append(data.toString()));
    child.stderr.on('data', (data) => channel.append(data.toString()));
    child.on('error', (err) => {
        if (finished) { return; }
        channel.appendLine(`\n[Error: ${err.message}]`);
        vscode.window.showErrorMessage(t('extension.error.pythonFailed', { message: err.message }));
        finishListModels(null);
    });
    child.on('close', (code) => {
        finishListModels(code);
    });
}