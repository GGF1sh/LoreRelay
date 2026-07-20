#!/usr/bin/env node
'use strict';

/**
 * Shared combat regression list.
 *
 * These suites are compiled `node:test` files under `out/`. Until this manifest
 * existed nothing referenced them, so `npm test` and CI ran none of them — the
 * Golden Master, Direct Mode and mechanics-resolver coverage was local-only.
 *
 * Grouped rather than listed flat so `npm run test:list` shows what is covered
 * and a CI failure names the group as well as the file. Every group is executed
 * by run_all_tests.js in the `unit` category.
 *
 * Files are listed explicitly (no globbing) so adding a suite is a deliberate
 * act; `test_combat_manifest_coverage.js` fails if a compiled combat suite is
 * missing here or appears in more than one group.
 */

/** @typedef {{ id: string, description: string, files: string[], timeoutMs?: number }} CombatTestGroup */

/** @type {CombatTestGroup[]} */
module.exports.COMBAT_TEST_GROUPS = [
    {
        id: 'combat:golden-master',
        description: 'Gambit resolver parity with the Godot golden master (8 fixtures) and step-loop equivalence',
        files: ['gambitCombatCore.test.js', 'combatRtsStepExtractV1.test.js'],
    },
    {
        id: 'combat:rts-order-slot',
        description: 'RTS order slot, command application phase, stop/resume_gambit, and the command-receipt skeleton',
        files: ['combatRtsOrderSlotStopResumeV1.test.js'],
    },
    {
        id: 'combat:mechanics-resolver',
        description: 'Mechanics resolver: damage, statuses, heal block, regen, correctness',
        files: [
            'combatMechanicsResolver.test.js',
            'combatMechanicsCorrectness.test.js',
            'combatMechanicsHealBlockRegen.test.js',
            'gambitCombatMechanicsIntegration.test.js',
        ],
    },
    {
        id: 'combat:doom',
        description: 'Doom V1 lethal timers, lethality gate, and validator rules',
        files: ['combatDoomV1.test.js'],
    },
    {
        id: 'combat:aoe-engagement',
        description: 'AoE fan-out, delivery falloff, engagement slots, swarm multiplier',
        files: ['combatAoeEngagementV1.test.js'],
    },
    {
        id: 'combat:rts-command-input',
        description: 'RTS command input schema and deterministic normalization',
        files: ['combatRtsCommandInputV1.test.js'],
    },
    {
        id: 'combat:ability-validator',
        description: 'Ability definition validator and power budget',
        files: ['combatAbilityValidator.test.js'],
    },
    {
        id: 'combat:direct-mode',
        description: 'Direct Mode: foundation, headless move/attack, dodge and evasion credit',
        files: [
            'combatDirectModeFoundationV1.test.js',
            'combatDirectHeadlessMoveAttackV1.test.js',
            'combatDirectDodgeEvasionCreditV1.test.js',
        ],
        timeoutMs: 120000,
    },
    {
        id: 'combat:pr-regressions',
        description: 'PR #29 / #30 review remediation regressions',
        files: [
            'combatDirectPr29CodexFixV1.test.js',
            'combatDirectPr29CodexFix002V1.test.js',
            'combatDirectPr29CodexFix003V1.test.js',
            'combatDirectPr29CodexFix004V1.test.js',
            'combatDirectReviewRemediationV1.test.js',
        ],
        timeoutMs: 120000,
    },
    {
        id: 'combat:authoring-tools',
        description: 'Ability workshop, combat lab, and loadout UI cores',
        files: [
            'combatAbilityWorkshopCore.test.js',
            'combatAbilityWorkshopStore.test.js',
            'combatLabCore.test.js',
            'combatLabStore.test.js',
            'combatLoadoutUiCore.test.js',
        ],
    },
];

/** Flat list of every compiled suite this manifest owns. */
module.exports.COMBAT_TEST_FILES = module.exports.COMBAT_TEST_GROUPS
    .flatMap((group) => group.files);
