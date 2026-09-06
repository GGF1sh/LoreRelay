'use strict';
const assert = require('assert/strict');
const path = require('path');
const net = require('net');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const { openActionFixture } = require('./action_scenario_fixture');
const { openAgentConnection } = require('../out/playerIpcHost');
const { createPlayerDelegation, createNarratorReader, PLAYER_TOOLS } = require('../out/playerDelegationCore');
const { createGameActionService } = require('../out/gameActionService');
const { createDeterministicWorkspaceMutationGate } = require('../out/deterministicWorkspaceMutationGate');
const actions = ['commerce:trade', 'commerce:travel', 'commerce:end_day'];
const day = { actionId: 'commerce:end_day', parameters: {} };
const trade = { actionId: 'commerce:trade', parameters: { op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 1 } };
const travel = { actionId: 'commerce:travel', parameters: { destinationId: 'elda_shop' } };
const request = preview => ({ actionId: preview.actionId, parameters: preview.parameters,
    confirmationToken: preview.confirmationToken, requestId: randomUUID() });
async function connect(connection, role = 'player') {
    const client = new Client({ name: 'lorerelay-fixture-standard-client', version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath,
        args: [path.join(__dirname, '../out', role === 'player' ? 'playerMcp.js' : 'narratorMcp.js')],
        env: { ...process.env, LORERELAY_AGENT_ENDPOINT: connection.endpoint, LORERELAY_AGENT_SECRET: connection.secret }, stderr: 'pipe' });
    await client.connect(transport);
    const call = async (name, args = {}) => {
        const result = await client.callTool({ name, arguments: args });
        return { raw: result, value: result.content?.[0]?.text ? JSON.parse(result.content[0].text) : undefined };
    };
    return { client, call, close: () => client.close() };
}
async function withFixture(fn) {
    const fixture = await openActionFixture();
    try { await fn(fixture, { service: fixture.runtime.service, scope: fixture.runtime.scope, current: fixture.runtime.authorized }); }
    finally { fixture.close(); }
}
async function main() {
    await withFixture(async (fixture, bindings) => {
        let approvals = 0, disposed = 0;
        const connection = await openAgentConnection('player', async session => {
            assert.match(session, /^[a-f0-9-]{36}$/); approvals++;
            const api = createPlayerDelegation(bindings, actions, 3);
            return { call: api.call, dispose: () => { disposed++; api.dispose(); } };
        });
        // A wrong secret cannot reach the Host approval surface.
        await new Promise(resolve => {
            const socket = net.createConnection(connection.endpoint);
            socket.on('connect', () => socket.write(JSON.stringify({ type: 'hello', secret: '0'.repeat(64), clientSession: randomUUID() }) + '\n'));
            socket.on('close', resolve); socket.on('error', () => {});
        });
        assert.equal(approvals, 0);
        const peer = await connect(connection);
        try {
            assert.deepEqual((await peer.client.listTools()).tools.map(t => t.name).sort(), [...PLAYER_TOOLS].sort());
            const available = (await peer.call('query_available')).value;
            assert.equal(approvals, 1); assert.equal(available.delegation.remaining, 3);
            assert(!JSON.stringify(available).includes('south_port'));
            const injection = await peer.client.callTool({ name: 'read_player_view', arguments: { workspace: fixture.workspace, principal: 'qa-runner' } });
            assert.equal(injection.isError, true);
            for (const input of [trade, travel, day]) {
                const preview = (await peer.call('preview', input)).value;
                assert(preview.ok);
                const raw = request(preview);
                const result = (await peer.call('execute', raw)).value;
                assert.equal(result.classification, 'committed', JSON.stringify(result));
                assert.deepEqual((await peer.call('execute', raw)).value, result, 'exact replay does not consume another admission');
                assert.deepEqual((await peer.call('wait_receipt', { requestId: raw.requestId, timeoutMs: 1000 })).value, result);
            }
            assert.equal((await peer.call('query_available')).value.delegation.remaining, 0);
            const exhausted = (await peer.call('preview', day)).value;
            assert.equal((await peer.call('execute', request(exhausted))).value.classification, 'rejected_forbidden');
            const view = (await peer.call('read_player_view')).value;
            assert(!JSON.stringify(view).includes(connection.secret));
            assert(!JSON.stringify(view).includes('south_port'));
        } finally { await peer.close(); connection.dispose(); }
        assert(disposed >= 1, 'disconnect revokes the Host authority');
    });
    await withFixture(async (_fixture, bindings) => {
        const denied = await openAgentConnection('player', async () => undefined);
        const peer = await connect(denied);
        try { assert.equal((await peer.call('read_player_view')).value.classification, 'rejected_forbidden'); }
        finally { await peer.close(); denied.dispose(); }
        const narrator = await openAgentConnection('narrator', async () => createNarratorReader(bindings));
        const reader = await connect(narrator, 'narrator');
        try {
            assert.deepEqual((await reader.client.listTools()).tools.map(t => t.name), ['read_committed_facts']);
            const result = (await reader.call('read_committed_facts')).value;
            assert(result.facts.commerce); assert(!JSON.stringify(result).includes('south_port'));
            await assert.rejects(reader.client.callTool({ name: 'execute', arguments: {} }));
        } finally { await reader.close(); narrator.dispose(); }
    });
    await withFixture(async (fixture, bindings) => {
        let clock = 0, current = true, epoch = 'one';
        const controlled = { ...bindings, now: () => clock, current: () => current, scope: () => epoch };
        const api = createPlayerDelegation(controlled, [day.actionId], 10, 100);
        assert.equal((await api.call('preview', trade)).classification, 'rejected_forbidden');
        assert.equal((await api.call('preview', { ...day, workspace: '/other' })).classification, 'rejected_invalid');
        const quote = await api.call('preview', day);
        assert(quote.ok); assert.equal((await api.call('query_available', {})).delegation.remaining, 10);
        const other = createPlayerDelegation(controlled, actions);
        assert.equal((await other.call('execute', request(quote))).classification, 'rejected_forbidden', 'other caller handle rejected');
        other.dispose();
        const lease = fixture.gate.acquire(fixture.workspace, { actionKind: 'test', requestId: 'busy_owner' });
        assert.equal(lease.status, 'acquired');
        assert.equal((await api.call('execute', request(quote))).classification, 'rejected_busy');
        lease.lease.release();
        const stale = await api.call('preview', day);
        const fresh = await api.call('preview', day);
        assert.equal((await api.call('execute', request(fresh))).classification, 'committed');
        assert.equal((await api.call('execute', request(stale))).classification, 'rejected_stale');
        clock = 100;
        assert.equal((await api.call('execute', request(quote))).classification, 'rejected_forbidden');
        const changed = createPlayerDelegation(controlled, actions); epoch = 'two';
        assert.equal((await changed.call('preview', day)).classification, 'rejected_forbidden');
        const workspaceChanged = createPlayerDelegation(controlled, actions); current = false;
        assert.equal((await workspaceChanged.call('read_player_view', {})).classification, 'rejected_forbidden');
        for (const maximum of [0, 101, NaN]) assert.throws(() => createPlayerDelegation(bindings, actions, maximum));
        const narrator = createNarratorReader(bindings);
        assert.equal((await narrator.call('execute', {})).classification, 'rejected_forbidden'); narrator.dispose();
    });
    // Exercise the actual Host command wiring with UI/IPC boundaries substituted.
    await withFixture(async fixture => {
        const Module = require('module');
        const experience = require('../out/experience');
        for (const destination of ['parlor', 'inworld']) {
            experience.saveExperienceConfig({ profile: 'campaign' });
            let approve, approved;
            const commands = new Map();
            const disposable = { dispose() {} };
            const vscode = {
                commands: { registerCommand: (id, handler) => { commands.set(id, handler); return disposable; } },
                workspace: { onDidChangeWorkspaceFolders: () => disposable, onDidChangeConfiguration: () => disposable },
                window: {
                    createOutputChannel: () => ({ ...disposable, clear() {}, appendLine() {}, show() {} }),
                    showQuickPick: async items => items, showInputBox: async () => '10',
                    showWarningMessage: async (_message, _options, label) => label,
                    showInformationMessage: async () => undefined,
                },
            };
            const original = Module._load;
            const hostPath = require.resolve('../out/playerAgentHost');
            delete require.cache[hostPath];
            Module._load = function(name) {
                if (name === 'vscode') return vscode;
                if (name === './commerceActionRuntime') return { createCommerceActionRuntime: async () => fixture.runtime };
                if (name === './workspacePaths') return { getWorkspacePath: () => fixture.workspace,
                    getGameStatePath: () => path.join(fixture.workspace, 'game_state.json') };
                if (name === './playerIpcHost') return { openAgentConnection: async (_role, approval) => {
                    approve = async session => (approved = await approval(session));
                    return { endpoint: 'fixture', secret: 'fixture', dispose() { approved?.dispose(); } };
                } };
                return original.apply(this, arguments);
            };
            const context = { extensionPath: path.resolve(__dirname, '..'), subscriptions: [] };
            try { require(hostPath).registerPlayerAgent(context, fixture.gate); }
            finally { Module._load = original; delete require.cache[hostPath]; }
            try {
                await commands.get('textadventure.startPlayerAgent')();
                const api = await approve(randomUUID());
                assert((await api.call('preview', day)).ok);
                experience.saveExperienceConfig({ profile: destination });
                assert.equal((await api.call('preview', day)).classification, 'rejected_forbidden');
                experience.saveExperienceConfig({ profile: 'campaign' });
                assert.equal((await api.call('preview', day)).classification, 'rejected_forbidden', 'revoked lease cannot revive');
                await commands.get('textadventure.startPlayerAgent')();
                const idle = await approve(randomUUID());
                const quote = await idle.call('preview', day);
                assert(quote.ok);
                experience.saveExperienceConfig({ profile: destination });
                experience.saveExperienceConfig({ profile: 'campaign' });
                assert.equal((await idle.call('execute', request(quote))).classification, 'rejected_forbidden', 'idle round trip revokes without an intervening agent call');
            } finally { for (const item of context.subscriptions) item.dispose(); }
        }
    });
    // Fault injection is confined to a pure service binding; production has no alternate engine.
    for (const classification of ['committed_partial', 'outcome_unknown']) {
        let executions = 0;
        const gate = createDeterministicWorkspaceMutationGate();
        const service = createGameActionService({ mutationGate: gate,
            scope: () => ({ workspaceId: 'fixture', campaignId: 'fixture', timelineEpoch: 'one', authorizationGeneration: 1 }),
            authorized: () => true, read: () => ({}), playerView: () => ({}),
            actions: () => [{ actionId: day.actionId, version: 1, available: true, parameters: {}, estimate: {} }],
            quote: () => ({ ok: true, quote: {} }), witness: () => 'stable', inspect: () => ({}),
            execute: () => { executions++; return { classification, result: {} }; } });
        const api = createPlayerDelegation({ service, scope: () => 'one', current: () => true }, actions);
        const raw = request(await api.call('preview', day));
        assert.equal((await api.call('execute', raw)).classification, classification);
        assert.equal((await api.call('execute', raw)).classification, classification); assert.equal(executions, 1);
        api.dispose();
    }
    // Revocation rejects work before it starts; started work owns its gate until settlement.
    {
        let executions = 0, api;
        const gate = createDeterministicWorkspaceMutationGate();
        const service = createGameActionService({ mutationGate: gate,
            scope: () => ({ workspaceId: 'revocation', campaignId: 'fixture', timelineEpoch: 'one', authorizationGeneration: 1 }),
            authorized: () => true, read: () => ({}), playerView: () => ({}),
            actions: () => [{ actionId: day.actionId, version: 1, available: true, parameters: {}, estimate: {} }],
            quote: () => ({ ok: true, quote: {} }), witness: () => 'stable', inspect: () => ({}),
            execute: () => {
                executions++; api.dispose();
                assert.equal(gate.acquire('revocation', { actionKind: 'competing', requestId: 'competing' }).status, 'busy');
                return { classification: 'committed', result: {} };
            } });
        const bindings = { service, scope: () => 'one', current: () => true };
        api = createPlayerDelegation(bindings, actions);
        const pending = api.call('execute', request(await api.call('preview', day)));
        api.dispose();
        assert.equal((await pending).classification, 'rejected_forbidden'); assert.equal(executions, 0);
        api = createPlayerDelegation(bindings, actions);
        assert.equal((await api.call('execute', request(await api.call('preview', day)))).classification, 'committed');
        assert.equal(executions, 1);
        const released = gate.acquire('revocation', { actionKind: 'after', requestId: 'after' });
        assert.equal(released.status, 'acquired'); released.lease.release();
    }
    // Packaging retains the official runtime dependencies used by the installed entrypoints.
    const ignore = fs.readFileSync(path.join(__dirname, '../.vscodeignore'), 'utf8');
    for (const name of ['@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod']) assert(ignore.includes(`!node_modules/${name}/**`));
    console.log('Player MCP: official stdio client, production fixture actions, pairing denial, limits, revocation, privacy and uncertain outcomes passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
