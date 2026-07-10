/* ============================================================
   CHARACTER PORTRAIT STUDIO — prototype logic (PORTRAIT-STUDIO-001)

   Read-only UX prototype over production-mirroring shapes:
     - characters/<id>.json portrait authority (src/characterManager.ts,
       src/portraitArtifact.ts — versioned name + exact-path verification)
     - TA_MEDIA_RESULT stdout contract (src/mediaArtifactCore.ts)
     - TA_MEDIA_STATUS lifecycle records
       (task/MEDIA-COMFY-001-long-load-lifecycle, read-only)
     - MediaProfile / preflight (src/mediaProfileCore.ts)

   AUTHORITY RULE: the studio only *renders* authority; adoption in this
   prototype mutates an in-memory scenario to demonstrate the interaction.
   In production the host verifies and writes characters/<id>.json; the UI
   never trusts narration.
   ============================================================ */

'use strict';

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function provChip(kind) {
  const map = {
    fact: ['prov prov-fact', '事実', 'ファイル・JSON・ジョブ記録として観測されたもの'],
    heur: ['prov prov-heur', '自動判定', '機械的な推定 — 誤ることがあります'],
    future: ['prov prov-future', '将来機能', '未実装の構想（この試作では紙上デモ）'],
  };
  const [cls, label, title] = map[kind];
  const span = el('span', cls, label);
  span.title = title;
  return span;
}

/* Mirrors src/portraitArtifact.ts ownedName regex (per character id). */
function isVersionedPortraitName(charId, file) {
  return new RegExp(`^${charId}_portrait_[0-9a-f]{16}\\.(png|jpe?g|webp)$`, 'i').test(file);
}

