/* ============================================================
   WORLD PULSE — prototype logic (WORLD-PULSE-001)

   Read-only interpretation layer. Every card this file renders is
   derived from data shapes that already exist in LoreRelay:
     - WorldState        (src/worldStateCore.ts)
     - WorldChangeEvent  (src/worldEventLogCore.ts)
     - ChronicleChapter  (src/chronicleCore.ts)
     - NpcEntry subset   (src/npcRegistryCore.ts)

   AUTHORITY RULE: this module never writes state. Its only outputs
   are DOM nodes. Everything it computes beyond the raw record is
   tagged 兆候 (DERIVED); missing observations are tagged 不確か
   (UNCERTAIN). Raw records are tagged 事実 (OBSERVED FACT).
   ============================================================ */

'use strict';

/* ---------- shared vocab (mirrors production constants) ---------- */

// npcRelationshipCore.ts thresholds
const AFFINITY_ALLY = 70, AFFINITY_FRIEND = 30, AFFINITY_RIVAL = -30, AFFINITY_ENEMY = -70;
// npcWhereaboutsTrustCore.ts
const TRUST_WHEREABOUTS_UNKNOWN_MAX = 30;

const MILESTONE_ICON = {
  sworn_allies: '🛡️', inseparable: '💠', bitter_enemies: '🗡️', estranged: '💔', reconciled: '🕊️',
};
const MILESTONE_LABEL = {
  sworn_allies: '盟友の誓い', inseparable: '無二の仲', bitter_enemies: '不倶戴天', estranged: '疎遠', reconciled: '和解',
};
const PLAYER_BOND_ICON = {
  trusted_companion: '🤝', romance: '❤️', nemesis: '⚔️', feared: '😨', estrangement: '💔',
};
const PLAYER_BOND_LABEL = {
  trusted_companion: '信頼の仲間', romance: 'ロマンス', nemesis: '宿敵', feared: '畏怖', estrangement: '断絶',
};
const BOND_WORD = { ally: '盟友', friend: '友好', neutral: '中立', rival: '対抗', enemy: '敵対' };
const AGENDA_LABEL = {
  restock_wheat: '小麦の仕入れ', restock_steel: '鋼の仕入れ', seek_buyer: '買い手探し',
  flee_danger: '危険からの退避', visit_ally: '盟友を訪ねて',
};
const MOOD_LABEL = {
  happy: '上機嫌', worried: '不安げ', angry: '苛立ち', sad: '沈んでいる',
  neutral: '平静', excited: '高揚', fearful: '怯えている',
};
const CATEGORY_LABEL = {
  faction: '派閥', region: '地域', resource: '資源', npc: '人物', global: '世界', guild: 'ギルド',
};

/* How many turns before information starts to visually age out. */
const AGE_FADE_TURNS = 12;
/* NOW never shows more than this many cards, no matter how loud the world is. */
const MAX_NOW_CARDS = 3;
const RECENT_LANE_ROWS = 10;

/* ---------- tiny helpers ---------- */

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function provChip(kind) {
  const map = { fact: ['prov prov-fact', '事実'], derived: ['prov prov-derived', '兆候'], uncertain: ['prov prov-uncertain', '不確か'] };
  const [cls, label] = map[kind];
  const span = el('span', cls, label);
  span.title = kind === 'fact' ? '記録された出来事・数値そのもの'
    : kind === 'derived' ? '記録から読み取った傾向（世界の正史ではありません）'
    : '観測が欠けている部分';
  return span;
}

function describeRelationship(affinity) {
  if (affinity >= AFFINITY_ALLY) return 'ally';
  if (affinity >= AFFINITY_FRIEND) return 'friend';
  if (affinity <= AFFINITY_ENEMY) return 'enemy';
  if (affinity <= AFFINITY_RIVAL) return 'rival';
  return 'neutral';
}

/* Deterministic PRNG for the long-campaign filler chronicle. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
   STATE
   ============================================================ */

let DATA = null;
let scenarioKey = 'crisis';
let lastFocusedTrigger = null;

function names() { return DATA.names; }
function scn() { return DATA.scenarios[scenarioKey]; }
function nameOf(kind, id) {
  return (names()[kind] && names()[kind][id]) || id;
}
function npcName(id) {
  const s = scn();
  return (s.npcs && s.npcs[id] && s.npcs[id].name) || id;
}

/* ============================================================
   DERIVATION LAYER — pure functions from scenario → view models.
   Each result carries { provenance, facts[] } so the drawer can
   always show its work.
   ============================================================ */

