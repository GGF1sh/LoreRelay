#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'webview', 'modules', '85b-economy-logistics.js');
const source = fs.readFileSync(modulePath, 'utf8');
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`OK: ${name}`);
    } catch (error) {
        failed++;
        console.error(`FAIL: ${name}`);
        console.error(error && error.stack ? error.stack : error);
    }
}

class FakeClassList {
    constructor(owner) { this.owner = owner; this.values = new Set(); }
    set(value) { this.values = new Set(String(value || '').split(/\s+/).filter(Boolean)); }
    add(...values) { values.forEach((value) => this.values.add(value)); }
    contains(value) { return this.values.has(value); }
    toggle(value, force) {
        const next = force === undefined ? !this.values.has(value) : Boolean(force);
        if (next) { this.values.add(value); } else { this.values.delete(value); }
        return next;
    }
    toString() { return [...this.values].join(' '); }
}

class FakeElement {
    constructor(tagName, document) {
        this.tagName = String(tagName).toUpperCase();
        this.ownerDocument = document;
        this.children = [];
        this.parentNode = null;
        this.attributes = {};
        this.dataset = {};
        this.style = {};
        this.listeners = {};
        this.classList = new FakeClassList(this);
        this._text = '';
        this._id = '';
        this.value = '';
        this.disabled = false;
    }
    set className(value) { this.classList.set(value); }
    get className() { return this.classList.toString(); }
    set id(value) { this._id = String(value); if (this._id) { this.ownerDocument.byId.set(this._id, this); } }
    get id() { return this._id; }
    set textContent(value) { this._text = String(value ?? ''); this.children = []; }
    get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    replaceChildren(...children) { this._text = ''; this.children = []; children.forEach((child) => this.appendChild(child)); }
    setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'class') { this.className = value; }
        if (name === 'id') { this.id = value; }
    }
    getAttribute(name) { return this.attributes[name]; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    dispatchEvent(event) {
        event.target = this;
        event.preventDefault ||= () => { event.defaultPrevented = true; };
        (this.listeners[event.type] || []).forEach((listener) => listener(event));
        const propertyListener = this[`on${event.type}`];
        if (typeof propertyListener === 'function') { propertyListener(event); }
    }
}

class FakeDocument {
    constructor() { this.byId = new Map(); }
    createElement(tag) { return new FakeElement(tag, this); }
    createElementNS(_ns, tag) { return new FakeElement(tag, this); }
    getElementById(id) { return this.byId.get(id) || null; }
}

function descendants(node) {
    return [node, ...node.children.flatMap(descendants)];
}

function findAll(node, predicate) {
    return descendants(node).filter(predicate);
}

function createHarness() {
    const document = new FakeDocument();
    const rootNode = document.createElement('div');
    const sentinel = document.createElement('div');
    sentinel.id = 'unrelated-world-ui';
    sentinel.textContent = 'keep me';
    rootNode.appendChild(sentinel);
    const section = document.createElement('details');
    section.id = 'world-logistics-details';
    section.className = 'hidden';
    const panel = document.createElement('div');
    panel.id = 'world-logistics-panel';
    section.appendChild(panel);
    rootNode.appendChild(section);
    const translations = {
        'webview.world.logisticsNodeRegion': 'Region',
        'webview.world.logisticsNodeFacility': 'Facility',
        'webview.world.logisticsNodeMarket': 'Market',
        'webview.world.logisticsStatusOpen': 'Open',
        'webview.world.logisticsStatusStrained': 'Strained',
        'webview.world.logisticsStatusBlocked': 'Blocked',
        'webview.world.logisticsStatusRaided': 'Raided',
        'webview.world.logisticsDetails': 'Details',
        'webview.world.logisticsShortage': 'Shortage',
        'webview.world.logisticsFilterEmpty': 'No routes for this commodity.',
        'webview.world.logisticsSnapshotUnavailable': 'No snapshot.',
    };
    const context = {
        document,
        console,
        Map,
        Set,
        Math,
        Number,
        String,
        Boolean,
        T: (key) => translations[key] || key,
    };
    context.window = context;
    vm.runInNewContext(source, context, { filename: modulePath });
    return { document, rootNode, section, panel, sentinel, context };
}

