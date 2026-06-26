/**
 * Concatenates webview modules → webview/script.js and webview/style.css
 */
const fs = require('fs');
const path = require('path');

const JS_MODULE_ORDER = [
    '00-core.js',
    '10-game-state.js',
    '20-input-audio-prep.js',
    '30-bgm-sfx.js',
    '40-dice-calc-tabs.js',
    '50-character-saga.js',
    '55-remote-play.js',
    '60-tts-quickreply-imagegen.js',
    '70-game-rules.js',
    '90-bootstrap.js'
];

const CSS_MODULE_ORDER = [
    '00-base.css',
    '10-layout-chat.css',
    '20-quickreply-messages.css',
    '30-status-gallery.css',
    '40-bgm-audio.css',
    '50-scrollbar-themes.css',
    '60-dice-calc.css',
    '70-archive-stt-tts.css',
    '80-image-gen.css',
    '90-game-rules.css'
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