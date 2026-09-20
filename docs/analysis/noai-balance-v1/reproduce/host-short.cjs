const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),{randomUUID}=require('crypto');
const {runLifecycle}=require('../scripts/run_live_extension_qa');
(async()=>{for(const name of ['simulation_off','separated_ally','separated_enemy']){
 const frames=[],receipts=[];let available,preview;
 await runLifecycle({observeOnly:true,spawnHost:(exe,args,opts)=>{
  const read=n=>JSON.parse(fs.readFileSync(path.join(args[0],n))),write=(n,d)=>fs.writeFileSync(path.join(args[0],n),JSON.stringify(d));
  const rules=read('game_rules.json');Object.assign(rules,{enableEmergentSimulation:name!=='simulation_off',economyProfile:'normal',enableNpcRegistry:true,enableNpcAgency:true,enableNpcRelationships:true,backgroundSimulation:false,aiParticipationPolicy:'simulationOnly'});write('game_rules.json',rules);
  const registry=JSON.parse(fs.readFileSync('sample-scenarios/trade-routes/npc_registry.json'));registry.npcs.npc_elda.locationId='north_farm';registry.npcs.npc_marcus.locationId='south_port';write('npc_registry.json',registry);
  const world=read('world_state.json');world.npcRelationships={'npc_elda|npc_marcus':name==='separated_enemy'?-80:80};write('world_state.json',world);
  return spawn(exe,args,opts);
 },afterReopen:async({request})=>{
  const read=async()=>{const s=await request('inspect');return {world:s['world_state.json'].value,game:s['game_state.json'].value,registry:s['npc_registry.json'].value};};
  frames.push(await read());available=await request('query_available');
  for(let i=0;i<(name==='simulation_off'?1:20);i++){
   preview=await request('preview',{actionId:'commerce:end_day',parameters:{}});if(!preview.ok)break;
   const r=await request('execute',{actionId:'commerce:end_day',parameters:{},requestId:randomUUID(),confirmationToken:preview.confirmationToken});receipts.push(r);frames.push(await read());if(r.commitStatus!=='committed')break;
  }
  if(name==='simulation_off')frames.push(await read());
 }});
 fs.writeFileSync(path.join(__dirname,'host-short-'+name+'.json'),JSON.stringify({name,frames,receipts,available,preview}));console.log('SHORT_DONE',name,receipts.length);
}})().catch(e=>{console.error(e);process.exitCode=1});
