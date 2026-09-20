'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
const launches = [];
let ready = true, generated = 0;
class Client {
    constructor(options) { this.options = options; this.clientVersion = '1.2.3'; launches.push(options); }
    async initialize() { return ready ? 'ready' : 'login_required'; }
    async generate(prompt) { generated++; this.reportedModel = this.options.model; return prompt; }
    dispose() {}
}
Module._load = function (request) {
    const names = { '../out/codexGmClient': 'CodexGmClient', '../out/claudeGmClient': 'ClaudeGmClient',
        '../out/antigravityGmClient': 'AntigravityGmClient', '../out/grokGmClient': 'GrokGmClient', '../out/deepSeekGmClient': 'DeepSeekGmClient' };
    return names[request] ? { [names[request]]: Client } : original.apply(this, arguments);
};
const { createPlayerLabModel, createQaLabModel } = require('./player_lab_provider');
Module._load = original;
async function main() {
    assert.throws(() => createPlayerLabModel({ provider: 'codex', model: 'fixture' }), /consent_required/);
    assert.throws(() => createPlayerLabModel({ provider: '../gm', model: 'fixture', consent: true }), /invalid_lab_provider/);
    for (const provider of ['codex', 'claude', 'google', 'grok', 'deepseek']) {
        const player = createPlayerLabModel({ provider, model: 'fixture', consent: true, getApiKey: async () => 'SECRET' });
        const qa = createQaLabModel({ provider, model: 'fixture', consent: true });
        assert.notEqual(player.profileDirectory, qa.profileDirectory);
        assert.equal(await player.ask('PUBLIC_ONLY'), 'PUBLIC_ONLY');
        assert.equal(await player.ask('PUBLIC_QUOTE'), 'PUBLIC_QUOTE');
        const calls = launches.slice(-2);
        assert.notEqual(calls[0].workingDirectory, calls[1].workingDirectory, 'Each request has a fresh working area and process');
        assert.equal(calls[0].profileDirectory, calls[1].profileDirectory, 'Same role may reuse official credentials, not a conversation');
        const evidence = player.evidence();
        assert.equal(evidence.calls.length, 2);
        assert.equal(evidence.calls[0].reportedModel, 'fixture');
        assert.equal(evidence.calls[0].responseReceived, true);
        assert(!JSON.stringify(evidence).includes('SECRET'));
        assert(!JSON.stringify(evidence).includes('PUBLIC_ONLY'));
        assert(!JSON.stringify(evidence).includes(player.profileDirectory));
        player.dispose(); qa.dispose();
        await assert.rejects(player.ask('late'), /stopped_or_busy/);
    }
    ready = false;
    const unauth = createPlayerLabModel({ provider: 'codex', model: 'fixture', consent: true });
    const before = generated;
    await assert.rejects(unauth.ask('must not be sent'), /login_required/);
    assert.equal(generated, before);
    assert.equal(unauth.evidence().calls[0].modelRequestStarted, false);
    unauth.dispose();
    console.log('Player/QA transport factory: five adapters, separate role profiles, fresh requests, consent and login gates, sanitized protocol metadata passed. Mock clients only.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
