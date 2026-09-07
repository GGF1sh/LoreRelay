import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { AgentConnectionApi } from './playerDelegationCore';

/** Local IPC only. The role and authority factory are fixed by the Host entrypoint. */
export async function openAgentConnection(role: 'player' | 'narrator' | 'companion',
    approve: (clientSession: string, clientName?: string) => Promise<AgentConnectionApi | undefined>) {
    const session = randomUUID();
    const secret = randomBytes(32).toString('hex');
    const root = process.platform === 'win32' ? undefined
        : fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'lorerelay-agent-'));
    if (root) fs.chmodSync(root, 0o700);
    const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\lorerelay-${role}-${session}` : path.join(root!, `${role}.sock`);
    let closed = false;
    let claimed = false;
    let phase: 'waiting' | 'approval_pending' | 'connected' | 'closed' = 'waiting';
    let clientSession: string | undefined;
    let clientName: string | undefined;
    let completedCalls = 0;
    let api: AgentConnectionApi | undefined;
    const sockets = new Set<net.Socket>();
    const cleanup = () => { if (root) try { fs.rmdirSync(root); } catch { /* never remove unknown contents */ } };
    const dispose = () => {
        if (closed) return;
        closed = true; phase = 'closed'; clearTimeout(expiry); api?.dispose();
        for (const socket of sockets) socket.destroy();
        server.close(cleanup);
    };
    let expiry = setTimeout(dispose, 5 * 60_000); expiry.unref();
    const server = net.createServer(socket => {
        if (closed || claimed || sockets.size >= 4) { socket.destroy(); return; }
        sockets.add(socket);
        let authenticated = false;
        let authorizing = false;
        let pending = 0;
        let buffer = '';
        socket.setEncoding('utf8'); socket.setTimeout(5 * 60_000, () => socket.destroy());
        const send = (value: unknown) => { if (!socket.destroyed) socket.write(JSON.stringify(value) + '\n'); };
        socket.on('error', () => socket.destroy());
        socket.on('close', () => { sockets.delete(socket); if (authenticated || authorizing) dispose(); });
        async function dispatch(value: unknown) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) { socket.destroy(); return; }
            const message = value as Record<string, unknown>;
            if (!authenticated) {
                if (authorizing || claimed || Object.keys(message).some(key => !['type', 'secret', 'clientSession', 'clientName'].includes(key))
                    || message.type !== 'hello' || typeof message.secret !== 'string' || !/^[a-f0-9]{64}$/.test(message.secret)
                    || !timingSafeEqual(Buffer.from(message.secret, 'hex'), Buffer.from(secret, 'hex'))
                    || typeof message.clientSession !== 'string' || !/^[a-f0-9-]{36}$/.test(message.clientSession)
                    || (message.clientName !== undefined && (typeof message.clientName !== 'string'
                        || !/^[\p{L}\p{N} ._@/-]{1,80}$/u.test(message.clientName)))) { socket.destroy(); return; }
                claimed = true; authorizing = true;
                clientSession = message.clientSession;
                clientName = message.clientName as string | undefined;
                phase = 'approval_pending';
                try {
                    const granted = await approve(message.clientSession, clientName);
                    if (closed || socket.destroyed || !granted) { granted?.dispose(); dispose(); return; }
                    api = granted; authenticated = true; authorizing = false;
                    phase = 'connected';
                    clearTimeout(expiry); expiry = setTimeout(dispose, 30 * 60_000); expiry.unref();
                    send({ type: 'ready', session });
                } catch { dispose(); }
                return;
            }
            if (Object.keys(message).some(key => !['id', 'session', 'tool', 'args'].includes(key))
                || message.session !== session || typeof message.id !== 'string' || !/^[a-f0-9-]{36}$/.test(message.id)
                || typeof message.tool !== 'string' || !message.args || typeof message.args !== 'object' || Array.isArray(message.args)) {
                socket.destroy(); return;
            }
            if (pending >= 16) { send({ id: message.id, session, result: { classification: 'rejected_busy' } }); return; }
            pending++;
            try { send({ id: message.id, session, result: await api!.call(message.tool, message.args) }); }
            catch { send({ id: message.id, session, result: { classification: 'rejected_forbidden' } }); }
            finally { pending--; completedCalls++; }
        }
        socket.on('data', chunk => {
            buffer += chunk;
            if (Buffer.byteLength(buffer) > 256 * 1024) { socket.destroy(); return; }
            let end: number;
            while ((end = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
                try { void dispatch(JSON.parse(line)); } catch { socket.destroy(); return; }
            }
        });
    });
    try {
        await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); });
        if (root) fs.chmodSync(endpoint, 0o600);
    } catch (error) { dispose(); throw error; }
    // Host-only observation. No game read, tool call, initialization or authority creation.
    const getAgentConnectionStatus = () => ({ phase, clientSession, clientName, completedCalls });
    return { endpoint, secret, session, dispose, getAgentConnectionStatus };
}
