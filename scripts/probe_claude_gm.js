// Dedicated empty profile. No login, model prompt, credentials or account identifiers are emitted.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { ClaudeGmClient } = require('../out/claudeGmClient');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-claude-probe-'));
const profileDirectory = path.join(root, 'profile'), workingDirectory = path.join(root, 'work');
fs.mkdirSync(profileDirectory); fs.mkdirSync(workingDirectory);
const client = new ClaudeGmClient({ executable: 'claude', profileDirectory, workingDirectory, model: 'claude-readiness-only' });
client.initialize().then(status => console.log(JSON.stringify({ status, clientVersion: client.clientVersion, modelCalled: false })))
    .catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => client.dispose());
