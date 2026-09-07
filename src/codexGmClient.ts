import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CodexAppServerProtocol } from './codexAppServerProtocol';
import type { GmConnectionAdapter } from './gmConnectionCore';

/** Resolve the native Windows client without executing npm's shell wrapper. */
export function resolveCodexExecutable(executable: string): string {
    if (process.platform !== 'win32' || executable !== 'codex') { return executable; }
    const directories = (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter)
        .map(value => value.replace(/^"|"$/g, '')).filter(value => path.isAbsolute(value));
    if (process.env.APPDATA) { directories.push(path.join(process.env.APPDATA, 'npm')); }
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const triple = arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
    for (const directory of [...new Set(directories)]) {
        const roots = [path.join(directory, 'node_modules'), path.join(directory, 'node_modules', '@openai', 'codex', 'node_modules')];
        const candidates = [path.join(directory, 'codex.exe'),
            ...roots.map(root => path.join(root, '@openai', `codex-win32-${arch}`, 'vendor', triple, 'bin', 'codex.exe')),
            path.join(directory, 'node_modules', '@openai', 'codex', 'vendor', triple, 'bin', 'codex.exe')];
        for (const candidate of candidates) {
            try { if (fs.statSync(candidate).isFile()) { return candidate; } } catch { /* next installed location */ }
        }
    }
    throw new Error('codex_start_failed');
}

export interface CodexGmClientOptions {
    executable: string;
    /** Dedicated, Host-owned profile and work directory, not a campaign directory. */
    profileDirectory: string;
    workingDirectory: string;
    model: string;
    timeoutMs?: number;
}

type JsonObject = Record<string, any>;

/** One official App Server process per GM connection, with client-owned login. */
export class CodexGmClient implements GmConnectionAdapter {
    private readonly process: ChildProcessWithoutNullStreams;
    private readonly rpc: CodexAppServerProtocol;
    private running = false;
    private disposed = false;
    private authenticated = false;
    private disconnected = false;
    private loginCompleted?: { id: string; success: boolean };
    private active?: { threadId: string; turnId?: string; reject: (error: Error) => void };

