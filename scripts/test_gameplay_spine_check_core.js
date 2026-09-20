#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const checkCorePath = path.join(root, 'out', 'gameplaySpineCheckCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(checkCorePath)) {
    fail('out/gameplaySpineCheckCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    parseCheckFormula,
    validateCheckSpec,
    validateRollReceipt,
    resolveCheck,
    projectCheckResolutionToDiceLedger
} = require(checkCorePath);

function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        fail(`${msg} (Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)})`);
    } else {
        ok(msg);
    }
}

function assertOk(result, msg) {
    if (!result.ok) {
        fail(`${msg} (Failed with error: ${JSON.stringify(result.error)})`);
    } else {
        ok(msg);
    }
}

function assertError(result, code, path, msg) {
    if (result.ok) {
        fail(`${msg} (Expected error but succeeded: ${JSON.stringify(result.value)})`);
    } else if (result.error.code !== code || result.error.path !== path) {
        fail(`${msg} (Expected ${code} at ${path}, got ${result.error.code} at ${result.error.path})`);
    } else {
        ok(msg);
    }
}

// -------------------------------------------------------------
// Formula Parser Tests
// -------------------------------------------------------------

// 1. d20 canonicalizes to 1d20.
{
    const res = parseCheckFormula('d20');
    assertOk(res, '1. parse d20');
    assertEqual(res.value.normalizedFormula, '1d20', '1. d20 normalizer');
}

// 2. 1d20-1d4+2 produces two signed terms and flat modifier 2.
{
    const res = parseCheckFormula('1d20-1d4+2');
    assertOk(res, '2. parse 1d20-1d4+2');
    assertEqual(res.value.terms, [
        { sign: 1, count: 1, sides: 20 },
        { sign: -1, count: 1, sides: 4 }
    ], '2. terms');
    assertEqual(res.value.flatModifier, 2, '2. flat modifier');
    assertEqual(res.value.normalizedFormula, '1d20-1d4+2', '2. normalizedFormula');
}

// 3. 2d6+1d8-3 produces two positive terms and flat modifier -3.
{
    const res = parseCheckFormula('2d6+1d8-3');
    assertOk(res, '3. parse 2d6+1d8-3');
    assertEqual(res.value.terms, [
        { sign: 1, count: 2, sides: 6 },
        { sign: 1, count: 1, sides: 8 }
    ], '3. terms');
    assertEqual(res.value.flatModifier, -3, '3. flat modifier');
    assertEqual(res.value.normalizedFormula, '2d6+1d8-3', '3. normalizedFormula');
}

// 4. d020 + 02 - 1d004 canonicalizes to 1d20-1d4+2.
{
    const res = parseCheckFormula('d020 + 02 - 1d004');
    assertOk(res, '4. parse d020 + 02 - 1d004');
    assertEqual(res.value.normalizedFormula, '1d20-1d4+2', '4. canonicalizes');
}

// 5. Flat terms appearing before and after dice are aggregated.
{
    const res = parseCheckFormula('5 + 1d6 - 2 + 2d8 + 3');
    assertOk(res, '5. parse flat terms before/after dice');
    assertEqual(res.value.flatModifier, 6, '5. aggregate flat');
    assertEqual(res.value.normalizedFormula, '1d6+2d8+6', '5. canonical');
}

// 6. Zero aggregate flat modifier is omitted.
{
    const res = parseCheckFormula('1d20+2-2');
    assertOk(res, '6. parse flat summing to 0');
    assertEqual(res.value.flatModifier, 0, '6. flatModifier is 0');
    assertEqual(res.value.normalizedFormula, '1d20', '6. omitted zero flat modifier');
}

// 7. Standalone 100 is rejected.
{
    const res = parseCheckFormula('100');
    assertError(res, 'out_of_range', 'formula', '7. standalone 100 rejected');
}

// 8. At least one explicit dice term is required.
{
    const res = parseCheckFormula('+5-2');
    assertError(res, 'out_of_range', 'formula', '8. no dice term rejected');
}

// 9. Formula length bounds.
{
    const resShort = parseCheckFormula('');
    assertError(resShort, 'out_of_range', 'formula', '9. empty formula rejected');
    
    const longFormula = '1d20' + '+1'.repeat(65); // 134 chars
    const resLong = parseCheckFormula(longFormula);
    assertError(resLong, 'out_of_range', 'formula', '9. 129+ char formula rejected');
}

