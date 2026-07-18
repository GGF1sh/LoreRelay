#!/usr/bin/env node
'use strict';

/**
 * SETTLEMENT-VIEW-SOURCE-001 / SHOWCASE recovered visuals
 * Repository-owned harness: real Webview + JA locale + Three.js vendor URI + real worldView messages.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const REPO = path.join(__dirname, '..');
const TARGET = 'C:\\AI\\artifacts\\LoreRelay\\showcase\\current\\05-living-trade-world';
const MSG_DIR = 'C:\\AI\\artifacts\\LoreRelay\\showcase\\current\\_harness\\living-trade-settlements';
const OUT_ROOT = 'C:\\AI\\artifacts\\LoreRelay\\showcase\\review\\settlement-multi-location-showcase-centered';
const HARNESS = path.join(OUT_ROOT, 'harness');
const PORT = 8788;
const DEBUG_PORT = 9260;
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const VIEWPORT = { width: 1600, height: 1000 };
const OVERALL_TIMEOUT_MS = 8 * 60 * 1000;

const CITIES = [
    'loc_sapphire_port',
    'loc_reedmarket',
    'loc_mistgrove',
    'loc_ironspire',
    'loc_glass_oasis',
    'loc_watchkeep',
];

const EXPECTED_IDS = {
    loc_sapphire_port: 'set_sapphire_port',
    loc_reedmarket: 'set_reedmarket',
    loc_mistgrove: 'set_mistgrove',
    loc_ironspire: 'set_ironspire',
    loc_glass_oasis: 'set_glass_oasis',
    loc_watchkeep: 'set_watchkeep',
};

const SHOTS = [
    { file: '00-sapphire-roads-world-context.png', scenario: 'world', mode: 'world' },
    ...CITIES.map((c, i) => ({
        file: `${String(i + 1).padStart(2, '0')}-${c.replace('loc_', '').replace(/_/g, '-')}-settlement.png`,
        scenario: c,
        mode: 'settlement',
    })),
    ...CITIES.map((c, i) => ({
        file: `${String(i + 7).padStart(2, '0')}-${c.replace('loc_', '').replace(/_/g, '-')}-diorama.png`,
        scenario: c,
        mode: 'diorama',
    })),
];

// Fix naming: sapphire-port etc.
SHOTS[1].file = '01-sapphire-port-settlement.png';
SHOTS[2].file = '02-reedmarket-settlement.png';
SHOTS[3].file = '03-mistgrove-settlement.png';
SHOTS[4].file = '04-ironspire-settlement.png';
SHOTS[5].file = '05-glass-oasis-settlement.png';
SHOTS[6].file = '06-watchkeep-settlement.png';
SHOTS[7].file = '07-sapphire-port-diorama.png';
SHOTS[8].file = '08-reedmarket-diorama.png';
SHOTS[9].file = '09-mistgrove-diorama.png';
SHOTS[10].file = '10-ironspire-diorama.png';
SHOTS[11].file = '11-glass-oasis-diorama.png';
SHOTS[12].file = '12-watchkeep-diorama.png';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function killChromeOnPort() {
    try {
        execSync(
            `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -match 'remote-debugging-port=${DEBUG_PORT}|settlement-multi-location-showcase-recovered' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
            { stdio: 'ignore' }
        );
    } catch (_) { /* ignore */ }
}

function ensureMessages() {
    if (!fs.existsSync(TARGET)) {
        console.error('Missing scenario. Run: node scripts/create_ui_showcase_scenarios.js');
        process.exit(1);
    }
    const need = CITIES.some((c) => !fs.existsSync(path.join(MSG_DIR, `${c}.worldView.json`)));
    if (!need && fs.existsSync(path.join(MSG_DIR, '..', 'living-trade-worldView.json'))) {
        return;
    }
    console.log('Capturing host worldView messages...');
    execSync('node scripts/capture_living_trade_settlements.js', { cwd: REPO, stdio: 'inherit' });
    if (!fs.existsSync(path.join(MSG_DIR, '..', 'living-trade-worldView.json'))) {
        execSync('node scripts/capture_living_trade_worldview.js', { cwd: REPO, stdio: 'inherit' });
    }
}

