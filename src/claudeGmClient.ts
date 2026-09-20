import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';
import type { GmConnectionAdapter } from './gmConnectionCore';

interface Options { executable: string; profileDirectory: string; workingDirectory: string; model: string; timeoutMs?: number }

/** Official CLI only; no SDK token extraction, API fallback, canonical paths or external tools. */
export class ClaudeGmClient implements GmConnectionAdapter {
    private process?: ChildProcessWithoutNullStreams;
    private disposed = false;
    private authenticated = false;
    private rejectActive?: (error: Error) => void;
    clientVersion?: string;
    reportedModel?: string;

    constructor(private readonly options: Options) {}

    private executable(): string {
        if (process.platform !== 'win32' || this.options.executable !== 'claude') return this.options.executable;
        const directories = (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter)
            .map(value => value.replace(/^"|"$/g, '')).filter(value => path.isAbsolute(value));
        if (process.env.APPDATA) directories.push(path.join(process.env.APPDATA, 'npm'));
        for (const directory of directories) {
            for (const candidate of [path.join(directory, 'claude.exe'), path.join(directory, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')]) {
                try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* next installed location */ }
            }
        }
        throw new Error('claude_start_failed');
    }

    private environment(): NodeJS.ProcessEnv {
        const env: NodeJS.ProcessEnv = {};
        for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
            if (process.env[key]) env[key] = process.env[key];
        }
        env.CLAUDE_CONFIG_DIR = this.options.profileDirectory;
        env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
        return env;
    }

    private isolationArgs(): string[] {
        // --bare excludes subscription auth. Safe mode retains it while removing customizations.
        return ['--safe-mode', '--setting-sources', '', '--settings', JSON.stringify({ disableAllHooks: true, autoMemoryEnabled: false }),
            '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', '', '--disallowedTools', '*', '--disable-slash-commands'];
    }

    private run(args: string[], input = '', onLine?: (line: string) => void, timeoutMs = 30_000): Promise<{ output: string; code: number | null }> {
        if (this.disposed || this.process) return Promise.reject(new Error('claude_busy_or_closed'));
        return new Promise((resolve, reject) => {
            let child: ChildProcessWithoutNullStreams;
            try { child = spawn(this.executable(), args, { cwd: this.options.workingDirectory,
                env: this.environment(), shell: false, windowsHide: true, stdio: 'pipe' }); }
            catch { reject(new Error('claude_start_failed')); return; }
            this.process = child;
            let settled = false, output = '', buffer = '', bytes = 0;
            const decoder = new StringDecoder('utf8');
            const finish = (error?: Error, code: number | null = null) => {
                if (settled) return;
                settled = true; clearTimeout(timer);
                if (this.process === child) this.process = undefined;
                this.rejectActive = undefined;
                if (error) { child.kill(); reject(error); } else resolve({ output, code });
            };
            this.rejectActive = error => finish(error);
            const timer = setTimeout(() => finish(new Error('claude_timeout')), timeoutMs);
            child.stdout.on('data', (chunk: Buffer) => {
                bytes += chunk.length;
                if (bytes > 4 * 1024 * 1024) { finish(new Error('claude_response_too_large')); return; }
                const text = decoder.write(chunk); output += text; buffer += text;
                let newline: number;
                while (!settled && (newline = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
                    try { if (line.trim()) onLine?.(line); }
                    catch (error) { finish(error instanceof Error && error.message.startsWith('claude_') ? error : new Error('claude_invalid_candidate')); }
                }
            });
            child.stderr.on('data', () => {}); // Never forward auth URLs, prompts or account details.
            child.stdin.on('error', () => finish(new Error('claude_write_failed')));
            child.on('error', () => finish(new Error('claude_start_failed')));
            child.on('close', code => {
                if (settled) return;
                try { if (buffer.trim()) onLine?.(buffer); }
                catch (error) { finish(error instanceof Error && error.message.startsWith('claude_') ? error : new Error('claude_invalid_candidate')); return; }
                finish(undefined, code);
            });
            child.stdin.end(input);
        });
    }

    async initialize(): Promise<'ready' | 'login_required'> {
        const version = await this.run(['--version']);
        this.clientVersion = version.output.match(/\b\d+\.\d+\.\d+\b/)?.[0];
        if (version.code !== 0 || !this.clientVersion) throw new Error('claude_version_unsupported');
        const help = await this.run(['--help']);
        if (help.code !== 0 || !['--safe-mode', '--strict-mcp-config', '--tools', '--no-session-persistence', '--output-format']
            .every(flag => help.output.includes(flag))) throw new Error('claude_version_unsupported');
        return this.checkAuthentication();
    }

    async checkAuthentication(): Promise<'ready' | 'login_required'> {
        this.authenticated = false;
        const result = await this.run([...this.isolationArgs(), 'auth', 'status']);
        let auth: any;
        try { auth = JSON.parse(result.output); } catch { throw new Error('claude_auth_unavailable'); }
        if (auth.loggedIn === false) return 'login_required';
        if (result.code !== 0 || auth.loggedIn !== true || auth.authMethod !== 'claude.ai' || auth.apiProvider !== 'firstParty') {
            throw new Error('claude_subscription_auth_required');
        }
        this.authenticated = true; return 'ready';
    }

    async login(): Promise<void> {
        const result = await this.run([...this.isolationArgs(), 'auth', 'login', '--claudeai'], '', undefined, 600_000);
        if (result.code !== 0 || await this.checkAuthentication() !== 'ready') throw new Error('claude_login_required');
    }

    async generate(prompt: string, onDraft: (text: string) => void): Promise<string> {
        if (!this.authenticated) throw new Error('claude_subscription_auth_required');
        if (Buffer.byteLength(prompt, 'utf8') > 4 * 1024 * 1024) throw new Error('claude_context_limit');
        let session: string | undefined, final: string | undefined, failed = false;
        const result = await this.run([...this.isolationArgs(), '-p', '--output-format', 'stream-json', '--verbose',
            '--include-partial-messages', '--no-session-persistence', '--max-turns', '1', '--model', this.options.model,
            '--system-prompt', 'Follow the role and response format in the supplied LoreRelay context. Do not use tools.'], prompt, line => {
            const event = JSON.parse(line);
            if (event.type === 'rate_limit_event' && event.rate_limit_info?.status === 'rejected') throw new Error('claude_usage_limit');
            if (event.type === 'system' && event.subtype === 'init') {
                if (session || typeof event.session_id !== 'string' || event.model !== this.options.model
                    || (Array.isArray(event.tools) && event.tools.length)) throw new Error('identity_or_capabilities');
                session = event.session_id; this.reportedModel = event.model;
            }
            if (event.session_id && session && event.session_id !== session) throw new Error('session_mismatch');
            if (event.type === 'stream_event' && event.event?.delta?.type === 'text_delta') onDraft(event.event.delta.text);
            if (event.type === 'result') {
                if (!session || event.session_id !== session || event.is_error || event.subtype !== 'success') { failed = true; return; }
                if (typeof event.result !== 'string' || (final !== undefined && final !== event.result)) throw new Error('conflicting_candidate');
                final = event.result;
            }
        }, this.options.timeoutMs ?? 180_000);
        if (result.code !== 0 || failed || !final?.trim()) throw new Error('claude_turn_failed');
        return final;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.rejectActive?.(new Error('claude_cancelled'));
        this.process?.kill(); this.process = undefined;
    }
}
