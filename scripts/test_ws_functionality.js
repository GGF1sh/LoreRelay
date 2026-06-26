/**
 * WebSocket 機能テスト - maxClients, 未認証メッセージ, remoteInputLocked の検証
 */
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require('ws');

// ── vscode モック ─────────────────────────────────────────────
const WS_PATH = path.join(os.tmpdir(), `lr-rp-ws-test-${Date.now()}`);
fs.mkdirSync(WS_PATH, { recursive: true });

let mockMaxClients = 8; // 初期状態では十分に接続できるようにする

const mockVscode = {
    workspace: {
        isTrusted: true,
        workspaceFolders: [{ uri: { fsPath: WS_PATH }, name: 'test' }],
        getConfiguration: () => ({
            get: (key, def) => {
                if (key === 'remotePlay.port')        return 47295; // テスト用ポート
                if (key === 'remotePlay.bindAddress') return '127.0.0.1';
                if (key === 'remotePlay.defaultRole') return 'player';
                if (key === 'remotePlay.maxClients')  return mockMaxClients;
                if (key === 'remotePlay.inputCooldownMs') return 100;
                if (key === 'workspaceFolder')        return '';
                return def;
            }
        }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
    },
    window: {
        createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
        showWarningMessage:   (...a) => Promise.resolve(undefined),
        showInformationMessage: (...a) => Promise.resolve(undefined),
        showErrorMessage:     (...a) => Promise.resolve(undefined),
    },
    env: { language: 'en' },
    Uri: { file: (p) => ({ fsPath: p, toString: () => `file://${p}` }) },
};

// require('vscode') をフックしてモックを返す
const Module = require('module');
const _origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return mockVscode; }
    return _origLoad.apply(this, arguments);
};

const rps = require('../out/remotePlayServer');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg)   { console.log(`OK: ${msg}`); }

let mockGmBusy = false;
let mockGameOver = false;
let onPlayerInputCalled = false;
let resolvePlayerInputPromise = null;

