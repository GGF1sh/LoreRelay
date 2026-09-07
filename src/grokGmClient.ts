import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { GmConnectionAdapter } from './gmConnectionCore';
import { prepareGrokGmProfile } from './grokGmProfile';
import { GrokAcpProtocol } from './grokAcpProtocol';
import { GrokGmStream } from './grokGmProtocolCore';

interface Options { executable: string; profileDirectory: string; workingDirectory: string; model: string; timeoutMs?: number }
type JsonObject = Record<string, any>;

/** Official ACP process. It receives text context, never a canonical workspace. */
export class GrokGmClient implements GmConnectionAdapter {
    private child?: ChildProcessWithoutNullStreams;
    private rpc?: GrokAcpProtocol;
    private sessionId?: string;
    private stream?: GrokGmStream;
    private disposed = false;
    private used = false;
    clientVersion?: string;
    reportedModel?: string;

    constructor(private readonly options: Options) {}

    loginLaunch(): { executable: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv } {
        return { executable: this.executable(), args: ['login', '--device-auth'], cwd: this.options.workingDirectory,
            env: prepareGrokGmProfile(this.options.profileDirectory, this.options.workingDirectory) };
    }

    private executable(): string {
        if (this.options.executable !== 'grok') return this.options.executable;
        const dirs = (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter)
            .map(value => value.replace(/^"|"$/g, '')).filter(value => path.isAbsolute(value));
        const home = process.env.USERPROFILE ?? process.env.HOME;
        if (home) dirs.push(path.join(home, '.grok', 'bin'));
        for (const dir of dirs) {
            const file = path.join(dir, process.platform === 'win32' ? 'grok.exe' : 'grok');
            try { if (fs.statSync(file).isFile()) return file; } catch { /* next native location */ }
        }
        throw new Error('grok_start_failed');
    }

    async initialize(): Promise<'ready' | 'login_required'> {
        if (this.disposed || this.child) throw new Error('grok_busy_or_closed');
        const env = prepareGrokGmProfile(this.options.profileDirectory, this.options.workingDirectory);
        const executable = this.executable();
        this.clientVersion = `sha256:${createHash('sha256').update(fs.readFileSync(executable)).digest('hex')}`;
        const child = spawn(executable, ['--tools', '', '--no-subagents', '--no-plan', '--disable-web-search',
            '--model', this.options.model, '--max-turns', '1', 'agent', 'stdio'], {
            cwd: this.options.workingDirectory, env, windowsHide: true, shell: false, stdio: 'pipe',
        });
        this.child = child;
        const rpc = new GrokAcpProtocol(line => child.stdin.write(line), this.options.timeoutMs ?? 180_000);
        this.rpc = rpc;
        child.stdout.on('data', (chunk: Buffer) => rpc.receive(chunk));
        // Consume diagnostics without exposing credentials, account details or model payloads.
        child.stderr.on('data', () => {});
        child.stdin.on('error', () => rpc.close('grok_write_failed'));
        child.on('error', () => rpc.close('grok_start_failed'));
        child.on('close', () => rpc.close('grok_connection_closed'));
        rpc.on('closed', () => { this.stream?.cancel(); child.kill(); });
        rpc.on('notification', (method: string, params: unknown) => {
            if (method !== 'session/update' || !this.stream || this.disposed) return;
            try { this.stream.update(params); }
            catch (error) { rpc.close(error instanceof Error ? error.message : 'grok_invalid_candidate'); }
        });
        try {
            const init = await rpc.request('initialize', { protocolVersion: 1,
                clientInfo: { name: 'lorerelay-gm', version: '2' },
                clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
            }) as JsonObject;
            if (init?.protocolVersion !== 1) throw new Error('grok_version_unsupported');
            if (Array.isArray(init.authMethods) && init.authMethods.some((method: JsonObject) => method.id === 'cached_token')) {
                await rpc.request('authenticate', { methodId: 'cached_token', _meta: { headless: true } });
            }
            const session = await rpc.request('session/new', { cwd: this.options.workingDirectory, mcpServers: [] }) as JsonObject;
            if (typeof session?.sessionId !== 'string' || !session.sessionId) throw new Error('grok_session_mismatch');
            this.sessionId = session.sessionId;
            // The selected CLI model is a request, not proof of the model actually used.
            const model = session.models?.currentModelId ?? session.configOptions?.find(
                (option: JsonObject) => option.category === 'model' || option.id === 'model')?.currentValue;
            if (model !== this.options.model) throw new Error('grok_model_unverified');
            this.reportedModel = model;
            return 'ready';
        } catch (error) {
            if (error instanceof Error && error.message === 'grok_login_required') return 'login_required';
            this.dispose();
            throw error;
        }
    }

    async generate(prompt: string, onDraft: (text: string) => void): Promise<string> {
        if (this.disposed || this.used || !this.rpc || !this.sessionId) throw new Error('grok_busy_or_closed');
        this.used = true;
        const stream = new GrokGmStream(this.sessionId, onDraft, this.options.model);
        this.stream = stream;
        try {
            const result = await this.rpc.request('session/prompt', { sessionId: this.sessionId,
                prompt: [{ type: 'text', text: prompt }] });
            if (this.disposed) throw new Error('grok_cancelled');
            return stream.finish(result);
        } finally { stream.cancel(); this.stream = undefined; }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.stream?.cancel();
        if (this.sessionId && this.used) {
            try { this.rpc?.notify('session/cancel', { sessionId: this.sessionId }); } catch { /* already closed */ }
        }
        this.rpc?.close('grok_cancelled');
        this.child?.kill();
    }
}