function payload() {
    return {
        available: true,
        worldTurn: 9,
        commodities: [
            { id: 'grain', name: 'Grain', localSpecialty: true, strategic: false },
            { id: 'medicine', name: 'Medicine', localSpecialty: false, strategic: true },
            { id: 'unused', name: 'Unused', localSpecialty: false, strategic: false },
        ],
        nodes: [
            { id: 'source', label: '<img src=x onerror=alert(1)>', kind: 'region', commodityIds: ['grain'], production: [{ sourceId: 's', commodityId: 'grain', effectiveOutput: 5, productivePotential: 1, condition: 1 }], processingSiteIds: [], shortageCommodityIds: [] },
            { id: 'facility', label: 'Mill', kind: 'facility', commodityIds: ['grain', 'medicine'], production: [], processingSiteIds: ['site'], shortageCommodityIds: [] },
            { id: 'market', label: 'Harbor Market', kind: 'market', commodityIds: ['grain', 'medicine'], production: [], processingSiteIds: [], shortageCommodityIds: ['grain'] },
        ],
        routes: [
            { id: 'grain_route', fromNodeId: 'source', toNodeId: 'market', commodityId: 'grain', volume: 5, baseCapacity: 10, effectiveCapacity: 5, utilization: 1, risk: 0.3, status: 'strained', bottleneck: true },
            { id: 'blocked_route', fromNodeId: 'facility', toNodeId: 'market', commodityId: 'medicine', volume: 0, baseCapacity: 8, effectiveCapacity: 0, utilization: 0, risk: 0.5, status: 'blocked', bottleneck: false },
            { id: 'raided_route', fromNodeId: 'source', toNodeId: 'facility', commodityId: 'medicine', volume: 1, baseCapacity: 8, effectiveCapacity: 2, utilization: 0.5, risk: 0.8, status: 'raided', bottleneck: false },
        ],
        shortages: [
            { nodeId: 'market', commodityId: 'grain', fulfilledDemand: 5, unmetDemand: 4 },
            { nodeId: 'facility', commodityId: 'medicine', fulfilledDemand: 2, unmetDemand: 0 },
        ],
        processingSites: [{ id: 'site', nodeId: 'facility', recipeId: 'mill', active: true, batches: 1, condition: 1, baseMaxBatches: 1, effectiveMaxBatches: 1, inputs: [], outputs: [] }],
        summary: { activeRoutes: 2, blockedRoutes: 1, raidedRoutes: 1, totalVolume: 6, shortageCount: 1, bottleneckCount: 1 },
    };
}

test('logistics module uses safe text APIs and no innerHTML', () => {
    assert.ok(!source.includes('.innerHTML'));
    assert.ok(source.includes('.textContent'));
});

test('view renders without throwing and preserves unrelated World UI', () => {
    const h = createHarness();
    h.context.renderEconomyLogistics(payload(), true);
    assert.strictEqual(h.section.classList.contains('hidden'), false);
    assert.ok(findAll(h.panel, (node) => node.tagName === 'SVG').length === 1);
    assert.strictEqual(h.document.getElementById('unrelated-world-ui'), h.sentinel);
    assert.strictEqual(h.sentinel.textContent, 'keep me');
});

test('commodity filter hides unrelated routes and shows an empty state', () => {
    const h = createHarness();
    h.context.renderEconomyLogistics(payload(), true);
    let select = h.document.getElementById('world-logistics-commodity-filter');
    select.value = 'grain';
    select.dispatchEvent({ type: 'change' });
    let routes = findAll(h.panel, (node) => node.classList.contains('logistics-route'));
    assert.deepStrictEqual(routes.map((node) => node.dataset.routeId), ['grain_route']);
    select = h.document.getElementById('world-logistics-commodity-filter');
    select.value = 'unused';
    select.dispatchEvent({ type: 'change' });
    assert.ok(h.panel.textContent.includes('No routes for this commodity.'));
});

test('blocked and raided zero/low-flow routes remain visible with distinct classes', () => {
    const h = createHarness();
    h.context.renderEconomyLogistics(payload(), true);
    const blocked = findAll(h.panel, (node) => node.dataset.routeId === 'blocked_route')[0];
    const raided = findAll(h.panel, (node) => node.dataset.routeId === 'raided_route')[0];
    assert.ok(blocked.classList.contains('logistics-route-blocked'));
    assert.ok(raided.classList.contains('logistics-route-raided'));
});

test('shortage badge renders only for positive unmet demand', () => {
    const h = createHarness();
    h.context.renderEconomyLogistics(payload(), true);
    const market = findAll(h.panel, (node) => node.dataset.nodeId === 'market')[0];
    const facility = findAll(h.panel, (node) => node.dataset.nodeId === 'facility')[0];
    assert.strictEqual(findAll(market, (node) => node.classList.contains('logistics-shortage-badge')).length, 1);
    assert.strictEqual(findAll(facility, (node) => node.classList.contains('logistics-shortage-badge')).length, 0);
});

test('mouse and keyboard selection update details; Escape dismisses selection', () => {
    const h = createHarness();
    h.context.renderEconomyLogistics(payload(), true);
    let route = findAll(h.panel, (node) => node.dataset.routeId === 'grain_route')[0];
    route.dispatchEvent({ type: 'click' });
    assert.ok(h.panel.textContent.includes('grain_route'));
    let node = findAll(h.panel, (item) => item.dataset.nodeId === 'market')[0];
    assert.strictEqual(node.getAttribute('tabindex'), '0');
    node.dispatchEvent({ type: 'keydown', key: 'Enter' });
    assert.ok(h.panel.textContent.includes('Harbor Market'));
    h.panel.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert.ok(h.panel.textContent.includes('webview.world.logisticsSelectHint'));
});

test('labels are text, not parsed markup', () => {
    const h = createHarness();
    h.context.renderEconomyLogistics(payload(), true);
    assert.ok(h.panel.textContent.includes('<img src=x onerror=alert(1)>'));
    assert.strictEqual(findAll(h.panel, (node) => node.tagName === 'IMG').length, 0);
});

test('localized unavailable state renders safely', () => {
    const h = createHarness();
    h.context.renderEconomyLogistics({ available: false, unavailableReason: 'snapshot_unavailable' }, true);
    assert.ok(h.panel.textContent.includes('No snapshot.'));
});

if (failed) { process.exit(1); }
console.log('economy logistics webview: all tests passed.');