function fmtElapsed(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* ============================================================
   PLACEHOLDER PORTRAITS
   No real images ship with the repo; each candidate renders as a
   deliberate composition sketch so composition problems (three
   subjects, subject-too-small) stay visible and missing files render
   as honest ghosts.
   ============================================================ */

const PALETTES = {
  green: ['#1d2b1f', '#31502f', '#9ec49a'],
  teal: ['#152a2b', '#25514f', '#8fc7c0'],
  amber: ['#2c2113', '#5b4322', '#dcae6b'],
  violet: ['#221a2e', '#453061', '#a98fd4'],
  grey: ['#1d1d1f', '#3a3a40', '#9a9aa4'],
};

function figureSvg(cx, baseY, scale, tone) {
  // simple standing silhouette: head + shoulders + robe
  return `
    <g fill="${tone}" opacity="0.92">
      <circle cx="${cx}" cy="${baseY - 118 * scale}" r="${14 * scale}"/>
      <path d="M ${cx - 20 * scale} ${baseY - 96 * scale}
               Q ${cx} ${baseY - 110 * scale} ${cx + 20 * scale} ${baseY - 96 * scale}
               L ${cx + 26 * scale} ${baseY}
               L ${cx - 26 * scale} ${baseY} Z"/>
    </g>`;
}

function bustSvg(tone) {
  return `
    <g fill="${tone}" opacity="0.92">
      <circle cx="100" cy="112" r="34"/>
      <path d="M 44 232 Q 100 168 156 232 L 156 260 L 44 260 Z"/>
    </g>`;
}

function makePortraitSvg(variant, paletteKey) {
  const [bg1, bg2, tone] = PALETTES[paletteKey] || PALETTES.grey;
  let figures = '';
  switch (variant) {
    case 'fullbody': figures = figureSvg(100, 268, 1.0, tone); break;
    case 'fullbody-alt': figures = figureSvg(96, 272, 1.06, tone) + `<circle cx="146" cy="84" r="20" fill="${tone}" opacity="0.18"/>`; break;
    case 'bust': figures = bustSvg(tone); break;
    case 'three':
      figures = figureSvg(56, 262, 0.78, tone) + figureSvg(104, 270, 0.92, tone) + figureSvg(150, 260, 0.74, tone);
      break;
    case 'tiny': figures = figureSvg(100, 214, 0.34, tone); break;
    default: figures = '';
  }
  return `
    <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ポートレート・プレースホルダー">
      <defs>
        <linearGradient id="pg-${paletteKey}" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="${bg2}"/><stop offset="1" stop-color="${bg1}"/>
        </linearGradient>
      </defs>
      <rect width="200" height="300" fill="url(#pg-${paletteKey})"/>
      <ellipse cx="100" cy="278" rx="70" ry="12" fill="#000" opacity="0.35"/>
      ${figures}
      <rect width="200" height="300" fill="none" stroke="rgba(255,255,255,0.06)"/>
      <text x="190" y="292" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.28)" font-family="monospace">placeholder</text>
    </svg>`;
}

function ghostBlock(state) {
  const map = {
    ORPHANED_JOB: ['◌', '画像は生成されていません', 'ジョブ迷子 — 画像なし'],
    MISSING_FILE: ['⊘', 'ファイルが見つかりません', '記録はあるが実体がない'],
  };
  const [icon, line1, line2] = map[state] || ['？', '不明', ''];
  const wrap = el('div', 'ghost');
  wrap.append(el('span', 'ghost-icon', icon), el('span', null, line1), el('small', null, line2));
  return wrap;
}

/* ============================================================
   STATE
   ============================================================ */

let DATA = null;
let scenarioKey = 'clean';
let selectedIntent = 'portrait_fullbody';
let lastFocusedTrigger = null;
let tickTimer = null;
let tickBaseline = 0;
/* Deep-cloned per selection so prototype adoption doesn't leak across tabs. */
let scn = null;

function selectScenario(key) {
  scenarioKey = key;
  scn = JSON.parse(JSON.stringify(DATA.scenarios[key]));
  buildTabs();
  render();
}

/* ============================================================
   RENDER — header + panels
   ============================================================ */

function render() {
  const c = DATA.character;
  $('char-name').textContent = c.name;
  $('char-role').textContent = c.role;
  $('char-id-chip').textContent = `characters/${c.id}.json`;
  $('authority-json').textContent = `characters/${c.id}.json`;

  renderActive();
  renderJob();
  renderIntent();
  renderCandidates();
}

/* ---------- A. active portrait ---------- */
function renderActive() {
  const a = scn.active;
  const frame = $('active-frame');
  frame.classList.toggle('is-broken', !a.fileOk);
  frame.innerHTML = a.fileOk
    ? makePortraitSvg(a.variant, a.palette)
    : '';
  if (!a.fileOk) frame.append(ghostBlock('MISSING_FILE'));

  const ribbon = el('span', 'active-ribbon', '採用中 — 正');
  frame.append(ribbon);

  $('active-caption').textContent = `characters/${a.file}`;

  const meta = $('active-meta');
  meta.replaceChildren();
  const isVersioned = isVersionedPortraitName(DATA.character.id, a.file);
  const rows = [
    ['採用の形', a.adoption === 'versioned'
      ? '正式採用（版管理ファイル名・採用検証済み）'
      : a.adoption === 'upload'
        ? '手動アップロード（固定ファイル名）'
        : '手動編集（採用検証を経ていない）', 'fact'],
    ['採用日時', a.adoptedAt, 'fact'],
    ['ファイル', a.fileOk ? '検証OK — ワークスペース内に実在' : '見つかりません', 'fact'],
    ['名前規約', isVersioned ? `準拠（${DATA.character.id}_portrait_<16hex>）` : '規約外', 'fact'],
  ];
  for (const [k, v, prov] of rows) {
    const div = el('div');
    const dt = el('dt', null, k);
    const dd = el('dd');
    dd.append(document.createTextNode(v + ' '));
    dd.append(provChip(prov));
    if (k === 'ファイル') dd.classList.add(a.fileOk ? 'meta-ok' : 'meta-warn');
    div.append(dt, dd);
    meta.append(div);
  }

  const note = $('active-note');
  if (a.authorityNote) {
    note.hidden = false;
    note.textContent = `⚠ ${a.authorityNote}`;
  } else {
    note.hidden = true;
  }
}

/* ---------- B. job lifecycle ---------- */

const JOB_WORD = {
  QUEUED: '待機中',
  RUNNING: '生成中',
  COMPLETED: '完了',
  ORPHANED: 'ジョブ迷子',
  TIMED_OUT: '時間切れ',
  QUEUE_REJECTED: 'キュー拒否',
};

function stageRail(job) {
  const rail = el('div', 'stage-rail');
  const isFail = ['ORPHANED', 'TIMED_OUT', 'QUEUE_REJECTED'].includes(job.state);
  const finalLabel = isFail ? JOB_WORD[job.state] : 'COMPLETED';
  const stages = [
    { key: 'QUEUED', label: 'QUEUED' },
    { key: 'RUNNING', label: 'RUNNING' },
    { key: 'FINAL', label: finalLabel },
  ];
  const orderOf = { QUEUED: 0, RUNNING: 1, COMPLETED: 2, ORPHANED: 2, TIMED_OUT: 2, QUEUE_REJECTED: 0 };
  const cur = orderOf[job.state] ?? 0;
  stages.forEach((st, i) => {
    const s = el('span', 'stage');
    s.append(el('span', 'stage-dot'), el('span', null, st.label));
    if (job.state === 'QUEUE_REJECTED') {
      if (i === 0) s.classList.add('is-fail');
    } else if (i < cur) {
      s.classList.add('is-past');
    } else if (i === cur) {
      s.classList.add(job.state === 'COMPLETED' ? 'is-done-final' : isFail ? 'is-fail' : 'is-current');
    }
    rail.append(s);
    if (i < stages.length - 1) rail.append(el('span', 'stage-link'));
  });
  return rail;
}

function renderJob() {
  const wrap = $('job-body');
  wrap.replaceChildren();
  const job = scn.job;
  stopTick();

  if (!job || job.state === 'IDLE') {
    const idle = el('div', 'job-idle');
    idle.append(
      document.createTextNode('実行中のジョブはありません。'),
      el('div', null, '「新しく生成する」から意図を選ぶと、ここにジョブの生涯が表示されます。')
    );
    wrap.append(idle);
    return;
  }

  const card = el('div', 'job-card');
  card.dataset.tone = job.state === 'COMPLETED' ? 'done'
    : (job.state === 'RUNNING' || job.state === 'QUEUED') ? 'running' : 'failed';

  const head = el('div', 'job-headline');
  const word = el('span', `job-state-word ${job.state === 'COMPLETED' ? 's-done' : (job.state === 'RUNNING' || job.state === 'QUEUED') ? 's-running' : 's-failed'}`, JOB_WORD[job.state] || job.state);
  head.append(word, provChip('fact'));
  const elapsedEl = el('span', 'job-elapsed');
  elapsedEl.id = 'job-elapsed';
  elapsedEl.textContent = fmtElapsed(job.elapsedSeconds || 0);
  elapsedEl.append(el('small', null, '経過'));
  if (job.state !== 'QUEUE_REJECTED') head.append(elapsedEl);
  card.append(head, stageRail(job));

  // evidence rows
  const ev = el('div', 'job-evidence');
  const addRow = (k, vNode) => {
    const row = el('div', 'row');
    row.append(el('span', 'k', k), vNode);
    ev.append(row);
  };
  if (job.promptId) {
    const code = el('code', null, job.promptId);
    addRow('prompt ID', code);
  } else if (job.state === 'QUEUE_REJECTED') {
    addRow('prompt ID', el('span', null, 'なし — ComfyUI がキュー登録自体を拒否'));
  }
  if (job.intent) addRow('意図', el('span', null, job.intent));
  if (typeof job.lastObservedSecondsAgo === 'number') {
    const span = el('span');
    span.id = 'job-last-observed';
    span.textContent = `${job.lastObservedSecondsAgo}秒前（${job.lastObservedVia} で確認）`;
    addRow('最終観測', span);
  }
  if (job.jobTimeoutSeconds) {
    const span = el('span');
    span.id = 'job-budget';
    span.textContent = `${fmtElapsed(job.elapsedSeconds)} / 上限 ${fmtElapsed(job.jobTimeoutSeconds)}（COMFYUI_JOB_TIMEOUT）`;
    addRow('打ち切り予算', span);
  }
  card.append(ev);

  // state-specific message boxes
  if (job.state === 'RUNNING' && job.modelLoading) {
    const box = el('div', 'alive-box');
    const strong = el('strong', null, '生きています。再試行しないでください。');
    box.append(strong);
    box.append(el('div', 'sub', '初回のモデル読み込みは6分を超えることがあります。ジョブは ComfyUI 側で生存確認済みです。いま再試行すると同じ画像がもう一枚できます。'));
    card.append(box);
  }
  if (job.state === 'QUEUE_REJECTED') {
    const box = el('div', 'fail-box');
    box.append(el('strong', null, 'キューが即時拒否しました — ジョブはそもそも存在しません。'));
    box.append(el('div', 'sub', `理由: ${job.error || '不明'}`));
    const retry = el('div', 'sub');
    retry.append(el('span', 'retry-ok', '✓ 再試行は安全'), document.createTextNode(' — 実行中のジョブがないため、重複は発生しません。'));
    box.append(retry);
    card.append(box);
  }
  if (job.state === 'ORPHANED' || job.state === 'TIMED_OUT') {
    const box = el('div', 'fail-box');
    box.append(el('strong', null, job.state === 'ORPHANED' ? 'ジョブの行方が確認できなくなりました。' : '総合上限に達したため打ち切りました。'));
    box.append(el('div', 'sub', job.state === 'ORPHANED'
      ? '猶予期間内に /history にも /queue にも現れませんでした。後から画像が現れる可能性は低いですが、再試行の前にComfyUIの状態を確認してください。'
      : 'ComfyUI 側でジョブがまだ動いている可能性があります。すぐに再試行すると重複画像が生まれることがあります。'));
    card.append(box);
  }

  // raw records fold (advanced evidence)
  if ((job.statusHistory && job.statusHistory.length) || job.resultLine) {
    const fold = el('details', 'raw-fold');
    fold.append(el('summary', null, '機械可読レコード（TA_MEDIA_STATUS / TA_MEDIA_RESULT）'));
    const pre = el('pre');
    const lines = (job.statusHistory || []).map((s) =>
      `TA_MEDIA_STATUS {"promptId":"${job.promptId}","state":"${s.state}","elapsedSeconds":${s.elapsedSeconds}}`);
    if (job.resultLine) lines.push(job.resultLine);
    pre.textContent = lines.join('\n');
    fold.append(pre);
    card.append(fold);
  }

  wrap.append(card);

  if (job.liveTick) startTick(job);
}

function startTick(job) {
  tickBaseline = Date.now();
  const base = job.elapsedSeconds || 0;
  const baseObs = job.lastObservedSecondsAgo ?? 0;
  tickTimer = setInterval(() => {
    const dt = Math.floor((Date.now() - tickBaseline) / 1000);
    const elapsedEl = $('job-elapsed');
    if (elapsedEl) {
      elapsedEl.textContent = fmtElapsed(base + dt);
      elapsedEl.append(el('small', null, '経過'));
    }
    const obs = $('job-last-observed');
    if (obs) {
      const cycle = (baseObs + dt) % 15; // prototype: poll every ~15s
      obs.textContent = `${cycle}秒前（${job.lastObservedVia} で確認）`;
    }
    const budget = $('job-budget');
    if (budget && job.jobTimeoutSeconds) {
      budget.textContent = `${fmtElapsed(base + dt)} / 上限 ${fmtElapsed(job.jobTimeoutSeconds)}（COMFYUI_JOB_TIMEOUT）`;
    }
  }, 1000);
}

function stopTick() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

/* ---------- E. generation intent ---------- */
function jobIsAlive() {
  return scn.job && ['QUEUED', 'RUNNING'].includes(scn.job.state);
}

function renderIntent() {
  const wrap = $('intent-cards');
  wrap.replaceChildren();
  for (const intent of DATA.intents) {
    const card = el('button', 'intent-card');
    card.setAttribute('aria-pressed', String(intent.id === selectedIntent));
    card.append(el('div', 'intent-label', intent.label), el('div', 'intent-sub', intent.sub));
    card.addEventListener('click', () => {
      selectedIntent = intent.id;
      renderIntent();
    });
    wrap.append(card);
  }

  const btn = $('generate-btn');
  const guard = $('generate-guard');
  const alive = jobIsAlive();
  btn.disabled = alive;
  guard.classList.toggle('is-ok', !alive);
  if (alive) {
    guard.textContent = '⚠ 実行中のジョブがあります。いま生成すると重複ジョブになり、同じ画像が二枚できます。上のジョブが終わるのを待ってください。';
  } else if (scn.job && scn.job.state === 'QUEUE_REJECTED') {
    guard.textContent = '前回はキュー拒否で終了 — 生きているジョブはないため、再試行しても重複は発生しません。';
  } else {
    guard.textContent = '生きているジョブはありません。生成しても重複は発生しません。';
  }

  const adv = $('advanced-body');
  adv.replaceChildren();
  const plan = DATA.compiledPlan;
  const rows = [
    ['Media Profile', `${plan.profile} `, 'fact'],
    ['グラフ系統', `${plan.graphFamily} `, 'fact'],
    ['プロンプトモード', `${plan.promptMode} `, 'fact'],
    ['既定値', `steps ${plan.defaults.steps} / cfg ${plan.defaults.cfg} / ${plan.defaults.width}×${plan.defaults.height} `, 'fact'],
    ['事前検証', `${plan.preflight} `, 'fact'],
  ];
  for (const [k, v, prov] of rows) {
    const row = el('div', 'row');
    const vs = el('span', null, v);
    vs.append(provChip(prov));
    row.append(el('span', 'k', k), vs);
    adv.append(row);
  }
  const futureRow = el('div', 'row');
  const fv = el('span', null, '意図 → プロファイル → コンパイラ → 検証済みプランの完全な MediaIntent スキーマ ');
  fv.append(provChip('future'));
  futureRow.append(el('span', 'k', '構想'), fv);
  adv.append(futureRow);
}

/* ---------- C. candidates / history ---------- */

const CAND_STATE_LABEL = {
  GENERATED: '生成済み（未採用）',
  ADOPTED: '採用中',
  SUPERSEDED: '旧版',
  ORPHANED_JOB: 'ジョブ迷子',
  MISSING_FILE: 'ファイル欠落',
  ADOPTION_FAILED: '採用失敗',
};

function renderCandidates() {
  const rail = $('cand-rail');
  rail.replaceChildren();

  if (!scn.candidates || scn.candidates.length === 0) {
    rail.append(el('div', 'cand-empty', '候補はまだありません。生成された画像は、採用されるまでここに並びます。'));
  }

  (scn.candidates || []).forEach((cand, idx) => {
    const card = el('article', 'cand-card');
    card.dataset.state = cand.state;

    const img = el('div', 'cand-image');
    if (cand.fileOk) {
      img.innerHTML = makePortraitSvg(cand.variant, cand.palette);
    } else {
      img.append(ghostBlock(cand.state === 'ORPHANED_JOB' ? 'ORPHANED_JOB' : 'MISSING_FILE'));
    }
    const stateChip = el('span', `cand-state st-${cand.state}`, CAND_STATE_LABEL[cand.state] || cand.state);
    img.append(stateChip);
    card.append(img);

    const body = el('div', 'cand-body');
    body.append(el('div', 'cand-file', cand.file));
    body.append(el('div', 'cand-meta', `${cand.createdAt} ・ ${cand.intent}`));

    if (cand.warnings && cand.warnings.length) {
      const warns = el('div', 'cand-warnings');
      for (const w of cand.warnings) {
        const row = el('div', 'cand-warning');
        row.append(provChip(w.kind === 'heuristic' ? 'heur' : 'fact'), document.createTextNode(w.text));
        warns.append(row);
      }
      body.append(warns);
    }
    if (cand.note) body.append(el('div', 'cand-note', cand.note));

    const actions = el('div', 'cand-actions');
    const compareBtn = el('button', 'btn-compare');
    if (cand.adoptable && cand.fileOk) {
      compareBtn.textContent = '比較して採用…';
      compareBtn.addEventListener('click', (e) => openCompare(idx, e.currentTarget));
    } else {
      compareBtn.textContent = '採用できません';
      compareBtn.disabled = true;
      compareBtn.title = cand.fileOk ? '' : '画像の実体がないため採用対象になりません';
    }
    actions.append(compareBtn);
    body.append(actions);
    card.append(body);
    rail.append(card);
  });

  // older history folds — anti-sludge strategy for 20+ items
  const older = $('older-history');
  older.replaceChildren();
  for (const fold of scn.olderHistory || []) {
    const d = el('details', 'older-fold');
    const summary = el('summary');
    summary.append(
      el('span', null, fold.batch),
      el('span', 'older-count', `${fold.count}枚`)
    );
    d.append(summary);
    const strip = el('div', 'older-strip');
    for (let i = 0; i < Math.min(fold.count, 12); i++) {
      strip.append(el('div', 'older-thumb', '▦'));
    }
    if (fold.count > 12) strip.append(el('div', 'older-thumb', `+${fold.count - 12}`));
    d.append(strip);
    const states = Object.entries(fold.states).map(([k, v]) => `${CAND_STATE_LABEL[k] || k}: ${v}`).join(' / ');
    d.append(el('div', 'older-note', `${states} — 古い世代は束で畳まれます。開かない限り読み込まれません。`));
    older.append(d);
  }
}

/* ---------- D. comparison / adoption ---------- */

let compareIdx = -1;

function openCompare(idx, trigger) {
  compareIdx = idx;
  lastFocusedTrigger = trigger;
  const cand = scn.candidates[idx];
  const active = scn.active;

  const pair = $('compare-pair');
  pair.replaceChildren();

  const cur = el('div', 'compare-side side-current');
  cur.append(el('div', 'side-label', 'いまの正 — 採用中'));
  const curImg = el('div', 'compare-img');
  curImg.innerHTML = active.fileOk ? makePortraitSvg(active.variant, active.palette) : '';
  if (!active.fileOk) curImg.append(ghostBlock('MISSING_FILE'));
  cur.append(curImg, el('div', 'compare-file', `characters/${active.file}`));

  const arrow = el('div', 'compare-arrow', '→');
  arrow.setAttribute('aria-hidden', 'true');

  const next = el('div', 'compare-side');
  next.append(el('div', 'side-label', '候補 — 採用するとこうなる'));
  const nextImg = el('div', 'compare-img');
  nextImg.innerHTML = makePortraitSvg(cand.variant, cand.palette);
  next.append(nextImg, el('div', 'compare-file', `characters/${cand.file}`));

  pair.append(cur, arrow, next);

  const list = $('adoption-effects-list');
  list.replaceChildren();
  for (const effect of DATA.adoptionEffects) {
    list.append(el('li', null, effect));
  }

  $('compare-modal').hidden = false;
  $('modal-scrim').hidden = false;
  $('modal-close').focus();
}

function closeCompare() {
  $('compare-modal').hidden = true;
  $('modal-scrim').hidden = true;
  compareIdx = -1;
  if (lastFocusedTrigger && document.contains(lastFocusedTrigger)) lastFocusedTrigger.focus();
}

function confirmAdoption() {
  if (compareIdx < 0) return;
  const cand = scn.candidates[compareIdx];
  const prevActive = scn.active;

  // previous active joins history as SUPERSEDED (file untouched)
  scn.candidates.unshift({
    file: prevActive.file,
    state: 'SUPERSEDED',
    createdAt: prevActive.adoptedAt,
    supersededAt: 'たったいま',
    intent: '（直前まで採用中だった肖像）',
    variant: prevActive.variant,
    palette: prevActive.palette,
    fileOk: prevActive.fileOk,
    adoptable: prevActive.fileOk,
    note: '採用解除 — ファイルは削除されていません',
    warnings: [],
  });

  // candidate becomes the authoritative portrait
  scn.active = {
    file: cand.file,
    adoption: isVersionedPortraitName(DATA.character.id, cand.file) ? 'versioned' : 'manual',
    adoptedAt: 'たったいま（この試作内での操作）',
    fileOk: true,
    variant: cand.variant,
    palette: cand.palette,
    authorityNote: isVersionedPortraitName(DATA.character.id, cand.file)
      ? undefined
      : 'このファイル名は版管理規約の外にあります。採用は有効ですが、再生成時のキャッシュ問題を避けるには版管理名への移行を推奨します。',
  };

  // remove adopted candidate from list (index shifted by unshift)
  scn.candidates.splice(compareIdx + 1, 1);

  closeCompare();
  render();
  toast('採用しました — characters/lisette.json の portrait 参照がこの画像に切り替わりました（試作内のシミュレーション。実装ではホストが検証後に書き込みます）');
}

function toast(text) {
  const t = el('div', 'toast', text);
  document.body.append(t);
  setTimeout(() => t.remove(), 5200);
}

/* ============================================================
   SCENARIO TABS + global keyboard
   ============================================================ */

function buildTabs() {
  const tablist = $('scenario-tablist');
  tablist.replaceChildren();
  const keys = Object.keys(DATA.scenarios);
  keys.forEach((key) => {
    const sc = DATA.scenarios[key];
    const tab = el('button', 'scenario-tab', sc.label);
    tab.setAttribute('role', 'tab');
    tab.id = `tab-${key}`;
    tab.title = `${sc.sublabel} — ${sc.description}`;
    tab.setAttribute('aria-selected', String(key === scenarioKey));
    tab.tabIndex = key === scenarioKey ? 0 : -1;
    tab.addEventListener('click', () => selectScenario(key));
    tab.addEventListener('keydown', (e) => {
      const idx = keys.indexOf(key);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = keys[(idx + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
        selectScenario(next);
        document.getElementById(`tab-${next}`).focus();
      }
    });
    tablist.append(tab);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('compare-modal').hidden) closeCompare();
});

/* ============================================================
   BOOT
   ============================================================ */

$('modal-close').addEventListener('click', closeCompare);
$('modal-scrim').addEventListener('click', closeCompare);
$('adopt-cancel').addEventListener('click', closeCompare);
$('adopt-confirm').addEventListener('click', confirmAdoption);
$('legend-toggle').addEventListener('click', () => {
  const legend = $('prov-legend');
  const open = legend.hidden;
  legend.hidden = !open;
  $('legend-toggle').setAttribute('aria-expanded', String(open));
});
$('generate-btn').addEventListener('click', () => {
  toast('（試作）生成はモックです。実装では MediaIntent がプロファイルへコンパイルされ、検証済みプランだけが ComfyUI に届きます。');
});

fetch('sample-data.json')
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then((json) => {
    DATA = json;
    const requested = new URLSearchParams(location.search).get('scenario');
    selectScenario(requested && json.scenarios[requested] ? requested : 'clean');
  })
  .catch((err) => {
    console.error('Portrait Studio prototype: failed to load sample-data.json', err);
    $('load-error').hidden = false;
    document.querySelector('main').hidden = true;
  });
