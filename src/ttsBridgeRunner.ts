// Extension-host TTS bridge — local subprocess + OpenAI speech API (Phase 11B).
// Webview posts requestNpcTts; audio returns as base64 (no persistent game_state storage).

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { t } from './i18n';
import { getWorkspacePath } from './workspacePaths';
import { resolveGmBridgeScript, resolvePythonCommand } from './skillScriptRunner';
import {
    defaultEdgeVoiceForLang,
    isSafeTtsOutputPath,
    MAX_TTS_AUDIO_BYTES,
    normalizeExternalProvider,
    parseTtsLocalStdout,
    rateToEdgeTtsPercent,
    resolveOpenAiVoice,
    sanitizeTtsBridgePayload,
    type TtsBridgeSpeakPayload,
} from './ttsBridgeCore';

export interface TtsBridgeRunnerDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
    getTtsApiKey: () => Promise<string>;
    subscriptions: vscode.Disposable[];
}

export interface TtsCapabilities {
    localAvailable: boolean;
    externalEnabled: boolean;
    externalProvider: string;
}

let deps: TtsBridgeRunnerDeps | undefined;
let ttsOutputChannel: vscode.OutputChannel | undefined;
let activeTtsProcess: ChildProcess | undefined;

const DEFAULT_TTS_TIMEOUT_MS = 30_000;

function safeUnlink(filePath: string): void {
    try {
        fs.unlinkSync(filePath);
    } catch {
        // Best-effort temp cleanup.
    }
}

export function initTtsBridgeRunner(runnerDeps: TtsBridgeRunnerDeps): void {
    deps = runnerDeps;
}

function requireDeps(): TtsBridgeRunnerDeps {
    if (!deps) {
        throw new Error('initTtsBridgeRunner must be called before using TTS bridge');
    }
    return deps;
}

export function getTtsOutputChannel(): vscode.OutputChannel {
    if (!ttsOutputChannel) {
        ttsOutputChannel = vscode.window.createOutputChannel('LoreRelay: TTS');
        deps?.subscriptions.push(ttsOutputChannel);
    }
    return ttsOutputChannel;
}

function getTtsConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('textAdventure');
}

/** True when bundled tts_local.py or textAdventure.tts.local.command is configured. */
export function isLocalTtsConfigured(): boolean {
    const config = getTtsConfig();
    const command = config.get<string>('tts.local.command', '').trim();
    if (command) {
        return fs.existsSync(command);
    }
    return Boolean(resolveGmBridgeScript('tts_local.py'));
}

export function getTtsCapabilities(): TtsCapabilities {
    const config = getTtsConfig();
    return {
        localAvailable: isLocalTtsConfigured(),
        externalEnabled: config.get<boolean>('tts.external.enabled', false),
        externalProvider: normalizeExternalProvider(config.get('tts.external.provider', '')),
    };
}

export function pushTtsCapabilitiesToWebview(): void {
    const panel = deps?.getPanel();
    if (!panel) { return; }
    const caps = getTtsCapabilities();
    panel.webview.postMessage({
        type: 'ttsCapabilities',
        ...caps,
    });
}

function ensureTtsCacheDir(workspaceRoot: string): string | undefined {
    if (!workspaceRoot) { return undefined; }
    const dir = path.join(workspaceRoot, '.text-adventure', 'tts');
    try {
        fs.mkdirSync(dir, { recursive: true });
        return dir;
    } catch {
        return undefined;
    }
}

function postTtsFailure(requestId: string, reason: string): void {
    deps?.getPanel()?.webview.postMessage({
        type: 'ttsAudioFailed',
        requestId,
        reason,
    });
}

function postTtsAudio(requestId: string, audioBase64: string, mimeType: string, volume: number): void {
    deps?.getPanel()?.webview.postMessage({
        type: 'ttsAudioReady',
        requestId,
        audioBase64,
        mimeType,
        volume,
    });
}

