/* Host-resolved structure artwork. No game-state mutations or provider calls. */
let structureArtWorld = '';
let structureArtTargets = [];
let structureArtSession = null;

function structureArtRaster(view, isometric) {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f3ebd5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const project = (x,y) => isometric ? isoProjectRaw(x,y,0) : { sx:x*32, sy:y*32 };
    const points = [...view.tiles, ...view.markers].map(t => project(t.x,t.y));
    if (!points.length) return canvas;
    const minX=Math.min(...points.map(p=>p.sx))-24, maxX=Math.max(...points.map(p=>p.sx))+40;
    const minY=Math.min(...points.map(p=>p.sy))-40, maxY=Math.max(...points.map(p=>p.sy))+40;
    const scale=Math.min(1100/(maxX-minX),900/(maxY-minY));
    ctx.translate((1200-(maxX-minX)*scale)/2-minX*scale,(1000-(maxY-minY)*scale)/2-minY*scale); ctx.scale(scale,scale);
    const colors={water:'#7bb8c8',wall:'#877969',gate:'#b89261',market:'#d2ad61',workshop:'#b27759',stockpile:'#b79768',quarters:'#d7c6a1',floor:'#e1d7b9',empty:'#ddd5bf',unknown:'#bab6ab'};
    [...view.tiles].sort((a,b)=>(a.x+a.y)-(b.x+b.y)).forEach(t=>{
        const p=project(t.x,t.y);ctx.fillStyle=colors[t.code]||'#b3bf91';ctx.strokeStyle='#796f5a';ctx.lineWidth=.6;
        if(isometric){
            const h=ISO_TILE_ELEVATION[t.code]||2;
            ctx.beginPath();ctx.moveTo(p.sx-16,p.sy);ctx.lineTo(p.sx,p.sy+8);ctx.lineTo(p.sx+16,p.sy);ctx.lineTo(p.sx+16,p.sy+h);ctx.lineTo(p.sx,p.sy+8+h);ctx.lineTo(p.sx-16,p.sy+h);ctx.closePath();ctx.fill();ctx.stroke();
            ctx.beginPath();ctx.moveTo(p.sx,p.sy-8);ctx.lineTo(p.sx+16,p.sy);ctx.lineTo(p.sx,p.sy+8);ctx.lineTo(p.sx-16,p.sy);ctx.closePath();ctx.fill();ctx.stroke();
        }else{ctx.fillRect(p.sx,p.sy,31,31);ctx.strokeRect(p.sx,p.sy,31,31);}
    });
    if(!isometric)view.markers.forEach((m,i)=>{
        const p=project(m.x,m.y);ctx.fillStyle='#25313c';ctx.beginPath();ctx.arc(p.sx+16,p.sy+16,10,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='white';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),p.sx+16,p.sy+16);
    });
    return canvas;
}

