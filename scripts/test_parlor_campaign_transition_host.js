#!/usr/bin/env node
'use strict';

// PARLOR-CAMPAIGN-CLARITY-001: host ordering + resume purity (source-level).

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const promoteHost = fs.readFileSync(path.join(root, 'src', 'parlorPromote.ts'), 'utf8');
const promoteCore = fs.readFileSync(path.join(root, 'src', 'parlorPromoteCore.ts'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src', 'parlorBridge.ts'), 'utf8');
const en = fs.readFileSync(path.join(root, 'locales', 'en.json'), 'utf8');
const ja = fs.readFileSync(path.join(root, 'locales', 'ja.json'), 'utf8');

function run() {
    // Host uses pure path decision before empty rejection.
    assert(
        /decideParlorPromotePath/.test(promoteHost),
        'host promote uses decideParlorPromotePath'
    );
    assert(
        /resumeFrozenCampaign/.test(promoteHost),
        'host exports resumeFrozenCampaign'
    );

    // Resume path only clears frozenAt + switches profile — no artifact writers.
    const resumeFn = promoteHost.match(
        /export function resumeFrozenCampaign\(\)[\s\S]*?^}/m
    );
    assert(resumeFn, 'resumeFrozenCampaign function body found');
    const resumeBody = resumeFn[0];
    assert(
        /frozenAt:\s*null/.test(resumeBody) && /profile:\s*'campaign'/.test(resumeBody),
        'resume clears frozenAt and switches to campaign'
    );
    assert(
        !/commitGameState|writeJsonAtomic|saveGameRules|runParlorPromoteCore/.test(resumeBody),
        'resume does not write/regenerate Campaign artifacts'
    );

    // Fresh path still validates empty session and keeps overwrite confirm + backup.
    assert(
        /session\.messages\.length === 0/.test(promoteHost),
        'fresh path still rejects empty Parlor session'
    );
    assert(
        /confirmOverwriteCampaign/.test(promoteHost),
        'fresh path retains overwrite confirmation'
    );
    assert(
        /commitGameState\([^)]*createBackup:\s*true/.test(promoteHost),
        'fresh path retains backup commit'
    );
    assert(
        /lastParlorSnapshot/.test(promoteHost),
        'fresh path records lastParlorSnapshot'
    );

    // Empty session no longer blocks frozen resume: resume/offer happens via decision
    // before any early empty reject that would run first.
    const promoteFn = promoteHost.match(
        /export async function promoteParlorToCampaign[\s\S]*?^export async function demote/m
    );
    assert(promoteFn, 'promoteParlorToCampaign body found');
    const body = promoteFn[0];
    const decisionIdx = body.indexOf('decideParlorPromotePath');
    const emptyIdx = body.indexOf("error: 'empty_session'");
    assert(decisionIdx >= 0 && emptyIdx > decisionIdx,
        'empty_session rejection occurs after path decision (frozen resume not blocked)');

    // Settings payload includes bounded campaignTransition only.
    assert(
        /campaignTransition/.test(bridge) && /resolveParlorCampaignTransition/.test(bridge),
        'settings payload exposes campaignTransition view-model'
    );
    assert(
        !/type: 'parlorSettings'[\s\S]{0,800}messages:/.test(bridge),
        'settings payload does not ship full Parlor messages for the card'
    );

    // Labels no longer use Promote as primary copy.
    const enObj = JSON.parse(en);
    const jaObj = JSON.parse(ja);
    assert(
        !/Promote to Campaign/i.test(enObj['webview.parlor.promoteButton']),
        'EN primary button no longer says Promote to Campaign'
    );
    assert(
        /Start an adventure with this character/.test(enObj['webview.parlor.promoteButton']),
        'EN primary button uses adventure wording'
    );
    assert(
        !/昇格/.test(jaObj['webview.parlor.promoteButton']),
        'JA primary button no longer uses 昇格'
    );
    assert(
        /このキャラと冒険を始める/.test(jaObj['webview.parlor.promoteButton']),
        'JA primary button uses adventure wording'
    );
    assert(
        /Parlor/.test(jaObj['webview.parlor.promoteHint']) && /消えません/.test(jaObj['webview.parlor.promoteHint']),
        'JA hint explains Parlor chat is preserved'
    );

    // Core documents resume independence from messages.
    assert(
        /Resume never requires Parlor messages/.test(promoteCore),
        'core documents resume message independence'
    );

    console.log('parlor campaign transition host: all checks passed.');
}

try {
    run();
} catch (error) {
    console.error(error.stack || error);
    process.exit(1);
}
