#!/usr/bin/env node
/**
 * Unit tests for gmPromptBuilderCore.ts (requires npm run compile).
 */
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'gmPromptBuilderCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/gmPromptBuilderCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    buildHintTextFromContents,
    buildWorldChangeSummaryFromChanges,
    resolveWorldChangeSummaryTurn,
    clampTextForPrompt,
    normalizePromptBudgetMode,
    resolvePromptBudgetPolicy,
    buildFogUnexploredPromptLine,
    buildNarrativeTimePromptBlock,
    buildActiveQuestObjective,
    buildCompletedQuestContext,
    buildWorldGroundingContext,
    buildPersistedTradeContext,
    ELAPSED_WORLD_TURNS_PROMPT_LINE,
    MAX_HINT_TEXT_CHARS,
    MAX_WORLD_CHANGE_SUMMARY_LINES,
    MAX_FOG_PROMPT_CHARS,
} = require(corePath);

{
    const hint = buildHintTextFromContents(['line one', 'line two'], 'player acts');
    if (hint !== 'line one\nline two\nplayer acts') {
        fail(`hint join failed: ${hint}`);
    } else {
        ok('hint joins recent + action');
    }
}

{
    const longRecent = 'a'.repeat(MAX_HINT_TEXT_CHARS);
    const hint = buildHintTextFromContents([longRecent], 'action');
    if (hint.length > MAX_HINT_TEXT_CHARS) {
        fail('hint should respect max chars');
    } else if (!hint.endsWith('action')) {
        fail('hint should preserve player action suffix');
    } else {
        ok('hint truncates history but keeps action');
    }
}

{
    const summary = buildWorldChangeSummaryFromChanges([], 5);
    if (summary !== '') {
        fail('empty changes should return empty summary');
    } else {
        ok('empty changes => empty summary');
    }
}

{
    const events = [
        {
            id: 'wce_3_food',
            worldTurn: 3,
            source: 'simulation',
            category: 'resource',
            severity: 'warning',
            message: 'Food reserves are low'
        },
        {
            id: 'wce_3_info',
            worldTurn: 3,
            source: 'simulation',
            category: 'resource',
            severity: 'info',
            message: 'ignored info'
        },
        {
            id: 'wce_2_old',
            worldTurn: 2,
            source: 'simulation',
            category: 'region',
            severity: 'critical',
            message: 'old event'
        }
    ];
    const summary = buildWorldChangeSummaryFromChanges(events, 3);
    if (!summary.includes('World Turn 3')) {
        fail('summary should target latest turn only');
    } else if (!summary.includes('Food reserves are low')) {
        fail('summary should include warning event');
    } else if (summary.includes('old event')) {
        fail('summary should exclude prior turn events');
    } else if (summary.includes('ignored info')) {
        fail('summary should exclude info severity');
    } else {
        ok('world change summary filters latest non-info step');
    }
}

{
    const events = Array.from({ length: MAX_WORLD_CHANGE_SUMMARY_LINES + 3 }, (_, i) => ({
        id: `wce_4_${i}`,
        worldTurn: 4,
        source: 'simulation',
        category: 'region',
        severity: 'warning',
        message: `event ${i}`
    }));
    const summary = buildWorldChangeSummaryFromChanges(events, 4);
    const bulletLines = summary.split('\n').filter((line) => line.startsWith('🟡'));
    if (bulletLines.length !== MAX_WORLD_CHANGE_SUMMARY_LINES) {
        fail(`summary should cap bullet lines to ${MAX_WORLD_CHANGE_SUMMARY_LINES}`);
    } else {
        ok('world change summary line cap');
    }
}

{
    const events = [{
        id: 'wce_5_food',
        worldTurn: 5,
        source: 'simulation',
        category: 'resource',
        severity: 'warning',
        message: 'Food low'
    }];
    const first = buildWorldChangeSummaryFromChanges(events, 8);
    const repeat = buildWorldChangeSummaryFromChanges(events, 8, 5);
    if (!first.includes('Food low')) {
        fail('first summary should include event');
    } else if (repeat !== '') {
        fail('already-injected turn should return empty summary');
    } else if (resolveWorldChangeSummaryTurn(events, 8, 5) !== undefined) {
        fail('resolveWorldChangeSummaryTurn should respect lastInjected');
    } else {
        ok('world change summary inject-once guard');
    }
}

{
    const clipped = clampTextForPrompt('abcdef', 5);
    if (clipped !== 'ab...') {
        fail(`clampTextForPrompt should append ASCII ellipsis marker: ${clipped}`);
    } else if (clampTextForPrompt('abc', 5) !== 'abc') {
        fail('clampTextForPrompt should not modify short text');
    } else {
        ok('prompt text clamp');
    }
}

{
    if (normalizePromptBudgetMode('nonsense') !== 'auto') {
        fail('invalid prompt budget mode should normalize to auto');
    } else if (resolvePromptBudgetPolicy('auto', 'small').mode !== 'compact') {
        fail('auto prompt budget should use compact for small context');
    } else if (resolvePromptBudgetPolicy('auto', 'large').mode !== 'balanced') {
        fail('auto prompt budget should use balanced for large context');
    } else if (resolvePromptBudgetPolicy('expanded', 'small', 2222).targetTokens !== 2222) {
        fail('prompt budget target override should be respected');
    } else {
        ok('prompt budget policy resolution');
    }
}

