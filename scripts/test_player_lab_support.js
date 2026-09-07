'use strict';
const assert = require('assert/strict');
const { randomUUID } = require('crypto');
const { openActionFixture } = require('./action_scenario_fixture');
async function run(support) {
    const fixture = await openActionFixture('player_lab_support_v1');
    const { createPlayerDelegation } = require('../out/playerDelegationCore');
    const api = createPlayerDelegation({ service: fixture.runtime.service, scope: fixture.runtime.scope,
        current: fixture.runtime.authorized }, ['commerce:trade', 'commerce:travel', 'commerce:end_day'], 10);
    try {
        const status = view => view.worldPacing.regions.find(region => region.regionId === 'r_central').status;
        const before = await api.call('read_player_view', {});
        assert.equal(status(before), 'shortage');
        assert(!JSON.stringify(before.geography).includes('r_south'), 'hidden region stays hidden');
        const execute = async (actionId, parameters) => {
            const preview = await api.call('preview', { actionId, parameters });
            assert.equal(preview.ok, true);
            const receipt = await api.call('execute', { actionId, parameters, requestId: randomUUID(), confirmationToken: preview.confirmationToken });
            assert.equal(receipt.commitStatus, 'committed');
            return receipt;
        };
        if (support) {
            await execute('commerce:travel', { destinationId: 'elda_shop' });
            await execute('commerce:trade', { op: 'sell', marketLocationId: 'elda_shop', commodityId: 'wheat', qty: 4 });
        }
        await execute('commerce:end_day', {});
        const after = await api.call('read_player_view', {});
        assert.equal(status(after), support ? 'supplied' : 'shortage');
        assert.equal(after.worldTurn, before.worldTurn + 1);
    } finally { api.dispose(); fixture.close(); }
}
(async () => { await assert.rejects(openActionFixture('../outside'), /unknown_fixture/); await run(false); await run(true);
    console.log('Player Lab support fixture: public shortage persists when waiting; committed sale plus day restores supply.');
})().catch(error => { console.error(error); process.exitCode = 1; });
