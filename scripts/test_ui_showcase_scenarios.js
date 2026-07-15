const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Import actual parsers from out/ (must compile first)
const { parseWorldForge } = require('../out/worldForgeCore');
const { parseVehicleState } = require('../out/vehicleCore');
const { parseVehicleStateDocument } = require('../out/vehicleStateDocumentCore');
const { parseWorldState } = require('../out/worldStateCore');
// Character manager and persona parsers are not entirely pure, so we use JSON parse + basic structure checks for them.

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
        return parserFn(raw, 'test-fallback');
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

    // 2. Verify OPEN_SHOWCASE.bat uses %~dp0 and references all directories
    const batContent = fs.readFileSync(path.join(TARGET_DIR, 'OPEN_SHOWCASE.bat'), 'utf8');
    for (const s of SCENARIOS) {
        assert(batContent.includes(`"%~dp0${s}"`), `OPEN_SHOWCASE.bat is missing %~dp0 reference to ${s}`);
    }
    assert(batContent.includes('code "%~dp0'), "OPEN_SHOWCASE.bat must use 'code' command with %~dp0");

    // 3. Verify files claimed in SHOWCASE_INDEX.md
    const indexContent = fs.readFileSync(path.join(TARGET_DIR, 'SHOWCASE_INDEX.md'), 'utf8');
    assert(indexContent.includes('01-populated-world'), "Index must claim populated world");
    assert(indexContent.includes('02-empty-states'), "Index must claim empty states");
    assert(indexContent.includes('03-layout-stress'), "Index must claim layout stress");
    assert(indexContent.includes('04-vehicle-repair-smoke-v1'), "Index must claim repair smoke");
    assert(indexContent.includes('Omitted since there is no stable'), "Index must state omitted routes/logistics");

    // 4. Verify populated-world
    const popWorld = path.join(TARGET_DIR, '01-populated-world');
    const wfPop = tryParseFile(path.join(popWorld, 'world_forge.json'), parseWorldForge);
    assert(wfPop && wfPop.geography.regions.length > 0, "Populated world forge must have regions");
    const wsPop = tryParseFile(path.join(popWorld, 'world_state.json'), parseWorldState);
    assert(wsPop && Object.keys(wsPop.markets).length > 0, "Populated world state must have markets");

    // Populated vehicles check (1 normal, 1 mobile base, 1 damaged)
    const vsPopRaw = tryParseFile(path.join(popWorld, 'vehicle_state.json'));
    const vsPopDoc = parseVehicleStateDocument(vsPopRaw); // Strict v1/v2 parser
    assert(vsPopDoc.kind === 'valid_v1' || vsPopDoc.kind === 'valid_v2', "Populated vehicle state must be valid document");
    assert(vsPopDoc.document.vehicles.length === 3, "Populated vehicle state must have 3 vehicles");
    let hasMobileBase = false;
    let hasDamaged = false;
    let hasNormal = false;
    for (const v of vsPopDoc.document.vehicles) {
        if (v.mobileBase) hasMobileBase = true;
        else if (v.status === 'damaged') hasDamaged = true;
        else if (v.status === 'available') hasNormal = true;
    }
    assert(hasMobileBase, "Must have a mobile base");
    assert(hasDamaged, "Must have a damaged vehicle");
    assert(hasNormal, "Must have a normal healthy vehicle");

    // Characters check
    assert(fs.existsSync(path.join(popWorld, 'characters', 'party.json')), "Party file must exist");
    assert(fs.existsSync(path.join(popWorld, 'characters', 'active_character.txt')), "Active character file must exist");
    assert(fs.existsSync(path.join(popWorld, 'characters', 'npc_yuki.json')), "Character profile file must exist");
    assert(fs.existsSync(path.join(popWorld, 'persona.json')), "Persona file must exist");
    assert(fs.existsSync(path.join(popWorld, 'parlor_session.npc_yuki.json')), "Parlor session must exist");
    assert(!fs.existsSync(path.join(popWorld, 'npc_registry.json')), "Omitted npc_registry must not exist");

    // 5. Verify vehicle-repair-smoke-v1
    const repWorld = path.join(TARGET_DIR, '04-vehicle-repair-smoke-v1');
    const repRaw = JSON.parse(fs.readFileSync(path.join(repWorld, 'vehicle_state.json'), 'utf8'));
    // verify vehicle smoke starts as strict valid v1
    const repDoc = parseVehicleStateDocument(repRaw);
    assert(repDoc.kind === 'valid_v1', "Vehicle repair smoke must be v1");
    assert(!('gameplayCommitReceipts' in repDoc.document), "gameplayCommitReceipts must be absent from v1 repair scenario");
    const damaged = repDoc.document.vehicles.find(v => v.status === 'damaged');
    const healthy = repDoc.document.vehicles.find(v => v.status === 'available');
    // verify the damaged vehicle is selectable by the current repair command
    assert(damaged, "Must have one damaged repairable vehicle");
    assert(damaged.durability.hp < damaged.durability.maxHp, "Damaged vehicle must have hp < maxHp");
    assert(damaged.status === 'damaged', "Damaged vehicle status must be damaged");

    // verify the healthy vehicle is not repairable by HP
    assert(healthy, "Must have one healthy vehicle");
    assert(healthy.durability.hp === healthy.durability.maxHp, "Healthy vehicle must not be repairable by HP");

    console.log('All UI Showcase validations passed.');
}

runValidation();
