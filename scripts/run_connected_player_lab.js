'use strict';
// Explicit, finite fixture invocation. Never attaches to a normal campaign or a GM session.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { openActionFixture } = require('./action_scenario_fixture');
const { createPlayerDelegation } = require('../out/playerDelegationCore');
const { hashGameActionValue } = require('../out/gameActionService');
const { recordPlayerLabSession } = require('../out/playerLabCore');
const { runPlayerLabDecision } = require('../out/playerLabDecisionCore');
const { createPlayerLabModel } = require('./player_lab_provider');
const ROOT = path.resolve(__dirname, '..');
async function main() {
    const [provider, model, consent, extra] = process.argv.slice(2);
    if (extra || !['codex', 'claude', 'google', 'grok', 'deepseek'].includes(provider)
        || !/^[A-Za-z0-9_.-]{1,100}$/.test(model || '') || consent !== '--send-fixture-context') {
        throw new Error('usage: node scripts/run_connected_player_lab.js codex|claude|google|grok|deepseek MODEL --send-fixture-context');
    }
    // DeepSeek secrets enter through stdin, never argv, environment, a report or a profile file.
    // The explicit command authorizes only this fixture context and the stated bounded budget.
    let apiKey = '';
    if (provider === 'deepseek') {
        let input = '';
        for await (const chunk of process.stdin) {
            input += chunk.toString(); if (Buffer.byteLength(input) > 8192) throw new Error('invalid_key_input');
        }
        let parsed; try { parsed = JSON.parse(input); } catch { throw new Error('invalid_key_input'); }
        if (!parsed || Object.keys(parsed).length !== 1 || typeof parsed.apiKey !== 'string'
            || !parsed.apiKey.trim() || parsed.apiKey.length > 4096 || /[\r\n]/.test(parsed.apiKey)) throw new Error('invalid_key_input');
        apiKey = parsed.apiKey;
    }
    const fixtureId = 'player_lab_support_v1', maximum = 10;
    const allowedActions = ['commerce:trade', 'commerce:travel', 'commerce:end_day'];
    const outputDirectory = path.join(ROOT, '.test-runs', 'connected-player-lab', randomUUID());
    fs.mkdirSync(outputDirectory, { recursive: true });
    const controller = new AbortController();
    const client = createPlayerLabModel({ provider, model, consent: true, maxTokens: 4096, getApiKey: async () => apiKey });
    const stop = () => { controller.abort(); client.dispose(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    let fixture, recorder;
    try {
        fixture = await openActionFixture(fixtureId);
        const api = createPlayerDelegation({ service: fixture.runtime.service, scope: fixture.runtime.scope,
            current: fixture.runtime.authorized }, allowedActions, maximum);
        const initialPublicDigest = hashGameActionValue(await api.call('read_player_view', {}));
        const task = fs.readFileSync(path.join(ROOT, 'integrations/player-lab-task.md'), 'utf8').replace(/\r\n/g, '\n');
        const fixtureDigest = hashGameActionValue(['game_state.json', 'world_state.json', 'world_forge.json', 'game_rules.json']
            .map(name => fs.readFileSync(path.join(ROOT, 'fixtures/action-scenarios', fixtureId, name), 'utf8')));
        recorder = recordPlayerLabSession(api, provider, model,
            { fixtureDigest, initialPublicDigest, taskDigest: hashGameActionValue(task), maximum, allowedActions });
        const decisions = [];
        for (let index = 0; index < maximum && !controller.signal.aborted; index++) {
            const result = await runPlayerLabDecision(recorder.connection, prompt => client.ask(prompt),
                task + '\nPrevious public receipt summary: ' + JSON.stringify(recorder.result().steps), controller.signal);
            decisions.push(result);
            // Rejection, stale/busy, unknown or a stopped model ends this explicit run. No automatic retry.
            if (result.status !== 'executed') break;
        }
        await recorder.close();
        const report = { ...recorder.result(false), fixtureId, decisions, connection: client.evidence(),
            worldRandomness: { seed: null, mode: 'deterministic_world_turn',
                note: 'This fixed Commerce fixture has no world RNG input; no artificial seed is injected.' },
            modelSamplingSeed: null, // These official transports do not offer a shared sampling seed.
            evidenceScope: 'shared_service_fixture_not_real_extension_host', humanPlay: false,
            auditRequired: true };
        if (controller.signal.aborted || decisions.some(decision => !['executed', 'stopped'].includes(decision.status))) process.exitCode = 1;
        fs.writeFileSync(path.join(outputDirectory, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ resultFile: path.join(outputDirectory, 'result.json'), complete: false,
            executions: report.steps.length, status: decisions.at(-1)?.status ?? 'cancelled' }));
    } finally {
        stop(); await recorder?.close(); fixture?.close(); apiKey = '';
        process.off('SIGINT', stop); process.off('SIGTERM', stop);
    }
}
if (require.main === module) main().catch(() => { console.error('Connected Player Lab could not finish. No automatic retry. Check arguments and dedicated role login.'); process.exitCode = 1; });
module.exports = { main };
