'use strict';
const assert = require('node:assert/strict');
const { projectQaLabMetrics, parseQaLabFindings } = require('../out/qaLabEvidenceCore');
const projected = projectQaLabMetrics({ credits: 5, secretToken: 9000, story: 'PRIVATE', nested: { food: 0 } },
    { credits: 4, secretToken: 9001, story: 'PRIVATE', nested: { food: 2 } });
assert.equal(projected.metrics.length, 2);
assert(!JSON.stringify(projected).includes('PRIVATE'));
assert(!JSON.stringify(projected).includes('secretToken'));
const findings = parseQaLabFindings(JSON.stringify({ findings: [{ category: 'new_discovery_candidate', metricIndex: 0, expectation: 'increased' }] }), projected.metrics);
assert.equal(findings[0].expectationObserved, false);
assert.equal(findings[0].verification, 'requires_reproduction_and_triage');
assert.throws(() => parseQaLabFindings('{"findings":[{"category":"confirmed_bug","metricIndex":0,"expectation":"positive"}]}', projected.metrics));
assert.throws(() => parseQaLabFindings('{"findings":[{"category":"preference","metricIndex":999,"expectation":"positive"}]}', projected.metrics));
assert.throws(() => parseQaLabFindings('{"findings":[],"text":"SECRET"}', projected.metrics));
assert.deepEqual(parseQaLabFindings('{"findings":[]}', projected.metrics), []);
const huge = Object.fromEntries(Array.from({ length: 600 }, (_, i) => ['x' + i, i]));
assert.equal(projectQaLabMetrics({}, huge).truncated, true);
assert.equal(projectQaLabMetrics({}, huge).metrics.length, 500);
console.log('QA Lab numeric evidence: private text exclusion, bounded metrics, typed hypotheses and no invented bug confirmation passed.');