async function runLocalTts(payload: TtsBridgeSpeakPayload): Promise<void> {
    const wsPath = getWorkspacePath();
    if (!wsPath || !vscode.workspace.isTrusted) {
        postTtsFailure(payload.requestId, 'untrusted-or-no-workspace');
        return;
    }

    const cacheDir = ensureTtsCacheDir(wsPath);
    if (!cacheDir) {
        postTtsFailure(payload.requestId, 'cache-dir-failed');
        return;
    }

    const config = getTtsConfig();
    const customCommand = config.get<string>('tts.local.command', '').trim();
    const defaultVoice = config.get<string>('tts.local.defaultVoice', '').trim();
    const voice = (payload.voiceId || defaultVoice || defaultEdgeVoiceForLang(payload.lang)).slice(0, 120);
    const outPath = path.join(cacheDir, `${payload.requestId}.mp3`);

    if (!isSafeTtsOutputPath(outPath, wsPath)) {
        postTtsFailure(payload.requestId, 'unsafe-output-path');
        return;
    }

    const stdinPayload = JSON.stringify({
        text: payload.text,
        voice,
        rate: rateToEdgeTtsPercent(payload.rate),
        lang: payload.lang,
        outputPath: outPath,
    });

    const timeoutMs = Math.max(1000, config.get<number>('tts.local.timeoutMs', DEFAULT_TTS_TIMEOUT_MS));
    const channel = getTtsOutputChannel();
    channel.appendLine(`[local] speak chars=${payload.text.length} voice=${voice}`);

    let executable: string;
    let args: string[];
    const python = resolvePythonCommand();

    if (customCommand) {
        executable = customCommand;
        args = [];
    } else {
        const scriptPath = resolveGmBridgeScript('tts_local.py');
        if (!scriptPath) {
            postTtsFailure(payload.requestId, 'script-missing');
            return;
        }
        executable = python;
        args = [scriptPath];
    }

    await new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
            if (settled) { return; }
            settled = true;
            clearTimeout(timer);
            resolve();
        };

        const child = spawn(executable, args, {
            cwd: wsPath,
            shell: false,
            env: { ...process.env, TA_LOCALE: payload.lang },
        });
        activeTtsProcess = child;

        const timer = setTimeout(() => {
            channel.appendLine(`[local] timeout after ${timeoutMs}ms`);
            child.kill();
            activeTtsProcess = undefined;
            safeUnlink(outPath);
            postTtsFailure(payload.requestId, 'timeout');
            finish();
        }, timeoutMs);

        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        child.stderr?.on('data', (d: Buffer) => {
            const chunk = d.toString();
            stderr += chunk;
            channel.append(chunk);
        });

        child.on('error', (err) => {
            channel.appendLine(`[local] spawn error: ${err.message}`);
            postTtsFailure(payload.requestId, 'spawn-error');
            activeTtsProcess = undefined;
            safeUnlink(outPath);
            finish();
        });

        child.on('close', (code) => {
            activeTtsProcess = undefined;
            if (code !== 0) {
                channel.appendLine(`[local] exit ${code}`);
                safeUnlink(outPath);
                postTtsFailure(payload.requestId, stderr.trim().slice(0, 120) || `exit-${code}`);
                finish();
                return;
            }

            const parsed = parseTtsLocalStdout(stdout);
            if (!parsed.ok || !parsed.audioPath) {
                safeUnlink(outPath);
                postTtsFailure(payload.requestId, parsed.error || 'parse-failed');
                finish();
                return;
            }

            const audioPath = parsed.audioPath;
            if (!isSafeTtsOutputPath(audioPath, wsPath) || !fs.existsSync(audioPath)) {
                safeUnlink(outPath);
                safeUnlink(audioPath);
                postTtsFailure(payload.requestId, 'audio-path-rejected');
                finish();
                return;
            }

            try {
                const buf = fs.readFileSync(audioPath);
                if (buf.length > MAX_TTS_AUDIO_BYTES) {
                    postTtsFailure(payload.requestId, 'audio-too-large');
                } else {
                    postTtsAudio(
                        payload.requestId,
                        buf.toString('base64'),
                        parsed.mimeType || 'audio/mpeg',
                        payload.volume
                    );
                }
            } catch (e) {
                channel.appendLine(`[local] read error: ${(e as Error).message}`);
                postTtsFailure(payload.requestId, 'read-failed');
            } finally {
                safeUnlink(audioPath);
                if (audioPath !== outPath) {
                    safeUnlink(outPath);
                }
                finish();
            }
        });

        if (child.stdin) {
            child.stdin.write(stdinPayload);
            child.stdin.end();
        }
    });
}

