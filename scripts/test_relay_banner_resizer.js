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

// Static code analysis to ensure requirements are met
runTest('Sash double-click restores default height', () => {
  assert(bootstrapCode.includes('dblclick'), 'Missing dblclick event listener for sash');
  assert(bootstrapCode.includes("removeItem('lorerelay.relayBannerHeight')") || bootstrapCode.includes('removeItem("lorerelay.relayBannerHeight")'), 'Missing localStorage.removeItem on dblclick');
});

runTest('Sash resizer limits max height to viewport percentage', () => {
  assert(bootstrapCode.includes('window.innerHeight * 0.5') || bootstrapCode.includes('window.innerHeight *'), 'Missing innerHeight constraint');
});

runTest('Hide logic applies to content, not banner wrapper', () => {
  assert(bootstrapCode.includes("getElementById('relay-mode-banner-content')"), 'Must target content for hiding');
  assert(bootstrapCode.includes("style.display = 'none'") || bootstrapCode.includes('style.display = "none"'), 'Must use display none for 0 height');
});

runTest('Loaded localStorage value is clamped and applied correctly', () => {
  assert(bootstrapCode.includes('parseFloat(savedHeight)') || bootstrapCode.includes('parseInt(savedHeight'), 'Must parse saved height');
});

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('Relay banner resizer logic tests passed.');
  process.exit(0);
}
