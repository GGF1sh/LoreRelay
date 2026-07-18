#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const hostPath = path.join(root, 'out', 'settlementLocationResolveHost.js');

let failed = 0;
let cases = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); cases++; }
function check(c, m) { if (c) ok(m); else fail(m); }

if (!fs.existsSync(hostPath)) {
    fail('out/settlementLocationResolveHost.js missing — run npm run compile');
    process.exit(1);
}

const {
    resolveFixedSettlementDocuments,
    resolveMobileBaseSettlementDocuments,
} = require(hostPath);

function writeJson(p, obj) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function stateDoc(over = {}) {
    return {
        version: 1,
        settlementId: 'set_port',
        name: 'Sapphire Port',
        locationId: 'loc_sapphire_port',
        stocks: [],
        structures: [],
        residents: [],
        visitors: [],
        merchants: [],
        incidents: [],
        ...over,
    };
}

function layoutDoc(over = {}) {
    return {
        version: 1,
        settlementId: 'set_port',
        layers: ['z0'],
        zones: [{ id: 'z1', layerId: 'z0', label: 'Market', x: 1, y: 1 }],
        markers: [],
        ...over,
    };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-settlement-resolve-'));
const catalog = new Set(['loc_sapphire_port', 'loc_mistgrove']);

function hashTree(dir) {
    const files = [];
    function walk(d) {
        for (const name of fs.readdirSync(d)) {
            const p = path.join(d, name);
            const st = fs.statSync(p);
            if (st.isDirectory()) walk(p);
            else files.push(p);
        }
    }
    walk(dir);
    files.sort();
    const h = crypto.createHash('sha256');
    for (const f of files) {
        h.update(f);
        h.update(fs.readFileSync(f));
    }
    return h.digest('hex');
}

// --- Fixed scoped success ---
{
    const ws = path.join(tmp, 'fixed_scoped');
    writeJson(path.join(ws, 'settlements', 'loc_sapphire_port', 'settlement_state.json'), stateDoc());
    writeJson(path.join(ws, 'settlements', 'loc_sapphire_port', 'settlement_layout.json'), layoutDoc());
    const r = resolveFixedSettlementDocuments({
        workspaceRoot: ws,
        requestedLocationId: 'loc_sapphire_port',
        forgeLocationIds: catalog,
        activeMobileBaseSettlementId: 'mb_deck',
    });
    check(r.ok && r.source === 'fixed_scoped' && r.state.name === 'Sapphire Port' && r.layout, 'host fixed scoped success');
}

// --- Fixed state-only ---
{
    const ws = path.join(tmp, 'fixed_state_only');
    writeJson(path.join(ws, 'settlements', 'loc_sapphire_port', 'settlement_state.json'), stateDoc());
    const r = resolveFixedSettlementDocuments({
        workspaceRoot: ws,
        requestedLocationId: 'loc_sapphire_port',
        forgeLocationIds: catalog,
    });
    check(r.ok && r.source === 'fixed_scoped' && !r.layout, 'host fixed state-only');
}

// --- Two-city isolation ---
{
    const ws = path.join(tmp, 'two_city');
    writeJson(path.join(ws, 'settlements', 'loc_sapphire_port', 'settlement_state.json'),
        stateDoc({ settlementId: 'set_port', locationId: 'loc_sapphire_port', name: 'Port' }));
    writeJson(path.join(ws, 'settlements', 'loc_mistgrove', 'settlement_state.json'),
        stateDoc({ settlementId: 'set_grove', locationId: 'loc_mistgrove', name: 'Mistgrove' }));
    const a = resolveFixedSettlementDocuments({
        workspaceRoot: ws, requestedLocationId: 'loc_sapphire_port', forgeLocationIds: catalog,
    });
    const b = resolveFixedSettlementDocuments({
        workspaceRoot: ws, requestedLocationId: 'loc_mistgrove', forgeLocationIds: catalog,
    });
    check(
        a.ok && b.ok && a.state.settlementId === 'set_port' && b.state.settlementId === 'set_grove'
        && a.statePath !== b.statePath,
        'host two-city isolation'
    );
}

// --- Scoped failures / no legacy fallback ---
{
    const ws = path.join(tmp, 'scoped_fail');
    writeJson(path.join(ws, 'settlements', 'loc_sapphire_port', 'settlement_layout.json'), layoutDoc());
    writeJson(path.join(ws, 'settlement_state.json'), stateDoc()); // valid legacy
    const r = resolveFixedSettlementDocuments({
        workspaceRoot: ws, requestedLocationId: 'loc_sapphire_port', forgeLocationIds: catalog,
    });
    check(r.ok === false && r.code === 'incomplete_document_set', 'host scoped layout-only no legacy fallback');
}
{
    const ws = path.join(tmp, 'scoped_malformed');
    fs.mkdirSync(path.join(ws, 'settlements', 'loc_sapphire_port'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'settlements', 'loc_sapphire_port', 'settlement_state.json'), '{not json', 'utf8');
    writeJson(path.join(ws, 'settlement_state.json'), stateDoc());
    const r = resolveFixedSettlementDocuments({
        workspaceRoot: ws, requestedLocationId: 'loc_sapphire_port', forgeLocationIds: catalog,
    });
    check(r.ok === false && r.code === 'invalid_state', 'host scoped malformed no legacy fallback');
}
{
    const ws = path.join(tmp, 'scoped_loc_mismatch');
    writeJson(path.join(ws, 'settlements', 'loc_sapphire_port', 'settlement_state.json'),
        stateDoc({ locationId: 'loc_mistgrove' }));
    const r = resolveFixedSettlementDocuments({
        workspaceRoot: ws, requestedLocationId: 'loc_sapphire_port', forgeLocationIds: catalog,
    });
    check(r.code === 'state_location_mismatch', 'host scoped location mismatch');
}

// --- Legacy fixed success ---
{
    const ws = path.join(tmp, 'legacy_fixed');
    writeJson(path.join(ws, 'settlement_state.json'), stateDoc());
    writeJson(path.join(ws, 'settlement_layout.json'), layoutDoc());
    const r = resolveFixedSettlementDocuments({
        workspaceRoot: ws,
        requestedLocationId: 'loc_sapphire_port',
        forgeLocationIds: catalog,
        activeMobileBaseSettlementId: 'mb_other',
    });
    check(r.ok && r.source === 'legacy_fixed' && r.legacy === true, 'host legacy fixed success');
}

// --- Legacy fixed rejections ---
{
    const ws = path.join(tmp, 'legacy_unscoped');
    const s = stateDoc();
    delete s.locationId;
    writeJson(path.join(ws, 'settlement_state.json'), s);
    const r = resolveFixedSettlementDocuments({
        workspaceRoot: ws, requestedLocationId: 'loc_sapphire_port', forgeLocationIds: catalog,
    });
    check(r.code === 'legacy_unscoped', 'host legacy unscoped');
}
{
    const ws = path.join(tmp, 'legacy_mb');
    writeJson(path.join(ws, 'settlement_state.json'), stateDoc({ settlementId: 'mb_deck' }));
    const r = resolveFixedSettlementDocuments({
        workspaceRoot: ws,
        requestedLocationId: 'loc_sapphire_port',
        forgeLocationIds: catalog,
        activeMobileBaseSettlementId: 'mb_deck',
    });
    check(r.code === 'legacy_owned_by_mobile_base', 'host legacy owned by MB');
}
{
    const ws = path.join(tmp, 'legacy_other');
    writeJson(path.join(ws, 'settlement_state.json'), stateDoc({ locationId: 'loc_sapphire_port' }));
    const a = resolveFixedSettlementDocuments({
        workspaceRoot: ws, requestedLocationId: 'loc_sapphire_port', forgeLocationIds: catalog,
        activeMobileBaseSettlementId: 'x',
    });
    const b = resolveFixedSettlementDocuments({
        workspaceRoot: ws, requestedLocationId: 'loc_mistgrove', forgeLocationIds: catalog,
        activeMobileBaseSettlementId: 'x',
    });
    check(a.ok && a.source === 'legacy_fixed', 'legacy matches one city');
    check(b.code === 'legacy_other_location', 'same singleton not returned for other city');
}

// --- Mobile base scoped ---
{
    const ws = path.join(tmp, 'mb_scoped');
    writeJson(path.join(ws, 'settlements', '_mobile_base', 'settlement_state.json'),
        stateDoc({ settlementId: 'mb_deck', locationId: 'loc_sapphire_port', name: 'Deckhold' }));
    writeJson(path.join(ws, 'settlements', '_mobile_base', 'settlement_layout.json'),
        layoutDoc({ settlementId: 'mb_deck' }));
    const r = resolveMobileBaseSettlementDocuments({
        workspaceRoot: ws,
        activeMobileBaseSettlementId: 'mb_deck',
    });
    check(r.ok && r.source === 'mobile_base_scoped', 'host MB scoped success');
}

// --- Mobile base legacy ---
{
    const ws = path.join(tmp, 'mb_legacy');
    writeJson(path.join(ws, 'settlement_state.json'),
        stateDoc({ settlementId: 'mb_deck', locationId: 'loc_dock', name: 'Deck' }));
    const r = resolveMobileBaseSettlementDocuments({
        workspaceRoot: ws,
        activeMobileBaseSettlementId: 'mb_deck',
    });
    check(r.ok && r.source === 'legacy_mobile_base', 'host MB legacy success');
}

// --- Mobile base failures ---
{
    const r = resolveMobileBaseSettlementDocuments({
        workspaceRoot: path.join(tmp, 'mb_empty'),
        activeMobileBaseSettlementId: '',
    });
    check(r.code === 'missing_active_mobile_base', 'missing active MB id');
}
{
    const ws = path.join(tmp, 'mb_dedicated_bad');
    fs.mkdirSync(path.join(ws, 'settlements', '_mobile_base'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'settlements', '_mobile_base', 'settlement_state.json'), 'nope', 'utf8');
    writeJson(path.join(ws, 'settlement_state.json'), stateDoc({ settlementId: 'mb_deck', name: 'Deck' }));
    const r = resolveMobileBaseSettlementDocuments({
        workspaceRoot: ws,
        activeMobileBaseSettlementId: 'mb_deck',
    });
    check(r.code === 'invalid_state', 'MB dedicated invalid no root fallback');
}
{
    const ws = path.join(tmp, 'mb_layout_only');
    writeJson(path.join(ws, 'settlements', '_mobile_base', 'settlement_layout.json'),
        layoutDoc({ settlementId: 'mb_deck' }));
    const r = resolveMobileBaseSettlementDocuments({
        workspaceRoot: ws,
        activeMobileBaseSettlementId: 'mb_deck',
    });
    check(r.code === 'incomplete_document_set', 'MB dedicated layout-only');
}
{
    const ws = path.join(tmp, 'mb_root_mismatch');
    writeJson(path.join(ws, 'settlement_state.json'), stateDoc({ settlementId: 'other_id', name: 'Other' }));
    const r = resolveMobileBaseSettlementDocuments({
        workspaceRoot: ws,
        activeMobileBaseSettlementId: 'mb_deck',
    });
    check(r.code === 'settlement_id_mismatch', 'MB root settlementId mismatch');
}

// PRE1 validation passthrough
{
    const r = resolveFixedSettlementDocuments({
        workspaceRoot: tmp,
        requestedLocationId: '../evil',
        forgeLocationIds: catalog,
    });
    check(r.code === 'invalid_location_id', 'invalid location id mapped');
}
{
    const r = resolveFixedSettlementDocuments({
        workspaceRoot: tmp,
        requestedLocationId: 'loc_unknown',
        forgeLocationIds: catalog,
    });
    check(r.code === 'unknown_location', 'unknown location preserved');
}

// --- Read-only / purity: tree hash unchanged ---
const before = hashTree(tmp);
// re-resolve several times
for (let i = 0; i < 3; i++) {
    resolveFixedSettlementDocuments({
        workspaceRoot: path.join(tmp, 'two_city'),
        requestedLocationId: 'loc_sapphire_port',
        forgeLocationIds: catalog,
    });
    resolveMobileBaseSettlementDocuments({
        workspaceRoot: path.join(tmp, 'mb_legacy'),
        activeMobileBaseSettlementId: 'mb_deck',
    });
}
const after = hashTree(tmp);
check(before === after, 'fixture tree byte-identical after resolutions (read-only)');

// No new top-level dirs under a clean workspace during resolve of missing
{
    const clean = path.join(tmp, 'clean_ws');
    fs.mkdirSync(clean, { recursive: true });
    const listingBefore = fs.readdirSync(clean);
    resolveFixedSettlementDocuments({
        workspaceRoot: clean,
        requestedLocationId: 'loc_sapphire_port',
        forgeLocationIds: catalog,
    });
    check(fs.readdirSync(clean).join(',') === listingBefore.join(','), 'resolve creates no directories');
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }

console.log(`\nHost cases: ${cases}`);
if (failed) {
    console.error(`${failed} failure(s)`);
    process.exit(1);
}
console.log('settlement location resolve host: all passed');