async function run() {
    rps.initRemotePlayServer({
        extensionPath: WS_PATH,
        getPanel: () => ({
            webview: {
                postMessage: (msg) => {
                    // console.log('Webview message:', msg);
                }
            }
        }),
        onPlayerInput: async (text, note) => {
            onPlayerInputCalled = true;
            return new Promise((resolve) => {
                resolvePlayerInputPromise = resolve;
            });
        },
        isGameOverActive: () => mockGameOver,
        isGmBusy: () => mockGmBusy,
        subscriptions: [],
    });

    const status = await rps.startRemotePlayServer();
    const port = status.port;
    const token = status.token;
    const wsUrl = `ws://127.0.0.1:${port}/ws`;

    console.log(`Testing WebSocket on ${wsUrl}`);

    // テスト 1: 接続時に 'authRequired' が送られてくること (sendToClient force の検証)
    await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        let authRequiredReceived = false;

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'authRequired') {
                authRequiredReceived = true;
                ok("Test 1: authRequired received successfully on connection");
                ws.close();
                resolve();
            }
        });

        ws.on('error', (err) => {
            fail(`Test 1 connection failed: ${err.message}`);
            ws.close();
            resolve();
        });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // テスト 2: 不正なトークンでの認証エラー (Unauthorized が送られて切断されること)
    await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        let unauthorizedReceived = false;

        ws.on('message', (data) => {
            const rawStr = data.toString();
            console.log(`[Test 2 WS Message]: ${rawStr}`);
            const msg = JSON.parse(rawStr);
            if (msg.type === 'authRequired') {
                // 不正なトークンを送信
                ws.send(JSON.stringify({ type: 'auth', token: 'bad-token', role: 'player' }));
            } else if (msg.type === 'error' && msg.message === 'Unauthorized') {
                unauthorizedReceived = true;
                ok("Test 2: Unauthorized error received for bad token");
            }
        });

        ws.on('close', (code, reason) => {
            if (unauthorizedReceived) {
                ok(`Test 2: Closed by server as expected (code=${code})`);
            } else {
                fail("Test 2: Connection closed without receiving Unauthorized error");
            }
            resolve();
        });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    mockMaxClients = 1; // ここで接続上限を1に設定してテストする

    // テスト 3: 最大接続数 (maxClients = 1) の上限テスト
    // クライアント 1 を正しく認証させて接続したままにする
    const client1 = new WebSocket(wsUrl);
    await new Promise((resolve) => {
        client1.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'authRequired') {
                client1.send(JSON.stringify({ type: 'auth', token: token, role: 'player' }));
            } else if (msg.type === 'welcome') {
                ok("Client 1 authenticated successfully");
                resolve();
            }
        });
    });

    // クライアント 2 を接続しようとすると、即座にクローズされること
    await new Promise((resolve) => {
        const client2 = new WebSocket(wsUrl);
        client2.on('close', (code, reason) => {
            if (code === 1008) {
                ok(`Test 3: Client 2 connection rejected due to maxClients limit (code=${code})`);
            } else {
                fail(`Test 3: Expected code 1008 on reject, got ${code}`);
            }
            resolve();
        });
        client2.on('message', (data) => {
            fail("Test 3: Client 2 should not receive any message");
            client2.close();
            resolve();
        });
    });

    // テスト 4: try-catch-finally 安定性の検証 (remoteInputLocked の自動クリア)
    // クライアント 1 から入力を送信
    onPlayerInputCalled = false;
    client1.send(JSON.stringify({ type: 'selectOption', text: 'Hello Player' }));
    
    // 入力が受け付けられたイベントを待ち、onPlayerInput が呼ばれるのを確認
    await new Promise((resolve) => {
        const check = setInterval(() => {
            if (onPlayerInputCalled) {
                clearInterval(check);
                ok("Test 4: Input triggered onPlayerInput");
                resolve();
            }
        }, 50);
    });

    // この時点で remoteInputLocked が true であるため、次の入力は拒否されるはず
    client1.send(JSON.stringify({ type: 'selectOption', text: 'Spam Input' }));
    await new Promise((resolve) => {
        const onMsg = (data) => {
            const msg = JSON.parse(data.toString());
            console.log(`[Test 4 WS Message (Spam)]:` , msg);
            if (msg.type === 'error') {
                ok(`Test 4: Input is successfully locked: ${msg.message}`);
                client1.off('message', onMsg);
                resolve();
            }
        };
        client1.on('message', onMsg);
    });

    // onPlayerInput の promise を解決（完了させる）
    if (resolvePlayerInputPromise) {
        resolvePlayerInputPromise();
    }

    // 少し待って、remoteInputLocked が finally で解除されたことを検証するために、
    // もう一度入力を送り、受け入れられるか確認
    onPlayerInputCalled = false;
    await new Promise((resolve) => setTimeout(resolve, 600));

    const finalMsgHandler = (data) => {
        const msg = JSON.parse(data.toString());
        console.log(`[Test 4 WS Message (Final)]:` , msg);
    };
    client1.on('message', finalMsgHandler);

    client1.send(JSON.stringify({ type: 'selectOption', text: 'Next Action' }));
    await new Promise((resolve, reject) => {
        let elapsed = 0;
        const check = setInterval(() => {
            elapsed += 50;
            if (onPlayerInputCalled) {
                clearInterval(check);
                client1.off('message', finalMsgHandler);
                ok("Test 4: Input successfully unlocked and accepted new commands (finally safety verified)");
                resolve();
            }
            if (elapsed > 2000) {
                clearInterval(check);
                client1.off('message', finalMsgHandler);
                reject(new Error("Timeout waiting for Next Action to be accepted"));
            }
        }, 50);
    });

    // クリーンアップ
    client1.close();
    rps.stopRemotePlayServer();
    fs.rmSync(WS_PATH, { recursive: true, force: true });

    if (failed > 0) {
        console.error(`WebSocket tests failed: ${failed} errors.`);
        process.exit(1);
    } else {
        console.log("All WebSocket integration tests passed successfully.");
    }
}

run().catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