// 10. Dice-term count bounds.
{
    const resMax = parseCheckFormula('1d6+1d6+1d6+1d6+1d6+1d6+1d6+1d6');
    assertOk(resMax, '10. 8 dice terms ok');
    const resOver = parseCheckFormula('1d6+1d6+1d6+1d6+1d6+1d6+1d6+1d6+1d6');
    assertError(resOver, 'out_of_range', 'formula', '10. 9 dice terms rejected');
}

// 11. Per-term dice-count bounds.
{
    const resOk = parseCheckFormula('100d6');
    assertOk(resOk, '11. 100 dice per term ok');
    const resOver = parseCheckFormula('101d6');
    assertError(resOver, 'out_of_range', 'formula', '11. 101 dice per term rejected');
    const resUnder = parseCheckFormula('0d6');
    assertError(resUnder, 'out_of_range', 'formula', '11. 0d6 rejected');
}

// 12. Aggregate dice-count bounds.
{
    const resOk = parseCheckFormula('50d6+50d6');
    assertOk(resOk, '12. 100 total dice ok');
    const resOver = parseCheckFormula('50d6+51d6');
    assertError(resOver, 'out_of_range', 'formula', '12. 101 total dice rejected');
}

// 13. Side bounds.
{
    const resOk1 = parseCheckFormula('1d2');
    assertOk(resOk1, '13. 2 sides ok');
    const resOk2 = parseCheckFormula('1d1000');
    assertOk(resOk2, '13. 1000 sides ok');
    const resUnder = parseCheckFormula('1d1');
    assertError(resUnder, 'out_of_range', 'formula', '13. 1 side rejected');
    const resOver = parseCheckFormula('1d1001');
    assertError(resOver, 'out_of_range', 'formula', '13. 1001 sides rejected');
}

// 14. Aggregate flat-modifier bounds.
{
    const resOk1 = parseCheckFormula('1d20+10000');
    assertOk(resOk1, '14. +10000 modifier ok');
    const resOk2 = parseCheckFormula('1d20-10000');
    assertOk(resOk2, '14. -10000 modifier ok');
    const resOver1 = parseCheckFormula('1d20+10001');
    assertError(resOver1, 'out_of_range', 'formula', '14. +10001 modifier rejected');
    const resOver2 = parseCheckFormula('1d20-10001');
    assertError(resOver2, 'out_of_range', 'formula', '14. -10001 modifier rejected');
}

// 15. Non-ASCII whitespace is not silently accepted.
{
    const res = parseCheckFormula('1d20 + \u00a0 2');
    assertError(res, 'invalid_format', 'formula', '15. non-ASCII space rejected');
}

// 16. Malformed and partially consumed formulas are rejected.
{
    assertError(parseCheckFormula('1d20+'), 'invalid_format', 'formula', '16. trailing sign');
    assertError(parseCheckFormula('1d20++2'), 'invalid_format', 'formula', '16. double sign');
    assertError(parseCheckFormula('1dd20'), 'invalid_format', 'formula', '16. double d');
    assertError(parseCheckFormula('1d20abc'), 'invalid_format', 'formula', '16. trailing letters');
}

// 17. Unsafe numeric tokens are rejected.
{
    // A number that is too large for JS safe integer limits
    assertError(parseCheckFormula('1d999999999999999999'), 'unsafe_integer', 'formula', '17. unsafe integer sides');
    assertError(parseCheckFormula('999999999999999999d6'), 'unsafe_integer', 'formula', '17. unsafe integer count');
}

// -------------------------------------------------------------
// CheckSpec Tests
// -------------------------------------------------------------

// Helper spec input
const makeValidSpec = () => ({
    formula: '1d20+2',
    dc: 15,
    modifiers: [
        { id: 'b_modifier', value: 3, source: 'equipment' },
        { id: 'a_modifier', value: -1, source: 'actor' }
    ]
});

// 18. Valid spec canonicalizes formula and sorts modifiers by ID.
{
    const spec = makeValidSpec();
    const res = validateCheckSpec(spec);
    assertOk(res, '18. validate valid spec');
    assertEqual(res.value.formula.normalizedFormula, '1d20+2', '18. canonicalized formula');
    assertEqual(res.value.modifiers[0].id, 'a_modifier', '18. sorted modifiers [0]');
    assertEqual(res.value.modifiers[1].id, 'b_modifier', '18. sorted modifiers [1]');
}