    constructor(private readonly options: CodexGmClientOptions) {
        // Use a separate Codex profile: never copy credentials or inherit user plugins/hooks/MCP.
        const env: NodeJS.ProcessEnv = {};
        for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
            if (process.env[key]) { env[key] = process.env[key]; }
        }
        env.CODEX_HOME = options.profileDirectory;
        const args = ['app-server', '--stdio'];
        for (const feature of ['shell_tool', 'unified_exec', 'apps', 'plugins', 'hooks', 'multi_agent',
            'browser_use', 'browser_use_external', 'computer_use', 'in_app_browser', 'image_generation',
            'code_mode', 'memories', 'workspace_dependencies']) {
            args.push('-c', `features.${feature}=false`);
        }
        args.push('-c', 'web_search="disabled"', '-c', 'model_provider="openai"');
        this.process = spawn(resolveCodexExecutable(options.executable), args, {
            cwd: options.workingDirectory, env, shell: false, windowsHide: true, stdio: 'pipe',
        });
        this.rpc = new CodexAppServerProtocol(line => this.process.stdin.write(line));
        this.process.stdout.on('data', chunk => this.rpc.receive(chunk));
        // Provider diagnostics can contain prompts or account information. Do not forward raw stderr.
        this.process.stderr.on('data', () => {});
        this.process.stdin.on('error', () => this.rpc.close('codex_write_failed'));
        this.process.on('error', () => this.rpc.close('codex_start_failed'));
        this.process.on('close', () => this.rpc.close());
        this.rpc.on('closed', reason => { this.disconnected = true; this.active?.reject(new Error(reason)); });
        this.rpc.on('notification', (method, params) => {
            if (method === 'account/login/completed' && typeof params?.loginId === 'string' && typeof params.success === 'boolean') {
                this.loginCompleted = { id: params.loginId, success: params.success };
            }
        });
    }

    async initialize(): Promise<'ready' | 'login_required'> {
        await this.rpc.request('initialize', {
            clientInfo: { name: 'lorerelay_gm', title: 'LoreRelay GM', version: '2.0.0' },
            capabilities: { experimentalApi: true },
        });
        this.rpc.notify('initialized', {});
        return this.checkAuthentication();
    }

    async checkAuthentication(): Promise<'ready' | 'login_required'> {
        this.authenticated = false;
        const result = await this.rpc.request('account/read', { refreshToken: false }) as JsonObject;
        if (!result.account) { return 'login_required'; }
        if (result.account.type !== 'chatgpt') { throw new Error('codex_subscription_auth_required'); }
        this.authenticated = true;
        return 'ready';
    }

    async startLogin(): Promise<{ loginId: string; authUrl: string }> {
        this.loginCompleted = undefined;
        const result = await this.rpc.request('account/login/start', { type: 'chatgpt' }) as JsonObject;
        if (typeof result.loginId !== 'string' || typeof result.authUrl !== 'string') {
            throw new Error('codex_login_response_invalid');
        }
        const url = new URL(result.authUrl);
        if (url.protocol !== 'https:' || url.hostname !== 'auth.openai.com') {
            throw new Error('codex_login_origin_invalid');
        }
        return { loginId: result.loginId, authUrl: result.authUrl };
    }

    async waitForLogin(loginId: string, timeoutMs = 600_000): Promise<void> {
        if (this.disposed || this.disconnected) { throw new Error('codex_connection_closed'); }
        return new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
                clearTimeout(timer);
                this.rpc.off('notification', notification);
                this.rpc.off('closed', closed);
                if (error) { reject(error); } else { resolve(); }
            };
            const notification = (method: string) => {
                if (method === 'account/login/completed' && this.loginCompleted?.id === loginId) {
                    finish(this.loginCompleted.success ? undefined : new Error('codex_login_required'));
                }
            };
            const closed = () => finish(new Error('codex_connection_closed'));
            const timer = setTimeout(() => finish(new Error('codex_login_timeout')), timeoutMs);
            this.rpc.on('notification', notification);
            this.rpc.on('closed', closed);
            notification('account/login/completed');
        });
    }

    async generate(prompt: string, onDraft: (text: string) => void): Promise<string> {
        if (this.running || this.disposed) { throw new Error('codex_busy_or_closed'); }
        if (!this.authenticated) { throw new Error('codex_subscription_auth_required'); }
        this.running = true;
        try {
            const result = await this.rpc.request('thread/start', {
                model: this.options.model, cwd: this.options.workingDirectory,
                approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
                environments: [], dynamicTools: [],
                baseInstructions: 'You are the LoreRelay GM. Reply only to the supplied game context. Do not use tools or access files.',
            }) as JsonObject;
            const threadId = result.thread?.id;
            if (typeof threadId !== 'string' || result.model !== this.options.model) {
                throw new Error('codex_thread_or_model_mismatch');
            }
            if (this.disposed) { throw new Error('codex_cancelled'); }
            return await new Promise<string>((resolve, reject) => {
                let settled = false;
                const messages = new Map<string, string>();
                let receivedBytes = 0;
                const finish = (error?: Error) => {
                    if (settled) { return; }
                    settled = true;
                    clearTimeout(timer);
                    this.rpc.off('notification', notification);
                    this.active = undefined;
                    const answer = messages.values().next().value ?? '';
                    if (error) { reject(error); }
                    else if (!answer.trim()) { reject(new Error('codex_empty_candidate')); }
                    else { resolve(answer); }
                };
                const notification = (method: string, params: JsonObject) => {
                    if (params?.threadId !== threadId) { return; }
                    receivedBytes += Buffer.byteLength(JSON.stringify(params), 'utf8');
                    if (receivedBytes > 4 * 1024 * 1024) { finish(new Error('codex_response_too_large')); this.dispose(); return; }
                    if (method === 'turn/started') {
                        if (typeof params.turn?.id !== 'string' || (this.active?.turnId && this.active.turnId !== params.turn.id)) {
                            finish(new Error('codex_turn_identity_conflict')); return;
                        }
                        this.active!.turnId = params.turn.id;
                    }
                    if (this.active?.turnId && params.turnId && params.turnId !== this.active.turnId) { return; }
                    if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
                        try { onDraft(params.delta); }
                        catch { finish(new Error('codex_draft_delivery_failed')); this.dispose(); return; }
                    }
                    if (method === 'item/completed' && params.item?.type === 'agentMessage') {
                        if (typeof params.item.id !== 'string' || typeof params.item.text !== 'string') {
                            finish(new Error('codex_invalid_candidate')); return;
                        }
                        if (params.item.phase === 'commentary') { return; }
                        const previous = messages.get(params.item.id);
                        if (previous !== undefined && previous !== params.item.text) {
                            finish(new Error('codex_candidate_conflict')); return;
                        }
                        if (messages.size && ![...messages.values()].includes(params.item.text)) {
                            finish(new Error('codex_candidate_conflict')); return;
                        }
                        messages.set(params.item.id, params.item.text);
                    }
                    if (method === 'turn/completed') {
                        if (this.active?.turnId && params.turn?.id !== this.active.turnId) { return; }
                        const info = params.turn?.error?.codexErrorInfo;
                        const code = info === 'usageLimitExceeded' ? 'codex_usage_limit'
                            : info === 'unauthorized' ? 'codex_login_required'
                            : info === 'contextWindowExceeded' ? 'codex_context_limit'
                            : 'codex_turn_failed';
                        finish(params.turn?.status === 'completed' ? undefined : new Error(code));
                    }
                };
                const timer = setTimeout(() => { finish(new Error('codex_turn_timeout')); this.dispose(); }, this.options.timeoutMs ?? 180_000);
                this.active = { threadId, reject: error => finish(error) };
                this.rpc.on('notification', notification);
                void this.rpc.request('turn/start', {
                    threadId, input: [{ type: 'text', text: prompt }], model: this.options.model,
                    effort: 'medium',
                }).then((response: any) => {
                    if (!settled && this.active) {
                        if (typeof response.turn?.id !== 'string' || (this.active.turnId && this.active.turnId !== response.turn.id)) {
                            finish(new Error('codex_turn_identity_conflict')); return;
                        }
                        this.active.turnId = response.turn.id;
                    }
                }, error => finish(error));
            });
        } finally { this.running = false; }
    }

    dispose(): void {
        if (this.disposed) { return; }
        this.disposed = true;
        const active = this.active;
        // Invalidate the local candidate immediately; shutdown never waits for a model reply.
        this.active?.reject(new Error('codex_cancelled'));
        let terminated = false;
        const terminate = () => {
            if (terminated) { return; }
            terminated = true;
            this.rpc.close();
            this.process.stdin.end();
            this.process.kill();
        };
        if (active?.turnId) {
            const deadline = setTimeout(terminate, 500);
            void this.rpc.request('turn/interrupt', { threadId: active.threadId, turnId: active.turnId })
                .catch(() => {}).finally(() => { clearTimeout(deadline); terminate(); });
        } else { terminate(); }
    }
}
