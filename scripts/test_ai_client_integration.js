'use strict';
const assert = require('assert/strict');
const { buildAiConnectionConfig } = require('../out/aiClientIntegrationCore');

const adapter = 'C:\\ゲーム\\a "quoted" folder\\out\\playerMcp.js';
const endpoint = '\\\\.\\pipe\\lorerelay-player-example';
const secret = 'a'.repeat(64);
for (const role of ['player', 'narrator']) {
    for (const client of ['claude-desktop', 'claude-code', 'gemini']) {
        const config = buildAiConnectionConfig(client, role, adapter, endpoint, secret);
        const parsed = JSON.parse(config.text);
        const servers = Object.entries(parsed.mcpServers);
        assert.equal(servers.length, 1);
        assert.equal(servers[0][0], `lorerelay-${role}`);
        assert.deepEqual(servers[0][1], { command: 'node', args: [adapter],
            env: { LORERELAY_AGENT_ENDPOINT: endpoint, LORERELAY_AGENT_SECRET: secret } });
    }
    for (const client of ['codex', 'grok']) {
        const config = buildAiConnectionConfig(client, role, adapter, endpoint, secret);
        assert.ok(config.text.startsWith(`[mcp_servers.lorerelay-${role}]\n`));
        // Inspect string payload round trips, including Windows separators and quotes.
        const args = config.text.split('\n').find(line => line.startsWith('args = ')).slice(7);
        assert.deepEqual(JSON.parse(args), [adapter]);
        for (const [key, expected] of Object.entries({ LORERELAY_AGENT_ENDPOINT: endpoint, LORERELAY_AGENT_SECRET: secret })) {
            const value = config.text.split('\n').find(line => line.startsWith(`${key} = `)).slice(key.length + 3);
            assert.equal(JSON.parse(value), expected);
        }
        assert.equal(config.text.includes('shell'), false);
    }
}
console.log('AI client configuration: 5 client formats, both roles, Windows paths and quoted Unicode paths passed. Actual-client connectivity not tested.');
