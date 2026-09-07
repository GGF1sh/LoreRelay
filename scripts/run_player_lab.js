'use strict';
// Explicit fixture session, not an embedded autonomous agent loop.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { openActionFixture } = require('./action_scenario_fixture');
const { openAgentConnection } = require('../out/playerIpcHost');
const { createPlayerDelegation } = require('../out/playerDelegationCore');
const { hashGameActionValue } = require('../out/gameActionService');
const { recordPlayerLabSession } = require('../out/playerLabCore');
const { buildAiConnectionConfig } = require('../out/aiClientIntegrationCore');
async function main() {
    const [client, model, mode] = process.argv.slice(2);
    if (![4, 5].includes(process.argv.length) || (mode !== undefined && mode !== '--end-day-smoke')
        || !['codex', 'gemini', 'grok', 'claude-desktop', 'claude-code'].includes(client)
        || !/^[a-zA-Z0-9._:/-]{1,80}$/.test(model || '')) throw new Error('usage: node scripts/run_player_lab.js CLIENT MODEL_LABEL');
    const fixtureId = mode ? 'merchant_route_v1' : 'player_lab_support_v1';
    const fixture = await openActionFixture(fixtureId);
    let host;
    let recorder;
    const directory = path.resolve(__dirname, '../.test-runs/player-lab', randomUUID());
    fs.mkdirSync(directory, { recursive: true });
    const configFile = path.join(directory, 'connection.txt');
    const output = path.join(directory, 'result.json');
    try {
        const service = fixture.runtime.service;
        const reader = service.createTrustedSession('narrator');
        const initialPublicDigest = hashGameActionValue(service.readPlayerView(reader));
        service.close(reader);
        const fixtureDigest = hashGameActionValue(['game_state.json', 'world_state.json', 'world_forge.json', 'game_rules.json']
            .map(name => fs.readFileSync(path.resolve(__dirname, '../fixtures/action-scenarios', fixtureId, name), 'utf8')));
        const maximum = mode ? 1 : 10;
        const allowedActions = mode ? ['commerce:end_day'] : ['commerce:trade', 'commerce:travel', 'commerce:end_day'];
        const task = mode ? 'Connection smoke only: read public state, preview and execute one end day, inspect the receipt, then stop. No automatic retries. Not a comparison run.'
            : fs.readFileSync(path.resolve(__dirname, '../integrations/player-lab-task.md'), 'utf8').replace(/\r\n/g, '\n');
        const conditions = { fixtureDigest, initialPublicDigest, taskDigest: hashGameActionValue(task), maximum, allowedActions };
        host = await openAgentConnection('player', async () => {
            const api = createPlayerDelegation({ service, scope: fixture.runtime.scope, current: fixture.runtime.authorized }, allowedActions, maximum);
            recorder = recordPlayerLabSession(api, client, model, conditions);
            return recorder.connection;
        });
        const config = buildAiConnectionConfig(client, 'player', path.resolve(__dirname, '../out/playerMcp.js'), host.endpoint, host.secret);
        fs.writeFileSync(configFile, config.text, { mode: 0o600, flag: 'wx' });
        console.log(JSON.stringify({ fixture: fixtureId, client, modelLabel: model, maximum,
            connectionFile: configFile, resultFile: output, task,
            instruction: 'Connect a fresh Player-only AI session. Disconnect when finished. No QA data may be supplied to that session.' }));
        await new Promise(resolve => {
            const interval = setInterval(() => { if (host.getAgentConnectionStatus().phase === 'closed') finish(); }, 200);
            function finish() { clearInterval(interval); process.off('SIGINT', finish); process.off('SIGTERM', finish); resolve(); }
            process.once('SIGINT', finish); process.once('SIGTERM', finish);
        });
        host.dispose();
        await recorder?.close();
        const report = recorder?.result(false);
        // Completion needs a separate evidence audit; receipt count alone cannot prove
        // the client followed the shared task or avoided out-of-band information.
        fs.writeFileSync(output, JSON.stringify(report ?? { client, model, complete: false, reason: 'not_paired' }, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ resultFile: output, complete: false, evidenceAuditRequired: true }));
    } finally {
        host?.dispose();
        await recorder?.close();
        if (fs.existsSync(configFile)) fs.writeFileSync(configFile, 'Expired fixture connection.\n');
        fixture.close();
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
