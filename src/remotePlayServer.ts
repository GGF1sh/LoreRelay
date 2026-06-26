import * as vscode from 'vscode';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { createHash, randomBytes } from 'crypto';
import type { GameEntry, GameState, HiddenDiceEntry } from './types/GameState';
import { getWorkspacePath } from './workspacePaths';
import { getSkillDir } from './imageGenRunner';
import { getConfiguredLocale, getWebviewStrings, t } from './i18n';

function isAllowedImagePath(imagePath: string): boolean {
    const normalized = path.normalize(imagePath);
    if (!fs.existsSync(normalized)) {
        return false;
    }
    const ws = getWorkspacePath();
    if (ws) {
        const wsNorm = path.normalize(ws);
        if (normalized === wsNorm || normalized.startsWith(wsNorm + path.sep)) {
            return true;
        }
    }
    const skillDir = getSkillDir();
    if (skillDir) {
        const skillNorm = path.normalize(skillDir);
        if (normalized === skillNorm || normalized.startsWith(skillNorm + path.sep)) {
            return true;
        }
    }
    return false;
}

export interface RemotePlayServerDeps {
    extensionPath: string;
    getPanel: () => vscode.WebviewPanel | undefined;
    onPlayerInput(text: string, authorsNote?: string): Promise<void>;
    isGameOverActive(): boolean;
    isGmBusy(): boolean;
    subscriptions: vscode.Disposable[];
}

export interface RemotePlayStatus {
    running: boolean;
    port: number;
    token: string;
    urls: string[];
    clientCount: number;
}

interface WsConnection {
    id: string;
    socket: net.Socket;
    buffer: Buffer;
    lastInputAt: number;
    authenticated: boolean;
}

interface RemotePlayerState {
    entries: Array<Pick<GameEntry, 'id' | 'role' | 'sender' | 'content' | 'image'>>;
    status?: GameState['status'];
    options?: string[];
    theme?: string;
    gameOver?: GameState['gameOver'];
    latestImage?: string;
    background?: string;
    hiddenDice?: HiddenDiceEntry[];
    locale: string;
}

let deps: RemotePlayServerDeps | undefined;
let httpServer: http.Server | undefined;
let sessionToken = '';
let listenPort = 0;
let listenHost = '0.0.0.0';
let outputChannel: vscode.OutputChannel | undefined;
const wsClients = new Map<string, WsConnection>();
let lastBroadcastState: RemotePlayerState | undefined;
let gmBusyFlag = false;

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
};

export function initRemotePlayServer(serverDeps: RemotePlayServerDeps): void {
    deps = serverDeps;
}

function requireDeps(): RemotePlayServerDeps {
    if (!deps) {
        throw new Error('initRemotePlayServer must be called before using remote play');
    }
    return deps;
}

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Text Adventure: Remote Play');
        deps?.subscriptions.push(outputChannel);
    }
    return outputChannel;
}

function log(line: string): void {
    getOutputChannel().appendLine(line);
}

function getConfig() {
    const config = vscode.workspace.getConfiguration('textAdventure');
    return {
        port: config.get<number>('remotePlay.port', 9473),
        bindAddress: config.get<string>('remotePlay.bindAddress', '0.0.0.0').trim() || '0.0.0.0',
        maxClients: Math.max(1, Math.min(32, config.get<number>('remotePlay.maxClients', 8))),
        inputCooldownMs: Math.max(500, config.get<number>('remotePlay.inputCooldownMs', 1500))
    };
}

function getLanAddresses(port: number): string[] {
    const urls: string[] = [`http://127.0.0.1:${port}/`];
    const ifaces = os.networkInterfaces();
    for (const entries of Object.values(ifaces)) {
        if (!entries) {
            continue;
        }
        for (const iface of entries) {
            if (iface.family !== 'IPv4' || iface.internal) {
                continue;
            }
            urls.push(`http://${iface.address}:${port}/`);
        }
    }
    return [...new Set(urls)];
}

