'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, PLAN_SCHEMA_VERSION, makePlan, assertPlanCurrent, git } = require('./planner');
const { hydrateTrustedCommand } = require('./trusted-commands');

const FORBIDDEN_COMMAND_FIELDS = ['executable', 'args', 'shell', 'cwd', 'env'];

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate the shape of an untrusted, parsed plan JSON. Rejects anything that does not
 * match the current declarative schema, including a plan that still carries spawn-authority
 * fields (executable/args/shell/cwd/env) on a selected command - those are never trusted,
 * so their mere presence on a schemaVersion-2 plan is treated as tampering.
 */
function validatePlanShape(plan) {
    if (!isPlainObject(plan)) throw new Error('Plan must be a JSON object.');
    if (plan.schemaVersion !== PLAN_SCHEMA_VERSION) {
        throw new Error(
            `Plan schemaVersion ${JSON.stringify(plan.schemaVersion)} is not supported (expected ${PLAN_SCHEMA_VERSION}). ` +
            'Stale-schema plans predate the command-trust repair and are rejected rather than executed; regenerate the plan with the current Test Console CLI.'
        );
    }
    for (const field of ['repositoryRoot', 'baseSha', 'headSha', 'branch', 'version', 'mode', 'dirtyDiffHash']) {
        if (typeof plan[field] !== 'string' || !plan[field]) throw new Error(`Plan is missing required string field: ${field}`);
    }
    if (typeof plan.dirty !== 'boolean') throw new Error('Plan.dirty must be a boolean.');
    if (!Array.isArray(plan.changedFiles)) throw new Error('Plan.changedFiles must be an array.');
    if (!Array.isArray(plan.unknownFiles)) throw new Error('Plan.unknownFiles must be an array.');
    if (typeof plan.requiresFullSuite !== 'boolean') throw new Error('Plan.requiresFullSuite must be a boolean.');
    if (!isPlainObject(plan.humanSmoke) || typeof plan.humanSmoke.status !== 'string') throw new Error('Plan.humanSmoke is malformed.');
    if (!Array.isArray(plan.selectedCommands)) throw new Error('Plan.selectedCommands must be an array.');
    for (const command of plan.selectedCommands) {
        if (!isPlainObject(command)) throw new Error('Each selected command must be an object.');
        if (typeof command.id !== 'string' || !command.id) throw new Error('Each selected command requires a string id.');
        if (typeof command.phase !== 'string') throw new Error(`Command ${command.id} is missing phase.`);
        if (typeof command.category !== 'string') throw new Error(`Command ${command.id} is missing category.`);
        if (!Array.isArray(command.reasons)) throw new Error(`Command ${command.id} is missing reasons.`);
        for (const forbidden of FORBIDDEN_COMMAND_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(command, forbidden)) {
                throw new Error(
                    `Command ${command.id} carries a "${forbidden}" field. Plan JSON is untrusted declarative data and must never ` +
                    'supply spawn authority; regenerate the plan or remove the field.'
                );
            }
        }
    }
}

function declarativeCommandKey(command) {
    return {
        id: command.id,
        phase: command.phase,
        category: command.category,
        exclusiveGroup: command.exclusiveGroup || null,
        workspaceWriter: Boolean(command.workspaceWriter),
        reasons: [...command.reasons].sort(),
    };
}

function declarativeSnapshot(plan) {
    return {
        changedFiles: [...plan.changedFiles].sort(),
        unknownFiles: [...plan.unknownFiles].sort(),
        requiresFullSuite: plan.requiresFullSuite,
        humanSmoke: plan.humanSmoke,
        selectedCommands: [...plan.selectedCommands]
            .map(declarativeCommandKey)
            .sort((a, b) => a.id.localeCompare(b.id)),
    };
}

/**
 * Reject a loaded plan whose declarative content differs from a canonical plan freshly
 * regenerated (by trusted planner code) for the same base/head/mode. This is what stops a
 * hand-edited plan.json from smuggling in a different command selection even though its
 * spawn-authority fields are already stripped by validatePlanShape.
 */
