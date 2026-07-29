import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    buildDebugCampaignCombatRequest,
    CAMPAIGN_COMBAT_REQUEST_SCHEMA_VERSION,
    validateCampaignCombatRequest,
} from './campaignCombatRequestCore';

test('validateCampaignCombatRequest accepts debug request', () => {
    const req = buildDebugCampaignCombatRequest();
    const v = validateCampaignCombatRequest(req);
    assert.equal(v.ok, true);
    if (v.ok) assert.equal(v.request.schemaVersion, CAMPAIGN_COMBAT_REQUEST_SCHEMA_VERSION);
});

test('validateCampaignCombatRequest rejects AI result fields and bad modes', () => {
    const base = buildDebugCampaignCombatRequest();
    assert.equal(validateCampaignCombatRequest({ ...base, winner: 'ally' }).ok, false);
    assert.equal(validateCampaignCombatRequest({ ...base, requestedMode: 'direct_action' }).ok, false);
    assert.equal(validateCampaignCombatRequest({ ...base, schemaVersion: 'nope' }).ok, false);
});
