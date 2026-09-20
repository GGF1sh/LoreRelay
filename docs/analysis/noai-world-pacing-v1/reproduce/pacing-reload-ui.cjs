const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),assert=require('assert/strict');
const {chromium}=require('C:/AI/worktrees/LoreRelay/ui-play-presets-v1/.test-runs/browser/node_modules/playwright');
const pause=ms=>new Promise(r=>setTimeout(r,ms));const evidence=[];let browser;
require('../scripts/run_live_extension_qa').runLifecycle({spawnHost:(exe,args,opts)=>{
 const ws=args[0],file=path.join(ws,'game_rules.json'),rules=JSON.parse(fs.readFileSync(file));rules.worldPacing={foodDemandMultiplier:0,conflictEnabled:false,conflictActiveDays:7,conflictRestDays:9,relationshipPace:'slow'};fs.writeFileSync(file,JSON.stringify(rules));
 const wp=path.join(ws,'world_state.json'),w=JSON.parse(fs.readFileSync(wp));w.factionFoodStatus={faction_merchants:{status:'paused',demand:0,received:0}};w.factionConflicts={'faction_merchants|faction_port':{factionA:'faction_merchants',factionB:'faction_port',phase:'paused',phaseSince:0}};fs.writeFileSync(wp,JSON.stringify(w));
 return spawn(exe,[...args,'--remote-debugging-port=9340'],opts);
},afterReopen:async()=>{browser=await chromium.connectOverCDP('http://127.0.0.1:9340');},afterReload:async({workspace})=>{
 try{
  let page,frame;for(let i=0;i<100&&!frame;i++){for(const p of browser.contexts().flatMap(c=>c.pages()))for(const f of p.frames())if(await f.locator('#presentation-select').count()){page=p;frame=f;}if(!frame)await pause(150);}
  if(!frame){for(const [i,p]of browser.contexts().flatMap(c=>c.pages()).entries()){console.log('RELOAD_PAGE',p.url(),p.frames().map(f=>f.url()));await p.screenshot({path:path.join(__dirname,`pacing-reload-missing-${i}.png`)});}throw new Error('reload_webview_frame_not_visible');}
  await frame.waitForFunction(()=>!document.querySelector('#presentation-select').disabled);
  if(!await frame.locator('#game-rules-settings-btn').isVisible())await frame.locator('#header-secondary-toggle').click();await frame.locator('#game-rules-settings-btn').click();await frame.waitForFunction(()=>!document.querySelector('#gr-pacing-preset').disabled);
  assert.equal(await frame.locator('#gr-conflict-rest').inputValue(),'9');assert.equal(await frame.locator('#gr-pacing-preset').inputValue(),'custom');assert.equal(await frame.locator('#gr-relationship-pace').inputValue(),'slow');
  for(const width of [1600,900,560]){await page.setViewportSize({width,height:1100});await frame.locator('#gr-pacing-preset').scrollIntoViewIfNeeded();await pause(200);await page.screenshot({path:path.join(__dirname,`pacing-controls-${width}.png`)});
   const dom=await frame.evaluate(()=>{const p=document.querySelector('#game-rules-panel'),ids=['gr-pacing-preset','gr-food-demand','gr-conflict-enabled','gr-conflict-active','gr-conflict-rest','gr-relationship-pace'];return {panelWidth:p.clientWidth,scrollWidth:p.scrollWidth,controls:ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {id,value:e.value,enabled:!e.disabled,width:r.width,height:r.height};})};});assert.equal(dom.scrollWidth,dom.panelWidth);assert(dom.controls.every(c=>c.enabled&&c.width>0));evidence.push({width,dom});
  }
  const rules=JSON.parse(fs.readFileSync(path.join(workspace,'game_rules.json')));evidence.push({restoredRules:rules.worldPacing});
 }finally{fs.writeFileSync(path.join(__dirname,'pacing-reload-ui.json'),JSON.stringify(evidence,null,2));await browser.close();}
}}).then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
