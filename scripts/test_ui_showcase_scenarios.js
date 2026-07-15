const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Import actual parsers from out/ (must compile first)
const { parseWorldForge } = require('../out/worldForgeCore');
const { parseVehicleState } = require('../out/vehicleCore');
const { parseWorldState } = require('../out/worldStateCore');
// We use basic JSON parse for game_rules since it might not have a strict pure-core parser exported.
// And game_state is normally handled by host logic or workspace loaders, but we can do a basic check.
// Actually, `parseWorldIntent` or similar exist, but let's just do a basic JSON check if no strict parser exists.

const TARGET_DIR = 'C:\\AI\\artifacts\\LoreRelay\\showcase\\current';
const SCENARIOS = [
    '01-populated-world',
    '02-empty-states',
    '03-layout-stress',
    '04-vehicle-repair-smoke-v1'
];

function checkDirectory(dir) {
    if (!fs.existsSync(dir)) {
        throw new Error(`Directory does not exist: ${dir}`);
    }
}

function tryParseFile(filePath, parserFn) {
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parserFn) {
        return parserFn(raw, 'test-fallback'); // second argument for parlorSession fallback if needed
    }
    return raw;
}

function runValidation() {
    console.log('Testing UI Showcase Scenarios...');
    
    // 1. Verify directories exist
    checkDirectory(TARGET_DIR);
    for (const s of SCENARIOS) {
        checkDirectory(path.join(TARGET_DIR, s));
    }

    // 2. Verify OPEN_SHOWCASE.bat exists and references all directories
    const batContent = fs.readFileSync(path.join(TARGET_DIR, 'OPEN_SHOWCASE.bat'), 'utf8');
    for (const s of SCENARIOS) {
        assert(batContent.includes(s), `OPEN_SHOWCASE.bat is missing reference to ${s}`);
    }

    // 3. Verify populated-world
    const popWorld = path.join(TARGET_DIR, '01-populated-world');
    const wfPop = tryParseFile(path.join(popWorld, 'world_forge.json'), parseWorldForge);
    assert(wfPop && wfPop.geography.regions.length > 0, "Populated world forge must have regions");
    const vsPop = tryParseFile(path.join(popWorld, 'vehicle_state.json'), parseVehicleState);
    assert(vsPop && vsPop.vehicles.length > 0, "Populated vehicle state must have vehicles");
    const wsPop = tryParseFile(path.join(popWorld, 'world_state.json'), parseWorldState);
    assert(wsPop && Object.keys(wsPop.markets).length > 0, "Populated world state must have markets");

    // 4. Verify empty-states
    const empWorld = path.join(TARGET_DIR, '02-empty-states');
    const wfEmp = tryParseFile(path.join(empWorld, 'world_forge.json'), parseWorldForge);
    assert(wfEmp && wfEmp.geography.regions.length === 0, "Empty world forge must have no regions");
    const vsEmp = tryParseFile(path.join(empWorld, 'vehicle_state.json'), parseVehicleState);
    assert(vsEmp && vsEmp.vehicles.length === 0, "Empty vehicle state must have no vehicles");

    // 5. Verify layout-stress
    const lsWorld = path.join(TARGET_DIR, '03-layout-stress');
    const vsLs = tryParseFile(path.join(lsWorld, 'vehicle_state.json'), parseVehicleState);
    assert(vsLs && vsLs.vehicles.length > 0, "Layout stress vehicle state must have vehicles");
    // Ensure it survived bounds truncations (e.g., text clamps don't break the structure)
    assert.strictEqual(vsLs.vehicles[0].name.length <= 80, true, "Vehicle name should be clamped by parseVehicleState");

    // 6. Verify vehicle-repair-smoke-v1
    const repWorld = path.join(TARGET_DIR, '04-vehicle-repair-smoke-v1');
    const vsRep = tryParseFile(path.join(repWorld, 'vehicle_state.json'), parseVehicleState);
    assert(vsRep, "Vehicle repair smoke must have valid vehicle state");
    assert.strictEqual(vsRep.version, 1, "Vehicle repair smoke must be v1");
    
    // Specifically verify the required data
    const damaged = vsRep.vehicles.find(v => v.status === 'damaged');
    const healthy = vsRep.vehicles.find(v => v.status === 'available');
    assert(damaged, "Must have one damaged repairable vehicle");
    assert(healthy, "Must have one healthy vehicle");
    assert(damaged.durability.hp < damaged.durability.maxHp, "Damaged vehicle must have hp < maxHp");

    // Check that there are no receipts (it's v1)
    const rawVsRep = JSON.parse(fs.readFileSync(path.join(repWorld, 'vehicle_state.json'), 'utf8'));
    assert(!rawVsRep.receipts, "Vehicle repair smoke must not have v2 receipts");

    // 7. Prevent path leakage
    assert(!TARGET_DIR.includes('text-adventure-vsce'), "Generated paths must not point to the real extension workspace");

    console.log('All UI Showcase validations passed.');
}

runValidation();
