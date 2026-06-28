const fs = require('fs');
const path = require('path');
const assert = require('assert');

const scriptPath = path.join(__dirname, '..', 'webview', 'script.js');

console.log('Testing Webview Bundle Integration...');

// 1. Check if the bundle script exists
assert(fs.existsSync(scriptPath), 'Error: webview/script.js does not exist. Run "npm run build:webview" first.');
console.log('✔ webview/script.js exists');

// 2. Check file size
const stats = fs.statSync(scriptPath);
assert(stats.size > 0, 'Error: webview/script.js is empty.');
console.log(`✔ File size is valid (${stats.size} bytes)`);

// 3. Verify content
const content = fs.readFileSync(scriptPath, 'utf-8');

// The bundle should contain 85-world.js code, containing the 'worldView' handler and UI rendering functions
const expectedSymbols = [
    'worldView',
    'renderWorldView',
    'renderCartographyMap',
    'world-cartography-stage',
    'generateWorldMapImage',
    'latestImageRawPath',
    'imagePathsLooselyMatch'
];

for (const symbol of expectedSymbols) {
    assert(content.includes(symbol), `Error: webview/script.js does not contain the expected symbol "${symbol}". Is 85-world.js included in the bundle?`);
    console.log(`✔ Found symbol "${symbol}" in the bundle`);
}

console.log('🎉 Webview Bundle Integration Test passed successfully!');
process.exit(0);
