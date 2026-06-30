// ===== ダイスローラー =====
const diceResultEl = document.getElementById('dice-result');
const diceLogEl = document.getElementById('dice-log');
const diceSendGmBtn = document.getElementById('dice-send-gm');
let diceHistory = [];
let lastDiceRoll = '';

function rollDice(count, sides, skipSound = false) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * sides) + 1);
  }
  const total = results.reduce((a, b) => a + b, 0);
  const label = count === 1 ? `d${sides}` : `${count}d${sides}`;

  // 結果表示（アニメーション風に）
  diceResultEl.textContent = `${total}`;
  diceResultEl.style.transform = 'scale(1.2)';
  setTimeout(() => { diceResultEl.style.transform = 'scale(1)'; }, 150);

  // ログに追加
  const detail = count > 1 ? ` [${results.join(' + ')}]` : '';
  const logText = `${label}: ${total}${detail}`;
  lastDiceRoll = logText;
  if (diceSendGmBtn) diceSendGmBtn.disabled = false;

  diceHistory.unshift(logText);
  if (diceHistory.length > 5) diceHistory.pop();
  diceLogEl.textContent = diceHistory.join(' | ');

  // ゲームログにも通知
  addSystemMessage(`${T('webview.dice.logPrefix')} ${logText}`);

  // ダイスSEを再生（あれば）
  if (!skipSound) { playSfx('dice'); }
}

// GM からのダイス要求を処理 — 自動ロールし音の成否でフォールバックを判定
async function handleDiceRequest(req) {
  const notation = (req.notation || '').trim();
  const purposeText = req.purpose ? `（${req.purpose}）` : '';
  const match = /^(\d+)d(\d+)$/i.exec(notation);

  if (!match) {
    // 形式不明 — 手動ロールを促す
    addSystemMessage(T('webview.dice.requestInvalid', { notation: notation || '?' }) + purposeText);
    return;
  }

  const count = Math.max(1, Math.min(100, parseInt(match[1], 10)));
  const sides = Math.max(2, Math.min(10000, parseInt(match[2], 10)));

  // バナー表示
  addSystemMessage(T('webview.dice.requestBanner', { notation }) + purposeText);

  // 音なしで自動ロール → 別途 playSfxAsync で音を鳴らして成否を検出
  rollDice(count, sides, true);
  const soundOk = await playSfxAsync('dice');

  if (!soundOk) {
    addSystemMessage(T('webview.dice.requestFallback'));
  }
}

function sendDiceResultToGm() {
  if (!lastDiceRoll) return;
  const text = `${T('webview.dice.sendPrefix')} ${lastDiceRoll}`;
  vscode.postMessage({ type: 'freeInput', text });
  const entry = { id: `user-${Date.now()}`, role: 'user', content: text, sender: T('webview.sender.player') };
  messageHistory.push(entry);
  renderMessage(entry);
  scrollToBottom();
  saveState();
}

if (diceSendGmBtn) {
  diceSendGmBtn.disabled = true;
  diceSendGmBtn.addEventListener('click', sendDiceResultToGm);
}

// プリセットボタン（1d固定）
document.querySelectorAll('.dice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sides = parseInt(btn.dataset.sides, 10);
    rollDice(1, sides);
  });
});

// カスタムロール
document.getElementById('dice-custom-btn').addEventListener('click', () => {
  const count = Math.max(1, Math.min(100, parseInt(document.getElementById('dice-count').value, 10) || 1));
  const sides = Math.max(2, Math.min(10000, parseInt(document.getElementById('dice-sides').value, 10) || 6));
  rollDice(count, sides);
});

// ===== 電卓 =====
const calcResultEl = document.getElementById('calc-result');
const calcHistoryEl = document.getElementById('calc-history');
const calcInput = document.getElementById('calc-input');
let calcHistory = [];

// Function()/eval を使わない安全な再帰下降パーサー
function evaluateMath(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    if (/\s/.test(str[i])) { i++; continue; }
    if (/[\d.]/.test(str[i])) {
      let num = '';
      while (i < str.length && /[\d.]/.test(str[i])) num += str[i++];
      const n = Number(num);
      if (isNaN(n)) throw new Error('invalid number');
      tokens.push({ t: 'n', v: n });
    } else if (['+', '-', '*', '/', '^', '%', '(', ')'].includes(str[i])) {
      tokens.push({ t: 'o', v: str[i++] });
    } else {
      throw new Error('invalid char: ' + str[i]);
    }
  }
  let pos = 0;
  const peek = () => tokens[pos] || null;
  const consume = () => tokens[pos++];
  function parseExpr() { return parseAddSub(); }
  function parseAddSub() {
    let val = parseMulDiv();
    while (peek() && (peek().v === '+' || peek().v === '-')) {
      const op = consume().v;
      const r = parseMulDiv();
      val = op === '+' ? val + r : val - r;
    }
    return val;
  }
  function parseMulDiv() {
    let val = parsePow();
    while (peek() && ['*', '/', '%'].includes(peek().v)) {
      const op = consume().v;
      const r = parsePow();
      val = op === '*' ? val * r : op === '/' ? val / r : val % r;
    }
    return val;
  }
  function parsePow() {
    const val = parseUnary();
    if (peek() && peek().v === '^') { consume(); return Math.pow(val, parsePow()); }
    return val;
  }
  function parseUnary() {
    if (peek() && peek().v === '-') { consume(); return -parseUnary(); }
    if (peek() && peek().v === '+') { consume(); return parseUnary(); }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (!t) throw new Error('unexpected end');
    if (t.t === 'n') { consume(); return t.v; }
    if (t.v === '(') {
      consume();
      const val = parseExpr();
      if (!peek() || peek().v !== ')') throw new Error('expected )');
      consume();
      return val;
    }
    throw new Error('unexpected: ' + t.v);
  }
  const result = parseExpr();
  if (pos < tokens.length) throw new Error('trailing tokens');
  return result;
}

