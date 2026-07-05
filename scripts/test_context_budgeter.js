const assert = require('assert');
const { allocateContextBudgets } = require('../out/contextEngineBudgeterCore');

function runTests() {
    console.log('--- Testing Context Engine Budgeter ---');

    const categories = [
        {
            categoryId: 'system_rules',
            budget: { min: 2000, target: 2000, max: 2000, borrowUnused: false },
            candidates: [
                {
                    id: 'rule1',
                    relevanceScore: 100,
                    lodVariants: [
                        { lod: 4, text: 'Full Rule Text', tokenCost: 1500 }
                    ]
                }
            ]
        },
        {
            categoryId: 'speaker_identity',
            budget: { min: 500, target: 1000, max: 1500, borrowUnused: true },
            candidates: [
                {
                    id: 'npc1',
                    relevanceScore: 90,
                    lodVariants: [
                        { lod: 4, text: 'Full Identity Text', tokenCost: 800 },
                        { lod: 0, text: 'ID only', tokenCost: 50 }
                    ]
                }
            ]
        },
        {
            categoryId: 'current_scene',
            budget: { min: 800, target: 2000, max: 2500, borrowUnused: true },
            candidates: [
                {
                    id: 'scene1',
                    relevanceScore: 80,
                    lodVariants: [
                        { lod: 4, text: 'Full Scene', tokenCost: 2400 },
                        { lod: 2, text: 'Partial Scene', tokenCost: 1200 },
                        { lod: 0, text: 'Scene Summary', tokenCost: 200 }
                    ]
                }
            ]
        }
    ];

    // Test 1: Sufficient budget
    const totalTokens = 4200;
    const result1 = allocateContextBudgets(categories, totalTokens);
    
    const sysRule = result1.find(r => r.categoryId === 'system_rules');
    assert.strictEqual(sysRule.allocatedTokens, 1500, 'System rules should fit fully');
    
    const speaker = result1.find(r => r.categoryId === 'speaker_identity');
    assert.strictEqual(speaker.items[0].lod, 4, 'Speaker should fit LOD 4 with target budget');

    const scene = result1.find(r => r.categoryId === 'current_scene');
    assert.strictEqual(scene.items[0].lod, 2, 'Scene should degrade to LOD 2 because 2400 > remaining budget');

    // Test 2: Starvation (Total Tokens < minSum)
    const starvedTokens = 2500;
    const result2 = allocateContextBudgets(categories, starvedTokens);

    const sysRule2 = result2.find(r => r.categoryId === 'system_rules');
    assert.strictEqual(sysRule2.allocatedTokens, 1500, 'Tier-0 should still be prioritized in starvation');

    const scene2 = result2.find(r => r.categoryId === 'current_scene');
    assert.strictEqual(scene2.items[0].lod, 0, 'Scene should heavily degrade to LOD 0 under starvation');

    console.log('All tests passed!');
}

runTests();
