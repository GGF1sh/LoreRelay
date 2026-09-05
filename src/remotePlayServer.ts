import * as vscode from 'vscode';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes, timingSafeEqual } from 'crypto';
import type { MapOverlaySnapshot } from './mapOverlayCore';
import { buildWorkspaceMapOverlay } from './mapOverlayBridge';
import type { GameEntry, GameState, HiddenDiceEntry } from './types/GameState';
import { getWorkspacePath } from './workspacePaths';
import { getConfiguredLocale, getWebviewStrings, t } from './i18n';
import { IMAGE_MIME, isAllowedImagePath, resolveAllowedImagePath } from './mediaPaths';
import {
    buildSignedMediaPath,
    clampMediaUrlTtlSec,
    verifyMediaSignature,
} from './remoteMediaSignatureCore';

export interface RemotePlayServerDeps {
    extensionPath: string;
    getPanel: () => vscode.WebviewPanel | undefined;
    onPlayerInput(text: string, authorsNote?: string): Promise<void>;
    isGameOverActive(): boolean;
    isGmBusy(): boolean;
    subscriptions: vscode.Disposable[];
}

export type RemotePlayRole = 'player' | 'spectator';

export interface RemotePlayClientInfo {
    id: string;
    role: RemotePlayRole;
}

export interface RemotePlayStatus {
    running: boolean;
    port: number;
    token: string;
    urls: string[];
    spectatorUrls: string[];
    clientCount: number;
    clients: RemotePlayClientInfo[];
}

interface WsConnection {
    id: string;
    socket: WebSocket;
    lastInputAt: number;
    authenticated: boolean;
    role: RemotePlayRole;
    authTimer?: NodeJS.Timeout;
}

interface LogicalMediaRef { readonly id: string; }

// Logical snapshots contain only opaque references, never filesystem paths or signed URLs.
interface RemotePlayerState<Media = string> {
    entries: Array<Pick<GameEntry, 'id' | 'role' | 'sender' | 'content'> & { image?: Media }>;
    status?: GameState['status'];
    options?: string[];
    theme?: string;
    gameOver?: GameState['gameOver'];
    latestImage?: Media;
    background?: Media;
    hiddenDice?: HiddenDiceEntry[];
    locale: string;
    /** FoW-safe map overlay snapshot (M2 choke point). */
    mapOverlay?: MapOverlaySnapshot;
}

let deps: RemotePlayServerDeps | undefined;
let httpServer: http.Server | undefined;
let sessionToken = '';
let spectatorToken = '';
let mediaSigningSecret = '';
const mediaFiles = new Map<string, string>();
let listenPort = 0;
let listenHost = '0.0.0.0';
let wss: WebSocketServer | undefined;
let outputChannel: vscode.OutputChannel | undefined;
const wsClients = new Map<string, WsConnection>();
let lastBroadcastState: RemotePlayerState<LogicalMediaRef> | undefined;
let gmBusyFlag = false;
let remoteInputLocked = false;
let remoteInputLockTimer: NodeJS.Timeout | undefined;
const REMOTE_INPUT_LOCK_MS = 60_000;

function countAuthenticatedClients(): number {
    let count = 0;
    for (const client of wsClients.values()) {
        if (client.authenticated) { count++; }
    }
    return count;
}

function releaseRemoteInputLock(reason?: string): void {
    remoteInputLocked = false;
    if (remoteInputLockTimer) {
        clearTimeout(remoteInputLockTimer);
        remoteInputLockTimer = undefined;
    }
    if (reason) {
        log(reason);
    }
}

function acquireRemoteInputLock(): void {
    remoteInputLocked = true;
    if (remoteInputLockTimer) {
        clearTimeout(remoteInputLockTimer);
    }
    remoteInputLockTimer = setTimeout(() => {
        if (remoteInputLocked) {
            releaseRemoteInputLock('Remote input lock watchdog released lock after 60s');
        }
    }, REMOTE_INPUT_LOCK_MS);
}

