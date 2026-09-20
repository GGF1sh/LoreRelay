import { EventEmitter } from 'events';
import { StringDecoder } from 'string_decoder';

/** Bounded JSONL RPC; process ownership and game authority belong to the Host. */
export class GrokAcpProtocol extends EventEmitter {
    private readonly decoder = new StringDecoder('utf8');
    private buffer = '';
    private nextId = 1;
    private closed = false;
    private pending = new Map<number, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    }>();

    constructor(private readonly write: (line: string) => void, private readonly timeoutMs = 30_000) { super(); }

    request(method: string, params: unknown): Promise<unknown> {
        if (this.closed) { return Promise.reject(new Error('grok_connection_closed')); }
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('grok_request_timeout'));
            }, this.timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            try { this.send({ id, method, params }); }
            catch { this.close('grok_write_failed'); }
        });
    }

    notify(method: string, params: unknown): void { this.send({ method, params }); }

    private send(message: unknown): void {
        if (this.closed) { throw new Error('grok_connection_closed'); }
        this.write(JSON.stringify({ jsonrpc: '2.0', ...(message as Record<string, unknown>) }) + '\n');
    }

    receive(chunk: Buffer): void {
        if (this.closed) { return; }
        this.buffer += this.decoder.write(chunk);
        // Limit a single frame and the buffered chunk before JSON parsing.
        if (Buffer.byteLength(this.buffer, 'utf8') > 4 * 1024 * 1024) {
            this.close('grok_frame_too_large'); return;
        }
        let newline: number;
        while (!this.closed && (newline = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, newline).trim();
            this.buffer = this.buffer.slice(newline + 1);
            if (!line) { continue; }
            let message: Record<string, unknown>;
            try {
                const value = JSON.parse(line);
                if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error(); }
                message = value;
                if (message.jsonrpc !== '2.0') throw new Error();
            } catch { this.close('grok_invalid_jsonl'); return; }
            if (typeof message.method === 'string') {
                if ('id' in message) {
                    // No filesystem, execution approvals, external-token refresh or dynamic tools.
                    try {
                        this.send(message.method === 'session/request_permission'
                            ? { id: message.id, result: { outcome: { outcome: 'cancelled' } } }
                            : { id: message.id, error: { code: -32601, message: 'Host capability unavailable' } });
                    }
                    catch { this.close('grok_write_failed'); return; }
                } else { this.emit('notification', message.method, message.params); }
                continue;
            }
            const call = typeof message.id === 'number' ? this.pending.get(message.id) : undefined;
            if (!call) { continue; }
            this.pending.delete(message.id as number);
            clearTimeout(call.timer);
            if ('error' in message) {
                const error = message.error as { code?: number; message?: string };
                call.reject(new Error(error?.code === -32000 && error.message === 'Authentication required'
                    ? 'grok_login_required' : 'grok_rpc_error'));
            }
            else if ('result' in message) { call.resolve(message.result); }
            else { call.reject(new Error('grok_invalid_response')); }
        }
    }

    close(reason = 'grok_connection_closed'): void {
        if (this.closed) { return; }
        this.closed = true;
        this.buffer = '';
        for (const call of this.pending.values()) {
            clearTimeout(call.timer);
            call.reject(new Error(reason));
        }
        this.pending.clear();
        this.emit('closed', reason);
    }
}

