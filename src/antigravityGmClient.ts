import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { StringDecoder } from 'string_decoder';
import type { GmConnectionAdapter } from './gmConnectionCore';
import { prepareAntigravityGmProfile } from './antigravityGmProfile';
import { AntigravityGmStream } from './antigravityGmProtocolCore';

interface Options { executable: string; profileDirectory: string; workingDirectory: string; model: string; timeoutMs?: number }

/** Native official agy process. Authentication is never inferred from mere executable availability. */
export class AntigravityGmClient implements GmConnectionAdapter {
    private child?: ChildProcessWithoutNullStreams;
    private disposed = false;
    private prepared = false;
    private rejectActive?: (error: Error) => void;
    clientVersion?: string;
    reportedModel?: string;

    constructor(private readonly options: Options) {}

    executable(): string {
        if (this.options.executable !== 'agy') return this.options.executable;
        const dirs = (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter)
            .map(value => value.replace(/^"|"$/g, '')).filter(value => path.isAbsolute(value));
        if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'agy', 'bin'));
        for (const dir of dirs) {
            const file = path.join(dir, process.platform === 'win32' ? 'agy.exe' : 'agy');
            try { if (fs.statSync(file).isFile()) return file; } catch { /* next official location */ }
        }
        throw new Error('antigravity_start_failed');
    }

    private run(args: string[], input = '', onLine?: (line: string) => void,
        login?: (url: string) => Promise<string | undefined>, waitForInit = false): Promise<{ output: string; code: number | null }> {
        if (this.disposed || this.child) return Promise.reject(new Error('antigravity_busy_or_closed'));
        const env = prepareAntigravityGmProfile(this.options.profileDirectory, this.options.workingDirectory);
        return new Promise((resolve, reject) => {
            let child: ChildProcessWithoutNullStreams;
            try { child = spawn(this.executable(), args, { cwd: this.options.workingDirectory, env,
                windowsHide: true, shell: false, stdio: 'pipe' }); }
            catch { reject(new Error('antigravity_start_failed')); return; }
            this.child = child;
            let settled = false, output = '', buffer = '', diagnostic = '', bytes = 0, loginStarted = false;
            let inputSent = false;
            const decoder = new StringDecoder('utf8');
            const finish = (error?: Error, code: number | null = null) => {
                if (settled) return;
                settled = true; clearTimeout(timer);
                this.rejectActive = undefined;
                if (this.child === child) this.child = undefined;
                if (error) { child.kill(); reject(error); } else resolve({ output, code });
            };
            this.rejectActive = error => finish(error);
            const timer = setTimeout(() => finish(new Error('antigravity_timeout')), this.options.timeoutMs ?? 180_000);
            child.stdout.on('data', (chunk: Buffer) => {
                if (settled) return;
                bytes += chunk.length;
                if (bytes > 4 * 1024 * 1024) { finish(new Error('antigravity_response_too_large')); return; }
                const text = decoder.write(chunk); output += text; buffer += text;
                let newline: number;
                while (!settled && (newline = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
                    try {
                        if (line.trim()) {
                            onLine?.(line);
                            // The stream validator must accept init before any GM context leaves Host.
                            if (waitForInit && !inputSent) {
                                inputSent = true; child.stdin.end(input);
                            }
                        }
                    } catch (error) {
                        finish(error instanceof Error && /^antigravity_[a-z_]+$/.test(error.message)
                            ? error : new Error('antigravity_invalid_candidate'));
                    }
                }
            });
            child.stderr.on('data', (chunk: Buffer) => {
                if (settled) return;
                // Go's flag package writes --help to stderr, even on a successful exit.
                if (args.length === 1 && args[0] === '--help') {
                    output += chunk.toString('utf8');
                    if (Buffer.byteLength(output) > 64 * 1024) finish(new Error('antigravity_version_unsupported'));
                    return;
                }
                // Recognize native unauthenticated waiting without retaining/logging OAuth URLs.
                diagnostic = (diagnostic + chunk.toString('utf8')).slice(-8192);
                if (/Authentication required|not logged into Antigravity/i.test(diagnostic)) {
                    this.prepared = false;
                    if (!login) { finish(new Error('antigravity_login_required')); return; }
                    const match = diagnostic.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?[^\s]+(?=\s)/);
                    if (match && !loginStarted) {
                        const url = new URL(match[0]);
                        if (url.searchParams.get('redirect_uri') !== 'https://antigravity.google/oauth-callback') {
                            finish(new Error('antigravity_login_origin_invalid')); return;
                        }
                        loginStarted = true; diagnostic = '';
                        void login(url.toString()).then(code => {
                            if (settled) return;
                            if (!code || code.length > 4096 || /[\r\n]/.test(code)) {
                                finish(new Error('antigravity_cancelled')); return;
                            }
                            child.stdin.end(code + '\n');
                        }, () => finish(new Error('antigravity_cancelled')));
                    }
                }
            });
            child.stdin.on('error', () => finish(new Error('antigravity_write_failed')));
            child.on('error', () => finish(new Error('antigravity_start_failed')));
            child.on('close', code => {
                if (settled) return;
                try { if (buffer.trim()) onLine?.(buffer); }
                catch (error) {
                    finish(error instanceof Error && /^antigravity_[a-z_]+$/.test(error.message)
                        ? error : new Error('antigravity_invalid_candidate')); return;
                }
                finish(undefined, code);
            });
            if (!login && !waitForInit) child.stdin.end(input);
        });
    }

    async initialize(): Promise<'ready' | 'login_required'> {
        this.prepared = false;
        const help = await this.run(['--help']);
        if (help.code !== 0 || !['--input-format', '--output-format', '--disable-slash-commands', '--agent', '--model']
            .every(flag => help.output.includes(flag))) throw new Error('antigravity_version_unsupported');
        // The CLI does not expose a version flag. Record the exact executable fingerprint.
        this.clientVersion = `sha256:${createHash('sha256').update(fs.readFileSync(this.executable())).digest('hex')}`;
        try {
            // Quota output can be present even without an account session. Never advertise
            // readiness while the actual transport exposes a tool-capable agent.
            const preflight = new AntigravityGmStream(this.options.model, () => {});
            let initialized = false;
            const probe = await this.run(['--input-format', 'stream-json', '--output-format', 'stream-json',
                '--model', this.options.model, '--agent', 'lorerelay-gm', '--disable-slash-commands'], '', line => {
                preflight.accept(line);
                if (initialized || JSON.parse(line).event !== 'init') throw new Error('antigravity_auth_unverified');
                initialized = true;
            });
            if (probe.code !== 0 || !initialized) throw new Error('antigravity_auth_unverified');
            // Official CLI-owned command; it reads quota and never asks the model a question.
            const status = await this.run(['-p', '/usage']);
            if (status.code !== 0 || !status.output.trim()) throw new Error('antigravity_auth_unverified');
            // Ready to attempt a guarded request, not proof of account authentication.
            // The native /usage command also prints default quotas while signed out.
            this.prepared = true; return 'ready';
        } catch (error) {
            if (error instanceof Error && error.message === 'antigravity_login_required') return 'login_required';
            throw error;
        }
    }

    async generate(prompt: string, onDraft: (text: string) => void): Promise<string> {
        if (!this.prepared) throw new Error('antigravity_login_required');
        if (Buffer.byteLength(prompt, 'utf8') > 4 * 1024 * 1024) throw new Error('antigravity_context_limit');
        const stream = new AntigravityGmStream(this.options.model, onDraft);
        const result = await this.run(['--input-format', 'stream-json', '--output-format', 'stream-json',
            '--model', this.options.model, '--agent', 'lorerelay-gm', '--disable-slash-commands', '--print-timeout', '3m'],
        JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n', line => stream.accept(line), undefined, true);
        const candidate = stream.finish(result.code);
        // finish succeeds only after init.model matched the requested model.
        this.reportedModel = this.options.model;
        return candidate;
    }

    async login(onLogin: (url: string) => Promise<string | undefined>): Promise<void> {
        const result = await this.run(['-p', '/usage'], '', undefined, onLogin);
        if (result.code !== 0 || !result.output.trim()) throw new Error('antigravity_auth_unverified');
        if (await this.initialize() !== 'ready') throw new Error('antigravity_login_required');
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.rejectActive?.(new Error('antigravity_cancelled'));
        this.child?.kill(); this.child = undefined;
    }
}
