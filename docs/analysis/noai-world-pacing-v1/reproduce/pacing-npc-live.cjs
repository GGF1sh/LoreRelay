const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process'),{randomUUID}=require('crypto');
const {runLifecycle}=require('../scripts/run_live_extension_qa');
const frames=[],receipts=[];
runLifecycle({observeOnly:true,spawnHost:(exe,args,opts)=>{
 const ws=args[0],read=n=>JSON.parse(fs.readFileSync(path.join(ws,n))),write=(n,d)=>fs.writeFileSync(path.join(ws,n),JSON.stringify(d));
 const rules=read('game_rules.json');Object.assign(rules,{economyProfile:'normal',enableNpcRegistry:true,enableNpcAgency:true,enableNpcRelationships:true,backgroundSimulation:false,aiParticipationPolicy:'simulationOnly'});write('game_rules.json',rules);
 const forge=read('world_forge.json');forge.factions[0].enemies=['faction_port'];forge.factions[2].enemies=['faction_merchants'];write('world_forge.json',forge);
 const world=read('world_state.json');for(const f of Object.values(world.factions))f.resources.food=40;world.globalEvents=[{id:'balance_storm',type:'environmental',severity:'major',description:'Fixture ten-day storm',turnsRemaining:10}];write('world_state.json',world);
 const reg=JSON.parse(fs.readFileSync('sample-scenarios/trade-routes/npc_registry.json'));reg.npcs.npc_port={...structuredClone(reg.npcs.npc_elda),name:'Fixture port resident',factionId:'faction_port'};write('npc_registry.json',reg);
 return spawn(exe,args,opts);
},afterReopen:async({request})=>{
 const read=async()=>{const d=await request('inspect'),w=d['world_state.json'].value;frames.push({worldTurn:w.worldTurn,relationships:w.npcRelationships,factionRelationships:w.npcFactionRelationships,factions:w.factions,markets:w.markets,conflicts:w.factionConflicts,foodStatus:w.factionFoodStatus,events:w.recentChanges});fs.writeFileSync(path.join(__dirname,'pacing-npc-live.json'),JSON.stringify({frames,receipts}));};await read();
 for(let i=0;i<120;i++){
  const p=await request('preview',{actionId:'commerce:end_day',parameters:{}});assert(p.ok,JSON.stringify(p));
  const r=await request('execute',{actionId:'commerce:end_day',parameters:{},requestId:randomUUID(),confirmationToken:p.confirmationToken});receipts.push(r);await read();assert.equal(r.classification,'committed',JSON.stringify(r));
 }
 assert(Object.values(frames.at(-1).relationships).every(v=>v===30));
}}).then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
