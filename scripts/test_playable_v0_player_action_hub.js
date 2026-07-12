#!/usr/bin/env node
'use strict';

/**
 * PLAYABLE-V0-UI-001 — Player Action Hub UI contract.
 *
 * Inspects the committed webview source (webview/modules/85-world.js), the
 * semantic stylesheet (webview/styles/85-world.css), and the built bundle
 * (webview/script.js) to prove that the deterministic P2/P3/P4 flows are
 * unified into a single coherent, player-facing hub. This is a structural
 * behavioral contract — it slices real function bodies and asserts the state
 * machine relationships, not a static list of ceremonial labels.
 *
 * The repository ships no DOM harness for webview modules (the sibling
 * webview tests are static inspections), so this test inspects real source
 * and bundle behavior in the same manner.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const uiPath = path.join(root, 'webview', 'modules', '85-world.js');
const cssPath = path.join(root, 'webview', 'styles', '85-world.css');
const bundlePath = path.join(root, 'webview', 'script.js');

assert(fs.existsSync(bundlePath), 'webview/script.js missing — run "npm run build:webview" first');

const ui = fs.readFileSync(uiPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const bundle = fs.readFileSync(bundlePath, 'utf8');

let failed = 0;
function check(name, fn) {
    try { fn(); console.log(`OK: ${name}`); }
    catch (e) { failed++; console.error(`FAIL: ${name}\n${e.stack || e}`); }
}

/** Slice a top-level function body: from `function NAME(` to the next top-level function. */
function fnBody(src, name) {
    const start = src.indexOf(`function ${name}(`);
    assert(start >= 0, `function ${name} not found`);
    const next = src.indexOf('\nfunction ', start + 1);
    return next < 0 ? src.slice(start) : src.slice(start, next);
}

// ---- 1. One primary 暮らす entry point; no three unrelated top-level buttons ----
check('single 暮らす entry point opens the hub', () => {
    const commerce = fnBody(ui, 'renderPlayerCommerce');
    const entryButtons = (commerce.match(/id="player-action-hub-open"/g) || []).length;
    assert.strictEqual(entryButtons, 1, `expected exactly one hub entry button, found ${entryButtons}`);
    assert(/id="player-action-hub-open"[^>]*>暮らす<\/button>/.test(commerce), 'hub entry button must be labelled 暮らす');
    assert(commerce.includes('openPlayerActionHub('), 'entry button must open the hub via openPlayerActionHub');
});

check('the three separate top-level action buttons are gone', () => {
    for (const removed of ['openShopkeeperDialog', 'openMarketTravelDialog', 'openEndDayDialog', 'id="market-travel-open"', 'id="end-day-open"', 'id="shopkeeper-open"']) {
        assert(!ui.includes(removed), `stale top-level action marker still present: ${removed}`);
    }
    // renderPlayerCommerce must not wire more than the single hub entry as a primary action.
    const commerce = fnBody(ui, 'renderPlayerCommerce');
    assert(!commerce.includes('market-travel') && !commerce.includes('end-day'), 'renderPlayerCommerce must not create travel/end-day top-level buttons');
});

// ---- 2. Hub is a modal dialog with 取引 / 旅 / 一日を終える sections ----
check('hub is a modal dialog', () => {
    const open = fnBody(ui, 'openPlayerActionHub');
    assert(open.includes("setAttribute('role', 'dialog')"), 'hub must be role=dialog');
    assert(open.includes("setAttribute('aria-modal', 'true')"), 'hub must be aria-modal');
    assert(open.includes("setAttribute('aria-label', '暮らす')"), 'hub must be aria-labelled 暮らす');
});

check('sections 取引 / 旅 / 一日を終える exist as keyboard tablist', () => {
    const open = fnBody(ui, 'openPlayerActionHub');
    assert(open.includes('role="tablist"'), 'nav must be a tablist');
    assert(/role="tab"[^>]*data-section="trade"[^>]*>取引<\/button>/.test(open), 'trade tab 取引 missing');
    assert(/role="tab"[^>]*data-section="travel"[^>]*>旅<\/button>/.test(open), 'travel tab 旅 missing');
    assert(/role="tab"[^>]*data-section="endday"[^>]*>一日を終える<\/button>/.test(open), 'end-day tab 一日を終える missing');
    assert(fnBody(ui, 'wireHubNavigation').includes("event.key === 'ArrowRight'"), 'tab navigation must be keyboard accessible');
});