/** Overall tension: derived from live event severities + global events. */
function deriveTension(s) {
  const changes = s.recentChanges || [];
  const globals = s.globalEvents || [];
  const hasCritical = changes.some((c) => c.severity === 'critical')
    || globals.some((g) => g.severity === 'catastrophic' || g.severity === 'major');
  const warningCount = changes.filter((c) => c.severity === 'warning').length
    + globals.filter((g) => g.severity === 'moderate').length;
  if (hasCritical) return 'crisis';
  if (warningCount >= 2) return 'stirring';
  return 'calm';
}

/** Importance score for a WorldChangeEvent (documented in the design report). */
function scoreEvent(ev, s) {
  const sevW = ev.severity === 'critical' ? 3 : ev.severity === 'warning' ? 2 : 1;
  const age = Math.max(0, (s.worldTurn || 0) - ev.worldTurn);
  const recency = Math.max(0.2, 1 - age / (AGE_FADE_TURNS * 1.5));
  let relevance = 1;
  if (ev.locationId && ev.locationId === s.playerLocationId) relevance += 0.6;
  const bonds = s.playerNpcMilestones || {};
  if ((ev.npcIds || []).some((id) => bonds[id])) relevance += 0.5;
  const questFactions = new Set((s.questHooks || []).filter((q) => q.status === 'active' || q.status === 'available').map((q) => q.factionId).filter(Boolean));
  if (ev.factionId && questFactions.has(ev.factionId)) relevance += 0.3;
  return sevW * recency * relevance;
}

function toneOf(ev) {
  if (ev.severity === 'critical') return 'critical';
  if (ev.severity === 'warning') return 'warning';
  return 'info';
}

/** NOW — at most 3 genuinely important developments. */
function deriveNow(s) {
  const scored = (s.recentChanges || [])
    .map((ev) => ({ ev, score: scoreEvent(ev, s) }))
    .sort((a, b) => b.score - a.score);
  const picked = scored.filter((x) => x.score >= 1.4).slice(0, MAX_NOW_CARDS);
  return picked.map(({ ev, score }) => ({
    ev,
    score,
    tone: toneOf(ev),
    why: whyImportant(ev, s),
  }));
}

function whyImportant(ev, s) {
  const parts = [];
  if (ev.severity === 'critical') parts.push('重大な出来事');
  else if (ev.severity === 'warning') parts.push('警戒すべき動き');
  if (ev.locationId === s.playerLocationId) parts.push('あなたの現在地');
  if ((ev.npcIds || []).some((id) => (s.playerNpcMilestones || {})[id])) parts.push('絆のある人物が関与');
  const age = (s.worldTurn || 0) - ev.worldTurn;
  parts.push(age <= 0 ? 'このターンの出来事' : `${age}ターン前`);
  return parts;
}