// 19. Duplicate modifier IDs are rejected.
{
    const spec = makeValidSpec();
    spec.modifiers.push({ id: 'a_modifier', value: 1, source: 'world' });
    const res = validateCheckSpec(spec);
    assertError(res, 'duplicate_id', 'modifiers[2].id', '19. duplicate modifier ID rejected');
}

// 20. Invalid modifier ID token is rejected.
{
    const spec = makeValidSpec();
    spec.modifiers[0].id = 'invalid id!';
    const res = validateCheckSpec(spec);
    assertError(res, 'invalid_format', 'modifiers[0].id', '20. spaces in modifier ID rejected');
    
    spec.modifiers[0].id = '';
    const res2 = validateCheckSpec(spec);
    assertError(res2, 'out_of_range', 'modifiers[0].id', '20. empty modifier ID rejected');
}

// 21. Invalid modifier source is rejected.
{
    const spec = makeValidSpec();
    spec.modifiers[0].source = 'invalid_source';
    const res = validateCheckSpec(spec);
    assertError(res, 'invalid_type', 'modifiers[0].source', '21. invalid source rejected');
}

// 22. Modifier count bound.
{
    const spec = makeValidSpec();
    spec.modifiers = Array.from({ length: 33 }, (_, i) => ({
        id: `mod_${i}`,
        value: 1,
        source: 'world'
    }));
    const res = validateCheckSpec(spec);
    assertError(res, 'too_many_items', 'modifiers', '22. 33 modifiers rejected');
}

// 23. Modifier value bounds.
{
    const spec = makeValidSpec();
    spec.modifiers[0].value = 10001;
    const res = validateCheckSpec(spec);
    assertError(res, 'out_of_range', 'modifiers[0].value', '23. modifier value too high');
    
    spec.modifiers[0].value = -10001;
    const res2 = validateCheckSpec(spec);
    assertError(res2, 'out_of_range', 'modifiers[0].value', '23. modifier value too low');
}

// 24. Aggregate contextual modifier bound.
{
    const spec = makeValidSpec();
    spec.modifiers = [
        { id: 'm1', value: 10000, source: 'world' },
        { id: 'm2', value: 10000, source: 'world' },
        { id: 'm3', value: 10000, source: 'world' },
        { id: 'm4', value: 10000, source: 'world' },
        { id: 'm5', value: 10000, source: 'world' },
        { id: 'm6', value: 10000, source: 'world' },
        { id: 'm7', value: 10000, source: 'world' },
        { id: 'm8', value: 10000, source: 'world' },
        { id: 'm9', value: 10000, source: 'world' },
        { id: 'm10', value: 10000, source: 'world' },
        { id: 'm11', value: 1, source: 'world' } // Total 100001
    ];
    const res = validateCheckSpec(spec);
    assertError(res, 'out_of_range', 'modifiers', '24. aggregate modifiers > 100000 rejected');
}

// 25. DC bounds and integer rules.
{
    const spec = makeValidSpec();
    spec.dc = 0;
    assertError(validateCheckSpec(spec), 'out_of_range', 'dc', '25. DC 0 rejected');
    
    spec.dc = -5;
    assertError(validateCheckSpec(spec), 'out_of_range', 'dc', '25. negative DC rejected');
    
    spec.dc = 100001;
    assertError(validateCheckSpec(spec), 'out_of_range', 'dc', '25. DC 100001 rejected');
    
    spec.dc = 10.5;
    assertError(validateCheckSpec(spec), 'invalid_type', 'dc', '25. float DC rejected');
}

// 26. Valid inclusive partial band.
{
    const spec = makeValidSpec();
    spec.partialBand = { minDeficit: 1, maxDeficit: 5 };
    assertOk(validateCheckSpec(spec), '26. valid partialBand ok');
}

// 27. Invalid partial-band bounds.
{
    const spec = makeValidSpec();
    spec.partialBand = { minDeficit: 0, maxDeficit: 5 };
    assertError(validateCheckSpec(spec), 'out_of_range', 'partialBand.minDeficit', '27. minDeficit 0 rejected');
    
    spec.partialBand = { minDeficit: 1, maxDeficit: 100001 };
    assertError(validateCheckSpec(spec), 'out_of_range', 'partialBand.maxDeficit', '27. maxDeficit 100001 rejected');
}

