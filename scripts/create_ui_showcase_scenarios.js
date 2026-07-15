const fs = require('fs');
const path = require('path');

const targetDir = process.argv[2] || 'C:\\AI\\artifacts\\LoreRelay\\showcase\\current';

function writeJson(dir, file, obj) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), JSON.stringify(obj, null, 2), 'utf8');
}

function writeTxt(dir, file, text) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), text, 'utf8');
}

// ---------------------------------------------------------
// 01-populated-world
// ---------------------------------------------------------
function createPopulatedWorld() {
    const dir = path.join(targetDir, '01-populated-world');
    
    // game_rules.json
    writeJson(dir, 'game_rules.json', {
        enableRpgMechanics: true,
        defaultMaxHp: 20,
        defaultMaxMp: 8,
        diceDifficulty: "Normal",
        enableNpcRegistry: true,
        enableWorldForge: true,
        enableEmergentSimulation: true,
        enableCommerce: true,
        enableCommerceUi: true,
        playerRole: "merchant",
        enableNpcAgency: true,
        enableNpcRelationships: true,
        enableFactionReputation: true,
        enableTravelEncounters: true,
        travelEncounterDensity: "low",
        simIntervalTurns: 1,
        backgroundSimulation: false,
        autoLorebookGrowth: false,
        enableVehicleSystem: true,
        enableSettlementMode: true,
        enableMobileBaseSystem: true
    });

    // game_state.json
    writeJson(dir, 'game_state.json', {
        entries: [
            {
                id: "turn-1",
                role: "gm",
                sender: "Game Master",
                content: "You arrive at the busy port.",
                editedAt: "2026-07-01T00:00:00.000Z"
            }
        ],
        status: {
            location: "Kyoto Port",
            time: "Day",
            hp: { current: 18, max: 20 },
            mp: { current: 8, max: 8 },
            condition: ["healthy"],
            inventory: ["katana", "travel_rations"],
            skills: ["negotiation"],
            funds: "150 ryo"
        },
        world: {
            currentLocationId: "loc_osaka_port"
        },
        commerce: {
            credits: 150,
            food: 10,
            transportId: "wagon_1",
            playerRole: "merchant",
            cargo: []
        },
        theme: "fantasy"
    });

    // world_forge.json
    writeJson(dir, 'world_forge.json', {
        format: "lorerelay-world-forge/1.0",
        meta: {
            worldName: "Kansai Merchants",
            theme: "fantasy",
            worldSeed: "showcase-1"
        },
        geography: {
            regions: [
                {
                    id: "reg_kyoto",
                    name: "Kyoto Outskirts",
                    description: "Ancient capital.",
                    type: "city",
                    dangerLevel: 1,
                    connectedTo: ["reg_osaka"]
                },
                {
                    id: "reg_osaka",
                    name: "Osaka Bay",
                    description: "Busy merchant hub.",
                    type: "coast",
                    dangerLevel: 2,
                    connectedTo: ["reg_kyoto"]
                }
            ],
            locations: [
                {
                    id: "loc_kyoto_market",
                    name: "Kyoto Grand Market",
                    regionId: "reg_kyoto",
                    description: "Silk and spices.",
                    type: "market",
                    factionControl: "fac_merchants",
                    connectedTo: ["loc_osaka_port"]
                },
                {
                    id: "loc_osaka_port",
                    name: "Osaka Port",
                    regionId: "reg_osaka",
                    description: "Ships and salt.",
                    type: "port",
                    factionControl: "fac_merchants",
                    connectedTo: ["loc_kyoto_market"]
                }
            ]
        },
        factions: [
            {
                id: "fac_merchants",
                name: "Kansai Guild",
                type: "guild",
                power: 50,
                description: "Wealthy traders.",
                goals: [], enemies: [], allies: []
            }
        ],
        commerce: {
            commodities: [
                { id: "silk", name: "Silk", basePrice: 50, weight: 1, role: "material" },
                { id: "tea", name: "Tea", basePrice: 20, weight: 1, role: "staple" },
                { id: "salt", name: "Salt", basePrice: 5, weight: 2, role: "staple" },
                { id: "fish", name: "Fish", basePrice: 8, weight: 2, role: "staple" }
            ],
            markets: [
                { locationId: "loc_kyoto_market", commodityIds: ["silk", "tea"], targetStock: 100 },
                { locationId: "loc_osaka_port", commodityIds: ["salt", "fish"], targetStock: 100 }
            ],
            transportKinds: [
                { id: "wagon_1", name: "Wagon", capacity: 50, speed: 1, foodPerDay: 2 }
            ],
            resourceFlows: {
                nodes: [
                    { locationId: "loc_kyoto_market", production: [{ commodityId: "silk", qtyPerTurn: 5 }, { commodityId: "tea", qtyPerTurn: 10 }] },
                    { locationId: "loc_osaka_port", production: [{ commodityId: "salt", qtyPerTurn: 20 }, { commodityId: "fish", qtyPerTurn: 15 }] }
                ],
                routes: [
                    { id: "route_kyoto_osaka", sourceLocationId: "loc_osaka_port", targetLocationId: "loc_kyoto_market", commodityId: "salt", capacityPerTurn: 10, priority: 1, active: true },
                    { id: "route_osaka_kyoto", sourceLocationId: "loc_kyoto_market", targetLocationId: "loc_osaka_port", commodityId: "silk", capacityPerTurn: 5, priority: 1, active: true }
                ]
            }
        }
    });

    // world_state.json
    writeJson(dir, 'world_state.json', {
        format: "lorerelay-world-state/1.0",
        worldTurn: 10,
        factions: {
            "fac_merchants": { power: 50, resources: { "ryo": 1000 }, morale: 50 }
        },
        regions: {
            "reg_kyoto": { dangerLevel: 1, controllingFaction: "fac_merchants" },
            "reg_osaka": { dangerLevel: 2 }
        },
        markets: {
            "loc_kyoto_market": {
                "silk": { stock: 10, priceIndex: 1.0 },
                "tea": { stock: 20, priceIndex: 1.0 }
            },
            "loc_osaka_port": {
                "salt": { stock: 50, priceIndex: 1.0 },
                "fish": { stock: 30, priceIndex: 1.0 }
            }
        }
    });

    // vehicle_state.json (v1)
    writeJson(dir, 'vehicle_state.json', {
        version: 1,
        activeVehicleId: "wagon_1",
        updatedTurn: 10,
        vehicles: [
            {
                id: "wagon_1",
                name: "Trade Wagon",
                kind: "wagon",
                owner: { type: "party" },
                status: "available",
                locationId: "loc_osaka_port",
                capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 0, cargoCapacity: 10, currentCargoLoad: 5 },
                access: { sizeClass: "medium", accessTags: ["road"] },
                mobility: { speedBand: "normal", rangeBand: "local", terrainTags: ["road"] },
                durability: { hp: 50, maxHp: 50, armorBand: "none", condition: "pristine" },
                cargo: [
                    { id: "salt", label: "Sea Salt", amount: 5, tags: ["food"] }
                ],
                modules: [], crew: [], notes: [], tags: []
            },
            {
                id: "ship_1",
                name: "River Barge",
                kind: "boat",
                owner: { type: "party" },
                status: "parked",
                locationId: "loc_osaka_port",
                capacity: { crewRequired: 2, crewCapacity: 5, passengerCapacity: 10, cargoCapacity: 50, currentCargoLoad: 0 },
                access: { sizeClass: "large", accessTags: ["shallow_water"] },
                mobility: { speedBand: "slow", rangeBand: "regional", terrainTags: ["water"] },
                durability: { hp: 100, maxHp: 100, armorBand: "light", condition: "pristine" },
                mobileBase: {
                    settlementId: "osaka_base_1",
                    mode: "ship",
                    layoutProfile: "deck",
                    interiorAccess: "crew_only"
                },
                cargo: [], modules: [], crew: [], notes: [], tags: []
            },
            {
                id: "damaged_cart",
                name: "Broken Handcart",
                kind: "cart",
                owner: { type: "party" },
                status: "damaged",
                locationId: "loc_osaka_port",
                capacity: { crewRequired: 1, crewCapacity: 1, passengerCapacity: 0, cargoCapacity: 5, currentCargoLoad: 0 },
                access: { sizeClass: "small", accessTags: ["road"] },
                mobility: { speedBand: "slow", rangeBand: "local", terrainTags: ["road"] },
                durability: { hp: 5, maxHp: 20, armorBand: "none", condition: "damaged" },
                cargo: [], modules: [], crew: [], notes: [], tags: []
            }
        ]
    });

    // characters
    const charDir = path.join(dir, 'characters');
    writeJson(charDir, 'npc_yuki.json', {
        id: "npc_yuki",
        name: "Yuki",
        description: "Merchant Guard.",
        personality: "Protective.",
        controlledBy: "ai"
    });
    writeJson(charDir, 'party.json', ["npc_yuki"]);
    writeTxt(charDir, 'active_character.txt', "npc_yuki");

    // persona.json
    writeJson(dir, 'persona.json', {
        version: 1,
        name: "Kenji",
        description: "Wandering Merchant. Born in Osaka. Goal: Amass a fortune.",
        speakingStyle: "Polite but shrewd."
    });

    // parlor_session.[id].json
    writeJson(dir, 'parlor_session.npc_yuki.json', {
        sessionId: "sess_1",
        characterId: "npc_yuki",
        turn: 10,
        history: [
            { speaker: "Yuki", text: "Ready to depart when you are.", type: "dialogue" }
        ]
    });

    // settlement_state.json
    writeJson(dir, 'settlement_state.json', {
        version: 1,
        settlementId: "osaka_base_1",
        name: "Osaka Mobile Base",
        locationId: "loc_osaka_port",
        stocks: [
            { id: "rations", amount: 10 },
            { id: "wood", amount: 5 }
        ],
        structures: [
            { id: "bridge", name: "Ship Bridge", status: "intact", layerId: "z1" },
            { id: "hull", name: "Outer Hull", status: "damaged", layerId: "z0" }
        ],
        residents: [
            { npcId: "npc_yuki", role: "captain" }
        ],
        visitors: [],
        merchants: [],
        incidents: []
    });
}

