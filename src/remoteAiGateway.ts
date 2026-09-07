import * as http from 'http';
import * as path from 'path';
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { createRemoteTunnelWitness } from './remoteTunnelWitness';
const { McpServer, WebStandardStreamableHTTPServerTransport } = require('@modelcontextprotocol/server');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const z = require('zod');

/** One Host-created, read-only session behind a separately managed HTTPS tunnel.
 * The network cannot select a role, campaign, adapter, filesystem path or command.
 */
export async function openRemoteAiGateway(role: 'companion' | 'narrator', endpoint: string, secret: string, publicOrigin?: string) {
    if (!['companion', 'narrator'].includes(role)) throw new Error('readonly_role_required');
    if (publicOrigin) {
        const url = new URL(publicOrigin);
        if (url.protocol !== 'https:' || url.origin !== publicOrigin || url.username || url.password) throw new Error('https_origin_required');
    }
    const pairingCode = randomBytes(32).toString('hex');
    const bearer = randomBytes(32).toString('hex');
    const equal = (a: unknown, b: string) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b)
        && timingSafeEqual(Buffer.from(a), Buffer.from(b));
    let paired = false;
    let closed = false;
    let activeRequests = 0;
    let origin = publicOrigin ?? '';
    let upstream: any;
    let upstreamReady: Promise<void> | undefined;
    const server = new McpServer({ name: `lorerelay-remote-${role}`, version: '1.0.0' });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true });
    const listener = http.createServer();
    let expiry = Date.now() + 5 * 60_000;
    let lastRequest = Date.now();
    let tunnel: ReturnType<typeof createRemoteTunnelWitness> | undefined;
    const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        tunnel?.close();
        listener.close();
        listener.closeAllConnections();
        void upstream?.close();
        void server.close();
    };
    let nextProbe = Date.now();
    const timer = setInterval(() => {
        if (Date.now() >= expiry || Date.now() - lastRequest >= 5 * 60_000) close();
        if (!closed && tunnel && Date.now() >= nextProbe) { nextProbe = Date.now() + 5000; void tunnel.check(); }
    }, 1000);
    timer.unref();
    server.server.oninitialized = () => {
        if (upstreamReady || closed) return;
        upstream = new Client({ name: `lorerelay-remote-${role}`, version: '1.0.0' });
        upstream.onclose = close;
        upstreamReady = upstream.connect(new StdioClientTransport({
            command: process.execPath, args: [path.join(__dirname, `${role}Mcp.js`)],
            env: { LORERELAY_AGENT_ENDPOINT: endpoint, LORERELAY_AGENT_SECRET: secret,
                ELECTRON_RUN_AS_NODE: '1', LORERELAY_CLOSE_ON_HOST_DISCONNECT: '1' }, stderr: 'pipe',
        }));
        void upstreamReady!.catch(close);
    };
    const read = async (operation: () => Promise<unknown>) => {
        if (closed || !upstreamReady || Date.now() >= expiry) throw new Error('connection_unavailable');
        try { await upstreamReady; return await operation(); }
        catch { throw new Error('public_state_unavailable'); }
    };
    const tools = role === 'companion' ? ['read_player_view', 'query_available'] : ['read_committed_facts'];
    for (const name of tools) server.registerTool(name, {
        description: 'Read Host-authorized public state. No game mutations.', inputSchema: z.object({}).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, () => read(() => upstream.callTool({ name, arguments: {} })));
    for (const name of ['player-view', 'market-report', 'world-map', 'current-region', 'recent-events']) {
        const uri = `lorerelay://${name}`;
        server.registerResource(name, uri, { mimeType: 'application/json' }, () => read(() => upstream.readResource({ uri })));
    }
    for (const name of ['plan-day', 'compare-trades', 'summarize-world', 'explain-recent-events', 'write-travel-diary']) {
        server.registerPrompt(name, { description: 'Use only Host-authorized public facts.' }, () => read(() => upstream.getPrompt({ name })));
    }
    await server.connect(transport);
    listener.requestTimeout = 40_000;
    listener.headersTimeout = 10_000;
    listener.maxHeadersCount = 32;
    listener.on('request', async (req, res) => {
        const reply = (status: number, value: object) => {
            res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(value));
        };
        if (closed || Date.now() >= expiry) { reply(401, { error: 'expired' }); return; }
        if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
            reply(403, { error: 'origin_denied' }); return;
        }
        const health = /^\/health\?probe=([a-f0-9]{32})$/.exec(req.url ?? '');
        if (health && req.method === 'GET' && tunnel) {
            res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
            res.end(`${tunnel.witness}:${health[1]}`); return;
        }
        if (activeRequests >= 4) { reply(429, { error: 'busy' }); return; }
        activeRequests++;
        try {
            if (req.url !== '/pair' && req.url !== '/mcp') { reply(404, { error: 'not_found' }); return; }
            if (req.url === '/mcp' && (!paired || !equal(req.headers.authorization, `Bearer ${bearer}`))) {
                reply(401, { error: 'unauthorized' }); return;
            }
            if (!['POST', 'DELETE'].includes(req.method ?? '') || (req.url === '/pair' && req.method !== 'POST')) {
                reply(405, { error: 'method_not_allowed' }); return;
            }
            let body = '';
            for await (const chunk of req) {
                body += chunk.toString('utf8');
                if (Buffer.byteLength(body) > 64 * 1024) { reply(413, { error: 'request_too_large' }); return; }
            }
            if (closed || Date.now() >= expiry) { reply(401, { error: 'expired' }); return; }
            if (req.url === '/pair') {
                if (tunnel && !tunnel.isReady()) { reply(503, { error: 'tunnel_not_verified' }); return; }
                const input = JSON.parse(body);
                if (paired || !input || Object.keys(input).length !== 1 || !equal(input.code, pairingCode)) {
                    reply(403, { error: 'pairing_denied' }); return;
                }
                paired = true;
                expiry = Date.now() + 30 * 60_000;
                lastRequest = Date.now();
                reply(200, { token: bearer, expiresAt: expiry, role, readOnly: true }); return;
            }
            lastRequest = Date.now();
            const headers = new Headers();
            for (const name of ['content-type', 'accept', 'mcp-session-id', 'mcp-protocol-version']) {
                const value = req.headers[name];
                if (typeof value === 'string') headers.set(name, value);
            }
            const response = await transport.handleRequest(new Request(`${origin}/mcp`, {
                method: req.method, headers, ...(body ? { body } : {}),
            }));
            res.statusCode = response.status;
            response.headers.forEach((value: string, name: string) => res.setHeader(name, value));
            res.setHeader('Cache-Control', 'no-store');
            res.end(Buffer.from(await response.arrayBuffer()));
            if (req.method === 'DELETE' && response.ok) close();
        } catch { if (!res.headersSent) reply(400, { error: 'request_failed' }); else res.end(); }
        finally { activeRequests--; }
    });
    try {
        await new Promise<void>((resolve, reject) => {
            listener.once('error', reject);
            listener.listen(0, '127.0.0.1', () => resolve());
        });
    } catch (error) { close(); throw error; }
    const port = (listener.address() as import('net').AddressInfo).port;
    origin ||= `http://127.0.0.1:${port}`;
    if (publicOrigin) tunnel = createRemoteTunnelWitness(publicOrigin, close);
    return { pairingCode, localPort: port, url: `${origin}/mcp`, close, isClosed: () => closed };
}
