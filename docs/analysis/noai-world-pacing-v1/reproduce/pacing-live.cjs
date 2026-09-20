const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),{randomUUID}=require('crypto'),assert=require('assert/strict');
const {chromium}=require('C:/AI/worktrees/LoreRelay/ui-play-presets-v1/.test-runs/browser/node_modules/playwright');
const {worldPacingPreset}=require('../out/worldPacingCore');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const evidence={settings:[],receipts:[],frames:[]};
require('../scripts/run_live_extension_qa').runLifecycle({observeOnly:true,
 spawnHost:(exe,args,opts)=>{
  const ws=args[0],read=n=>JSON.parse(fs.readFileSync(path.join(ws,n))),write=(n,d)=>fs.writeFileSync(path.join(ws,n),JSON.stringify(d));
  const forge=read('world_forge.json');forge.commerce.commodities.find(c=>c.id==='wheat').role='staple';forge.factions[0].foodSupply={marketLocationId:'north_farm',commodityId:'wheat',dailyDemand:2,reserveTarget:6};write('world_forge.json',forge);
  const world=read('world_state.json');world.markets.north_farm.wheat.stock=0;world.factions.faction_merchants.resources.food=0;write('world_state.json',world);
  const game=read('game_state.json');game.commerce.cargo=[{commodityId:'wheat',qty:5}];write('game_state.json',game);
  const rules=read('game_rules.json');Object.assign(rules,worldPacingPreset('changing'),{economyProfile:'barren'});write('game_rules.json',rules);
  return spawn(exe,[...args,'--remote-debugging-port=9340'],opts);
 },
 afterReopen:async({request,workspace})=>{
  const browser=await chromium.connectOverCDP('http://127.0.0.1:9340');
  try{
   let page,frame;
   for(let i=0;i<100&&!frame;i++){for(const p of browser.contexts().flatMap(c=>c.pages()))for(const f of p.frames())if(await f.locator('#presentation-select').count()){page=p;frame=f;}if(!frame)await pause(200);}
   await frame.waitForFunction(()=>!document.querySelector('#presentation-select').disabled);
   const original=await request('inspect');
   const stale=await request('preview',{actionId:'commerce:end_day',parameters:{}});
   await page.setViewportSize({width:1600,height:1100});
   if(!await frame.locator('#game-rules-settings-btn').isVisible())await frame.locator('#header-secondary-toggle').click();
   await frame.locator('#game-rules-settings-btn').click();
   await frame.waitForFunction(()=>!document.querySelector('#gr-pacing-preset').disabled);
   const readRules=()=>JSON.parse(fs.readFileSync(path.join(workspace,'game_rules.json')));
   for(const id of ['stable','changing','demanding']){
    await frame.locator('#gr-pacing-preset').selectOption(id);await pause(900);
    const rules=readRules(),expected=worldPacingPreset(id);assert.deepEqual(rules.worldPacing,expected.worldPacing);assert.equal(rules.economyProfile,expected.economyProfile);
    assert.equal(rules.aiParticipationPolicy,'simulationOnly');assert.equal(rules.enableNpcRegistry,false);
    evidence.settings.push({id,worldPacing:rules.worldPacing,economyProfile:rules.economyProfile});
   }
   assert.deepEqual(await request('inspect'),original,'settings reset canonical game/world state');
   const staleResult=await request('execute',{actionId:'commerce:end_day',parameters:{},confirmationToken:stale.confirmationToken,requestId:randomUUID()});assert.notEqual(staleResult.commitStatus,'committed');evidence.stale=staleResult.classification;
   await frame.locator('#gr-food-demand').fill('1');await frame.locator('#gr-food-demand').dispatchEvent('change');
   await frame.locator('#gr-economy-profile').selectOption('barren');await pause(900);assert.equal(await frame.locator('#gr-pacing-preset').inputValue(),'custom');
   for(const width of [1600,900,560]){await page.setViewportSize({width,height:1100});await pause(300);await page.screenshot({path:path.join(__dirname,`pacing-settings-${width}.png`)});
    evidence.settings.push({width,dom:await frame.evaluate(()=>{const p=document.querySelector('#game-rules-panel');return {width:p.clientWidth,scrollWidth:p.scrollWidth,food:document.querySelector('#gr-food-demand').value,preset:document.querySelector('#gr-pacing-preset').value};})});
   }
   await page.setViewportSize({width:1600,height:1100});await frame.locator('#game-rules-panel-close').click();
   const snap=async()=>{const d=await request('inspect');evidence.frames.push(d);return d;};
   const act=async(actionId,parameters={})=>{const p=await request('preview',{actionId,parameters});assert(p.ok,JSON.stringify(p));const r=await request('execute',{actionId,parameters,confirmationToken:p.confirmationToken,requestId:randomUUID()});evidence.receipts.push(r);assert.equal(r.classification,'committed',JSON.stringify(r));return r;};
   await act('commerce:end_day');const shortage=await snap();assert.equal(shortage['world_state.json'].value.factionFoodStatus.faction_merchants.status,'shortage');
   await act('commerce:trade',{op:'sell',marketLocationId:'north_farm',commodityId:'wheat',qty:4});const sold=await snap();assert.equal(sold['game_state.json'].value.commerce.cargo.find(c=>c.commodityId==='wheat').qty,1);
   await act('commerce:end_day');const recovered=await snap();const w=recovered['world_state.json'].value;assert.equal(w.factionFoodStatus.faction_merchants.status,'supplied');assert.equal(w.factions.faction_merchants.resources.food,2);assert.equal(w.markets.north_farm.wheat.stock,0);
   const cp=await request('checkpoint_save');const saved=await request('inspect');await act('commerce:end_day');await request('checkpoint_restore',{checkpointId:cp.id});
   const restored=await request('inspect');assert.deepEqual(restored['world_state.json'],saved['world_state.json']);
   await request('reopen');assert.deepEqual((await request('inspect'))['world_state.json'],saved['world_state.json']);
   evidence.result='passed';
  }finally{fs.writeFileSync(path.join(__dirname,'pacing-live.json'),JSON.stringify(evidence,null,2));await browser.close();}
 }
}).then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
