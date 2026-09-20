const fs=require('fs'),path=require('path');
const {worldPacingPreset}=require('../out/worldPacingCore');
const root=path.join(__dirname,'pacing-matrix');fs.mkdirSync(root,{recursive:true});
const base=JSON.parse(fs.readFileSync('scripts/noai_soak_scenarios/noai_econprofile_normal_300.json'));
for(const preset of ['stable','changing','demanding']){
 const dir=path.join(__dirname,'pacing-fixtures',preset);fs.mkdirSync(dir,{recursive:true});
 for(const file of ['game_state.json','world_state.json','world_forge.json','game_rules.json'])fs.copyFileSync('scripts/noai_soak_scenarios/fixtures/merchant_three_market/'+file,path.join(dir,file));
 const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n))),write=(n,d)=>fs.writeFileSync(path.join(dir,n),JSON.stringify(d,null,2));
 const forge=read('world_forge.json');forge.commerce.commodities.find(c=>c.id==='wheat').role='staple';
 const markets=['north_farm','elda_shop','south_port'];
 for(const [i,f] of forge.factions.entries()){f.allies=[];f.foodSupply={marketLocationId:markets[i],commodityId:'wheat',dailyDemand:2,reserveTarget:14};}
 forge.factions[0].enemies=[forge.factions[2].id];forge.factions[2].enemies=[forge.factions[0].id];write('world_forge.json',forge);
 const world=read('world_state.json');for(const f of Object.values(world.factions))f.resources.food=40;write('world_state.json',world);
 const rules=read('game_rules.json');Object.assign(rules,worldPacingPreset(preset));write('game_rules.json',rules);
 for(const policy of ['observe_only','merchant_route'])for(const seed of ['balance-a','balance-b','balance-c']){
  const s=structuredClone(base);s.id=`pacing_${preset}_${seed.slice(-1)}_${policy}`;s.seed=seed;s.policyId=policy;s.workspace.fixturePath=path.relative(process.cwd(),dir).replaceAll('\\','/');
  s.description='World pacing comparison. Same initial food40 and explicit daily demand2, reciprocal enemies. First300 world turns.';
  s.horizon.turns=policy==='merchant_route'?600:300;s.limits.maxTurns=s.horizon.turns;s.limits.timeoutMs=180000;s.worldSim.economyProfile=rules.economyProfile;
  fs.writeFileSync(path.join(root,s.id+'.json'),JSON.stringify(s,null,2));
 }
}
