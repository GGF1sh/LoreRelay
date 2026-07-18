const fs = require('fs');
const path = require('path');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const TARGET_DIR = 'C:\\AI\\artifacts\\LoreRelay\\showcase\\current\\01-populated-world';
const HARNESS_DIR = path.join('C:\\AI\\artifacts\\LoreRelay\\showcase\\current', '_harness');

if (!fs.existsSync(HARNESS_DIR)) {
    fs.mkdirSync(HARNESS_DIR, { recursive: true });
}

// 1. Stub VS Code API
let capturedMessage = null;

const vscodeStub = {
    workspace: {
        workspaceFolders: [{ uri: { fsPath: TARGET_DIR } }],
        getConfiguration: () => ({
            get: (key, def) => def !== undefined ? def : "",
            update: async () => undefined,
        })
    },
    Uri: { file: (p) => ({ fsPath: p }) }
};

const restore = installVscodeStub(vscodeStub);

try {
    // 2. Load the actual modules
    const { initWorldView, pushWorldViewToWebview } = require('../out/worldView');

    // 3. Fake WebviewPanel
    const fakePanel = {
        webview: {
            postMessage: (msg) => {
                if (msg && msg.type === 'worldView') {
                    capturedMessage = msg;
                }
            }
        }
    };

    // 4. Initialize and capture
    initWorldView({ getPanel: () => fakePanel });
    
    // Call the real function
    // 01-populated-world's game_state sets world.currentLocationId = "loc_osaka_port"
    pushWorldViewToWebview("loc_osaka_port");

    if (!capturedMessage) {
        console.error("Failed to capture worldView message.");
        process.exit(1);
    }

    // 5. Write out
    const outPath = path.join(HARNESS_DIR, 'worldView.json');
    fs.writeFileSync(outPath, JSON.stringify(capturedMessage, null, 2), 'utf8');
    console.log(`Captured worldView message to: ${outPath}`);

} finally {
    restore();
}
