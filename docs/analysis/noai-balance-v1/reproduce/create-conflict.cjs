const fs=require('fs');const dir='.test-runs/conflict-fixture';fs.mkdirSync(dir,{recursive:true});
for(const file of ['game_state.json','world_state.json','world_forge.json','game_rules.json'])fs.copyFileSync('scripts/noai_soak_scenarios/fixtures/merchant_three_market/'+file,dir+'/'+file);
const forge=JSON.parse(fs.readFileSync(dir+'/world_forge.json'));for(const f of forge.factions)f.allies=[];
forge.factions.find(f=>f.id==='faction_merchants').enemies=['faction_port'];forge.factions.find(f=>f.id==='faction_port').enemies=['faction_merchants'];fs.writeFileSync(dir+'/world_forge.json',JSON.stringify(forge));
const s=JSON.parse(fs.readFileSync('.test-runs/matrix/balance_normal_a_observe_only.json'));s.id='balance_long_conflict';s.workspace.fixturePath=dir;s.horizon.turns=1000;s.limits.maxTurns=1000;s.limits.timeoutMs=180000;fs.mkdirSync('.test-runs/conflict',{recursive:true});fs.writeFileSync('.test-runs/conflict/'+s.id+'.json',JSON.stringify(s,null,2));
