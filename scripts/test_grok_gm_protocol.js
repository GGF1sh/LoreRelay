const assert = require('node:assert/strict');
const { GrokAcpProtocol } = require('../out/grokAcpProtocol');
const { GrokGmStream } = require('../out/grokGmProtocolCore');
(async () => {
    const sent = [];
    const rpc = new GrokAcpProtocol(line => sent.push(JSON.parse(line)), 1000);
    const pending = rpc.request('initialize', {});
    assert.equal(sent[0].jsonrpc, '2.0');
    rpc.receive(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: sent[0].id, result: { protocolVersion: 1 } }) + '\n'));
    assert.equal((await pending).protocolVersion, 1);
    rpc.receive(Buffer.from('{"jsonrpc":"2.0","id":"permission","method":"session/request_permission"}\n'));
    assert.equal(sent.at(-1).result.outcome.outcome, 'cancelled');
    assert.equal(sent.at(-1).jsonrpc, '2.0');
    const auth = rpc.request('session/new', {});
    const denied = assert.rejects(auth, /login_required/);
    rpc.receive(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: sent.at(-1).id,
        error: { code: -32000, message: 'Authentication required' } }) + '\n'));
    await denied;
    rpc.close();
    const drafts = [];
    const stream = new GrokGmStream('s1', value => drafts.push(value));
    const chunk = text => ({ sessionId: 's1', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } });
    stream.update(chunk('日本'));
    stream.update(chunk('語'));
    assert.equal(stream.finish({ stopReason: 'end_turn' }), '日本語');
    stream.update(chunk('late'));
    assert.deepEqual(drafts, ['日本', '語']);
    assert.throws(() => stream.finish({ stopReason: 'end_turn' }), /closed/);
    for (const stopReason of ['cancelled', 'max_tokens', 'refusal', 'max_turn_requests']) {
        const incomplete = new GrokGmStream('s1', () => {});
        incomplete.update(chunk('partial'));
        assert.throws(() => incomplete.finish({ stopReason }), /invalid_candidate/);
    }
    const invalid = new GrokGmStream('s1', () => {});
    assert.throws(() => invalid.update({ sessionId: 'other', update: {} }), /session_mismatch/);
    assert.throws(() => invalid.update({ sessionId: 's1', update: { sessionUpdate: 'tool_call' } }), /tool_unavailable/);
    invalid.cancel();
    assert.throws(() => invalid.finish({ stopReason: 'end_turn' }), /closed/);
    const modelBound = new GrokGmStream('s1', () => {}, 'fixture');
    assert.throws(() => modelBound.update({ sessionId: 's1', update: {
        sessionUpdate: 'current_model_update', currentModelId: 'other' } }), /model_unverified/);
    assert.throws(() => modelBound.update({ sessionId: 's1', update: {
        sessionUpdate: 'config_option_update', configOptions: [{ category: 'model', currentValue: 'other' }] } }), /model_unverified/);
    console.log('Grok ACP framing, permission denial, auth classification and candidate finality passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
