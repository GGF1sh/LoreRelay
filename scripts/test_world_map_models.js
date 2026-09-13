const fs=require('fs'),path=require('path'),assert=require('assert/strict'),Module=require('module');
const repo=path.resolve(__dirname,'..');
const workspace=fs.mkdtempSync(path.join(require('os').tmpdir(),'lorerelay-model-host-'));
const root=path.join(workspace,'StableDiffusion');fs.mkdirSync(root,{recursive:true});
for(const [name,base] of [['generic','SDXL 1.0'],['anima','Anima'],['conflictPony','Illustrious']]){
fs.writeFileSync(path.join(root,name+'.safetensors'),'fixture');fs.writeFileSync(path.join(root,name+'.cm-info.json'),JSON.stringify({baseModel:base}));}
const lora=path.join(workspace,'Lora');fs.mkdirSync(lora,{recursive:true});fs.writeFileSync(path.join(lora,'sdxl.safetensors'),'fixture');
let roots=[workspace];const messages=[];const original=Module._load;
const vscode={workspace:{isTrusted:false,getConfiguration:()=>({get:(key,fallback)=>key==='modelScan.roots'?roots:fallback,update:async(key,value)=>{roots=value}})},ConfigurationTarget:{Workspace:2},window:{showOpenDialog:async()=>[{fsPath:workspace}]}};
Module._load=function(request,parent,isMain){
 if(request==='vscode')return vscode;
 if(request==='./workspacePaths')return {getWorkspacePath:()=>workspace,writeJsonAtomic:(file,data)=>fs.writeFileSync(file,JSON.stringify(data))};
 if(parent?.filename.endsWith('imageGenRunner.js')&&['./gameStateSync','./checkpoint','./vlmQueue','./mediaPaths','./stateManager'].includes(request))return {};
 return original.call(this,request,parent,isMain);
};
const runner=require(path.join(repo,'out/imageGenRunner'));const config=require(path.join(repo,'out/imageGenConfig'));Module._load=original;
runner.initImageGenRunner({extensionPath:repo,subscriptions:[],getPanel:()=>({webview:{postMessage:msg=>messages.push(msg)}})});
async function run(){
await runner.handleWorldMapModels({action:'list'});let state=messages.at(-1);assert.equal(state.status,'ready',JSON.stringify(state));assert.equal(state.comfyVerified,false);
const generic=state.rows.find(r=>r.comfyName==='generic.safetensors');assert(generic.compatible);
assert(!state.rows.find(r=>r.comfyName==='anima.safetensors').compatible);assert(!state.rows.find(r=>r.comfyName==='conflictPony.safetensors').compatible);assert(!state.rows.find(r=>r.evidence.category==='lora').compatible);
await runner.handleWorldMapModels({action:'apply',id:generic.id,templateId:'map-sdxl-direct'});state=messages.at(-1);assert.equal(state.status,'applied',JSON.stringify(state));
const saved=config.loadImageGenConfig(workspace);assert.equal(saved.checkpoint,'generic.safetensors');assert.equal(saved.cartographyTemplateId,'map-sdxl-direct');assert.equal(saved.mode,'natural');
await runner.handleWorldMapModels({action:'apply',id:'forged',templateId:'map-sdxl-direct'});assert.equal(messages.at(-1).status,'error');
await runner.handleWorldMapModels({action:'addRoot'});assert.equal(new Set(roots).size,roots.length);
console.log('Map model host: offline inventory, unsupported/contradictory metadata, LoRA rejection, apply/re-read, forged selection and folder registration passed.');}
run().catch(error=>{console.error(error);process.exitCode=1});
