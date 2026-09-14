#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'settlement-prompt-host-'));
const restore = installVscodeStub({
  workspace: { isTrusted: true, workspaceFolders: [{ uri: { fsPath: root } }], getConfiguration: () => ({ get: (_k, d) => d, update: async () => undefined }) },
  Uri: { file: (p) => ({ fsPath: p, toString: () => `file://${p}` }) },
  window: { showInformationMessage() {}, showWarningMessage() {}, showErrorMessage() {} },
});
try {
  fs.writeFileSync(path.join(root, 'game_rules.json'), JSON.stringify({ enableSettlementMode: true, enableWorldForge: true, enableVehicleSystem: true, enableMobileBaseSystem: true }));
  fs.writeFileSync(path.join(root, 'world_forge.json'), JSON.stringify({ format: 'world-forge-v1', meta: { worldName: 'x', worldSeed: 'x' }, geography: { regions: [{ id: 'r', name: 'R', type: 'urban', biome: 'coast' }], locations: [{ id: 'loc_a', name: 'A', type: 'settlement', regionId: 'r' }] }, factions: [], loreHistory: [], initialNpcs: [] }));
  fs.writeFileSync(path.join(root, 'game_state.json'), JSON.stringify({ world: { currentLocationId: 'loc_a' }, status: { location: 'A' } }));
  fs.writeFileSync(path.join(root, 'vehicle_state.json'), JSON.stringify({ version: 1, activeVehicleId: 'base', vehicles: [{ id: 'base', name: 'Root Base', kind: 'truck', owner: { type: 'player' }, locationId: 'loc_a', status: 'parked', mobileBase: { settlementId: 'root_mb', mode: 'crawler', layoutProfile: 'crawler' }, access: { sizeClass: 'small', accessTags: [] }, durability: { hp: 100, maxHp: 100 } }] }));
  fs.mkdirSync(path.join(root, 'settlements', 'loc_a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'settlement_state.json'), JSON.stringify({version:1,settlementId:'root_mb',name:'Root Base',locationId:'loc_a',stocks:[],structures:[],residents:[],visitors:[],merchants:[],incidents:[]}));
  fs.writeFileSync(path.join(root, 'settlement_layout.json'), JSON.stringify({version:1,settlementId:'root_mb',layers:['z0'],zones:[],markers:[]}));
  fs.writeFileSync(path.join(root, 'settlements', 'loc_a', 'settlement_state.json'), JSON.stringify({ version: 1, settlementId: 'fixed_a', name: 'Fixed A', locationId: 'loc_a', stocks: [], structures: [{ id: 'gate', name: 'Fixed Gate', status: 'intact', layerId: 'z0' }], residents: [], visitors: [], merchants: [], incidents: [] }));
  fs.writeFileSync(path.join(root, 'settlements', 'loc_a', 'settlement_layout.json'), JSON.stringify({ version: 1, settlementId: 'fixed_a', layers: ['z0'], zones: [{ id: 'entry', layerId: 'z0', label: '入口', x: 1, y: 2 }], markers: [] }));
  const { clearGameRulesCache } = require('../out/gameRules');
  const { clearWorldForgeCache } = require('../out/worldForge');
  const { clearSettlementStateCache, buildSettlementPromptContext } = require('../out/settlementState');
  clearGameRulesCache(); clearWorldForgeCache(); clearSettlementStateCache();
  const text = buildSettlementPromptContext();
  assert.match(text, /Fixed A/); assert.match(text, /Fixed Gate/); assert.match(text, /入口/); assert.doesNotMatch(text, /Root Base/);
  fs.writeFileSync(path.join(root,'game_state.json'),JSON.stringify({world:{currentLocationId:'missing'},status:{location:'A'}}));
  assert.equal(buildSettlementPromptContext(),'','unknown exact location must not fall back to name or root');
  fs.writeFileSync(path.join(root,'game_state.json'),JSON.stringify({world:{currentLocationId:'loc_a'}}));
  fs.writeFileSync(path.join(root,'settlements/loc_a/settlement_layout.json'),'{invalid');
  assert.equal(buildSettlementPromptContext(),'','corrupt scoped layout must fail closed');
  const mobile = require('../out/mobileBaseBridge');
  fs.writeFileSync(path.join(root,'settlement_layout.json'),JSON.stringify({version:1,settlementId:'root_mb',layers:['z0','z-1'],zones:[{id:'room',layerId:'z0',label:'Workshop',x:3,y:3}],markers:[]}));
  const { clearSettlementLayoutCache }=require('../out/settlementState');
  clearSettlementLayoutCache();
  assert.match(mobile.buildMobileBasePromptContext(), /Interior layers:.*z-1/);
  const vehiclePath=path.join(root,'vehicle_state.json');
  const vehicles=JSON.parse(fs.readFileSync(vehiclePath,'utf8'));
  vehicles.vehicles[0].mobileBase.interiorAccess='locked';
  fs.writeFileSync(vehiclePath,JSON.stringify(vehicles));
  require('../out/vehicleState').clearVehicleStateCache();
  assert.doesNotMatch(mobile.buildMobileBasePromptContext(), /Interior layers:/, 'locked layout must not be disclosed');
  console.log('settlement prompt host scoped fixed/root mobile guard: all tests passed');
} finally { restore(); }