function structureArtElement(tag, text, parent) {
    const e=document.createElement(tag);if(text)e.textContent=text;if(parent)parent.appendChild(e);return e;
}
function openStructureArt(target, origin) {
    if(structureArtSession)structureArtSession.dialog.remove();
    const dialog=structureArtElement('dialog');dialog.style.cssText='width:min(900px,90vw);max-height:90vh;overflow:auto;background:var(--vscode-editor-background,#20242b);color:var(--vscode-foreground,#eee);';
    document.body.appendChild(dialog);
    const session={target,world:structureArtWorld,dialog,origin,edits:{},preview:null};structureArtSession=session;
    structureArtElement('h2',target.name+' — 画像と作成資料',dialog);
    const select=structureArtElement('select','',dialog);session.select=select;
    [['exterior','外観'],...target.layers.map(l=>[l.layerId,l.layerId+' 内装'])].forEach(([v,n])=>{const o=structureArtElement('option',n,select);o.value=v;});
    const status=structureArtElement('p','',dialog);status.setAttribute('role','status');session.status=status;
    const controls=structureArtElement('div','',dialog);
    const send=(action,extra={})=>vscode.postMessage({type:'structureArt',action,world:session.world,target:target.id,sourceHash:target.sourceHash,slot:select.value,edits:session.edits,...extra});session.send=send;
    const button=(name,action)=>{const b=structureArtElement('button',name,controls);b.type='button';b.style.margin='4px';b.onclick=action;return b;};
    button('説明文をコピー',()=>send('copy'));
    button('資料を保存',()=>{
        const layers=select.value==='exterior'?target.layers:target.layers.filter(l=>l.layerId===select.value);
        const images=layers.flatMap(l=>[false,true].map(iso=>({name:(iso?'iso-':'plan-')+l.layerId+'.png',data:structureArtRaster(l,iso).toDataURL('image/png').split(',')[1]})));
        send('export',{images});status.textContent='資料を保存しています…';
    });
    button('保存先を開く',()=>send('reveal'));
    button('完成画像を取り込む',()=>send('import'));
    button('設計図・集落表示に戻る',()=>{dialog.close();dialog.remove();structureArtSession=null;});
    const details=structureArtElement('details','',dialog);structureArtElement('summary','見た目の希望を編集',details);
    [['material','材質'],['color','色'],['decoration','装飾'],['style','画風'],['request','追加要望']].forEach(([key,name])=>{
        const label=structureArtElement('label',name,details);label.style.display='block';const input=structureArtElement('input','',label);input.maxLength=2000;input.placeholder='未指定（既存設定を尊重）';input.oninput=()=>session.edits[key]=input.value;
    });
    const images=structureArtElement('div','',dialog);session.images=images;
    const drawings=structureArtElement('details','',dialog);structureArtElement('summary','設計図・斜め上からの参考図',drawings);
    structureArtElement('p',target.facts.join('\n'),drawings);
    for(const layer of target.layers){structureArtElement('h3',layer.layerId,drawings);for(const iso of [false,true]){const c=structureArtRaster(layer,iso);c.style.width='48%';c.style.height='auto';drawings.appendChild(c);}structureArtElement('p',layer.markers.map((m,i)=>`${i+1}. ${m.label}`).join(' / '),drawings);}
    session.prompt=structureArtElement('pre','',dialog);session.prompt.style.whiteSpace='pre-wrap';
    select.onchange=()=>{session.preview=null;send('list');};
    dialog.addEventListener('cancel',()=>{dialog.remove();if(structureArtSession===session)structureArtSession=null;});
    dialog.showModal();send('list');
}
function mountStructureArtVehicle(parent,id) {
    const target=structureArtTargets.find(t=>t.vehicleId===id);if(!target)return;
    const b=structureArtElement('button','この車両を絵にする・画像を見る',parent);b.type='button';b.onclick=()=>openStructureArt(target,parent);
}
window.addEventListener('message',event=>{
    const m=event.data;
    if(m.type==='worldView'){
        // This is only the just-adopted preview. Never carry it into another location.
        document.querySelectorAll('[data-structure-art-image]').forEach(img=>img.remove());
        structureArtWorld=m.cartographyWorldKey||'';structureArtTargets=m.structureArtTargets||[];
        setTimeout(()=>{
            const mobile=document.getElementById('vehicles-mobile-base-panel');
            const mobileTarget=structureArtTargets.find(t=>t.vehicleId===m.mobileBasePanel?.vehicleId);
            if(mobile&&mobileTarget&&!mobile.querySelector('[data-structure-art-mobile]')){
                const mb=structureArtElement('button','この拠点を絵にする・画像を見る',mobile);mb.dataset.structureArtMobile='true';mb.onclick=()=>openStructureArt(mobileTarget,mobile);
            }
            const canvas=document.getElementById('world-settlement-canvas');if(!canvas)return;
            let b=document.getElementById('structure-art-settlement-button');if(!b){b=structureArtElement('button','この拠点を絵にする・画像を見る');b.id='structure-art-settlement-button';b.type='button';canvas.parentElement.insertBefore(b,canvas);}
            b.onclick=()=>{const view=getSelectedSettlementView(m);const target=structureArtTargets.find(t=>t.settlementId===view?.settlementId);if(target)openStructureArt(target,canvas.parentElement);};
            b.disabled=!structureArtTargets.some(t=>t.settlementId);
        },0);
        return;
    }
    const s=structureArtSession;if(m.type!=='structureArt'||!s)return;
    if(m.target!==s.target.id||m.world!==s.world||m.sourceHash!==s.target.sourceHash||m.slot!==s.select.value)return;
    if(m.error){s.status.textContent=m.error;return;}
    if(m.notice)s.status.textContent=m.notice;
    if(m.prompt)s.prompt.textContent=m.prompt;
    if(m.images){s.images.replaceChildren();for(const item of m.images.filter(i=>i.slot===s.select.value)){
        if(item.error){structureArtElement('p',item.error,s.images);continue;}
        if(item.stale)structureArtElement('p','旧配置を基にした画像です。資料を再出力できます。',s.images);
        const img=structureArtElement('img','',s.images);img.src=item.uri;img.alt=s.target.name;img.style.cssText='max-width:100%;height:auto;cursor:zoom-in';img.onclick=()=>{img.style.maxWidth=img.style.maxWidth==='none'?'100%':'none';};
    }}
    if(m.preview){
        s.preview=m.preview;s.images.replaceChildren();structureArtElement('p',m.preview.name+' / '+m.preview.slot+' に採用',s.images);
        const img=structureArtElement('img','',s.images);img.style.cssText='max-width:100%;height:auto';
        const adopt=structureArtElement('button','この画像を採用',s.images);adopt.disabled=true;
        img.onload=()=>adopt.disabled=false;img.onerror=()=>{s.status.textContent='画像をデコードできません';};img.src=m.preview.uri;
        adopt.onclick=()=>{adopt.disabled=true;s.send('adopt',{token:m.preview.token});};
        const cancel=structureArtElement('button','キャンセル',s.images);cancel.onclick=()=>s.send('cancel',{token:m.preview.token});
    }
    if(m.adopted){
        const item=m.images?.find(i=>i.slot===s.select.value&&i.uri);
        if(item&&s.origin?.isConnected){let img=s.origin.querySelector('[data-structure-art-image]');if(!img){img=structureArtElement('img','',s.origin);img.dataset.structureArtImage='true';}img.src=item.uri;img.alt=s.target.name;img.style.cssText='max-width:100%;max-height:360px;object-fit:contain';}
        s.dialog.close();s.dialog.remove();structureArtSession=null;
    }
});
