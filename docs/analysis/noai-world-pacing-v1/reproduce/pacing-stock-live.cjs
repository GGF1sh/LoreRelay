const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),{randomUUID}=require('crypto'),assert=require('assert/strict');
const frames=[],receipts=[];
require('../scripts/run_live_extension_qa').runLifecycle({observeOnly:true,spawnHost:(exe,args,opts)=>{
 const ws=args[0],read=n=>JSON.parse(fs.readFileSync(path.join(ws,n))),write=(n,d)=>fs.writeFileSync(path.join(ws,n),JSON.stringify(d));
 const f=JSON.parse(fs.readFileSync('.test-runs/pacing-fixtures/supply_surplus/world_forge.json'));write('world_forge.json',f);
 const rules=JSON.parse(fs.readFileSync('.test-runs/pacing-fixtures/supply_surplus/game_rules.json'));rules.enableCommerceUi=true;write('game_rules.json',rules);
 const w=read('world_state.json');for(const faction of Object.values(w.factions))faction.resources.food=14;for(const m of f.commerce.markets)w.markets[m.locationId].wheat.stock=m.targetStock;write('world_state.json',w);
 const game=read('game_state.json');game.commerce.credits=500;game.world.discoveredRegionIds=['r_north','r_central','r_south'];write('game_state.json',game);
 return spawn(exe,args,opts);
},afterReopen:async({request,workspace})=>{
 const snap=async()=>{const d=await request('inspect'),w=d['world_state.json'].value;frames.push({worldTurn:w.worldTurn,markets:w.markets,factions:w.factions,foodStatus:w.factionFoodStatus,credits:d['game_state.json'].value.commerce.credits});fs.writeFileSync(path.join(__dirname,'pacing-stock-live.json'),JSON.stringify({frames,receipts}));};
 const act=async(actionId,parameters={})=>{const p=await request('preview',{actionId,parameters});assert(p.ok,JSON.stringify(p));const r=await request('execute',{actionId,parameters,confirmationToken:p.confirmationToken,requestId:randomUUID()});receipts.push({actionId,classification:r.classification,commitStatus:r.commitStatus,result:r.result});
  if(r.classification!=='committed'){await snap();const logRoot=path.join(path.dirname(workspace),'user-data','logs');const logs=fs.readdirSync(logRoot,{recursive:true}).filter(n=>n.endsWith('.log')).map(n=>{try{return fs.readFileSync(path.join(logRoot,n),'utf8')}catch{return ''}}).join('\n');fs.writeFileSync(path.join(__dirname,'pacing-stock-internal.log'),logs);}
  assert.equal(r.classification,'committed',JSON.stringify(r));};
 await snap();for(let i=0;i<30;i++){
  await act('commerce:trade',{op:'buy',marketLocationId:'north_farm',commodityId:'wheat',qty:3});await act('commerce:end_day');await snap();
  await act('commerce:travel',{destinationId:'south_port'});await act('commerce:trade',{op:'sell',marketLocationId:'south_port',commodityId:'wheat',qty:3});await act('commerce:end_day');await snap();
  await act('commerce:travel',{destinationId:'north_farm'});
 }
 assert(frames.at(-1).markets.south_port.wheat.stock>frames[0].markets.south_port.wheat.stock);console.log('FINAL_STOCK',JSON.stringify(frames.at(-1)));
}}).then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
