/**
 * Concatenates webview modules → webview/script.js and webview/style.css
 */
const fs = require('fs');
const path = require('path');

const JS_MODULE_ORDER = [
    '00-core.js',
    '05-quickstart.js',
    '10-game-state.js',
    '20-input-audio-prep.js',
    '30-bgm-sfx.js',
    '40-dice-calc-tabs.js',
    '50-character-saga.js',
    '52-character-creator.js',
    '55-remote-play.js',
    '60-tts-quickreply-imagegen.js',
    '61-tts-npc.js',
    '70-game-rules.js',
    '80-inspector.js',
    '81-lorebook.js',
    '82-memory.js',
    '83-director.js',
    '84-party.js',
    '85-world.js',
    '86-tile-overmap.js',
    '86b-settlement-isometric.js',
    '86c-settlement-diorama.js',
    '87-parlor-settings.js',
    '88-world-observatory.js',
    '90-bootstrap.js'
];

const CSS_MODULE_ORDER = [
    '00-base.css',
    '10-layout-chat.css',
    '15-ux-polish.css',
    '20-quickreply-messages.css',
    '30-status-gallery.css',
    '40-bgm-audio.css',
    '50-scrollbar-themes.css',
    '60-dice-calc.css',
    '70-archive-stt-tts.css',
    '80-image-gen.css',
    '85-world.css',
    '90-game-rules.css',
    '90-inspector.css',
    '95-character-creator.css',
    '87-parlor-settings.css',
    '88-world-observatory.css',
    '97-visual-refresh.css',
    '98-settlement-isometric.css',
    '99-settlement-diorama.css'
];

const webviewDir = path.join(__dirname, '..', 'webview');
const jsModulesDir = path.join(webviewDir, 'modules');
const cssModulesDir = path.join(webviewDir, 'styles');
const vendorDir = path.join(webviewDir, 'vendor');

function buildBundle(moduleOrder, modulesDir, outPath, headerLines, ext) {
    let out = headerLines.join('\n') + '\n';
    for (const file of moduleOrder) {
        const p = path.join(modulesDir, file);
        if (!fs.existsSync(p)) {
            console.error(`Missing ${ext} module:`, p);
            process.exit(1);
        }
        out += `\n/* --- ${file} --- */\n`;
        out += fs.readFileSync(p, 'utf-8').trimEnd() + '\n';
    }
    fs.writeFileSync(outPath, out, 'utf-8');
    console.log(`Built ${path.basename(outPath)} (${out.split('\n').length} lines) from ${moduleOrder.length} modules`);
}

// Settlement Diorama (M5b): prepend the local Three.js vendor build so the
// global `THREE` exists before 86c-settlement-diorama.js runs. No CDN, no
// separate <script> tag / extension.ts change needed. Gracefully absent if
// the vendor file is missing — 86c degrades via its own THREE-availability check.
const threeMinPath = path.join(vendorDir, 'three.min.js');
const jsHeaderLines = [
    '// AUTO-GENERATED from webview/modules/*.js — run: npm run build:webview',
    '// @ts-nocheck',
    '// LoreRelay - Webview Script',
    ''
];
if (fs.existsSync(threeMinPath)) {
    jsHeaderLines.push('/* --- vendor/three.min.js (Three.js, MIT license, bundled locally for Settlement Diorama M5b) --- */');
    jsHeaderLines.push(fs.readFileSync(threeMinPath, 'utf-8').trimEnd());
    console.log('Prepended vendor/three.min.js into script.js bundle');
} else {
    console.warn(`WARNING: three.min.js not found at ${threeMinPath}. Settlement Diorama (M5b) will show its unavailable-fallback state.`);
}

buildBundle(
    JS_MODULE_ORDER,
    jsModulesDir,
    path.join(webviewDir, 'script.js'),
    jsHeaderLines,
    'js'
);

buildBundle(
    CSS_MODULE_ORDER,
    cssModulesDir,
    path.join(webviewDir, 'style.css'),
    [
        '/* AUTO-GENERATED from webview/styles/*.css — run: npm run build:webview */',
        '/* LoreRelay - UI (Glassmorphism Dark Theme) */',
        ''
    ],
    'css'
);

// Copy vendor scripts
if (!fs.existsSync(vendorDir)) {
    fs.mkdirSync(vendorDir);
}

const mermaidSrc = path.join(__dirname, '..', 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
const mermaidDest = path.join(vendorDir, 'mermaid.min.js');
if (fs.existsSync(mermaidSrc)) {
    fs.copyFileSync(mermaidSrc, mermaidDest);
    console.log(`Copied mermaid.min.js to webview/vendor/`);
} else {
    console.warn(`WARNING: mermaid.min.js not found at ${mermaidSrc}. Did you run npm install?`);
}