check('default section is 取引 with a usable market, else 旅', () => {
    const open = fnBody(ui, 'openPlayerActionHub');
    assert(open.includes("hasMarket ? 'trade' : 'travel'"), 'default section must be trade when a market exists, otherwise travel');
});

check('travel section keeps the correct Japanese 旅に出る text', () => {
    const travel = fnBody(ui, 'renderHubTravelSection');
    assert(travel.includes('旅に出る'), 'travel section must contain 旅に出る');
    assert(travel.includes('移動では日付や世界ターンは進みません'), 'zero-turn contract must be communicated');
});

// ---- 3. No mojibake ----
check('no known mojibake markers in module or bundle', () => {
    const mojibake = /譌|蜃|繧|證/;
    assert(!mojibake.test(ui), 'module contains mojibake markers');
    assert(!mojibake.test(bundle), 'bundle contains mojibake markers');
    assert(!ui.includes('証らす'), 'old mojibake copy present');
});

// ---- 4. Preview invalidation (trade + travel) ----
check('trade preview invalidation is wired to commodity/operation/quantity', () => {
    assert(ui.includes('function hubInvalidateTradePreview'), 'hubInvalidateTradePreview must exist');
    const invalidate = fnBody(ui, 'hubInvalidateTradePreview');
    assert(invalidate.includes('_shopkeeperPreviewReady = false'), 'invalidation must clear the trade preview-ready flag');
    const wire = fnBody(ui, 'wireHubTradeInputs');
    assert(wire.includes("commoditySelect.addEventListener('change', hubInvalidateTradePreview)"), 'commodity change must invalidate the preview');
    assert(wire.includes("qtyInput.addEventListener('input', hubInvalidateTradePreview)"), 'quantity input must invalidate the preview');
    assert(/name="shopkeeper-op"[\s\S]*?addEventListener\('change', hubInvalidateTradePreview\)/.test(wire), 'operation change must invalidate the preview');
    // Quantity is an integer stepper + keyboard-editable field bounded to 1..999.
    assert(wire.includes('Math.min(999, Math.max(1,'), 'quantity stepper must clamp to 1..999');
    assert(ui.includes('id="shopkeeper-qty"') && ui.includes('min="1"') && ui.includes('max="999"'), 'quantity input must be a keyboard-editable 1..999 field');
});

check('travel preview invalidation resets the pending destination', () => {
    const wire = fnBody(ui, 'wireHubTravelSection');
    const changeIdx = wire.indexOf("select.addEventListener('change'");
    assert(changeIdx >= 0, 'destination change handler missing');
    const changeBlock = wire.slice(changeIdx, wire.indexOf("previewBtn.addEventListener"));
    assert(changeBlock.includes('_marketTravelPreviewReady = false'), 'changing destination must invalidate the travel preview');
    assert(changeBlock.includes('_marketTravelPreviewDestinationId = null'), 'changing destination must drop the previewed destination');
});

// ---- 5. End-day explicit preview + confirmation ----
check('end-day requires an explicit preview then confirmation', () => {
    assert(ui.includes("type: 'endDayPreview'"), 'end-day must request a read-only preview');
    const wire = fnBody(ui, 'wireHubEndDaySection');
    assert(wire.includes('!_endDayPreviewReady'), 'end-day confirm must require a ready preview');
    assert(wire.includes("type: 'endDayCommit'") && wire.includes('confirmed: true'), 'end-day confirm must post an explicit endDayCommit');
});

