/* ============================================================
   暮らす — NOAI-PLAY-001 prototype behavior.
   No production integration: everything renders from
   sample-data.json into an in-memory scenario state.
   The "engine" here only replays prebaked deterministic
   results — it never invents numbers the data does not carry.
   ============================================================ */
'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  let DATA = null;
  let S = null;            // active scenario (deep copy, mutable)
  let planSelection = [];  // week/month cadence selection
  let lastFocused = null;  // focus restore for sheets
  let pendingAction = null;
  let pendingReceipt = null;
  let toastTimer = null;

  /* ---------- calendar ---------- */
  const MONTH_DAYS = 30; // mirrors domainCore DEFAULT_DOMAIN_MONTH_DAYS
  const seasonOfMonth = (m) => ['春', '夏', '秋', '冬'][Math.floor(((m - 1) % 12) / 3)];
  function calendarLabel(turn, cadence) {
    const month = Math.floor((turn - 1) / MONTH_DAYS) + 1;
    const day = ((turn - 1) % MONTH_DAYS) + 1;
    if (cadence === 'week') {
      const week = Math.floor((turn - 1) / 7) + 1;
      return `第${week}週(${seasonOfMonth(month)}) ・ ${turn}刻目`;
    }
    if (cadence === 'month') {
      return `第${month}月(${seasonOfMonth(month)}) ・ ${turn}刻目`;
    }
    return `第${month}月${day}日(${seasonOfMonth(month)}) ・ ${turn}刻目`;
  }

  /* ---------- toast ---------- */
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
  }

  /* ---------- provenance legend ---------- */
  function renderLegend() {
    const dl = $('legend-list');
    dl.innerHTML = '';
    const order = ['fact', 'estimate', 'unknown', 'narration', 'canon'];
    for (const key of order) {
      const v = DATA.vocabulary.provenance[key];
      const row = el('div');
      const dt = el('dt');
      dt.appendChild(provChip(key));
      const dd = el('dd', null, v.desc);
      row.appendChild(dt); row.appendChild(dd);
      dl.appendChild(row);
    }
  }
  function provChip(kind) {
    const map = { fact: 'prov-fact', estimate: 'prov-estimate', unknown: 'prov-unknown', narration: 'prov-narration', canon: 'prov-canon' };
    return el('span', `prov ${map[kind]}`, DATA.vocabulary.provenance[kind].label);
  }

  /* ---------- scenario tabs ---------- */
  function renderTabs() {
    const list = $('scenario-tablist');
    list.innerHTML = '';
    DATA.scenarios.forEach((sc, i) => {
      const b = el('button', 'scenario-tab', sc.label);
      b.type = 'button';
      b.role = 'tab';
      b.id = `tab-${sc.id}`;
      b.setAttribute('aria-selected', S && S.id === sc.id ? 'true' : 'false');
      b.tabIndex = (S ? S.id === sc.id : i === 0) ? 0 : -1;
      b.addEventListener('click', () => selectScenario(sc.id));
      b.addEventListener('keydown', (e) => {
        const tabs = [...list.querySelectorAll('.scenario-tab')];
        const idx = tabs.indexOf(e.currentTarget);
        let next = -1;
        if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
        if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
        if (next >= 0) { e.preventDefault(); tabs[next].focus(); tabs[next].click(); }
      });
      list.appendChild(b);
    });
  }

  function selectScenario(id) {
    const src = DATA.scenarios.find((s) => s.id === id) || DATA.scenarios[0];
    S = JSON.parse(JSON.stringify(src));
    planSelection = [];
    location.hash = `scenario=${S.id}`;
    document.body.dataset.tension = S.tension || 'calm';
    document.body.dataset.cadence = S.cadence;
    renderTabs();
    renderAll();
    closeAllSheets();
  }

  /* ---------- header ---------- */
  function slotsRemaining() {
    if (!S.slots) return Infinity;
    return S.slots.labels.length - S.slots.used;
  }
  function currentSlotLabel() {
    if (!S.slots) return '';
    return S.slots.labels[Math.min(S.slots.used, S.slots.labels.length - 1)];
  }
  function renderHeader() {
    $('player-name').textContent = S.player.name;
    $('role-chip').textContent = S.player.roleLabel;
    $('role-glyph').textContent = S.player.roleLabel.slice(0, 1);
    $('player-epithet').textContent = S.player.epithet;
    $('strip-place').textContent = DATA.world.locations[S.player.locationId] || S.player.locationId;
    $('strip-date').textContent = calendarLabel(S.worldTurn, S.cadence);
    $('tension-word').textContent = { calm: '静穏', stirring: 'ざわめき', crisis: '緊迫' }[S.tension] || '静穏';

    const slotsItem = $('strip-slots-item');
    if (S.slots) {
      slotsItem.hidden = false;
      $('strip-slots-label').textContent = '今日の刻';
      const dots = S.slots.labels.map((lb, i) =>
        `<span class="${i < S.slots.used ? 'spent' : ''}" title="${lb}">${i < S.slots.used ? '○' : '●'}</span>`).join('');
      $('strip-slots').innerHTML = `<span class="slot-dots">${dots}</span> <span class="sub">残り${slotsRemaining()}刻</span>`;
    } else if (S.actionsBudget) {
      slotsItem.hidden = false;
      $('strip-slots-label').textContent = S.cadence === 'week' ? '今週の手' : '今月の手';
      $('strip-slots').innerHTML = `<span class="slot-dots">${'●'.repeat(S.actionsBudget.remaining)}${'○'.repeat(S.actionsBudget.total - S.actionsBudget.remaining)}</span> <span class="sub">残り${S.actionsBudget.remaining}手</span>`;
    } else {
      slotsItem.hidden = true;
    }

    const purseItem = $('strip-purse-item');
    if (S.purse && (S.purse.credits || S.purse.cargo.length || S.purse.food)) {
      purseItem.hidden = false;
      const cargoUnits = S.purse.cargo.reduce((a, c) => a + c.qty, 0);
      $('strip-purse').innerHTML =
        `${S.purse.credits}<span class="sub">銭</span>` +
        (S.purse.food ? ` ・ 食料${S.purse.food}` : '') +
        (S.purse.capacity ? ` ・ 荷${cargoUnits}/${S.purse.capacity}` : '');
    } else {
      purseItem.hidden = true;
    }
  }

  /* ---------- left column ---------- */
  function renderSituation() {
    const ul = $('situation-lines');
    ul.innerHTML = '';
    S.situation.forEach((line) => ul.appendChild(el('li', null, line)));
  }

  function renderPurse() {
    const panel = $('purse-panel');
    const body = $('purse-body');
    body.innerHTML = '';
    if (!S.purse || (!S.purse.credits && !S.purse.cargo.length && !S.purse.food)) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const row = (label, val, low) => {
      const r = el('div', 'purse-row');
      r.appendChild(el('span', null, label));
      const n = el('span', `num${low ? ' low' : ''}`, String(val));
      r.appendChild(n);
      body.appendChild(r);
    };
    row('銭', `${S.purse.credits} 銭`);
    if (S.purse.food !== undefined && S.purse.capacity) row('食料', `${S.purse.food} 袋`, S.purse.food <= 4);
    S.purse.cargo.forEach((c) => row(DATA.world.commodities[c.commodityId] || c.commodityId, `${c.qty} ${c.commodityId === 'herbs' ? '束' : '袋'}`));
    if (S.purse.capacity) {
      const units = S.purse.cargo.reduce((a, c) => a + c.qty, 0);
      const meter = el('div', 'cap-meter');
      const fill = el('div', 'cap-fill');
      fill.style.width = `${Math.min(100, Math.round((units / S.purse.capacity) * 100))}%`;
      meter.appendChild(fill);
      body.appendChild(meter);
      body.appendChild(el('div', 'cap-label', `${S.purse.transportLabel || ''} 荷台 ${units} / ${S.purse.capacity}`));
    }
  }

  function renderBoard() {
    const panel = $('board-panel');
    if (!S.board) { panel.hidden = true; return; }
    panel.hidden = false;
    $('board-heading').textContent = S.board.title;
    const body = $('board-body');
    body.innerHTML = '';
    const grid = el('div', 'board-stat-grid');
    S.board.stats.forEach((st) => {
      const d = el('div', 'board-stat');
      const lb = el('span', null, st.label);
      if (st.note) lb.appendChild(el('span', 'note', st.note));
      d.appendChild(lb);
      d.appendChild(el('span', 'num', `${st.value}${st.unit ? ' ' + st.unit : ''}`));
      d.dataset.statLabel = st.label;
      grid.appendChild(d);
    });
    body.appendChild(grid);
    if (S.board.roster && S.board.roster.length) {
      body.appendChild(el('div', 'roster-title', S.board.kind === 'guild' ? '在籍の顔ぶれ' : '官吏'));
      S.board.roster.forEach((r) => {
        const row = el('div', 'roster-row');
        row.appendChild(el('span', null, `${r.name}(${r.klass})`));
        row.appendChild(el('span', 'skill', `腕 ${r.skill}`));
        body.appendChild(row);
      });
    }
  }

  function renderPeople() {
    const panel = $('people-panel');
    const ul = $('people-list');
    ul.innerHTML = '';
    if (!S.peopleHere || !S.peopleHere.length) {
      panel.hidden = S.board ? true : false;
      if (!panel.hidden) {
        const li = el('li', null, 'いまは誰もいない。静けさも情報のうち。');
        li.style.color = 'var(--ink-faint)';
        ul.appendChild(li);
      }
      return;
    }
    panel.hidden = false;
    S.peopleHere.forEach((p) => {
      const li = el('li');
      li.dataset.npcId = p.npcId;
      const name = el('span', 'person-name', p.name);
      li.appendChild(name);
      const chip = el('span', `trust-chip${p.trust >= 85 ? ' ally' : ''}`, `${p.trustLabel} ${p.trust}`);
      li.appendChild(chip);
      if (p.factionId) li.appendChild(el('span', 'trust-chip', DATA.world.factions[p.factionId] || p.factionId));
      if (p.note) li.appendChild(el('span', 'person-note', p.note));
      ul.appendChild(li);
    });
  }

  function renderStale() {
    const panel = $('stale-panel');
    const ul = $('stale-list');
    ul.innerHTML = '';
    if (!S.staleness || !S.staleness.length) { panel.hidden = true; return; }
    panel.hidden = false;
    S.staleness.forEach((st) => {
      const li = el('li');
      li.appendChild(provChip('unknown'));
      li.appendChild(document.createTextNode(
        ` ${DATA.world.locations[st.locationId] || st.locationId}の相場は ${st.turnsAgo}日前の観測`));
      ul.appendChild(li);
    });
  }

  /* ---------- center column ---------- */
  function availChip(av) {
    const map = { now: ['avail-now', '実装済'], adapter: ['avail-adapter', '要接続'], future: ['avail-future', '構想'] };
    const [cls, label] = map[av] || map.future;
    return `<span class="src-avail ${cls}">${label}</span>`;
  }
  function srcChip(source) {
    const d = el('div', 'src-chip');
    d.innerHTML = `${availChip(source.availability)}${source.module} :: ${source.symbol}${source.note ? ' — ' + source.note : ''}`;
    return d;
  }

  function timeChipText(tc) {
    if (!tc) return null;
    if (tc.days) return `${tc.days}日`;
    if (tc.slots === 0) return '刻を使わない';
    if (tc.slots) return `${tc.slots}刻`;
    return null;
  }

  function renderActions() {
    $('actions-kana').textContent = S.cadence === 'day' ? '今日できること' : (S.cadence === 'week' ? 'この週の采配' : 'この月の政務');

    // budget line
    const budget = $('budget-line');
    if (S.actionsBudget) {
      budget.hidden = false;
      budget.textContent = `残り ${S.actionsBudget.remaining} / ${S.actionsBudget.total} 手`;
    } else {
      budget.hidden = true;
    }

    // opportunities
    const oppBlock = $('opportunities-block');
    const oppList = $('opportunities-list');
    oppList.innerHTML = '';
    if (S.opportunities && S.opportunities.length) {
      oppBlock.hidden = false;
      S.opportunities.forEach((o) => {
        const card = el('div', 'opp-card');
        card.appendChild(el('div', 'opp-route',
          `${DATA.world.locations[o.locationId]} — ${DATA.world.commodities[o.commodityId]}`));
        const line = el('div', 'opp-line');
        line.innerHTML = `こちら <span class="num">${o.localUnitPrice}銭</span> → 先方 <span class="num">${o.remoteUnitPrice}銭</span>(圧力 +${o.pressurePct}%)・ ${o.travel.transportName}で${o.travel.days}日・食料${o.travel.foodCost}`;
        card.appendChild(line);
        const evi = el('div', 'opp-evidence');
        o.evidenceLabels.forEach((lb) => evi.appendChild(el('span', 'evi-chip', lb)));
        card.appendChild(evi);
        const src = srcChip({ module: 'livingWorldCommerceUiCore', symbol: 'buildCommerceDecisionSurface', availability: 'now' });
        card.appendChild(src);
        oppList.appendChild(card);
      });
    } else {
      oppBlock.hidden = true;
    }

    // requests / petitions
    const reqBlock = $('requests-block');
    const reqList = $('requests-list');
    reqList.innerHTML = '';
    const requests = S.requests || S.petitions;
    if (requests && requests.length) {
      reqBlock.hidden = false;
      $('requests-heading').textContent = S.requests ? '掲示板の依頼(未裁)' : '謁見の間(請願)';
      requests.forEach((rq) => {
        const card = el('div', 'request-card');
        card.dataset.reqId = rq.id;
        const head = el('div', 'request-head');
        head.appendChild(el('span', 'request-title', rq.title));
        head.appendChild(el('span', 'request-meta',
          `${rq.from}${rq.difficulty ? ` ・ 難度${rq.difficulty}` : ''}${rq.reward ? ` ・ 礼金${rq.reward}銭` : ''}`));
        card.appendChild(head);
        if (rq.note) card.appendChild(el('div', 'request-note', rq.note));
        if (rq.ruled) {
          card.classList.add('ruled');
          card.appendChild(el('div', 'ruled-stamp', `裁定済み: ${rq.ruledLabel}`));
        } else {
          const row = el('div', 'ruling-row');
          rq.rulings.forEach((r) => {
            const b = el('button', 'ruling-btn', r.label);
            b.type = 'button';
            b.addEventListener('click', () => openRulingReview(rq, r));
            row.appendChild(b);
          });
          card.appendChild(row);
        }
        card.appendChild(srcChip({
          module: S.requests ? 'guildCore' : 'domainCore',
          symbol: S.requests ? 'GuildOps resolve_request' : 'DomainOps audience_ruling',
          availability: 'now',
        }));
        reqList.appendChild(card);
      });
    } else {
      reqBlock.hidden = true;
    }

    // plan chips (week/month)
    const planBlock = $('plan-block');
    const chipsWrap = $('plan-chips');
    chipsWrap.innerHTML = '';
    const planItems = S.weeklyActions || S.monthlyActions;
    if (planItems && S.commit) {
      planBlock.hidden = false;
      $('plan-heading').textContent = S.cadence === 'week'
        ? `週の采配を選ぶ(${S.commit.requiresSelection.min}〜${S.commit.requiresSelection.max}手)`
        : `月の政務を選ぶ(${S.commit.requiresSelection.min}〜${S.commit.requiresSelection.max}手)`;
      planItems.forEach((a) => {
        const b = el('button', 'plan-chip');
        b.type = 'button';
        b.setAttribute('aria-pressed', planSelection.includes(a.id) ? 'true' : 'false');
        b.innerHTML = `${a.label}<span class="hint">${a.hint}</span>`;
        b.disabled = S.actionsBudget.remaining === 0;
        b.addEventListener('click', () => {
          const i = planSelection.indexOf(a.id);
          if (i >= 0) planSelection.splice(i, 1);
          else if (planSelection.length < S.commit.requiresSelection.max) planSelection.push(a.id);
          else { toast(`選べるのは最大 ${S.commit.requiresSelection.max} 手まで`); return; }
          renderActions();
        });
        chipsWrap.appendChild(b);
      });
      const btn = $('plan-commit-btn');
      btn.textContent = S.commit.label;
      btn.disabled = S.actionsBudget.remaining === 0
        || planSelection.length < S.commit.requiresSelection.min
        || planSelection.length > S.commit.requiresSelection.max;
      $('plan-note').textContent = S.actionsBudget.remaining === 0
        ? 'この期の采配は済んでいる'
        : `選択中: ${planSelection.length}手 / 締めると期がひとつ進む`;
    } else {
      planBlock.hidden = true;
    }

    // family groups
    const wrap = $('action-groups');
    wrap.innerHTML = '';
    const noTime = S.slots && slotsRemaining() === 0;
    S.families.forEach((fam) => {
      const acts = S.actions.filter((a) => a.familyId === fam.id);
      if (!acts.length) return;
      const g = el('section', 'family-group');
      const h = el('h3', 'family-heading');
      h.appendChild(el('span', 'family-kana', fam.label));
      h.appendChild(el('span', 'family-en', fam.en));
      g.appendChild(h);
      acts.forEach((a) => {
        const needsSlot = a.timeCost && a.timeCost.slots >= 1;
        const timeBlocked = noTime && needsSlot && !a.disabled;
        const isDisabled = a.disabled || timeBlocked;
        const card = el(isDisabled ? 'div' : 'button', `action-card${isDisabled ? ' disabled' : ''}`);
        if (!isDisabled) {
          card.type = 'button';
          card.addEventListener('click', () => openReview(a));
        }
        const main = el('div', 'action-main');
        main.appendChild(el('span', 'action-label', a.label));
        const chips = el('div', 'action-chips');
        const t = timeChipText(a.timeCost);
        if (t) chips.appendChild(el('span', `chip ${a.timeCost.slots === 0 ? 'chip-free' : 'chip-time'}`, t));
        (a.costs || []).forEach((c) => chips.appendChild(el('span', 'chip chip-cost', `${c.label} −${c.amount}`)));
        main.appendChild(chips);
        card.appendChild(main);
        if (a.desc) card.appendChild(el('div', 'action-desc', a.desc));
        if (a.target) card.appendChild(el('div', 'action-target', `相手: ${a.target.label}`));
        if (isDisabled) {
          const row = el('div', 'blocked-row');
          const reason = el('div', 'blocked-reason',
            timeBlocked ? '今日はもう刻がない' : a.disabledReason);
          const code = el('span', 'blocked-code', timeBlocked ? 'NO_TIME_LEFT' : (a.disabledCode || ''));
          reason.appendChild(code);
          row.appendChild(reason);
          const hintText = timeBlocked ? '「一日を終える」で明日へ。' : a.hint;
          if (hintText) {
            const hint = el('div', 'blocked-hint', hintText);
            if (a.hintUncertain) hint.appendChild(provChip('unknown')).classList.add('hint-uncertain');
            row.appendChild(hint);
          }
          card.appendChild(row);
        }
        card.appendChild(srcChip(a.source));
        g.appendChild(card);
      });
      wrap.appendChild(g);
    });

    // end-day
    const row = $('endday-row');
    row.hidden = !(S.cadence === 'day' && S.endDay);
  }

  /* ---------- right column: ledger ---------- */
  function deltaLine(d) {
    if (d.beforeLabel !== undefined) return `${d.label}: ${d.beforeLabel} → ${d.afterLabel}`;
    const sign = d.delta > 0 ? `+${d.delta}` : `${d.delta}`;
    const cls = d.delta > 0 ? 'plus' : (d.delta < 0 ? 'minus' : '');
    return `<span class="${cls}">${d.label} ${d.before} → ${d.after}(${sign}${d.unit || ''})</span>`;
  }

  function receiptNode(entry) {
    const div = el('article', `ledger-entry${entry.highlight ? ' highlight' : ''}`);
    div.dataset.receiptId = entry.id || '';
    const head = el('div', 'entry-head');
    if (entry.time) head.appendChild(el('span', 'entry-time', entry.time));
    head.appendChild(provChip('fact'));
    head.appendChild(el('span', 'entry-title', entry.title));
    div.appendChild(head);
    if (entry.deltas && entry.deltas.length) {
      const ul = el('ul', 'entry-deltas');
      entry.deltas.forEach((d) => {
        const li = el('li');
        li.innerHTML = deltaLine(d);
        ul.appendChild(li);
      });
      div.appendChild(ul);
    }
    if (entry.facts && entry.facts.length) {
      const ul = el('ul', 'entry-facts');
      entry.facts.forEach((f) => ul.appendChild(el('li', null, f)));
      div.appendChild(ul);
    }
    if (entry.events && entry.events.length) {
      div.appendChild(el('div', 'entry-events', entry.events.map((e) => e.id).join(' ・ ')));
    }
    const meaningful = (entry.deltas && entry.deltas.length) || (entry.events && entry.events.length);
    if (meaningful && !entry.narrated) {
      const act = el('div', 'entry-actions');
      const b = el('button', 'entry-narrate-btn', 'この出来事を物語にする');
      b.type = 'button';
      b.addEventListener('click', () => openNarrate(entry));
      act.appendChild(b);
      div.appendChild(act);
    }
    return div;
  }

  function worldNode(entry) {
    const div = el('article', 'ledger-entry world-entry');
    div.appendChild(el('div', 'world-title', entry.title || '世界の応答'));
    const ul = el('ul', 'world-lines');
    (entry.lines || []).forEach((l) => ul.appendChild(el('li', null, l)));
    div.appendChild(ul);
    return div;
  }

  function narrationNode(entry) {
    const div = el('article', 'ledger-entry narration-entry');
    const head = el('div', 'entry-head');
    head.appendChild(provChip('narration'));
    head.appendChild(el('span', 'entry-title', '語り(任意)'));
    div.appendChild(head);
    div.appendChild(el('div', 'narration-text', entry.text));
    const foot = el('div', 'narration-foot');
    foot.appendChild(el('span', 'narration-src', `出典: ${entry.forReceipt} — 記録は変わっていません`));
    const del = el('button', 'narration-del', '語りだけを消す');
    del.type = 'button';
    del.addEventListener('click', () => {
      S.ledger.today = S.ledger.today.filter((e) => e !== entry);
      const r = S.ledger.today.find((e) => e.id === entry.forReceipt);
      if (r) r.narrated = false;
      renderLedger();
      toast('語りを消しました。確定の記録はそのまま残っています。');
    });
    foot.appendChild(del);
    div.appendChild(foot);
    return div;
  }

  function renderLedger() {
    const arcs = $('ledger-arcs');
    arcs.innerHTML = '';
    (S.ledger.arcs || []).forEach((a) => {
      const pin = el('div', 'arc-pin');
      pin.appendChild(provChip('canon'));
      pin.appendChild(document.createTextNode(' ' + a.label));
      arcs.appendChild(pin);
    });

    const today = $('ledger-today');
    today.innerHTML = '';
    if (!S.ledger.today.length) {
      const empty = el('p', 'ledger-note', 'まだ今日の記録はありません。行動すると、ここに確定の記録が並びます。');
      today.appendChild(empty);
    }
    S.ledger.today.forEach((entry) => {
      if (entry.kind === 'world') today.appendChild(worldNode(entry));
      else if (entry.kind === 'narration') today.appendChild(narrationNode(entry));
      else today.appendChild(receiptNode(entry));
    });

    const rep = $('repetition-note');
    if (S.ledger.repetitionNote) {
      rep.hidden = false;
      rep.textContent = S.ledger.repetitionNote;
    } else {
      rep.hidden = true;
    }

    const folds = $('ledger-folds');
    folds.innerHTML = '';
    (S.ledger.folds || []).forEach((f) => {
      const d = el('details');
      const sum = el('summary');
      sum.appendChild(el('span', null, f.label));
      sum.appendChild(el('span', 'fold-count', `${f.count}件`));
      d.appendChild(sum);
      d.appendChild(el('div', 'fold-body', f.sample));
      folds.appendChild(d);
    });
  }

  /* ---------- sheets: shared ---------- */
  const SHEETS = ['review-sheet', 'result-sheet', 'narrate-sheet', 'endday-sheet'];
  function openSheet(id) {
    lastFocused = document.activeElement;
    $('sheet-scrim').hidden = false;
    SHEETS.forEach((s) => { $(s).hidden = s !== id; });
    const sheet = $(id);
    const focusable = sheet.querySelectorAll('button, [href], input, summary');
    if (focusable.length) focusable[0].focus();
  }
  function closeAllSheets() {
    $('sheet-scrim').hidden = true;
    SHEETS.forEach((s) => { $(s).hidden = true; });
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (SHEETS.some((s) => !$(s).hidden)) { closeAllSheets(); return; }
    }
    if (e.key === 'Tab') {
      const open = SHEETS.map($).find((s) => !s.hidden);
      if (!open) return;
      const f = [...open.querySelectorAll('button, [href], input, summary')].filter((n) => !n.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $('sheet-scrim').addEventListener('click', closeAllSheets);

  /* ---------- review sheet ---------- */
  function sectionList(title, provKind, items, cls) {
    const frag = document.createDocumentFragment();
    const h = el('h3', 'review-sec-title', title + ' ');
    h.appendChild(provChip(provKind));
    frag.appendChild(h);
    if (!items || !items.length) {
      frag.appendChild(el('p', 'review-empty', cls === 'unknown' ? 'エンジンが約束しない部分はありません。' : '—'));
      return frag;
    }
    const ul = el('ul', 'review-list');
    items.forEach((it) => ul.appendChild(el('li', null, it)));
    frag.appendChild(ul);
    return frag;
  }

  function openReview(action) {
    pendingAction = action;
    $('review-title').textContent = action.label;
    const body = $('review-body');
    body.innerHTML = '';
    if (action.desc) body.appendChild(el('p', 'review-cost-line', action.desc));
    if (action.target) body.appendChild(el('p', 'action-target', `相手: ${action.target.label}`));

    const costH = el('h3', 'review-sec-title', '使うもの ');
    costH.appendChild(provChip('fact'));
    body.appendChild(costH);
    const costUl = el('ul', 'review-list');
    const t = timeChipText(action.timeCost);
    if (t) costUl.appendChild(el('li', null, `時間: ${t}`));
    (action.costs || []).forEach((c) => costUl.appendChild(el('li', null, `${c.label} −${c.amount}`)));
    if (!costUl.children.length) costUl.appendChild(el('li', null, '費用なし'));
    body.appendChild(costUl);

    if (action.requires && action.requires.length) {
      const reqH = el('h3', 'review-sec-title', '条件');
      body.appendChild(reqH);
      const ul = el('ul', 'review-list');
      action.requires.forEach((r) => {
        const li = el('li', r.met ? 'met' : 'unmet', `${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }

    body.appendChild(sectionList('確かなこと', 'fact', action.known));
    body.appendChild(sectionList('見立て', 'estimate', action.estimated));
    body.appendChild(sectionList('わからないこと', 'unknown', action.unknown, 'unknown'));

    const src = srcChip(action.source);
    body.appendChild(src);

    $('review-commit').disabled = !action.result;
    openSheet('review-sheet');
  }

  /* ---------- applying results ---------- */
  function applyDeltas(deltas) {
    (deltas || []).forEach((d) => {
      if (d.label === '銭' && S.purse) S.purse.credits = d.after;
      else if (d.label === '食料' && S.purse) S.purse.food = d.after;
      else if (d.label === '現在地') {
        const entry = Object.entries(DATA.world.locations).find(([, v]) => v === d.afterLabel);
        if (entry) S.player.locationId = entry[0];
      } else if (/の信頼$/.test(d.label)) {
        const who = d.label.replace(/の信頼$/, '');
        const p = (S.peopleHere || []).find((x) => x.name.includes(who) || who.includes(x.name));
        if (p) p.trust = d.after;
      } else if (S.purse) {
        const entry = Object.entries(DATA.world.commodities).find(([, v]) => v === d.label);
        if (entry) {
          const id = entry[0];
          let c = S.purse.cargo.find((x) => x.commodityId === id);
          if (!c && d.after > 0) { c = { commodityId: id, qty: 0 }; S.purse.cargo.push(c); }
          if (c) { c.qty = d.after; if (c.qty <= 0) S.purse.cargo = S.purse.cargo.filter((x) => x !== c); }
        }
      }
      if (S.board) {
        const st = S.board.stats.find((x) => x.label === d.label);
        if (st) st.value = d.after;
      }
    });
  }

  function commitAction(action) {
    const r = JSON.parse(JSON.stringify(action.result));
    r.kind = 'receipt';
    r.id = r.id || `rcpt_${S.worldTurn}_${S.ledger.today.length + 1}`;
    r.time = action.timeCost && action.timeCost.days ? '旅' : currentSlotLabel();

    applyDeltas(r.deltas);

    if (action.timeCost && action.timeCost.days) {
      S.worldTurn += action.timeCost.days;
      if (S.slots) S.slots.used = 0;
    } else if (action.timeCost && action.timeCost.slots >= 1 && S.slots) {
      S.slots.used = Math.min(S.slots.labels.length, S.slots.used + action.timeCost.slots);
    }

    (r.unblocks || []).forEach((id) => {
      const a = S.actions.find((x) => x.id === id);
      if (a) {
        a.disabled = false;
        delete a.disabledReason;
        (a.requires || []).forEach((req) => { req.met = true; req.detail = '満たした(さっきの行動で)'; });
      }
    });

    S.ledger.today.push(r);
    pendingReceipt = r;
    renderAll();
    showResult(r);
  }

  function showResult(r) {
    $('result-title').textContent = r.title;
    const body = $('result-body');
    body.innerHTML = '';
    body.appendChild(el('p', 'review-cost-line', `試みたこと: ${r.attempted}`));
    if (r.deltas && r.deltas.length) {
      const h = el('h3', 'review-sec-title', '変わったもの ');
      h.appendChild(provChip('fact'));
      body.appendChild(h);
      const ul = el('ul', 'entry-deltas');
      r.deltas.forEach((d) => { const li = el('li'); li.innerHTML = deltaLine(d); ul.appendChild(li); });
      body.appendChild(ul);
    }
    if (r.facts && r.facts.length) {
      const h = el('h3', 'review-sec-title', 'いま確定した事実');
      body.appendChild(h);
      const ul = el('ul', 'review-list');
      r.facts.forEach((f) => ul.appendChild(el('li', null, f)));
      body.appendChild(ul);
    }
    if (r.events && r.events.length) {
      body.appendChild(el('div', 'entry-events', '記録ID: ' + r.events.map((e) => e.id).join(' ・ ')));
    }
    const meaningful = (r.deltas && r.deltas.length) || (r.events && r.events.length);
    const narrateBtn = $('result-narrate');
    narrateBtn.hidden = !meaningful;
    if (!meaningful) {
      body.appendChild(el('p', 'endday-honest', '小さな出来事なので、語りは勧めません。あとで日誌からまとめて語れます。'));
    }
    openSheet('result-sheet');
  }

  /* ---------- ruling (requests / petitions) ---------- */
  function openRulingReview(rq, ruling) {
    pendingAction = {
      label: `${rq.title} — ${ruling.label}`,
      desc: rq.note,
      timeCost: null,
      costs: [],
      requires: [],
      known: ruling.known,
      estimated: [],
      unknown: ['裁いた先で何が転がるか'],
      source: {
        module: S.requests ? 'guildCore' : 'domainCore',
        symbol: S.requests ? 'resolve_request' : 'audience_ruling',
        availability: 'now',
      },
      result: {
        title: `裁定: ${rq.title} — ${ruling.label}`,
        attempted: `${rq.from}の${S.requests ? '依頼' : '請願'}を「${ruling.label}」と裁いた`,
        ok: true,
        deltas: [],
        events: [{ id: `${S.requests ? 'guild' : 'domain'}_ruling_${rq.id}_${ruling.id}` }],
        facts: [`裁定は台帳に残った(${ruling.id})`, ...(ruling.known || [])],
      },
      _ruling: { rq, ruling },
    };
    openReview(pendingAction);
  }

  /* ---------- plan commit (week/month) ---------- */
  function openPlanReview() {
    const items = (S.weeklyActions || S.monthlyActions).filter((a) => planSelection.includes(a.id));
    pendingAction = {
      label: S.commit.label,
      desc: `選んだ采配: ${items.map((i) => i.label).join(' / ')}`,
      timeCost: null,
      costs: [],
      requires: [],
      known: S.commit.known,
      estimated: S.commit.estimated,
      unknown: S.commit.unknown,
      source: S.commit.source,
      result: (() => {
        const r = JSON.parse(JSON.stringify(S.commit.result));
        r.attempted = `${S.cadence === 'week' ? '週次' : '月次'}の采配(${items.map((i) => i.label).join(' / ')})`;
        return r;
      })(),
      _isCommit: true,
    };
    openReview(pendingAction);
  }

  /* ---------- narration ---------- */
  let narrateTarget = null;
  function openNarrate(receipt) {
    narrateTarget = receipt;
    $('narrate-quote').textContent = `${receipt.title} — ${(receipt.facts || []).join(' / ')}`;
    openSheet('narrate-sheet');
  }
  function confirmNarrate() {
    if (!narrateTarget) return;
    const canned = (S.narrations && S.narrations[narrateTarget.id])
      || `《試作の定型文》${narrateTarget.title}。${(narrateTarget.facts || []).slice(0, 2).join('。')}。日は傾き、記録はそのまま帳面に残った。`;
    const entry = { kind: 'narration', forReceipt: narrateTarget.id, text: canned };
    const idx = S.ledger.today.indexOf(narrateTarget);
    if (idx >= 0) S.ledger.today.splice(idx + 1, 0, entry);
    else S.ledger.today.push(entry);
    narrateTarget.narrated = true;
    closeAllSheets();
    renderLedger();
    toast('語りを日誌に添えました。確定の記録は変わっていません。');
  }

  /* ---------- end day ---------- */
  function openEndDay() {
    const ul = $('endday-preview');
    ul.innerHTML = '';
    (S.endDay.preview || []).forEach((p) => ul.appendChild(el('li', null, p)));
    openSheet('endday-sheet');
  }
  function confirmEndDay() {
    S.worldTurn += 1;
    if (S.slots) S.slots.used = 0;
    const entry = {
      kind: 'world',
      title: S.endDay.quiet ? '一日の終わり(静かな日)' : '一日の終わり — 世界の応答',
      lines: S.endDay.summary,
    };
    S.ledger.today.push(entry);
    closeAllSheets();
    renderAll();
    toast('翌朝になりました。');
  }

  /* ---------- wire up static controls ---------- */
  $('legend-toggle').addEventListener('click', () => {
    const p = $('provenance-legend');
    const open = p.hidden;
    p.hidden = !open;
    $('legend-toggle').setAttribute('aria-expanded', String(open));
  });

  document.querySelectorAll('.house-link').forEach((b) => {
    const msgs = {
      cinematic: '物語る(Cinematic Play)へ — 実装では、この日誌の場面を語りの部屋で開きます。試作では遷移しません。',
      pulse: '世界の脈(World Pulse)へ — 実装では、日誌の記録IDから根拠カードに跳びます。試作では遷移しません。',
      people: '人々(PEOPLE)へ — 実装では、相手の台帳(信頼・節目)を開きます。試作では遷移しません。',
      chronicle: '年代記(CHRONICLE)へ — 実装では、節目ピンの章に跳びます。試作では遷移しません。',
    };
    b.addEventListener('click', () => toast(msgs[b.dataset.room]));
  });

  $('review-close').addEventListener('click', closeAllSheets);
  $('review-cancel').addEventListener('click', closeAllSheets);
  $('review-commit').addEventListener('click', () => {
    if (!pendingAction) return;
    const a = pendingAction;
    closeAllSheets();
    if (a._ruling) {
      a._ruling.rq.ruled = true;
      a._ruling.rq.ruledLabel = a._ruling.ruling.label;
      if (S.requests && a._ruling.ruling.id === 'accept') {
        const assign = S.actions.find((x) => x.id === 'assign_party');
        if (assign) {
          assign.disabled = false;
          delete assign.disabledReason;
          assign.requires.forEach((r) => { r.met = true; r.detail = `受注: ${a._ruling.rq.title}`; });
          assign.result = {
            title: `隊を送り出した — ${a._ruling.rq.title}`,
            attempted: `受注「${a._ruling.rq.title}」に隊を割り当てた`,
            ok: true,
            deltas: [],
            events: [{ id: `guild_party_${a._ruling.rq.id}` }],
            facts: ['斥候ネル/戦士ボルグ/治し手ミアの3名', '帰還見込み: 2週(週の締めで進む)'],
          };
        }
      }
      const r = JSON.parse(JSON.stringify(a.result));
      r.kind = 'receipt';
      r.id = `rcpt_ruling_${a._ruling.rq.id}`;
      r.time = S.cadence === 'day' ? currentSlotLabel() : '本日';
      S.ledger.today.push(r);
      pendingReceipt = r;
      renderAll();
      showResult(r);
      return;
    }
    if (a._isCommit) {
      const r = JSON.parse(JSON.stringify(a.result));
      r.kind = 'receipt';
      r.id = `rcpt_commit_${S.worldTurn}`;
      r.time = S.cadence === 'week' ? '週の終わり' : '月の終わり';
      applyDeltas(r.deltas);
      S.actionsBudget.remaining = 0;
      S.worldTurn += S.cadence === 'week' ? 7 : 30;
      S.ledger.today.push(r);
      pendingReceipt = r;
      planSelection = [];
      renderAll();
      showResult(r);
      return;
    }
    commitAction(a);
  });

  $('result-close').addEventListener('click', closeAllSheets);
  $('result-continue').addEventListener('click', closeAllSheets);
  $('result-narrate').addEventListener('click', () => {
    if (pendingReceipt) openNarrate(pendingReceipt);
  });

  $('narrate-close').addEventListener('click', closeAllSheets);
  $('narrate-cancel').addEventListener('click', closeAllSheets);
  $('narrate-confirm').addEventListener('click', confirmNarrate);

  $('endday-btn') && $('endday-btn').addEventListener('click', openEndDay);
  $('endday-close').addEventListener('click', closeAllSheets);
  $('endday-cancel').addEventListener('click', closeAllSheets);
  $('endday-confirm').addEventListener('click', confirmEndDay);

  $('plan-commit-btn').addEventListener('click', openPlanReview);

  $('lens-checkbox').addEventListener('change', (e) => {
    document.body.classList.toggle('lens-on', e.target.checked);
    $('lens-legend').hidden = !e.target.checked;
  });

  /* ---------- render all ---------- */
  function renderAll() {
    renderHeader();
    renderSituation();
    renderPurse();
    renderBoard();
    renderPeople();
    renderStale();
    renderActions();
    renderLedger();
  }

  /* ---------- boot ---------- */
  fetch('sample-data.json')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((json) => {
      DATA = json;
      renderLegend();
      const fromHash = (location.hash.match(/scenario=([a-z_]+)/) || [])[1];
      renderTabs();
      selectScenario(fromHash || DATA.scenarios[0].id);
    })
    .catch((err) => {
      document.body.insertBefore(
        el('p', 'mode-banner', `sample-data.json を読み込めませんでした(${err.message})。ローカルサーバ越しに開いてください(例: python -m http.server)。`),
        document.querySelector('main')
      );
    });
})();
