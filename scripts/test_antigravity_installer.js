#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'test_antigravity_installer.ps1');
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const result = spawnSync(powershell, [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath
], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
});

if (result.stdout) {
    process.stdout.write(result.stdout);
}
if (result.stderr) {
    process.stderr.write(result.stderr);
}

process.exit(result.status === null ? 1 : result.status);