// ---------------------------------------------------------
// 02-empty-states
// ---------------------------------------------------------
function createEmptyStates() {
    const dir = path.join(targetDir, '02-empty-states');
    
    writeJson(dir, 'game_rules.json', {
        enableRpgMechanics: true,
        enableCommerce: true,
        enableVehicleSystem: true
    });

    writeJson(dir, 'game_state.json', {
        entries: [],
        status: {
            location: "Unknown",
            time: "Day",
            hp: { current: 10, max: 10 },
            mp: { current: 0, max: 0 }
        }
    });

    writeJson(dir, 'vehicle_state.json', {
        version: 1,
        vehicles: []
    });

    writeJson(dir, 'world_state.json', {
        format: "lorerelay-world-state/1.0",
        worldTurn: 1,
        factions: {},
        regions: {},
        markets: {}
    });

    writeJson(dir, 'world_forge.json', {
        format: "lorerelay-world-forge/1.0",
        meta: { worldName: "Empty World" },
        geography: { regions: [], locations: [] },
        factions: []
    });

    const charDir = path.join(dir, 'characters');
    writeJson(charDir, 'party.json', []);
}

// ---------------------------------------------------------
// 03-layout-stress
// ---------------------------------------------------------
function createLayoutStress() {
    const dir = path.join(targetDir, '03-layout-stress');
    const veryLongString = "This is a very long string meant to stress the layout and test text wrapping boundaries in the user interface. ".repeat(10);
    const longName = "Super Long Name ".repeat(5).trim();
    const jpText = "長いテキスト長いテキスト".repeat(10);

    writeJson(dir, 'game_rules.json', {
        enableCommerce: true,
        enableVehicleSystem: true
    });

    writeJson(dir, 'game_state.json', {
        entries: [
            {
                id: "turn-1",
                role: "gm",
                sender: "Game Master",
                content: jpText,
                editedAt: "2026-07-01T00:00:00.000Z"
            }
        ],
        status: {
            location: longName,
            time: "Midnight Eclipse",
            hp: { current: 9999, max: 9999 },
            mp: { current: 9999, max: 9999 },
            condition: ["cursed_by_a_thousand_suns"],
            inventory: Array.from({length: 20}, (_, i) => `Item_With_Very_Long_Name_${i}`),
            skills: [jpText],
            funds: "999999999 ryo"
        }
    });

    writeJson(dir, 'vehicle_state.json', {
        version: 1,
        activeVehicleId: "v_1",
        vehicles: [
            {
                id: "v_1",
                name: longName,
                kind: "mobile_base",
                owner: { type: "party" },
                status: "available",
                locationId: "loc_1",
                capacity: { crewRequired: 1, crewCapacity: 99, passengerCapacity: 99, cargoCapacity: 999, currentCargoLoad: 100 },
                access: { sizeClass: "colossal", accessTags: ["spaceport"] },
                mobility: { speedBand: "very_fast", rangeBand: "very_long", terrainTags: ["space"] },
                durability: { hp: 9999, maxHp: 9999, armorBand: "fortified", condition: "pristine" },
                cargo: Array.from({length: 20}, (_, i) => ({ id: `cargo_${i}`, label: `Cargo Item ${i} - ${longName}`, amount: 10, tags: [] })),
                modules: [], crew: [], notes: [{ text: veryLongString }], tags: ["super_massive_tag_name"]
            }
        ]
    });

    const markets = {};
    const regions = {};
    for (let i = 0; i < 20; i++) {
        markets[`loc_${i}`] = {
            [`item_${i}`]: { stock: 999, priceIndex: 9.99 }
        };
        regions[`reg_${i}`] = { dangerLevel: 5 };
    }

    writeJson(dir, 'world_state.json', {
        format: "lorerelay-world-state/1.0",
        worldTurn: 999,
        factions: { "fac_1": { power: 999 } },
        regions,
        markets
    });
}

