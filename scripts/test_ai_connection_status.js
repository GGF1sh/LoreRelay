'use strict';
const assert = require('assert/strict');
const net = require('net');
const { randomUUID } = require('crypto');
const { openAgentConnection } = require('../out/playerIpcHost');

async function main() {
    let grant;
    let calls = 0;
    const approved = new Promise(resolve => { grant = resolve; });
    const connection = await openAgentConnection('narrator', () => approved);
    const socket = net.createConnection(connection.endpoint);
    socket.on('error', () => {});
    let buffer = '';
    const messages = [];
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
        buffer += chunk;
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
            messages.push(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1);
        }
    });
    async function until(condition) {
        const deadline = Date.now() + 3000;
        while (!condition()) {
            if (Date.now() >= deadline) throw new Error('status transition timeout');
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    try {
        assert.equal(connection.getAgentConnectionStatus().phase, 'waiting');
        const clientSession = randomUUID();
        socket.write(JSON.stringify({ type: 'hello', secret: connection.secret, clientSession }) + '\n');
        await until(() => connection.getAgentConnectionStatus().phase === 'approval_pending');
        assert.equal(connection.getAgentConnectionStatus().clientSession, clientSession);
        assert.equal(calls, 0);
        grant({ dispose() {}, async call() { calls++; return { classification: 'rejected_forbidden' }; } });
        await until(() => messages.length === 1);
        assert.equal(connection.getAgentConnectionStatus().phase, 'connected');
        socket.write(JSON.stringify({ id: randomUUID(), session: messages[0].session, tool: 'execute', args: {} }) + '\n');
        await until(() => connection.getAgentConnectionStatus().completedCalls === 1);
        const snapshot = connection.getAgentConnectionStatus();
        assert.equal(calls, 1);
        assert.equal('secret' in snapshot, false);
        assert.equal('endpoint' in snapshot, false);
        snapshot.phase = 'waiting';
        assert.equal(connection.getAgentConnectionStatus().phase, 'connected');
        socket.destroy();
        await until(() => connection.getAgentConnectionStatus().phase === 'closed');
    } finally { socket.destroy(); connection.dispose(); }
    console.log('Host connection status: waiting/approval/connected/disconnect, read-only snapshots and no secret exposure passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
