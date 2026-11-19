'use strict';
const D=JSON.parse(document.getElementById('dataset').textContent);
const $=id=>document.getElementById(id);
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const display=id=>D.movie && D.compounds[id]?.name || id.replace('CPD_','CPD ');
const dateLabel=date=>new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const all=Object.values(D.compounds), families=[...new Set([...D.groups.map(g=>g.family),...all.map(c=>c.family)])].sort();
// Give compounds a stable horizontal slot within their integer depth.
const depthPeers=new Map();
for(const c of all){if(!depthPeers.has(c.depth))depthPeers.set(c.depth,[]);depthPeers.get(c.depth).push(c.id);}
const offsets=new Map();
for(const ids of depthPeers.values())ids.sort().forEach((id,i)=>offsets.set(id,ids.length===1?0:.8*(i/(ids.length-1)-.5)));
const familyColors={
 'Stage 174.1':'#7c3aed','Stage 169.2':'#2563eb','Stage 185.2':'#0891b2',
 'Stage 189.1':'#0d9488',Benzamides:'#b45309',Nicotinamides:'#4f65a5',
 Indole:'#7c3aed','Azaindole · [3,2-b]':'#2563eb','Azaindole · [2,3-b]':'#0891b2','Azaindole · [2,3-c]':'#0d9488','Azaindole · [3,2-c]':'#be185d',Indolizine:'#d97706',Pyrrolopyridazine:'#92400e',Acylguanidine:'#64748b'};
