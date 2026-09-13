'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');
const core=require('../out/structureArtCore');
const {StructureArtStore}=require('../out/structureArtStore');
const {readCartographyImage}=require('../out/cartographyAssetStore');
const {buildFixedCitySettlements}=require('./create_living_trade_world');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'structure-art-'));
const cities=buildFixedCitySettlements();
for(const [id,docs] of Object.entries(cities)){
 const t=core.buildStructureArtTarget(id,docs.state,docs.layout);
 assert(t.layers.length>0);const prompt=core.structureArtPrompt(t,'exterior',{style:'絵本'});
 assert(prompt.includes('絵本'));for(const l of t.layers)l.markers.forEach((m,i)=>assert(prompt.includes(`${i+1}. ${m.label}`)));
 assert.throws(()=>core.structureArtSlot(t,'../../outside'));
}
const docs=cities.loc_sapphire_port;
const target=core.buildStructureArtTarget('fixed:port',docs.state,docs.layout);
assert.equal(core.buildStructureArtTarget('no-layout',docs.state).layers.length,0);
assert.notEqual(core.buildStructureArtTarget('different',docs.state,docs.layout).sourceHash,target.sourceHash);
assert.equal(core.structureArtEdits({style:'a'.repeat(4000)}).style.length,2000);
const source=path.join(root,'original.png');
fs.writeFileSync(source,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));
const image=readCartographyImage(source), original=fs.readFileSync(source);
const store=new StructureArtStore(root,'world-a',target);
store.adopt('exterior',image,'');const first=store.read();
store.adopt('exterior',image,first.revision);assert.equal(store.read().history.length,1);
assert.throws(()=>store.adopt('exterior',image,first.revision));
assert.equal(Object.keys(new StructureArtStore(root,'world-b',target).read().slots).length,0);
assert.equal(new StructureArtStore(root,'world-a',target).read().revision,store.read().revision);
const before=store.read();const rename=fs.renameSync;
fs.renameSync=()=>{throw Error('injected write failure');};
try{assert.throws(()=>store.adopt('exterior',image,before.revision),/write failure/);}finally{fs.renameSync=rename;}
assert.deepEqual(store.read(),before);assert.deepEqual(fs.readFileSync(source),original);
assert.throws(()=>store.imagePath({file:'../original.png'}));
const exported=store.export('資料','exterior',[]);assert.equal(fs.readFileSync(path.join(exported,'brief.md'),'utf8'),'資料');
assert.notEqual(store.export('資料','exterior',[]),exported);
assert.throws(()=>store.export('bad','exterior',[{name:'../escape.png',bytes:image.bytes}]));
const load=Module._load;let selected=source;const posts=[];
Module._load=function(id,parent,...args){
 if(id==='vscode')return {window:{showOpenDialog:async()=>selected?[{fsPath:selected}]:undefined},env:{clipboard:{writeText:async()=>{}}},commands:{executeCommand:async()=>{}},Uri:{file:x=>x}};
 if(id==='./gameStateSync'&&parent.filename.endsWith('structureArtHost.js'))return {safeImageUri:x=>x};
 return load.call(this,id,parent,...args);
};
const host=require('../out/structureArtHost');Module._load=load;
const panel={webview:{postMessage:async x=>posts.push(x)}};
const message={world:'host-world',target:target.id,sourceHash:target.sourceHash,slot:'exterior'};
(async()=>{
 host.registerStructureArtTargets(root,'host-world',[target]);
 await host.handleStructureArt({...message,action:'import'},root,panel);const preview=posts.at(-1).preview;assert(preview);
 await host.handleStructureArt({...message,action:'adopt',world:'wrong',token:preview.token},root,panel);assert(posts.at(-1).error);
 await host.handleStructureArt({...message,action:'adopt',token:preview.token},root,panel);assert(posts.at(-1).adopted);
 await host.handleStructureArt({...message,action:'adopt',token:preview.token},root,panel);assert(posts.at(-1).error);
 selected=undefined;await host.handleStructureArt({...message,action:'import'},root,panel);assert(posts.at(-1).notice);
 await host.handleStructureArt({...message,action:'list',slot:'removed-layer'},root,panel);assert(posts.at(-1).error);
 const hidden=JSON.parse(JSON.stringify(docs.layout));hidden.zones.push({id:'hidden_secret',layerId:'z0',label:'SECRET',x:1,y:1});
 const safe=core.buildStructureArtTarget('safe',docs.state,hidden);
 assert(!core.structureArtPrompt(safe,'exterior',{}).includes('SECRET'));
 assert(!JSON.stringify(safe.layers).includes('SECRET'));
 console.log('Structure art: six settlements, numbering, no-layout, persistence, isolation, stale tokens, rollback, hidden markers and export passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
