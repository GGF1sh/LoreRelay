const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process'),{randomUUID}=require('crypto');
const {runLifecycle}=require('../scripts/run_live_extension_qa');
const all=[];
(async()=>{
for(const enabled of [false,true])for(const seed of ['balance-a','balance-b','balance-c']){
 if(fs.existsSync(path.join(__dirname,`host-relations-${enabled}-${seed}.json`)))continue;
 const frames=[],receipts=[];
 const result=await runLifecycle({observeOnly:true,
  spawnHost:(exe,args,opts)=>{
   const ws=args[0],read=n=>JSON.parse(fs.readFileSync(path.join(ws,n))),write=(n,d)=>fs.writeFileSync(path.join(ws,n),JSON.stringify(d));
   const rules=read('game_rules.json');Object.assign(rules,{economyProfile:'normal',enableNpcRegistry:enabled,enableNpcAgency:enabled,enableNpcRelationships:enabled,backgroundSimulation:false,aiParticipationPolicy:'simulationOnly'});write('game_rules.json',rules);
   const forge=read('world_forge.json');forge.factions.find(f=>f.id==='faction_merchants').enemies=['faction_port'];forge.factions.find(f=>f.id==='faction_port').enemies=['faction_merchants'];write('world_forge.json',forge);
   const world=read('world_state.json');for(const f of Object.values(world.factions))f.resources.food=40;world.globalEvents=[{id:'balance_storm',type:'environmental',severity:'major',description:'Fixture ten-day storm',turnsRemaining:10}];write('world_state.json',world);
   const reg=JSON.parse(fs.readFileSync('sample-scenarios/trade-routes/npc_registry.json'));reg.npcs.npc_port={...structuredClone(reg.npcs.npc_elda),name:'Fixture port resident',factionId:'faction_port'};write('npc_registry.json',reg);
   return spawn(exe,args,opts);
  },
  afterReopen:async({request})=>{
   const read=async()=>{const data=await request('inspect');const w=data['world_state.json'].value;return {worldTurn:w.worldTurn,factions:w.factions,regions:w.regions,markets:w.markets,npcPositions:w.npcPositions,relationships:w.npcRelationships,factionRelationships:w.npcFactionRelationships,cohesion:w.npcFactionCohesion,events:w.recentChanges,globalEvents:w.globalEvents,registry:data['npc_registry.json']?.value,credits:data['game_state.json'].value.commerce.credits};};
   frames.push(await read());
   for(let i=0;i<120;i++){
    const p=await request('preview',{actionId:'commerce:end_day',parameters:{}});assert(p.ok,JSON.stringify(p));
    const r=await request('execute',{actionId:'commerce:end_day',parameters:{},requestId:randomUUID(),confirmationToken:p.confirmationToken});
    receipts.push(r);frames.push(await read());fs.writeFileSync(path.join(__dirname,`host-partial-${enabled}-${seed}.json`),JSON.stringify({enabled,seed,receipts,frames}));if(r.commitStatus!=='committed')break;
   }
  }
 });
 const entry={enabled,seed,seedRole:'replication label; production day tick does not accept a random seed',fixture:'three-market plus food40, reciprocal faction enemies, 10-turn storm, 3 co-located NPCs',result,receipts,frames};all.push(entry);
 fs.writeFileSync(path.join(__dirname,`host-relations-${enabled}-${seed}.json`),JSON.stringify(entry));console.log('RELATION_CASE_DONE',enabled,seed,frames.at(-1).worldTurn);
}
fs.writeFileSync(path.join(__dirname,'host-relations.json'),JSON.stringify(all));
})().catch(e=>{console.error(e);process.exitCode=1;});


