#!/usr/bin/env node
/**
 * Fail if any tracked text/markdown file is not valid UTF-8 (no BOM).
 * Run: node scripts/validate_utf8_docs.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  '.vscode-test',
  'sample-scenarios',
]);
const EXTENSIONS = new Set([
  '.md',
  '.ts',
  '.js',
  '.json',
  '.py',
  '.html',
  '.css',
  '.svg',
  '.yml',
  '.yaml',
  '.txt',
  '.bat',
  '.sh',
]);

/** @param {string} dir */
function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    const ext = path.extname(name).toLowerCase();
    if (!EXTENSIONS.has(ext)) continue;
    out.push(full);
  }
}

const files = [];
walk(ROOT, files);

let failed = 0;
for (const file of files) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    console.error(`UTF-8 BOM: ${path.relative(ROOT, file)}`);
    failed++;
    continue;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (e) {
    console.error(`Invalid UTF-8: ${path.relative(ROOT, file)}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`validate_utf8_docs: ${failed} file(s) failed`);
  process.exit(1);
}

console.log(`validate_utf8_docs: OK (${files.length} files)`);