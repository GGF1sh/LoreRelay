#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'test_cartography_path_utils.py');
const python = process.platform === 'win32' ? 'python' : 'python3';
const proc = spawnSync(python, [script], { encoding: 'utf-8', timeout: 30000 });

if (proc.stdout) {
    process.stdout.write(proc.stdout);
}
if (proc.stderr) {
    process.stderr.write(proc.stderr);
}

process.exit(proc.status === 0 ? 0 : 1);