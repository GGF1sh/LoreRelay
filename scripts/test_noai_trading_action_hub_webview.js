#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const world = fs.readFileSync(path.join(root, 'webview', 'modules', '85-world.js'), 'utf8');
const logistics = fs.readFileSync(path.join(root, 'webview', 'modules', '85b-economy-logistics.js'), 'utf8');

for (const key of [
    'simulationActionsTitle', 'simulationActionsDescription', 'emptyCargoGuidance', 'emptyCargoAction',
    'actionHubTrade', 'actionHubTravel', 'actionHubEndDay', 'actionHubNoCurrentMarket', 'actionHubNoDestinations',
]) {
    assert(world.includes(`webview.world.${key}`), `action hub uses localization key ${key}`);
}
assert(world.includes("if (commerceUiEnabled) {"), 'simulation indicator is gated by the deterministic Commerce UI');
assert(world.includes("heading.after(indicator)"), 'indicator is presented beside the Commerce heading');
assert(world.includes("openPlayerActionHub(action)"), 'empty cargo guidance leads to a real trading action');
assert(world.includes("data-state=\"empty\""), 'missing current market has a dedicated empty state');
assert(world.includes("actionHubNoDestinations"), 'missing destinations have a dedicated empty state');
assert(world.includes("type: 'shopkeeperDirectTrade'"), 'normal action hub exposes deterministic trade');
assert(world.includes("type: 'marketTravelCommit'"), 'normal action hub exposes deterministic travel');
assert(world.includes("type: 'endDayCommit'"), 'normal action hub exposes deterministic end-day');
assert(!world.includes('Spike cards are deterministic'), 'unrelated World actions are not labelled AI-free');

for (const reason of ['commerce_disabled', 'missing_definition', 'snapshot_unavailable', 'no_route_summaries']) {
    assert(logistics.includes(reason), `Logistics retains distinct ${reason} state`);
}
assert(logistics.includes("section.classList.toggle('hidden', !visible)"), 'Logistics stays discoverable whenever its payload is present');

for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW']) {
    const strings = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
    for (const key of [
        'webview.startHub.tradingDemoTitle', 'webview.startHub.tradingDemoDesc',
        'webview.world.simulationActionsTitle', 'webview.world.emptyCargoGuidance',
        'webview.world.actionHubNoCurrentMarket', 'webview.world.actionHubNoDestinations',
    ]) {
        assert(strings[key], `${locale} has ${key}`);
    }
}

console.log('NOAI trading action hub Webview: all tests passed.');
