#!/usr/bin/env node
'use strict';

const {
    resolveDomainPaymentWallet,
    buildDomainLedgerPromptLine,
    DOMAIN_LEDGER_PROMPT_LINE,
} = require('../out/domainLedgerCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (resolveDomainPaymentWallet('trade_ops') !== 'credits') {
    fail('trade_ops -> credits');
} else {
    ok('trade_ops -> credits');
}

if (resolveDomainPaymentWallet('domain_tax_income') !== 'treasury') {
    fail('domain_tax -> treasury');
} else {
    ok('domain_tax -> treasury');
}

if (!buildDomainLedgerPromptLine(true, true).includes('commerce.credits')) {
    fail('ledger prompt when both ON');
} else {
    ok('ledger prompt when both ON');
}

if (buildDomainLedgerPromptLine(false, true) !== '') {
    fail('ledger prompt OFF when commerce OFF');
} else {
    ok('ledger prompt OFF when commerce OFF');
}

if (!DOMAIN_LEDGER_PROMPT_LINE.includes('treasury')) {
    fail('DOMAIN_LEDGER_PROMPT_LINE');
} else {
    ok('DOMAIN_LEDGER_PROMPT_LINE');
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain ledger core tests passed.');