function prepareHarness() {
    fs.mkdirSync(OUT_ROOT, { recursive: true });
    const web = path.join(HARNESS, 'webview');
    const msgOut = path.join(HARNESS, 'messages');
    fs.mkdirSync(web, { recursive: true });
    fs.mkdirSync(msgOut, { recursive: true });
    fs.mkdirSync(path.join(web, 'vendor'), { recursive: true });

    // Copy built webview assets
    for (const f of ['script.js', 'style.css', 'index.html']) {
        fs.copyFileSync(path.join(REPO, 'webview', f), path.join(web, f));
    }
    fs.copyFileSync(path.join(REPO, 'webview', 'vendor', 'three.min.js'), path.join(web, 'vendor', 'three.min.js'));
    if (fs.existsSync(path.join(REPO, 'webview', 'vendor', 'mermaid.min.js'))) {
        fs.copyFileSync(path.join(REPO, 'webview', 'vendor', 'mermaid.min.js'), path.join(web, 'vendor', 'mermaid.min.js'));
    } else {
        fs.writeFileSync(path.join(web, 'vendor', 'mermaid.min.js'), 'window.mermaid={initialize:function(){},render:async function(){return{svg:""}}};');
    }
    fs.copyFileSync(path.join(REPO, 'locales', 'ja.json'), path.join(HARNESS, 'ja.json'));

    // Theme from prior harness if present
    const themeCandidates = [
        'C:\\AI\\artifacts\\LoreRelay\\showcase\\review\\settlement-multi-location-showcase\\harness\\vscode-theme.css',
        'C:\\AI\\artifacts\\LoreRelay\\showcase\\review\\inspector-redesign-002\\harness\\vscode-theme.css',
    ];
    let theme = null;
    for (const t of themeCandidates) {
        if (fs.existsSync(t)) { theme = fs.readFileSync(t, 'utf8'); break; }
    }
    if (!theme) {
        theme = `body.vscode-dark{--vscode-editor-background:#1e1e1e;--vscode-foreground:#cccccc;background:#1e1e1e;color:#ccc;}`;
    }
    fs.writeFileSync(path.join(HARNESS, 'vscode-theme.css'), theme);

    // Rewrite index placeholders for static server
    let html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
    html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/i, '');
    html = html.replace('href="{{styleUri}}"', 'href="style.css"');
    html = html.replace('src="{{scriptUri}}"', 'src="script.js"');
    html = html.replace('src="{{mermaidUri}}"', 'src="vendor/mermaid.min.js"');
    html = html.replace(/nonce="\{\{nonce\}\}"/g, '');
    html = html.replace("window.__LR_GENESIS_ASSET_BASE_URI__ = '{{genesisAssetBaseUri}}';", "window.__LR_GENESIS_ASSET_BASE_URI__ = '';");
    // Critical: real Three.js vendor URI for Diorama
    html = html.replace(
        "window.__LR_THREE_SCRIPT_URI__ = '{{threeUri}}';",
        "window.__LR_THREE_SCRIPT_URI__ = '/webview/vendor/three.min.js';"
    );
    if (!html.includes('vscode-theme.css')) {
        html = html.replace('</head>', '  <link rel="stylesheet" href="../vscode-theme.css" />\n  <script>window.acquireVsCodeApi=function(){return{postMessage:function(){},getState:function(){return null},setState:function(){}}};</script>\n</head>');
    }
    if (!html.includes('harness-boot.js')) {
        html = html.replace('</body>', '  <script src="../harness-boot.js"></script>\n</body>');
    }
    fs.writeFileSync(path.join(web, 'index.html'), html);

    // Messages
    for (const c of CITIES) {
        fs.copyFileSync(path.join(MSG_DIR, `${c}.worldView.json`), path.join(msgOut, `${c}.worldView.json`));
    }
    const worldCtx = path.join(MSG_DIR, '..', 'living-trade-worldView.json');
    if (fs.existsSync(worldCtx)) {
        fs.copyFileSync(worldCtx, path.join(msgOut, 'world_context.json'));
    } else {
        fs.copyFileSync(path.join(MSG_DIR, 'loc_sapphire_port.worldView.json'), path.join(msgOut, 'world_context.json'));
    }

    fs.writeFileSync(path.join(HARNESS, 'harness-boot.js'), `/* recovered visual harness */
(function(){
  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn); else fn(); }
  function post(msg){ window.dispatchEvent(new MessageEvent('message',{data:msg})); }
  async function loadJson(rel){ const r=await fetch(rel); if(!r.ok) throw new Error(rel+' '+r.status); return r.json(); }
  function q(k){ return new URLSearchParams(location.search).get(k); }
  async function boot(){
    document.documentElement.classList.add('vscode-dark');
    document.body.classList.add('vscode-dark');
    try{ const t=document.querySelector('.tab-btn[data-target="pane-world"]'); if(t) t.click(); }catch(e){}
    const scenario=q('scenario')||'world';
    const mapMode=q('mode')||'settlement';
    const file=scenario==='world'?'world_context.json':(scenario+'.worldView.json');
    const [ja, worldView]=await Promise.all([loadJson('../ja.json'), loadJson('../messages/'+file)]);
    post({type:'localeBundle', locale:'ja', strings:ja});
    post({type:'gameStateUpdate', state:{ world:{ currentLocationId: worldView.currentLocationId||'loc_sapphire_port' }, status:{ location:'サファイア港', hp:18, maxHp:20 } }, fullHistory:true, syncSeq:1});
    post(worldView);
    const hub=document.getElementById('start-hub'); if(hub) hub.classList.add('hidden');
    setTimeout(function(){
      try{
        const m = mapMode==='diorama'?'diorama':(mapMode==='world'?'tile':'settlement');
        if(typeof setWorldMapMode==='function') setWorldMapMode(m,{persist:false});
        else {
          const id=m==='diorama'?'world-map-mode-diorama':m==='tile'?'world-map-mode-tile':'world-map-mode-settlement';
          const b=document.getElementById(id); if(b) b.click();
        }
        if(typeof renderSettlementSourceSelector==='function') renderSettlementSourceSelector(worldView);
      }catch(e){}
      window.__LR_HARNESS_READY__=true;
      document.documentElement.setAttribute('data-harness-ready','1');
    }, 200);
  }
  ready(function(){ setTimeout(function(){ boot().catch(function(err){ console.error(err); document.documentElement.setAttribute('data-harness-error', String(err&&err.message||err)); }); }, 60); });
  window.__LR_HARNESS_PROBE__=function(){
    const cs=getComputedStyle(document.body);
    const banners=[document.getElementById('world-settlement-focus-banner'),document.getElementById('world-diorama-focus-banner')].filter(Boolean);
    const banner=banners.find(function(el){return !el.classList.contains('hidden');})||null;
    const mb=document.getElementById('world-settlement-mobile-base-banner');
    const text=(document.body&&document.body.innerText)||'';
    return {
      ready: window.__LR_HARNESS_READY__===true,
      bodyBg: cs.backgroundColor,
      hasJa: /プレビュー|現在地|集落|世界|サファイア/.test(text+(banner?banner.innerText:'')),
      hasKeyLeak: /webview\\.[a-zA-Z0-9_.]+/.test(text),
      bannerVisible: !!(banner && !banner.classList.contains('hidden')),
      mbBannerVisible: !!(mb && !mb.classList.contains('hidden')),
      mbBannerText: mb && !mb.classList.contains('hidden') ? mb.textContent : null,
      three: typeof THREE!=='undefined',
      styleSheets: Array.from(document.styleSheets||[]).map(function(s){ try{return s.href||'';}catch(e){return '';} }),
    };
  };
})();
`);
}