/** RISING — pressures worth watching. */
function deriveRising(s) {
  const items = [];

  // 1. market spikes/slides from real price history (derived trend on observed series)
  for (const [locId, byCommodity] of Object.entries(s.marketPriceHistory || {})) {
    for (const [cid, series] of Object.entries(byCommodity)) {
      if (!Array.isArray(series) || series.length < 3) continue;
      const last = series[series.length - 1];
      const base = series[0];
      const delta = (last - base) / (base || 1);
      if (Math.abs(delta) < 0.12) continue;
      items.push({
        kind: 'market',
        weight: Math.abs(delta) * 2 + (Math.abs(delta) > 0.4 ? 1 : 0),
        locId, cid, series, last, delta,
        title: `${nameOf('commodities', cid)}の相場が${delta > 0 ? '上がり続けている' : '下がり続けている'}`,
        sub: `${nameOf('locations', locId)} — 指数 x${last.toFixed(2)}（観測期間で${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%）`,
        facts: [
          { kind: 'fact', text: `marketPriceHistory[${locId}][${cid}] の実測 ${series.length} 点（最新 x${last.toFixed(2)}）` },
          { kind: 'derived', text: `期間変化率 ${delta > 0 ? '+' : ''}${Math.round(delta * 100)}% はこの画面が計算した傾向` },
        ],
      });
    }
  }

  // 2. faction conflicts (observed pair value, derived "tension" framing)
  for (const [key, val] of Object.entries(s.npcFactionRelationships || {})) {
    if (val > -40) continue;
    const [a, b] = key.split('|');
    items.push({
      kind: 'faction',
      weight: Math.abs(val) / 25,
      title: `${nameOf('factions', a)} と ${nameOf('factions', b)} の対立`,
      sub: `関係値 ${val} — 敵対域に入っている`,
      meter: Math.min(1, Math.abs(val) / 100),
      tone: val <= -70 ? 'critical' : 'warning',
      facts: [
        { kind: 'fact', text: `npcFactionRelationships["${key}"] = ${val}` },
        { kind: 'derived', text: '「対立が高まっている」という表現はこの値の解釈' },
      ],
    });
  }

  // 3. fragile cohesion inside a faction
  for (const [fid, val] of Object.entries(s.npcFactionCohesion || {})) {
    if (val > 40) continue;
    items.push({
      kind: 'cohesion',
      weight: (45 - val) / 20,
      title: `${nameOf('factions', fid)}の内部に亀裂`,
      sub: `結束値 ${val} — 内部対立が表面化しうる`,
      meter: Math.min(1, (60 - val) / 60),
      tone: val <= 25 ? 'critical' : 'warning',
      facts: [
        { kind: 'fact', text: `npcFactionCohesion["${fid}"] = ${val}` },
        { kind: 'derived', text: '「亀裂」はしきい値（≦40）による読み取り' },
      ],
    });
  }

  // 4. dangerous regions
  for (const [rid, region] of Object.entries(s.regions || {})) {
    const lvl = region.dangerLevel || 0;
    if (lvl < 3) continue;
    items.push({
      kind: 'region',
      weight: lvl / 2,
      title: `${nameOf('regions', rid)}の危険度が高い`,
      sub: `危険度 ${lvl}${region.controllingFaction ? ` — ${nameOf('factions', region.controllingFaction)}の支配下` : ''}`,
      meter: Math.min(1, lvl / 5),
      tone: lvl >= 5 ? 'critical' : 'warning',
      facts: [
        { kind: 'fact', text: `regions["${rid}"].dangerLevel = ${lvl}` },
        region.controllingFaction
          ? { kind: 'fact', text: `controllingFaction = ${nameOf('factions', region.controllingFaction)}` }
          : { kind: 'uncertain', text: 'この地域の支配勢力は記録されていない' },
      ],
    });
  }

  // 5. ongoing global events with a clock
  for (const g of s.globalEvents || []) {
    if (g.severity === 'minor') continue;
    items.push({
      kind: 'global',
      weight: g.severity === 'catastrophic' ? 4 : g.severity === 'major' ? 3 : 1.6,
      title: g.description.length > 42 ? g.description.slice(0, 42) + '…' : g.description,
      sub: g.turnsRemaining != null ? `残り約${g.turnsRemaining}ターン続く見込み` : '終わりは見えていない',
      tone: g.severity === 'major' || g.severity === 'catastrophic' ? 'critical' : 'warning',
      facts: [
        { kind: 'fact', text: `globalEvents: 「${g.description}」（severity: ${g.severity}）` },
        g.turnsRemaining != null
          ? { kind: 'fact', text: `turnsRemaining = ${g.turnsRemaining}` }
          : { kind: 'uncertain', text: '残り期間は記録されていない' },
      ],
    });
  }

  items.sort((a, b) => b.weight - a.weight);
  return items.slice(0, 6);
}

/** PEOPLE — relationship threads + player bonds + whereabouts. */
function derivePeople(s) {
  const threads = [];
  const milestones = s.npcMilestones || {};
  for (const [key, val] of Object.entries(s.npcRelationships || {})) {
    const label = describeRelationship(val);
    if (label === 'neutral') continue;
    const [a, b] = key.split('|');
    const ms = (milestones[key] || [])[((milestones[key] || []).length - 1)] || null;
    threads.push({
      key, a, b, val, label, milestone: ms,
      weight: Math.abs(val) + (ms ? 25 : 0),
    });
  }
  threads.sort((x, y) => y.weight - x.weight);

  const playerBonds = Object.entries(s.playerNpcMilestones || {}).map(([npcId, kinds]) => ({
    npcId, kinds,
  }));

  // whereabouts: production rule — precision degrades with playerTrust
  const moving = [];
  for (const [npcId, pos] of Object.entries(s.npcPositions || {})) {
    const npc = (s.npcs || {})[npcId] || {};
    const trust = typeof npc.playerTrust === 'number' ? npc.playerTrust : 50;
    const unknownLoc = !names().locations[pos.locationId];
    const uncertain = trust <= TRUST_WHEREABOUTS_UNKNOWN_MAX || unknownLoc || npc.locationId === null;
    if (pos.agenda || uncertain) {
      moving.push({ npcId, pos, npc, uncertain });
    }
  }

  return { threads: threads.slice(0, 6), playerBonds, moving: moving.slice(0, 5) };
}

