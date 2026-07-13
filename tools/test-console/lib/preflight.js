'use strict';

const fs = require('fs');
const path = require('path');
const { run } = require('./planner');

function version(command, args, root) {
    const result = run(command, args, { cwd: root, allowFailure: true });
    if (result.error || result.status !== 0) return null;
    return (result.stdout || result.stderr).trim().split(/\r?\n/)[0] || null;
}

function collectPreflight(plan) {
    const root = plan.repositoryRoot;
    const ps = run('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString(); $env:PSModulePath'], { cwd: root, allowFailure: true });
    const psLines = ps.status === 0 ? ps.stdout.trim().split(/\r?\n/) : [];
    const disk = run('powershell.exe', ['-NoProfile', '-Command', '[math]::Round((Get-PSDrive -Name C).Free / 1GB, 2)'], { cwd: root, allowFailure: true });
    const generatedStatus = run('git', ['status', '--porcelain=v1', '--', 'webview/app.js', 'webview/styles', 'docs/generated', 'src/generated'], { cwd: root, allowFailure: true }).stdout.trim();
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    let python = version('python', ['--version'], root);
    if (!python) python = version('python3', ['--version'], root);
    return {
        repositoryRoot: root,
        branch: plan.branch,
        baseSha: plan.baseSha,
        headSha: plan.headSha,
        version: plan.version,
        dirty: plan.dirty,
        dirtyDiffHash: plan.dirtyDiffHash,
        diskCFreeGiB: disk.status === 0 ? Number(disk.stdout.trim()) : null,
        nodeVersion: process.version,
        npmVersion: version(npmCommand, ['--version'], root),
        pythonVersion: python,
        gitVersion: version('git', ['--version'], root),
        powershellVersion: psLines[0] || null,
        psModulePath: psLines.slice(1).join('\n') || process.env.PSModulePath || null,
        nodeModulesPresent: fs.existsSync(path.join(root, 'node_modules')),
        generatedFilesDirty: Boolean(generatedStatus),
        generatedDirtyDetails: generatedStatus ? generatedStatus.split(/\r?\n/) : [],
        collectedAt: new Date().toISOString(),
    };
}

module.exports = { collectPreflight };