function tokensMatch(provided: unknown, expected: string): boolean {
    if (typeof provided !== 'string' || provided.length !== expected.length) {
        return false;
    }
    try {
        return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
        return false;
    }
}

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
        outputChannel = vscode.window.createOutputChannel('LoreRelay: Remote Play');
        deps?.subscriptions.push(outputChannel);
    }
    return outputChannel;
}

function log(line: string): void {
    getOutputChannel().appendLine(line);
}

function getConfig() {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const rawRole = config.get<string>('remotePlay.defaultRole', 'player').trim().toLowerCase();
    const defaultRole: RemotePlayRole = rawRole === 'spectator' ? 'spectator' : 'player';
    return {
        port: config.get<number>('remotePlay.port', 9473),
        bindAddress: config.get<string>('remotePlay.bindAddress', '127.0.0.1').trim() || '127.0.0.1',
        maxClients: Math.max(1, Math.min(32, config.get<number>('remotePlay.maxClients', 8))),
        inputCooldownMs: Math.max(500, config.get<number>('remotePlay.inputCooldownMs', 1500)),
        mediaUrlTtlSec: clampMediaUrlTtlSec(config.get<number>('remotePlay.mediaUrlTtlSec', 300)),
        defaultRole
    };
}

function isLocalhostBind(host: string): boolean {
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function getAccessBaseUrls(port: number, bindHost: string): string[] {
    const urls: string[] = [`http://127.0.0.1:${port}/`];
    if (!isLocalhostBind(bindHost)) {
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
    }
    return [...new Set(urls)];
}

function buildAccessUrl(base: string, role?: RemotePlayRole): string {
    const sep = base.includes('?') ? '&' : '?';
    const token = role === 'spectator' ? spectatorToken : sessionToken;
    let url = `${base}${sep}token=${encodeURIComponent(token)}`;
    if (role === 'spectator') {
        url += '&role=spectator';
    }
    return url;
}

function registerMedia(imagePath: string | undefined): LogicalMediaRef | undefined {
    if (!imagePath || !sessionToken) {
        return undefined;
    }
    const normalized = path.normalize(imagePath);
    if (!isAllowedImagePath(normalized)) {
        return undefined;
    }
    for (const [id, file] of mediaFiles) {
        if (file === normalized) { return { id }; }
    }
    const id = randomBytes(16).toString('hex');
    mediaFiles.set(id, normalized);
    return { id };
}

function materializeRemotePlayerState(snapshot: RemotePlayerState<LogicalMediaRef>): RemotePlayerState {
    const ttl = getConfig().mediaUrlTtlSec;
    const url = (ref: LogicalMediaRef | undefined): string | undefined =>
        ref && mediaFiles.has(ref.id) ? buildSignedMediaPath(ref.id, mediaSigningSecret, ttl) : undefined;
    return {
        ...snapshot,
        entries: snapshot.entries.map(({ image, ...entry }) => ({ ...entry, image: url(image) })),
        latestImage: url(snapshot.latestImage),
        background: url(snapshot.background),
    };
}

function buildRemotePlayerState(state: GameState, entries: GameEntry[]): RemotePlayerState<LogicalMediaRef> {
    const locale = getConfiguredLocale();
    const mappedEntries = entries.map((entry) => {
        const row: RemotePlayerState<LogicalMediaRef>['entries'][number] = {
            id: entry.id,
            role: entry.role,
            sender: entry.sender,
            content: entry.content
        };
        const imageUrl = registerMedia(entry.image);
        if (imageUrl) {
            row.image = imageUrl;
        }
        return row;
    });

    const hiddenDice: HiddenDiceEntry[] | undefined =
        Array.isArray(state.hiddenDice)
            ? state.hiddenDice
                .filter((dice): dice is HiddenDiceEntry =>
                    typeof dice === 'object' && dice !== null && typeof (dice as HiddenDiceEntry).notation === 'string'
                )
                .map((dice, idx) => ({
                    id: String(dice.id || `hd-${idx}`),
                    notation: String(dice.notation ?? ''),
                    ...(dice.purpose !== undefined ? { purpose: String(dice.purpose) } : {}),
                }))
            : undefined;

    const currentLocationId = typeof state.world?.currentLocationId === 'string'
        ? state.world.currentLocationId
        : undefined;

    return {
        entries: mappedEntries,
        status: state.status,
        options: Array.isArray(state.options) ? [...state.options] : undefined,
        theme: state.theme,
        gameOver: state.gameOver,
        latestImage: registerMedia(state.latestImage),
        background: registerMedia(state.background),
        hiddenDice,
        locale,
        mapOverlay: buildWorkspaceMapOverlay(currentLocationId),
    };
}

function broadcast(message: Record<string, unknown>): void {
    const payload = JSON.stringify(message);
    for (const client of wsClients.values()) {
        if (client.authenticated && client.socket.readyState === WebSocket.OPEN) {
            try {
                client.socket.send(payload);
            } catch {
                // client will be cleaned up on close
            }
        }
    }
}

function sendToClient(
    client: WsConnection,
    message: Record<string, unknown>,
    force = false,
    callback?: (err?: Error) => void
): void {
    if ((!client.authenticated && !force) || client.socket.readyState !== WebSocket.OPEN) {
        if (callback) {
            callback(new Error('Socket not open or not authenticated'));
        }
        return;
    }
    client.socket.send(JSON.stringify(message), callback);
}

function closeClient(client: WsConnection, _code = 1000, reason = ''): void {
    const wasAuthed = client.authenticated;
    wsClients.delete(client.id);
    if (client.authTimer) {
        clearTimeout(client.authTimer);
        client.authTimer = undefined;
    }
    if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.close(_code, reason);
    }
    log(`Client disconnected (${client.id}). Active: ${wsClients.size}. ${reason ? reason : ''}`.trim());
    if (wasAuthed) {
        notifyHostRemotePlayStatus();
    }
    void _code;
}

