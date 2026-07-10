/* ============================================================
   RETURN-UX-001 — 世界へ戻る (Return to Your World) prototype
   ------------------------------------------------------------
   Read-only re-entry interpretation layer. This script:
     - derives absence + session boundaries from journal
       appliedAt timestamps (the mechanism production already
       has: statePatch.ts writes appliedAt per accepted turn);
     - renders the six bands from sample-data.json;
     - never mutates anything that models world state.
   Its only outputs are DOM nodes.
   ============================================================ */

(function () {
  'use strict';

  var DATA_URL = 'sample-data.json';
  var SESSION_GAP_HOURS = 4;   // gap between appliedAt stamps that splits sessions
  var MAX_THREADS = 4;         // UNFINISHED cap — overflow goes to the Chronicle
  var MAX_PEOPLE = 3;          // PEOPLE WAITING cap
  var MAX_DEVELOPMENTS = 3;    // world developments cap

  var state = {
    data: null,
    scenarioIndex: 0,
    lastSheetTrigger: null
  };

  /* ----------------------------------------------------------
     Utilities
     ---------------------------------------------------------- */
  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = text; }
    return node;
  }

  function provChip(kind) {
    var map = {
      fact:    { cls: 'prov prov-fact',    label: '事実' },
      derived: { cls: 'prov prov-derived', label: '兆候' },
      recap:   { cls: 'prov prov-recap',   label: '語り' },
      stale:   { cls: 'prov prov-stale',   label: '不確か' }
    };
    var m = map[kind] || map.fact;
    return el('span', m.cls, m.label);
  }

  /* ----------------------------------------------------------
     Absence + session derivation
     ------------------------------------------------------------
     Production reality this mirrors:
       - each accepted turn is journaled with appliedAt (ISO,
         real time) by statePatch.ts;
       - NO explicit session store exists, so sessions are
         derived by clustering appliedAt gaps (> 4h = new
         session). This is the honest fallback the report
         documents; an explicit return checkpoint is future.
       - the world does NOT simulate while the app is closed,
         so real-time absence means a *frozen* world. The copy
         says so instead of pretending a diff happened.
     ---------------------------------------------------------- */
  function deriveAbsence(scenario) {
    var turns = scenario.journalTail || [];
    if (turns.length === 0) { return null; }

    var lastIso = turns[turns.length - 1].appliedAt;
    var last = new Date(lastIso);
    var now = new Date(scenario.nowIso);
    var ms = now - last;
    var hours = Math.floor(ms / 36e5);
    var days = Math.floor(hours / 24);

    // Cluster the journal tail into sessions by gap.
    var sessions = [];
    var current = null;
    turns.forEach(function (t) {
      var ts = new Date(t.appliedAt);
      if (!current || (ts - current.end) > SESSION_GAP_HOURS * 36e5) {
        current = { start: ts, end: ts, turns: [t] };
        sessions.push(current);
      } else {
        current.end = ts;
        current.turns.push(t);
      }
    });
    var lastSession = sessions[sessions.length - 1];

    var phrase;
    if (days >= 14) { phrase = Math.floor(days / 7) + '週間ぶりの帰還'; }
    else if (days >= 2) { phrase = days + '日ぶりの帰還'; }
    else if (days === 1) { phrase = '一日ぶりの帰還'; }
    else if (hours >= 1) { phrase = hours + '時間ぶりの帰還'; }
    else { phrase = 'おかえりなさい'; }

    function fmtDate(d) {
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }

    return {
      phrase: phrase,
      days: days,
      lastPlayedText: fmtDate(last),
      lastSessionText: '前回のセッション: ' + fmtDate(lastSession.start) +
        ' · ' + lastSession.turns.length + 'ターン' +
        ' (' + lastSession.turns[0].turnId.toUpperCase() + '–' +
        lastSession.turns[lastSession.turns.length - 1].turnId.toUpperCase() + ')'
    };
  }

  /* ----------------------------------------------------------
     Renderers
     ---------------------------------------------------------- */
  function renderThreshold(s) {
    var art = document.querySelector('.scene-art');
    // Missing-art honesty: scene art is CSS-first. If sample data
    // names an image we *still* rely on the CSS scene class —
    // the prototype ships no images, proving the no-art path.
    art.className = 'scene-art ' + (s.world.sceneClass || 'scene-mist');

    $('world-name').textContent = s.world.name;
    $('world-epithet').textContent = s.world.epithet || '';

    var chips = $('identity-chips');
    chips.textContent = '';
    var defs = [
      ['いま', s.player.characterName],
      ['立場', s.player.roleLabel],
      ['場所', s.player.location],
      ['世界ターン', 'T' + s.world.worldTurn],
      ['とき', s.world.inWorldTime]
    ];
    defs.forEach(function (pair) {
      var wrap = el('div');
      wrap.appendChild(el('dt', null, pair[0]));
      wrap.appendChild(el('dd', null, pair[1]));
      chips.appendChild(wrap);
    });

    var absence = deriveAbsence(s);
    var line = $('absence-line');
    var honesty = $('absence-honesty');
    if (absence) {
      line.textContent = absence.phrase + ' — 世界は、あなたが置いていった場所でそのまま待っていました。';
      honesty.textContent = '';
      honesty.appendChild(provChip('fact'));
      honesty.appendChild(document.createTextNode(
        ' 最終プレイ: ' + absence.lastPlayedText + '（記録 appliedAt より） · ' +
        absence.lastSessionText + ' · 不在中に世界は進行しません'
      ));
    } else {
      line.textContent = 'おかえりなさい。';
      honesty.textContent = '';
    }

    // replay the entrance (skipped under reduced motion via CSS)
    var inner = document.querySelector('.threshold-inner');
    var silk = document.querySelector('.ribbon-silk');
    [inner, silk].forEach(function (node) {
      if (!node) { return; }
      node.style.animation = 'none';
      void node.offsetWidth; // reflow to restart
      node.style.animation = '';
    });
  }

  function renderRecap(s) {
    var body = $('recap-body');
    body.textContent = '';
    var paragraphs = (s.recap && s.recap.paragraphs) || [];
    if (paragraphs.length === 0) {
      body.appendChild(el('p', 'recap-empty', 'まだ語るほどの出来事はありません。ここからが最初の頁です。'));
    } else {
      paragraphs.forEach(function (p) {
        body.appendChild(el('p', null, p.text));
      });
    }

    // sources disclosure
    var sourcesWrap = $('recap-sources');
    sourcesWrap.hidden = true;
    sourcesWrap.textContent = '';
    var btn = $('recap-sources-btn');
    btn.setAttribute('aria-expanded', 'false');

    var h = el('h4', null, 'この語りの出典 — 段落ごとの元記録');
    sourcesWrap.appendChild(h);

    var journalById = {};
    (s.journalTail || []).forEach(function (t) { journalById[t.turnId] = t; });

    paragraphs.forEach(function (p, i) {
      (p.sourceRefs || []).forEach(function (ref) {
        var t = journalById[ref];
        var row = el('div', 'source-row');
        row.appendChild(el('span', 'source-turn', ref.toUpperCase()));
        row.appendChild(provChip('fact'));
        var text = t
          ? (t.playerAction + ' → ' + t.gmNote)
          : '(記録参照: ' + ref + ')';
        row.appendChild(el('span', 'source-text', '第' + (i + 1) + '段落 ← ' + text));
        sourcesWrap.appendChild(row);
      });
    });
    sourcesWrap.appendChild(el('p', 'recap-honesty',
      'この要約は記録の語り直しであり、それ自体は正史ではありません。原文は年代記と冒険ログにあります。'));
  }

  function renderArcs(s) {
    var band = $('band-arcs');
    var strip = $('arc-strip');
    var more = $('arc-more');
    strip.textContent = '';
    more.textContent = '';

    var arcs = s.arcs || [];
    if (arcs.length === 0) { band.hidden = true; return; }
    band.hidden = false;

    arcs.forEach(function (a) {
      var li = el('li');
      li.appendChild(el('span', 'arc-pin' + (a.open ? ' arc-open' : '')));
      li.appendChild(el('span', 'arc-title', a.title));
      li.appendChild(el('span', 'arc-range',
        'T' + a.fromTurn + '–' + (a.toTurn ? 'T' + a.toTurn : '現在') + ' · ' + a.eventCount + '件'));
      if (a.note) { li.appendChild(el('span', 'arc-note', a.note)); }
      strip.appendChild(li);
    });

    if (s.arcsArchivedCount) {
      more.textContent = '終章済みの' + s.arcsArchivedCount + '章（' + s.arcsArchivedEvents +
        '件の記録）はここには並べません — ';
      var link = el('button', 'quiet-link', '年代記で読む');
      link.type = 'button';
      link.addEventListener('click', function () { handoff('chronicle'); });
      more.appendChild(link);
    }
  }

  function renderThreads(s) {
    var list = $('thread-list');
    list.textContent = '';
    var overflow = $('thread-overflow');
    overflow.hidden = true;
    overflow.textContent = '';

    var threads = (s.threads || []).slice(0, MAX_THREADS);
    if (threads.length === 0) {
      var empty = el('li');
      empty.appendChild(el('div', 'thread-empty',
        'やり残しは記録されていません。新しい一日は、白い頁から始まります。'));
      list.appendChild(empty);
      return;
    }

    threads.forEach(function (t) {
      var li = el('li');
      var row = el('button', 'thread-row');
      row.type = 'button';
      row.setAttribute('aria-haspopup', 'dialog');

      row.appendChild(el('span', 'thread-glyph', t.glyph || '•'));

      var title = el('span', 'thread-title');
      title.appendChild(el('span', 'thread-kind', t.kindLabel));
      title.appendChild(document.createTextNode(t.title));
      row.appendChild(title);

      var meta = el('span', 'thread-meta');
      meta.appendChild(provChip(t.provenance || 'fact'));
      var ageText = t.ageTurns === 0 ? 'このターン'
        : t.ageTurns >= 20 ? t.ageTurns + 'ターン前から'
        : t.ageTurns + 'ターン前';
      var age = el('span', 'thread-age' + (t.ageTurns >= 20 ? ' age-old' : ''), ageText);
      meta.appendChild(age);
      row.appendChild(meta);

      row.appendChild(el('span', 'thread-why', t.why));

      row.addEventListener('click', function () {
        openSheet(t.title, t.evidence || [], row, t.basis);
      });
      li.appendChild(row);
      list.appendChild(li);
    });

    if (s.threadsOverflowCount) {
      overflow.hidden = false;
      overflow.textContent = 'ほかに' + s.threadsOverflowCount +
        '件の古い糸があります。この画面には並べません — ';
      var link = el('button', 'quiet-link', '年代記で読む');
      link.type = 'button';
      link.addEventListener('click', function () { handoff('chronicle'); });
      overflow.appendChild(link);
    }
  }

  function renderWorld(s) {
    var list = $('dev-list');
    list.textContent = '';
    var stale = $('stale-list');
    stale.textContent = '';

    var devs = (s.developments || []).slice(0, MAX_DEVELOPMENTS);
    if (devs.length === 0 && s.quietNote) {
      var quiet = el('li');
      quiet.appendChild(el('div', 'dev-quiet', s.quietNote));
      list.appendChild(quiet);
    } else if (devs.length === 0) {
      var none = el('li');
      none.appendChild(el('div', 'dev-quiet', '直近の世界の記録はありません。'));
      list.appendChild(none);
    }

    devs.forEach(function (d) {
      var li = el('li');
      var row = el('button', 'dev-row sev-' + (d.severity || 'info'));
      row.type = 'button';
      row.setAttribute('aria-haspopup', 'dialog');
      row.appendChild(el('span', 'dev-text', d.message));
      var meta = el('span', 'dev-meta');
      meta.appendChild(el('span', 'dev-turn', 'T' + d.worldTurn));
      meta.appendChild(provChip(d.provenance || 'fact'));
      row.appendChild(meta);
      row.addEventListener('click', function () {
        openSheet(d.message, [
          { prov: 'fact', text: 'この出来事は世界の記録に存在します',
            meta: 'recentChanges.' + d.id + ' (worldTurn: ' + d.worldTurn + ', severity: ' + d.severity + ')' },
          { prov: 'derived', text: '帰還画面に出ている理由: 前回セッション末尾の未読圏 + 重要度',
            meta: 'derived: reentry relevance = severity × recency' }
        ], row, 'World Pulse の「いま」に相当する記録です');
      });
      li.appendChild(row);
      list.appendChild(li);
    });

    // quiet note appears under devs when both exist
    if (devs.length > 0 && s.quietNote) {
      var q = el('li');
      q.appendChild(el('div', 'dev-quiet', s.quietNote));
      list.appendChild(q);
    }

    (s.staleness || []).forEach(function (st) {
      var li = el('li', 'stale-row');
      li.appendChild(provChip('stale'));
      li.appendChild(el('span', null,
        st.locationName + ' — 最後の観測から' + st.turnsSince + 'ターン。' + st.note));
      stale.appendChild(li);
    });
  }

  function renderPeople(s) {
    var list = $('people-list');
    list.textContent = '';

    (s.people || []).slice(0, MAX_PEOPLE).forEach(function (p) {
      var li = el('li');
      var card = el('button', 'person-card');
      card.type = 'button';
      card.setAttribute('aria-haspopup', 'dialog');

      var head = el('div', 'person-head');
      head.appendChild(el('span', 'person-name', p.name));
      head.appendChild(el('span', 'person-role', p.roleLabel));
      card.appendChild(head);

      var bond = el('div', 'person-bond' + (p.affinity < 0 ? ' bond-negative' : ''));
      var pct = Math.min(100, Math.round(Math.abs(p.affinity)));
      bond.style.setProperty('--bond-pct', pct + '%');
      bond.setAttribute('role', 'img');
      bond.setAttribute('aria-label', '関係値 ' + p.affinity);
      card.appendChild(bond);

      card.appendChild(el('div', 'person-standing', p.standing));
      card.appendChild(el('div', 'person-why', p.why));

      var meta = el('div', 'person-meta');
      meta.appendChild(provChip(p.whyProv || 'fact'));
      var whereProv = p.whereabouts.precision === 'exact' ? null
        : p.whereabouts.precision === 'approximate' ? 'stale' : 'stale';
      if (whereProv) { meta.appendChild(provChip(whereProv)); }
      meta.appendChild(el('span', 'person-where', p.whereabouts.text));
      card.appendChild(meta);

      card.addEventListener('click', function () {
        openSheet(p.name + ' — なぜいま', p.evidence || [], card,
          'ここから「人々」の詳細へ進めます（プロダクションでは PEOPLE 面へのリンク）');
      });
      li.appendChild(card);
      list.appendChild(li);
    });
  }

  function renderResume(s) {
    $('resume-context').textContent = s.resume.context;
  }

  /* ----------------------------------------------------------
     Evidence sheet
     ---------------------------------------------------------- */
  function openSheet(title, facts, trigger, note) {
    state.lastSheetTrigger = trigger || null;
    $('sheet-title').textContent = title;
    var body = $('sheet-body');
    body.textContent = '';
    facts.forEach(function (f) {
      var row = el('div', 'sheet-fact');
      row.appendChild(provChip(f.prov));
      var txt = el('span', 'sheet-fact-text', f.text);
      if (f.meta) { txt.appendChild(el('span', 'sheet-fact-meta', f.meta)); }
      row.appendChild(txt);
      body.appendChild(row);
    });
    if (note) { body.appendChild(el('p', 'sheet-note', note)); }

    $('sheet-backdrop').hidden = false;
    var sheet = $('evidence-sheet');
    sheet.hidden = false;
    $('sheet-close').focus();
  }

  function closeSheet() {
    $('sheet-backdrop').hidden = true;
    $('evidence-sheet').hidden = true;
    if (state.lastSheetTrigger) {
      state.lastSheetTrigger.focus();
      state.lastSheetTrigger = null;
    }
  }

  /* ----------------------------------------------------------
     Handoff (contract demo — production would navigate)
     ---------------------------------------------------------- */
  var HANDOFF_COPY = {
    play: null, // filled per scenario
    pulse: '世界の脈（World Pulse）へ。この世界の「いま・高まるもの・ひとびと・場所・年代記」を開きます。',
    people: '人々（PEOPLE）へ。関係と所在の一覧を開きます。',
    chronicle: '年代記（CHRONICLE)へ。章ごとの記録と完結した道のりを開きます。',
    portrait: '肖像スタジオ（Portrait Studio）へ。採用中の姿と候補を確かめられます。'
  };

  var toastTimer = null;
  function handoff(kind) {
    var s = state.data.scenarios[state.scenarioIndex];
    var text = kind === 'play' ? s.resume.handoffNote : HANDOFF_COPY[kind];
    var toast = $('handoff-toast');
    toast.textContent = '';
    toast.appendChild(el('span', 'toast-kicker', '画面遷移（プロトタイプでは実遷移しません）'));
    toast.appendChild(document.createTextNode(text));
    toast.hidden = false;
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { toast.hidden = true; }, 4200);
  }

  /* ----------------------------------------------------------
     Scenario tablist (roving tabindex + arrow keys)
     ---------------------------------------------------------- */
  function buildTabs() {
    var nav = $('scenario-tablist');
    nav.textContent = '';
    state.data.scenarios.forEach(function (s, i) {
      var tab = el('button', 'proto-tab', s.label);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', i === state.scenarioIndex ? 'true' : 'false');
      tab.tabIndex = i === state.scenarioIndex ? 0 : -1;
      tab.dataset.index = String(i);
      tab.addEventListener('click', function () { selectScenario(i, false); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') { next = (i + 1) % state.data.scenarios.length; }
        if (e.key === 'ArrowLeft') { next = (i - 1 + state.data.scenarios.length) % state.data.scenarios.length; }
        if (next !== null) {
          e.preventDefault();
          selectScenario(next, true);
        }
      });
      nav.appendChild(tab);
    });
  }

  function selectScenario(index, focusTab) {
    state.scenarioIndex = index;
    var tabs = $('scenario-tablist').children;
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute('aria-selected', i === index ? 'true' : 'false');
      tabs[i].tabIndex = i === index ? 0 : -1;
    }
    if (focusTab) { tabs[index].focus(); }
    renderScenario();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function renderScenario() {
    var s = state.data.scenarios[state.scenarioIndex];
    renderThreshold(s);
    renderRecap(s);
    renderArcs(s);
    renderThreads(s);
    renderWorld(s);
    renderPeople(s);
    renderResume(s);
    closeSheet();
  }

  /* ----------------------------------------------------------
     Wiring
     ---------------------------------------------------------- */
  function wire() {
    $('legend-toggle').addEventListener('click', function () {
      var panel = $('legend-panel');
      var open = panel.hidden;
      panel.hidden = !open;
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    $('recap-sources-btn').addEventListener('click', function () {
      var box = $('recap-sources');
      var open = box.hidden;
      box.hidden = !open;
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    $('sheet-close').addEventListener('click', closeSheet);
    $('sheet-backdrop').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('evidence-sheet').hidden) { closeSheet(); }
    });

    $('resume-btn').addEventListener('click', function () { handoff('play'); });
    $('open-pulse-link').addEventListener('click', function () { handoff('pulse'); });
    document.querySelectorAll('[data-handoff]').forEach(function (btn) {
      btn.addEventListener('click', function () { handoff(btn.dataset.handoff); });
    });
  }

  /* ----------------------------------------------------------
     Boot
     ---------------------------------------------------------- */
  fetch(DATA_URL)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      state.data = data;
      // Deep-linkable scenarios: #quiet-life etc. (also lets headless
      // screenshot tooling reach every scenario without clicking).
      var hash = (location.hash || '').replace('#', '');
      var idx = data.scenarios.findIndex(function (s) { return s.id === hash; });
      if (idx >= 0) { state.scenarioIndex = idx; }
      buildTabs();
      wire();
      renderScenario();
    })
    .catch(function (err) {
      document.body.insertBefore(
        el('p', 'readonly-note', 'sample-data.json の読み込みに失敗しました: ' + err.message +
          ' — ローカルHTTPサーバー経由で開いてください (python -m http.server)。'),
        document.body.firstChild
      );
    });
})();
