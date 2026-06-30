#!/usr/bin/env node
/**
 * Validate critical DOM structure in webview/index.html.
 * Catches tab-pane nesting bugs (e.g. missing </div> on #theme-header).
 *
 * Run: node scripts/validate_webview_html_structure.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'webview', 'index.html');

const REQUIRED_TAB_PANES = [
  'pane-status',
  'pane-character',
  'pane-inspector',
  'pane-world',
  'pane-lorebook',
  'pane-memory',
  'pane-director',
  'pane-party',
  'pane-ooc',
];

/** @param {string} html */
function validateTabPaneParents(html) {
  const divRe = /<div\b([^>]*)>|<\/div>/gi;
  const stack = [];
  const paneParents = new Map();
  let openDivs = 0;
  let closeDivs = 0;
  let match;

  while ((match = divRe.exec(html)) !== null) {
    if (match[0].startsWith('</')) {
      closeDivs++;
      if (stack.length === 0) {
        return { ok: false, error: 'Extra closing </div> in index.html' };
      }
      stack.pop();
      continue;
    }

    openDivs++;
    const attrs = match[1] || '';
    const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const id = idMatch ? idMatch[1] : null;
    const parent = stack.length ? stack[stack.length - 1] : null;

    if (id && REQUIRED_TAB_PANES.includes(id)) {
      paneParents.set(id, parent);
    }

    stack.push(id);
  }

  if (stack.length !== 0) {
    return {
      ok: false,
      error: `Unclosed <div> in index.html (${stack.length} remain, last id=${stack[stack.length - 1] ?? '(none)'})`,
    };
  }

  if (openDivs !== closeDivs) {
    return {
      ok: false,
      error: `Div balance mismatch: ${openDivs} opens vs ${closeDivs} closes`,
    };
  }

  const errors = [];
  for (const paneId of REQUIRED_TAB_PANES) {
    if (!paneParents.has(paneId)) {
      errors.push(`Missing #${paneId} in index.html`);
      continue;
    }
    const parent = paneParents.get(paneId);
    if (parent !== 'status-area') {
      errors.push(
        `#${paneId} must be a direct child of #status-area (found parent: #${parent ?? '(document root)'})`
      );
    }
  }

  if (errors.length) {
    return { ok: false, error: errors.join('\n') };
  }

  return { ok: true, paneParents };
}

function main() {
  if (!fs.existsSync(INDEX_HTML)) {
    console.error(`Missing ${path.relative(ROOT, INDEX_HTML)}`);
    process.exit(1);
  }

  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const result = validateTabPaneParents(html);

  if (!result.ok) {
    console.error('Webview HTML structure validation failed:\n');
    console.error(result.error);
    console.error('\nSee docs/WEBVIEW_TAB_DOM_POSTMORTEM.md');
    process.exit(1);
  }

  console.log('✔ webview/index.html div balance OK');
  console.log(`✔ ${REQUIRED_TAB_PANES.length} tab panes are direct children of #status-area`);
  process.exit(0);
}

main();