#!/usr/bin/env node
'use strict';

/**
 * Shared deterministic world-engine regression list.
 * Referenced by run_simulation_tests.js and excluded from the unit category in
 * run_all_tests.js so npm test does not execute these scripts twice.
 */
module.exports.SIMULATION_TEST_MANIFEST = [
    { file: 'test_world_event_log.js' },
    { file: 'test_emergent_simulator.js' },
    { file: 'test_world_sim_bulk_core.js' },
    { file: 'test_world_sim_bulk_event_loop_yield.js' },
    { file: 'test_debug_scenario_core.js' },
    { file: 'test_living_world_bridge.js' },
    { file: 'test_world_sim_living_world.js' },
    { file: 'test_npc_agency_step_events.js' },
    { file: 'test_npc_relationship_core.js', timeoutMs: 120000 },
];

module.exports.SIMULATION_TEST_FILES = module.exports.SIMULATION_TEST_MANIFEST.map((e) => e.file);