async function runExternalTts(payload: TtsBridgeSpeakPayload): Promise<void> {
    const caps = getTtsCapabilities();
    if (!caps.externalEnabled) {
        postTtsFailure(payload.requestId, 'external-disabled');
        return;
    }

    if (caps.externalProvider !== 'openai') {
        postTtsFailure(payload.requestId, 'provider-unsupported');
        return;
    }

    const apiKey = (await requireDeps().getTtsApiKey()).trim();
    if (!apiKey) {
        postTtsFailure(payload.requestId, 'api-key-missing');
        return;
    }

    const config = getTtsConfig();
    const defaultVoice = config.get<string>('tts.external.voice', 'alloy').trim();
    const voice = resolveOpenAiVoice(payload.voiceId, defaultVoice);
    const channel = getTtsOutputChannel();
    channel.appendLine(`[openai] speak chars=${payload.text.length} voice=${voice}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TTS_TIMEOUT_MS);

    try {
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'tts-1',
                input: payload.text,
                voice,
                response_format: 'mp3',
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errText = (await res.text()).slice(0, 200);
            channel.appendLine(`[openai] HTTP ${res.status}: ${errText}`);
            postTtsFailure(payload.requestId, `http-${res.status}`);
            return;
        }

        const arrayBuf = await res.arrayBuffer();
        if (arrayBuf.byteLength > MAX_TTS_AUDIO_BYTES) {
            postTtsFailure(payload.requestId, 'audio-too-large');
            return;
        }

        const buf = Buffer.from(arrayBuf);
        postTtsAudio(payload.requestId, buf.toString('base64'), 'audio/mpeg', payload.volume);
    } catch (e) {
        const err = e as Error;
        if (err.name === 'AbortError') {
            channel.appendLine(`[openai] timeout after ${DEFAULT_TTS_TIMEOUT_MS}ms`);
            postTtsFailure(payload.requestId, 'timeout');
            return;
        }
        channel.appendLine(`[openai] error: ${err.message}`);
        postTtsFailure(payload.requestId, 'network-error');
    } finally {
        clearTimeout(timer);
    }
}

/** Webview → extension: synthesize NPC TTS via local or external bridge. */
export async function handleRequestNpcTts(raw: unknown): Promise<void> {
    const payload = sanitizeTtsBridgePayload(raw);
    if (!payload) {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            const rid = (raw as Record<string, unknown>).requestId;
            if (typeof rid === 'string') {
                postTtsFailure(rid, 'invalid-payload');
            }
        }
        return;
    }

    if (payload.provider === 'local') {
        await runLocalTts(payload);
        return;
    }
    await runExternalTts(payload);
}

/** Output Channel smoke test for local TTS setup. */
export async function testLocalTtsBridge(): Promise<void> {
    const caps = getTtsCapabilities();
    const channel = getTtsOutputChannel();
    channel.show(true);

    if (!caps.localAvailable) {
        vscode.window.showWarningMessage(t('extension.warning.ttsLocalUnavailable'));
        channel.appendLine('[test] local TTS not configured (tts_local.py or tts.local.command missing)');
        return;
    }

    const requestId = `test-${Date.now()}`;
    await runLocalTts({
        requestId,
        text: 'Local TTS test.',
        lang: 'en-US',
        rate: 1,
        volume: 1,
        pitch: 0,
        provider: 'local',
    });
    vscode.window.showInformationMessage(t('extension.info.ttsLocalTestStarted'));
}

export function killActiveTtsProcess(): void {
    if (activeTtsProcess) {
        activeTtsProcess.kill();
        activeTtsProcess = undefined;
    }
}