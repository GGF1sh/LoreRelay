'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
// Strict projections, not a raw report dump. A model-written narrative is never auto-published.
function renderLabArticleDraft(reports) {
    const references = new Map();
    const reference = value => {
        if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) return 'unresolved';
        if (!references.has(value)) references.set(value, `fixture_ref_${references.size + 1}`);
        return references.get(value);
    };
    const parameters = p => {
        if (!p || typeof p !== 'object') return null;
        const result = {};
        for (const key of ['destinationId', 'marketLocationId', 'commodityId']) if (Object.hasOwn(p, key)) result[key] = reference(p[key]);
        if (p.op === 'buy' || p.op === 'sell') result.op = p.op;
        if (Number.isSafeInteger(p.qty) && p.qty > 0 && p.qty <= 999) result.qty = p.qty;
        return result;
    };
    const categories = ['new_discovery_candidate', 'known_reproduction_candidate', 'model_decision_error', 'connection_failure', 'preference'];
    const modelLabel = value => typeof value === 'string' && /^(gpt-|claude-|gemini-|grok-|deepseek-|DeepSeek-|fixture)[A-Za-z0-9_.-]{0,96}$/.test(value) ? value : 'unverified';
    const classification = value => ['committed', 'committed_with_warning', 'committed_partial', 'outcome_unknown',
        'rejected_invalid', 'rejected_forbidden', 'rejected_busy', 'rejected_stale'].includes(value) ? value : 'unverified';
    const data = reports.map((report, index) => {
        if (!report || !report.connection || !['codex', 'claude', 'google', 'grok', 'deepseek'].includes(report.connection.provider)
            || !['player', 'qa'].includes(report.connection.role) || !Array.isArray(report.connection.calls)
            || report.connection.calls.length > 200) throw new Error('invalid_lab_report');
        const isPlayer = report.connection.role === 'player';
        const calls = report.connection.calls.map(call => ({ requestedModel: modelLabel(call.requestedModel), reportedModel: modelLabel(call.reportedModel),
            clientVersion: typeof call.clientVersion === 'string' && /^(\d+\.\d+\.\d+|sha256:[a-f0-9]{64})$/.test(call.clientVersion) ? call.clientVersion : 'unverified',
            modelRequestStarted: call.modelRequestStarted === true, responseReceived: call.responseReceived === true }));
        const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
        return { run: index + 1, provider: report.connection.provider, role: report.connection.role,
            humanPlay: false, completionAudited: false, calls,
            conditions: isPlayer ? { fixtureDigest: digest(report.conditions?.fixtureDigest),
                initialPublicDigest: digest(report.conditions?.initialPublicDigest), taskDigest: digest(report.conditions?.taskDigest),
                maximum: Number.isSafeInteger(report.conditions?.maximum) && report.conditions.maximum <= 100 ? report.conditions.maximum : null } : null,
            steps: isPlayer && Array.isArray(report.steps) ? report.steps.slice(0, 100).map(step => ({
                action: ['commerce:trade', 'commerce:travel', 'commerce:end_day'].includes(step.action) ? step.action : 'unverified',
                classification: classification(step.classification),
                parameters: parameters(step.parameters),
                commitStatus: ['not_committed', 'committed', 'partial', 'unknown'].includes(step.commitStatus) ? step.commitStatus : 'unknown',
            })) : [],
            findings: !isPlayer && Array.isArray(report.findings) ? report.findings.slice(0, 10).map(f => ({
                category: categories.includes(f.category) ? f.category : 'unverified',
                metricIndex: Number.isSafeInteger(f.metricIndex) && f.metricIndex >= 0 && f.metricIndex < 500 ? f.metricIndex : null,
                expectationObserved: typeof f.expectationObserved === 'boolean' ? f.expectationObserved : null,
                verification: 'requires_reproduction_and_triage',
            })) : [],
        };
    });
    const lines = ['# LoreRelay AIテストプレイ記録（記事用下書き）', '',
        '自動公開はしていません。Human Playは未実施・未代替です。実行条件とモデルの確認を終えるまでは公平な順位付けに使えません。', '',
        '| Run | 接続 | 権限 | モデル要求回数 | 応答取得 | 記録された操作 |', '| --- | --- | --- | ---: | ---: | ---: |'];
    for (const run of data) lines.push(`| ${run.run} | ${run.provider} | ${run.role} | ${run.calls.filter(c => c.modelRequestStarted).length} | ${run.calls.filter(c => c.responseReceived).length} | ${run.steps.length} |`);
    lines.push('', 'QAの指摘は仮説です。新規発見候補、既知問題の再現候補、判断ミス、接続障害、好みを分け、再現と原因の確認後に記事へ採用してください。', '',
        'モデル要求値・プロトコル報告値・クライアント版と操作分類は comparison.json に記録しています。通常campaignの文章、認証情報、confirmation、内部witnessは出力していません。', '');
    return { markdown: lines.join('\n'), data };
}
if (require.main === module) {
    try {
        const files = process.argv.slice(2);
        if (!files.length || files.length > 5) throw new Error('invalid_count');
        const reports = files.map(file => { if (fs.statSync(file).size > 1024 * 1024) throw new Error('too_large'); return JSON.parse(fs.readFileSync(file, 'utf8')); });
        const result = renderLabArticleDraft(reports);
        const directory = path.resolve(__dirname, '../.test-runs/ai-lab-article', randomUUID());
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, 'draft.md'), result.markdown, { flag: 'wx' });
        fs.writeFileSync(path.join(directory, 'comparison.json'), JSON.stringify(result.data, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ directory, published: false }));
    } catch { console.error('Article export refused: invalid or unreadable lab reports.'); process.exitCode = 1; }
}
module.exports = { renderLabArticleDraft };
