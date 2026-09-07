'use strict';
// Distinct QA entrypoint. No Player authority is created and no role-switch command exists.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { runLifecycle } = require('./run_live_extension_qa');
const { createQaLabModel } = require('./player_lab_provider');
const { projectQaLabMetrics, parseQaLabFindings } = require('../out/qaLabEvidenceCore');
async function main() {
    const [provider, model, consent, extra] = process.argv.slice(2);
    if (extra || !['codex', 'claude', 'google', 'grok', 'deepseek'].includes(provider)
        || !/^[A-Za-z0-9_.-]{1,100}$/.test(model || '') || consent !== '--send-fixture-context') throw new Error('invalid_qa_lab_arguments');
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
    const directory = path.resolve(__dirname, '../.test-runs/connected-qa-lab', randomUUID());
    fs.mkdirSync(directory, { recursive: true });
    const client = createQaLabModel({ provider, model, consent: true, maxTokens: 4096, getApiKey: async () => apiKey });
    const stop = () => client.dispose();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    const report = { role: 'qa', fixtureId: 'lifecycle_v1', complete: false, humanPlay: false,
        status: 'not_started', findings: [], metrics: [], evidenceScope: 'real_extension_host_inspection_not_fair_player' };
    try {
        report.lifecycle = await runLifecycle({ afterReload: async ({ request }) => {
            const before = await request('inspect');
            const preview = await request('preview', { actionId: 'commerce:end_day', parameters: {} });
            if (!preview.ok) throw new Error('qa_lab_preview_failed');
            const receipt = await request('execute', { actionId: 'commerce:end_day', parameters: {}, requestId: randomUUID(),
                confirmationToken: preview.confirmationToken });
            report.operation = { action: 'commerce:end_day', classification: receipt.classification, commitStatus: receipt.commitStatus };
            if (receipt.commitStatus !== 'committed') throw new Error('qa_lab_execution_unconfirmed');
            const projected = projectQaLabMetrics(before, await request('inspect'));
            report.metrics = projected.metrics; report.metricsTruncated = projected.truncated;
            report.metricPaths = projected.paths; // Local synthetic-fixture reproduction only; article projection omits these.
            const response = await client.ask('You are a QA analyst, not a Player. The data is from an isolated synthetic LoreRelay fixture '
                + 'after checkpoint restore and reload, followed by exactly one end day. Inspect numeric changes only. Do not execute tools. '
                + 'Return JSON {"findings":[{"category":"new_discovery_candidate|known_reproduction_candidate|model_decision_error|connection_failure|preference",'
                + '"metricIndex":0,"expectation":"nonnegative|positive|zero|increased|decreased|unchanged|changed"}]}. '
                + 'At most 10 entries; an empty list is valid. A proposal is not a confirmed bug. No free text or identifiers.\n'
                + JSON.stringify({ operation: report.operation, metrics: projected.metrics.map((metric, i) => ({ ...metric, path: projected.paths[i] })) }));
            report.findings = parseQaLabFindings(response, projected.metrics);
            report.status = 'analysis_received_requires_triage';
        } }, 'lifecycle_v1');
    } catch {
        report.status = 'unconfirmed_connection_or_fixture_failure';
        process.exitCode = 1;
    } finally {
        stop(); report.connection = client.evidence(); apiKey = '';
        process.off('SIGINT', stop); process.off('SIGTERM', stop);
        fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ resultFile: path.join(directory, 'result.json'), status: report.status, complete: false }));
    }
}
if (require.main === module) main().catch(() => { console.error('QA Lab requires an explicit fixture context consent and dedicated QA login. No automatic retry.'); process.exitCode = 1; });
module.exports = { main };