/** PLACES — where change is concentrating. */
function derivePlaces(s) {
  const rows = new Map();
  const ensure = (locId) => {
    if (!rows.has(locId)) rows.set(locId, { locId, events: [], npcs: [], marketNote: null, staleTurns: null, weight: 0 });
    return rows.get(locId);
  };

  for (const ev of s.recentChanges || []) {
    if (!ev.locationId || !names().locations[ev.locationId]) continue;
    const r = ensure(ev.locationId);
    r.events.push(ev);
    r.weight += ev.severity === 'critical' ? 3 : ev.severity === 'warning' ? 2 : 0.8;
  }
  for (const [npcId, pos] of Object.entries(s.npcPositions || {})) {
    if (!names().locations[pos.locationId]) continue;
    ensure(pos.locationId).npcs.push(npcId);
  }
  for (const [locId, stocks] of Object.entries(s.markets || {})) {
    const r = ensure(locId);
    const spiky = Object.entries(stocks).filter(([, v]) => v.priceIndex >= 1.4 || v.stock <= 8);
    if (spiky.length > 0) {
      const [cid, v] = spiky[0];
      r.marketNote = v.stock <= 8
        ? `${nameOf('commodities', cid)}の在庫がわずか${v.stock}`
        : `${nameOf('commodities', cid)}が x${v.priceIndex.toFixed(2)} に高騰`;
      r.weight += 1.5;
    }
  }
  for (const [locId, turn] of Object.entries(s.lastVisitTurnByLocation || {})) {
    if (!names().locations[locId]) continue;
    const r = ensure(locId);
    r.staleTurns = (s.worldTurn || 0) - turn;
  }
  if (s.playerLocationId) ensure(s.playerLocationId).weight += 0.5;

  return [...rows.values()].sort((a, b) => b.weight - a.weight).slice(0, 6);
}

/* ---------- long-campaign filler chronicle (prototype device) ----------
   The 128-turn scenario hand-writes only the notable chapters; the bulk of
   the historical record is expanded here deterministically so the UI can be
   exercised against ~300 events without a megabyte of JSON. Every generated
   event still matches the ChronicleEvent shape. */
const FILLER_TEXT = {
  travel: ['街道を進んだ', '峠を越えた', '野営して一夜を明かした', '渡し船で川を越えた'],
  combat: ['1d20+4=15 (哨戒との小競り合い)', '1d20+2=8 (待ち伏せを受けた)', '1d20+6=22 (夜襲を退けた)'],
  world: ['小競り合いの報が届いた', '相場が小さく揺れた', '難民の隊列が街道を過ぎた', '斥候が新たな敵影を報告した'],
  quest: ['クエスト完了: 補給線の護衛', 'クエスト完了: 伝令の護送', 'クエスト完了: 偵察行'],
};
function generateFillerChapters(s) {
  if (!s.generateFillerChronicle || !Array.isArray(s.majorArcs)) return [];
  const chapters = [];
  const rand = mulberry32(128);
  let chapterIndex = 1;
  for (const arc of s.majorArcs) {
    const span = arc.toTurn - arc.fromTurn;
    const chapterCount = Math.max(2, Math.round(span / 6));
    for (let c = 0; c < chapterCount && chapterIndex < 24; c++) {
      const t0 = arc.fromTurn + Math.floor((span * c) / chapterCount);
      const events = [];
      const n = 8 + Math.floor(rand() * 8);
      for (let i = 0; i < n; i++) {
        const kinds = ['travel', 'combat', 'world', 'quest'];
        const kind = kinds[Math.floor(rand() * kinds.length)];
        const pool = FILLER_TEXT[kind];
        events.push({
          worldTurn: t0 + Math.floor(rand() * Math.max(1, span / chapterCount)),
          gmTurn: t0 + i,
          kind,
          text: pool[Math.floor(rand() * pool.length)],
        });
      }
      events.sort((a, b) => a.worldTurn - b.worldTurn);
      chapters.push({ index: chapterIndex, title: `第${chapterIndex}章 — ${arc.title}より`, arcId: arc.id, events });
      chapterIndex++;
    }
  }
  return chapters;
}

/* ============================================================
   RENDERING
   ============================================================ */

function render() {
  const s = scn();
  const tension = deriveTension(s);
  document.body.dataset.tension = tension;
  $('tension-word').textContent = tension === 'crisis' ? '緊迫' : tension === 'stirring' ? 'ざわめき' : '静穏';
  $('world-name').textContent = names().world + ' — ' + s.label;
  $('turn-chip').textContent = `T${s.worldTurn}`;

  renderNow(s);
  renderRising(s);
  renderPeople(s);
  renderPlaces(s);
  renderChronicle(s);
}

