'use strict';
// Vendor transport diagnostic only. No model call and no claim of completed play.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { buildAiConnectionConfig } = require('../out/aiClientIntegrationCore');
const { openAgentConnection } = require('../out/playerIpcHost');
async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-grok-connection-'));
    fs.mkdirSync(path.join(root, '.grok'));
    let paired = false;
    const host = await openAgentConnection('narrator', async () => {
        paired = true;
        return { dispose() {}, async call() { return { facts: { fixture: true } }; } };
    });
    const config = path.join(root, '.grok', 'config.toml');
    try {
        fs.writeFileSync(config, buildAiConnectionConfig('grok', 'narrator',
            path.resolve(__dirname, '../out/narratorMcp.js'), host.endpoint, host.secret).text, { mode: 0o600 });
        const executable = process.env.LORERELAY_GROK_EXECUTABLE || 'grok';
        const result = await promisify(execFile)(executable,
            ['--cwd', root, '--trust', 'mcp', 'doctor', 'lorerelay-narrator', '--json'],
            { cwd: root, timeout: 45000, maxBuffer: 256 * 1024, windowsHide: true }).catch(error => {
                // doctor reports failures as JSON on stdout even with a nonzero exit.
                // Redact this fixture's credential before propagating diagnostic text.
                error.stderr = String(error.stderr || error.stdout || '').split(host.secret).join('[redacted]');
                throw error;
            });
        // Do not print vendor diagnostics: they can contain local paths and config values.
        const diagnostic = JSON.parse(result.stdout);
        if (!paired) throw new Error('vendor diagnostic did not pair with fixture Host');
        if (!diagnostic.servers?.some(server => server.name === 'lorerelay-narrator' && server.healthy === true)) {
            throw new Error('vendor server did not pass health checks');
        }
        console.log(JSON.stringify({ client: 'Grok Build', paired, diagnosticReturned: !!diagnostic,
            playSmoke: 'NOT_PERFORMED', modelCalled: false }));
    } finally {
        host.dispose();
        // Keep test artifact directory, but erase this test's ephemeral credential contents.
        fs.writeFileSync(config, '# Expired fixture connection; credential removed.\n');
    }
}
main().catch(error => { console.error(JSON.stringify({ diagnostic: 'failed', code: error.code ?? 'diagnostic_not_paired',
    signal: error.signal ?? null, reason: String(error.stderr ?? '').replace(/[a-f0-9]{64}/gi, '[redacted]').slice(0, 1200),
    playSmoke: 'NOT_PERFORMED' })); process.exitCode = 1; });
