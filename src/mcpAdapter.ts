import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
// Official SDK owns all MCP framing, lifecycle, schema validation and stdio.
const { McpServer } = require('@modelcontextprotocol/server');
const { StdioServerTransport } = require('@modelcontextprotocol/server/stdio');
const z = require('zod');

export async function runMcpAdapter(role: 'player' | 'narrator') {
    if (process.argv.length !== 2) throw new Error('invalid_arguments');
    const endpoint = process.env.LORERELAY_AGENT_ENDPOINT;
    const secret = process.env.LORERELAY_AGENT_SECRET;
    if (!endpoint || !secret || !/^[a-f0-9]{64}$/.test(secret)) throw new Error('connection_configuration_required');
    if (process.platform === 'win32') {
        const prefix = `\\\\.\\pipe\\lorerelay-${role}-`;
        if (!endpoint.startsWith(prefix) || !/^[a-f0-9-]{36}$/.test(endpoint.slice(prefix.length))) throw new Error('local_endpoint_required');
    } else {
        const root = path.dirname(endpoint);
        if (path.basename(endpoint) !== `${role}.sock` || !path.basename(root).startsWith('lorerelay-agent-')
            || path.dirname(root) !== fs.realpathSync.native(os.tmpdir()) || fs.lstatSync(root).isSymbolicLink()) throw new Error('local_endpoint_required');
    }
    const socket = net.createConnection(endpoint);
    const pending = new Map<string, { resolve(value: unknown): void; timer: NodeJS.Timeout }>();
    let session: string | undefined;
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    void ready.catch(() => {});
    const timer = setTimeout(() => { rejectReady(new Error('pairing_timeout')); socket.destroy(); }, 5 * 60_000);
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(JSON.stringify({ type: 'hello', secret, clientSession: randomUUID() }) + '\n'));
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
        clearTimeout(timer); rejectReady(new Error('connection_closed'));
        for (const entry of pending.values()) { clearTimeout(entry.timer); entry.resolve({ classification: 'outcome_unknown' }); }
        pending.clear();
    });
    socket.on('data', chunk => {
        buffer += chunk;
        if (Buffer.byteLength(buffer) > 512 * 1024) { socket.destroy(); return; }
        let index: number;
        while ((index = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
            try {
                const value = JSON.parse(line);
                if (!session && value.type === 'ready' && typeof value.session === 'string') {
                    session = value.session; clearTimeout(timer); resolveReady(); continue;
                }
                if (value.session !== session) continue;
                const entry = pending.get(value.id);
                if (entry) { pending.delete(value.id); clearTimeout(entry.timer); entry.resolve(value.result); }
            } catch { socket.destroy(); return; }
        }
    });
    const call = async (tool: string, args: unknown) => {
        try {
            await ready;
            if (socket.destroyed) throw new Error('connection_closed');
            const result = await new Promise<unknown>(resolve => {
                const id = randomUUID();
                const timeout = setTimeout(() => { pending.delete(id); resolve({ classification: 'outcome_unknown' }); }, 35_000);
                pending.set(id, { resolve, timer: timeout });
                socket.write(JSON.stringify({ id, session, tool, args }) + '\n');
            });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch { return { isError: true, content: [{ type: 'text', text: '{"classification":"rejected_forbidden"}' }] }; }
    };
    const server = new McpServer({ name: `lorerelay-${role}`, version: '1.0.0' });
    const actionId = z.enum(['commerce:trade', 'commerce:travel', 'commerce:end_day']);
    const schemas: Record<string, unknown> = role === 'narrator' ? { read_committed_facts: z.object({}).strict() } : {
        read_player_view: z.object({}).strict(), query_available: z.object({}).strict(),
        preview: z.object({ actionId, parameters: z.record(z.string(), z.unknown()), expectedActionSetHash: z.string().optional() }).strict(),
        execute: z.object({ actionId, parameters: z.record(z.string(), z.unknown()), requestId: z.string().min(8).max(128),
            confirmationToken: z.string(), expectedActionSetHash: z.string().optional() }).strict(),
        wait_receipt: z.object({ requestId: z.string().min(8).max(128), timeoutMs: z.number().int().min(0).max(30000) }).strict(),
    };
    for (const [tool, inputSchema] of Object.entries(schemas)) server.registerTool(tool, {
        description: tool === 'execute' ? 'Execute one preview under the explicit Host delegation; never automatically retry uncertain outcomes.'
            : 'Read or preview the Host-authorized public game state.', inputSchema,
    }, (args: unknown) => call(tool, args));
    const close = () => { socket.destroy(); void server.close(); };
    process.stdin.once('end', close); process.once('SIGINT', close); process.once('SIGTERM', close);
    await server.connect(new StdioServerTransport());
}