/* ---------- NOW ---------- */
function renderNow(s) {
  const wrap = $('now-cards');
  wrap.replaceChildren();
  const picks = deriveNow(s);

  if (picks.length === 0) {
    const calm = el('div', 'now-calm');
    calm.append(
      document.createTextNode(
        (s.recentChanges || []).length === 0
          ? 'まだ何も記録されていません。世界はこれから動き出します。'
          : '世界は静かです。大きな動きはありません。'
      ),
      el('em', null, '静けさも情報です — 重要度のしきい値を超える出来事がない状態を、そのまま伝えています。')
    );
    wrap.append(calm);
    return;
  }

  for (const pick of picks) {
    const card = el('button', 'now-card');
    card.dataset.tone = pick.tone;
    const kicker = el('div', 'now-kicker');
    kicker.append(
      el('span', null, CATEGORY_LABEL[pick.ev.category] || pick.ev.category),
      el('span', null, `T${pick.ev.worldTurn}`),
      provChip('fact'),
    );
    card.append(kicker, el('p', 'now-statement', pick.ev.message));
    const why = el('div', 'now-why');
    why.append(provChip('derived'), el('span', null, `ここに出ている理由: ${pick.why.join('・')}`));
    card.append(why);
    card.addEventListener('click', () => openDrawer(pick.ev.message, buildEventFacts(pick.ev, s, pick)));
    wrap.append(card);
  }
}

function buildEventFacts(ev, s, pick) {
  const facts = [
    { kind: 'fact', text: `記録: 「${ev.message}」`, meta: `id: ${ev.id} / T${ev.worldTurn} / source: ${ev.source} / severity: ${ev.severity}` },
  ];
  if (ev.factionId) facts.push({ kind: 'fact', text: `関与派閥: ${nameOf('factions', ev.factionId)}${ev.targetFactionId ? ` → ${nameOf('factions', ev.targetFactionId)}` : ''}` });
  if (ev.regionId) facts.push({ kind: 'fact', text: `地域: ${nameOf('regions', ev.regionId)}` });
  if (ev.locationId) facts.push({ kind: 'fact', text: `場所: ${nameOf('locations', ev.locationId)}` });
  if (ev.npcIds && ev.npcIds.length) facts.push({ kind: 'fact', text: `関係する人物: ${ev.npcIds.map(npcName).join('、')}` });
  if (pick) facts.push({ kind: 'derived', text: `重要度スコア ${pick.score.toFixed(2)}（深刻度 × 新しさ × あなたとの関わり）で上位に選ばれました` });
  return facts;
}

/* ---------- RISING ---------- */
function renderRising(s) {
  const list = $('rising-list');
  list.replaceChildren();
  const items = deriveRising(s);

  if (items.length === 0) {
    list.append(emptyNote(
      (s.marketPriceHistory || s.npcFactionRelationships)
        ? '高まりつつある圧力は観測されていません。'
        : '市場・派閥のデータがまだありません。世界が動き始めると、ここに圧力の兆候が表れます。',
      !(s.marketPriceHistory || s.npcFactionRelationships)
    ));
    return;
  }

  for (const item of items) {
    const card = el('button', 'row-card');
    const top = el('div', 'row-top');
    top.append(el('span', 'row-title', item.title), el('span', 'row-spacer'));

    if (item.kind === 'market') {
      const cls = item.delta > 0 ? 'trend-up' : 'trend-down';
      top.append(sparkline(item.series, item.delta > 0 ? 'var(--warning)' : 'var(--positive)'));
      top.append(el('span', `trend-val ${cls}`, `${item.delta > 0 ? '▲' : '▼'} x${item.last.toFixed(2)}`));
    } else {
      top.append(provChip('derived'));
    }
    card.append(top, el('div', 'row-sub', item.sub));

    if (item.meter !== undefined) {
      const track = el('div', 'pressure-track');
      const fill = el('div', 'pressure-fill');
      if (item.tone) fill.dataset.tone = item.tone;
      track.append(fill);
      card.append(track);
      requestAnimationFrame(() => { fill.style.width = `${Math.round(item.meter * 100)}%`; });
    }
    card.addEventListener('click', () => openDrawer(item.title, item.facts));
    list.append(card);
  }
}

