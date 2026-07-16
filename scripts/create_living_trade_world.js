/**
 * SHOWCASE-SCENARIO-002 — The Sapphire Roads (05-living-trade-world)
 * Deterministic rich trade-region showcase data (pure data writer).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function writeJson(dir, file, obj) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), JSON.stringify(obj, null, 2), 'utf8');
}

function writeTxt(dir, file, text) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), text, 'utf8');
}

/**
 * Coverage matrix (supported contracts only):
 * Feature | Source | Renderer | Usage
 * regions/biomes | world_forge.geography.regions.biome | tile overmap / world map | 9 biomes
 * locations/routes | geography.locations.connectedTo | world pins / routes | 12 locs, multi-edges
 * commerce goods | commerce.commodities | markets | 14 goods
 * markets | commerce.markets + world_state.markets | market UI | 9 markets, priceIndex skew
 * logistics | commerce.resourceFlows {nodes,productionSources,demands,tradeRoutes} | economyLogistics | 10+ routes
 * vehicles | vehicle_state.json | vehicle garage | 4 vehicles + mobile base
 * settlement | settlements/<locId>/ + root Mobile Base singleton | fixed multi-city + MB deck | 6 fixed + 1 root
 * characters/persona | characters/*, persona.json, parlor_session | character/parlor panes | 3 NPCs
 */

/** Zone labels must include English keyword tokens recognized by settlementViewCore.inferTileCode. */
function zone(id, layerId, label, x, y) {
    return { id, layerId, label, x, y };
}

function marker(id, layerId, label, x, y) {
    return { id, layerId, label, x, y };
}

function structure(id, name, status, layerId) {
    return { id, name, status, layerId };
}

/**
 * Six fixed World-location settlements (production multi-location contract).
 * Root settlement_state/layout remain the Mobile Base singleton and are not replaced.
 */
