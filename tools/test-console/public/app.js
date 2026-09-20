'use strict';

const $ = (id) => document.getElementById(id);
let lastState = null;

async function api(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}

function text(value) { return value == null ? 'unavailable' : String(value); }
function escape(value) { const node = document.createElement('span'); node.textContent = text(value); return node.innerHTML; }

function render(state) {
  lastState = state;
  $('status').textContent = state.status;
  $('run').disabled = !state.plan || state.status === 'running' || state.status === 'planning';
  $('stop').disabled = state.status !== 'running';
  $('plan').disabled = state.status === 'running' || state.status === 'planning';
  $('error').classList.toggle('hidden', !state.error);
  $('error').textContent = state.error || '';
  if (!state.plan) return;
  const p = state.plan;
  $('identity').innerHTML = [['Repository',p.repositoryRoot],['Branch',p.branch],['Base',p.baseSha],['Head',p.headSha],['Version',p.version]].map(([k,v]) => `<div class="panel"><b>${k}</b><br><code>${escape(v)}</code></div>`).join('');
  const warnings = [];
  if (!p.complete) warnings.push(`<b>INCOMPLETE PLAN — unknown files fail closed and force the full suite.</b>`);
  if (p.unknownFiles.length) warnings.push(p.unknownFiles.map(escape).join('<br>'));
  $('warning').classList.toggle('hidden', warnings.length === 0); $('warning').innerHTML = warnings.join('<hr>');
  $('files').innerHTML = p.changedFiles.length ? p.changedFiles.map((file) => `<div class="item"><code>${escape(file)}</code></div>`).join('') : '<span class="muted">No changed files.</span>';
  $('commands').innerHTML = p.selectedCommands.length ? p.selectedCommands.map((cmd) => `<div class="item"><b>${escape(cmd.id)}</b> <small>${escape(cmd.command)} · ${escape(cmd.category)} · ${escape(cmd.phase)}${cmd.exclusiveGroup ? ` · exclusive: ${escape(cmd.exclusiveGroup)}` : ''}</small>${cmd.reasons.map((r) => `<small>Reason: ${escape(r)}</small>`).join('')}</div>`).join('') : '<span class="muted">No commands selected.</span>';
  const f = state.preflight || {};
  $('preflight').innerHTML = Object.entries(f).map(([key,value]) => `<div class="fact"><b>${escape(key)}</b><br>${escape(Array.isArray(value) ? value.join(', ') : value)}</div>`).join('');
  const progress = state.progress || {completed:0,total:0,current:[]};
  $('bar').style.width = `${progress.total ? Math.round(progress.completed / progress.total * 100) : 0}%`;
  $('progress').textContent = `${progress.completed}/${progress.total} complete${progress.current.length ? ` · running: ${progress.current.join(', ')}` : ''}`;
  const counts = state.counts || {passed:0,failed:0,skipped:0};
  const duration = state.startedAt ? Math.max(0, Math.round(((state.results ? Date.parse(state.results.endedAt) : Date.now()) - Date.parse(state.startedAt)) / 1000)) : 0;
  $('counts').textContent = `Passed ${counts.passed} · Failed ${counts.failed} · Skipped ${counts.skipped} · Duration ${duration}s`;
  const logs = state.logs || {};
  $('logs').innerHTML = Object.keys(logs).length ? Object.entries(logs).map(([id,log]) => `<details class="log" open><summary>${escape(id)}</summary><pre>${escape(log.stdout)}${log.stderr ? `\n[stderr]\n${escape(log.stderr)}` : ''}</pre></details>`).join('') : '<span class="muted">Output appears while commands run.</span>';
  $('human').textContent = `${p.humanSmoke.status.replaceAll('_',' ')}. Automated execution never marks real VS Code smoke complete.${p.humanSmoke.checklist.length ? ` Pending: ${p.humanSmoke.checklist.join('; ')}.` : ''}`;
  if (state.results) {
    const relative = state.results.runDirectory.replace(p.repositoryRoot, '').replace(/^[/\\]+/, '').replace(/\\/g, '/');
    $('artifacts').innerHTML = ['index.html','plan.json','results.json','summary.md'].map((file) => `<a target="_blank" href="/runs/${escape(relative.replace(/^\.test-runs\//,''))}/${file}">${file}</a>`).join(' · ');
  }
}

async function refresh() {
  try { const response = await fetch('/api/state', { cache: 'no-store' }); render(await response.json()); }
  catch (error) { $('error').textContent = error.message; $('error').classList.remove('hidden'); }
}

$('plan').addEventListener('click', async () => {
  try { await api('/api/plan', { base: $('base').value, head: $('head').value, mode: $('mode').value, concurrency: $('concurrency').value }); await refresh(); }
  catch (error) { alert(error.message); }
});
$('run').addEventListener('click', async () => {
  const repeatReason = $('repeat').value.trim();
  try { await api('/api/run', { concurrency: $('concurrency').value, allowRepeatFullSuite: Boolean(repeatReason), repeatReason }); await refresh(); }
  catch (error) { alert(error.message); }
});
$('stop').addEventListener('click', async () => { await api('/api/stop'); await refresh(); });
setInterval(refresh, 600); refresh();
