#!/usr/bin/env node
'use strict';

const {
    buildDomainCompactPrompt,
    buildDomainFullPrompt,
    DOMAIN_OPS_PROMPT_LINE,
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

    if (!DOMAIN_OPS_PROMPT_LINE.includes('domainOps')) {
        fail('DOMAIN_OPS_PROMPT_LINE');
    } else {
        ok('DOMAIN_OPS_PROMPT_LINE');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain prompt core tests passed.');