function notifyHostRemotePlayStatus(): void {
    const panel = deps?.getPanel();
    if (!panel) {
        return;
    }
    panel.webview.postMessage({ type: 'remotePlayStatus', status: getRemotePlayStatus() });
}

async function handleWsMessage(client: WsConnection, raw: string): Promise<void> {
    if (raw.length > 4000) {
        sendToClient(client, { type: 'error', message: 'Message too large' }, true, () => {
            setTimeout(() => {
                closeClient(client, 1009, 'Message size limit exceeded (max 4000 chars)');
            }, 50);
        });
        return;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        sendToClient(client, { type: 'error', message: 'Invalid JSON' }, true);
        return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        sendToClient(client, { type: 'error', message: 'Invalid message' }, true);
        return;
    }
    const msg = parsed as Record<string, unknown>;
    if (typeof msg.type !== 'string') {
        sendToClient(client, { type: 'error', message: 'Invalid message type' }, true);
        return;
    }

    if (!client.authenticated) {
        const role = tokensMatch(msg.token, sessionToken) ? 'player'
            : tokensMatch(msg.token, spectatorToken) ? 'spectator' : undefined;
        if (msg.type === 'auth' && role) {
            const cfg = getConfig();
            if (countAuthenticatedClients() >= cfg.maxClients) {
                sendToClient(client, { type: 'error', message: 'Max clients exceeded' }, true, () => {
                    closeClient(client, 1008, 'Max clients exceeded');
                });
                return;
            }
            client.role = role;
            client.authenticated = true;
            if (client.authTimer) {
                clearTimeout(client.authTimer);
                client.authTimer = undefined;
            }
            sendToClient(client, {
                type: 'welcome',
                locale: getConfiguredLocale(),
                strings: getWebviewStrings(getConfiguredLocale()),
                gmBusy: gmBusyFlag,
                role: client.role
            }, true);
            if (lastBroadcastState) {
                sendToClient(client, { type: 'state', state: materializeRemotePlayerState(lastBroadcastState), gmBusy: gmBusyFlag }, true);
            }
            log(`Client authenticated (${client.id}, role=${client.role}). Active: ${wsClients.size}`);
            notifyHostRemotePlayStatus();
        } else {
            sendToClient(client, { type: 'error', message: 'Unauthorized' }, true, () => {
                setTimeout(() => {
                    closeClient(client, 1008, 'Bad token');
                }, 50);
            });
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
            if (client.role === 'spectator') {
                sendToClient(client, { type: 'error', message: 'Spectator mode (read-only)' });
                return;
            }
            if (remoteInputLocked || d.isGmBusy()) {
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
            acquireRemoteInputLock();
            sendToClient(client, { type: 'inputAccepted', text });
            broadcast({ type: 'remoteInput', text, clientId: client.id });
            d.getPanel()?.webview.postMessage({ type: 'remoteInput', text });
            try {
                await d.onPlayerInput(text, authorsNote);
            } catch {
                log('Remote input failed');
            } finally {
                releaseRemoteInputLock();
            }
            break;
        }
        default:
            sendToClient(client, { type: 'error', message: 'Unsupported message type' });
            break;
    }
}

function serveStatic(extensionPath: string, relPath: string, res: http.ServerResponse): boolean {
    const safe = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(extensionPath, 'remote-player', safe);
    // Use path.sep suffix to prevent prefix confusion (e.g. remote-player-evil/ passing the check).
    if (!filePath.startsWith(path.join(extensionPath, 'remote-player') + path.sep)) {
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
    if (!sessionToken) {
        res.writeHead(503);
        res.end('Remote play not active');
        return;
    }

    const legacyToken = reqUrl.searchParams.get('token');
    if (legacyToken) {
        res.writeHead(401);
        res.end('Unauthorized — use signed media URLs (exp + sig)');
        return;
    }

    const file = reqUrl.searchParams.get('file') || '';
    if (!file) {
        res.writeHead(400);
        res.end('Missing file');
        return;
    }
    const expRaw = reqUrl.searchParams.get('exp') || '';
    const sig = reqUrl.searchParams.get('sig') || '';
    const exp = Number.parseInt(expRaw, 10);
    const auth = verifyMediaSignature(file, exp, sig, mediaSigningSecret);
    if (!auth.ok) {
        res.writeHead(auth.reason === 'expired' ? 403 : 401);
        res.end(auth.reason === 'expired' ? 'Expired' : 'Unauthorized');
        return;
    }
    // The signed file field is an opaque ID. Revalidate the server-owned path on every GET.
    const registeredPath = mediaFiles.get(file);
    const realPath = registeredPath ? resolveAllowedImagePath(registeredPath) : undefined;
    if (!realPath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    const ext = path.extname(realPath).toLowerCase();
    const mime = IMAGE_MIME[ext];
    if (!mime) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    const now = Math.floor(Date.now() / 1000);
    const maxAge = Math.max(0, Math.min(300, exp - now));
    res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': `private, max-age=${maxAge}`,
    });
    const stream = fs.createReadStream(realPath);
    stream.on('error', () => {
        if (!res.headersSent) {
            res.writeHead(500);
        }
        res.end();
    });
    stream.pipe(res);
}

export function rotateRemotePlayToken(): string {
    if (!httpServer) {
        throw new Error('Remote play is not running');
    }
    sessionToken = randomBytes(16).toString('hex');
    spectatorToken = randomBytes(16).toString('hex');
    mediaSigningSecret = randomBytes(32).toString('hex');
    for (const client of [...wsClients.values()]) {
        closeClient(client, 1008, 'Token rotated');
    }
    log('Remote play credentials and media signing key rotated');
    return getRemotePlayStatus().token;
}

export function getRemotePlayStatus(): RemotePlayStatus {
    const bases = httpServer ? getAccessBaseUrls(listenPort, listenHost) : [];
    // The configured default chooses which capability the host shares. It never
    // changes the authority of a credential already issued to a client.
    const defaultRole = getConfig().defaultRole;
    const defaultUrls = bases.map((b) => buildAccessUrl(b, defaultRole));
    const spectatorUrls = bases.map((b) => buildAccessUrl(b, 'spectator'));
    const clients: RemotePlayClientInfo[] = [];
    for (const client of wsClients.values()) {
        if (client.authenticated) {
            clients.push({ id: client.id, role: client.role });
        }
    }
    return {
        running: Boolean(httpServer),
        port: listenPort,
        token: defaultRole === 'spectator' ? spectatorToken : sessionToken,
        urls: defaultUrls,
        spectatorUrls,
        clientCount: clients.length,
        clients
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
    spectatorToken = randomBytes(16).toString('hex');
    mediaSigningSecret = randomBytes(32).toString('hex');
    listenPort = cfg.port;
    listenHost = cfg.bindAddress;

    if (listenHost === '0.0.0.0') {
        const warnMsg = t('extension.warning.remotePlayLanExposed') || 
            'Remote Play is exposed to the local network (0.0.0.0). Anyone on your LAN can access it if they have the token. Ensure you trust this network.';
        void vscode.window.showWarningMessage(warnMsg);
    }

    wss = new WebSocketServer({ noServer: true });
    
    wss.on('connection', (socket, req) => {
        const cfg = getConfig();
        if (countAuthenticatedClients() >= cfg.maxClients) {
            socket.close(1008, 'Max clients exceeded');
            return;
        }

        const client: WsConnection = {
            id: randomBytes(4).toString('hex'),
            socket,
            lastInputAt: 0,
            authenticated: false,
            role: cfg.defaultRole,
            authTimer: setTimeout(() => {
                if (!client.authenticated) {
                    closeClient(client, 1008, 'Auth timeout');
                }
            }, 5000)
        };
        wsClients.set(client.id, client);

        socket.on('message', (data) => {
            void Promise.resolve().then(() => handleWsMessage(client, data.toString())).catch(() => {
                // Never serialize the exception: dependency errors may contain credentials.
                // Contain failures in reporting too, so this terminal catch cannot reject.
                try { log('Remote WebSocket message failed'); } catch { /* best effort */ }
                try { closeClient(client, 1011, 'Message handling failed'); } catch { /* best effort */ }
            });
        });
        socket.on('close', () => closeClient(client));
        socket.on('error', () => closeClient(client));

        sendToClient(client, { type: 'authRequired' }, true);
    });

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
        } catch {
            res.writeHead(500);
            res.end('Server Error');
            log('Remote HTTP request failed');
        }
    });

    httpServer.on('upgrade', (req, socket, head) => {
        const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        if (reqUrl.pathname !== '/ws') {
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
        }
        if (wss) {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss!.emit('connection', ws, req);
            });
        }
    });

    await new Promise<void>((resolve, reject) => {
        httpServer!.listen(listenPort, listenHost, () => resolve());
        httpServer!.on('error', reject);
    });
    const address = httpServer.address();
    if (address && typeof address !== 'string') { listenPort = address.port; }

    const bases = getAccessBaseUrls(listenPort, listenHost);
    log(`Remote play started on ${listenHost}:${listenPort}`);
    for (const base of bases) {
        log(`  → ${base}`);
    }
    log(`  WebSocket: ws://127.0.0.1:${listenPort}/ws`);

    return getRemotePlayStatus();
}