// ---- 6. Stale response / request correlation retained ----
check('stale response/request correlation retained for all three flows', () => {
    assert(ui.includes('msg.requestId !== _shopkeeperPendingRequestId'), 'trade stale-response guard missing');
    assert(ui.includes('msg.requestId !== _marketTravelPendingRequestId'), 'travel stale-response guard missing');
    assert(ui.includes('msg.requestId !== _endDayPendingRequestId'), 'end-day stale-response guard missing');
    // A stale preview for a different destination must be ignored.
    assert(fnBody(ui, 'finishMarketTravelPreview').includes('msg.destinationId !== requestedDestination'), 'travel preview must ignore stale destinations');
});

// ---- 7. BUSY / WORLD_MUTATION_IN_PROGRESS are non-success states ----
check('BUSY and WORLD_MUTATION_IN_PROGRESS never look like success', () => {
    const trade = fnBody(ui, 'finishShopkeeperTrade');
    const okIdx = trade.indexOf('if (msg.ok)');
    const busyIdx = trade.indexOf("reject.code === 'WORLD_MUTATION_IN_PROGRESS'");
    assert(okIdx >= 0 && busyIdx >= 0 && busyIdx > okIdx, 'trade busy branch must be separate from the success branch');
    const busyBlock = trade.slice(busyIdx, trade.length);
    assert(busyBlock.includes("'busy'"), 'trade busy branch must set the busy state');
    assert(!busyBlock.includes('購入しました') && !busyBlock.includes('売却しました'), 'trade busy branch must not use success wording');

    const travel = fnBody(ui, 'finishMarketTravel');
    assert(travel.includes("failure.code === 'WORLD_MUTATION_IN_PROGRESS' || failure.code === 'BUSY'"), 'travel must treat BUSY/WORLD_MUTATION_IN_PROGRESS as a failure');
    const travelBusyIdx = travel.indexOf("failure.code === 'WORLD_MUTATION_IN_PROGRESS'");
    const travelBusyBlock = travel.slice(travelBusyIdx, travel.indexOf('const r = msg.receipt'));
    assert(travelBusyBlock.includes("'busy'") && !travelBusyBlock.includes('移動しました'), 'travel busy branch must not look like success');

    const endday = fnBody(ui, 'finishEndDay');
    const enddayBusyIdx = endday.indexOf("failure.code === 'WORLD_MUTATION_IN_PROGRESS'");
    assert(enddayBusyIdx >= 0, 'end-day must handle WORLD_MUTATION_IN_PROGRESS');
    const enddayBusyBlock = endday.slice(enddayBusyIdx, endday.indexOf('const r = msg.receipt'));
    assert(enddayBusyBlock.includes("'busy'") && !enddayBusyBlock.includes('一日が終わりました'), 'end-day busy branch must not look like success');

    // Success wording exists, gated by ok.
    assert(trade.slice(okIdx, busyIdx).includes("'success'"), 'trade success branch must set the success state');
    assert(bundle.includes('WORLD_MUTATION_IN_PROGRESS'), 'bundle must ship shared BUSY handling');
});

// ---- 8. Persisted-success-with-refresh-failure stays distinguishable ----
check('persisted success with refresh failure remains successful yet flagged', () => {
    for (const name of ['finishShopkeeperTrade', 'finishMarketTravel', 'finishEndDay']) {
        const body = fnBody(ui, name);
        assert(body.includes('refreshFailed'), `${name} must handle refreshFailed`);
        assert(body.includes("'success-stale'"), `${name} must keep a distinct success-stale state`);
        assert(/再読込/.test(body), `${name} must tell the player the display may need reloading`);
    }
    // success-stale must be styled as a success variant (kept visually successful).
    assert(/\[data-state="success"\][\s\S]*?\[data-state="success-stale"\][\s\S]*?border-left/.test(css)
        || css.includes('[data-state="success-stale"]'), 'success-stale must have a success-like style');
});

// ---- 9. Esc closes and focus returns to the opener ----
check('Esc closes the hub and focus returns to the 暮らす opener', () => {
    const open = fnBody(ui, 'openPlayerActionHub');
    assert(open.includes("event.key === 'Escape'"), 'Esc handler missing');
    assert(open.includes('closePlayerActionHub()'), 'Esc must close the hub');
    // Esc must not close while a submission is being accepted.
    assert(/event\.key === 'Escape'[\s\S]*?if \(_hubMutationInFlight\) \{ return; \}/.test(open), 'Esc must not close during an in-flight mutation');
    const close = fnBody(ui, 'closePlayerActionHub');
    assert(close.includes('_playerActionHubInitiator') && close.includes('.focus()'), 'closing must return focus to the opener');
});

