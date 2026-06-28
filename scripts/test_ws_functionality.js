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

    // ─── 追加回帰テスト ────────────────────────────────────────────
    // Test 4 の "Next Action" onPlayerInput promise が未解決のままなので解決して
    // remoteInputLocked を finally で確実に解除する
    if (resolvePlayerInputPromise) {
        resolvePlayerInputPromise();
        resolvePlayerInputPromise = null;
    }
    await new Promise((r) => setTimeout(r, 150)); // finally ブロック完走を待つ

    // client1 を閉じてクライアント上限を 8 に戻す
    client1.close();
    await new Promise((r) => setTimeout(r, 150));
    mockMaxClients = 8;

    // テスト 5: Spectator からの入力は拒否される
    await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        let welcomed = false;
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'authRequired') {
                ws.send(JSON.stringify({ type: 'auth', token: token, role: 'spectator' }));
            } else if (msg.type === 'welcome') {
                welcomed = true;
                ws.send(JSON.stringify({ type: 'freeInput', text: 'should be rejected' }));
            } else if (msg.type === 'error' && welcomed) {
                if (msg.message === 'Spectator mode (read-only)') {
                    ok('Test 5: Spectator input rejected with read-only error');
                } else {
                    fail(`Test 5: Expected spectator error, got: ${msg.message}`);
                }
                ws.close();
                resolve();
            }
        });
        ws.on('error', (err) => { fail(`Test 5 error: ${err.message}`); resolve(); });
        ws.on('close', () => { if (!welcomed) resolve(); });
    });

    await new Promise((r) => setTimeout(r, 100));

    // テスト 6: 4001 文字超のメッセージ → エラー + code 1009 で切断
    await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        let gotClose = false;
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'authRequired') {
                ws.send('x'.repeat(4001)); // 未認証状態で超過サイズメッセージを送る
            }
        });
        ws.on('close', (code) => {
            if (gotClose) { return; }
            gotClose = true;
            if (code === 1009) {
                ok(`Test 6: Oversized message (>4000) rejected with close code 1009`);
            } else {
                fail(`Test 6: Expected close code 1009, got ${code}`);
            }
            resolve();
        });
        ws.on('error', (err) => { if (!gotClose) { fail(`Test 6 error: ${err.message}`); gotClose = true; resolve(); } });
    });

    await new Promise((r) => setTimeout(r, 100));

    // テスト 7: Pre-auth で非 auth メッセージ → Unauthorized + code 1008 切断
    await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        let unauthorizedReceived = false;
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'authRequired') {
                ws.send(JSON.stringify({ type: 'ping' })); // auth なしで ping を送る
            } else if (msg.type === 'error' && msg.message === 'Unauthorized') {
                unauthorizedReceived = true;
            }
        });
        ws.on('close', (code) => {
            if (unauthorizedReceived && code === 1008) {
                ok('Test 7: Pre-auth non-auth message → Unauthorized + code 1008');
            } else {
                fail(`Test 7: unauthorizedReceived=${unauthorizedReceived}, code=${code}`);
            }
            resolve();
        });
        ws.on('error', (err) => { fail(`Test 7 error: ${err.message}`); resolve(); });
    });

    await new Promise((r) => setTimeout(r, 100));

    // テスト 8+9: Token ローテーション — 旧 token 拒否・新 token 受理
    const oldToken = rps.getRemotePlayStatus().token;
    const rotatedToken = rps.rotateRemotePlayToken();

    if (rotatedToken === oldToken) {
        fail('Test 8: Token should change after rotation');
    } else {
        ok(`Test 8: rotateRemotePlayToken changed token (${oldToken.slice(0,4)}… → ${rotatedToken.slice(0,4)}…)`);
    }

    // 旧 token で接続 → Unauthorized
    await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        let unauthed = false;
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'authRequired') {
                ws.send(JSON.stringify({ type: 'auth', token: oldToken, role: 'player' }));
            } else if (msg.type === 'error' && msg.message === 'Unauthorized') {
                unauthed = true;
            }
        });
        ws.on('close', (code) => {
            if (unauthed) {
                ok(`Test 9: Old token rejected after rotation (code=${code})`);
            } else {
                fail('Test 9: Old token should be rejected after token rotation');
            }
            resolve();
        });
        ws.on('error', (err) => { fail(`Test 9 error: ${err.message}`); resolve(); });
    });

    await new Promise((r) => setTimeout(r, 100));

    // 新 token で接続 → welcome
    await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'authRequired') {
                ws.send(JSON.stringify({ type: 'auth', token: rotatedToken, role: 'player' }));
            } else if (msg.type === 'welcome') {
                ok('Test 10: New token accepted after rotation');
                ws.close();
                resolve();
            } else if (msg.type === 'error') {
                fail(`Test 10: New token rejected: ${msg.message}`);
                ws.close();
                resolve();
            }
        });
        ws.on('error', (err) => { fail(`Test 10 error: ${err.message}`); resolve(); });
        ws.on('close', () => resolve());
    });

    await new Promise((r) => setTimeout(r, 100));

    // テスト 11: isGmBusy=true → "GM is busy" エラー
    mockGmBusy = true;
    await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'authRequired') {
                ws.send(JSON.stringify({ type: 'auth', token: rotatedToken, role: 'player' }));
            } else if (msg.type === 'welcome') {
                ws.send(JSON.stringify({ type: 'freeInput', text: 'test while busy' }));
            } else if (msg.type === 'error') {
                if (msg.message === 'GM is busy') {
                    ok('Test 11: Input rejected while GM busy');
                } else {
                    fail(`Test 11: Expected "GM is busy", got "${msg.message}"`);
                }
                ws.close();
                resolve();
            }
        });
        ws.on('error', (err) => { fail(`Test 11 error: ${err.message}`); resolve(); });
        ws.on('close', () => resolve());
    });
    mockGmBusy = false;

    await new Promise((r) => setTimeout(r, 100));

    // テスト 12: isGameOverActive=true → "Game over" エラー
    mockGameOver = true;
    await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'authRequired') {
                ws.send(JSON.stringify({ type: 'auth', token: rotatedToken, role: 'player' }));
            } else if (msg.type === 'welcome') {
                ws.send(JSON.stringify({ type: 'freeInput', text: 'test game over' }));
            } else if (msg.type === 'error') {
                if (msg.message === 'Game over') {
                    ok('Test 12: Input rejected during game over');
                } else {
                    fail(`Test 12: Expected "Game over", got "${msg.message}"`);
                }
                ws.close();
                resolve();
            }
        });
        ws.on('error', (err) => { fail(`Test 12 error: ${err.message}`); resolve(); });
        ws.on('close', () => resolve());
    });
    mockGameOver = false;

    await new Promise((r) => setTimeout(r, 100));

    // テスト 13: text > 2000 文字 → "Invalid input" エラー
    await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'authRequired') {
                ws.send(JSON.stringify({ type: 'auth', token: rotatedToken, role: 'player' }));
            } else if (msg.type === 'welcome') {
                ws.send(JSON.stringify({ type: 'freeInput', text: 'a'.repeat(2001) }));
            } else if (msg.type === 'error') {
                if (msg.message === 'Invalid input') {
                    ok('Test 13: Input text > 2000 chars rejected with "Invalid input"');
                } else {
                    fail(`Test 13: Expected "Invalid input", got "${msg.message}"`);
                }
                ws.close();
                resolve();
            }
        });
        ws.on('error', (err) => { fail(`Test 13 error: ${err.message}`); resolve(); });
        ws.on('close', () => resolve());
    });

    // クリーンアップ (client1 は追加テスト前に閉じた)
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