function assertDeclarativeMatch(loaded, canonical) {
    const before = JSON.stringify(declarativeSnapshot(loaded));
    const after = JSON.stringify(declarativeSnapshot(canonical));
    if (before !== after) {
        throw new Error(
            'Loaded plan does not match a freshly regenerated canonical plan for the same base/head/mode. ' +
            `Refusing to execute a hand-edited or stale plan.\nLoaded:    ${before}\nCanonical: ${after}`
        );
    }
}

/**
 * Verify the loaded plan really describes *this* repository at *its current* state: the
 * repositoryRoot must be the trusted LoreRelay checkout, HEAD/dirty/version/branch must match
 * what is live right now, and baseSha must be a real commit here.
 *
 * `expectedRoot` defaults to the real LoreRelay checkout and must never be overridden in
 * production; the parameter exists only so self-tests can point this same logic at a
 * disposable fixture repository instead of asserting against the live checkout.
 */
function assertRepositoryIdentity(plan, expectedRoot = ROOT) {
    const resolvedRoot = path.resolve(plan.repositoryRoot);
    const resolvedExpectedRoot = path.resolve(expectedRoot);
    if (resolvedRoot !== resolvedExpectedRoot) {
        throw new Error(`Plan repositoryRoot "${resolvedRoot}" does not match the trusted repository root "${resolvedExpectedRoot}".`);
    }
    assertPlanCurrent(plan);
    const currentBranch = git(['branch', '--show-current'], resolvedExpectedRoot) || '(detached)';
    if (currentBranch !== plan.branch) {
        throw new Error(`Plan branch "${plan.branch}" does not match current branch "${currentBranch}". Create a new plan.`);
    }
    try {
        git(['cat-file', '-e', plan.baseSha], resolvedExpectedRoot);
    } catch (_error) {
        throw new Error(`Plan base SHA "${plan.baseSha}" is not a known commit in this repository.`);
    }
}

/**
 * Hydrate every declarative selected-command descriptor into a real, executable command via
 * the trusted registry. This is the single spot where declarative plan data turns into spawn
 * authority - both the CLI and the dashboard server call this, so there is one trust model.
 */
function hydrateSelectedCommands(selectedCommands) {
    return selectedCommands.map((command) => hydrateTrustedCommand({
        id: command.id,
        phase: command.phase,
        category: command.category,
        reasons: command.reasons,
        exclusiveGroup: command.exclusiveGroup || null,
        workspaceWriter: Boolean(command.workspaceWriter),
    }));
}

/**
 * Full CLI trust boundary for `run --plan <file>`: parse as untrusted JSON, validate shape,
 * verify repository identity, regenerate a canonical plan, reject on any declarative mismatch,
 * then hydrate the canonical plan's commands for execution.
 *
 * `options.root` defaults to the real LoreRelay checkout; production callers must never
 * override it. Self-tests pass a disposable fixture repository so the tamper-detection logic
 * can be exercised without asserting against the live checkout.
 */
function loadTrustedPlan(planPath, options = {}) {
    const expectedRoot = options.root || ROOT;
    const raw = fs.readFileSync(path.resolve(planPath), 'utf8');
    let loaded;
    try {
        loaded = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Plan file is not valid JSON: ${error.message}`);
    }
    validatePlanShape(loaded);
    assertRepositoryIdentity(loaded, expectedRoot);
    const canonicalPlan = makePlan({ root: expectedRoot, base: loaded.baseSha, head: loaded.headSha, mode: loaded.mode });
    assertDeclarativeMatch(loaded, canonicalPlan);
    return {
        ...canonicalPlan,
        selectedCommands: hydrateSelectedCommands(canonicalPlan.selectedCommands),
    };
}

/**
 * Trust boundary for a plan the server generated itself moments ago (never touched a file or
 * the network). Still shares the same hydration step as the CLI so there is exactly one code
 * path from declarative plan to executable command.
 */
function hydrateOwnPlan(plan) {
    validatePlanShape(plan);
    return {
        ...plan,
        selectedCommands: hydrateSelectedCommands(plan.selectedCommands),
    };
}

module.exports = {
    FORBIDDEN_COMMAND_FIELDS,
    validatePlanShape,
    declarativeSnapshot,
    assertDeclarativeMatch,
    assertRepositoryIdentity,
    hydrateSelectedCommands,
    loadTrustedPlan,
    hydrateOwnPlan,
};
