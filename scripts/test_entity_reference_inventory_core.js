#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'entityReferenceInventoryCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail(`${corePath} missing — run npm run compile`);
    process.exit(1);
}

const { buildEntityInventory } = require(corePath);

// Test buildEntityInventory with empty input
{
    const res = buildEntityInventory({});
    if (res.presences.length !== 0 || res.observations.length !== 0) {
        fail('Empty inputs should yield empty results');
    } else {
        ok('Empty inputs check passed');
    }
}

// Test buildEntityInventory with full mock inputs
{
    const mockInputs = {
        worldForge: {
            format: '1',
            meta: { worldName: 'Test World' },
            geography: {
                regions: [
                    { id: 'reg1', name: 'Forest', type: 'forest', connectedTo: ['reg2'] },
                    { id: 'reg2', name: 'Plains', type: 'plains' }
                ],
                locations: [
                    { id: 'loc1', name: 'Town', regionId: 'reg1', factionControl: 'fac1', type: 'settlement' }
                ]
            },
            factions: [
                { id: 'fac1', name: 'Empire', type: 'hostile', enemies: ['fac2'] },
                { id: 'fac2', name: 'Rebels', type: 'friendly' }
            ],
            loreHistory: [],
            initialNpcs: [
                { id: 'npc1', name: 'Bob', locationId: 'loc1', factionId: 'fac1' }
            ],
            mapItems: [
                { id: 'map1', name: 'Old Map', kind: 'map', revealsRegionIds: ['reg2'] }
            ]
        },
        npcRegistry: {
            format: '1',
            npcs: {
                'npc1': { name: 'Bob', locationId: 'loc1', factionId: 'fac1', disposition: {}, needs: [], memories: [] },
                'npc2': { name: 'Alice', disposition: {}, needs: [], memories: [] }
            }
        },
        vehicleState: {
            version: 1,
            vehicles: [
                {
                    id: 'veh1',
                    name: 'Truck',
                    kind: 'truck',
                    owner: { type: 'npc', id: 'npc1' },
                    status: 'available',
                    locationId: 'loc1',
                    parkedAt: { locationId: 'loc1', parkingLocationId: 'park1' },
                    carriedByVehicleId: 'veh2',
                    crew: [{ npcId: 'npc1' }],
                    mobileBase: { settlementId: 'set1', homeLocationId: 'loc1', dockedAtLocationId: 'loc1' }
                },
                {
                    id: 'veh2',
                    name: 'Carrier',
                    kind: 'ship',
                    owner: { type: 'faction', id: 'fac1' },
                    status: 'available',
                    hangar: { bayCapacity: 2, maxCarriedSize: 'medium', carriedVehicleIds: ['veh1'] }
                }
            ],
            activeVehicleId: 'veh1'
        },
        settlementState: {
            version: 1,
            settlementId: 'set1',
            name: 'Base Alpha',
            locationId: 'loc1',
            morale: 80,
            safety: 70,
            stocks: [],
            structures: [],
            residents: [{ npcId: 'npc1' }],
            visitors: [{ npcId: 'npc2', untilWorldTurn: 10 }],
            merchants: [{ npcId: 'npc1', untilWorldTurn: 10, wares: [] }],
            incidents: []
        },
        settlementLayout: {
            version: 1,
            settlementId: 'set1',
            layers: ['z0'],
            zones: [],
            markers: []
        },
        gameState: {
            entries: [
                { id: 'ent1', role: 'gm', sender: 'GM', content: 'hello', speakerNpcId: 'npc1' }
            ],
            world: {
                currentLocationId: 'loc1',
                visitedLocationIds: ['loc1'],
                discoveredRegionIds: ['reg1'],
                knownFactionIds: ['fac1'],
                regions: {
                    'reg1': { controllingFaction: 'fac1' }
                },
                lastGeneratedLocationId: 'loc1',
                rumorKnownRegionIds: ['reg2']
            },
            guild: {
                hallLocationId: 'loc1',
                adventurers: [{ npcId: 'npc1', klass: 'warrior' }],
                quests: [{ id: 'q1', requestId: 'req1', questKind: 'combat', difficulty: 1, rewardCoffers: 10, status: 'active', partyNpcIds: ['npc1'] }]
            }
        },
        worldState: {
            format: '1',
            worldTurn: 5,
            factions: {
                'fac1': { power: 100 }
            },
            regions: {
                'reg1': { controllingFaction: 'fac1' }
            },
            questHooks: [
                { id: 'qh1', title: 'Quest', description: 'desc', source: 'npc', relatedId: 'need1', status: 'available', turnGenerated: 1, npcId: 'npc1', factionId: 'fac1' }
            ],
            npcPositions: {
                'npc1': { locationId: 'loc1', arrivesTurn: 5 }
            },
            lastVisitTurnByLocation: {
                'loc1': 3
            },
            marketSnapshotByLocation: {
                'loc1': {}
            },
            npcRelationships: {
                'npc1|npc2': 20
            },
            playerNpcMilestones: {
                'npc1': ['milestone1']
            }
        },
        modProfile: {
            profileVersion: 1,
            name: 'default',
            enabledMods: [{ modId: 'mod1', enabled: true, priority: 1 }]
        },
        modManifests: {
            'mod1': {
                manifestVersion: 1,
                id: 'mod1',
                name: 'Mod One',
                version: '1.0.0',
                categories: ['lorebook'],
                dependencies: [{ modId: 'mod2' }],
                conflicts: [{ modId: 'mod3' }],
                records: [],
                aliasRules: [],
                files: []
            }
        }
    };

    // Deep freeze input to verify no-mutation
    function deepFreeze(obj) {
        if (obj && typeof obj === 'object') {
            Object.freeze(obj);
            Object.values(obj).forEach(deepFreeze);
        }
        return obj;
    }
    deepFreeze(mockInputs);

    let res;
    try {
        res = buildEntityInventory(mockInputs);
        ok('buildEntityInventory successfully ran on frozen inputs without mutating');
    } catch (err) {
        fail('Mutation or runtime error during inventory building: ' + err.message);
        process.exit(1);
    }

    // Verify Presence extraction & roles
    const pReg1 = res.presences.find(p => p.ref.id === 'reg1' && p.ref.kind === 'region');
    if (!pReg1 || pReg1.role !== 'canonical' || pReg1.ledger !== 'world_forge') {
        fail('Region presence extraction failed: ' + JSON.stringify(pReg1));
    }

    const pNpc1Forge = res.presences.find(p => p.ref.id === 'npc1' && p.ref.kind === 'npc' && p.ledger === 'world_forge');
    if (!pNpc1Forge || pNpc1Forge.role !== 'seed') {
        fail('Seed NPC presence extraction failed: ' + JSON.stringify(pNpc1Forge));
    }

    const pNpc1Registry = res.presences.find(p => p.ref.id === 'npc1' && p.ref.kind === 'npc' && p.ledger === 'npc_registry');
    if (!pNpc1Registry || pNpc1Registry.role !== 'canonical') {
        fail('Canonical NPC presence extraction failed: ' + JSON.stringify(pNpc1Registry));
    }

    const pVeh1 = res.presences.find(p => p.ref.id === 'veh1' && p.ref.kind === 'vehicle');
    if (!pVeh1 || pVeh1.role !== 'canonical') {
        fail('Vehicle presence extraction failed');
    }

    const pSet1 = res.presences.find(p => p.ref.id === 'set1' && p.ref.kind === 'settlement' && p.ledger === 'settlement_state');
    if (!pSet1 || pSet1.role !== 'canonical') {
        fail('Settlement canonical presence failed: ' + JSON.stringify(pSet1));
    }

    const pSet1Layout = res.presences.find(p => p.ref.id === 'set1' && p.ref.kind === 'settlement' && p.ledger === 'settlement_layout');
    if (!pSet1Layout || pSet1Layout.role !== 'mirror') {
        fail('Settlement mirror presence failed: ' + JSON.stringify(pSet1Layout));
    }

    const pMod1 = res.presences.find(p => p.ref.id === 'mod1' && p.ref.kind === 'mod' && p.ledger === 'mod_manifests');
    if (!pMod1 || pMod1.role !== 'canonical') {
        fail('Mod canonical presence failed: ' + JSON.stringify(pMod1));
    }

    const pMod1Profile = res.presences.find(p => p.ref.id === 'mod1' && p.ref.kind === 'mod' && p.ledger === 'mod_profile');
    if (!pMod1Profile || pMod1Profile.role !== 'mirror') {
        fail('Mod mirror presence failed: ' + JSON.stringify(pMod1Profile));
    }

    ok('EntityPresence extraction and role verification passed');

    // Verify Observations
    // regions.connectedTo
    const oRegConn = res.observations.find(o => o.sourceLedger === 'world_forge' && o.sourcePath === 'geography.regions[0].connectedTo[0]');
    if (!oRegConn || oRegConn.targetRef.id !== 'reg2' || oRegConn.ownerRef?.id !== 'reg1') {
        fail('Region connection observation failed: ' + JSON.stringify(oRegConn));
    }

    // NPC location/faction
    const oNpcLoc = res.observations.find(o => o.sourceLedger === 'npc_registry' && o.sourcePath === 'npcs.npc1.locationId');
    if (!oNpcLoc || oNpcLoc.targetRef.id !== 'loc1' || oNpcLoc.ownerRef?.id !== 'npc1') {
        fail('NPC location observation failed: ' + JSON.stringify(oNpcLoc));
    }

    // Vehicle crew / mobileBase
    const oVehCrew = res.observations.find(o => o.sourceLedger === 'vehicle_state' && o.sourcePath === 'vehicles[0].crew[0].npcId');
    if (!oVehCrew || oVehCrew.targetRef.id !== 'npc1' || oVehCrew.ownerRef?.id !== 'veh1') {
        fail('Vehicle crew observation failed: ' + JSON.stringify(oVehCrew));
    }

    const oVehMb = res.observations.find(o => o.sourceLedger === 'vehicle_state' && o.sourcePath === 'vehicles[0].mobileBase.settlementId');
    if (!oVehMb || oVehMb.targetRef.id !== 'set1' || oVehMb.ownerRef?.id !== 'veh1') {
        fail('Vehicle mobile base settlement observation failed: ' + JSON.stringify(oVehMb));
    }

    // Game state guild hall
    const oGuildHall = res.observations.find(o => o.sourceLedger === 'game_state' && o.sourcePath === 'guild.hallLocationId');
    if (!oGuildHall || oGuildHall.targetRef.id !== 'loc1') {
        fail('Guild hall location observation failed: ' + JSON.stringify(oGuildHall));
    }

    // World state npc positions
    const oWsPos = res.observations.find(o => o.sourceLedger === 'world_state' && o.sourcePath === 'npcPositions.npc1.locationId');
    if (!oWsPos || oWsPos.targetRef.id !== 'loc1' || oWsPos.ownerRef?.id !== 'npc1') {
        fail('WorldState NPC position observation failed: ' + JSON.stringify(oWsPos));
    }

    // Mod dependency
    const oModDep = res.observations.find(o => o.sourceLedger === 'mod_manifests' && o.sourcePath === 'mods.mod1.dependencies[0].modId');
    if (!oModDep || oModDep.targetRef.id !== 'mod2' || oModDep.ownerRef?.id !== 'mod1') {
        fail('Mod dependency observation failed: ' + JSON.stringify(oModDep));
    }

    ok('EntityReferenceObservation extraction verification passed');

    // Verify Sorting determinism
    let sortedPres = [...res.presences].sort((a,b) => {
        const { comparePresences } = require(corePath);
        return comparePresences(a, b);
    });
    for (let i = 0; i < res.presences.length; i++) {
        if (res.presences[i] !== sortedPres[i]) {
            fail('Presences are not deterministically sorted at index ' + i);
            process.exit(1);
        }
    }

    let sortedObs = [...res.observations].sort((a,b) => {
        const { compareObservations } = require(corePath);
        return compareObservations(a, b);
    });
    for (let i = 0; i < res.observations.length; i++) {
        if (res.observations[i] !== sortedObs[i]) {
            fail('Observations are not deterministically sorted at index ' + i);
            process.exit(1);
        }
    }

    ok('Deterministic sorting verification passed');
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll entityReferenceInventoryCore tests passed.');