// 28. minDeficit > maxDeficit is rejected.
{
    const spec = makeValidSpec();
    spec.partialBand = { minDeficit: 5, maxDeficit: 4 };
    assertError(validateCheckSpec(spec), 'out_of_range', 'partialBand.maxDeficit', '28. min > max rejected');
}

// 29. Stable first-error code and path.
{
    const spec = {
        formula: '1d20++', // invalid format formula
        dc: -1, // out of range DC
    };
    // formula is checked first, so we should get formula error, not DC error
    assertError(validateCheckSpec(spec), 'invalid_format', 'formula', '29. formula checked before DC');
}

// 30. Input remains deeply unchanged.
{
    const spec = makeValidSpec();
    const original = JSON.parse(JSON.stringify(spec));
    validateCheckSpec(spec);
    assertEqual(spec, original, '30. spec object not mutated');
}


// -------------------------------------------------------------
// RollReceipt Tests
// -------------------------------------------------------------

const makeValidSpecResult = () => validateCheckSpec(makeValidSpec()).value;

const makeValidReceipt = () => ({
    schemaVersion: 1,
    receiptId: 'receipt_123',
    source: 'system_random',
    algorithmVersion: 'alg_v1',
    normalizedFormula: '1d20+2',
    terms: [
        { sign: 1, count: 1, sides: 20, rolls: [13] }
    ]
});

// 31. Valid system_random receipt.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    assertOk(validateRollReceipt(spec, receipt), '31. valid system_random receipt ok');
}

// 32. Valid seeded_simulation receipt.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.source = 'seeded_simulation';
    receipt.seedWitness = 'seed_witness_123';
    assertOk(validateRollReceipt(spec, receipt), '32. valid seeded_simulation receipt ok');
}

// 33. Wrong schema version rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.schemaVersion = 2;
    assertError(validateRollReceipt(spec, receipt), 'out_of_range', 'receipt.schemaVersion', '33. schemaVersion 2 rejected');
}

// 34. Invalid receipt ID rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.receiptId = 'invalid id!';
    assertError(validateRollReceipt(spec, receipt), 'invalid_format', 'receipt.receiptId', '34. space in receipt ID rejected');
}

// 35. Invalid algorithm version rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.algorithmVersion = '';
    assertError(validateRollReceipt(spec, receipt), 'out_of_range', 'receipt.algorithmVersion', '35. empty alg version rejected');
}

// 36. Unknown source rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.source = 'unknown_source';
    assertError(validateRollReceipt(spec, receipt), 'invalid_type', 'receipt.source', '36. unknown source rejected');
}

// 37. system_random with seed witness rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.seedWitness = 'witness';
    assertError(validateRollReceipt(spec, receipt), 'seed_witness_mismatch', 'receipt.seedWitness', '37. system_random + witness rejected');
}

// 38. seeded_simulation without seed witness rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.source = 'seeded_simulation';
    assertError(validateRollReceipt(spec, receipt), 'seed_witness_mismatch', 'receipt.seedWitness', '38. seeded_sim without witness rejected');
}

// 39. Invalid seed witness rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.source = 'seeded_simulation';
    receipt.seedWitness = 'invalid witness!';
    assertError(validateRollReceipt(spec, receipt), 'invalid_format', 'receipt.seedWitness', '39. invalid witness token rejected');
}

// 40. Formula mismatch rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.normalizedFormula = '1d20+3';
    assertError(validateRollReceipt(spec, receipt), 'formula_mismatch', 'receipt.normalizedFormula', '40. formula mismatch rejected');
}

// 41. Term-count mismatch rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.terms.push({ sign: 1, count: 1, sides: 6, rolls: [3] });
    assertError(validateRollReceipt(spec, receipt), 'term_mismatch', 'receipt.terms', '41. term count mismatch rejected');
}

// 42. Sign mismatch rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.terms[0].sign = -1;
    assertError(validateRollReceipt(spec, receipt), 'term_mismatch', 'receipt.terms[0].sign', '42. term sign mismatch rejected');
}

// 43. Count mismatch rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.terms[0].count = 2;
    receipt.terms[0].rolls = [13, 14];
    assertError(validateRollReceipt(spec, receipt), 'term_mismatch', 'receipt.terms[0].count', '43. term count mismatch rejected');
}