function buildFixedCitySettlements() {
    return {
        loc_sapphire_port: {
            state: {
                version: 1,
                settlementId: 'set_sapphire_port',
                name: 'Sapphire Port',
                locationId: 'loc_sapphire_port',
                morale: 68,
                safety: 52,
                stocks: [
                    { id: 'grain', amount: 40 },
                    { id: 'salt', amount: 22 },
                    { id: 'rope', amount: 16 },
                    { id: 'tar', amount: 10 },
                    { id: 'spices', amount: 8 },
                ],
                structures: [
                    structure('sp_customs', 'Customs Gate House', 'intact', 'z0'),
                    structure('sp_warehouse_a', 'Harbor Warehouse Stockpile', 'intact', 'z0'),
                    structure('sp_warehouse_b', 'Bonded Store Warehouse', 'intact', 'z0'),
                    structure('sp_shipyard', 'Shipyard Workshop', 'intact', 'z0'),
                    structure('sp_market_row', 'Quayside Market Hall', 'intact', 'z0'),
                    structure('sp_trade_hall', 'Guild Trade Plaza', 'intact', 'z0'),
                    structure('sp_cooper', 'Cooper Workshop', 'damaged', 'z0'),
                    structure('sp_clinic', 'Dockside Clinic', 'intact', 'z0'),
                    structure('sp_quarters', 'Stevedore Quarters', 'intact', 'z0'),
                    structure('sp_barracks', 'Harbor Guard Barracks', 'intact', 'z0'),
                ],
                residents: [
                    { npcId: 'npc_mira', role: 'captain' },
                    { npcId: 'npc_joren', role: 'quartermaster' },
                    { npcId: 'res_porter_1', role: 'porter' },
                    { npcId: 'res_clerk_1', role: 'clerk' },
                ],
                visitors: [{ npcId: 'vis_sailor_1', purpose: 'shore leave' }],
                merchants: [
                    { npcId: 'mer_fish', wares: ['fish', 'salt'] },
                    { npcId: 'mer_spice', wares: ['spices', 'wine'] },
                    { npcId: 'mer_parts', wares: ['repair_parts', 'tools'] },
                ],
                incidents: [
                    {
                        id: 'inc_port_crowd',
                        worldTurn: 1,
                        kind: 'crowd',
                        severity: 'info',
                        resolved: false,
                        text: 'Quay market crowded at dawn.',
                    },
                ],
            },
            layout: {
                version: 1,
                settlementId: 'set_sapphire_port',
                layers: ['z0'],
                zones: [
                    // Harbour water edge (south) — placed first so commerce can overwrite interiors
                    zone('sp_d1', 'z0', 'Harbor Water Docks', 0, 7),
                    zone('sp_d2', 'z0', 'Quay Water Docks', 1, 7),
                    zone('sp_d3', 'z0', 'Deep Water Berth', 2, 7),
                    zone('sp_d4', 'z0', 'River Water Slip', 3, 7),
                    zone('sp_d5', 'z0', 'Ferry Water Pier', 4, 7),
                    // Moderate defensive edge (north), not full ring
                    zone('sp_wall_n1', 'z0', 'Seawall North Wall', 1, 0),
                    zone('sp_wall_n2', 'z0', 'Curtain Wall', 3, 0),
                    zone('sp_wall_n3', 'z0', 'Bastion Wall', 5, 0),
                    zone('sp_gate', 'z0', 'Customs Gate Entrance', 4, 0),
                    zone('sp_q1', 'z0', 'Stevedore Quarters', 0, 3),
                    zone('sp_q2', 'z0', 'Clerk Quarters Housing', 0, 4),
                    zone('sp_clinic', 'z0', 'Dock Clinic', 7, 5),
                    zone('sp_barracks', 'z0', 'Harbor Guard Barracks', 1, 1),
                    zone('sp_shrine', 'z0', 'Tide Shrine Altar', 7, 6),
                    // Dense commercial core last.
                    // market/workshop expand radius=1 — centers must stay >=3 apart so floors do not erase peers.
                    zone('sp_s1', 'z0', 'Bonded Warehouse Stockpile', 0, 2),
                    zone('sp_s2', 'z0', 'Grain Store Warehouse', 7, 3),
                    zone('sp_s3', 'z0', 'Tar Depot Stockpile', 7, 6),
                    zone('sp_w1', 'z0', 'Shipyard Workshop', 1, 5),
                    zone('sp_w2', 'z0', 'Cooper Workshop', 6, 5),
                    zone('sp_w3', 'z0', 'Sail Craft Workshop', 3, 6),
                    zone('sp_m1', 'z0', 'Main Market Row', 2, 2),
                    zone('sp_m2', 'z0', 'Fish Market Hall', 5, 2),
                    zone('sp_m3', 'z0', 'Trade Plaza Market', 2, 5),
                    zone('sp_m4', 'z0', 'Spice Market Bazaar', 5, 5),
                    zone('sp_m5', 'z0', 'Quay Trade Market', 3, 3),
                ],
                markers: [
                    marker('sp_mk_crowd', 'z0', 'Busy quay', 3, 2),
                    marker('sp_mk_crane', 'z0', 'Loading crane', 2, 6),
                    marker('sp_mk_customs', 'z0', 'Customs desk', 4, 1),
                ],
            },
        },
        loc_reedmarket: {
            state: {
                version: 1,
                settlementId: 'set_reedmarket',
                name: 'Reedmarket',
                locationId: 'loc_reedmarket',
                morale: 60,
                safety: 44,
                stocks: [
                    { id: 'fish', amount: 30 },
                    { id: 'pottery', amount: 14 },
                    { id: 'wine', amount: 9 },
                    { id: 'reeds', amount: 18 },
                ],
                structures: [
                    structure('rm_fish_market', 'Open Fish Market', 'intact', 'z0'),
                    structure('rm_reed_dock', 'Reed Water Docks', 'intact', 'z0'),
                    structure('rm_ferry', 'Ferry Quarters', 'intact', 'z0'),
                    structure('rm_pottery', 'Potter Workshop', 'intact', 'z0'),
                    structure('rm_store', 'Canal Store Stockpile', 'damaged', 'z0'),
                    structure('rm_shrine', 'River Shrine', 'intact', 'z0'),
                ],
                residents: [
                    { npcId: 'res_ferry_1', role: 'ferryman' },
                    { npcId: 'res_reed_1', role: 'reedcutter' },
                ],
                visitors: [{ npcId: 'vis_barge_1', purpose: 'unload fish' }],
                merchants: [
                    { npcId: 'mer_fishmonger', wares: ['fish', 'pottery'] },
                    { npcId: 'mer_wine', wares: ['wine'] },
                ],
                incidents: [
                    {
                        id: 'inc_flood_watch',
                        worldTurn: 1,
                        kind: 'flood_watch',
                        severity: 'warning',
                        resolved: false,
                        text: 'Canal levels high after rains.',
                    },
                ],
            },
            layout: {
                version: 1,
                settlementId: 'set_reedmarket',
                layers: ['z0'],
                zones: [
                    // Branching water channels separating market clusters
                    zone('rm_water_a1', 'z0', 'North Canal Water', 1, 1),
                    zone('rm_water_a2', 'z0', 'North Canal River', 2, 1),
                    zone('rm_water_b1', 'z0', 'Mid Canal Water', 4, 3),
                    zone('rm_water_b2', 'z0', 'Mid Canal River', 5, 3),
                    zone('rm_water_c1', 'z0', 'South Water Docks', 1, 5),
                    zone('rm_water_c2', 'z0', 'South River Docks', 2, 5),
                    zone('rm_water_c3', 'z0', 'Ferry Water Slip', 3, 6),
                    zone('rm_water_d1', 'z0', 'East Canal Water', 7, 2),
                    zone('rm_water_d2', 'z0', 'East River Arm', 7, 4),
                    // Separated market islands
                    zone('rm_m1', 'z0', 'Fish Market Cluster', 1, 3),
                    zone('rm_m2', 'z0', 'Reed Market Hall', 3, 2),
                    zone('rm_m3', 'z0', 'East Market Plaza', 6, 1),
                    zone('rm_w1', 'z0', 'Potter Workshop', 3, 4),
                    zone('rm_s1', 'z0', 'Canal Store Stockpile', 5, 5),
                    zone('rm_q1', 'z0', 'Stilt Quarters', 0, 3),
                    zone('rm_q2', 'z0', 'Ferryman Quarters Housing', 6, 5),
                    zone('rm_shrine', 'z0', 'River Shrine Altar', 4, 6),
                    // No continuous wall / gate perimeter
                    zone('rm_floor_path', 'z0', 'Boardwalk Path', 2, 3),
                    zone('rm_floor_yard', 'z0', 'Open Yard', 5, 2),
                ],
                markers: [
                    marker('rm_mk_ferry', 'z0', 'Ferry landing', 3, 6),
                    marker('rm_mk_nets', 'z0', 'Drying nets', 1, 3),
                ],
            },
        },
        loc_mistgrove: {
            state: {
                version: 1,
                settlementId: 'set_mistgrove',
                name: 'Mistgrove',
                locationId: 'loc_mistgrove',
                morale: 58,
                safety: 48,
                stocks: [
                    { id: 'timber', amount: 20 },
                    { id: 'herbs', amount: 16 },
                    { id: 'wool', amount: 8 },
                ],
                structures: [
                    structure('mg_shrine', 'Forest Shrine Altar', 'intact', 'z0'),
                    structure('mg_herbalist', 'Herbalist Clinic', 'intact', 'z0'),
                    structure('mg_timber', 'Timber Workshop', 'intact', 'z0'),
                    structure('mg_cabin_a', 'North Cabin Quarters', 'intact', 'z0'),
                    structure('mg_cabin_b', 'South Cabin Quarters', 'intact', 'z0'),
                    structure('mg_store', 'Herb Store Stockpile', 'intact', 'z0'),
                ],
                residents: [
                    { npcId: 'res_herbalist', role: 'herbalist' },
                    { npcId: 'res_woodcutter', role: 'woodcutter' },
                ],
                visitors: [],
                merchants: [{ npcId: 'mer_herb', wares: ['herbs', 'timber'] }],
                incidents: [
                    {
                        id: 'inc_fog',
                        worldTurn: 1,
                        kind: 'fog',
                        severity: 'info',
                        resolved: false,
                        text: 'Morning fog softens trail markers.',
                    },
                ],
            },
            layout: {
                version: 1,
                settlementId: 'set_mistgrove',
                layers: ['z0'],
                zones: [
                    // Widely spaced clusters — no Wall/Gate labels
                    zone('mg_q1', 'z0', 'North Cabin Quarters', 0, 0),
                    zone('mg_q2', 'z0', 'East Cabin Quarters Housing', 7, 1),
                    zone('mg_q3', 'z0', 'South Cabin Quarters', 1, 7),
                    zone('mg_q4', 'z0', 'West Cabin Home Quarters', 0, 4),
                    zone('mg_shrine', 'z0', 'Forest Shrine Altar', 4, 4),
                    zone('mg_clinic', 'z0', 'Herbalist Clinic', 6, 6),
                    zone('mg_workshop', 'z0', 'Timber Workshop', 2, 2),
                    zone('mg_stock', 'z0', 'Herb Store Stockpile', 5, 1),
                    zone('mg_clearing', 'z0', 'Moss Clearing', 3, 5),
                    zone('mg_yard', 'z0', 'Woodpile Yard', 7, 5),
                ],
                markers: [
                    marker('mg_mk_trail', 'z0', 'Forest trail', 3, 3),
                    marker('mg_mk_smoke', 'z0', 'Cabin smoke', 0, 0),
                ],
            },
        },
        loc_ironspire: {
            state: {
                version: 1,
                settlementId: 'set_ironspire',
                name: 'Ironspire',
                locationId: 'loc_ironspire',
                morale: 50,
                safety: 46,
                stocks: [
                    { id: 'iron_ore', amount: 28 },
                    { id: 'tools', amount: 12 },
                    { id: 'fuel', amount: 15 },
                    { id: 'repair_parts', amount: 7 },
                ],
                structures: [
                    structure('is_forge', 'Main Forge Workshop', 'intact', 'z0'),
                    structure('is_smelter', 'Smelter Workshop', 'damaged', 'z0'),
                    structure('is_ore', 'Ore Stockpile Store', 'intact', 'z0'),
                    structure('is_barracks', 'Miner Guard Barracks', 'intact', 'z0'),
                    structure('is_lift', 'Lift Platform Workshop', 'damaged', 'z1'),
                    structure('is_quarters', 'Miner Quarters', 'intact', 'z1'),
                    structure('is_clinic', 'Tunnel Clinic', 'intact', 'z0'),
                ],
                residents: [
                    { npcId: 'res_miner_1', role: 'miner' },
                    { npcId: 'res_smith_1', role: 'smith' },
                    { npcId: 'res_guard_1', role: 'guard' },
                ],
                visitors: [],
                merchants: [{ npcId: 'mer_ore', wares: ['iron_ore', 'tools'] }],
                incidents: [
                    {
                        id: 'inc_lift',
                        worldTurn: 1,
                        kind: 'equipment',
                        severity: 'warning',
                        resolved: false,
                        text: 'Upper lift needs repair parts.',
                    },
                ],
            },
            layout: {
                version: 1,
                settlementId: 'set_ironspire',
                layers: ['z0', 'z1'],
                zones: [
                    // Compact z0 industrial terrace
                    zone('is_forge', 'z0', 'Main Forge Workshop', 2, 2),
                    zone('is_smelter', 'z0', 'Smelter Workshop', 3, 2),
                    zone('is_ore', 'z0', 'Ore Stockpile Store', 4, 2),
                    zone('is_parts', 'z0', 'Parts Depot Stockpile', 4, 3),
                    zone('is_barracks', 'z0', 'Miner Guard Barracks', 1, 2),
                    zone('is_clinic', 'z0', 'Tunnel Clinic', 1, 3),
                    zone('is_gate', 'z0', 'Switchback Gate Entrance', 2, 4),
                    zone('is_wall_a', 'z0', 'Terrace Wall', 1, 1),
                    zone('is_wall_b', 'z0', 'Cut Wall', 4, 1),
                    zone('is_yard', 'z0', 'Ore Yard', 3, 3),
                    // z1 stepped upper tier (asymmetric)
                    zone('is_lift', 'z1', 'Lift Platform Workshop', 3, 1),
                    zone('is_upper_q', 'z1', 'Miner Quarters Housing', 2, 1),
                    zone('is_upper_store', 'z1', 'Upper Store Stockpile', 4, 1),
                    zone('is_watch', 'z1', 'Lookout Barracks', 3, 0),
                    zone('is_upper_wall', 'z1', 'Upper Wall', 2, 0),
                    zone('is_upper_forge', 'z1', 'Finishing Forge Workshop', 4, 2),
                ],
                markers: [
                    marker('is_mk_smoke', 'z0', 'Forge smoke', 2, 2),
                    marker('is_mk_lift', 'z1', 'Lift cage', 3, 1),
                    marker('is_mk_ore', 'z0', 'Ore carts', 4, 2),
                ],
            },
        },
        loc_glass_oasis: {
            state: {
                version: 1,
                settlementId: 'set_glass_oasis',
                name: 'Glass Oasis',
                locationId: 'loc_glass_oasis',
                morale: 64,
                safety: 50,
                stocks: [
                    { id: 'spices', amount: 18 },
                    { id: 'salt', amount: 14 },
                    { id: 'textiles', amount: 11 },
                    { id: 'water_skins', amount: 20 },
                ],
                structures: [
                    structure('go_well', 'Central Well Water', 'intact', 'z0'),
                    structure('go_market', 'Caravan Market Court', 'intact', 'z0'),
                    structure('go_stable', 'Caravan Quarters', 'intact', 'z0'),
                    structure('go_store', 'Spice Store Stockpile', 'intact', 'z0'),
                    structure('go_workshop', 'Saddle Workshop', 'intact', 'z0'),
                    structure('go_shrine', 'Oasis Shrine Altar', 'intact', 'z0'),
                    structure('go_inn', 'Traveller Quarters Housing', 'intact', 'z0'),
                ],
                residents: [
                    { npcId: 'res_innkeep', role: 'innkeeper' },
                    { npcId: 'res_wellkeep', role: 'wellkeeper' },
                ],
                visitors: [
                    { npcId: 'vis_caravan_1', purpose: 'rest' },
                    { npcId: 'vis_caravan_2', purpose: 'trade' },
                ],
                merchants: [
                    { npcId: 'npc_sela', wares: ['spices', 'textiles'] },
                    { npcId: 'mer_salt', wares: ['salt', 'fuel'] },
                ],
                incidents: [],
            },
            layout: {
                version: 1,
                settlementId: 'set_glass_oasis',
                layers: ['z0'],
                zones: [
                    // Ring of facilities (outer first)
                    zone('go_q_n', 'z0', 'North Traveller Quarters', 4, 0),
                    zone('go_q_e', 'z0', 'East Caravan Quarters Housing', 8, 4),
                    zone('go_q_s', 'z0', 'South Inn Quarters', 4, 8),
                    zone('go_q_w', 'z0', 'West Stable Quarters', 0, 4),
                    zone('go_store_ne', 'z0', 'Spice Store Stockpile', 7, 1),
                    zone('go_store_sw', 'z0', 'Salt Depot Stockpile', 1, 7),
                    zone('go_workshop', 'z0', 'Saddle Workshop', 7, 7),
                    zone('go_shrine', 'z0', 'Oasis Shrine Altar', 1, 1),
                    zone('go_clinic', 'z0', 'Wayfarer Clinic', 8, 6),
                    zone('go_wall_n', 'z0', 'North Court Wall', 3, 0),
                    zone('go_gate', 'z0', 'Caravan Gate Entrance', 4, 8),
                    zone('go_wall_s', 'z0', 'South Court Wall', 5, 8),
                    // Courtyard markets spaced >=3 apart, then central well last
                    zone('go_market', 'z0', 'Caravan Market Court', 4, 2),
                    zone('go_market_e', 'z0', 'East Market Plaza', 6, 4),
                    zone('go_market_w', 'z0', 'West Market Trade', 2, 4),
                    zone('go_market_s', 'z0', 'South Bazaar Market', 4, 6),
                    zone('go_well', 'z0', 'Oasis Well Water', 4, 4),
                ],
                markers: [
                    marker('go_mk_well', 'z0', 'Well circle', 4, 4),
                    marker('go_mk_tents', 'z0', 'Caravan tents', 7, 4),
                    marker('go_mk_spices', 'z0', 'Spice bales', 6, 2),
                ],
            },
        },
        loc_watchkeep: {
            state: {
                version: 1,
                settlementId: 'set_watchkeep',
                name: 'Watchkeep',
                locationId: 'loc_watchkeep',
                morale: 55,
                safety: 72,
                stocks: [
                    { id: 'tools', amount: 10 },
                    { id: 'repair_parts', amount: 8 },
                    { id: 'grain', amount: 16 },
                    { id: 'fuel', amount: 6 },
                    { id: 'arrows', amount: 24 },
                ],
                structures: [
                    structure('wk_gatehouse', 'Main Gate Entrance', 'intact', 'z0'),
                    structure('wk_barracks', 'Garrison Barracks', 'intact', 'z0'),
                    structure('wk_armoury', 'Armoury Stockpile Store', 'intact', 'z0'),
                    structure('wk_clinic', 'Garrison Clinic', 'intact', 'z0'),
                    structure('wk_shrine', 'Oath Shrine Altar', 'intact', 'z0'),
                    structure('wk_command', 'Command Quarters', 'intact', 'z0'),
                    structure('wk_workshop', 'Armour Workshop', 'intact', 'z0'),
                    structure('wk_tower', 'Watch Barracks', 'intact', 'z0'),
                ],
                residents: [
                    { npcId: 'res_captain', role: 'captain' },
                    { npcId: 'res_scribe', role: 'scribe' },
                    { npcId: 'res_guard_a', role: 'guard' },
                    { npcId: 'res_guard_b', role: 'guard' },
                ],
                visitors: [],
                merchants: [{ npcId: 'mer_quarter', wares: ['tools', 'grain'] }],
                incidents: [
                    {
                        id: 'inc_drill',
                        worldTurn: 1,
                        kind: 'drill',
                        severity: 'info',
                        resolved: false,
                        text: 'Morning wall drill underway.',
                    },
                ],
            },
            layout: {
                version: 1,
                settlementId: 'set_watchkeep',
                layers: ['z0'],
                zones: [
                    // Highest wall emphasis — approximate perimeter with many Wall zones
                    zone('wk_wall_n1', 'z0', 'North Outer Wall', 1, 0),
                    zone('wk_wall_n2', 'z0', 'North Curtain Wall', 2, 0),
                    zone('wk_wall_n3', 'z0', 'North Bastion Wall', 3, 0),
                    zone('wk_wall_n4', 'z0', 'North Keep Wall', 4, 0),
                    zone('wk_wall_n5', 'z0', 'North East Wall', 5, 0),
                    zone('wk_wall_e1', 'z0', 'East Outer Wall', 6, 1),
                    zone('wk_wall_e2', 'z0', 'East Curtain Wall', 6, 2),
                    zone('wk_wall_e3', 'z0', 'East Bastion Wall', 6, 3),
                    zone('wk_wall_e4', 'z0', 'East Keep Wall', 6, 4),
                    zone('wk_wall_s1', 'z0', 'South Outer Wall', 5, 5),
                    zone('wk_wall_s2', 'z0', 'South Curtain Wall', 4, 5),
                    zone('wk_wall_s3', 'z0', 'South Bastion Wall', 3, 5),
                    zone('wk_wall_s4', 'z0', 'South Keep Wall', 2, 5),
                    zone('wk_wall_w1', 'z0', 'West Outer Wall', 0, 4),
                    zone('wk_wall_w2', 'z0', 'West Curtain Wall', 0, 3),
                    zone('wk_wall_w3', 'z0', 'West Bastion Wall', 0, 2),
                    zone('wk_wall_w4', 'z0', 'West Keep Wall', 0, 1),
                    zone('wk_gate_n', 'z0', 'Main Gate Entrance', 3, 1),
                    zone('wk_gate_s', 'z0', 'Postern Gate Entrance', 3, 4),
                    // Compact defensive core
                    zone('wk_barracks', 'z0', 'Garrison Barracks', 2, 2),
                    zone('wk_barracks_2', 'z0', 'Watch Barracks', 4, 2),
                    zone('wk_armoury', 'z0', 'Armoury Stockpile Store', 3, 2),
                    zone('wk_clinic', 'z0', 'Garrison Clinic', 2, 3),
                    zone('wk_shrine', 'z0', 'Oath Shrine Altar', 4, 3),
                    zone('wk_command', 'z0', 'Command Quarters', 3, 3),
                    zone('wk_workshop', 'z0', 'Armour Workshop', 5, 2),
                    zone('wk_yard', 'z0', 'Drill Yard', 5, 3),
                ],
                markers: [
                    marker('wk_mk_banner', 'z0', 'Keep banner', 3, 3),
                    marker('wk_mk_drill', 'z0', 'Drill line', 5, 3),
                    marker('wk_mk_gate', 'z0', 'Gate watch', 3, 1),
                ],
            },
        },
    };
}