// ---------------------------------------------------------
// 04-vehicle-repair-smoke-v1
// ---------------------------------------------------------
function createVehicleRepairSmoke() {
    const dir = path.join(targetDir, '04-vehicle-repair-smoke-v1');
    
    writeJson(dir, 'game_rules.json', {
        enableVehicleSystem: true
    });

    writeJson(dir, 'game_state.json', {
        entries: [],
        status: {
            location: "Repair Bay",
            time: "Day",
            hp: { current: 10, max: 10 },
            mp: { current: 0, max: 0 }
        }
    });

    writeJson(dir, 'vehicle_state.json', {
        version: 1,
        activeVehicleId: "damaged_cart",
        updatedTurn: 5,
        vehicles: [
            {
                id: "damaged_cart",
                name: "Broken Handcart",
                kind: "cart",
                owner: { type: "party" },
                status: "damaged",
                locationId: "loc_repair_bay",
                capacity: { crewRequired: 1, crewCapacity: 1, passengerCapacity: 0, cargoCapacity: 5, currentCargoLoad: 0 },
                access: { sizeClass: "small", accessTags: ["road"] },
                mobility: { speedBand: "slow", rangeBand: "local", terrainTags: ["road"] },
                durability: { hp: 5, maxHp: 20, armorBand: "none", condition: "damaged" },
                cargo: [], modules: [], crew: [], notes: [], tags: []
            },
            {
                id: "healthy_wagon",
                name: "Sturdy Wagon",
                kind: "wagon",
                owner: { type: "party" },
                status: "available",
                locationId: "loc_repair_bay",
                capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 2, cargoCapacity: 20, currentCargoLoad: 0 },
                access: { sizeClass: "medium", accessTags: ["road"] },
                mobility: { speedBand: "normal", rangeBand: "local", terrainTags: ["road"] },
                durability: { hp: 50, maxHp: 50, armorBand: "none", condition: "pristine" },
                cargo: [], modules: [], crew: [], notes: [], tags: []
            }
        ]
    });
    
    writeJson(dir, 'world_state.json', {
        format: "lorerelay-world-state/1.0",
        worldTurn: 5,
        regions: {
            "loc_repair_bay": { dangerLevel: 0 }
        },
        factions: {}, markets: {}
    });
}