// 44. Side mismatch rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.terms[0].sides = 6;
    assertError(validateRollReceipt(spec, receipt), 'term_mismatch', 'receipt.terms[0].sides', '44. term sides mismatch rejected');
}

// 45. Roll-count mismatch rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.terms[0].rolls = [];
    assertError(validateRollReceipt(spec, receipt), 'roll_count_mismatch', 'receipt.terms[0].rolls', '45. rolls length mismatch rejected');
}

// 46. Roll below one rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.terms[0].rolls = [0];
    assertError(validateRollReceipt(spec, receipt), 'roll_out_of_range', 'receipt.terms[0].rolls[0]', '46. roll 0 rejected');
}

// 47. Roll above sides rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.terms[0].rolls = [21];
    assertError(validateRollReceipt(spec, receipt), 'roll_out_of_range', 'receipt.terms[0].rolls[0]', '47. roll 21 on d20 rejected');
}

// 48. Fractional/non-finite/unsafe roll rejected.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.terms[0].rolls = [10.5];
    assertError(validateRollReceipt(spec, receipt), 'invalid_type', 'receipt.terms[0].rolls[0]', '48. fractional roll rejected');
}

// 49. Stable first-error code and path.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    receipt.schemaVersion = 2; // Error 1
    receipt.normalizedFormula = 'mismatch'; // Error 2
    assertError(validateRollReceipt(spec, receipt), 'out_of_range', 'receipt.schemaVersion', '49. schemaVersion checked before formula mismatch');
}

// 50. Receipt remains deeply unchanged.
{
    const spec = makeValidSpecResult();
    const receipt = makeValidReceipt();
    const original = JSON.parse(JSON.stringify(receipt));
    validateRollReceipt(spec, receipt);
    assertEqual(receipt, original, '50. receipt object not mutated');
}


// -------------------------------------------------------------
// Resolution Tests
// -------------------------------------------------------------

// 51. total === dc produces success.
{
    const spec = { formula: '1d20', dc: 10, modifiers: [] };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [10] }]
    };
    const res = resolveCheck(spec, receipt);
    assertOk(res, '51. resolve check');
    assertEqual(res.value.total, 10, '51. total');
    assertEqual(res.value.outcome, 'success', '51. outcome success');
}

// 52. Above DC produces success.
{
    const spec = { formula: '1d20', dc: 10, modifiers: [] };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [11] }]
    };
    const res = resolveCheck(spec, receipt);
    assertEqual(res.value.outcome, 'success', '52. outcome success above DC');
}

// 53. Inclusive lower partial edge produces partial.
{
    const spec = {
        formula: '1d20',
        dc: 10,
        modifiers: [],
        partialBand: { minDeficit: 1, maxDeficit: 3 }
    };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [9] }] // deficit 1
    };
    const res = resolveCheck(spec, receipt);
    assertEqual(res.value.outcome, 'partial', '53. deficit 1 is partial');
}

// 54. Inclusive upper partial edge produces partial.
{
    const spec = {
        formula: '1d20',
        dc: 10,
        modifiers: [],
        partialBand: { minDeficit: 1, maxDeficit: 3 }
    };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [7] }] // deficit 3
    };
    const res = resolveCheck(spec, receipt);
    assertEqual(res.value.outcome, 'partial', '54. deficit 3 is partial');
}

// 55. Outside partial band produces failure.
{
    const spec = {
        formula: '1d20',
        dc: 10,
        modifiers: [],
        partialBand: { minDeficit: 1, maxDeficit: 3 }
    };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [6] }] // deficit 4
    };
    const res = resolveCheck(spec, receipt);
    assertEqual(res.value.outcome, 'failure', '55. deficit 4 is failure');
}

// 56. No partial band and below DC produces failure.
{
    const spec = { formula: '1d20', dc: 10, modifiers: [] };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [9] }]
    };
    const res = resolveCheck(spec, receipt);
    assertEqual(res.value.outcome, 'failure', '56. no partialBand, below DC is failure');
}

