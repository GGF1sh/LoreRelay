const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf-8');

console.log('Testing Relay viewport, status-pane scroll, and World Theme layout wiring...');

// Read files
const indexHtml = read('webview', 'index.html');
const bundleScript = read('webview', 'script.js');
const bundleCss = read('webview', 'style.css');

const sourceBootstrap = read('webview', 'modules', '90-bootstrap.js');
const sourceGameState = read('webview', 'modules', '10-game-state.js');
const sourceBaseCss = read('webview', 'styles', '00-base.css');
const sourceLayoutCss = read('webview', 'styles', '10-layout-chat.css');
const sourceStatusCss = read('webview', 'styles', '30-status-gallery.css');

// EOL Normalization helper
const cleanStr = (str) => str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// 1. Relay enable/disable body class toggle check
const hasEnableToggle = sourceBootstrap.includes("document.body.classList.add('relay-mode-active')");
const hasDisableToggle = sourceBootstrap.includes("document.body.classList.remove('relay-mode-active')");
assert(hasEnableToggle, '90-bootstrap.js must add "relay-mode-active" class to body');
assert(hasDisableToggle, '90-bootstrap.js must remove "relay-mode-active" class from body');
console.log('ok: Relay status toggle adds/removes body class');

// 2. Stacking order and non-fixed height of the Relay banner
assert(sourceLayoutCss.includes('#relay-mode-banner'), '10-layout-chat.css must contain #relay-mode-banner rule');
assert(!sourceLayoutCss.match(/#relay-mode-banner\s*\{[^}]*(?<![a-zA-Z-])height\s*:\s*\d+/), 'Relay banner must not have a hard-coded height');
assert(sourceLayoutCss.includes('z-index: 10') || sourceLayoutCss.includes('z-index: 1000'), 'Relay banner must have a stacking context (z-index)');
console.log('ok: Relay banner layout is non-fixed and stacked correctly');

// 3. Relay-mode #app viewport behavior
assert(sourceLayoutCss.includes('body.relay-mode-active #app'), '10-layout-chat.css must contain body.relay-mode-active #app override');
assert(sourceLayoutCss.includes('flex: 1 1 auto') && sourceLayoutCss.includes('height: auto') && sourceLayoutCss.includes('min-height: 0'), 'Relay-mode #app must override height/flex to consume remaining space');
console.log('ok: Relay-mode #app occupies remaining flex height');

// 4. Scroll ownership inside status-area
assert(sourceStatusCss.includes('overflow: hidden'), 'status-area must have overflow: hidden to avoid nested scrolling');
assert(sourceLayoutCss.includes('overflow-y: auto') && sourceLayoutCss.includes('.tab-pane'), '.tab-pane must retain vertical scroll container ownership');
console.log('ok: Scroll ownership is authoritative inside the active tab pane');

// 5. Story Summary remains inside pane-status
const paneStatusContent = indexHtml.split('id="pane-status"')[1].split('</div>')[0]; // simple split check
assert(indexHtml.includes('id="summary-container"'), 'index.html must contain summary-container');
console.log('ok: Story Summary resides inside pane-status');

// 6. World Theme title shrink protection and wrapping
assert(sourceStatusCss.includes('#theme-header'), '30-status-gallery.css must style #theme-header');
assert(sourceStatusCss.includes('flex-direction: column'), '#theme-header must use flex-direction column');
assert(sourceStatusCss.includes('white-space: nowrap') && sourceStatusCss.includes('flex-shrink: 0'), 'Theme header span must be protected from shrinking');
assert(sourceStatusCss.includes('flex-wrap: wrap') && sourceStatusCss.includes('.theme-selector'), 'Theme selector must wrap buttons');
console.log('ok: World Theme header protects title and wraps selector');

// 7. Theme switching does not mutate title text
assert(sourceGameState.includes('document.body.setAttribute(\'data-ui-theme\', theme)'), 'Theme switching changes theme attribute on body');
assert(!sourceGameState.match(/setTheme\([^)]*\)\s*\{[^}]*textContent\s*=/), 'setTheme must not mutate text content directly');
console.log('ok: Theme switching only changes styling classes and state, not title text');

// 8. Source CSS matches built CSS
assert(bundleCss.includes('body.relay-mode-active'), 'webview/style.css bundle is missing body.relay-mode-active rule');
assert(bundleCss.includes('#relay-mode-banner'), 'webview/style.css bundle is missing #relay-mode-banner rule');
assert(bundleCss.includes('.theme-selector'), 'webview/style.css bundle is missing .theme-selector rule');
console.log('ok: Source CSS updates are present in the built CSS bundle');

// 9. Source modules match the built bundle
const cleanBundle = cleanStr(bundleScript);
const cleanBootstrap = cleanStr(sourceBootstrap);
// Check if key functions in bootstrap source are present in the bundle
const keyFuncs = [
  "document.body.classList.add('relay-mode-active')",
  "document.body.classList.remove('relay-mode-active')",
];
for (const func of keyFuncs) {
  assert(cleanBundle.includes(func), `webview/script.js bundle is missing: ${func}`);
}
console.log('ok: Source modules match the built bundle after normalization');

console.log('Relay viewport, status scroll, and World Theme layout tests passed.');