function sparkline(series, color) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', '0 0 96 26');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const min = Math.min(...series), max = Math.max(...series);
  const range = (max - min) || 0.1;
  const pts = series.map((v, i) => {
    const x = (i * 96 / (series.length - 1)).toFixed(1);
    const y = (23 - ((v - min) / range) * 20).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts);
  line.setAttribute('stroke', color);
  svg.append(line);
  return svg;
}

/* ---------- PEOPLE ---------- */
function renderPeople(s) {
  const list = $('people-list');
  list.replaceChildren();
  const { threads, playerBonds, moving } = derivePeople(s);

  if (threads.length === 0 && playerBonds.length === 0 && moving.length === 0) {
    list.append(emptyNote('人と人との関係はまだ観測されていません。出会いと共有された出来事が、ここに糸を張っていきます。', true));
    return;
  }

  // relationship threads — a line whose weight/style IS the relationship
  for (const t of threads) {
    const card = el('button', 'row-card');
    const thread = el('div', 'thread');
    thread.append(el('span', 'thread-names', npcName(t.a)));
    const bond = el('span', 'thread-bond');
    bond.dataset.label = t.label;
    if (t.milestone) {
      const ms = el('span', 'thread-milestone', MILESTONE_ICON[t.milestone] || '');
      ms.title = MILESTONE_LABEL[t.milestone] || t.milestone;
      bond.append(ms);
    }
    thread.append(bond, el('span', 'thread-names', npcName(t.b)));
    card.append(thread);
    const sub = el('div', 'row-sub');
    sub.append(
      el('span', 'bond-label', `${BOND_WORD[t.label]}（${t.val > 0 ? '+' : ''}${t.val}）${t.milestone ? ` — ${MILESTONE_LABEL[t.milestone]}` : ''} `),
      provChip('fact'),
    );
    card.append(sub);
    card.addEventListener('click', () => openDrawer(`${npcName(t.a)} と ${npcName(t.b)}`, [
      { kind: 'fact', text: `npcRelationships["${t.key}"] = ${t.val}` },
      { kind: 'derived', text: `「${BOND_WORD[t.label]}」はしきい値（盟友≧70 / 友好≧30 / 対抗≦-30 / 敵対≦-70）による分類` },
      ...(t.milestone ? [{ kind: 'fact', text: `到達マイルストーン: ${MILESTONE_LABEL[t.milestone]}（一度きりの記録）` }] : []),
      { kind: 'uncertain', text: 'この関係が「なぜ」こうなったかの因果は記録されていません。年代記の出来事から推し量ってください。' },
    ]));
    list.append(card);
  }

  // player bonds
  if (playerBonds.length > 0) {
    const card = el('div', 'row-card');
    card.append(el('div', 'row-title', 'あなたとの絆'));
    const rowEl = el('div', 'person-chip-row');
    for (const b of playerBonds) {
      const kinds = b.kinds.map((k) => `${PLAYER_BOND_ICON[k] || ''}${PLAYER_BOND_LABEL[k] || k}`).join('・');
      rowEl.append(el('span', 'badge', `${npcName(b.npcId)}: ${kinds}`));
    }
    card.append(rowEl);
    list.append(card);
  }

  // whereabouts / movements
  for (const m of moving) {
    const card = el('button', 'row-card');
    const top = el('div', 'row-top');
    const mood = m.npc.mood ? MOOD_LABEL[m.npc.mood] : null;
    const title = el('span', 'row-title');
    if (m.npc.mood) {
      const dot = el('span', `mood-dot mood-${m.npc.mood}`);
      dot.title = mood || '';
      title.append(dot);
    }
    title.append(document.createTextNode(npcName(m.npcId)));
    top.append(title, el('span', 'row-spacer'), provChip(m.uncertain ? 'uncertain' : 'fact'));
    card.append(top);
    const sub = m.uncertain
      ? '足取りがつかめない。最後の観測は信頼できる精度ではありません。'
      : `${nameOf('locations', m.pos.locationId)}へ${m.pos.agenda ? ` — ${AGENDA_LABEL[m.pos.agenda] || m.pos.agenda}` : ''}${m.pos.reason ? `（${m.pos.reason}）` : ''}`;
    card.append(el('div', 'row-sub', sub));
    card.addEventListener('click', () => openDrawer(npcName(m.npcId), [
      m.uncertain
        ? { kind: 'uncertain', text: '居場所の観測なし、または信頼度が低く精度が「不明」に落ちている（信頼度≦30で居場所は開示されない仕様）' }
        : { kind: 'fact', text: `npcPositions: ${nameOf('locations', m.pos.locationId)} 到着T${m.pos.arrivesTurn}` },
      ...(m.pos.agenda ? [{ kind: 'fact', text: `行動方針: ${AGENDA_LABEL[m.pos.agenda] || m.pos.agenda}${m.pos.reason ? ` / 理由: ${m.pos.reason}` : ''}` }] : []),
      ...(mood ? [{ kind: 'fact', text: `気分: ${mood}` }] : []),
    ]));
    list.append(card);
  }
}

