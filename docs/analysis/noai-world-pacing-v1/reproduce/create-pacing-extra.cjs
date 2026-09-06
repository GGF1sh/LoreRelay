const fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'pacing-extra');fs.mkdirSync(dir,{recursive:true});
for(const preset of ['stable','changing','demanding']){
 const fixture=path.join(__dirname,'pacing-fixtures',preset+'_custom');fs.mkdirSync(fixture,{recursive:true});
 for(const file of ['game_state.json','world_state.json','world_forge.json','game_rules.json'])fs.copyFileSync(path.join(__dirname,'pacing-fixtures',preset,file),path.join(fixture,file));
 const rp=path.join(fixture,'game_rules.json'),rules=JSON.parse(fs.readFileSync(rp));
 if(preset==='stable')rules.worldPacing.foodDemandMultiplier=1;
 if(preset==='changing'){rules.worldPacing.conflictActiveDays=2;rules.worldPacing.conflictRestDays=8;rules.worldPacing.relationshipPace='slow';}
 if(preset==='demanding')rules.worldPacing.foodDemandMultiplier=0.3;
 fs.writeFileSync(rp,JSON.stringify(rules,null,2));
 for(const policy of ['observe_only','merchant_route']){const s=JSON.parse(fs.readFileSync(path.join(__dirname,'pacing-matrix',`pacing_${preset}_a_${policy}.json`)));s.id=`pacing_${preset}_custom_${policy}`;s.workspace.fixturePath=path.relative(process.cwd(),fixture).replaceAll('\\','/');fs.writeFileSync(path.join(dir,s.id+'.json'),JSON.stringify(s,null,2));}
}
// A persistent demanding supply gap warrants extension. All other conditions stop at300.
const s=JSON.parse(fs.readFileSync(path.join(__dirname,'pacing-matrix','pacing_demanding_a_observe_only.json')));s.id='pacing_demanding_long_observe_only';s.horizon.turns=1000;s.limits.maxTurns=1000;fs.writeFileSync(path.join(dir,s.id+'.json'),JSON.stringify(s,null,2));
// Existing production sources restore a starved world: production2 + scarce recovery1 meets demand3.
const fixture=path.join(__dirname,'pacing-fixtures','supply_recovery');fs.mkdirSync(fixture,{recursive:true});
for(const file of ['game_state.json','world_state.json','world_forge.json','game_rules.json'])fs.copyFileSync(path.join(__dirname,'pacing-fixtures','demanding',file),path.join(fixture,file));
const forgePath=path.join(fixture,'world_forge.json'),forge=JSON.parse(fs.readFileSync(forgePath));
forge.commerce.resourceFlows={nodes:forge.commerce.markets.map(m=>({id:m.locationId,kind:'market',label:m.locationId,marketLocationId:m.locationId})),productionSources:forge.commerce.markets.map(m=>({id:'supply_'+m.locationId,nodeId:m.locationId,commodityId:'wheat',baseOutputPerTick:2})),demands:[],tradeRoutes:[]};fs.writeFileSync(forgePath,JSON.stringify(forge,null,2));
const wp=path.join(fixture,'world_state.json'),world=JSON.parse(fs.readFileSync(wp));for(const f of Object.values(world.factions))f.resources.food=0;for(const items of Object.values(world.markets))items.wheat.stock=0;fs.writeFileSync(wp,JSON.stringify(world,null,2));
for(const policy of ['observe_only','merchant_route']){const r=JSON.parse(fs.readFileSync(path.join(__dirname,'pacing-matrix',`pacing_demanding_a_${policy}.json`)));r.id=`pacing_supply_recovery_${policy}`;r.workspace.fixturePath=path.relative(process.cwd(),fixture).replaceAll('\\','/');fs.writeFileSync(path.join(dir,r.id+'.json'),JSON.stringify(r,null,2));}
