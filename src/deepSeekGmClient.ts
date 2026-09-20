import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import type { GmConnectionAdapter } from './gmConnectionCore';
import { parseDeepSeekCandidate, readDeepSeekUsage } from './deepSeekGmCore';

interface Options { executable: string; script: string; workingDirectory: string; model: string; maxTokens: number;
    getApiKey: () => Promise<string>; onUsage?: (value: ReturnType<typeof readDeepSeekUsage>) => void; timeoutMs?: number }

/** Uses the existing Python API transport. The secret travels over stdin, never argv or a file. */
export class DeepSeekGmClient implements GmConnectionAdapter {
    reportedModel?: string;
    private child?: ChildProcessWithoutNullStreams;
    private disposed = false;
    private ready = false;
    private used = false;
    private awaitingKey = false;
    private rejectActive?: (error: Error) => void;
    constructor(private readonly options: Options) {}

    private async exchange(operation: 'models' | 'generate', prompt?: string): Promise<unknown> {
        if (this.disposed || this.child || this.awaitingKey) throw new Error('deepseek_busy_or_closed');
        this.awaitingKey = true;
        let apiKey: string;
        try { apiKey = await this.options.getApiKey(); } finally { this.awaitingKey = false; }
        if (this.disposed) throw new Error('deepseek_cancelled');
        if (!apiKey) throw new Error('deepseek_key_required');
        fs.mkdirSync(this.options.workingDirectory, { recursive: true });
        const env: NodeJS.ProcessEnv = { PYTHONIOENCODING: 'utf-8' };
        for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
            if (process.env[key]) env[key] = process.env[key];
        }
        return new Promise((resolve, reject) => {
            const child = spawn(this.options.executable, ['-E', '-s', '-X', 'utf8', this.options.script], {
                cwd: this.options.workingDirectory, env, windowsHide: true, shell: false, stdio: 'pipe',
            });
            this.child = child;
            let settled = false, bytes = 0;
            const chunks: Buffer[] = [];
            const finish = (error?: Error, value?: unknown) => {
                if (settled) return;
                settled = true; clearTimeout(timer); this.rejectActive = undefined; this.child = undefined;
                if (error) { child.kill(); reject(error); } else resolve(value);
            };
            this.rejectActive = error => finish(error);
            const timer = setTimeout(() => finish(new Error('deepseek_timeout')), this.options.timeoutMs ?? 120_000);
            child.stdout.on('data', (chunk: Buffer) => {
                if (settled) return;
                bytes += chunk.length;
                if (bytes > 4 * 1024 * 1024) { finish(new Error('deepseek_response_too_large')); return; }
                chunks.push(chunk);
            });
            child.stderr.on('data', () => {});
            child.on('error', () => finish(new Error('deepseek_start_failed')));
            child.stdin.on('error', () => finish(new Error('deepseek_write_failed')));
            child.on('close', code => {
                if (settled) return;
                try {
                    const reply = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    if (code !== 0 || reply.error) {
                        const reason = reply.status === 401 ? 'deepseek_key_required' : reply.status === 402 ? 'deepseek_balance_required'
                            : reply.status === 429 ? 'deepseek_rate_limit' : 'deepseek_request_failed';
                        finish(new Error(reason));
                    } else if (!reply.result || typeof reply.result !== 'object') finish(new Error('deepseek_invalid_candidate'));
                    else finish(undefined, reply.result);
                } catch { finish(new Error('deepseek_invalid_candidate')); }
            });
            child.stdin.end(JSON.stringify({ operation, apiKey, model: this.options.model, maxTokens: this.options.maxTokens, prompt }));
        });
    }

    async initialize(): Promise<'ready' | 'login_required'> {
        this.ready = false;
        try {
            const models = await this.exchange('models') as { data?: Array<{ id?: string }> };
            if (!Array.isArray(models.data) || !models.data.some(model => model.id === this.options.model)) {
                throw new Error('deepseek_model_mismatch');
            }
            this.ready = true;
            return 'ready';
        } catch (error) {
            if (error instanceof Error && error.message === 'deepseek_key_required') return 'login_required';
            throw error;
        }
    }

    async generate(prompt: string, onDraft: (text: string) => void): Promise<string> {
        if (!this.ready || this.used || this.disposed) throw new Error('deepseek_busy_or_closed');
        this.used = true;
        const result = await this.exchange('generate', prompt);
        if (this.disposed) throw new Error('deepseek_cancelled');
        this.options.onUsage?.(readDeepSeekUsage(result, this.options.model));
        const candidate = parseDeepSeekCandidate(result, this.options.model);
        this.reportedModel = candidate.reportedModel;
        onDraft(candidate.text);
        return candidate.text;
    }

    dispose(): void { this.disposed = true; this.ready = false; this.rejectActive?.(new Error('deepseek_cancelled')); this.child?.kill(); }
}
