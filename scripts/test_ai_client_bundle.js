'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build } = require('./build_ai_client_bundle');
const { buildPlugin } = require('./build_codex_local_plugin');
const { openAgentConnection } = require('../out/playerIpcHost');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
async function main() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-bundle-test-'));
    for (const variant of ['player', 'narrator', 'companion', 'codex-plugin']) {
        const role = variant === 'codex-plugin' ? 'player' : variant;
        const target = variant === 'codex-plugin' ? buildPlugin(directory) : build(path.join(directory, role), role);
        assert.throws(() => build(target, role), /must not exist/);
        const manifest = JSON.parse(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8'));
        assert.equal(manifest.user_config.secret.sensitive, true);
        assert.equal(manifest.server.mcp_config.args[0], `\${__dirname}/server/${role}Mcp.js`);
        let launchArgs = [path.join(target, manifest.server.entry_point)];
        if (variant === 'codex-plugin') {
            const plugin = JSON.parse(fs.readFileSync(path.join(target, '.codex-plugin/plugin.json'), 'utf8'));
            const config = JSON.parse(fs.readFileSync(path.join(target, plugin.mcpServers), 'utf8')).mcpServers['lorerelay-player'];
            assert.deepEqual(config.env_vars, ['LORERELAY_AGENT_ENDPOINT', 'LORERELAY_AGENT_SECRET']);
            assert.equal(config.command, 'node');
            assert.equal(config.env, undefined, 'package must not embed runtime credentials');
            assert(fs.existsSync(path.join(target, plugin.skills, 'play/SKILL.md')));
            launchArgs = config.args;
            assert.throws(() => buildPlugin(directory), /must not exist/);
        }
        let called = 0;
        const publicValue = { public: true, currentLocationId: 'known-market', worldTurn: 7,
            availableActions: [{ actionId: 'commerce:trade', estimate: { commodities: [{ commodityId: 'wheat', price: 3 }] } }] };
        let refused = false;
        const host = await openAgentConnection(role, async () => ({ dispose() {}, async call() {
            called++; if (refused) return { classification: 'rejected_forbidden' };
            return role === 'narrator' ? { facts: publicValue } : publicValue;
        } }));
        const client = new Client({ name: 'packaged-adapter-test', version: '1.0.0' });
        try {
            await client.connect(new StdioClientTransport({ command: process.execPath,
                args: launchArgs, cwd: directory,
                env: { LORERELAY_AGENT_ENDPOINT: host.endpoint, LORERELAY_AGENT_SECRET: host.secret }, stderr: 'pipe' }));
            const tools = await client.listTools();
            assert.equal(tools.tools.length, role === 'player' ? 5 : role === 'companion' ? 2 : 1);
            if (role === 'companion') assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['query_available', 'read_player_view']);
            const result = await client.callTool({ name: role === 'narrator' ? 'read_committed_facts' : 'read_player_view', arguments: {} });
            assert.deepEqual(JSON.parse(result.content[0].text), role === 'narrator' ? { facts: publicValue } : publicValue);
            assert.equal(called, 1);
            const resources = await client.listResources();
            assert.equal(resources.resources[0].uri, 'lorerelay://player-view');
            const view = await client.readResource({ uri: 'lorerelay://player-view' });
            assert.deepEqual(JSON.parse(view.contents[0].text), publicValue);
            assert.equal(called, 2);
            const prompts = await client.listPrompts();
            assert.equal(prompts.prompts.length, 5);
            for (const prompt of prompts.prompts) {
                const expanded = await client.getPrompt({ name: prompt.name });
                assert.ok(expanded.messages[0].content.text.includes(role === 'narrator' ? 'read_committed_facts' : 'read_player_view'));
            }
            assert.equal(called, 2, 'getting a prompt must not call the Host or execute an action');
            await assert.rejects(client.readResource({ uri: 'lorerelay://raw-world-state' }));
            const market = JSON.parse((await client.readResource({ uri: 'lorerelay://market-report' })).contents[0].text);
            assert.deepEqual(market, { currentLocationId: 'known-market', worldTurn: 7, available: true,
                market: publicValue.availableActions[0].estimate });
            publicValue.availableActions = [];
            const unavailable = JSON.parse((await client.readResource({ uri: 'lorerelay://market-report' })).contents[0].text);
            assert.equal(unavailable.available, false);
            assert.equal(unavailable.market, null);
            refused = true;
            await assert.rejects(client.readResource({ uri: 'lorerelay://player-view' }));
            await assert.rejects(client.readResource({ uri: 'lorerelay://market-report' }));
            assert.equal(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8').includes(host.secret), false);
        } finally { await client.close(); host.dispose(); }
    }
    console.log(`Codex plugin artifact: ${path.join(directory, 'lorerelay-player')}`);
    console.log('Portable bundles: SDK stdio initialization, fixed role tool lists and public read passed outside the repository. Vendor apps untested.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
