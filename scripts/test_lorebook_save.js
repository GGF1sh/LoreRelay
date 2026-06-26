#!/usr/bin/env node
/**
 * Lorebook save validation tests (v0.5c).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

// Minimal inline validation mirroring lorebookLoader (no vscode dep)
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function validate(entries) {
  const errors = [];
  const seen = new Set();
  for (const e of entries) {
    if (!ID_PATTERN.test(e.id)) {
      errors.push(`bad id ${e.id}`);
    }
    if (seen.has(e.id)) {
      errors.push(`dup ${e.id}`);
    }
    seen.add(e.id);
    if (e.enabled && !String(e.content || '').trim()) {
      errors.push('content');
    }
    if (e.enabled && (!e.keys || e.keys.length === 0)) {
      errors.push('keys');
    }
  }
  return errors;
}

const good = [{ id: 'tavern', label: 'Tavern', content: 'An inn.', keys: ['inn'], enabled: true }];
if (validate(good).length !== 0) {
  fail('valid entry rejected');
} else {
  ok('valid entry accepted');
}

if (validate([{ id: 'bad id!', label: 'x', content: 'y', keys: ['a'], enabled: true }]).length === 0) {
  fail('invalid id accepted');
} else {
  ok('invalid id rejected');
}

if (validate([{ id: 'e1', label: 'x', content: '', keys: ['k'], enabled: true }]).length === 0) {
  fail('empty content accepted for enabled');
} else {
  ok('empty content rejected for enabled');
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-lore-'));
try {
  const out = path.join(dir, 'lorebook.json');
  const payload = {
    format: 'text-adventure-lorebook/1.0',
    source: 'test',
    entries: [{ id: 'e1', keys: ['dragon'], content: 'A dragon.', comment: 'Dragon', enabled: true }]
  };
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  const parsed = JSON.parse(fs.readFileSync(out, 'utf-8'));
  if (!parsed.entries || parsed.entries[0].content !== 'A dragon.') {
    fail('round-trip write');
  } else {
    ok('round-trip write');
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

if (failed > 0) {
  process.exit(1);
}
console.log('All lorebook save tests passed.');