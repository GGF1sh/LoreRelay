#!/usr/bin/env node
/**
 * remotePlayServer 統合テスト — HTTP エンドポイント + token 認証
 *
 * vscode モジュールを起動前にモックし、実際の HTTP サーバを立ち上げて検証する。
 * port 0 で listen してから address() で実際のポートを取得する。
 */
'use strict';
const http = require('http');
const os   = require('os');
const fs   = require('fs');
const path = require('path');

// ── vscode モック ─────────────────────────────────────────────
// remotePlayServer 内で参照されるすべての vscode API を最小限にモック
const WS_PATH = path.join(os.tmpdir(), `lr-rp-extpath-${Date.now()}`);
fs.mkdirSync(WS_PATH, { recursive: true });

const mockVscode = {
    workspace: {
        isTrusted: true,
        workspaceFolders: [{ uri: { fsPath: WS_PATH }, name: 'test' }],
        getConfiguration: () => ({
            get: (key, def) => {
                if (key === 'remotePlay.port')        return 47291; // テスト用固定ポート
                if (key === 'remotePlay.bindAddress') return '127.0.0.1';
                if (key === 'remotePlay.defaultRole') return 'player';
                if (key === 'remotePlay.maxClients')  return 8;
                if (key === 'remotePlay.inputCooldownMs') return 1500;
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

// モック注入後にサーバモジュールをロード
const rps = require('../out/remotePlayServer');
const { buildSignedMediaPath } = require('../out/remoteMediaSignatureCore');

// ── テストユーティリティ ─────────────────────────────────────
let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg)   { console.log(`OK: ${msg}`); }

/** 単純な HTTP GET ヘルパー。Promise<{ status, body }> を返す */
function get(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.on('data', (d) => { body += d; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
    });
}

// ── テスト本体 ───────────────────────────────────────────────
async function run() {
    // 1. 起動前: status は running=false
    {
        const s = rps.getRemotePlayStatus();
        if (s.running) { fail('before start: running should be false'); }
        else { ok('before start: running=false'); }
        if (s.clientCount !== 0) { fail('before start: clientCount should be 0'); }
        else { ok('before start: clientCount=0'); }
    }

    // 2. disposeRemotePlayServer は起動前でもクラッシュしない
    try {
        rps.disposeRemotePlayServer();
        ok('dispose before start: no crash');
    } catch (e) {
        fail(`dispose before start threw: ${e.message}`);
    }

    // 3. notifyRemoteGmBusy は起動前でもクラッシュしない
    try {
        rps.notifyRemoteGmBusy(false);
        ok('notifyRemoteGmBusy(false) before start: no crash');
    } catch (e) {
        fail(`notifyRemoteGmBusy before start threw: ${e.message}`);
    }

    // 4. deps を初期化してサーバ起動
    rps.initRemotePlayServer({
        extensionPath: WS_PATH,
        getPanel: () => undefined,
        onPlayerInput: async () => {},
        isGameOverActive: () => false,
        isGmBusy: () => false,
        subscriptions: [],
    });

    let status;
    try {
        status = await rps.startRemotePlayServer();
    } catch (e) {
        fail(`startRemotePlayServer threw: ${e.message}`);
        process.exit(1);
    }

    // port 0 の場合 OS が空きポートを割り当てるが、listenPort はモジュール内変数に
    // 残るため status.port が 0 になることがある。
    // 実際のポートは httpServer.address().port から取れるが外部非公開。
    // ここでは status.running のみ確認し、port は後でリクエストから取得する。
    if (!status.running) {
        fail('after start: running should be true');
        process.exit(1);
    }
    ok('after start: running=true');

    if (typeof status.token !== 'string' || status.token.length < 8) {
        fail(`token format invalid: "${status.token}"`);
    } else {
        ok(`after start: token issued (${status.token.length} chars)`);
    }

    // port=0 でも OS が割り当てたポートを status.port で得ることを確認
    // (実装が listenPort を address().port で更新している場合)
    // 更新していない実装では 0 が返る。その場合は直接 URL テストをスキップ。
    const actualPort = status.port;
    if (actualPort === 0) {
        // port 0 の場合、HTTP テストは実際のアドレスが不明なためスキップ
        ok('HTTP endpoint tests skipped (port=0, OS-assigned port not reflected in status)');
    } else {
        const base = `http://127.0.0.1:${actualPort}`;

        // 5a. /media file パラメータなし → 400
        {
            const r = await get(`${base}/media`);
            if (r.status !== 400) { fail(`/media missing file: expected 400, got ${r.status}`); }
            else { ok('/media without file param: 400 Missing file'); }
        }

        // 5b. /media 署名なし（file あり）→ 401
        {
            const r = await get(`${base}/media?file=test.png`);
            if (r.status !== 401) { fail(`/media no signature: expected 401, got ${r.status}`); }
            else { ok('/media without signature: 401 Unauthorized'); }
        }

        // 6. /media レガシー session token → 401（拒否）
        {
            const r = await get(`${base}/media?token=wrongtoken&file=test.png`);
            if (r.status !== 401) { fail(`/media legacy token: expected 401, got ${r.status}`); }
            else { ok('/media legacy session token: 401 rejected'); }
        }

        // 7. /ws を HTTP GET → 426 Upgrade Required
        {
            const r = await get(`${base}/ws`);
            if (r.status !== 426) { fail(`/ws HTTP GET: expected 426, got ${r.status}`); }
            else { ok('/ws plain HTTP: 426 Upgrade Required'); }
        }

        // 8. 存在しないパス → 404
        {
            const r = await get(`${base}/nonexistent-path-12345`);
            if (r.status !== 404) { fail(`/nonexistent: expected 404, got ${r.status}`); }
            else { ok('/nonexistent: 404 Not Found'); }
        }

        function signedMediaUrl(file, nowSec) {
            const rel = buildSignedMediaPath(file, status.token, 300, nowSec);
            return `${base}${rel}`;
        }

        // 6b. /media 不正な署名 → 401
        {
            const now = Math.floor(Date.now() / 1000);
            const r = await get(`${base}/media?file=nofile.png&exp=${now + 300}&sig=${'a'.repeat(64)}`);
            if (r.status !== 401) { fail(`/media bad signature: expected 401, got ${r.status}`); }
            else { ok('/media invalid HMAC signature: 401 Unauthorized'); }
        }

        // 6c. /media 期限切れ署名 → 403
        {
            const now = Math.floor(Date.now() / 1000);
            const r = await get(signedMediaUrl('nofile.png', now - 400));
            if (r.status !== 403) { fail(`/media expired signature: expected 403, got ${r.status}`); }
            else { ok('/media expired HMAC signature: 403 Expired'); }
        }

        // 9. /media 有効署名・存在しないファイル → 403
        {
            const r = await get(signedMediaUrl('nofile.png'));
            if (r.status !== 400 && r.status !== 403 && r.status !== 404) {
                fail(`/media valid signature invalid file: expected 400/403/404, got ${r.status}`);
            } else {
                ok(`/media valid signature invalid file: ${r.status} (file rejected)`);
            }
        }

        // 9b. /media パストラバーサル試行 → 403 (traversal outside workspace)
        {
            const r = await get(signedMediaUrl('../../evil.png'));
            if (r.status !== 403 && r.status !== 404) {
                fail(`/media path traversal: expected 403/404, got ${r.status}`);
            } else {
                ok(`/media path traversal (../../evil.png): ${r.status} (traversal blocked)`);
            }
        }

        // 9c. /media ダブルエンコードトラバーサル → 403 (defense-in-depth)
        {
            const doubleEncoded = '%252F..%252Fevil.png';
            const r = await get(signedMediaUrl(doubleEncoded));
            if (r.status !== 403 && r.status !== 404 && r.status !== 400) {
                fail(`/media double-encoded traversal: expected 400/403/404, got ${r.status}`);
            } else {
                ok(`/media double-encoded traversal: ${r.status} (blocked)`);
            }
        }
    }

    // 10. rotateRemotePlayToken でトークンが変わる
    {
        const oldToken = status.token;
        let newToken;
        try {
            newToken = rps.rotateRemotePlayToken();
        } catch (e) {
            fail(`rotateRemotePlayToken threw: ${e.message}`);
            newToken = null;
        }
        if (newToken !== null) {
            if (newToken === oldToken) { fail('rotated token should differ from old token'); }
            else if (typeof newToken !== 'string' || newToken.length < 8) {
                fail(`rotated token format invalid: "${newToken}"`);
            } else {
                ok('rotateRemotePlayToken: new token issued and differs from old');
            }
        }
    }

    // 11. pushGameStateToRemoteClients はクライアントなしでもクラッシュしない
    try {
        rps.pushGameStateToRemoteClients({ entries: [] }, []);
        ok('pushGameStateToRemoteClients with no clients: no crash');
    } catch (e) {
        fail(`pushGameStateToRemoteClients threw: ${e.message}`);
    }

    // 12. サーバ停止後に running=false になる
    rps.stopRemotePlayServer();
    {
        const s2 = rps.getRemotePlayStatus();
        if (s2.running) { fail('after stop: running should be false'); }
        else { ok('after stop: running=false'); }
    }

    // 13. disposeRemotePlayServer は起動中でも確実に停止する
    try {
        await rps.startRemotePlayServer();
        if (!rps.getRemotePlayStatus().running) {
            fail('13: server should be running before dispose');
        } else {
            rps.disposeRemotePlayServer();
            const s3 = rps.getRemotePlayStatus();
            if (s3.running) { fail('13: disposeRemotePlayServer: running should be false after dispose'); }
            else { ok('13: disposeRemotePlayServer after start: running=false'); }
        }
    } catch (e) {
        fail(`13: disposeRemotePlayServer test threw: ${e.message}`);
    }

    // クリーンアップ
    fs.rmSync(WS_PATH, { recursive: true, force: true });

    if (failed > 0) { process.exit(1); }
    console.log('All remote play server tests passed.');
}

run().catch((e) => {
    console.error('Unhandled error in test:', e);
    fs.rmSync(WS_PATH, { recursive: true, force: true });
    process.exit(1);
});
