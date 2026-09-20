'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
    }
    return value;
}

function hashFile(file) {
    return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
}

function fingerprint(plan, preflight) {
    const material = {
        baseSha: plan.baseSha,
        headSha: plan.headSha,
        dirtyDiffHash: plan.dirtyDiffHash,
        selectedCommands: plan.selectedCommands.map((command) => ({
            id: command.id,
            executable: command.executable,
            args: command.args,
            timeoutMs: command.timeoutMs,
            exclusiveGroup: command.exclusiveGroup,
            workspaceWriter: Boolean(command.workspaceWriter),
            phase: command.phase,
        })),
        packageLockHash: hashFile(path.join(plan.repositoryRoot, 'package-lock.json')),
        toolVersions: {
            node: preflight.nodeVersion,
            npm: preflight.npmVersion,
            python: preflight.pythonVersion,
            git: preflight.gitVersion,
            powershell: preflight.powershellVersion,
        },
    };
    return crypto.createHash('sha256').update(JSON.stringify(stable(material))).digest('hex');
}

function aiSummary(plan, results) {
    const passed = results.commands.filter((item) => item.status === 'PASS' || item.status === 'REUSED_PASS').length;
    const failed = results.commands.filter((item) => item.status === 'FAIL' || item.status === 'TIMEOUT').length;
    const focused = results.commands.filter((item) => item.phase === 'focused');
    const focusedPassed = focused.filter((item) => item.status === 'PASS' || item.status === 'REUSED_PASS').length;
    const full = results.commands.find((item) => item.id === 'full-suite');
    const marker = failed === 0 && !results.cancelled ? 'TEST_RUN_PASS' : results.cancelled ? 'TEST_RUN_CANCELLED' : 'TEST_RUN_FAIL';
    return [
        marker,
        '',
        `Base: ${plan.baseSha}`,
        `Target: ${plan.headSha}`,
        `Version: ${plan.version}`,
        `Fingerprint: ${results.fingerprint}`,
        `Changed files: ${plan.changedFiles.length}`,
        `Focused: ${focusedPassed}/${focused.length}`,
        `Full suite: ${full ? full.status : 'not required'}`,
        `Unknown files: ${plan.unknownFiles.length}`,
        'Human smoke: not performed',
        `Results: ${passed} passed, ${failed} failed, ${results.commands.filter((item) => item.status === 'SKIPPED').length} skipped; ${results.runDirectory}`,
    ].join('\n');
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderHtml(plan, preflight, results) {
    const rows = results.commands.map((item) => {
        const stdout = item.stdoutLog && fs.existsSync(item.stdoutLog) ? fs.readFileSync(item.stdoutLog, 'utf8') : '';
        const stderr = item.stderrLog && fs.existsSync(item.stderrLog) ? fs.readFileSync(item.stderrLog, 'utf8') : '';
        return `<details class="result ${escapeHtml(item.status.toLowerCase())}"><summary><b>${escapeHtml(item.status)}</b> ${escapeHtml(item.command)} <span>${escapeHtml(item.durationMs)} ms</span></summary><p>${escapeHtml(item.reasons.join(' | '))}</p><h4>stdout</h4><pre>${escapeHtml(stdout)}</pre><h4>stderr</h4><pre>${escapeHtml(stderr)}</pre></details>`;
    }).join('\n');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LoreRelay Test Run</title><style>
body{font:14px system-ui;margin:0;background:#10151d;color:#dbe5f0}main{max-width:1100px;margin:auto;padding:24px}h1{font-size:22px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}.card,details{background:#18212d;border:1px solid #344357;border-radius:7px;padding:12px;margin:8px 0}.warn{border-color:#c68a2c;color:#ffd38b}.pass summary b,.reused_pass summary b{color:#5ee09b}.fail summary b,.timeout summary b{color:#ff7785}summary{cursor:pointer}summary span{float:right;color:#91a3b8}pre{white-space:pre-wrap;max-height:420px;overflow:auto;background:#0b1016;padding:10px}code{overflow-wrap:anywhere}</style></head><body><main>
<h1>LoreRelay Test Console — completed run</h1><div class="grid"><div class="card"><b>Mode</b><br>${escapeHtml(plan.mode)}</div><div class="card"><b>Version</b><br>${escapeHtml(plan.version)}</div><div class="card"><b>Base</b><br><code>${escapeHtml(plan.baseSha)}</code></div><div class="card"><b>Target</b><br><code>${escapeHtml(plan.headSha)}</code></div></div>
${plan.unknownFiles.length ? `<div class="card warn"><b>Unknown files (fail closed)</b><br>${plan.unknownFiles.map(escapeHtml).join('<br>')}</div>` : ''}
<div class="card"><b>Fingerprint</b><br><code>${escapeHtml(results.fingerprint)}</code><br><b>Human smoke:</b> NOT PERFORMED</div>
<h2>Preflight</h2><pre>${escapeHtml(JSON.stringify(preflight, null, 2))}</pre><h2>Results</h2>${rows}<h2>AI-readable summary</h2><pre>${escapeHtml(aiSummary(plan, results))}</pre></main></body></html>`;
}

function writeArtifacts(runDirectory, plan, preflight, results) {
    results.runDirectory = runDirectory;
    fs.writeFileSync(path.join(runDirectory, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
    fs.writeFileSync(path.join(runDirectory, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
    const summary = aiSummary(plan, results);
    fs.writeFileSync(path.join(runDirectory, 'summary.md'), `# LoreRelay test result\n\n\`\`\`text\n${summary}\n\`\`\`\n`);
    fs.writeFileSync(path.join(runDirectory, 'index.html'), renderHtml(plan, preflight, results));
    return summary;
}

module.exports = { aiSummary, fingerprint, renderHtml, stable, writeArtifacts };