// ---- 10. Only one deterministic mutation in-flight; no queue / no auto-retry ----
check('shared state machine keeps a single mutation in-flight', () => {
    assert(ui.includes('function hubSetMutationInFlight') && ui.includes('function hubClearMutationInFlight'), 'in-flight helpers missing');
    const sync = fnBody(ui, 'hubSyncConfirmAvailability');
    assert(sync.includes('closeBtn.disabled = busy'), 'close must be disabled while a mutation is in-flight');
    // Each confirm handler refuses to start a second mutation.
    for (const wire of ['wireHubTradeInputs', 'wireHubTravelSection', 'wireHubEndDaySection']) {
        assert(fnBody(ui, wire).includes('_hubMutationInFlight'), `${wire} must gate on the shared in-flight guard`);
    }
});

// ---- 11. Travel success returns to 取引 when the destination market is usable ----
check('successful travel switches back to 取引 when a market is available', () => {
    const travel = fnBody(ui, 'finishMarketTravel');
    assert(/if \(_hubMarket\) \{ activateHubSection\('trade'/.test(travel), 'travel success must switch to trade when a market exists');
});

// ---- 12. Internal terms are confined to a hidden developer detail area ----
check('internal terms are not shown in the normal player travel UI', () => {
    const preview = fnBody(ui, 'finishMarketTravelPreview');
    // The player-facing review text must not surface internal terms; they live in the dev area only.
    const devIdx = preview.indexOf('#market-travel-dev');
    const playerFacing = devIdx >= 0 ? preview.slice(0, devIdx) : preview;
    for (const term of ['reachabilityBasis', 'systemsNotAdvanced', 'known_market_location']) {
        assert(!playerFacing.includes(term), `internal term ${term} leaked into the player-facing review`);
    }
    assert(fnBody(ui, 'renderHubTravelSection').includes('player-action-hub__dev'), 'developer detail area must exist and be collapsible');
});

// ---- 13. Presentation moved to semantic CSS classes ----
check('semantic hub CSS classes exist and inline dialog styles are gone', () => {
    for (const sel of [
        '.player-action-hub',
        '.player-action-hub__panel',
        '.player-action-hub__nav',
        '.player-action-hub__tab',
        '.player-action-hub__section',
        '.player-action-hub__review',
        '[data-state="busy"]',
        '[data-state="success"]',
        '[data-state="error"]',
        ':focus-visible',
        'prefers-reduced-motion',
    ]) {
        assert(css.includes(sel), `semantic CSS missing: ${sel}`);
    }
    // The old inline-styled separate dialogs must be gone.
    for (const inline of ['width:min(100%,460px)', 'shopkeeper-direct-trade-dialog', 'market-travel-dialog', 'end-day-dialog']) {
        assert(!ui.includes(inline), `inline dialog artifact still present: ${inline}`);
    }
});

// ---- 14. Built bundle contains the hub implementation ----
check('built webview bundle contains the hub implementation', () => {
    for (const needle of ['function openPlayerActionHub', 'player-action-hub', '暮らす', '取引', '旅', '一日を終える', 'function finishShopkeeperTrade', 'function finishMarketTravel', 'function finishEndDay']) {
        assert(bundle.includes(needle), `bundle missing hub marker: ${needle}`);
    }
});

// ---- 15. Module and bundle remain equivalent after EOL normalization ----
check('module and bundle stay equivalent after EOL normalization', () => {
    const normModule = ui.replace(/\r\n/g, '\n').trimEnd();
    const normBundle = bundle.replace(/\r\n/g, '\n');
    assert(normBundle.includes(normModule), 'bundle must contain the 85-world.js module verbatim (EOL-normalized)');
});

if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
}
console.log('\nplayable-v0 player action hub UI contract tests passed.');
