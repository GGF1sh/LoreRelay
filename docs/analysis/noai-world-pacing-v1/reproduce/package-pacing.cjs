const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const out='docs/analysis/noai-world-pacing-v1';fs.mkdirSync(out,{recursive:true});
const runs=[];
for(const id of fs.readdirSync('.tmp/noai_soak').filter(id=>id.startsWith('pacing_'))){const dir=path.join('.tmp/noai_soak',id,fs.readdirSync(path.join('.tmp/noai_soak',id)).sort().at(-1));const b=JSON.parse(fs.readFileSync(path.join(dir,'balance.json'))),r=JSON.parse(fs.readFileSync(path.join(dir,'report.json')));runs.push({id,scenario:b.scenario,frames:b.frames,ok:r.ok,canonicalHash:r.finalCanonicalHash});}
const npc=JSON.parse(fs.readFileSync('.test-runs/pacing-npc-live.json'));
const trim=r=>({classification:r.classification,commitStatus:r.commitStatus,result:r.result});npc.receipts=npc.receipts.map(trim);
const live=JSON.parse(fs.readFileSync('.test-runs/pacing-live.json'));live.receipts=live.receipts.map(trim);
const stock=JSON.parse(fs.readFileSync('.test-runs/pacing-stock-live.json'));
const observations={base:'a22ad88094b33bdca9426f2effdef19f7e59b489',main:'89f109a236660f110fdee375bb4d6368465f4390',runs,npc,live,stock};
const bytes=zlib.gzipSync(JSON.stringify(observations),{level:9});fs.writeFileSync(out+'/observations.json.gz',bytes);
fs.writeFileSync(out+'/manifest.json',JSON.stringify({base:observations.base,main:observations.main,runs:runs.length,hostNpcTurns:npc.frames.at(-1).worldTurn,observationsSha256:crypto.createHash('sha256').update(bytes).digest('hex'),note:'Synthetic fixtures, QA information. Core runner differs from real Host. Three seeds are deterministic replication labels. Merchant comparisons use first300 world turns; only demanding idle is extended to1000.'},null,2));
const metrics=runs.map(r=>{const frames=r.frames.filter(f=>f.worldTurn<=300),last=frames.at(-1),fullLast=r.frames.at(-1);return {id:r.id,ok:r.ok,worldTurn:last.worldTurn,fullWorldTurn:fullLast.worldTurn,credits:last.credits,actions:last.actionCounts,
 shortageDays:frames.filter(f=>Object.values(f.foodStatus||{}).some(x=>x.status==='shortage')).length,lastShortage:frames.filter(f=>Object.values(f.foodStatus||{}).some(x=>x.status==='shortage')).at(-1)?.worldTurn??null,
 fullShortageDays:r.frames.filter(f=>Object.values(f.foodStatus||{}).some(x=>x.status==='shortage')).length,food:Object.fromEntries(Object.entries(last.factions).map(([id,f])=>[id,f.resources.food])),maxStock:Math.max(...r.frames.flatMap(f=>Object.values(f.markets).flatMap(s=>Object.values(s).map(x=>x.stock)))),finalMarkets:last.markets};});
fs.writeFileSync(out+'/metrics.json',JSON.stringify(metrics,null,2));
for(const name of ['pacing-matrix.log','pacing-extra.log','pacing-surplus.log','pacing-stock-extension.log','pacing-lifecycle.log','pacing-npc-live.log','pacing-live.log','pacing-ui-trade-fixed.log','pacing-adversarial.log','pacing-router-final.log','pacing-stock-final.log','pacing-controls-final.log','pacing-reload-ui-final.log']){if(fs.existsSync('.test-runs/'+name)){let text=fs.readFileSync('.test-runs/'+name,'utf8').replaceAll(process.cwd(),'<CHECKOUT>').replace(/f:\\Temp\\lorerelay-live-qa-[^\\\s]+/gi,'<ISOLATED_TEMP>');fs.writeFileSync(out+'/'+name+'.gz',zlib.gzipSync(text));}}
fs.mkdirSync(out+'/reproduce',{recursive:true});for(const name of ['create-pacing-matrix.cjs','create-pacing-extra.cjs','create-supply-surplus.cjs','create-stock-extension.cjs','pacing-live.cjs','pacing-npc-live.cjs','pacing-stock-live.cjs','pacing-controls-final.cjs','pacing-reload-ui.cjs','package-pacing.cjs'])fs.copyFileSync('.test-runs/'+name,out+'/reproduce/'+name);
for(const width of [1600,900,560])fs.copyFileSync(`.test-runs/pacing-controls-${width}.png`,`${out}/settings-${width}.png`);
fs.copyFileSync('.test-runs/pacing-controls-final.json',out+'/settings-dom.json');
fs.copyFileSync('.test-runs/pacing-reload-ui.json',out+'/reload-settings-dom.json');
// Keep only the relevant diagnostic lines: no unrelated VS Code paths or session metadata.
const diagnosis=fs.readFileSync('.test-runs/pacing-stock-internal.log','utf8').split('\n').filter(line=>line.includes('[QA routing diagnostic]')||line.includes('[GameAction]')).join('\n');fs.writeFileSync(out+'/reproduced-confirmation-loss.log',diagnosis+'\n');
console.log({runs:runs.length,bytes:bytes.length,metrics:metrics.filter(r=>r.id.includes('surplus')||r.id.includes('long')).map(({finalMarkets,...r})=>r)});