function calculate() {
  const expr = calcInput.value.trim();
  if (!expr) return;
  try {
    const result = evaluateMath(expr);
    if (!isFinite(result)) { calcResultEl.textContent = T('webview.calc.infinityError'); return; }
    const rounded = Math.round(result * 1e10) / 1e10;
    calcResultEl.textContent = `= ${rounded}`;
    calcHistory.unshift(`${expr} = ${rounded}`);
    if (calcHistory.length > 5) calcHistory.pop();
    calcHistoryEl.innerHTML = calcHistory.map(h => `<div>${escapeHtml(h)}</div>`).join('');
  } catch (e) {
    calcResultEl.textContent = T('webview.calc.error');
  }
}

document.getElementById('calc-btn').addEventListener('click', calculate);
calcInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    calculate();
  }
});

// ===== タブ切り替え =====
function activateStatusPane(targetId) {
  if (!targetId) { return false; }
  const targetPane = document.getElementById(targetId);
  if (!targetPane) {
    console.warn(`[LoreRelay] Status tab target not found: ${targetId}`);
    return false;
  }

  document.querySelectorAll('#status-tabs .tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.target === targetId);
  });
  document.querySelectorAll('#status-area .tab-pane').forEach((p) => {
    p.classList.toggle('active', p.id === targetId);
    // display は .tab-pane.active の CSS に任せる（inline style と !important の競合を避ける）
    p.style.removeProperty('display');
  });

  const statusArea = document.getElementById('status-area');
  if (statusArea) {
    statusArea.dataset.activePane = targetId;
    // 冒険ステータス等の長い pane で下までスクロールした後、別タブへ切替えると
    // スクロール位置が残り「真っ黒」に見えるため先頭へ戻す。
    statusArea.scrollTop = 0;
  }
  targetPane.scrollTop = 0;

  if (targetId === 'pane-character') {
    vscode.postMessage({ type: 'loadCharacters' });
  }
  if (targetId === 'pane-world') {
    vscode.postMessage({ type: 'loadWorld' });
  }
  return true;
}

const statusTabs = document.getElementById('status-tabs');
if (statusTabs) {
  statusTabs.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('.tab-btn') : null;
    if (!btn || !statusTabs.contains(btn)) { return; }
    e.preventDefault();
    activateStatusPane(btn.dataset.target);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const initial =
    document.querySelector('#status-area .tab-pane.active')?.id ||
    document.querySelector('#status-tabs .tab-btn.active')?.dataset.target ||
    'pane-status';
  activateStatusPane(initial);
});

// ===== タブバー横スクロール =====
// 通常マウスホイール（縦）をタブバーの横スクロールに変換
(function initTabBarScroll() {
  const tabsHeader = document.getElementById('status-tabs');
  if (!tabsHeader) { return; }

  // 縦ホイール → 横スクロール変換
  tabsHeader.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      tabsHeader.scrollLeft += e.deltaY * 0.8;
    }
  }, { passive: false });

  // ポインタドラッグで横スクロール（タッチ操作 / タブ背景上のドラッグ）
  let dragging = false;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;
  let dragMoved = false;
  let suppressNextClick = false;

  tabsHeader.addEventListener('click', (e) => {
    if (!suppressNextClick) { return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    suppressNextClick = false;
  }, true);

  tabsHeader.addEventListener('pointerdown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target === tabsHeader || target?.closest('.tab-btn')) {
      dragging = true;
      dragMoved = false;
      dragStartX = e.clientX;
      dragStartScrollLeft = tabsHeader.scrollLeft;
      // setPointerCapture を使わない — 使うと click が tabsHeader に再ターゲットされ
      // .tab-btn の click ハンドラーが全滅するため
    }
  });

  // document レベルで追跡することでタブバー外へドラッグしても追従する
  document.addEventListener('pointermove', (e) => {
    if (!dragging) { return; }
    const dx = e.clientX - dragStartX;
    if (Math.abs(dx) > 4) {
      dragMoved = true;
      tabsHeader.scrollLeft = dragStartScrollLeft - dx;
    }
  });

  document.addEventListener('pointerup', () => {
    if (dragging && dragMoved) {
      suppressNextClick = true;
      setTimeout(() => { suppressNextClick = false; }, 0);
    }
    dragging = false;
  });
})();