const num=(v,places=1)=>Number(v.toFixed(places)).toString();
const mol=id=>D.molecules[id]?.svg||'<span class="emptyDrawing">Drawing unavailable</span>';
let path=D.movie?'movie':'hindsight',view='brain',frameIndex=0,focus=null,panelId=null,timer=null,chartWidth=0;
const frames=()=>D.paths[path], current=()=>frames()[frameIndex], initial=()=>frames()[0];
const panelFor=id=>D.panels.find(p=>p.id===id);
const defaultTarget=()=>current().focus||current().targets.at(-1)||'CPD_20';
function bestPanel(id){
 const options=D.panels.filter(p=>p.ids.includes(id));
 const route=current().paidRoutes[id]||current().routes[id]||[];
 const touched=new Set(route.flatMap(r=>[...D.reactions[r].inputs,...D.reactions[r].outputs,r]));
 return options.find(p=>p.id===D.platform&&touched.has(p.goal))||[...options].reverse().find(p=>touched.has(p.goal))||options[0];
}
function setFocus(id,p){focus=id;panelId=p||bestPanel(id)?.id||D.platform}
function stop(){clearInterval(timer);timer=null;$('play').textContent='▶';$('play').setAttribute('aria-label','Play replay')}
function closePopup(){$('popup').hidden=true;$('plot').querySelector('[data-group][aria-pressed="true"]')?.setAttribute('aria-pressed','false')}
function go(index){
 frameIndex=Math.max(0,Math.min(index,frames().length-1));
 setFocus(defaultTarget());closePopup();render();
 if(frameIndex===frames().length-1)stop();
}
function switchView(next){view=next;closePopup();render()}
const positions={hindsight:0,forward:0};
function setPath(next){if(next===path)return;stop();positions[path]=frameIndex;path=next;go(positions[path])}
function togglePlay(){
 if(timer){stop();return}
 if(frameIndex===frames().length-1)go(0);
 timer=setInterval(()=>go(frameIndex+1),2200);
 $('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Pause replay');
}
function changeLabel(){
 const f=current(),before=frames()[Math.max(0,frameIndex-1)];
 if(D.movie)return f.caption;
 if(!frameIndex)return path==='hindsight'?'Start at CPD 14 with the winner supplied.':'Start with the 15 early references. Query their neighbours.';
 const batch=f.targets.map(display).join(' + ');
 if(f.targets.includes(D.winner))return batch+' · 1 nM winner · '+(path==='forward'?'2 steps to CPD 270, 1 to its batch partner':'2 steps from the retained chloride');
 if(before.quotes[D.winner]===9&&f.quotes[D.winner]===2)return batch+' · the azaindole chloride cuts the winner’s remaining route from 9 steps to 2';
 return 'Make '+batch+' · +'+(f.spent-before.spent)+' synthesis steps';
}
function render(){
 const f=current();
 $('caption').textContent=changeLabel();
 $('caption').classList.toggle('storyBeat',!!f.beat);
 if(f.beat){
  const tag=document.createElement('span');
  tag.textContent={unlock:'Reference unlocked',prediction:'FEP prediction',assay:'Assay confirmed'}[f.beat];
  $('caption').prepend(tag);
 }
 if(D.movie&&!D.movie.archived){
  $('money').hidden=false;$('money').innerHTML='<strong>$'+(f.spent+f.queries)+'</strong> spent';
 }
 $('cost').textContent=f.spent;$('made').textContent=(f.made.length-D.startingReferences.length)+' new compounds';
 $('queries').textContent=f.queries+' FEP '+(f.queries===1?'query':'queries');
 $('shortResult').textContent=!D.movie&&frameIndex===frames().length-1?'Largest advance in recorded date · '+f.maxLeap+' days':'';
 $('position').textContent=(frameIndex+1)+' / '+frames().length;
 $('prev').disabled=frameIndex===0;$('next').disabled=frameIndex===frames().length-1;
 document.querySelectorAll('[data-path]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.path===path)));
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 $('brain').hidden=view!=='brain';$('retro').hidden=view!=='retro';
 if(view==='brain')renderBrain();else renderRetro();
}
const tint=v=>v>=8?'#17824e':v>=7?'#e49b1a':'#c45548';
function renderBrain(){
 const f=current(),known=new Set(f.known),made=new Set(f.made),fresh=new Set(f.targets);
 if(!frameIndex&&path==='hindsight')fresh.add('CPD_14');
 const w=Math.max(660,$('plot').parentElement.clientWidth||1050);chartWidth=w;$('plot').style.minWidth='660px';
 const left=w>850?175:130,right=w-26,span=right-left,top=25;
 const plotTop=($('plot').getBoundingClientRect?.().top||160)+(window.scrollY||0);
 // Use the original full-network domains: 58% affinity, 10% separation, 32% platforms.
 const area=Math.max(families.length*24/.32,(window.innerHeight||830)-plotTop-top-58);
 const h=top+area+58,laneHeight=area*.32;
 const base=top+area*.58, laneTop=h-58-laneHeight;
 const spacing=laneHeight/families.length,last=laneTop+laneHeight;
 const x0=Date.parse('2006-01-01'),x1=Math.max(...all.map(c=>Date.parse(c.date)))+86400000*12;
 const x=t=>left+(Date.parse(t)-x0)/(x1-x0)*span;
 const readings=Object.values(f.forecasts||{}), ymin=Math.min(3.5,...readings,...all.map(c=>c.pIC50)), ymax=Math.max(9.35,...readings,...all.map(c=>c.pIC50));
 const y=v=>base-(v-ymin)/(ymax-ymin)*(base-top);
 const undated=!!D.movie&&!D.startingDate;
 const maxDepth=Math.max(16,...all.map(c=>c.depth||0),...D.groups.map(g=>g.depth));
 const dx=d=>left+(d+.5)/(maxDepth+1.5)*span;
 const spread=undated&&D.movie.target==='ABL1';
 const depths=[...depthPeers.keys()].filter(Number.isFinite),minD=Math.min(...depths),maxD=Math.max(...depths);
 const column=d=>left+(d-minD+.55)/(maxD-minD+1.1)*span;
 const cx=c=>spread?column(c.depth+offsets.get(c.id)):undated?dx(c.depth):x(c.date);
 const value=c=>!made.has(c.id)?f.forecasts?.[c.id]??c.pIC50:c.pIC50;
 const gy=g=>laneTop+(families.indexOf(g.family)+.5)*spacing;
 const text=(xx,yy,s,extra='')=>'<text x="'+xx+'" y="'+yy+'" '+extra+'>'+E(s)+'</text>';
 const line=(x1,y1,x2,y2,opts)=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" '+opts+'/>';
 let out='<svg style="display:block" width="100%" height="'+h+'" viewBox="0 0 '+w+' '+h+'" role="group" aria-label="RENIN affinity by recorded date and retained platforms by synthetic depth"><g font-size="12" fill="#536678">';
 for(let p=Math.ceil(ymin);p<=Math.floor(ymax);p++){out+=line(left,y(p),right,y(p),'stroke="#e6ebef"')+text(left-12,y(p)+4,p,'text-anchor="end"')}
 out+=text(13,(top+base)/2,(D.movie?D.movie.target+' p'+D.movie.endpoint:'RENIN pIC50'),'text-anchor="middle" transform="rotate(-90 13 '+((top+base)/2)+')"');
 if(spread){for(const d of depths)out+=line(column(d),top,column(d),base,'stroke="#e6ebef"')+text(column(d),base+16,d,'text-anchor="middle"');}
 else if(undated){for(let d=0;d<=maxDepth;d+=2)out+=line(dx(d),top,dx(d),base,'stroke="#edf0f4"')+text(dx(d),base+16,d,'text-anchor="middle"');}
 else {for(const [t,label] of [['2006-04-01','Apr 2006'],['2006-07-01','Jul 2006'],['2007-01-01','Jan 2007'],['2007-07-01','Jul 2007'],['2008-01-01','Jan 2008']]){
  out+=line(x(t),top,x(t),base,'stroke="#edf0f4"')+text(x(t),base+16,label,'text-anchor="middle"');
 }
 out+=line(x(D.startingDate),top,x(D.startingDate),base,'stroke="#9daebf" stroke-dasharray="3 4"');
 out+=text(x(D.startingDate),top-9,'Starting inventory','text-anchor="middle"');
 }
 out+=text((left+right)/2,base+37,spread?'Synthetic depth · dots spread within each depth':undated?'Synthetic dependency depth (operations)':'Recorded experimental date','text-anchor="middle" font-weight="600"');
 out+='<rect x="'+left+'" y="'+laneTop+'" width="'+span+'" height="'+laneHeight+'" fill="#f8fafc"/>';
 for(let i=0;i<families.length;i++){const pos=laneTop+(i+.5)*spacing;out+=text(left-9,pos+4,families[i],'text-anchor="end" fill="#64748b"')+line(left,pos,right,pos,'stroke="#e2e8f0"')}
 for(let j=0;j<=maxDepth;j+=2)out+=line(dx(j),laneTop,dx(j),last,'stroke="#eef0f3"')+text(dx(j),last+17,j,'text-anchor="middle"');
 out+=text((left+right)/2,last+40,'Synthetic dependency depth (operations)','text-anchor="middle" font-weight="600"');
 const groupMap=Object.fromEntries(D.groups.map(g=>[g.id,g])),inv=new Set(f.inventory);
 const linkSet=new Set(f.links.map(([g])=>g));
 const cumulative=new Map(),between=new Map(),key=(a,b)=>a+'|'+b;
 for(const past of frames().slice(0,frameIndex+1)){
  for(const [g,c] of past.links)cumulative.set(key(g,c),[g,c,past===f]);
  for(const [a,b] of past.platformLinks||[])between.set(key(a,b),[a,b,past===f]);
 }
 const buttonHeight=Math.max(24,Math.min(32,spacing-7));
 out+='<defs><marker id="lane-tip" markerUnits="userSpaceOnUse" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#7c3aed"/></marker></defs><g aria-hidden="true" pointer-events="none">';
 for(const [a,b,now] of between.values()){
  const A=groupMap[a],B=groupMap[b];
  const sx=dx(A.depth),tx=dx(B.depth),sy=gy(A)-buttonHeight/2-1,ty=gy(B)-buttonHeight/2-2;
  const rise=Math.max(4,Math.min(spacing-buttonHeight-2,7+Math.abs(tx-sx)*.018));
  const topY=Math.min(sy,ty)-rise;
  out+='<path data-syn-platform="" d="M '+sx+' '+sy+' C '+sx+' '+topY+', '+tx+' '+topY+', '+tx+' '+ty+'" fill="none" stroke="#7c3aed" stroke-width="'+(now?2:1.5)+'" marker-end="url(#lane-tip)" opacity="'+(now?.95:.62)+'"/>';
 }
 for(const [gid,id,now] of cumulative.values()){
  const g=groupMap[gid],c=D.compounds[id];
  out+=line(dx(g.depth),gy(g),cx(c),y(value(c)),'data-syn-product="" stroke="#7c3aed" stroke-width="'+(now?2.25:1.5)+'" stroke-dasharray="3 4" opacity="'+(now?.88:.48)+'"');
 }
 out+='</g>';
 for(const [a,b] of f.edges){const A=D.compounds[a],B=D.compounds[b];out+=line(cx(A),y(value(A)),cx(B),y(value(B)),'stroke="#087f7e" stroke-dasharray="6 5" stroke-width="'+(fresh.has(b)?2.5:1.2)+'" opacity="'+(fresh.has(b)?1:.46)+'"')}
 const spotlight=new Set(f.beat==='unlock'?[f.reference]:f.beat?[f.reference,f.candidate]:[]);
 if(f.beat&&f.beat!=='unlock'){
  const a=D.compounds[f.reference],b=D.compounds[f.candidate];
  out+=line(cx(a),y(value(a)),cx(b),y(value(b)),'stroke="white" stroke-width="8" pointer-events="none"')+line(cx(a),y(value(a)),cx(b),y(value(b)),'stroke="#007b76" stroke-width="4" stroke-dasharray="7 4" pointer-events="none"');
 }
 const level=c=>fresh.has(c.id)&&made.has(c.id)?3:made.has(c.id)?2:known.has(c.id)?1:0;
 for(const c of [...all].sort((a,b)=>Number(spotlight.has(a.id))-Number(spotlight.has(b.id))||level(a)-level(b))){
  const l=level(c),px=cx(c),py=y(value(c)),r=fresh.has(c.id)?8.2:[3.7,4.2,5.3,8.2][l];
  if(spotlight.has(c.id))out+='<circle cx="'+px+'" cy="'+py+'" r="14" fill="#ccf2ee" stroke="#007b76" stroke-width="2" pointer-events="none"/>';
  const title=display(c.id)+' · '+(c.date?dateLabel(c.date):'Depth '+c.depth)+(known.has(c.id)?' · '+num(10**(9-value(c)),2)+' nM':'');
  out+='<g class="tap" role="button" tabindex="'+(l?0:-1)+'" data-cpd="'+c.id+'" aria-label="'+E(title)+'"><title>'+E(title)+'</title><circle cx="'+px+'" cy="'+py+'" r="'+(r+2)+'" fill="transparent"/><circle class="vis" cx="'+px+'" cy="'+py+'" r="'+r+'" fill="'+(l>=2?tint(c.pIC50):l===1?'white':'#dbe2e9')+'" stroke="'+(l===3?'#16263b':l===1?'#087f7e':'none')+'" stroke-width="2.3"/></g>';
 }
 const currentLabels=[...(spotlight.size?spotlight:fresh)].map(id=>D.compounds[id]).filter(Boolean);
 const labels=[];
 for(const c of currentLabels){const px=cx(c),py=y(value(c));let yy=py<top+25?py+21:py-12;
  while(labels.some(z=>Math.abs(z[0]-px)<105&&Math.abs(z[1]-yy)<15))yy+=18;
  labels.push([px,yy]);
  out+=text(px,yy,display(c.id)+' · '+num(10**(9-value(c)),2)+' nM','font-weight="650" text-anchor="middle" fill="#1b3047" pointer-events="none" style="paint-order:stroke;stroke:white;stroke-width:4px"');
 }
 const buttons=D.groups.map(g=>{
  const count=g.nodes.filter(id=>inv.has(id)).length;
  const active=linkSet.has(g.id),color=familyColors[g.family]||'#64748b';
  const tip=g.family+' · depth '+g.depth+' · '+count+' of '+g.nodes.length+' available';
  return '<button type="button" class="platform-button '+(active?'current':count?'retained':'context')+'" data-group="'+E(g.id)+'" style="left:'+dx(g.depth)+'px;top:'+gy(g)+'px;height:'+buttonHeight+'px;--family:'+color+'" aria-label="'+E(tip)+'" title="'+E(tip)+'" aria-pressed="false">'+g.nodes.length+'</button>';
 }).join('');
 $('plot').innerHTML=out+'</g></svg>'+buttons;

}
function showCompound(id){
 closePopup();
 const c=D.compounds[id],f=current(),value=c=>f.made.includes(id)?c.pIC50:f.forecasts?.[id]??c.pIC50,status=f.made.includes(id)?'Made':f.known.includes(id)?(D.movie?'FEP prediction':'Ideal FEP prediction'):'Historical measurement';
 const popup=$('popup');popup.innerHTML='<header><h3>'+display(id)+'</h3><button data-close aria-label="Close details">×</button></header><div class="mol">'+mol(c.node)+'</div><p>'+status+' · <b>'+num(10**(9-value(c)),2)+' nM</b><br><span class="muted">'+(c.date?dateLabel(c.date):'Depth '+c.depth)+' · '+E(c.family||'Early reference')+'</span></p>'+(id in f.quotes?'<button data-inspect="'+id+'">See synthesis →</button>':'');
 popup.hidden=false;
}
function showGroup(id){
 const g=D.groups.find(a=>a.id===id),f=current(),popup=$('popup');
 const panels=D.panels.filter(p=>g.nodes.includes(p.id)||g.nodes.includes(p.goal));
 const member=g.nodes.find(n=>f.inventory.includes(n))||g.nodes[0];
 const m=D.molecules[member],isHeld=f.inventory.includes(member);
 $('plot').querySelector('[data-group][aria-pressed="true"]')?.setAttribute('aria-pressed','false');
 $('plot').querySelector('[data-group="'+g.id+'"]').setAttribute('aria-pressed','true');
 popup.innerHTML='<header><h3>'+E(g.family)+' · depth '+g.depth+'</h3><button data-close aria-label="Close details">×</button></header><div class="mol groupStructure">'+mol(member)+'</div><p>'+E(m.name)+(isHeld?' · retained':'')+'</p>'+panels.map(p=>'<button class="groupRoute" data-openpanel="'+E(p.id)+'">'+E(panelName(p))+' →</button>').join('');
 popup.hidden=false;
}
function panelName(p){if(!D.movie&&p.id===D.platform)return 'I5 · Azaindole chloride';return p.title}
function pickInPanel(p){
 return [...current().targets].reverse().find(id=>p.ids.includes(id))||(p.ids.includes(D.winner)?D.winner:p.ids[0]);
}
function species(n,kept,label){
 const m=D.molecules[n];const isRet=kept&&!m?.stock;
 return '<div class="species'+(isRet?' retained':'')+'"><div class="mol">'+mol(n)+'</div><b title="'+E(m?.name)+'">'+E(label||shortName(n))+'</b>'+(isRet?'<small>Retained intermediate</small>':'')+'</div>';
}
function shortName(n){
 const m=D.molecules[n];if(!D.movie&&n===D.platform)return 'I5 · Azaindole chloride';
 if(!m?.name)return 'Reaction partner';
 if(m.name.startsWith('CPD_'))return display(m.name);
 if(m.name.length<=60)return m.name;
 return m.stock?'Starting reagent':'Intermediate';
}
function renderRoute(id){
 const f=current(),rids=f.paidRoutes[id]||f.routes[id]||[],rs=rids.map(r=>D.reactions[r]);
 const total=rs.reduce((s,r)=>s+r.cost,0),isMade=f.made.includes(id);
 const c=D.compounds[id];
 $('routeName').textContent=display(id)+' · retrosynthesis';
 $('routeCost').textContent=isMade?(rids.length?total+' operations in its route when made':'In the starting inventory'):f.quotes[id]+' more operations from this inventory';
 // Follow the longest precursor branch along each row. Draw the other inputs
 // beside their disconnection and give prepared partners their own route.
 const producer=new Map(rs.flatMap(r=>r.outputs.map(n=>[n,r])));
 const height=new Map();
 function depth(n){
  if(!height.has(n)){const r=producer.get(n);height.set(n,r?1+Math.max(0,...r.inputs.map(depth)):0)}
  return height.get(n);
 }
 const held=n=>!producer.has(n)&&f.inventory.includes(n)&&!D.molecules[n]?.stock;
 function bondCount(n){return (D.molecules[n]?.svg.match(/class=['"]bond-/g)||[]).length}
 function structure(n,label){return species(n,held(n),label)}
 const width=$('route').clientWidth||window.innerWidth||1080;
 const perLine=Math.max(1,Math.min(4,Math.floor((width-145)/300)));
 const consumed=new Set(), pending=[c.node], strips=[];
 while(pending.length){
  const start=pending.shift();
  if(consumed.has(producer.get(start)))continue;
  let node=start;
  const chain=[];
  while(producer.has(node)&&!consumed.has(producer.get(node))){
   const rx=producer.get(node);consumed.add(rx);
   const inputs=[...rx.inputs].sort((a,b)=>depth(b)-depth(a)||Number(held(b))-Number(held(a))||bondCount(b)-bondCount(a));
   const [main,...partners]=inputs;
   if(!main)break;
   chain.push({from:node,rx,main,partners});
   pending.push(...partners.filter(n=>producer.has(n)));
   node=main;
  }
  if(!chain.length){strips.push('<div class="stock-product">'+species(start,false,display(id))+'</div>');continue}
  if(start!==c.node)strips.push('<div class="branchlabel">Co-reactant preparation</div>');
  for(let i=0;i<chain.length;i+=perLine){
   const segment=chain.slice(i,i+perLine);
   const cols=['minmax(0,1.4fr)'];
   let html=structure(segment[0].from,segment[0].from===c.node?display(id):undefined);
   for(const {rx,main,partners} of segment){
    cols.push('minmax(0,1fr)','minmax(0,1.4fr)');
    const extras=partners.map(n=>'<div class="rx-partner"><span aria-hidden="true">+</span>'+structure(n)+'</div>').join('');
    html+='<div class="retro-cut"><b>'+E(rx.name)+'</b><span class="retro-arrow" aria-label="retrosynthetic disconnection">⟹</span><small>'+rx.cost+(rx.cost===1?' operation':' operations')+'</small>'+extras+'</div>'+structure(main);
   }
   strips.push('<div class="chainRow" style="grid-template-columns:'+cols.join(' ')+'">'+html+'</div>');
  }
 }
 $('route').innerHTML=strips.join('');
}
function renderRetro(){
 const f=current(),p=panelFor(panelId)||bestPanel(focus);
 const used=[...new Set(['m_15b8004aa32c',D.platform,...frames().flatMap(f=>f.targets.map(id=>bestPanel(id)?.id)),p.id])].map(panelFor).filter(Boolean);
 $('panel').innerHTML=used.map(a=>'<option value="'+E(a.id)+'"'+(a.id===p.id?' selected':'')+'>'+E(panelName(a))+'</option>').join('');
 $('batchButtons').innerHTML=f.targets.length>1?f.targets.map(id=>'<button data-target="'+id+'" class="'+(focus===id?'focus':'')+'">'+display(id)+'</button>').join(''):'';
 const start=initial().quotes;
 const corePanels=D.movie?[D.platform]:['m_15b8004aa32c',D.platform];
 const ids=[...new Set([...corePanels,p.id])];
 $('squares').innerHTML=ids.map(pid=>{
  const group=panelFor(pid),kept=f.inventory.includes(group.goal)||f.paid.includes(pid);
  const title=D.movie?group.title:pid===D.platform?'Azaindole chloride':pid===corePanels[0]?'Indole chloride':panelName(group);
  const previous=frames()[Math.max(0,frameIndex-1)];
  const discounted=group.ids.filter(id=>!f.made.includes(id)&&previous.quotes[id]===9&&f.quotes[id]===2).length;
  const costHint=D.movie?'':pid!==D.platform?'':discounted?discounted+' compounds · 9 → 2 steps each':f.made.includes(D.winner)?'CPD 270 made':f.quotes[D.winner]+' steps to CPD 270';
  const buttons=group.ids.filter(id=>id in f.quotes).map(id=>{
   const made=f.made.includes(id),cost=f.quotes[id],less=cost<start[id];
   const label=display(id)+' · '+(made?'already made':cost+' steps from current inventory');
   return '<button aria-label="'+E(label)+'" title="'+E(label)+'" class="cell '+(made?'made':less?'discount':'')+(id===focus&&pid===p.id?' active':'')+'" data-pid="'+E(pid)+'" data-cell="'+id+'"><b>'+(made?'✓':cost)+'</b><small>'+display(id)+'</small></button>';
  }).join('');
  const drawing=D.molecules[group.goal]?'<div class="mol">'+mol(group.goal)+'</div>':'';
  return '<article class="platformCard '+(kept?'kept':'')+'"><h3>'+E(title)+'</h3><p class="muted">'+(kept?'Retained':'')+((kept&&costHint)?' · ':'')+E(costHint)+'</p><div class="platformContents">'+drawing+'<div class="squarelist">'+buttons+'</div></div></article>';
 }).join('');
 $('gridKey').textContent='Each square is one compound. Number = remaining steps. Purple = cheaper since the start. ✓ = made.';
 renderRoute(focus);
}
$('paths').addEventListener('click',e=>{const b=e.target.closest('[data-path]');if(b)setPath(b.dataset.path)});
$('views').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)switchView(b.dataset.view)});
$('prev').onclick=()=>{stop();go(frameIndex-1)};$('next').onclick=()=>{stop();go(frameIndex+1)};$('play').onclick=togglePlay;
$('panel').onchange=e=>{stop();const p=panelFor(e.target.value);setFocus(pickInPanel(p),p.id);renderRetro()};
$('squares').onclick=e=>{const b=e.target.closest('[data-cell]');if(b){stop();setFocus(b.dataset.cell,b.dataset.pid);renderRetro()}};
$('batchButtons').onclick=e=>{const b=e.target.closest('[data-target]');if(b){stop();setFocus(b.dataset.target);renderRetro()}};
function clickPlot(e){const target=e.target.closest('[data-cpd],[data-group]');if(!target){closePopup();return}
 stop();if(target.dataset.cpd)showCompound(target.dataset.cpd);else if(target.getAttribute('aria-pressed')==='true')closePopup();else showGroup(target.dataset.group);
}
$('plot').onclick=clickPlot;$('plot').onkeydown=e=>{if(e.target.closest('button'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();clickPlot(e)}};
$('popup').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-close'))closePopup();
 else if(b.dataset.inspect){setFocus(b.dataset.inspect);switchView('retro')}
 else if(b.dataset.openpanel){const p=panelFor(b.dataset.openpanel);setFocus(pickInPanel(p),p.id);switchView('retro')}};
document.addEventListener('click',e=>{if(!e.target.closest('#plot,#popup'))closePopup()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePopup();stop()}if(e.target.closest('select,input,textarea,summary'))return;
 if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();if(D.movie){parent.postMessage({type:'navigate',delta:e.key==='ArrowRight'?1:-1},'*');return}stop();go(frameIndex+(e.key==='ArrowRight'?1:-1))}});
