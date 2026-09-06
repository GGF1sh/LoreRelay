const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const out='docs/analysis/noai-balance-v1';fs.mkdirSync(out,{recursive:true});
const runs=[];for(const id of fs.readdirSync('.tmp/noai_soak'))for(const run of fs.readdirSync('.tmp/noai_soak/'+id)){
 const dir='.tmp/noai_soak/'+id+'/'+run;if(!fs.existsSync(dir+'/balance.json'))continue;
 const b=JSON.parse(fs.readFileSync(dir+'/balance.json')),r=JSON.parse(fs.readFileSync(dir+'/report.json'));const seen=new Set();
 runs.push({id,scenario:b.scenario,frames:b.frames.filter(f=>{if(seen.has(f.worldTurn))return false;seen.add(f.worldTurn);return true;}),truncated:b.truncated,ok:r.ok,canonicalHash:r.finalCanonicalHash,telemetry:r.telemetry});
}
const hosts=[];for(const name of fs.readdirSync('.test-runs').filter(n=>/^host-(relations-(false|true)-|short-).*\.json$/.test(n))){
 const d=JSON.parse(fs.readFileSync('.test-runs/'+name));hosts.push({id:name.replace('.json',''),enabled:d.enabled,seed:d.seed,name:d.name,frames:d.frames,receipts:d.receipts.map(r=>({classification:r.classification,commitStatus:r.commitStatus,result:r.result})),previewOk:d.preview?.ok,previewClassification:d.preview?.classification});
}
const data={base:'89f109a236660f110fdee375bb4d6368465f4390',runs,hosts};
fs.writeFileSync(out+'/observations.json.gz',zlib.gzipSync(JSON.stringify(data),{level:9}));
fs.mkdirSync(out+'/reproduce',{recursive:true});for(const name of ['create-matrix.cjs','create-biomes.cjs','create-extensions.cjs','create-conflict.cjs','host-relations.cjs','host-short.cjs','package-evidence.cjs'])fs.copyFileSync('.test-runs/'+name,out+'/reproduce/'+name);
for(const name of ['host-lifecycle.log','host-relations.log','host-relations-on.log','host-short.log','extensions.log','conflict.log','matrix.log','biomes.log']){
 let content=fs.readFileSync('.test-runs/'+name,'utf8').replaceAll(process.cwd(),'<CHECKOUT>').replace(/f:\\Temp\\lorerelay-live-qa-[^\\\s]+/gi,'<ISOLATED_TEMP>');
 fs.writeFileSync(out+'/'+name+'.gz',zlib.gzipSync(content));
}
fs.writeFileSync(out+'/manifest.json',JSON.stringify({base:data.base,coreRuns:runs.length,hostCases:hosts.length,observationsSha256:crypto.createHash('sha256').update(fs.readFileSync(out+'/observations.json.gz')).digest('hex'),note:'Raw QA fixtures; not player-only evidence. Repeated action decisions deduplicated to first observation per world turn. Up to 1001 frames per run.'},null,2));
console.log(runs.length,hosts.length,fs.statSync(out+'/observations.json.gz').size);
