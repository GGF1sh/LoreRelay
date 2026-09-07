'use strict';
const assert = require('node:assert/strict');
const { AntigravityGmStream } = require('../out/antigravityGmProtocolCore');
const init = { event: 'init', conversation_id: 'fixture-session', init: { model: 'fixture-model', tools: [] } };
const result = { event: 'result', result: { conversation_id: 'fixture-session', status: 'SUCCESS', response: '{"narrative":"fixture"}', num_turns: 1 } };
const send = (stream, event) => stream.accept(JSON.stringify(event));
const make = () => new AntigravityGmStream('fixture-model', () => {});
let draft = '';
const good = new AntigravityGmStream('fixture-model', text => { draft += text; });
send(good, init);
send(good, { event: 'step_update', step_update: { conversation_id: 'fixture-session', step_type: 'agent_response', text_delta: 'candidate' } });
send(good, result); send(good, result);
assert.equal(good.finish(0), result.result.response);
assert.equal(draft, 'candidate');
assert.throws(() => good.finish(0));
for (const bad of [
    { ...init, init: { ...init.init, model: 'other' } },
    { ...init, init: { ...init.init, tools: ['run_command'] } },
    { ...init, init: { model: 'fixture-model' } },
]) { const stream = make(); assert.throws(() => send(stream, bad)); assert.throws(() => stream.finish(0)); }
for (const bad of [
    { event: 'result', result: { ...result.result, conversation_id: 'other' } },
    { event: 'result', result: { ...result.result, status: 'WAITING' } },
    { event: 'result', result: { ...result.result, num_turns: 2 } },
    { event: 'step_update', step_update: { conversation_id: 'fixture-session', step_type: 'run_command' } },
    { event: 'step_update', step_update: { conversation_id: 'other', step_type: 'agent_response', text_delta: 'secret' } },
]) { const stream = make(); send(stream, init); assert.throws(() => send(stream, bad)); assert.throws(() => stream.finish(0)); }
const conflicting = make(); send(conflicting, init); send(conflicting, result);
assert.throws(() => send(conflicting, { event: 'result', result: { ...result.result, response: 'different' } }));
assert.throws(() => conflicting.finish(0));
const nonzero = make(); send(nonzero, init); send(nonzero, result); assert.throws(() => nonzero.finish(1));
const missing = make(); assert.throws(() => send(missing, result));
const malformed = make(); assert.throws(() => malformed.accept('{')); assert.throws(() => send(malformed, init));
console.log('Antigravity GM stream: identity, tool-free boundaries, candidate finality and terminal failures passed');
