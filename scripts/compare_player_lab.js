'use strict';
const fs = require('fs');
const { comparePlayerLabRuns } = require('../out/playerLabCore');
const files = process.argv.slice(2);
try {
    if (!files.length || files.length > 4) throw new Error('provide_one_to_four_result_files');
    const actions = ['commerce:trade', 'commerce:travel', 'commerce:end_day'];
    const classifications = ['committed', 'committed_with_warning', 'committed_partial', 'outcome_unknown',
        'rejected_invalid', 'rejected_forbidden', 'rejected_busy', 'rejected_stale'];
    const runs = files.map(file => {
        if (fs.statSync(file).size > 1024 * 1024) throw new Error('result_too_large');
        const run = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!run || typeof run.client !== 'string' || run.client.length > 80 || typeof run.model !== 'string' || run.model.length > 80
            || typeof run.complete !== 'boolean' || !run.conditions || !Array.isArray(run.steps) || run.steps.length > 100) throw new Error('invalid_result');
        const c = run.conditions;
        if (!['fixtureDigest', 'initialPublicDigest', 'taskDigest'].every(key => /^[a-f0-9]{64}$/.test(c[key]))
            || !Number.isInteger(c.maximum) || c.maximum < 1 || c.maximum > 100
            || !Array.isArray(c.allowedActions) || !c.allowedActions.length || c.allowedActions.some(action => !actions.includes(action))) throw new Error('invalid_conditions');
        const steps = run.steps.map(step => {
            if (!step || !actions.includes(step.action) || !classifications.includes(step.classification)
                || !['committed', 'not_committed', 'partial', 'unknown'].includes(step.commitStatus)) throw new Error('invalid_step');
            const safe = { action: step.action, classification: step.classification, commitStatus: step.commitStatus };
            if (step.trade) {
                const t = step.trade;
                if (step.action !== 'commerce:trade' || step.commitStatus !== 'committed' || !['committed', 'committed_with_warning'].includes(step.classification)
                    || !['buy', 'sell'].includes(t.op) || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(t.commodityId)
                    || !Number.isFinite(t.qty) || t.qty <= 0 || !Number.isFinite(t.total) || t.total < 0) throw new Error('invalid_trade');
                safe.trade = { op: t.op, commodityId: t.commodityId, qty: t.qty, total: t.total };
            }
            return safe;
        });
        let receiptChecks;
        if (run.receiptChecks !== undefined) {
            const value = run.receiptChecks;
            if (!value || !['calls', 'unknown', 'errors'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
                || value.unknown + value.errors > value.calls) throw new Error('invalid_receipt_checks');
            receiptChecks = { calls: value.calls, unknown: value.unknown, errors: value.errors };
        }
        return { client: run.client, model: run.model, complete: run.complete, ...(receiptChecks ? { receiptChecks } : {}), conditions: {
            fixtureDigest: c.fixtureDigest, initialPublicDigest: c.initialPublicDigest, taskDigest: c.taskDigest,
            maximum: c.maximum, allowedActions: c.allowedActions,
        }, steps };
    });
    console.log(JSON.stringify({ ...comparePlayerLabRuns(runs),
        interpretation: 'Receipt action tendencies, not a model ranking. Cash flow is not profit. Completion and model labels require external evidence audit.' }, null, 2));
} catch { console.error('Cannot compare these Player Lab results: invalid, incomplete-schema, or unreadable input.'); process.exitCode = 1; }