// 57. Negative dice term is subtracted.
{
    const spec = { formula: '1d20-1d4', dc: 10, modifiers: [] };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20-1d4',
        terms: [
            { sign: 1, count: 1, sides: 20, rolls: [15] },
            { sign: -1, count: 1, sides: 4, rolls: [3] }
        ]
    };
    const res = resolveCheck(spec, receipt);
    assertEqual(res.value.diceTotal, 12, '57. negative dice term subtracted (15 - 3 = 12)');
}

// 58. Formula flat modifier and contextual modifiers apply exactly once.
{
    const spec = {
        formula: '1d20+2',
        dc: 10,
        modifiers: [
            { id: 'a', value: 3, source: 'actor' },
            { id: 'b', value: -1, source: 'world' }
        ]
    };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20+2',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [10] }]
    };
    const res = resolveCheck(spec, receipt);
    assertEqual(res.value.diceTotal, 10, '58. dice total');
    assertEqual(res.value.formulaModifier, 2, '58. flat modifier');
    assertEqual(res.value.contextualModifierTotal, 2, '58. contextual total (3 - 1 = 2)');
    assertEqual(res.value.total, 14, '58. total = 10 + 2 + 2 = 14');
}

// 59. resolveCheck revalidates receipt evidence (no export monkey-patching).
// Under validated public bounds, arithmetic overflow is unreachable; overflow
// guards remain defense-in-depth. Observable runtime validation is proven here
// via a bad roll and in test 60 via a bad DC.
{
    const spec = { formula: '1d20', dc: 10, modifiers: [] };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [21] }]
    };
    const res = resolveCheck(spec, receipt);
    assertError(
        res,
        'roll_out_of_range',
        'receipt.terms[0].rolls[0]',
        '59. resolveCheck revalidates receipt without trusting caller rolls'
    );
}

// 60. resolveCheck() revalidates unknown input rather than trusting assertions.
{
    const badSpec = { formula: '1d20', dc: -100, modifiers: [] };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [10] }]
    };
    const res = resolveCheck(badSpec, receipt);
    assertError(res, 'out_of_range', 'dc', '60. resolveCheck revalidates spec');
}

// 61. Output is deterministic.
{
    const spec = { formula: '1d20+2', dc: 10, modifiers: [{ id: 'a', value: 2, source: 'actor' }] };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20+2',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [10] }]
    };
    const res1 = resolveCheck(spec, receipt);
    const res2 = resolveCheck(spec, receipt);
    assertEqual(res1.value, res2.value, '61. resolution output is deterministic');
}

// 62. Resolution is detached from later input mutation.
{
    const spec = { formula: '1d20+2', dc: 10, modifiers: [{ id: 'a', value: 2, source: 'actor' }] };
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20+2',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [10] }]
    };
    const res = resolveCheck(spec, receipt).value;
    
    // Mutate spec input
    spec.modifiers[0].value = 100;
    assertEqual(res.spec.modifiers[0].value, 2, '62. resolution output is deeply copied and detached from spec mutation');
    
    // Mutate receipt input
    receipt.terms[0].rolls[0] = 20;
    assertEqual(res.receipt.terms[0].rolls[0], 10, '62. resolution output is deeply copied and detached from receipt mutation');
}


// -------------------------------------------------------------
// Legacy Projection Tests
// -------------------------------------------------------------

// Helper ComputedCheckResolution maker
const makeComputedResolution = (outcome, pb = false) => {
    const spec = {
        formula: {
            schemaVersion: 1,
            normalizedFormula: '1d20+2',
            terms: [{ sign: 1, count: 1, sides: 20 }],
            flatModifier: 2
        },
        dc: 15,
        modifiers: [{ id: 'a', value: 1, source: 'actor' }]
    };
    if (pb) {
        spec.partialBand = { minDeficit: 1, maxDeficit: 3 };
    }
    const receipt = {
        schemaVersion: 1,
        receiptId: 'r1',
        source: 'system_random',
        algorithmVersion: 'v1',
        normalizedFormula: '1d20+2',
        terms: [{ sign: 1, count: 1, sides: 20, rolls: [10] }]
    };
    return {
        spec,
        receipt,
        diceTotal: 10,
        formulaModifier: 2,
        contextualModifierTotal: 1,
        total: 13,
        outcome
    };
};

// 63. Formula is canonical.
{
    const res = makeComputedResolution('success');
    const entry = projectCheckResolutionToDiceLedger(res);
    assertEqual(entry.formula, '1d20+2', '63. formula is canonical');
}

