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

// --- 1. Relay message branch ---
const relayBranchMatch = sourceBootstrap.match(/else if\s*\(\s*msg\.type\s*===\s*['"]relayModeStatus['"]\s*\)\s*\{([\s\S]*?)\}\s*else if/);
assert(relayBranchMatch, 'relayModeStatus branch must exist in 90-bootstrap.js');
const relayBranchText = relayBranchMatch[1];
assert(relayBranchText.includes("document.body.classList.add('relay-mode-active')"), 'Relay true must add relay-mode-active');
assert(relayBranchText.includes("document.body.classList.remove('relay-mode-active')"), 'Relay false must remove relay-mode-active');
assert(relayBranchText.includes("if (!relayBanner) {"), 'Banner creation must be guarded against duplication');
assert(relayBranchText.includes("relayBanner.remove()"), 'Relay false must remove the existing banner');
console.log('ok: Relay message branch assertions passed');

// --- 2. Selector-scoped CSS ---
function getCssBlock(cssText, targetSelector) {
  let inComment = false;
  let inString = false;
  let stringChar = '';
  let selectorBuffer = '';
  let blockBuffer = '';
  let braceDepth = 0;
  
  const blocks = [];
  let isMedia = false;
  
  for (let i = 0; i < cssText.length; i++) {
    const c = cssText[i];
    const nextC = cssText[i+1];
    
    if (inComment) {
      if (c === '*' && nextC === '/') {
        inComment = false;
        i++;
      }
      continue;
    }
    
    if (c === '/' && nextC === '*') {
      inComment = true;
      i++;
      continue;
    }
    
    if (inString) {
      if (c === '\\') {
        if (braceDepth === 0) selectorBuffer += c + nextC;
        else blockBuffer += c + nextC;
        i++;
      } else {
        if (braceDepth === 0) selectorBuffer += c;
        else blockBuffer += c;
        if (c === stringChar) {
          inString = false;
        }
      }
      continue;
    }
    
    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      if (braceDepth === 0) selectorBuffer += c;
      else blockBuffer += c;
      continue;
    }
    
    if (c === '{') {
      braceDepth++;
      if (braceDepth === 1) {
        let sel = selectorBuffer.trim();
        if (sel.startsWith('@')) {
          isMedia = true;
        } else {
          isMedia = false;
        }
      } else {
        if (!isMedia) blockBuffer += c;
      }
      continue;
    }
    
    if (c === '}') {
      braceDepth--;
      if (braceDepth === 0) {
        if (!isMedia) {
          let sel = selectorBuffer.trim();
          if (sel === targetSelector) {
            blocks.push(blockBuffer);
          }
        }
        selectorBuffer = '';
        blockBuffer = '';
        isMedia = false;
      } else {
        if (!isMedia) blockBuffer += c;
      }
      continue;
    }
    
    if (braceDepth === 0) {
      selectorBuffer += c;
    } else {
      if (!isMedia) blockBuffer += c;
    }
  }
  
  if (blocks.length === 0) {
    assert.fail(`CSS selector not found: ${targetSelector}`);
  }
  if (blocks.length > 1) {
    assert.fail(`CSS selector found multiple times (ambiguous): ${targetSelector}`);
  }
  return blocks[0];
}

const allCss = sourceBaseCss + '\n' + sourceLayoutCss + '\n' + sourceStatusCss;

const bodyCss = getCssBlock(allCss, 'body');
assert(bodyCss.includes('height: 100vh') && bodyCss.includes('overflow: hidden'), 'body remains height: 100vh and overflow: hidden');

const bodyRelayCss = getCssBlock(allCss, 'body.relay-mode-active');
assert(bodyRelayCss.includes('display: flex') && bodyRelayCss.includes('flex-direction: column'), 'body.relay-mode-active is display:flex and flex-direction:column');

const appCss = getCssBlock(allCss, '#app');
assert(appCss.includes('height: 100vh'), 'normal #app remains height:100vh');

const relayAppCss = getCssBlock(allCss, 'body.relay-mode-active #app');
assert(relayAppCss.includes('flex: 1 1 auto') && relayAppCss.includes('height: auto') && relayAppCss.includes('min-height: 0'), 'Relay-mode #app has flex:1 1 auto, height:auto and min-height:0');
assert(!relayAppCss.includes('height: 100vh') && !relayAppCss.includes('height:100vh'), 'Relay-mode #app does not contain height:100vh');

const bannerCss = getCssBlock(allCss, '#relay-mode-banner');
assert(bannerCss.includes('flex: 0 0 auto'), 'Relay banner has flex:0 0 auto');
const bannerZMatch = bannerCss.match(/z-index\s*:\s*(\d+)/);
assert(bannerZMatch, 'Relay banner must have a z-index');
const bannerZ = parseInt(bannerZMatch[1], 10);

const bgOverlayCss = getCssBlock(allCss, '#bg-overlay');
const bgOverlayZMatch = bgOverlayCss.match(/z-index\s*:\s*(-?\d+)/);
const bgOverlayZ = bgOverlayZMatch ? parseInt(bgOverlayZMatch[1], 10) : 0;
assert(bannerZ > bgOverlayZ, 'Relay banner z-index is numerically greater than #bg-overlay z-index');
const appZMatch = appCss.match(/z-index\s*:\s*(-?\d+)/);
const appZ = appZMatch ? parseInt(appZMatch[1], 10) : 0;
assert(bannerZ > appZ, 'Relay banner z-index is numerically greater than normal #app z-index');

const statusAreaCss = getCssBlock(allCss, '#status-area');
assert(statusAreaCss.includes('overflow: hidden'), '#status-area has overflow:hidden');
assert(!statusAreaCss.includes('overflow-y: auto') && !statusAreaCss.includes('overflow: scroll'), '#status-area does not have overflow-y:auto or overflow:scroll');

const tabPaneCss = getCssBlock(allCss, '.tab-pane');
assert(tabPaneCss.includes('overflow-y: auto') && tabPaneCss.includes('min-height: 0'), '.tab-pane has overflow-y:auto and min-height:0');
const padMatch = tabPaneCss.match(/padding-bottom\s*:\s*(\d+)px/) || tabPaneCss.match(/padding\s*:\s*(?:\d+px\s+){2}(\d+)px/);
assert(padMatch && parseInt(padMatch[1], 10) > 0, '.tab-pane has bottom padding greater than zero');

const tabPaneActiveCss = getCssBlock(allCss, '.tab-pane.active');
assert(tabPaneActiveCss.includes('flex: 1 1 auto'), '.tab-pane.active has flex:1 1 auto');

const themeHeaderCss = getCssBlock(allCss, '#theme-header');
assert(themeHeaderCss.includes('flex-direction: column') && themeHeaderCss.includes('align-items: flex-start'), '#theme-header uses column layout and align-items:flex-start');

const themeHeaderSpanCss = getCssBlock(allCss, '#theme-header span');
assert(themeHeaderSpanCss.includes('flex-shrink: 0') && themeHeaderSpanCss.includes('white-space: nowrap'), '#theme-header span has flex-shrink:0 and white-space:nowrap');

const themeSelectorCss = getCssBlock(allCss, '.theme-selector');
assert(themeSelectorCss.includes('width: 100%') && themeSelectorCss.includes('display: flex') && themeSelectorCss.includes('flex-wrap: wrap'), '.theme-selector has width:100%, display:flex and flex-wrap:wrap');
assert(!themeSelectorCss.includes('overflow-x') && !themeSelectorCss.includes('overflow: auto') && !themeSelectorCss.includes('overflow: scroll'), '.theme-selector does not introduce horizontal scrolling');
console.log('ok: Selector-scoped CSS assertions passed');

// --- 3. Story Summary containment ---
const paneStatusIndex = indexHtml.indexOf('id="pane-status"');
assert(paneStatusIndex > -1, 'id="pane-status" must exist');
const paneCharIndex = indexHtml.indexOf('id="pane-character"', paneStatusIndex);
assert(paneCharIndex > -1, 'id="pane-character" must exist after pane-status');
const summaryContainerIndex = indexHtml.indexOf('id="summary-container"');
assert(summaryContainerIndex > paneStatusIndex && summaryContainerIndex < paneCharIndex, 'summary-container must occur strictly between pane-status and pane-character');
const storySummaryIndex = indexHtml.indexOf('id="story-summary"');
assert(storySummaryIndex > paneStatusIndex && storySummaryIndex < paneCharIndex, 'story-summary must occur strictly between pane-status and pane-character');
const themeHeaderIndex = indexHtml.indexOf('id="theme-header"');
assert(themeHeaderIndex > -1, 'id="theme-header" must exist');
assert(summaryContainerIndex > themeHeaderIndex && storySummaryIndex > themeHeaderIndex, 'Story summary must occur after the World Theme section');
console.log('ok: Story Summary containment assertions passed');

// --- 4. Theme switching scope ---
function extractFunctionBody(source, funcName) {
  const funcStr = `function ${funcName}`;
  const startIdx = source.indexOf(funcStr);
  if (startIdx === -1) return null;
  const openBraceIdx = source.indexOf('{', startIdx);
  if (openBraceIdx === -1) return null;
  let braceCount = 1;
  let i = openBraceIdx + 1;
  for (; i < source.length; i++) {
    if (source[i] === '{') braceCount++;
    if (source[i] === '}') {
      braceCount--;
      if (braceCount === 0) break;
    }
  }
  return source.substring(openBraceIdx + 1, i);
}

const setThemeBody = extractFunctionBody(sourceGameState, 'setTheme');
assert(setThemeBody, 'setTheme function body must be found');
assert(setThemeBody.includes("document.body.setAttribute('data-ui-theme',"), 'setTheme updates data-ui-theme');
assert(setThemeBody.includes(".classList.toggle('active'"), 'setTheme updates theme-btn active state');
assert(!setThemeBody.includes("innerHTML") && !setThemeBody.includes("textContent =") && !setThemeBody.includes(".remove()"), 'setTheme does not remove/replace/clear/assign text/HTML');
console.log('ok: Theme switching scope assertions passed');

// --- 5. Complete source/bundle inclusion ---
const cleanBundleJs = cleanStr(bundleScript);
const cleanBundleCss = cleanStr(bundleCss);

assert(cleanBundleJs.includes(cleanStr(sourceBootstrap).trimEnd()), 'generated JS bundle must contain the complete normalized contents of 90-bootstrap.js');
assert(cleanBundleCss.includes(cleanStr(sourceBaseCss).trimEnd()), 'generated CSS bundle must contain the complete normalized contents of 00-base.css');
assert(cleanBundleCss.includes(cleanStr(sourceLayoutCss).trimEnd()), 'generated CSS bundle must contain the complete normalized contents of 10-layout-chat.css');
assert(cleanBundleCss.includes(cleanStr(sourceStatusCss).trimEnd()), 'generated CSS bundle must contain the complete normalized contents of 30-status-gallery.css');
console.log('ok: Complete source/bundle inclusion assertions passed');

console.log('Relay viewport, status scroll, and World Theme layout tests passed.');
