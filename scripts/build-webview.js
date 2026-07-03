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
    '88-world-observatory.css'
];

const webviewDir = path.join(__dirname, '..', 'webview');
const jsModulesDir = path.join(webviewDir, 'modules');
const cssModulesDir = path.join(webviewDir, 'styles');

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

buildBundle(
    JS_MODULE_ORDER,
    jsModulesDir,
    path.join(webviewDir, 'script.js'),
    [
        '// AUTO-GENERATED from webview/modules/*.js — run: npm run build:webview',
        '// @ts-nocheck',
        '// LoreRelay - Webview Script',
        ''
    ],
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
const vendorDir = path.join(webviewDir, 'vendor');
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