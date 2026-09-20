'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { openAgentConnection } = require('../out/playerIpcHost');
const { buildAiConnectionConfig } = require('../out/aiClientIntegrationCore');
async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-gemini-connection-'));
    fs.mkdirSync(path.join(root, '.gemini'));
    const settings = path.join(root, '.gemini', 'settings.json');
    fs.writeFileSync(path.join(root, '.gemini', 'trustedFolders.json'), JSON.stringify({ [fs.realpathSync(root)]: 'TRUST_FOLDER' }));
    let paired = false;
    const host = await openAgentConnection('companion', async () => {
        paired = true;
        return { dispose() {}, async call() { return { fixture: true }; } };
    });
    try {
        fs.writeFileSync(settings, buildAiConnectionConfig('gemini', 'companion',
            path.resolve(__dirname, '../out/companionMcp.js'), host.endpoint, host.secret).text, { mode: 0o600 });
        const cli = process.env.LORERELAY_GEMINI_JS
            || path.resolve(__dirname, '../.test-runs/client-tools/node_modules/@google/gemini-cli/bundle/gemini.js');
        const result = await promisify(execFile)(process.execPath, [cli, 'mcp', 'list'], {
            cwd: root, env: { ...process.env, GEMINI_CLI_HOME: root }, windowsHide: true,
            timeout: 45000, maxBuffer: 256 * 1024,
        });
        if (!paired) throw new Error('fixture_not_paired');
        console.log(JSON.stringify({ client: 'Gemini CLI', paired, diagnosticReturned: Boolean(result.stdout), modelCalled: false, playSmoke: 'NOT_PERFORMED' }));
    } finally { host.dispose(); fs.writeFileSync(settings, '{}\n'); }
}
main().catch(error => {
    console.error(JSON.stringify({ diagnostic: error.killed ? 'client_timeout' : 'connection_failed',
        exitCode: typeof error.code === 'number' ? error.code : null, modelCalled: false }));
    process.exitCode = 1;
});
