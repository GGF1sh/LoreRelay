'use strict';
const assert = require('assert/strict');
const { parseLiveQaRequest, LIVE_QA_OPERATIONS } = require('../out/liveExtensionQaCore');
const base = { id: 'request_0001', session: 'host_session', op: 'inspect', args: {} };
assert(parseLiveQaRequest(base));
for (const op of ['eval', 'shell', 'read_file', 'authorizeAdultMod', 'set_role']) assert.equal(parseLiveQaRequest({ ...base, op }), undefined);
for (const args of [{ path: 'game_state.json' }, { role: 'qa-runner' }, { workspace: 'C:/user' }, { command: 'reload' }])
    assert.equal(parseLiveQaRequest({ ...base, args }), undefined);
assert.equal(parseLiveQaRequest({ ...base, principal: 'qa-runner' }), undefined);
assert.equal(parseLiveQaRequest({ ...base, op: 'checkpoint_restore', args: { checkpointId: '../outside' } }), undefined);
assert(parseLiveQaRequest({ ...base, op: 'checkpoint_restore', args: { checkpointId: 'cp-123' } }));
assert.equal(LIVE_QA_OPERATIONS.length, 12);
console.log('Live QA closed protocol: action, authority and path injection rejected.');
