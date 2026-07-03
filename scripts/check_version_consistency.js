#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`package.json version invalid: ${version}`);
} else {
    ok(`package.json version ${version}`);
}

const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    if (lock.version !== version) {
        fail(`package-lock.json version ${lock.version} !== package.json ${version}`);
    } else {
        ok('package-lock.json root version matches');
    }
    const pkgEntry = lock.packages?.[''];
    if (pkgEntry && pkgEntry.version !== version) {
        fail(`package-lock.json packages[\"\"].version ${pkgEntry.version} !== ${version}`);
    } else if (pkgEntry) {
        ok('package-lock.json packages[""] version matches');
    }
}

const readmeFiles = [
    'README.md',
    'README_en.md',
    'README_zh-CN.md',
    'README_zh-TW.md',
];
const badgePattern = /version-(\d+\.\d+\.\d+)-blue/;
for (const file of readmeFiles) {
    const text = fs.readFileSync(path.join(root, file), 'utf-8');
    const match = text.match(badgePattern);
    if (!match) {
        fail(`${file} missing version badge`);
    } else if (match[1] !== version) {
        fail(`${file} badge ${match[1]} !== package.json ${version}`);
    } else {
        ok(`${file} badge matches`);
    }
}

const versionTruth = fs.readFileSync(path.join(root, 'docs', 'VERSION_TRUTH.md'), 'utf-8');
const truthMatch = versionTruth.match(/\| `package\.json` \| \*\*(\d+\.\d+\.\d+)\*\* \|/);
if (!truthMatch) {
    fail('VERSION_TRUTH.md missing package.json row');
} else if (truthMatch[1] !== version) {
    fail(`VERSION_TRUTH.md package.json ${truthMatch[1]} !== ${version}`);
} else {
    ok('VERSION_TRUTH.md package.json row matches');
}

const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8');
const firstRelease = changelog.match(/## \[Unreleased\][\s\S]*?\n## \[(\d+\.\d+\.\d+)\]/);
if (!firstRelease) {
    fail('CHANGELOG.md missing first release section after [Unreleased]');
} else if (firstRelease[1] !== version) {
    fail(`CHANGELOG.md first release [${firstRelease[1]}] !== package.json ${version}`);
} else {
    ok('CHANGELOG.md first release matches');
}

if (failed > 0) {
    process.exit(1);
}
console.log('All version consistency checks passed.');