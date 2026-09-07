'use strict';
const assert = require('assert/strict');
const { buildVoiceCompanionConfig } = require('../out/voiceCompanionCore');
const token = 'a'.repeat(64);
const config = buildVoiceCompanionConfig('https://fixture.invalid/mcp', token, 2000, 'companion', 1000);
assert.equal(config.sessionUpdate.type, 'session.update');
assert.deepEqual(config.sessionUpdate.session.tools[0].allowed_tools, ['read_player_view', 'query_available']);
assert.equal(config.sessionUpdate.session.tools[0].authorization, `Bearer ${token}`);
assert(!JSON.stringify(config).includes('XAI_API_KEY'));
const diary = buildVoiceCompanionConfig('https://fixture.invalid/mcp', token, 2000, 'narrator', 1000);
assert.deepEqual(diary.sessionUpdate.session.tools[0].allowed_tools, ['read_committed_facts']);
for (const url of ['http://fixture.invalid/mcp', 'https://user:pass@fixture.invalid/mcp', 'https://fixture.invalid/mcp?secret=x', 'https://fixture.invalid/other']) {
    assert.throws(() => buildVoiceCompanionConfig(url, token, 2000, 'companion', 1000));
}
assert.throws(() => buildVoiceCompanionConfig('https://fixture.invalid/mcp', token, 1000, 'companion', 1000));
assert.throws(() => buildVoiceCompanionConfig('https://fixture.invalid/mcp', token, 2000, 'player', 1000));
console.log('Voice config: fixed read-only tools, HTTPS endpoint, bounded lease and no Player role passed. No xAI call or microphone used.');