function buildAccessUrl(base: string): string {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}token=${encodeURIComponent(sessionToken)}`;
}

function resolveMediaHttpUrl(imagePath: string | undefined): string | undefined {
    if (!imagePath || !sessionToken) {
        return undefined;
    }
    const normalized = path.normalize(imagePath);
    if (!isAllowedImagePath(normalized)) {
        return undefined;
    }
    // Relative URL so LAN phones resolve against their current host (not 127.0.0.1).
    const rel = encodeURIComponent(normalized);
    return `/media?token=${encodeURIComponent(sessionToken)}&file=${rel}`;
}

function buildRemotePlayerState(state: GameState, entries: GameEntry[]): RemotePlayerState {
    const locale = getConfiguredLocale();
    const mappedEntries = entries.map((entry) => {
        const row: RemotePlayerState['entries'][number] = {
            id: entry.id,
            role: entry.role,
            sender: entry.sender,
            content: entry.content
        };
        const imageUrl = resolveMediaHttpUrl(entry.image);
        if (imageUrl) {
            row.image = imageUrl;
        }
        return row;
    });

    const hiddenDice: HiddenDiceEntry[] | undefined =
        Array.isArray(state.hiddenDice)
            ? state.hiddenDice.map((dice, idx) => ({
                id: String((dice as HiddenDiceEntry).id || `hd-${idx}`),
                notation: String((dice as HiddenDiceEntry).notation ?? ''),
                ...((dice as HiddenDiceEntry).purpose !== undefined
                    ? { purpose: String((dice as HiddenDiceEntry).purpose) }
                    : {})
            }))
            : undefined;

    return {
        entries: mappedEntries,
        status: state.status,
        options: Array.isArray(state.options) ? [...state.options] : undefined,
        theme: state.theme,
        gameOver: state.gameOver,
        latestImage: resolveMediaHttpUrl(state.latestImage),
        background: resolveMediaHttpUrl(state.background),
        hiddenDice,
        locale
    };
}

function wsSend(socket: net.Socket, payload: string): void {
    const data = Buffer.from(payload, 'utf-8');
    const header = data.length < 126
        ? Buffer.from([0x81, data.length])
        : data.length < 65536
            ? Buffer.from([0x81, 126, (data.length >> 8) & 0xff, data.length & 0xff])
            : (() => {
                const buf = Buffer.alloc(10);
                buf[0] = 0x81;
                buf[1] = 127;
                buf.writeUInt32BE(0, 2);
                buf.writeUInt32BE(data.length, 6);
                return buf;
            })();
    socket.write(Buffer.concat([header, data]));
}

function broadcast(message: Record<string, unknown>): void {
    const payload = JSON.stringify(message);
    for (const client of wsClients.values()) {
        if (client.authenticated && !client.socket.destroyed) {
            try {
                wsSend(client.socket, payload);
            } catch {
                // client will be cleaned up on close
            }
        }
    }
}

function sendToClient(client: WsConnection, message: Record<string, unknown>): void {
    if (!client.authenticated || client.socket.destroyed) {
        return;
    }
    wsSend(client.socket, JSON.stringify(message));
}

function closeClient(client: WsConnection, code = 1000, reason = ''): void {
    wsClients.delete(client.id);
    if (!client.socket.destroyed) {
        client.socket.destroy();
    }
    log(`Client disconnected (${client.id}). Active: ${wsClients.size}. ${reason ? reason : ''}`.trim());
    void code;
}

function handleWsData(client: WsConnection, chunk: Buffer): void {
    client.buffer = Buffer.concat([client.buffer, chunk]);

    while (client.buffer.length >= 2) {
        const b0 = client.buffer[0];
        const b1 = client.buffer[1];
        const opcode = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let payloadLen = b1 & 0x7f;
        let offset = 2;

        if (payloadLen === 126) {
            if (client.buffer.length < 4) {
                return;
            }
            payloadLen = client.buffer.readUInt16BE(2);
            offset = 4;
        } else if (payloadLen === 127) {
            if (client.buffer.length < 10) {
                return;
            }
            const high = client.buffer.readUInt32BE(2);
            if (high !== 0) {
                closeClient(client, 1009, 'Frame too large');
                return;
            }
            payloadLen = client.buffer.readUInt32BE(6);
            offset = 10;
        }

        const maskLen = masked ? 4 : 0;
        const frameLen = offset + maskLen + payloadLen;
        if (client.buffer.length < frameLen) {
            return;
        }

        let payload = client.buffer.subarray(offset + maskLen, frameLen);
        if (masked) {
            const mask = client.buffer.subarray(offset, offset + 4);
            payload = Buffer.from(payload);
            for (let i = 0; i < payload.length; i++) {
                payload[i] ^= mask[i % 4];
            }
        }

        client.buffer = client.buffer.subarray(frameLen);

        if (opcode === 0x8) {
            closeClient(client);
            return;
        }
        if (opcode === 0x9) {
            const pongHeader = Buffer.from([0x8a, payload.length]);
            client.socket.write(Buffer.concat([pongHeader, payload]));
            continue;
        }
        if (opcode !== 0x1) {
            continue;
        }

        void handleWsMessage(client, payload.toString('utf-8'));
    }
}

async function handleWsMessage(client: WsConnection, raw: string): Promise<void> {
    let msg: Record<string, unknown>;
    try {
        msg = JSON.parse(raw);
    } catch {
        sendToClient(client, { type: 'error', message: 'Invalid JSON' });
        return;
    }

    if (!client.authenticated) {
        if (msg.type === 'auth' && msg.token === sessionToken) {
            client.authenticated = true;
            sendToClient(client, {
                type: 'welcome',
                locale: getConfiguredLocale(),
                strings: getWebviewStrings(getConfiguredLocale()),
                gmBusy: gmBusyFlag
            });
            if (lastBroadcastState) {
                sendToClient(client, { type: 'state', state: lastBroadcastState, gmBusy: gmBusyFlag });
            }
            log(`Client authenticated (${client.id}). Active: ${wsClients.size}`);
        } else {
            sendToClient(client, { type: 'error', message: 'Unauthorized' });
            closeClient(client, 1008, 'Bad token');
        }
        return;
    }

    const d = requireDeps();
    const cfg = getConfig();

    switch (msg.type) {
        case 'ping':
            sendToClient(client, { type: 'pong' });
            break;
        case 'selectOption':
        case 'freeInput': {
            if (d.isGmBusy()) {
                sendToClient(client, { type: 'error', message: 'GM is busy' });
                return;
            }
            if (d.isGameOverActive()) {
                sendToClient(client, { type: 'error', message: 'Game over' });
                return;
            }
            const now = Date.now();
            if (now - client.lastInputAt < cfg.inputCooldownMs) {
                sendToClient(client, { type: 'error', message: 'Too fast' });
                return;
            }
            const text = typeof msg.text === 'string' ? msg.text.trim() : '';
            if (!text || text.length > 2000) {
                sendToClient(client, { type: 'error', message: 'Invalid input' });
                return;
            }
            client.lastInputAt = now;
            const authorsNote = typeof msg.authorsNote === 'string' ? msg.authorsNote : undefined;
            sendToClient(client, { type: 'inputAccepted', text });
            broadcast({ type: 'remoteInput', text, clientId: client.id });
            d.getPanel()?.webview.postMessage({ type: 'remoteInput', text });
            await d.onPlayerInput(text, authorsNote);
            break;
        }
        default:
            break;
    }
}

function acceptWebSocket(req: http.IncomingMessage, socket: net.Socket, head: Buffer): void {
    const cfg = getConfig();
    if (wsClients.size >= cfg.maxClients) {
        socket.write('HTTP/1.1 503 Too Many Clients\r\n\r\n');
        socket.destroy();
        return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
    }

    const digest = createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${digest}\r\n\r\n`
    );

    if (head.length > 0) {
        socket.unshift(head);
    }

    const client: WsConnection = {
        id: randomBytes(4).toString('hex'),
        socket,
        buffer: Buffer.alloc(0),
        lastInputAt: 0,
        authenticated: false
    };
    wsClients.set(client.id, client);

    socket.on('data', (chunk) => handleWsData(client, chunk as Buffer));
    socket.on('close', () => closeClient(client));
    socket.on('error', () => closeClient(client));

    sendToClient(client, { type: 'authRequired' });
}

