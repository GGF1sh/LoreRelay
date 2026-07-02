'use strict';

/**
 * Minimal vscode module stub for Node unit tests that load compiled extension code.
 * Usage:
 *   const { installVscodeStub } = require('./test_helpers/vscode_stub');
 *   const restore = installVscodeStub();
 *   try { ... require('../out/statePatch') ... } finally { restore(); }
 */

function createVscodeStub(overrides = {}) {
    const noop = () => undefined;
    const noopAsync = async () => undefined;
    return {
        window: {
            showErrorMessage: noop,
            showWarningMessage: noop,
            showInformationMessage: noopAsync,
            setStatusBarMessage: noop,
            createOutputChannel: () => ({ append: noop, appendLine: noop, clear: noop, show: noop }),
        },
        workspace: {
            getConfiguration: () => ({
                get: () => undefined,
                update: noopAsync,
            }),
            workspaceFolders: undefined,
        },
        Uri: { file: (p) => ({ fsPath: p }) },
        ...overrides,
    };
}

function installVscodeStub(overrides = {}) {
    const Module = require('module');
    const original = Module.prototype.require;
    const stub = createVscodeStub(overrides);
    Module.prototype.require = function patchedRequire(id) {
        if (id === 'vscode') {
            return stub;
        }
        return original.apply(this, arguments);
    };
    return () => {
        Module.prototype.require = original;
    };
}

module.exports = { createVscodeStub, installVscodeStub };