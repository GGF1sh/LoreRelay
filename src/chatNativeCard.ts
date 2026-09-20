/** Static MCP Apps view. All values arrive from an authorized tool result; no fetch,
 * credential storage, model calls or game operations exist in this component. */
export const CHAT_NATIVE_CARD_URI = 'ui://lorerelay/public-state-v1.html';
export const CHAT_NATIVE_CARD_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;font:15px/1.6 system-ui,sans-serif}*{box-sizing:border-box}
body{margin:0;padding:20px;background:Canvas;color:CanvasText;overflow-wrap:anywhere}
header{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}h1{font-size:22px;margin:0}
.tag{font-size:12px;border:1px solid GrayText;border-radius:20px;padding:2px 10px}
#status{color:GrayText;font-size:13px}dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}
dl>div{border:1px solid GrayText;border-radius:10px;padding:12px}dt{font-size:12px;color:GrayText}dd{margin:4px 0 0;font-size:19px}
details{border-top:1px solid GrayText;padding:10px 0}summary{cursor:pointer;font-weight:600}summary:focus-visible{outline:2px solid Highlight;outline-offset:3px}
ul{padding-left:22px}li{margin:6px 0}.note{font-size:12px;color:GrayText}
@media(max-width:380px){body{padding:12px}dl{grid-template-columns:1fr}dd{font-size:17px}}
</style></head><body><header><h1>LoreRelay</h1><span class="tag">公開状態・読取専用</span></header>
<p id="status" role="status">Hostの公開状態を待っています。</p>
<main id="state" hidden><dl><div><dt>現在地</dt><dd id="location"></dd></div><div><dt>世界ターン</dt><dd id="turn"></dd></div><div><dt>所持金</dt><dd id="credits"></dd></div></dl>
<details open><summary>積荷</summary><ul id="cargo"></ul></details>
<details><summary>利用できる行動</summary><ul id="actions"></ul></details>
<details><summary>最近の公開イベント</summary><ul id="events"></ul></details>
<p class="note">取得時点のスナップショットです。行動の確定や最新価格を保証する表示ではありません。</p></main>
<script>
(() => {
 const element = id => document.getElementById(id);
 const scalar = value => typeof value === 'string' ? value.slice(0, 300) : typeof value === 'number' && Number.isFinite(value) ? String(value) : '未確認';
 const list = (id, values, label, empty) => {
   const target = element(id); target.replaceChildren();
   const rows = Array.isArray(values) ? values.slice(0, 30) : [];
   for (const value of rows) { const li = document.createElement('li'); li.textContent = label(value); target.append(li); }
   if (!rows.length) { const li = document.createElement('li'); li.textContent = empty; target.append(li); }
 };
 const render = result => {
   const view = result?.view;
   if (!view || typeof view !== 'object' || view.classification) {
     element('state').hidden = true; element('status').textContent = '公開状態を取得できませんでした。Hostの接続を確認してください。'; return;
   }
   element('location').textContent = scalar(view.geography?.currentLocation?.name ?? view.currentLocationId);
   element('turn').textContent = scalar(view.worldTurn);
   element('credits').textContent = scalar(view.commerce?.credits);
   list('cargo', view.commerce?.cargo, item => scalar(item?.commodityId) + ' × ' + scalar(item?.qty), '公開された積荷はありません。');
   const names = {'commerce:trade':'取引', 'commerce:travel':'市場へ移動', 'commerce:end_day':'日送り'};
   list('actions', view.availableActions, item => names[item?.actionId] ?? '未確認の行動', '公開された行動候補はありません。');
   list('events', view.recentEvents, item => scalar(item?.message), '表示対象の公開イベントはありません。');
   element('state').hidden = false; element('status').textContent = '公開状態を表示しています。自動更新はしません。';
 };
 window.addEventListener('message', event => {
   if (event.source !== window.parent || !event.data || event.data.jsonrpc !== '2.0') return;
   const message = event.data;
   if (message.id === 'lorerelay-ui-init' && message.result) {
     window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}}, '*');
   }
   if (message.method === 'ui/notifications/tool-result') render(message.params?.isError ? null : message.params?.structuredContent);
 }, {passive:true});
 if (window.parent !== window) window.parent.postMessage({jsonrpc:'2.0',id:'lorerelay-ui-init',method:'ui/initialize',
   params:{appInfo:{name:'LoreRelay public state',version:'1.0.0'},appCapabilities:{availableDisplayModes:['inline']},protocolVersion:'2026-01-26'}}, '*');
 if (typeof ResizeObserver !== 'undefined' && window.parent !== window) new ResizeObserver(() => {
   window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',
     params:{height:Math.min(3000,Math.max(100,Math.ceil(document.body.getBoundingClientRect().height)))}}, '*');
 }).observe(document.body);
})();
</script></body></html>`;