export function stopRemotePlayServer(): void {
    for (const client of [...wsClients.values()]) {
        closeClient(client, 1001, 'Server stopping');
    }
    if (wss) {
        wss.close();
        wss = undefined;
    }
    if (httpServer) {
        httpServer.close();
        httpServer = undefined;
    }
    sessionToken = '';
    spectatorToken = '';
    mediaSigningSecret = '';
    mediaFiles.clear();
    listenPort = 0;
    lastBroadcastState = undefined;
    gmBusyFlag = false;
    releaseRemoteInputLock();
    log('Remote play stopped.');
}

export function pushGameStateToRemoteClients(state: GameState, entries: GameEntry[]): void {
    if (!httpServer) {
        return;
    }
    const remoteState = buildRemotePlayerState(state, entries);
    lastBroadcastState = remoteState;
    broadcast({ type: 'state', state: materializeRemotePlayerState(remoteState), gmBusy: gmBusyFlag });
}

export function notifyRemoteGmBusy(busy: boolean): void {
    gmBusyFlag = busy;
    if (!busy) {
        releaseRemoteInputLock();
    }
    if (!httpServer) {
        return;
    }
    broadcast({ type: 'gmBusy', busy });
}

export function disposeRemotePlayServer(): void {
    stopRemotePlayServer();
}
