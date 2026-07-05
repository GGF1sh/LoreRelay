const {
    evaluateFoodCrisisEvent,
    evaluateSteelCraftEvent,
    evaluateFactionFrictionEvent,
    evaluateRegionDangerEvent,
} = require('../out/livingWorldTypes');

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function testFoodCrisis() {
    console.log('--- testFoodCrisis ---');
    
    // Correct match
    let res = evaluateFoodCrisisEvent({ worldTurn: 1, category: 'resource', message: 'A severe food shortage.' });
    assert(res.matched === true, 'Valid food crisis should match');
    
    // Keyword match but wrong category (false positive prevention)
    res = evaluateFoodCrisisEvent({ worldTurn: 1, category: 'faction', message: 'A severe food shortage.' });
    assert(res.matched === false, 'Wrong category should reject');
    
    // Category match but no keyword (false positive prevention)
    res = evaluateFoodCrisisEvent({ worldTurn: 1, category: 'resource', message: 'Gold mines depleted.' });
    assert(res.matched === false, 'Missing keyword should reject');
}

function testSteelCraft() {
    console.log('--- testSteelCraft ---');
    
    // Correct match
    let res = evaluateSteelCraftEvent({ worldTurn: 1, category: 'resource', message: 'The local smith forged new steel armor.' });
    assert(res.matched === true, 'Valid steel craft should match');
    
    // Wrong category
    res = evaluateSteelCraftEvent({ worldTurn: 1, category: 'region', message: 'Steel prices are good.' });
    assert(res.matched === false, 'Wrong category should reject');
}

function testFactionFriction() {
    console.log('--- testFactionFriction ---');
    
    // Correct match
    let res = evaluateFactionFrictionEvent({ worldTurn: 1, category: 'faction', message: 'High friction at the borders.' });
    assert(res.matched === true, 'Valid faction friction should match');
    
    // Missing keyword
    res = evaluateFactionFrictionEvent({ worldTurn: 1, category: 'faction', message: 'Trade agreement signed.' });
    assert(res.matched === false, 'Missing keyword should reject');
}

function testRegionDanger() {
    console.log('--- testRegionDanger ---');
    
    // Correct match
    let res = evaluateRegionDangerEvent({ worldTurn: 1, category: 'region', message: 'The area is in danger.' });
    assert(res.matched === true, 'Valid region danger should match');
    
    // Wrong category
    res = evaluateRegionDangerEvent({ worldTurn: 1, category: 'info', message: 'danger ahead.' });
    assert(res.matched === false, 'Wrong category should reject');
}

try {
    testFoodCrisis();
    testSteelCraft();
    testFactionFriction();
    testRegionDanger();
    console.log('All event classification tests PASS');
} catch (e) {
    console.error(e);
    process.exit(1);
}
