const assert = require('assert');
const {
    buildSection,
    finalizeBreakdown,
    buildPromptBudgetDetails,
} = require('../out/promptContext');

console.log('Testing prompt context budget details...');

const sections = [
    buildSection('summary', 'Story Synopsis', 'a'.repeat(900)),
    buildSection('memory', 'Memory Bank', 'b'.repeat(1200)),
    buildSection('vision', 'Vision', ''),
];
const kept = sections.filter(Boolean);

const details = buildPromptBudgetDetails(kept, [
    { id: 'summary', label: 'Story Synopsis', limitChars: 2500 },
    { id: 'memory', label: 'Memory Bank', limitChars: 1600 },
    { id: 'vision', label: 'Vision', limitChars: 1200 },
]);

assert.deepStrictEqual(
    details.map((d) => [d.id, d.usedChars, d.limitChars, d.percent]),
    [
        ['summary', 900, 2500, 36],
        ['memory', 1200, 1600, 75],
        ['vision', 0, 1200, 0],
    ]
);

const breakdown = finalizeBreakdown(
    sections,
    'tfidf',
    [],
    [],
    'hint',
    { mode: 'balanced', requestedMode: 'auto', targetTokens: 7000 },
    [
        { id: 'summary', label: 'Story Synopsis', limitChars: 2500 },
        { id: 'memory', label: 'Memory Bank', limitChars: 1600 },
    ]
);

assert.strictEqual(breakdown.budget.mode, 'balanced');
assert.strictEqual(breakdown.budget.details.length, 2);
assert.strictEqual(breakdown.budget.details[1].label, 'Memory Bank');
assert.strictEqual(breakdown.budget.details[1].usedChars, 1200);

console.log('Prompt context budget detail tests passed.');
