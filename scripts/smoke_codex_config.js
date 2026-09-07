'use strict';
const assert = require('assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildAiConnectionConfig } = require('../out/aiClientIntegrationCore');
const cli = process.env.LORERELAY_CODEX_JS;
if (!cli) throw new Error('Set LORERELAY_CODEX_JS to the installed Codex bin/codex.js');
const generated = buildAiConnectionConfig('codex', 'companion',
    path.resolve(__dirname, '../out/companionMcp.js'), 'fixture-not-a-live-endpoint', '0'.repeat(64));
// Read-only CLI overrides. Do not modify ~/.codex/config.toml or launch an adapter.
let section = '';
const overrides = [];
for (const line of generated.text.split('\n')) {
    if (line.startsWith('[')) section = line.slice(1, -1);
    else if (line.includes(' = ')) overrides.push('-c', `${section}.${line}`);
}
const result = JSON.parse(execFileSync(process.execPath,
    [cli, ...overrides, 'mcp', 'get', 'lorerelay-companion', '--json'],
    { encoding: 'utf8', windowsHide: true, timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }));
assert.equal(result.name, 'lorerelay-companion');
assert.equal(result.transport.command, 'node');
assert.deepEqual(result.transport.args, [path.resolve(__dirname, '../out/companionMcp.js')]);
assert.equal(result.transport.env.LORERELAY_AGENT_SECRET, '0'.repeat(64));
console.log('Codex CLI accepted generated MCP fields via read-only overrides. Connection and model play not tested.');