{
    if (buildFogUnexploredPromptLine([]) !== '') { fail('empty fog line'); }
    else { ok('empty fog line'); }

    const line = buildFogUnexploredPromptLine(['Ashen Wastes', 'Sunless Deep']);
    if (!line.includes('Unexplored') || !line.includes('Ashen Wastes')) { fail('fog line content'); }
    else if (line.length > MAX_FOG_PROMPT_CHARS) { fail('fog line char cap'); }
    else { ok('buildFogUnexploredPromptLine'); }

    const many = buildFogUnexploredPromptLine(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    if (!many.includes('…and 2 more')) { fail('fog overflow suffix'); }
    else { ok('fog overflow suffix'); }
}

{
    const base = buildNarrativeTimePromptBlock();
    if (!base.includes('[Narrative Time — Three Clocks]')) {
        fail('narrative time block missing header');
    } else if (!base.includes('elapsedWorldTurns=0')) {
        fail('narrative time block should default elapsedWorldTurns to 0');
    } else if (base.includes(ELAPSED_WORLD_TURNS_PROMPT_LINE)) {
        fail('narrative time block without emergent sim should omit World Day commit line');
    } else {
        ok('buildNarrativeTimePromptBlock base');
    }

    const emergent = buildNarrativeTimePromptBlock({ emergentSimulation: true });
    if (!emergent.includes(ELAPSED_WORLD_TURNS_PROMPT_LINE)) {
        fail('narrative time block with emergent sim should include World Day commit line');
    } else if (!emergent.includes('social/conversation')) {
        fail('narrative time block should include beat density rules');
    } else {
        ok('buildNarrativeTimePromptBlock emergent');
    }
}

{
    const line = buildActiveQuestObjective([{id:'quest_supply',title:'Supply',description:'Deliver grain.',status:'active',source:'event'}]);
    if (!line.includes('ID: quest_supply') || !line.includes('turn_result.resolvedQuests')) {
        fail('active quest supplies its canonical completion identity');
    } else { ok('active quest supplies its canonical completion identity'); }
    const completed = [{id:'quest_done',title:'Old',description:'Done.',status:'completed',source:'event'}];
    if (buildActiveQuestObjective(completed) !== '') {
        fail('completed quest must not remain the active objective');
    }
    const recap = buildCompletedQuestContext(completed);
    if (!recap.includes('quest_done | completed') || !recap.includes('overrides older dialogue')) {
        fail('canonical completed status must survive after the active objective disappears');
    } else { ok('completed quest remains explicit without reactivating its objective'); }
    const mixed = [...Array.from({length:8}, (_,n) => ({...completed[0],id:'done-'+n})),
        {...completed[0],id:'still-active',status:'active'}];
    const bounded = buildCompletedQuestContext(mixed);
    if (bounded.includes('done-2') || !bounded.includes('done-7') || bounded.includes('still-active')
        || buildCompletedQuestContext([]) !== '') { fail('completed recap must be bounded and exclude active quests'); }
}

{
    const assert = require('assert');
    try {
        const forge = { geography: { regions: [{id:'known'}, {id:'secret'}], locations: [
            {id:'plaza',name:'Plaza',regionId:'known',description:'An NPC mentions an imaginary training ground.'},
            {id:'shop',name:'Shop',regionId:'known'},
            {id:'hidden',name:'SECRET_LOCATION',regionId:'secret'},
        ] } };
        const world = {currentLocationId:'plaza',discoveredRegionIds:['known']};
        const before = JSON.stringify({forge,world});
        const grounded = buildWorldGroundingContext(forge, world, {ok:true,destinations:[{id:'shop',name:'Shop'}]});
        assert(grounded.includes('plaza="Plaza"') && grounded.includes('shop="Shop"'));
        assert(!grounded.includes('SECRET_LOCATION') && !grounded.includes('imaginary training ground'));
        assert(grounded.includes('not a verified physical route') && grounded.includes('Absence is not proof'));
        const unavailable = buildWorldGroundingContext(forge, world, {ok:false,code:'NAVIGATION_REQUIRED'});
        assert(unavailable.includes('unavailable: NAVIGATION_REQUIRED') && !unavailable.includes('UI offers'));
        assert.strictEqual(JSON.stringify({forge,world}),before);
        const trade = (id, turn, message, extra={}) => ({id:'wce_commerce_trade_'+id,worldTurn:turn,message,source:'player',category:'resource',severity:'info',...extra});
        const facts = buildPersistedTradeContext([
            trade('grain',2,'Bought 10 wheat at north_farm (-90G)'),
            trade('grain',2,'DUPLICATE'), trade('future',99,'FUTURE'),
            trade('expired',1,'EXPIRED',{expiresAfterTurns:1}),trade('gm',2,'GM_GUESS',{source:'gm'}),
            {id:'rumor',worldTurn:2,message:'RUMOR',source:'player',category:'resource',severity:'info'},
        ],3);
        assert(facts.includes('Bought 10 wheat at north_farm (-90G)'));
        for(const secret of ['DUPLICATE','FUTURE','EXPIRED','GM_GUESS','RUMOR'])assert(!facts.includes(secret));
        assert(facts.includes('NOT a complete ledger') && facts.includes('Missing is unknown'));
        assert(buildPersistedTradeContext([],3).includes('0 retained trade events'));
        const bounded = buildPersistedTradeContext(Array.from({length:20},(_,i)=>trade(i,2,'FACT_'+i)),3);
        assert(!bounded.includes('FACT_14') && bounded.includes('FACT_19'));
        ok('grounding uses published geography/UI preview and bounded persisted trade facts without promoting guesses');
    } catch(e) { fail('grounding regression: '+e.stack); }
}

if (failed > 0) {
    process.exit(1);
}
console.log('\ngmPromptBuilderCore tests passed.');
