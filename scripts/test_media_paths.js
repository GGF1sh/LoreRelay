#!/usr/bin/env node
/**
 * Media path allowlist tests (v0.4 hardening).
 * Run after compile: node scripts/test_media_paths.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveAllowedImagePath, ALLOWED_IMAGE_EXTENSIONS } = require('../out/mediaPathCore');

let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-media-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

withTempDir((root) => {
  const png = path.join(root, 'scene.png');
  fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const allowed = resolveAllowedImagePath(png, [root]);
  if (allowed !== fs.realpathSync(png)) {
    fail('allows png under workspace root');
  } else {
    ok('allows png under workspace root');
  }

  const txt = path.join(root, 'secret.txt');
  fs.writeFileSync(txt, 'nope');
  if (resolveAllowedImagePath(txt, [root]) !== undefined) {
    fail('rejects non-image extension');
  } else {
    ok('rejects non-image extension');
  }

  const outside = path.join(path.dirname(root), 'outside.png');
  fs.writeFileSync(outside, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  try {
    if (resolveAllowedImagePath(outside, [root]) !== undefined) {
      fail('rejects path outside workspace');
    } else {
      ok('rejects path outside workspace');
    }
  } finally {
    fs.unlinkSync(outside);
  }

  const sub = path.join(root, 'assets');
  fs.mkdirSync(sub);
  const nested = path.join(sub, 'bg.webp');
  fs.writeFileSync(nested, 'RIFF');
  if (!resolveAllowedImagePath(nested, [root])) {
    fail('allows nested image');
  } else {
    ok('allows nested image');
  }
});

if (process.platform !== 'win32') {
  withTempDir((root) => {
    const target = path.join(root, 'real.png');
    fs.writeFileSync(target, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const link = path.join(root, 'link.png');
    fs.symlinkSync(target, link);
    if (resolveAllowedImagePath(link, [root]) !== undefined) {
      fail('rejects symlink');
    } else {
      ok('rejects symlink');
    }
  });
} else {
  ok('symlink rejection skipped on Windows (platform)');
}

if (ALLOWED_IMAGE_EXTENSIONS.size !== 5) {
  fail('expected 5 allowed extensions');
} else {
  ok('allowed extension set');
}

if (failed > 0) {
  process.exit(1);
}
console.log('All media path tests passed.');