function startServer() {
    const server = http.createServer((req, res) => {
        try {
            const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
            const rel = urlPath === '/' ? '/webview/index.html' : urlPath;
            const filePath = path.normalize(path.join(HARNESS, rel.replace(/^\//, '')));
            if (!filePath.startsWith(HARNESS)) { res.writeHead(403); res.end('forbidden'); return; }
            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404); res.end('not found ' + rel); return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            fs.createReadStream(filePath).pipe(res);
        } catch (e) {
            res.writeHead(500); res.end(String(e));
        }
    });
    return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function chromeJson(pathname) {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}${pathname}`);
    if (!res.ok) throw new Error(`CDP HTTP ${res.status}`);
    return res.json();
}

class Cdp {
    constructor(wsUrl) {
        this.wsUrl = wsUrl; this.ws = null; this.nextId = 1; this.pending = new Map();
    }
    async connect() {
        const WebSocket = (await import('ws')).default;
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); });
        this.ws.on('message', (data) => {
            const msg = JSON.parse(String(data));
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(JSON.stringify(msg.error)));
                else resolve(msg.result);
            }
        });
    }
    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
        return r.result && r.result.value;
    }
    close() { try { this.ws && this.ws.close(); } catch (_) {} }
}

function parseRgb(str) {
    const m = String(str || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
}
function lum(rgb) { return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b; }

async function main() {
    const deadline = Date.now() + OVERALL_TIMEOUT_MS;
    const guard = setInterval(() => {
        if (Date.now() > deadline) {
            console.error('OVERALL_TIMEOUT');
            killChromeOnPort();
            process.exit(2);
        }
    }, 2000);

    try {
        try { require.resolve('ws'); } catch {
            execSync(`npm.cmd install ws@8 --no-save --prefix "${OUT_ROOT}"`, { stdio: 'inherit', shell: true });
        }
        module.paths.unshift(path.join(OUT_ROOT, 'node_modules'));

        // Ensure webview built
        if (!fs.existsSync(path.join(REPO, 'webview', 'script.js'))
            || !fs.readFileSync(path.join(REPO, 'webview', 'script.js'), 'utf8').includes('resolveSettlementRenderSource')) {
            execSync('npm.cmd run build:webview', { cwd: REPO, stdio: 'inherit', shell: true });
        }

        ensureMessages();
        prepareHarness();
        killChromeOnPort();
        const server = await startServer();

        const chromeFlags = ['--headless=new'];
        // Prefer normal GPU WebGL; SwiftShader only as fallback if needed
        let useSwift = false;
        const userData = path.join(OUT_ROOT, '.chrome-profile');
        fs.mkdirSync(userData, { recursive: true });

        async function launch(flags) {
            killChromeOnPort();
            await sleep(300);
            const chrome = spawn(CHROME, [
                ...flags,
                `--remote-debugging-port=${DEBUG_PORT}`,
                `--user-data-dir=${userData}`,
                `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
                '--no-first-run', '--no-default-browser-check', 'about:blank',
            ], { stdio: 'ignore' });
            let version;
            for (let i = 0; i < 40; i++) {
                try { version = await chromeJson('/json/version'); break; } catch { await sleep(150); }
            }
            if (!version) {
                try { chrome.kill(); } catch (_) {}
                throw new Error('Chrome CDP failed');
            }
            let page = (await chromeJson('/json/list')).find((t) => t.type === 'page');
            if (!page) {
                await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`);
                await sleep(200);
                page = (await chromeJson('/json/list')).find((t) => t.type === 'page');
            }
            const cdp = new Cdp(page.webSocketDebuggerUrl);
            await cdp.connect();
            await cdp.send('Page.enable');
            await cdp.send('Runtime.enable');
            await cdp.send('Emulation.setDeviceMetricsOverride', {
                width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false,
            });
            return { chrome, cdp, browser: version.Browser || 'unknown' };
        }

        let chrome, cdp, browser;
        ({ chrome, cdp, browser } = await launch(chromeFlags));

        // Probe WebGL; fallback to SwiftShader once if needed
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/webview/index.html?scenario=loc_sapphire_port&mode=diorama` });
        for (let i = 0; i < 30; i++) {
            if (await cdp.eval('window.__LR_HARNESS_READY__===true')) break;
            await sleep(100);
        }
        await cdp.eval(`(async()=>{ if(typeof setWorldMapMode==='function') setWorldMapMode('diorama',{persist:false}); if(typeof renderSettlementDiorama==='function'){ try{ renderSettlementDiorama(); }catch(e){} } await new Promise(r=>setTimeout(r,800)); return true; })()`);
        let glProbe = await cdp.eval(`(()=>{ const c=document.createElement('canvas'); let gl=null; try{gl=c.getContext('webgl')||c.getContext('experimental-webgl');}catch(e){} let vendor=null,renderer=null; if(gl){const d=gl.getExtension('WEBGL_debug_renderer_info'); vendor=d?gl.getParameter(d.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR); renderer=d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);} return {webgl:!!gl, three: typeof THREE!=='undefined', vendor, renderer, threeUri: window.__LR_THREE_SCRIPT_URI__||null}; })()`);
        if (!glProbe.webgl || !glProbe.three) {
            console.log('WebGL/THREE probe weak; restarting with SwiftShader flags', glProbe);
            try { cdp.close(); } catch (_) {}
            try { chrome.kill(); } catch (_) {}
            useSwift = true;
            ({ chrome, cdp, browser } = await launch([
                '--headless=new',
                '--enable-webgl',
                '--ignore-gpu-blocklist',
                '--use-angle=swiftshader',
            ]));
            glProbe = await cdp.eval(`(()=>{ const c=document.createElement('canvas'); let gl=null; try{gl=c.getContext('webgl')||c.getContext('experimental-webgl');}catch(e){} return {webgl:!!gl, three:false, vendor:null, renderer:null, threeUri:null}; })()`);
        }

        const validation = {
            browser,
            flags: useSwift
                ? ['--headless=new', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader']
                : ['--headless=new'],
            threeJsUri: '/webview/vendor/three.min.js',
            webglProbeInitial: glProbe,
            shots: [],
        };

        const PROBE = `(() => {
          function canvasStats(id){
            const c=document.getElementById(id); if(!c) return {exists:false};
            const out={exists:true,width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight,parentHidden:!!(c.closest&&c.closest('.hidden'))};
            try{
              const ctx=c.getContext('2d');
              if(ctx && c.width>2 && c.height>2){
                const w=Math.min(c.width,400), h=Math.min(c.height,300);
                const d=ctx.getImageData(0,0,w,h).data;
                let non=0; const cols=new Set();
                for(let i=0;i<d.length;i+=12){ const a=d[i+3]; if(a<8) continue; cols.add((d[i]>>4)+','+(d[i+1]>>4)+','+(d[i+2]>>4)); if(d[i]+d[i+1]+d[i+2]>40) non++; }
                out.sampledNonBg=non; out.uniqueColors=cols.size;
              }
            }catch(e){ out.err=String(e&&e.message||e); }
            return out;
          }
          const msg = (typeof _settlementWorldMsg!=='undefined'&&_settlementWorldMsg)||(typeof _dioramaWorldMsg!=='undefined'&&_dioramaWorldMsg)||null;
          let selected2d=null, selected3d=null, source=null;
          try{ if(typeof getSelectedSettlementView==='function'){ const v=getSelectedSettlementView(msg); selected2d=v&&v.settlementId; } }catch(e){}
          try{ if(typeof getSelectedSettlementDiorama==='function'){ const d=getSelectedSettlementDiorama(msg); selected3d=d&&d.settlementId; } }catch(e){}
          try{ if(typeof resolveSettlementRenderSource==='function'){ source=resolveSettlementRenderSource(msg).source; } }catch(e){}
          const mb=document.getElementById('world-settlement-mobile-base-banner');
          const du=document.getElementById('world-diorama-unavailable');
          const glc=document.createElement('canvas'); let gl=null; try{gl=glc.getContext('webgl')||glc.getContext('experimental-webgl');}catch(e){}
          let vendor=null,renderer=null; if(gl){const d=gl.getExtension('WEBGL_debug_renderer_info'); vendor=d?gl.getParameter(d.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR); renderer=d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}
          let framing=null;
          try {
            if (typeof computeSettlementScreenLayout==='function') {
              const view = typeof getSelectedSettlementView==='function' ? getSelectedSettlementView(msg) : (msg&&msg.settlementView);
              const c = document.getElementById('world-settlement-canvas');
              if (view && c && c.clientWidth) {
                // Prefer live renderer state when available (same transform as draw).
                const origin = (typeof computeSettlementOrigin==='function')
                  ? computeSettlementOrigin(c, view)
                  : null;
                const pan = origin
                  ? { x: origin.originX, y: origin.originY }
                  : ((typeof _settlementPan!=='undefined') ? _settlementPan : {x:0,y:0});
                const zoom = (typeof _settlementZoom!=='undefined') ? _settlementZoom : 1;
                const layout = computeSettlementScreenLayout(
                  view,
                  { width: c.clientWidth, height: c.clientHeight },
                  pan,
                  zoom
                );
                framing = {
                  settlementId: view.settlementId,
                  viewW: view.width, viewH: view.height,
                  tileCount: (view.tiles||[]).length,
                  markerCount: (view.markers||[]).length,
                  contentBounds: layout.contentBounds,
                  pan, zoom,
                  pivot: layout.pivot,
                  centersInside: layout.centersInside,
                  visibleRatio: layout.visibleRatio,
                  leftSlack: layout.leftSlack,
                  rightSlack: layout.rightSlack,
                  topSlack: layout.topSlack,
                  bottomSlack: layout.bottomSlack,
                  crossingLeft: layout.crossingLeft,
                  crossingRight: layout.crossingRight,
                  crossingTop: layout.crossingTop,
                  crossingBottom: layout.crossingBottom,
                  screenBounds: layout.screenBounds,
                  canvasCss: {w:c.clientWidth,h:c.clientHeight},
                };
              }
            }
          } catch (e) { framing = { error: String(e&&e.message||e) }; }
          return {
            worldMapMode: typeof worldMapMode!=='undefined'?worldMapMode:null,
            currentLocationId: typeof currentWorldLocationId!=='undefined'?currentWorldLocationId:null,
            ctx: msg&&msg.settlementDisplayContext||null,
            payloadFixId: msg&&msg.settlementView&&msg.settlementView.settlementId,
            selected2d, selected3d, source,
            mbBanner: mb&&!mb.classList.contains('hidden')?mb.textContent:null,
            dioUnavail: du?!du.classList.contains('hidden'):null,
            three: typeof THREE!=='undefined',
            threeUri: window.__LR_THREE_SCRIPT_URI__||null,
            webgl: {ok:!!gl, vendor, renderer},
            settlementCanvas: canvasStats('world-settlement-canvas'),
            dioramaCanvas: canvasStats('world-diorama-canvas'),
            framing,
            bodyBg: getComputedStyle(document.body).backgroundColor,
            harness: window.__LR_HARNESS_PROBE__ ? window.__LR_HARNESS_PROBE__() : null,
          };
        })()`;

        for (const shot of SHOTS) {
            const url = `http://127.0.0.1:${PORT}/webview/index.html?scenario=${encodeURIComponent(shot.scenario)}&mode=${encodeURIComponent(shot.mode)}`;
            await cdp.send('Page.navigate', { url });
            for (let i = 0; i < 40; i++) {
                if (await cdp.eval('window.__LR_HARNESS_READY__===true')) break;
                await sleep(100);
            }
            await cdp.eval(`(()=>{ const tab=document.querySelector('.tab-btn[data-target="pane-world"]'); if(tab) tab.click(); const m=${JSON.stringify(shot.mode==='world'?'tile':shot.mode)}; if(typeof setWorldMapMode==='function') setWorldMapMode(m,{persist:false}); return true; })()`);
            await cdp.eval(`(async()=>{
              if(document.fonts&&document.fonts.ready) await document.fonts.ready;
              await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
              if(typeof drawSettlementIsometric==='function'){ try{ drawSettlementIsometric(); }catch(e){} }
              // Force a second pass after layout so auto-fit sees nonzero canvas size.
              if(typeof drawSettlementIsometric==='function'){ try{ drawSettlementIsometric(); }catch(e){} }
              if(${JSON.stringify(shot.mode==='diorama')}){
                if(typeof renderSettlementDiorama==='function'){ try{ renderSettlementDiorama(); }catch(e){} }
                // wait for lazy THREE load + first frame
                for(let i=0;i<30;i++){
                  if(typeof THREE!=='undefined') break;
                  await new Promise(r=>setTimeout(r,100));
                }
                if(typeof renderSettlementDiorama==='function'){ try{ renderSettlementDiorama(); }catch(e){} }
                await new Promise(r=>setTimeout(r,600));
              } else {
                await new Promise(r=>setTimeout(r,200));
              }
              await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
              return true;
            })()`);

            const probe = await cdp.eval(PROBE);
            const shotResult = await cdp.send('Page.captureScreenshot', {
                format: 'png', fromSurface: true, captureBeyondViewport: false,
            });
            const outPath = path.join(OUT_ROOT, shot.file);
            const buf = Buffer.from(shotResult.data, 'base64');
            fs.writeFileSync(outPath, buf);
            const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
            const rgb = parseRgb(probe.bodyBg);
            const L = rgb ? lum(rgb) : 255;

            const expectedId = shot.scenario === 'world' ? null : EXPECTED_IDS[shot.scenario];
            const entry = {
                file: shot.file,
                path: outPath,
                size: buf.length,
                scenario: shot.scenario,
                mode: shot.mode,
                expectedId,
                selected2d: probe.selected2d,
                selected3d: probe.selected3d,
                source: probe.source,
                currentLocationId: probe.currentLocationId,
                ctxMode: probe.ctx && probe.ctx.mode,
                mbBanner: probe.mbBanner,
                dioUnavail: probe.dioUnavail,
                three: probe.three,
                threeUri: probe.threeUri,
                webgl: probe.webgl,
                canvas: shot.mode === 'diorama' ? probe.dioramaCanvas : probe.settlementCanvas,
                hash,
                luminance: L,
            };
            validation.shots.push(entry);

            // Assertions
            const fails = [];
            if (L >= 200) fails.push('white_bg');
            if (probe.harness && probe.harness.hasKeyLeak) fails.push('key_leak');
            if (shot.mode === 'settlement' && expectedId) {
                if (probe.selected2d !== expectedId) fails.push(`2d_id ${probe.selected2d}!=${expectedId}`);
                if (probe.selected2d === 'mb_sapphire_barge') fails.push('mb_as_fixed');
                if (probe.mbBanner) fails.push('mb_banner_visible');
                if (!probe.settlementCanvas || !probe.settlementCanvas.width) fails.push('canvas_zero');
                if ((probe.settlementCanvas.sampledNonBg || 0) < 200) fails.push('blank_canvas');
                // Framing + centering diagnostics from harness probe
                if (probe.framing) {
                    entry.framing = probe.framing;
                    const f = probe.framing;
                    if ((f.centersInside || 0) < 1) fails.push('no_tile_centers_visible');
                    if ((f.visibleRatio || 0) < 0.2) fails.push('low_visible_ratio');
                    if (f.leftSlack != null) {
                        if (f.leftSlack < 18) fails.push(`leftSlack ${f.leftSlack}`);
                        if (f.rightSlack < 18) fails.push(`rightSlack ${f.rightSlack}`);
                        if (f.topSlack < 18) fails.push(`topSlack ${f.topSlack}`);
                        if (f.bottomSlack < 18) fails.push(`bottomSlack ${f.bottomSlack}`);
                        if (Math.abs(f.leftSlack - f.rightSlack) > 3) fails.push('lr_asym');
                        if (Math.abs(f.topSlack - f.bottomSlack) > 3) fails.push('tb_asym');
                        if (f.crossingLeft || f.crossingRight || f.crossingTop || f.crossingBottom) {
                            fails.push('edge_crossing');
                        }
                    }
                }
            }
            if (shot.mode === 'diorama' && expectedId) {
                if (!probe.three) fails.push('three_missing');
                if (!probe.webgl || !probe.webgl.ok) fails.push('webgl_missing');
                if (probe.selected3d !== expectedId) fails.push(`3d_id ${probe.selected3d}!=${expectedId}`);
                if (probe.selected3d === 'mb_sapphire_barge') fails.push('mb_as_fixed_3d');
                if (probe.dioUnavail) fails.push('dio_unavailable_ui');
                if (probe.mbBanner) fails.push('mb_banner_on_diorama');
            }
            if (shot.scenario !== 'world' && shot.scenario !== 'loc_sapphire_port') {
                if (probe.currentLocationId !== 'loc_sapphire_port') fails.push('current_changed');
                // Prefer host context when present; some boots may omit it if message stripped — selected IDs are authoritative.
                if (probe.ctxMode && probe.ctxMode !== 'preview') {
                    fails.push(`not_preview(${probe.ctxMode})`);
                }
                if (probe.source !== 'fixed') fails.push(`source_not_fixed(${probe.source})`);
            }
            entry.fails = fails;
            console.log(fails.length ? 'FAIL' : 'OK', shot.file, '2d=' + probe.selected2d, '3d=' + probe.selected3d, 'nonBg=' + (entry.canvas && entry.canvas.sampledNonBg), fails.join('|') || '');
            if (fails.length) {
                throw new Error(`${shot.file}: ${fails.join('; ')}`);
            }
        }

        // Distinctness
        const settleHashes = validation.shots.filter((s) => s.mode === 'settlement').map((s) => s.hash);
        const dioHashes = validation.shots.filter((s) => s.mode === 'diorama').map((s) => s.hash);
        if (new Set(settleHashes).size !== 6) throw new Error('settlement hashes not distinct: ' + settleHashes.join(','));
        if (new Set(dioHashes).size < 2) throw new Error('diorama hashes collapsed: ' + dioHashes.join(','));
        if (dioHashes.every((h) => h === dioHashes[0])) throw new Error('all diorama hashes identical');

        fs.writeFileSync(path.join(OUT_ROOT, 'capture-validation.json'), JSON.stringify(validation, null, 2));
        console.log('ALL_13_RECOVERED_OK', OUT_ROOT);

        try { cdp.close(); } catch (_) {}
        try { chrome.kill(); } catch (_) {}
        try { server.close(); } catch (_) {}
        killChromeOnPort();
    } finally {
        clearInterval(guard);
        killChromeOnPort();
    }
}

main().catch((e) => {
    console.error(e);
    killChromeOnPort();
    process.exit(1);
});
