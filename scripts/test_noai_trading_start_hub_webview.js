#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'webview', 'index.html'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'webview', 'modules', '90-bootstrap.js'), 'utf8');
const scenarioPack = fs.readFileSync(path.join(root, 'src', 'scenarioPack.ts'), 'utf8');

assert(html.includes('id="start-hub-trading-demo-btn"'), 'Start Hub renders a Trading Simulation card');
assert(html.includes('webview.startHub.tradingDemoTitle') && html.includes('webview.startHub.tradingDemoDesc'), 'card uses localized copy');
assert(bootstrap.includes("getElementById('start-hub-trading-demo-btn')"), 'Start Hub binds the trading card');
assert(bootstrap.includes("type: 'loadBundledScenario', sampleId: 'trade-routes'"), 'card uses the existing bundled scenario message');
assert(bootstrap.includes('resumeCurrentSession();'), 'card follows the existing Start Hub session behavior');
assert(scenarioPack.includes('confirmScenarioReset(wsPath)'), 'bundled scenario loading keeps the reset confirmation');
assert(scenarioPack.includes('loadScenarioPackFromDir(dir, { firstSessionHint: true })'), 'bundled scenario loading keeps the normal installed-extension path');

console.log('NOAI trading Start Hub Webview: all tests passed.');
