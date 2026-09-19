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
  const layoutPath = path.join(root, 'settlements/loc_a/settlement_layout.json');
  const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
  layout.markers = [
    { id: 'well', layerId: 'z0', label: 'Public Well', x: 2, y: 2 },
    { id: 'hidden_secret', layerId: 'z0', label: 'Secret Tunnel', x: 4, y: 4 },
  ];
  fs.writeFileSync(layoutPath, JSON.stringify(layout));
  assert.match(buildSettlementPromptContext(), /Public Well/);
  assert.doesNotMatch(buildSettlementPromptContext(), /Secret Tunnel/, 'hidden marker identity must survive view projection');
  assert.match(buildSettlementPromptContext({ mode: 'compact' }), /Fixed A/);
  assert.doesNotMatch(buildSettlementPromptContext({ mode: 'compact' }), /Secret Tunnel|Root Base/);

  // A second location must be resolved fresh, including after returning to A.
  const forgePath = path.join(root, 'world_forge.json');
  const forge = JSON.parse(fs.readFileSync(forgePath, 'utf8'));
  forge.geography.locations.push({ id: 'loc_b', name: 'B', type: 'settlement', regionId: 'r' });
  fs.writeFileSync(forgePath, JSON.stringify(forge));
  clearWorldForgeCache();
  fs.mkdirSync(path.join(root, 'settlements/loc_b'), { recursive: true });
  fs.writeFileSync(path.join(root, 'settlements/loc_b/settlement_state.json'), JSON.stringify({ version: 1, settlementId: 'fixed_b', name: 'Fixed B', locationId: 'loc_b', stocks: [], structures: [{ id: 'market', name: 'B Market', status: 'intact', layerId: 'z0' }], residents: [], visitors: [], merchants: [], incidents: [] }));
  fs.writeFileSync(path.join(root, 'settlements/loc_b/settlement_layout.json'), JSON.stringify({ version: 1, settlementId: 'fixed_b', layers: ['z0'], zones: [], markers: [] }));
  fs.writeFileSync(path.join(root, 'game_state.json'), JSON.stringify({ world: { currentLocationId: 'loc_b' }, status: { location: 'A' } }));
  assert.match(buildSettlementPromptContext(), /Fixed B|B Market/);
  assert.doesNotMatch(buildSettlementPromptContext(), /Fixed A|Fixed Gate|Root Base/);
  clearSettlementStateCache();
  assert.match(buildSettlementPromptContext(), /Fixed B/);
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

  // Legacy fixed settlements remain visible when the vehicle feature is disabled,
  // even if an old active vehicle happens to reference that settlement ID.
  forge.geography.locations.push({ id: 'loc_legacy', name: 'Legacy', type: 'settlement', regionId: 'r' });
  fs.writeFileSync(forgePath, JSON.stringify(forge));
  clearWorldForgeCache();
  fs.writeFileSync(path.join(root, 'game_state.json'), JSON.stringify({ world: { currentLocationId: 'loc_legacy' } }));
  fs.writeFileSync(path.join(root, 'settlement_state.json'), JSON.stringify({ version: 1, settlementId: 'root_mb', name: 'Legacy Town', locationId: 'loc_legacy', stocks: [], structures: [], residents: [], visitors: [], merchants: [], incidents: [] }));
  fs.writeFileSync(path.join(root, 'game_rules.json'), JSON.stringify({ enableSettlementMode: true, enableWorldForge: true, enableVehicleSystem: false, enableMobileBaseSystem: true }));
  clearGameRulesCache(); clearSettlementStateCache();
  assert.match(buildSettlementPromptContext(), /Legacy Town/, 'disabled vehicle state must not suppress the town');
  assert.equal(mobile.buildMobileBasePromptContext(), '');
  console.log('settlement prompt host scoped fixed/root mobile guard: all tests passed');
} finally { restore(); }
