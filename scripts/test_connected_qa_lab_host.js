'use strict';
// Run only in the existing isolated real-Host CI job. The model is explicitly a stub.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const provider = require('./player_lab_provider');
provider.createQaLabModel = () => ({ dispose() {}, async ask(prompt) {
    assert(prompt.includes('QA analyst, not a Player'));
    assert(prompt.includes('commerce:end_day'));
    assert(!prompt.includes('confirmationToken'));
    return '{"findings":[]}';
}, evidence() { return { provider: 'codex', role: 'qa', calls: [], testModel: 'scripted_not_real' }; } });
process.argv = [process.execPath, __filename, 'codex', 'fixture', '--send-fixture-context'];
const log = console.log;
let resultFile;
console.log = value => {
    try { const parsed = JSON.parse(value); if (parsed.resultFile) resultFile = parsed.resultFile; } catch { /* lifecycle output */ }
    log(value);
};
require('./run_connected_qa_lab').main().then(() => {
    assert(resultFile);
    const report = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    assert.equal(report.lifecycle.status, 'passed');
    assert.equal(report.operation.commitStatus, 'committed');
    assert.equal(report.status, 'analysis_received_requires_triage');
    assert(report.metrics.length > 0);
    assert.equal(report.complete, false);
    assert(!JSON.stringify(report).includes('confirmationToken'));
    log('Connected QA: actual Extension Host lifecycle and extra end day inspection passed. AI response scripted; no actual model claim.');
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { console.log = log; });
