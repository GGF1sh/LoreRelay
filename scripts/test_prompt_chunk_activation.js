#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'gmPromptBuilderCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/gmPromptBuilderCore.js missing - run npm run compile first');
    process.exit(1);
}

const {
    shouldIncludePromptChunk,
    isCampaignKitPromptActive,
} = require(corePath);

const allOff = {
    enableCampaignKit: false,
    hasCampaignKitFile: false,
    enableDomainMode: false,
    enableGuildMode: false,
    enableEmergentSimulation: false,
    enableWorldObservatory: false,
    chronicleRecapInPrompt: false,
    enableCommerce: false,
    enableNpcRegistry: false,
    enableNpcRelationships: false,
    livingWorldEnabled: false,
    worldStateEnabled: false,
    worldForgeEnabled: false,
    enableTravelEncounters: false,
    enableSettlementMode: false,
    enableVehicleSystem: false,
};

{
    if (!shouldIncludePromptChunk('gameRules', allOff)) {
        fail('core chunks should always include gameRules');
    } else if (shouldIncludePromptChunk('domain', allOff)) {
        fail('domain should be skipped when enableDomainMode is false');
    } else if (shouldIncludePromptChunk('guild', allOff)) {
        fail('guild should be skipped when enableGuildMode is false');
    } else if (shouldIncludePromptChunk('campaignKit', allOff)) {
        fail('campaignKit should be skipped when kit inactive');
    } else if (shouldIncludePromptChunk('settlement', allOff)) {
        fail('settlement should be skipped when enableSettlementMode is false');
    } else if (shouldIncludePromptChunk('vehicles', allOff)) {
        fail('vehicles should be skipped when enableVehicleSystem is false');
    } else {
        ok('inactive domain/guild/campaign/settlement/vehicle chunks skipped');
    }
}

{
    const ctx = { ...allOff, enableSettlementMode: true };
    if (!shouldIncludePromptChunk('settlement', ctx)) {
        fail('settlement should include when enableSettlementMode is true');
    } else {
        ok('settlement chunk activates with enableSettlementMode');
    }
}

{
    const ctx = { ...allOff, enableVehicleSystem: true };
    if (!shouldIncludePromptChunk('vehicles', ctx)) {
        fail('vehicles should include when enableVehicleSystem is true');
    } else {
        ok('vehicles chunk activates with enableVehicleSystem');
    }
}

{
    const ctx = { ...allOff, hasCampaignKitFile: true };
    if (!shouldIncludePromptChunk('discoveryLedger', ctx)) {
        fail('campaign file should activate discoveryLedger chunk');
    } else if (!isCampaignKitPromptActive(ctx)) {
        fail('isCampaignKitPromptActive with file');
    } else {
        ok('campaign_kit.json activates campaign chunks');
    }
}

{
    const ctx = {
        ...allOff,
        enableEmergentSimulation: true,
        chronicleRecapInPrompt: true,
        enableWorldObservatory: false,
    };
    if (!shouldIncludePromptChunk('chronicle', ctx)) {
        fail('chronicle should inject when recap on and observatory off');
    } else {
        ok('chronicle included when Observatory OFF and recapInPrompt ON');
    }
}

{
    const ctx = {
        ...allOff,
        enableEmergentSimulation: true,
        chronicleRecapInPrompt: true,
        enableWorldObservatory: true,
    };
    if (shouldIncludePromptChunk('chronicle', ctx)) {
        fail('chronicle should skip when Observatory ON (dashboard shows it)');
    } else {
        ok('chronicle skipped when Observatory ON');
    }
}

{
    const ctx = {
        ...allOff,
        enableWorldObservatory: true,
        worldStateEnabled: true,
        enableEmergentSimulation: true,
        livingWorldEnabled: true,
        enableNpcRelationships: true,
    };
    if (!shouldIncludePromptChunk('worldState', ctx)) {
        fail('worldState should include when sim enabled');
    } else if (!shouldIncludePromptChunk('livingWorldNpcBonds', ctx)) {
        fail('LW bonds should include when living world + relationships on');
    } else {
        ok('simulation chunks active when flags on');
    }
}

{
    const ctx = { ...allOff, enableCommerce: true, worldForgeEnabled: true };
    if (!shouldIncludePromptChunk('livingWorldTravel', ctx)) {
        fail('livingWorldTravel should include when commerce + forge on');
    } else if (shouldIncludePromptChunk('livingWorldTravel', { ...ctx, enableCommerce: false })) {
        fail('livingWorldTravel should skip when commerce off');
    } else {
        ok('livingWorldTravel gated by commerce');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('prompt chunk activation: all tests passed.');