/* ---------- PLACES ---------- */
function renderPlaces(s) {
  const list = $('places-list');
  list.replaceChildren();
  const places = derivePlaces(s);

  if (places.length === 0) {
    list.append(emptyNote('場所ごとの動きはまだ観測されていません。', true));
    return;
  }

  for (const p of places) {
    const card = el('button', 'row-card');
    const top = el('div', 'row-top');
    top.append(el('span', 'row-title', nameOf('locations', p.locId)), el('span', 'row-spacer'));
    const region = findRegionOf(s, p.locId);
    if (region && region.dangerLevel >= 3) top.append(el('span', 'badge badge-danger', `危険度${region.dangerLevel}`));
    if (p.locId === s.playerLocationId) top.append(el('span', 'badge badge-here', '現在地'));
    card.append(top);

    const notes = [];
    if (p.events.length > 0) notes.push(p.events[p.events.length - 1].message);
    if (p.marketNote) notes.push(p.marketNote);
    if (p.npcs.length > 0) notes.push(`${p.npcs.slice(0, 3).map(npcName).join('、')}${p.npcs.length > 3 ? ' ほか' : ''}が滞在`);
    if (notes.length > 0) card.append(el('div', 'row-sub', notes.join(' ／ ')));

    if (p.staleTurns != null && p.staleTurns > AGE_FADE_TURNS) {
      const badges = el('div', 'place-badges');
      badges.append(el('span', 'badge badge-stale', `最後に訪れてから${p.staleTurns}ターン — 状況は変わっているかもしれません`));
      card.append(badges);
    }

    card.addEventListener('click', () => openDrawer(nameOf('locations', p.locId), [
      ...p.events.map((ev) => ({ kind: 'fact', text: ev.message, meta: `T${ev.worldTurn} / ${ev.severity}` })),
      ...(p.marketNote ? [{ kind: 'fact', text: p.marketNote }] : []),
      ...(p.npcs.length ? [{ kind: 'fact', text: `滞在中: ${p.npcs.map(npcName).join('、')}` }] : []),
      ...(p.staleTurns != null && p.staleTurns > AGE_FADE_TURNS
        ? [{ kind: 'uncertain', text: `${p.staleTurns}ターン前の観測を含みます。現地の今は保証されません。` }]
        : []),
    ]));
    list.append(card);
  }
}

function findRegionOf(s, locId) {
  // prototype simplification: locations map to regions by sample-data convention
  const regionByLoc = {
    lumina_capital: 'central_plains', hallow_town: 'central_plains',
    versa_port: 'harbor_reach', gorge_fort: 'mistpeak_mountains', sylva_village: 'mistpeak_mountains',
  };
  const rid = regionByLoc[locId];
  return rid ? (s.regions || {})[rid] : undefined;
}

