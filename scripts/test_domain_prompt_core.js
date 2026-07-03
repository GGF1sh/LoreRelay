#!/usr/bin/env node
'use strict';

const {
    buildDomainCompactPrompt,
    buildDomainStandardPrompt,
    buildDomainFullPrompt,
    buildDomainPromptBlock,
    DOMAIN_COMPACT_BASE_LINES,
    DOMAIN_OPS_PROMPT_LINE,
    DOMAIN_EVENT_FOCUS_LINE,
    buildDomainSinceLastVisitPrompt,
    countDomainPromptLines,
} = require('../out/domainPromptCore');
const { defaultDomainState, buildSeasonalDomainGmHint } = require('../out/domainCore');

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

    const standard = buildDomainStandardPrompt(d, { regionName: 'Riverhold' });
    if (standard.includes('Public order') || countDomainPromptLines(standard) !== DOMAIN_COMPACT_BASE_LINES) {
        fail('standard prompt bare domain');
    } else {
        ok('standard prompt bare domain');
    }

    const withOfficers = {
        ...d,
        officers: [{ npcId: 'sayo', role: 'steward' }],
    };
    const standardOfficers = buildDomainStandardPrompt(withOfficers, { regionName: 'Riverhold' });
    if (
        !standardOfficers.includes('Officers: 1')
        || standardOfficers.includes('Public order')
        || countDomainPromptLines(standardOfficers) !== DOMAIN_COMPACT_BASE_LINES + 1
    ) {
        fail('standard prompt officers count');
    } else {
        ok('standard prompt officers count');
    }

    const withPending = { ...d, pendingEvents: ['bandit_activity'] };
    const standardPending = buildDomainStandardPrompt(withPending, { regionName: 'Riverhold' });
    if (
        !standardPending.includes('Pending: bandit_activity')
        || countDomainPromptLines(standardPending) !== DOMAIN_COMPACT_BASE_LINES + 1
    ) {
        fail('standard prompt pending line');
    } else {
        ok('standard prompt pending line');
    }

    const minimalBlock = buildDomainPromptBlock(d, { tier: 'minimal' });
    if (countDomainPromptLines(minimalBlock) !== DOMAIN_COMPACT_BASE_LINES) {
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

    const sinceLast = buildDomainSinceLastVisitPrompt({
        regionId: 'riverhold',
        turnsAway: 60,
        simulatedMonths: 2,
        capped: false,
        stewardLabel: 'Steward sayo',
        changes: [{ category: 'domain', eventId: 'bandit_activity', message: 'Bandit activity increased', treasuryDelta: 0, foodDelta: 0, publicOrderDelta: -5, popularSupportDelta: 0 }],
        treasuryDelta: 10,
        foodDelta: -5,
        publicOrderDelta: -5,
        popularSupportDelta: 0,
    });
    if (!sinceLast.includes('[Living World — Since last visit]') || !sinceLast.includes('[domain:bandit_activity]')) {
        fail('buildDomainSinceLastVisitPrompt');
    } else {
        ok('buildDomainSinceLastVisitPrompt');
    }

    const fullWithSeason = buildDomainFullPrompt(d, {
        regionName: 'Riverhold',
        seasonalHint: buildSeasonalDomainGmHint(d),
    });
    if (!fullWithSeason.includes('[Domain — Season]')) {
        fail('full prompt seasonal hint slot');
    } else {
        ok('full prompt seasonal hint slot');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain prompt core tests passed.');