function writeFixedCitySettlements(dir) {
    const cities = buildFixedCitySettlements();
    for (const [locationId, docs] of Object.entries(cities)) {
        const cityDir = path.join(dir, 'settlements', locationId);
        writeJson(cityDir, 'settlement_state.json', docs.state);
        writeJson(cityDir, 'settlement_layout.json', docs.layout);
    }
    return cities;
}

function createLivingTradeWorld(targetDir) {
    const dir = path.join(targetDir, '05-living-trade-world');

    writeJson(dir, 'game_rules.json', {
        enableRpgMechanics: true,
        defaultMaxHp: 20,
        defaultMaxMp: 10,
        diceDifficulty: 'Normal',
        enableNpcRegistry: true,
        enableWorldForge: true,
        enableEmergentSimulation: true,
        enableCommerce: true,
        enableCommerceUi: true,
        playerRole: 'merchant',
        enableNpcAgency: true,
        enableNpcRelationships: true,
        enableFactionReputation: true,
        enableTravelEncounters: true,
        travelEncounterDensity: 'medium',
        simIntervalTurns: 1,
        backgroundSimulation: false,
        autoLorebookGrowth: false,
        enableVehicleSystem: true,
        enableSettlementMode: true,
        enableMobileBaseSystem: true,
        enableSettlementDiorama: true,
    });

    writeJson(dir, 'game_state.json', {
        entries: [
            {
                id: 'turn-1',
                role: 'gm',
                sender: 'Game Master',
                content: 'Dawn breaks over Sapphire Port. River barges and caravans crowd the quays of The Sapphire Roads.',
                editedAt: '2026-07-01T00:00:00.000Z',
            },
        ],
        status: {
            location: 'Sapphire Port',
            time: 'Morning Market',
            hp: { current: 18, max: 20 },
            mp: { current: 9, max: 10 },
            condition: ['healthy', 'road-dusty'],
            inventory: ['ledger', 'road_map', 'sample_spices'],
            skills: ['negotiation', 'river_navigation'],
            funds: '420 crowns',
        },
        world: {
            currentLocationId: 'loc_sapphire_port',
            // This is a visual/play showcase: expose the complete location catalog while
            // keeping travel/current-location authority at Sapphire Port.
            discoveredRegionIds: [
                'reg_coast', 'reg_delta', 'reg_farm', 'reg_forest', 'reg_highland',
                'reg_steppe', 'reg_snow', 'reg_volcanic', 'reg_isles',
            ],
            visitedLocationIds: ['loc_sapphire_port'],
        },
        commerce: {
            credits: 420,
            food: 18,
            transportId: 'wagon_amber',
            playerRole: 'merchant',
            cargo: [
                { commodityId: 'grain', qty: 4 },
                { commodityId: 'salt', qty: 2 },
            ],
        },
        theme: 'fantasy',
        schemaVersion: 2,
    });

    // Regions with distinct biomes (RegionBiome enum)
    const regions = [
        { id: 'reg_coast', name: 'Sapphire Coast', description: 'Busy harbors and sea wind.', type: 'coast', biome: 'coast', dangerLevel: 2, connectedTo: ['reg_delta', 'reg_isles'] },
        { id: 'reg_delta', name: 'Reed Delta', description: 'Canals and stilt markets.', type: 'swamp', biome: 'swamp', dangerLevel: 2, connectedTo: ['reg_coast', 'reg_farm', 'reg_forest'] },
        { id: 'reg_farm', name: 'Goldgrain Vale', description: 'Open farmland and grain roads.', type: 'plains', biome: 'plains', dangerLevel: 1, connectedTo: ['reg_delta', 'reg_forest', 'reg_highland'] },
        { id: 'reg_forest', name: 'Verdant Reach', description: 'Timber stands and herb trails.', type: 'forest', biome: 'forest', dangerLevel: 2, connectedTo: ['reg_delta', 'reg_farm', 'reg_highland'] },
        { id: 'reg_highland', name: 'Ironspine Heights', description: 'Mines and switchback roads.', type: 'mountain', biome: 'mountain', dangerLevel: 3, connectedTo: ['reg_farm', 'reg_forest', 'reg_steppe', 'reg_snow'] },
        { id: 'reg_steppe', name: 'Glasssteppe', description: 'Arid caravan route and oasis.', type: 'desert', biome: 'desert', dangerLevel: 3, connectedTo: ['reg_highland', 'reg_volcanic'] },
        { id: 'reg_snow', name: 'Whitepass', description: 'Snowbound pass trade.', type: 'other', biome: 'snow', dangerLevel: 4, connectedTo: ['reg_highland'] },
        { id: 'reg_volcanic', name: 'Ashrim Marches', description: 'Obsidian and rare minerals.', type: 'other', biome: 'volcanic', dangerLevel: 4, connectedTo: ['reg_steppe'] },
        { id: 'reg_isles', name: 'Pearl Isles', description: 'Island fishing villages.', type: 'sea', biome: 'sea', dangerLevel: 2, connectedTo: ['reg_coast'] },
    ];

    // Locations: 12, distributed types
    const locations = [
        { id: 'loc_sapphire_port', name: 'Sapphire Port', regionId: 'reg_coast', description: 'Large coastal port: docks, warehouses, guild halls.', type: 'port', factionControl: 'fac_harbor', connectedTo: ['loc_reedmarket', 'loc_pearl_haven', 'loc_watchkeep'] },
        { id: 'loc_reedmarket', name: 'Reedmarket', regionId: 'reg_delta', description: 'Open riverside market on canals and bridges.', type: 'market', factionControl: 'fac_river', connectedTo: ['loc_sapphire_port', 'loc_goldgrain', 'loc_mistgrove'] },
        { id: 'loc_goldgrain', name: 'Goldgrain', regionId: 'reg_farm', description: 'Farming town of granaries and open roads.', type: 'town', factionControl: 'fac_farmers', connectedTo: ['loc_reedmarket', 'loc_mistgrove', 'loc_ironspire'] },
        { id: 'loc_mistgrove', name: 'Mistgrove', regionId: 'reg_forest', description: 'Scattered forest village without walls.', type: 'village', factionControl: 'fac_woodwise', connectedTo: ['loc_reedmarket', 'loc_goldgrain', 'loc_ironspire', 'loc_herb_glade'] },
        { id: 'loc_ironspire', name: 'Ironspire', regionId: 'reg_highland', description: 'Tiered mining town on switchbacks.', type: 'town', factionControl: 'fac_miners', connectedTo: ['loc_goldgrain', 'loc_mistgrove', 'loc_whitepass_camp', 'loc_glass_oasis'] },
        { id: 'loc_glass_oasis', name: 'Glass Oasis', regionId: 'reg_steppe', description: 'Caravanserai around a central courtyard market.', type: 'market', factionControl: 'fac_caravan', connectedTo: ['loc_ironspire', 'loc_ash_forge'] },
        { id: 'loc_ash_forge', name: 'Ashforge', regionId: 'reg_volcanic', description: 'Smelter camp by volcanic vents.', type: 'other', factionControl: 'fac_miners', connectedTo: ['loc_glass_oasis'] },
        { id: 'loc_whitepass_camp', name: 'Whitepass Camp', regionId: 'reg_snow', description: 'High pass depot and repair shelters.', type: 'other', factionControl: 'fac_caravan', connectedTo: ['loc_ironspire'] },
        { id: 'loc_pearl_haven', name: 'Pearl Haven', regionId: 'reg_isles', description: 'Fishing village with stilt docks.', type: 'port', factionControl: 'fac_harbor', connectedTo: ['loc_sapphire_port'] },
        { id: 'loc_watchkeep', name: 'Watchkeep', regionId: 'reg_coast', description: 'Fortified border citadel with full walls.', type: 'fortress', factionControl: 'fac_harbor', connectedTo: ['loc_sapphire_port', 'loc_goldgrain'] },
        { id: 'loc_herb_glade', name: 'Herb Glade', regionId: 'reg_forest', description: 'Wilderness herb stands and woodcutters.', type: 'wilderness', factionControl: 'fac_woodwise', connectedTo: ['loc_mistgrove'] },
        { id: 'loc_salt_flats', name: 'Salt Flats', regionId: 'reg_steppe', description: 'Open salt pans and pack trails.', type: 'wilderness', factionControl: 'fac_caravan', connectedTo: ['loc_glass_oasis'] },
    ];

    const commodities = [
        { id: 'grain', name: 'Grain', basePrice: 8, weight: 1, role: 'staple' },
        { id: 'fish', name: 'Fish', basePrice: 10, weight: 1, role: 'staple' },
        { id: 'salt', name: 'Salt', basePrice: 6, weight: 2, role: 'staple' },
        { id: 'timber', name: 'Timber', basePrice: 12, weight: 3, role: 'material' },
        { id: 'herbs', name: 'Medicinal Herbs', basePrice: 18, weight: 1, role: 'material' },
        { id: 'wool', name: 'Wool', basePrice: 14, weight: 1, role: 'material' },
        { id: 'iron_ore', name: 'Iron Ore', basePrice: 22, weight: 3, role: 'material' },
        { id: 'tools', name: 'Tools', basePrice: 40, weight: 2, role: 'finished' },
        { id: 'pottery', name: 'Pottery', basePrice: 16, weight: 2, role: 'finished' },
        { id: 'wine', name: 'River Wine', basePrice: 28, weight: 2, role: 'luxury' },
        { id: 'spices', name: 'Spices', basePrice: 55, weight: 1, role: 'luxury' },
        { id: 'repair_parts', name: 'Repair Parts', basePrice: 35, weight: 2, role: 'finished' },
        { id: 'fuel', name: 'Lamp Oil', basePrice: 15, weight: 2, role: 'material' },
        { id: 'textiles', name: 'Luxury Textiles', basePrice: 60, weight: 1, role: 'luxury' },
    ];

    const markets = [
        { locationId: 'loc_sapphire_port', commodityIds: ['fish', 'salt', 'wine', 'spices', 'tools', 'repair_parts', 'fuel', 'grain'], targetStock: 40 },
        { locationId: 'loc_reedmarket', commodityIds: ['fish', 'pottery', 'wine', 'grain', 'salt'], targetStock: 35 },
        { locationId: 'loc_goldgrain', commodityIds: ['grain', 'wool', 'pottery', 'tools'], targetStock: 50 },
        { locationId: 'loc_mistgrove', commodityIds: ['timber', 'herbs', 'wool'], targetStock: 30 },
        { locationId: 'loc_ironspire', commodityIds: ['iron_ore', 'tools', 'repair_parts', 'fuel'], targetStock: 35 },
        { locationId: 'loc_glass_oasis', commodityIds: ['salt', 'spices', 'textiles', 'fuel', 'grain'], targetStock: 28 },
        { locationId: 'loc_pearl_haven', commodityIds: ['fish', 'salt', 'pottery'], targetStock: 25 },
        { locationId: 'loc_watchkeep', commodityIds: ['tools', 'repair_parts', 'grain', 'fuel'], targetStock: 20 },
        { locationId: 'loc_ash_forge', commodityIds: ['iron_ore', 'tools', 'fuel'], targetStock: 22 },
    ];

    // Correct EconomyFlowDefinition schema (NOT the legacy location-based routes)
    const resourceFlows = {
        nodes: [
            { id: 'n_port', kind: 'market', label: 'Sapphire Port', locationId: 'loc_sapphire_port', marketLocationId: 'loc_sapphire_port', regionId: 'reg_coast' },
            { id: 'n_reed', kind: 'market', label: 'Reedmarket', locationId: 'loc_reedmarket', marketLocationId: 'loc_reedmarket', regionId: 'reg_delta' },
            { id: 'n_grain', kind: 'settlement', label: 'Goldgrain', locationId: 'loc_goldgrain', marketLocationId: 'loc_goldgrain', regionId: 'reg_farm' },
            { id: 'n_forest', kind: 'settlement', label: 'Mistgrove', locationId: 'loc_mistgrove', marketLocationId: 'loc_mistgrove', regionId: 'reg_forest' },
            { id: 'n_mine', kind: 'settlement', label: 'Ironspire', locationId: 'loc_ironspire', marketLocationId: 'loc_ironspire', regionId: 'reg_highland' },
            { id: 'n_oasis', kind: 'market', label: 'Glass Oasis', locationId: 'loc_glass_oasis', marketLocationId: 'loc_glass_oasis', regionId: 'reg_steppe' },
            { id: 'n_pearl', kind: 'settlement', label: 'Pearl Haven', locationId: 'loc_pearl_haven', marketLocationId: 'loc_pearl_haven', regionId: 'reg_isles' },
            { id: 'n_keep', kind: 'facility', label: 'Watchkeep', locationId: 'loc_watchkeep', marketLocationId: 'loc_watchkeep', regionId: 'reg_coast' },
            { id: 'n_herb', kind: 'facility', label: 'Herb Glade', locationId: 'loc_herb_glade', regionId: 'reg_forest' },
            { id: 'n_salt', kind: 'facility', label: 'Salt Flats', locationId: 'loc_salt_flats', regionId: 'reg_steppe' },
            { id: 'n_ash', kind: 'facility', label: 'Ashforge', locationId: 'loc_ash_forge', marketLocationId: 'loc_ash_forge', regionId: 'reg_volcanic' },
        ],
        productionSources: [
            { id: 'ps_grain', nodeId: 'n_grain', commodityId: 'grain', baseOutputPerTick: 14, productivePotential: 1.2 },
            { id: 'ps_fish_port', nodeId: 'n_port', commodityId: 'fish', baseOutputPerTick: 8 },
            { id: 'ps_fish_pearl', nodeId: 'n_pearl', commodityId: 'fish', baseOutputPerTick: 10 },
            { id: 'ps_timber', nodeId: 'n_forest', commodityId: 'timber', baseOutputPerTick: 9 },
            { id: 'ps_herbs', nodeId: 'n_herb', commodityId: 'herbs', baseOutputPerTick: 6 },
            { id: 'ps_ore', nodeId: 'n_mine', commodityId: 'iron_ore', baseOutputPerTick: 8 },
            { id: 'ps_salt', nodeId: 'n_salt', commodityId: 'salt', baseOutputPerTick: 10 },
            { id: 'ps_wool', nodeId: 'n_grain', commodityId: 'wool', baseOutputPerTick: 4 },
            { id: 'ps_tools', nodeId: 'n_mine', commodityId: 'tools', baseOutputPerTick: 5 },
            { id: 'ps_parts', nodeId: 'n_mine', commodityId: 'repair_parts', baseOutputPerTick: 4 },
            { id: 'ps_spices', nodeId: 'n_oasis', commodityId: 'spices', baseOutputPerTick: 5 },
            { id: 'ps_wine', nodeId: 'n_reed', commodityId: 'wine', baseOutputPerTick: 4 },
        ],
        demands: [
            { id: 'd_grain_port', nodeId: 'n_port', commodityId: 'grain', baseDemandPerTick: 6 },
            { id: 'd_grain_oasis', nodeId: 'n_oasis', commodityId: 'grain', baseDemandPerTick: 5 },
            { id: 'd_tools_farm', nodeId: 'n_grain', commodityId: 'tools', baseDemandPerTick: 3 },
            { id: 'd_timber_port', nodeId: 'n_port', commodityId: 'timber', baseDemandPerTick: 4 },
            { id: 'd_ore_ash', nodeId: 'n_ash', commodityId: 'iron_ore', baseDemandPerTick: 5 },
            { id: 'd_parts_keep', nodeId: 'n_keep', commodityId: 'repair_parts', baseDemandPerTick: 2 },
            { id: 'd_salt_reed', nodeId: 'n_reed', commodityId: 'salt', baseDemandPerTick: 3 },
            { id: 'd_herbs_port', nodeId: 'n_port', commodityId: 'herbs', baseDemandPerTick: 2 },
        ],
        tradeRoutes: [
            { id: 'tr_grain_to_port', fromNodeId: 'n_grain', toNodeId: 'n_port', commodityId: 'grain', capacityPerTick: 12, status: 'open', baseRisk: 0.05 },
            { id: 'tr_grain_to_oasis', fromNodeId: 'n_grain', toNodeId: 'n_oasis', commodityId: 'grain', capacityPerTick: 8, status: 'open', baseRisk: 0.2, capacityMultiplier: 0.85 },
            { id: 'tr_grain_to_reed', fromNodeId: 'n_grain', toNodeId: 'n_reed', commodityId: 'grain', capacityPerTick: 6, status: 'open', baseRisk: 0.06 },
            { id: 'tr_fish_sea', fromNodeId: 'n_pearl', toNodeId: 'n_port', commodityId: 'fish', capacityPerTick: 10, status: 'open', baseRisk: 0.1 },
            { id: 'tr_fish_to_reed', fromNodeId: 'n_pearl', toNodeId: 'n_reed', commodityId: 'fish', capacityPerTick: 5, status: 'open', baseRisk: 0.12 },
            { id: 'tr_timber_river', fromNodeId: 'n_forest', toNodeId: 'n_reed', commodityId: 'timber', capacityPerTick: 8, status: 'open', baseRisk: 0.08 },
            { id: 'tr_timber_to_port', fromNodeId: 'n_forest', toNodeId: 'n_port', commodityId: 'timber', capacityPerTick: 6, status: 'open', baseRisk: 0.1 },
            { id: 'tr_ore_to_ash', fromNodeId: 'n_mine', toNodeId: 'n_ash', commodityId: 'iron_ore', capacityPerTick: 6, status: 'open', baseRisk: 0.25 },
            { id: 'tr_tools_from_mine', fromNodeId: 'n_mine', toNodeId: 'n_grain', commodityId: 'tools', capacityPerTick: 5, status: 'open', baseRisk: 0.15 },
            { id: 'tr_tools_to_port', fromNodeId: 'n_mine', toNodeId: 'n_port', commodityId: 'tools', capacityPerTick: 4, status: 'open', baseRisk: 0.12 },
            { id: 'tr_salt_to_reed', fromNodeId: 'n_salt', toNodeId: 'n_reed', commodityId: 'salt', capacityPerTick: 8, status: 'open', baseRisk: 0.18 },
            { id: 'tr_salt_to_port', fromNodeId: 'n_salt', toNodeId: 'n_port', commodityId: 'salt', capacityPerTick: 5, status: 'open', baseRisk: 0.2 },
            { id: 'tr_herbs_to_port', fromNodeId: 'n_herb', toNodeId: 'n_port', commodityId: 'herbs', capacityPerTick: 5, status: 'open', baseRisk: 0.12 },
            { id: 'tr_parts_to_keep', fromNodeId: 'n_mine', toNodeId: 'n_keep', commodityId: 'repair_parts', capacityPerTick: 4, status: 'open', baseRisk: 0.1 },
            { id: 'tr_spices_oasis_port', fromNodeId: 'n_oasis', toNodeId: 'n_port', commodityId: 'spices', capacityPerTick: 5, status: 'open', baseRisk: 0.3 },
            { id: 'tr_wine_to_port', fromNodeId: 'n_reed', toNodeId: 'n_port', commodityId: 'wine', capacityPerTick: 4, status: 'open', baseRisk: 0.07 },
            { id: 'tr_blocked_pass', fromNodeId: 'n_mine', toNodeId: 'n_port', commodityId: 'iron_ore', capacityPerTick: 4, status: 'blocked', baseRisk: 0.4 },
        ],
        processingRecipes: [
            { id: 'recipe_smelt', inputs: { iron_ore: 2 }, outputs: { tools: 1 } },
            { id: 'recipe_parts', inputs: { iron_ore: 1, timber: 1 }, outputs: { repair_parts: 1 } },
        ],
        processingSites: [
            { id: 'site_ash_smelt', nodeId: 'n_ash', recipeId: 'recipe_smelt', maxBatchesPerTick: 2, condition: 0.9 },
            { id: 'site_mine_parts', nodeId: 'n_mine', recipeId: 'recipe_parts', maxBatchesPerTick: 1, condition: 0.85 },
        ],
    };

    writeJson(dir, 'world_forge.json', {
        format: 'lorerelay-world-forge/1.0',
        meta: {
            worldName: 'The Sapphire Roads',
            theme: 'fantasy',
            worldSeed: 'showcase-sapphire-roads-002',
            tags: ['trade', 'river', 'showcase'],
        },
        geography: { regions, locations },
        factions: [
            { id: 'fac_harbor', name: 'Harbor Compact', type: 'guild', power: 62, description: 'Controls ports and sea tolls.', goals: ['secure sea lanes'], enemies: [], allies: ['fac_river'] },
            { id: 'fac_river', name: 'Delta Bargemen', type: 'guild', power: 48, description: 'River transport cartel.', goals: ['keep canals open'], enemies: [], allies: ['fac_harbor'] },
            { id: 'fac_farmers', name: 'Vale Freeholds', type: 'civil', power: 40, description: 'Grain freeholders.', goals: ['fair grain prices'], enemies: [], allies: [] },
            { id: 'fac_woodwise', name: 'Woodwise Circle', type: 'faction', power: 35, description: 'Forest stewards and herbalists.', goals: ['protect timber stands'], enemies: [], allies: [] },
            { id: 'fac_miners', name: 'Ironspine League', type: 'guild', power: 55, description: 'Miners and smiths.', goals: ['export ore and tools'], enemies: [], allies: [] },
            { id: 'fac_caravan', name: 'Glasssteppe Caravan', type: 'guild', power: 44, description: 'Desert caravan houses.', goals: ['oasis monopoly'], enemies: [], allies: [] },
        ],
        commerce: {
            commodities,
            markets,
            transportKinds: [
                { id: 'wagon_amber', name: 'Amber Wagon', capacity: 40, speed: 1, foodPerDay: 2 },
                { id: 'barge_blue', name: 'Bluefin Barge', capacity: 80, speed: 1, foodPerDay: 3 },
                { id: 'pack_train', name: 'Pack Train', capacity: 25, speed: 1, foodPerDay: 2 },
            ],
            resourceFlows,
        },
    });

    // Markets with intentional priceIndex skew for regional specialties
    writeJson(dir, 'world_state.json', {
        format: 'lorerelay-world-state/1.0',
        worldTurn: 24,
        factions: {
            fac_harbor: { power: 62, resources: { crowns: 4000 }, morale: 60 },
            fac_river: { power: 48, resources: { crowns: 1800 }, morale: 55 },
            fac_farmers: { power: 40, resources: { crowns: 900 }, morale: 58 },
            fac_woodwise: { power: 35, resources: { crowns: 700 }, morale: 52 },
            fac_miners: { power: 55, resources: { crowns: 2200 }, morale: 50 },
            fac_caravan: { power: 44, resources: { crowns: 2500 }, morale: 48 },
        },
        regions: Object.fromEntries(regions.map((r) => [r.id, { dangerLevel: r.dangerLevel, controllingFaction: locations.find((l) => l.regionId === r.id)?.factionControl }])),
        markets: {
            loc_sapphire_port: {
                fish: { stock: 28, priceIndex: 0.9 },
                salt: { stock: 22, priceIndex: 1.0 },
                wine: { stock: 14, priceIndex: 1.1 },
                spices: { stock: 6, priceIndex: 1.4 },
                tools: { stock: 12, priceIndex: 1.15 },
                repair_parts: { stock: 8, priceIndex: 1.2 },
                fuel: { stock: 15, priceIndex: 1.0 },
                grain: { stock: 18, priceIndex: 1.25 },
            },
            loc_reedmarket: {
                fish: { stock: 20, priceIndex: 0.95 },
                pottery: { stock: 16, priceIndex: 0.85 },
                wine: { stock: 18, priceIndex: 0.9 },
                grain: { stock: 12, priceIndex: 1.1 },
                salt: { stock: 8, priceIndex: 1.3 },
            },
            loc_goldgrain: {
                grain: { stock: 55, priceIndex: 0.7 },
                wool: { stock: 20, priceIndex: 0.85 },
                pottery: { stock: 10, priceIndex: 1.0 },
                tools: { stock: 5, priceIndex: 1.45 },
            },
            loc_mistgrove: {
                timber: { stock: 30, priceIndex: 0.75 },
                herbs: { stock: 14, priceIndex: 0.8 },
                wool: { stock: 8, priceIndex: 1.05 },
            },
            loc_ironspire: {
                iron_ore: { stock: 24, priceIndex: 0.8 },
                tools: { stock: 18, priceIndex: 0.9 },
                repair_parts: { stock: 12, priceIndex: 0.95 },
                fuel: { stock: 10, priceIndex: 1.1 },
            },
            loc_glass_oasis: {
                salt: { stock: 20, priceIndex: 0.85 },
                spices: { stock: 16, priceIndex: 0.75 },
                textiles: { stock: 9, priceIndex: 0.9 },
                fuel: { stock: 11, priceIndex: 1.05 },
                grain: { stock: 6, priceIndex: 1.6 },
            },
            loc_pearl_haven: {
                fish: { stock: 32, priceIndex: 0.7 },
                salt: { stock: 14, priceIndex: 0.95 },
                pottery: { stock: 8, priceIndex: 1.1 },
            },
            loc_watchkeep: {
                tools: { stock: 7, priceIndex: 1.3 },
                repair_parts: { stock: 4, priceIndex: 1.5 },
                grain: { stock: 10, priceIndex: 1.2 },
                fuel: { stock: 6, priceIndex: 1.25 },
            },
            loc_ash_forge: {
                iron_ore: { stock: 8, priceIndex: 1.2 },
                tools: { stock: 10, priceIndex: 0.95 },
                fuel: { stock: 9, priceIndex: 1.05 },
            },
        },
    });

    writeJson(dir, 'vehicle_state.json', {
        version: 1,
        activeVehicleId: 'wagon_amber',
        updatedTurn: 24,
        vehicles: [
            {
                id: 'wagon_amber',
                name: 'Amber Road Wagon',
                kind: 'wagon',
                owner: { type: 'party' },
                status: 'available',
                locationId: 'loc_sapphire_port',
                capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 1, cargoCapacity: 18, currentCargoLoad: 6 },
                access: { sizeClass: 'medium', accessTags: ['road'] },
                mobility: { speedBand: 'normal', rangeBand: 'regional', terrainTags: ['road', 'plains'] },
                durability: { hp: 48, maxHp: 50, armorBand: 'none', condition: 'pristine' },
                resources: { powerType: 'draft', current: 10, max: 12 },
                cargo: [{ id: 'grain', label: 'Grain sacks', amount: 4, tags: ['staple'] }],
                modules: [], crew: [], notes: [], tags: ['trade'],
            },
            {
                id: 'barge_blue',
                name: 'Bluefin Barge',
                kind: 'boat',
                owner: { type: 'party' },
                status: 'parked',
                locationId: 'loc_sapphire_port',
                capacity: { crewRequired: 2, crewCapacity: 6, passengerCapacity: 8, cargoCapacity: 60, currentCargoLoad: 0 },
                access: { sizeClass: 'large', accessTags: ['shallow_water', 'dock'] },
                mobility: { speedBand: 'slow', rangeBand: 'regional', terrainTags: ['water', 'river'] },
                durability: { hp: 90, maxHp: 100, armorBand: 'light', condition: 'worn' },
                mobileBase: {
                    settlementId: 'mb_sapphire_barge',
                    mode: 'ship',
                    layoutProfile: 'deck',
                    interiorAccess: 'crew_only',
                    dockedAtLocationId: 'loc_sapphire_port',
                },
                cargo: [], modules: [], crew: [], notes: [], tags: ['river'],
            },
            {
                id: 'pack_train',
                name: 'Glasssteppe Pack Train',
                kind: 'cart',
                owner: { type: 'party' },
                status: 'available',
                locationId: 'loc_glass_oasis',
                capacity: { crewRequired: 2, crewCapacity: 3, passengerCapacity: 0, cargoCapacity: 12, currentCargoLoad: 3 },
                access: { sizeClass: 'medium', accessTags: ['road', 'offroad'] },
                mobility: { speedBand: 'slow', rangeBand: 'regional', terrainTags: ['road', 'desert'] },
                durability: { hp: 35, maxHp: 40, armorBand: 'none', condition: 'worn' },
                cargo: [{ id: 'spices', label: 'Spice chests', amount: 3, tags: ['luxury'] }],
                modules: [], crew: [], notes: [], tags: ['caravan'],
            },
            {
                id: 'repair_cart',
                name: 'Waystation Repair Cart',
                kind: 'cart',
                owner: { type: 'party' },
                status: 'damaged',
                locationId: 'loc_whitepass_camp',
                capacity: { crewRequired: 1, crewCapacity: 1, passengerCapacity: 0, cargoCapacity: 6, currentCargoLoad: 1 },
                access: { sizeClass: 'small', accessTags: ['road'] },
                mobility: { speedBand: 'slow', rangeBand: 'local', terrainTags: ['road', 'snow'] },
                durability: { hp: 8, maxHp: 30, armorBand: 'none', condition: 'damaged' },
                cargo: [{ id: 'repair_parts', label: 'Spare fittings', amount: 1, tags: ['parts'] }],
                modules: [], crew: [], notes: [{ id: 'n1', text: 'Axle cracked on Whitepass ice.' }], tags: ['repair'],
            },
        ],
    });

    // Mobile-base settlement (distinct deck layout)
    writeJson(dir, 'settlement_state.json', {
        version: 1,
        settlementId: 'mb_sapphire_barge',
        name: 'Bluefin Deckhold',
        locationId: 'loc_sapphire_port',
        stocks: [
            { id: 'rations', amount: 24 },
            { id: 'wood', amount: 12 },
            { id: 'rope', amount: 8 },
            { id: 'tar', amount: 5 },
        ],
        structures: [
            { id: 'bridge', name: 'Pilot Bridge', status: 'intact', layerId: 'z1' },
            { id: 'cargo_hold', name: 'Cargo Hold', status: 'intact', layerId: 'z0' },
            { id: 'galley', name: 'Galley', status: 'intact', layerId: 'z1' },
            { id: 'hull', name: 'Outer Hull', status: 'worn', layerId: 'z0' },
        ],
        residents: [
            { npcId: 'npc_mira', role: 'captain' },
            { npcId: 'npc_joren', role: 'quartermaster' },
        ],
        visitors: [],
        merchants: [{ npcId: 'npc_sela', wares: ['spices', 'wine'] }],
        incidents: [],
        scores: { morale: 62, safety: 55 },
    });

    writeJson(dir, 'settlement_layout.json', {
        version: 1,
        settlementId: 'mb_sapphire_barge',
        layers: ['z0', 'z1'],
        zones: [
            { id: 'hull_ring', layerId: 'z0', code: 'wall', label: 'Hull', x: 0, y: 0 },
            { id: 'hold_floor', layerId: 'z0', code: 'floor', label: 'Hold deck', x: 1, y: 1 },
            { id: 'cargo_zone', layerId: 'z0', code: 'stockpile', label: 'Cargo', x: 2, y: 1 },
            { id: 'waterline', layerId: 'z0', code: 'water', label: 'River', x: 0, y: 3 },
            { id: 'deck_floor', layerId: 'z1', code: 'floor', label: 'Main deck', x: 1, y: 1 },
            { id: 'bridge_zone', layerId: 'z1', code: 'quarters', label: 'Bridge', x: 2, y: 0 },
            { id: 'market_stall', layerId: 'z1', code: 'market', label: 'Trade stall', x: 3, y: 1 },
            { id: 'workshop', layerId: 'z1', code: 'workshop', label: 'Repair bench', x: 1, y: 2 },
            { id: 'gate_gangway', layerId: 'z1', code: 'gate', label: 'Gangway', x: 4, y: 1 },
        ],
        markers: [
            { id: 'm_captain', layerId: 'z1', label: 'Captain Mira', x: 2, y: 0 },
            { id: 'm_cargo', layerId: 'z0', label: 'Grain crates', x: 2, y: 1 },
            { id: 'm_merchant', layerId: 'z1', label: 'Sela', x: 3, y: 1 },
        ],
    });

    const charDir = path.join(dir, 'characters');
    writeJson(charDir, 'npc_mira.json', {
        id: 'npc_mira',
        name: 'Captain Mira',
        description: 'River captain of the Bluefin Barge.',
        personality: 'Blunt, fair, tide-wise.',
        controlledBy: 'ai',
    });
    writeJson(charDir, 'npc_joren.json', {
        id: 'npc_joren',
        name: 'Joren Vale',
        description: 'Quartermaster and grain broker.',
        personality: 'Careful with coin.',
        controlledBy: 'ai',
    });
    writeJson(charDir, 'npc_sela.json', {
        id: 'npc_sela',
        name: 'Sela of Glass Oasis',
        description: 'Spice merchant of the caravan houses.',
        personality: 'Warm smile, hard bargains.',
        controlledBy: 'ai',
    });
    writeJson(charDir, 'party.json', ['npc_mira', 'npc_joren', 'npc_sela']);
    writeTxt(charDir, 'active_character.txt', 'npc_mira');

    writeJson(dir, 'persona.json', {
        version: 1,
        name: 'Aric Lane',
        description: 'Independent merchant plying The Sapphire Roads.',
        speakingStyle: 'Practical, good-humored, numbers-first.',
    });

    writeJson(dir, 'parlor_session.npc_mira.json', {
        version: 1,
        characterId: 'npc_mira',
        messages: [
            { id: 'm1', role: 'assistant', content: 'Tide is with us. Load light cargo first.', createdAt: '2026-07-01T08:00:00.000Z' },
            { id: 'm2', role: 'user', content: 'What is the grain price upriver?', createdAt: '2026-07-01T08:01:00.000Z' },
        ],
        updatedAt: '2026-07-01T08:01:00.000Z',
    });

    // Location-scoped fixed settlements for the six showcase cities.
    // Root settlement_state/layout above remain the Mobile Base singleton (not migrated).
    writeFixedCitySettlements(dir);

    return dir;
}

module.exports = {
    createLivingTradeWorld,
    buildFixedCitySettlements,
    writeFixedCitySettlements,
};