window.addEventListener('resize',()=>{if(view==='brain')renderBrain();else renderRoute(focus)});
if(D.movie){
 document.querySelector('h1').textContent=D.movie.title;
 document.querySelector('main>header p').textContent=D.movie.subtitle;
 $('paths').innerHTML='<button aria-pressed="true">'+E(D.movie.policy)+'</button>';
 document.querySelector('.key .pred').parentElement.lastChild.textContent=D.movie.ideal?'Ideal FEP prediction':'FEP prediction';
 document.querySelector('details').innerHTML='<summary>Replay assumptions</summary><p>'+E(D.movie.assumptions)+'</p>';
 for(const [id,delta] of [['prev',-1],['next',1],['play',0]])$(id).onclick=()=>parent.postMessage({type:'navigate',delta},'*');
 window.addEventListener('message',e=>{
  if(e.source!==parent||e.data?.type!=='brain-frame')return;
  const i=e.data.index, f=frames()[i];f.focus=e.data.focus; f.targets=[e.data.focus];
  go(i);
  const {phase,delta}=e.data;document.body.dataset.phase=phase;
  for(const [id,amount,prefix] of [['money',delta.money,'+$'],['queries',delta.queries,'+'],['cost',delta.steps,'+']]){
   const el=$(id);
   if((phase==='pop'||phase==='settled')&&amount)el.dataset.gain=prefix+amount;
   else delete el.dataset.gain;
  }
  document.body.dataset.tick=e.data.tick;
  parent.postMessage({type:'painted',side:'brain',tick:e.data.tick},'*');
 });
 parent.postMessage({type:'loaded',side:'brain'},'*');
}else go(0);
