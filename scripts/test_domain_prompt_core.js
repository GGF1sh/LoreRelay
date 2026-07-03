#!/usr/bin/env node
'use strict';

const {
    buildDomainCompactPrompt,
    buildDomainStandardPrompt,
    buildDomainFullPrompt,
    buildDomainPromptBlock,
    DOMAIN_OPS_PROMPT_LINE,
    DOMAIN_EVENT_FOCUS_LINE,
} = require('../out/domainPromptCore');
const { defaultDomainState } = require('../out/domainCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

{
    const d = defaultDomainState('riverhold');
    const compact = buildDomainCompactPrompt(d, { regionName: 'Riverhold' });
    if (!compact.includes('[Domain — Riverhold]') || !compact.includes('treasury')) {
        fail('compact prompt');
    } else {
        ok('compact prompt');
    }

    const full = buildDomainFullPrompt(d, {
        regionName: 'Riverhold',
        councilLines: ['Sayo (steward): Treasury is strained.'],
    });
    if (!full.includes('Public order') || !full.includes('[Domain — Council]')) {
        fail('full prompt');
    } else {
        ok('full prompt');
    }

    const standard = buildDomainStandardPrompt(d, { regionName: 'Riverhold', eventHint: '[Domain — Event] test' });
    if (!standard.includes('Order') || standard.split('\n').length > 8) {
        fail('standard prompt tier');
    } else {
        ok('standard prompt tier');
    }

    const minimalBlock = buildDomainPromptBlock(d, { tier: 'minimal' });
    if (minimalBlock.split('\n').length !== 3) {
        fail('minimal tier line count');
    } else {
        ok('minimal tier line count');
    }

    if (!DOMAIN_OPS_PROMPT_LINE.includes('domainOps')) {
        fail('DOMAIN_OPS_PROMPT_LINE');
    } else if (!DOMAIN_EVENT_FOCUS_LINE.includes('event-first')) {
        fail('DOMAIN_EVENT_FOCUS_LINE');
    } else {
        ok('prompt constants');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain prompt core tests passed.');