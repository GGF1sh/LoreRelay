'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { openActionFixture } = require('./action_scenario_fixture');
const { createCompanionReader } = require('../out/playerDelegationCore');
async function main() {
    const fixture = await openActionFixture();
    try {
        const file = path.join(fixture.workspace, 'world_state.json');
        const state = JSON.parse(fs.readFileSync(file, 'utf8'));
        const rulesFile = path.join(fixture.workspace, 'game_rules.json');
        const rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
        rules.enableEmergentSimulation = true;
        fs.writeFileSync(rulesFile, JSON.stringify(rules));
        const event = (id, extra) => ({ id, worldTurn: state.worldTurn, source: 'simulation', category: 'region',
            severity: 'info', message: id, gmHint: 'secret-gm-hint', ...extra });
        state.recentChanges = [event('public_event', { regionId: 'r_central' }),
            event('hidden_event', { regionId: 'r_south' }),
            event('hidden_target', { factionId: 'faction_merchants', targetFactionId: 'faction_port' }),
            event('npc_event', { npcIds: ['unknown_npc'] }),
            event('expired_event', { worldTurn: state.worldTurn - 2, expiresAfterTurns: 1 })];
        fs.writeFileSync(file, JSON.stringify(state));
        const before = fs.readFileSync(file, 'utf8');
        const service = fixture.runtime.service;
        const reader = service.createTrustedSession('narrator');
        const view = service.readPlayerView(reader);
        assert.deepEqual(view.recentEvents.map(value => value.message), ['public_event']);
        assert.equal(JSON.stringify(view).includes('secret-gm-hint'), false);
        assert.equal(fs.readFileSync(file, 'utf8'), before);
        service.close(reader);
        const companion = createCompanionReader({ service, current: fixture.runtime.authorized, scope: fixture.runtime.scope });
        assert((await companion.call('read_player_view', {})).geography);
        assert((await companion.call('query_available', {})).actions);
        for (const tool of ['preview', 'execute', 'inspect', 'read_committed_facts']) {
            assert.equal((await companion.call(tool, {})).classification, 'rejected_forbidden');
        }
        companion.dispose();
        assert.equal((await companion.call('read_player_view', {})).classification, 'rejected_forbidden');
        console.log('Public events: hidden region/target/NPC and expired events excluded, GM hint removed, canonical file unchanged.');
    } finally { fixture.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