// ---------------------------------------------------------
// Main
// ---------------------------------------------------------
createPopulatedWorld();
createEmptyStates();
createLayoutStress();
createVehicleRepairSmoke();

const batContent = `@echo off
echo =========================================
echo LoreRelay UI Showcase
echo =========================================
echo 1. Populated world (01-populated-world)
echo 2. Empty states (02-empty-states)
echo 3. Layout stress (03-layout-stress)
echo 4. Vehicle repair smoke (04-vehicle-repair-smoke-v1)
echo 5. Open showcase folder
echo 0. Exit
echo =========================================
set /p choice="Select a scenario to open (0-5): "

if "%choice%"=="1" (
    code "%~dp001-populated-world" || echo Path: "%~dp001-populated-world"
) else if "%choice%"=="2" (
    code "%~dp002-empty-states" || echo Path: "%~dp002-empty-states"
) else if "%choice%"=="3" (
    code "%~dp003-layout-stress" || echo Path: "%~dp003-layout-stress"
) else if "%choice%"=="4" (
    code "%~dp004-vehicle-repair-smoke-v1" || echo Path: "%~dp004-vehicle-repair-smoke-v1"
) else if "%choice%"=="5" (
    explorer "%~dp0."
) else if "%choice%"=="0" (
    exit /b 0
) else (
    echo Invalid choice.
)
pause
`;
writeTxt(targetDir, 'OPEN_SHOWCASE.bat', batContent);

