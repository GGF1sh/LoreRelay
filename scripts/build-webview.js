/**
 * Concatenates webview modules → webview/script.js and webview/style.css
 */
const fs = require('fs');
const path = require('path');

const JS_MODULE_ORDER = [
    '00-core.js',
    '05-quickstart.js',
    '06-genesis-guide.js',
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
    '80a-debug-trace.js',
    '80b-state-orchestrator.js',
    '80c-inspector-lanes.js',
    '81-lorebook.js',
    '82-memory.js',
    '83-director.js',
    '84-party.js',
    '84a-webview-anim.js',
    '85-world.js',
    '86-tile-overmap.js',
    '86b-settlement-isometric.js',
    '86c-settlement-diorama.js',
    '87-parlor-settings.js',
    '88-world-observatory.js',
    '89a-vehicle-labels.js',
    '89c-vehicle-intent-preview.js',
    '89-vehicles.js',
    '89b-mobile-base-panel.js',
    '89d-cinematic-mode.js',
    '90-bootstrap.js'
];

const CSS_MODULE_ORDER = [
    '00-base.css',
    '10-layout-chat.css',
    '11-genesis-guide.css',
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
    '90a-debug-trace.css',
    '90b-state-orchestrator.css',
    '90c-inspector-lanes.css',
    '95-character-creator.css',
    '87-parlor-settings.css',
    '88-world-observatory.css',
    '97-visual-refresh.css',
    '98-settlement-isometric.css',
    '99-settlement-diorama.css',
    '89-vehicles.css',
    '9a-cinematic-mode.css',
    '9b-genre-chrome.css'
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

// Settlement Diorama (M5b): Three.js stays in webview/vendor/three.min.js and is
// lazy-loaded by 86c-settlement-diorama.js when Diorama mode is first used.
// Default-OFF users never pay the parse cost. No CDN.
const threeMinPath = path.join(vendorDir, 'three.min.js');
const jsHeaderLines = [
    '// AUTO-GENERATED from webview/modules/*.js — run: npm run build:webview',
    '// @ts-nocheck',
    '// LoreRelay - Webview Script',
    ''
];
if (!fs.existsSync(threeMinPath)) {
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