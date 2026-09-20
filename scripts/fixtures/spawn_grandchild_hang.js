#!/usr/bin/env node
'use strict';

/** Fixture: child process that spawns a hung grandchild (for spawnWithTimeout tree-kill tests). */
const { spawn } = require('child_process');

const grandchild = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1e9)'], {
    stdio: 'ignore',
    windowsHide: true,
});
grandchild.unref();
process.stdout.write(`GRANDCHILD_PID=${grandchild.pid}\n`);
setInterval(() => {}, 1e9);