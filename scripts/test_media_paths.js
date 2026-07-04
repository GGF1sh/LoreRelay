#!/usr/bin/env node
/**
 * Media path allowlist tests (v0.4 hardening).
 * Run after compile: node scripts/test_media_paths.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  resolveAllowedImagePath,
  isAllowedImagePath,
  getImageMimeType,
  ALLOWED_IMAGE_EXTENSIONS,
  relativizePathUnderRoot,
  joinPathUnderRoot,
  WEBVIEW_SKILL_MEDIA_PREFIX,
} = require('../out/mediaPathCore');

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

if (getImageMimeType('scene.png') !== 'image/png' || getImageMimeType('x.bmp') !== undefined) {
  fail('getImageMimeType');
} else {
  ok('getImageMimeType');
}

withTempDir((root) => {
  const missing = path.join(root, 'ghost.png');
  if (resolveAllowedImagePath(missing, [root]) !== undefined) {
    fail('rejects missing file');
  } else {
    ok('rejects missing file');
  }

  const dir = path.join(root, 'not-a-file.png');
  fs.mkdirSync(dir);
  if (resolveAllowedImagePath(dir, [root]) !== undefined) {
    fail('rejects directory path');
  } else {
    ok('rejects directory path');
  }

  const png = path.join(root, 'ok.png');
  fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (!isAllowedImagePath(png, [root])) {
    fail('isAllowedImagePath true for valid png');
  } else {
    ok('isAllowedImagePath true for valid png');
  }
});

withTempDir((root) => {
  const nested = path.join(root, 'output', 'scene.png');
  fs.mkdirSync(path.dirname(nested), { recursive: true });
  fs.writeFileSync(nested, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const resolved = resolveAllowedImagePath(nested, [root]);
  const rel = relativizePathUnderRoot(resolved, root);
  if (rel !== 'output/scene.png') {
    fail(`relativizePathUnderRoot expected output/scene.png got ${rel}`);
  } else {
    ok('relativizePathUnderRoot nested path');
  }
  const joined = joinPathUnderRoot(root, rel);
  if (!joined || resolveAllowedImagePath(joined, [root]) !== resolved) {
    fail('joinPathUnderRoot round-trip');
  } else {
    ok('joinPathUnderRoot round-trip');
  }
  if (joinPathUnderRoot(root, '../outside.png') !== undefined) {
    fail('joinPathUnderRoot rejects traversal');
  } else {
    ok('joinPathUnderRoot rejects traversal');
  }
});

if (WEBVIEW_SKILL_MEDIA_PREFIX !== 'skill:') {
  fail('WEBVIEW_SKILL_MEDIA_PREFIX');
} else {
  ok('WEBVIEW_SKILL_MEDIA_PREFIX');
}

if (failed > 0) {
  process.exit(1);
}
console.log('All media path tests passed.');