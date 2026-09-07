'use strict';
const assert = require('node:assert/strict');
const { renderLabArticleDraft } = require('./export_ai_lab_article');
const report = { connection: { provider: 'codex', role: 'player', calls: [{ requestedModel: 'gpt-fixture', reportedModel: 'gpt-fixture',
    clientVersion: '1.2.3', modelRequestStarted: true, responseReceived: true, account: 'SECRET_ACCOUNT' }] },
    steps: [{ action: 'commerce:travel', classification: 'committed', commitStatus: 'committed',
        parameters: { destinationId: 'PRIVATE_CAMPAIGN_ID', confirmationToken: 'SECRET_HANDLE' } }],
    prompt: 'PRIVATE_STORY', conditions: { maximum: 10 } };
const result = renderLabArticleDraft([report]);
const output = JSON.stringify(result);
for (const secret of ['SECRET_ACCOUNT', 'SECRET_HANDLE', 'PRIVATE_STORY', 'PRIVATE_CAMPAIGN_ID']) assert(!output.includes(secret));
assert.equal(result.data[0].steps[0].parameters.destinationId, 'fixture_ref_1');
assert.equal(result.data[0].calls[0].reportedModel, 'gpt-fixture');
assert.equal(result.data[0].completionAudited, false);
assert.throws(() => renderLabArticleDraft([{ ...report, connection: { ...report.connection, role: 'gm' } }]));
const qa = renderLabArticleDraft([{ connection: { ...report.connection, role: 'qa' }, findings: [{ category: 'new_discovery_candidate',
    metricIndex: 0, expectationObserved: false, privateText: 'SECRET' }] }]);
assert.equal(qa.data[0].findings[0].verification, 'requires_reproduction_and_triage');
assert(!JSON.stringify(qa).includes('SECRET'));
console.log('Article draft projection: model metadata, anonymized references, separated QA hypotheses and secret/text exclusion passed.');
