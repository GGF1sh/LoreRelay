// No model prompts or account identifiers. --login-listener also probes the official local callback listener without opening a browser.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CodexGmClient } = require('../out/codexGmClient');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-codex-probe-'));
const profileDirectory = path.join(root, 'profile');
const workingDirectory = path.join(root, 'work');
fs.mkdirSync(profileDirectory); fs.mkdirSync(workingDirectory);
const client = new CodexGmClient({ executable: 'codex', profileDirectory, workingDirectory, model: 'gpt-5.6-terra' });
client.initialize().then(async status => {
    if (!process.argv.includes('--login-listener')) { console.log(JSON.stringify({ status, modelCalled: false })); return; }
    const login = await client.startLogin();
    const callback = new URL(new URL(login.authUrl).searchParams.get('redirect_uri'));
    if (callback.hostname !== 'localhost' || callback.protocol !== 'http:') throw new Error('unexpected_callback_origin');
    const net = require('node:net');
    const reachable = await new Promise(resolve => {
        const socket = net.createConnection({ host: callback.hostname, port: Number(callback.port) });
        socket.setTimeout(3000);
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => { socket.destroy(); resolve(false); });
        socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    console.log(JSON.stringify({ status, callbackReachable: reachable, modelCalled: false, browserOpened: false }));
    if (!reachable) process.exitCode = 1;
})
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => client.dispose());
