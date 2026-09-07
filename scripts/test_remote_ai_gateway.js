'use strict';
const assert = require('assert/strict');
const { Client } = require('@modelcontextprotocol/client');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
const { openAgentConnection } = require('../out/playerIpcHost');
const { openRemoteAiGateway } = require('../out/remoteAiGateway');
async function main() {
    let approved = 0;
    let reads = 0;
    const host = await openAgentConnection('companion', async () => {
        approved++;
        return { dispose() {}, async call(tool) { reads++; return { worldTurn: 7, tool }; } };
    });
    const gateway = await openRemoteAiGateway('companion', host.endpoint, host.secret);
    const client = new Client({ name: 'remote-sdk-fixture', version: '1.0.0' });
    const root = gateway.url.replace(/\/mcp$/, '');
    const pair = code => fetch(root + '/pair', { method: 'POST', body: JSON.stringify({ code }) });
    try {
        assert.equal((await fetch(gateway.url, { method: 'POST', body: '{}' })).status, 401);
        assert.equal((await pair('wrong')).status, 403);
        const response = await pair(gateway.pairingCode);
        assert.equal(response.status, 200);
        const credentials = await response.json();
        assert.equal(credentials.readOnly, true);
        assert.equal((await pair(gateway.pairingCode)).status, 403);
        assert.equal((await fetch(gateway.url, { method: 'POST', headers: {
            Authorization: `Bearer ${credentials.token}`, Origin: 'https://attacker.invalid',
        }, body: '{}' })).status, 403);
        const transport = new StreamableHTTPClientTransport(new URL(gateway.url), {
            requestInit: { headers: { Authorization: `Bearer ${credentials.token}` } },
        });
        await client.connect(transport);
        const tools = (await client.listTools()).tools.map(tool => tool.name);
        assert.deepEqual(tools, ['read_player_view', 'query_available']);
        const view = JSON.parse((await client.callTool({ name: 'read_player_view', arguments: {} })).content[0].text);
        assert.equal(view.worldTurn, 7);
        assert.equal(approved, 1);
        const before = reads;
        await assert.rejects(client.callTool({ name: 'execute', arguments: {} }), /not found/);
        assert.equal(reads, before);
        const resource = await client.readResource({ uri: 'lorerelay://player-view' });
        assert.equal(JSON.parse(resource.contents[0].text).worldTurn, 7);
        await transport.terminateSession();
        assert(gateway.isClosed());
        console.log('Remote read-only gateway: SDK HTTP, one-time pairing, Host pairing, public reads, role and origin boundaries, disconnect passed.');
    } finally { await client.close(); gateway.close(); host.dispose(); }
    const host2 = await openAgentConnection('narrator', async () => ({ dispose() {}, async call() { return { facts: { worldTurn: 1 } }; } }));
    const gateway2 = await openRemoteAiGateway('narrator', host2.endpoint, host2.secret);
    const client2 = new Client({ name: 'reload-fixture', version: '1.0.0' });
    try {
        const auth = await (await fetch(gateway2.url.replace(/mcp$/, 'pair'), {
            method: 'POST', body: JSON.stringify({ code: gateway2.pairingCode }),
        })).json();
        await client2.connect(new StreamableHTTPClientTransport(new URL(gateway2.url), {
            requestInit: { headers: { Authorization: `Bearer ${auth.token}` } },
        }));
        await client2.callTool({ name: 'read_committed_facts', arguments: {} });
        host2.dispose();
        const deadline = Date.now() + 5000;
        while (!gateway2.isClosed() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
        assert(gateway2.isClosed(), 'Host disconnect must invalidate the remote endpoint');
        console.log('Remote gateway Host disconnect propagation passed.');
    } finally { await client2.close(); gateway2.close(); host2.dispose(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
