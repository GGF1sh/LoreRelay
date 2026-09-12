window.worldGenesisExperience = (() => {
  const keys = ['commerce', 'reputation', 'encounters', 'npcAgency', 'relationships', 'simulation', 'domain', 'guild', 'settlement', 'vehicles'];
  const labels = [['交易・市場', 'Trade and markets'], ['勢力の評判', 'Faction reputation'], ['旅の遭遇', 'Travel encounters'], ['NPCの自律行動', 'NPC agency'], ['NPCの人間関係', 'NPC relationships'], ['世界の自動進行', 'World simulation'], ['領地運営', 'Domain management'], ['ギルド運営', 'Guild management'], ['拠点運営', 'Settlement management'], ['乗り物', 'Vehicles']];
  const text = (ja, en) => currentLocale === 'ja' ? ja : en;
  const node = (tag, value, parent) => { const n = document.createElement(tag); if (value) n.textContent = value; if (parent) parent.append(n); return n; };
  let container, select, language, saved = [];
  const presets = [
    { id: 'light', name: ['物語中心', 'Story focused'], counts: [5, 2, 6], on: [] },
    { id: 'adventure', name: ['冒険と交易', 'Adventure and trade'], counts: [8, 3, 10], on: ['commerce', 'reputation', 'encounters', 'relationships'] },
    { id: 'living', name: ['動く世界', 'Living world'], counts: [10, 5, 15], on: ['commerce', 'reputation', 'encounters', 'relationships', 'npcAgency', 'simulation'] },
    { id: 'management', name: ['運営も楽しむ', 'World and management'], counts: [12, 6, 20], on: [...keys] },
  ];
  function options() {
    select.replaceChildren();
    node('option', text('個別設定', 'Custom'), select).value = '';
    presets.forEach(p => { node('option', text(...p.name), select).value = p.id; });
    saved.forEach((p, i) => { node('option', p.name, select).value = `saved-${i}`; });
  }
  function init(dirty, collect) {
    if (container) return;
    container = node('div'); container.className = 'world-genesis-experience';
    document.querySelector('.world-genesis-form-grid').before(container);
    select = node('select', '', node('label', text('遊び方・詳しさのプリセット', 'Play style and detail preset'), container));
    language = node('select', '', node('label', text('世界の名前に使う言語', 'World naming language'), container));
    [['ja', '日本語'], ['en', 'English'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文']].forEach(([id, title]) => { node('option', title, language).value = id; });
    language.addEventListener('change', dirty);
    const detail = node('details', '', container); detail.open = true;
    node('summary', text('使う機能を調整', 'Adjust enabled features'), detail);
    const grid = node('div', '', detail); grid.className = 'world-genesis-feature-grid';
    keys.forEach((key, i) => {
      const row = node('label', '', grid), input = node('input', '', row); input.type = 'checkbox'; input.dataset.genesisFeature = key;
      node('span', text(...labels[i]), row);
      input.addEventListener('change', () => { select.value = ''; dirty(); });
    });
    node('p', text('選んだ機能は「この世界を使う」で反映します。地域・勢力・人物の数は下で調整できます。', 'Features take effect when you use this world. Adjust world size below.'), detail);
    const saveRow = node('div', '', container); saveRow.className = 'world-genesis-seed-row';
    const name = node('input', '', saveRow); name.maxLength = 80; name.placeholder = text('自作プリセット名', 'My preset name'); name.setAttribute('aria-label', name.placeholder);
    const save = node('button', text('設定を保存（同名は更新）', 'Save preset (replace same name)'), saveRow); save.type = 'button'; save.className = 'glass-btn';
    save.addEventListener('click', () => { if (!name.value.trim()) { name.focus(); return; } vscode.postMessage({ type: 'worldGenesisPresetSave', ...collect(), name: name.value.trim() }); });
    select.addEventListener('change', () => {
      const p = presets.find(p => p.id === select.value);
      if (p) {
        set({ version: 1, locale: language.value, features: Object.fromEntries(keys.map(k => [k, p.on.includes(k)])) });
        ['region', 'faction', 'npc'].forEach((k, i) => { document.getElementById(`world-genesis-${k}-count`).value = p.counts[i]; });
      } else if (select.value.startsWith('saved-')) { const s = saved[Number(select.value.slice(6))]; if (s) { applyWorldGenesisInput(s.draft); name.value = s.name; } }
      dirty();
    });
    options();
  }
  function set(e) { if (!container || !e) return; language.value = e.locale; keys.forEach(k => { container.querySelector(`[data-genesis-feature="${k}"]`).checked = e.features[k] === true; }); }
  function read() { return { version: 1, locale: language?.value || currentLocale, features: Object.fromEntries(keys.map(k => [k, container?.querySelector(`[data-genesis-feature="${k}"]`)?.checked === true])) }; }
  function updatePresets(items) { saved = Array.isArray(items) ? items.filter(p => p && typeof p.name === 'string' && p.draft) : []; if (select) options(); }
  function busy(value) { container?.querySelectorAll('input, select, button').forEach(n => { n.disabled = value; }); }
  function overview(data, parent) {
    parent.replaceChildren(); if (!data?.regions?.length) return;
    node('h3', data.worldName || text('世界全体図', 'World overview'), parent);
    node('p', text('地域と道のつながり。地域を選ぶと、その中の場所を確認できます。', 'Regions and connections. Select a region to inspect its locations.'), parent);
    const make = (tag, attrs, value) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v))); if (value) n.textContent = value; return n; };
    const svg = make('svg', { viewBox: '0 0 1100 730', role: 'img', 'aria-label': text('世界の地域と接続図', 'World regions and connections') }); svg.classList.add('world-genesis-overview-map'); parent.append(svg);
    const regions = new Map(data.regions.map((r, i) => [r.id, { ...r, px: 70 + (Number.isFinite(r.x) ? r.x : (i % 4) * 270) * .94, py: 55 + (Number.isFinite(r.y) ? r.y : Math.floor(i / 4) * 300) * .59 }]));
    const seen = new Set();
    for (const r of regions.values()) for (const id of r.connectedTo || []) {
      const target = regions.get(id), key = [r.id, id].sort().join('|');
      if (target && !seen.has(key)) { seen.add(key); svg.append(make('line', { x1: r.px, y1: r.py, x2: target.px, y2: target.py, stroke: '#8ba6bf', 'stroke-width': 3 })); }
    }
    const detail = node('div', '', parent); detail.className = 'world-genesis-region-detail'; detail.setAttribute('aria-live', 'polite');
    const choose = r => { detail.replaceChildren(); node('strong', `${r.name} · ${T(`webview.worldGenesis.regionType.${r.type}`)}`, detail); const list = node('ul', '', detail); (data.locations || []).filter(l => l.regionId === r.id).forEach(l => node('li', l.name, list)); };
    const colors = { forest: '#38865a', mountains: '#897759', ocean: '#337ab0', urban: '#a373b8', dungeon: '#b95255', ruins: '#a68143', wilderness: '#588943', other: '#617484' };
    for (const r of regions.values()) {
      const circle = make('circle', { cx: r.px, cy: r.py, r: 18, fill: colors[r.type] || colors.other, stroke: '#eef6ff', 'stroke-width': 2 }); circle.addEventListener('click', () => choose(r)); svg.append(circle);
      svg.append(make('text', { x: r.px, y: r.py + 40, 'text-anchor': 'middle', fill: '#f4f8ff', 'font-size': 17, 'paint-order': 'stroke', stroke: '#101d2b', 'stroke-width': 4 }, r.name));
    }
    const buttons = node('div', '', parent); buttons.className = 'world-genesis-region-buttons';
    for (const r of regions.values()) { const b = node('button', r.name, buttons); b.type = 'button'; b.className = 'glass-btn'; b.addEventListener('click', () => choose(r)); }
    choose(regions.values().next().value);
    node('p', `${text('勢力', 'Factions')}: ${(data.factions || []).map(f => f.name).join(' · ')}`, parent);
  }
  return { init, set, read, updatePresets, busy, overview };
})();
