const fs = require('fs');
const path = require('path');
const assert = require('assert');

const bootstrapPath = path.join(__dirname, '../webview/modules/90-bootstrap.js');
const bootstrapCode = fs.readFileSync(bootstrapPath, 'utf8');

let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log('OK: ' + name);
  } catch (err) {
    console.error('FAIL: ' + name);
    console.error(err);
    failCount++;
  }
}

// Static code analysis to ensure requirements are met.
//
// HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001 centralized the previously-inline
// resize/persistence logic into small named helpers (readRelayBannerPreference,
// normalizeRelayBannerHeight, setRelayBannerCollapsed/Expanded,
// relayBannerViewportMax, persistRelayBannerHeight) -- see
// scripts/test_relay_banner_recovery.js for full DOM-level behavioral
// coverage of the collapse/expand/recovery contract. These assertions were
// updated to match the new helper names/constant instead of the old inline
// literals; the underlying behavior they protect is unchanged.
runTest('Sash double-click restores default height', () => {
  assert(bootstrapCode.includes('dblclick'), 'Missing dblclick event listener for sash');
  assert(bootstrapCode.includes("RELAY_BANNER_STORAGE_KEY = 'lorerelay.relayBannerHeight'"), 'Missing the persisted-height storage key constant');
  assert(bootstrapCode.includes('removeItem(RELAY_BANNER_STORAGE_KEY)'), 'Missing localStorage.removeItem on dblclick');
});

runTest('Sash resizer limits max height to viewport percentage', () => {
  assert(bootstrapCode.includes('RELAY_BANNER_VIEWPORT_MAX_RATIO = 0.5'), 'Missing the viewport-percentage max-height ratio constant');
  assert(bootstrapCode.includes('function relayBannerViewportMax()'), 'Missing the centralized viewport-max helper');
});

runTest('Hide logic applies to content, not banner wrapper', () => {
  assert(bootstrapCode.includes("getElementById('relay-mode-banner-content')"), 'Must target content for hiding');
  assert(bootstrapCode.includes("style.display = 'none'") || bootstrapCode.includes('style.display = "none"'), 'Must use display none for 0 height');
});

runTest('Loaded localStorage value is clamped and applied correctly', () => {
  assert(bootstrapCode.includes('function normalizeRelayBannerHeight('), 'Missing the centralized height-normalization helper');
  assert(bootstrapCode.includes('parseFloat(raw)'), 'Must parse the saved height');
});

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('Relay banner resizer logic tests passed.');
  process.exit(0);
}