/* ---------- CHRONICLE ---------- */
function renderChronicle(s) {
  const arcsWrap = $('arcs-strip');
  const recentWrap = $('chronicle-recent');
  const chaptersWrap = $('chronicle-chapters');
  arcsWrap.replaceChildren();
  recentWrap.replaceChildren();
  chaptersWrap.replaceChildren();

  // pinned major arcs (long campaigns only)
  for (const arc of s.majorArcs || []) {
    const pin = el('button', 'arc-pin');
    pin.append(
      el('div', 'arc-title', `📌 ${arc.title}`),
      el('div', 'arc-range', `T${arc.fromTurn} – T${arc.toTurn} ・ ${arc.eventCount}件の出来事`),
      el('div', 'arc-summary', arc.summary),
    );
    pin.addEventListener('click', () => openDrawer(arc.title, [
      { kind: 'derived', text: arc.summary, meta: `T${arc.fromTurn}–T${arc.toTurn}` },
      { kind: 'fact', text: `${arc.eventCount}件の年代記イベントがこの期間に記録されています` },
      { kind: 'derived', text: '大きな物語の弧としてピン留めされ、古い章が畳まれても消えません' },
    ]));
    arcsWrap.append(pin);
  }

  // recent lane
  recentWrap.append(el('div', 'lane-heading', 'さいきんの出来事'));
  const allChapters = [...generateFillerChapters(s), ...(s.chronicleChapters || [])];
  const recentEvents = [
    ...allChapters.flatMap((ch) => ch.events),
  ].sort((a, b) => a.worldTurn - b.worldTurn).slice(-RECENT_LANE_ROWS);

  if (recentEvents.length === 0) {
    recentWrap.append(emptyNote('年代記はまだ白紙です。最初のページはあなたが書きます。', true));
  } else {
    for (const evd of [...recentEvents].reverse()) {
      recentWrap.append(chronRow(evd, s));
    }
  }

  // chapters lane — newest first, old chapters collapsed, oldest behind a fold
  chaptersWrap.append(el('div', 'lane-heading', '章ごとのあゆみ'));
  if (allChapters.length === 0) {
    chaptersWrap.append(emptyNote('章はまだありません。', true));
    return;
  }
  const newestFirst = [...allChapters].sort((a, b) => b.index - a.index);
  const visible = newestFirst.slice(0, 4);
  const hidden = newestFirst.slice(4);

  for (const ch of visible) chaptersWrap.append(chapterFold(ch, s, ch === newestFirst[0]));

  if (hidden.length > 0) {
    const more = el('button', 'chron-more', `古い${hidden.length}章を表示（${hidden.reduce((n, c) => n + c.events.length, 0)}件の出来事）`);
    more.addEventListener('click', () => {
      more.remove();
      for (const ch of hidden) chaptersWrap.append(chapterFold(ch, s, false));
    });
    chaptersWrap.append(more);
  }
}

function chronRow(evd, s) {
  const row = el('div', 'chron-row');
  const age = (s.worldTurn || 0) - evd.worldTurn;
  if (age > AGE_FADE_TURNS) row.classList.add('aged');
  row.append(
    el('span', 'chron-turn', `T${evd.worldTurn}`),
    el('span', `chron-dot k-${evd.kind}`),
    el('span', 'chron-text', evd.text),
  );
  return row;
}

function chapterFold(ch, s, open) {
  const details = el('details', 'chapter-fold');
  if (open) details.open = true;
  const summary = el('summary');
  summary.append(el('span', null, ch.title), el('span', 'chapter-count', `${ch.events.length}件`));
  details.append(summary);
  for (const evd of ch.events) details.append(chronRow(evd, s));
  return details;
}

/* ---------- shared empty note ---------- */
function emptyNote(text, uncertain) {
  const note = el('div', 'empty-note');
  if (uncertain) note.append(provChip('uncertain'));
  note.append(document.createTextNode(text));
  return note;
}

/* ============================================================
   DRAWER — "show your work" panel
   ============================================================ */

function openDrawer(title, facts) {
  lastFocusedTrigger = document.activeElement;
  $('drawer-title').textContent = '根拠';
  const body = $('drawer-body');
  body.replaceChildren();
  body.append(el('p', 'drawer-statement', title));
  const list = el('div', 'fact-list');
  for (const f of facts) {
    const item = el('div', 'fact-item');
    item.append(provChip(f.kind), document.createTextNode(f.text));
    if (f.meta) item.append(el('div', 'fact-meta', f.meta));
    list.append(item);
  }
  body.append(list);
  body.append(el('p', 'drawer-note', 'World Pulse は閲覧専用です。ここに表示される内容が世界の状態を変えることはありません。「兆候」はこの画面の解釈であり、GMやシミュレーションの判断を拘束しません。'));
  $('drawer').hidden = false;
  $('drawer-scrim').hidden = false;
  $('drawer-close').focus();
}

function closeDrawer() {
  $('drawer').hidden = true;
  $('drawer-scrim').hidden = true;
  if (lastFocusedTrigger && document.contains(lastFocusedTrigger)) lastFocusedTrigger.focus();
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

function selectScenario(key) {
  scenarioKey = key;
  buildTabs();
  render();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('drawer').hidden) closeDrawer();
});

/* ============================================================
   BOOT
   ============================================================ */

$('drawer-close').addEventListener('click', closeDrawer);
$('drawer-scrim').addEventListener('click', closeDrawer);
$('legend-toggle').addEventListener('click', () => {
  const legend = $('provenance-legend');
  const open = legend.hidden;
  legend.hidden = !open;
  $('legend-toggle').setAttribute('aria-expanded', String(open));
});

fetch('sample-data.json')
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then((json) => {
    DATA = json;
    buildTabs();
    render();
  })
  .catch((err) => {
    console.error('World Pulse prototype: failed to load sample-data.json', err);
    $('load-error').hidden = false;
    document.querySelector('main').hidden = true;
  });