// 64. Rolls are flattened in term order.
{
    const res = makeComputedResolution('success');
    res.receipt.terms = [
        { sign: 1, count: 2, sides: 6, rolls: [3, 4] },
        { sign: -1, count: 1, sides: 4, rolls: [2] }
    ];
    const entry = projectCheckResolutionToDiceLedger(res);
    assertEqual(entry.rolls, [3, 4, 2], '64. rolls flattened');
}

// 65. Modifier combines formula and contextual modifiers.
{
    const res = makeComputedResolution('success');
    const entry = projectCheckResolutionToDiceLedger(res);
    assertEqual(entry.modifier, 3, '65. modifier combined (2 + 1 = 3)');
}

// 66. Total and DC are computed values.
{
    const res = makeComputedResolution('success');
    const entry = projectCheckResolutionToDiceLedger(res);
    assertEqual(entry.total, 13, '66. total');
    assertEqual(entry.dc, 15, '66. dc');
}

// 67. Success outcome projects success: true.
{
    const res = makeComputedResolution('success');
    const entry = projectCheckResolutionToDiceLedger(res);
    assertEqual(entry.success, true, '67. success true');
}

// 68. Failure outcome projects success: false.
{
    const res = makeComputedResolution('failure');
    const entry = projectCheckResolutionToDiceLedger(res);
    assertEqual(entry.success, false, '68. success false');
}

// 69. Partial outcome omits success.
{
    const res = makeComputedResolution('partial', true);
    const entry = projectCheckResolutionToDiceLedger(res);
    assertEqual('success' in entry, false, '69. success omitted for partial');
}

// 70. Reason is trimmed.
{
    const res = makeComputedResolution('success');
    const entry = projectCheckResolutionToDiceLedger(res, '  some reason  ');
    assertEqual(entry.reason, 'some reason', '70. reason trimmed');
}

// 71. Empty reason is omitted.
{
    const res = makeComputedResolution('success');
    const entry1 = projectCheckResolutionToDiceLedger(res, '   ');
    assertEqual('reason' in entry1, false, '71. whitespace reason omitted');
    
    const entry2 = projectCheckResolutionToDiceLedger(res, '');
    assertEqual('reason' in entry2, false, '71. empty reason omitted');
}

// 72. Reason truncates to 200 UTF-16 code units.
{
    const res = makeComputedResolution('success');
    const longReason = 'a'.repeat(250);
    const entry = projectCheckResolutionToDiceLedger(res, longReason);
    assertEqual(entry.reason.length, 200, '72. reason truncated to 200 chars');
}

// 73. Projection does not mutate resolution.
{
    const res = makeComputedResolution('success');
    const original = JSON.parse(JSON.stringify(res));
    projectCheckResolutionToDiceLedger(res, 'reason');
    assertEqual(res, original, '73. projection does not mutate resolution object');
}


// -------------------------------------------------------------
// Purity Guard Tests
// -------------------------------------------------------------

// 74. Source does not import or call diceRoller or processDiceMacros.
// 75. Source contains no RNG, time, filesystem, network, VS Code, or persistence usage.
{
    const sourceCode = fs.readFileSync(path.join(root, 'src', 'gameplaySpineCheckCore.ts'), 'utf8');
    
    // Check forbidden imports/keywords
    const forbidden = [
        'diceRoller',
        'processDiceMacros',
        'Math.random',
        'Date.now',
        'new Date',
        'crypto.randomInt',
        'fs',
        'vscode',
        'http',
        'net',
        'setTimeout',
        'setInterval'
    ];
    
    for (const word of forbidden) {
        if (sourceCode.includes(word)) {
            fail(`74/75. Source contains forbidden word/import: "${word}"`);
        } else {
            ok(`74/75. Source free of "${word}"`);
        }
    }

    // Check path module specifically (to allow 'path: string' property definition)
    if (sourceCode.includes('require(\'path\')') || sourceCode.includes('require("path")') || sourceCode.includes('import') && sourceCode.includes('\'path\'')) {
        fail('74/75. Source contains forbidden import of "path" module');
    } else {
        ok('74/75. Source free of "path" module import');
    }
}


// -------------------------------------------------------------
// Exit Code
// -------------------------------------------------------------
if (failed > 0) {
    process.exit(1);
}
console.log('\ngameplaySpineCheckCore tests passed.');
process.exit(0);