function serveStatic(extensionPath: string, relPath: string, res: http.ServerResponse): boolean {
    const safe = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(extensionPath, 'remote-player', safe);
    if (!filePath.startsWith(path.join(extensionPath, 'remote-player'))) {
        return false;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return false;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
    return true;
}

function serveMedia(reqUrl: URL, res: http.ServerResponse): void {
    const token = reqUrl.searchParams.get('token') || '';
    if (token !== sessionToken) {
        res.writeHead(401);
        res.end('Unauthorized');
        return;
    }
    const file = reqUrl.searchParams.get('file') || '';
    if (!file) {
        res.writeHead(400);
        res.end('Missing file');
        return;
    }
    const normalized = path.normalize(decodeURIComponent(file));
    if (!isAllowedImagePath(normalized)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    const ext = path.extname(normalized).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'private, max-age=300' });
    fs.createReadStream(normalized).pipe(res);
}

export function getRemotePlayStatus(): RemotePlayStatus {
    return {
        running: Boolean(httpServer),
        port: listenPort,
        token: sessionToken,
        urls: httpServer ? getLanAddresses(listenPort).map(buildAccessUrl) : [],
        clientCount: wsClients.size
    };
}

export async function startRemotePlayServer(): Promise<RemotePlayStatus> {
    if (httpServer) {
        return getRemotePlayStatus();
    }

    if (!vscode.workspace.isTrusted) {
        throw new Error(t('extension.error.untrustedWorkspace'));
    }
    if (!getWorkspacePath()) {
        throw new Error(t('extension.error.workspaceRequired'));
    }

    const d = requireDeps();
    const cfg = getConfig();
    sessionToken = randomBytes(16).toString('hex');
    listenPort = cfg.port;
    listenHost = cfg.bindAddress;

    httpServer = http.createServer((req, res) => {
        try {
            const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

            if (reqUrl.pathname === '/media') {
                serveMedia(reqUrl, res);
                return;
            }

            if (reqUrl.pathname === '/ws') {
                res.writeHead(426);
                res.end('Upgrade Required');
                return;
            }

            let rel = reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname.replace(/^\//, '');
            if (!serveStatic(d.extensionPath, rel, res)) {
                res.writeHead(404);
                res.end('Not Found');
            }
        } catch (e) {
            res.writeHead(500);
            res.end('Server Error');
            log(`HTTP error: ${e}`);
        }
    });

    httpServer.on('upgrade', (req, socket, head) => {
        const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        if (reqUrl.pathname !== '/ws') {
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
        }
        acceptWebSocket(req, socket as net.Socket, head);
    });

    await new Promise<void>((resolve, reject) => {
        httpServer!.listen(listenPort, listenHost, () => resolve());
        httpServer!.on('error', reject);
    });

    const urls = getLanAddresses(listenPort).map(buildAccessUrl);
    log(`Remote play started on ${listenHost}:${listenPort}`);
    for (const url of urls) {
        log(`  → ${url}`);
    }
    log(`  WebSocket: ws://127.0.0.1:${listenPort}/ws?token=${sessionToken}`);

    return getRemotePlayStatus();
}

export function stopRemotePlayServer(): void {
    for (const client of [...wsClients.values()]) {
        closeClient(client, 1001, 'Server stopping');
    }
    if (httpServer) {
        httpServer.close();
        httpServer = undefined;
    }
    sessionToken = '';
    listenPort = 0;
    lastBroadcastState = undefined;
    gmBusyFlag = false;
    log('Remote play stopped.');
}

export function pushGameStateToRemoteClients(state: GameState, entries: GameEntry[]): void {
    if (!httpServer) {
        return;
    }
    const remoteState = buildRemotePlayerState(state, entries);
    lastBroadcastState = remoteState;
    broadcast({ type: 'state', state: remoteState, gmBusy: gmBusyFlag });
}

export function notifyRemoteGmBusy(busy: boolean): void {
    gmBusyFlag = busy;
    if (!httpServer) {
        return;
    }
    broadcast({ type: 'gmBusy', busy });
}

export function disposeRemotePlayServer(): void {
    stopRemotePlayServer();
}