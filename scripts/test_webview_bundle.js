const fs = require('fs');
const path = require('path');
const assert = require('assert');

const scriptPath = path.join(__dirname, '..', 'webview', 'script.js');
const htmlPath = path.join(__dirname, '..', 'webview', 'index.html');

console.log('Testing Webview Bundle Integration...');

// 1. Check if the bundle script exists
assert(fs.existsSync(scriptPath), 'Error: webview/script.js does not exist. Run "npm run build:webview" first.');
console.log('✔ webview/script.js exists');
assert(fs.existsSync(htmlPath), 'Error: webview/index.html does not exist.');
console.log('✔ webview/index.html exists');

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
    'imagePathsLooselyMatch',
    'renderPlayerCommerce',
    'renderLivingWorldMarkets',
    'renderLivingWorldOps',
    'renderNpcWhereabouts',
    'world-markets-details',
    'world-npc-whereabouts-details',
    'inspector-living-world-ops'
];

for (const symbol of expectedSymbols) {
    assert(content.includes(symbol), `Error: webview/script.js does not contain the expected symbol "${symbol}". Is 85-world.js included in the bundle?`);
    console.log(`✔ Found symbol "${symbol}" in the bundle`);
}

const html = fs.readFileSync(htmlPath, 'utf-8');
const statusStart = html.indexOf('<div id="pane-status"');
const statusEnd = html.indexOf('</div> <!-- /pane-status -->');
const characterStart = html.indexOf('<div id="pane-character"');
assert(statusStart >= 0, 'Error: pane-status is missing from webview/index.html.');
assert(statusEnd > statusStart, 'Error: pane-status closing marker is missing or before pane-status.');
assert(characterStart > statusEnd, 'Error: pane-character must be a sibling after pane-status, not nested inside it.');

const statusPaneHtml = html.slice(statusStart, statusEnd + '</div>'.length);
const statusDivOpens = (statusPaneHtml.match(/<div\b/g) || []).length;
const statusDivCloses = (statusPaneHtml.match(/<\/div>/g) || []).length;
assert.strictEqual(
    statusDivOpens,
    statusDivCloses,
    `Error: pane-status has unbalanced <div> tags (${statusDivOpens} opens, ${statusDivCloses} closes). This can make other tabs render as 0x0.`
);
console.log('✔ pane-status div structure is balanced');

console.log('🎉 Webview Bundle Integration Test passed successfully!');
process.exit(0);