const readmeContent = `LoreRelay UI Showcase Suites

These are disposable test workspaces. They do not contain your real campaign data.
You can safely modify, corrupt, or delete them. They can be regenerated at any time using 'create_ui_showcase_scenarios.bat' from the repository root.

- Normal UI Review: Open '01-populated-world'.
- Vehicle Repair Smoke Test: Open '04-vehicle-repair-smoke-v1'.
`;
writeTxt(targetDir, 'README_FIRST.txt', readmeContent);

const indexContent = `# LoreRelay Showcase Index

| Subsystem / Screen | Recommended Scenario | Notes |
| --- | --- | --- |
| General UI & Merchant | 01-populated-world | Fully populated with valid JSON files. |
| Empty States | 02-empty-states | To verify copy/UX when collections are empty. |
| Layout Stress | 03-layout-stress | Long names, massive lists, layout overflow test. |
| Vehicle Repair Gate | 04-vehicle-repair-smoke-v1 | Specifically tests the upgrade->repair human play flow. |

## Coverage Details
- **Start Hub, Character Manager, Parlor, and Persona**: Covered directly via correctly schema-mapped \`characters/*.json\`, \`persona.json\`, and \`parlor_session.*.json\` fixtures.
- **World View Harness**: The generated \`_harness/worldView.json\` is the actual runtime-captured World View message produced by invoking the compiled \`pushWorldViewToWebview()\` over the 01-populated-world workspace.
- **World, Commerce, Vehicle, Mobile Base**: These surfaces are populated based on the \`worldView.json\` capture, accurately reflecting current location, markets, active vehicles, and docked mobile bases.
- **Logistics**: The \`economyLogistics\` property is included in the world view payload, resolving active flows and shortages based on the mocked commerce forge.

## Omissions
- **Scenario Packs**: Omitted since there is no stable, widely used sample schema in the baseline that can be mocked out reliably.
- **Trade Routes**: Raw trade-route loading is omitted due to the lack of a formal static JSON loader contract (routes are derived via the economy simulation instead).
- **NPC Registry**: Omitted as the runtime uses Character Manager (\`characters/*.json\`). \`npc_registry.json\` is not generated for character data.
`;
writeTxt(targetDir, 'SHOWCASE_INDEX.md', indexContent);

console.log('Showcase scenarios generated in: ' + targetDir);
