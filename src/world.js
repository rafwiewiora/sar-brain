const levels=JSON.parse(document.getElementById('levels').textContent);
const $=id=>document.getElementById(id), esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const nm=p=>Number((10**(9-p)).toPrecision(3)).toLocaleString('en-US',{maximumFractionDigits:3})+' nM';
const cost=n=>n+' '+(n===1?'step':'steps');
const teal='#087f82',purple='#7549ca',ink='#17263a',grey='#556982';
let level,g,idx,pinned,stage,message,model;
const errorAtCutoff=gameErrorScale;
let difficulty='medium',cut='0.60';
const key=()=> 'sarbrain-board-v4-'+level.key+'-'+difficulty+(cut==='0.60'?'':'-'+cut);
function chooseBoard(k,error,cutoff){
 const preset=replayDefaults(k);
 let settings={};
 try{settings=JSON.parse(localStorage.getItem('sarbrain-rules-'+k)||'{}')||{};}catch{}
 difficulty=[error,settings.error,preset.error].find(v=>Object.hasOwn(errorAtCutoff,v));
 cut=[cutoff,settings.cut,preset.cut].find(v=>['0.60','0.70','0.80','0.90'].includes(v));
 load(k);
}
// Same affine score dependence as the ABL1 replay, normalized at 0.60.
const sigmaForScore=score=>gameSigma(score,difficulty);
const spentCash=()=>g.history.reduce((total,a)=>total+(a.type==='query'?1:a.cost),0);
function play(type,id,parent){
 return (type==='query'||type==='make'||type==='prepare') && level.routes[id] && g.act(type,id,parent);
}
function finished(){return g.goal();}

const save=()=>{try{localStorage.setItem(key(),JSON.stringify({legacyOpening:!!level.legacyStock&&!level.openingPlatform,moves:g.history.map(({type,id,parent,batch})=>({type,id,parent,batch}))}));}catch{}};
const available=()=>level.order.filter(n=>!g.stock.has(n));
const similarity=(a,b)=>level.sim[idx.get(a)][idx.get(b)];
const name=n=>g.name(n);
function load(k,reset=false){
 level={...levels[k],edges:levels[k].edges.filter(e=>e[2]>=Number(cut)-1e-12)};$('boardCut').value=cut;$('strategyReplay').href='strategy_movie.html#'+k+'/'+difficulty+'/3/'+cut;
 let saved=null,migrated=false;
 if(!reset){try{
   saved=JSON.parse(localStorage.getItem(key())||'null');
   if(!saved && difficulty==='medium' && cut==='0.60'){
     const previous=level.openingPlatform?localStorage.getItem('sarbrain-board-v3-'+k):null;
     const moves=JSON.parse(previous||localStorage.getItem('sarbrain-board-v2-'+k)||'[]');
     if(moves.length){saved={moves,legacyOpening:!!level.legacyStock&&!previous};migrated=true;}
   }
 }catch{}}
 if(saved?.legacyOpening)level={...level,stock:level.legacyStock,openingPlatform:null};
 idx=new Map(level.order.map((n,i)=>[n,i]));g=campaign(level,sigmaForScore);
 for(const a of saved?.moves||[]){
   if(!play(a.type,a.id,a.parent))break;
   if(a.type==='query'&&Number.isInteger(a.batch))g.history.at(-1).batch=a.batch;
 }
 if(reset||migrated)save();
 stage=null;const pool=available();pinned=pool.find(n=>g.sources(n).length && level.routes[n].some(x=>level.stages[x]&&!g.stock.has(x)))||pool.find(n=>g.sources(n).length)||pool[0]||g.made()[0];
 message='Choose an analog to make, or select a shared intermediate below it to see what gets cheaper.';if(migrated)message='Previous moves restored. Saved FEP queries now use Medium error.';$('level').value=k;$('difficulty').value=difficulty;render();
}
function layout(){
 const made=g.made(),pool=available();
 const best=made.reduce((a,b)=>level.products[b].p>level.products[a].p?b:a);
 const sar=pool.slice().sort((a,b)=>g.rank(b,'sar')-g.rank(a,'sar'));
 const priced=pool.slice().sort((a,b)=>g.rank(b,'hybrid')-g.rank(a,'hybrid'));
 const picks=[...new Set([pinned,sar[0],priced[0],...sar.filter(n=>g.sources(n).length),...priced].filter(n=>pool.includes(n)))].slice(0,3);
 const parent=n=>made.reduce((a,b)=>similarity(n,b)>similarity(n,a)?b:a);
 const observed=[...new Set([...(made.includes(pinned)?[pinned]:[]),best,...(pool.includes(pinned)?g.sources(pinned).map(pair=>pair[0]):[]),...picks.map(parent),...made])].slice(0,3);
 const groups=picks.map(()=>[]);
 for(const n of pool.filter(n=>!picks.includes(n))){
   let closest=0;for(let i=1;i<picks.length;i++)if(similarity(n,picks[i])>similarity(n,picks[closest]))closest=i;
   groups[closest].push(n);
 }
 const positions=new Map(),rows=[110,242,374];
 observed.forEach((n,i)=>positions.set(n,[164,rows[i]]));
 picks.forEach((n,i)=>positions.set(n,[483,rows[i]]));
 made.filter(n=>!observed.includes(n)).forEach((n,i)=>positions.set(n,[19+17*(i%4),71+18*Math.floor(i/4)]));
 groups.forEach((group,i)=>{
  group.sort((a,b)=>similarity(picks[i],b)-similarity(picks[i],a));
  const columns=Math.max(7,Math.min(15,Math.ceil(Math.sqrt(group.length*2.3))));
  group.forEach((n,j)=>positions.set(n,[706+(j%columns)*Math.min(22,253/(columns+1))+(Math.floor(j/columns)%2)*5,rows[i]-12+17*Math.floor(j/columns)]));
 });
 return {made,pool,best,sar,priced,picks,parent,observed,groups,positions};
}
function textAt(x,y,s,size=16,color=ink,bold=500,anchor='start'){
 return '<text x="'+x+'" y="'+y+'" font-size="'+size+'" fill="'+color+'" font-weight="'+bold+'" text-anchor="'+anchor+'">'+esc(s)+'</text>';
}
function drawing(n,x,y,w,h){
 const svg=level.drawings[n], vb=svg.match(/viewBox=['"]([^'"]+)/)[1];
 return '<svg aria-hidden="true" pointer-events="none" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" viewBox="'+vb+'">'+svg.slice(svg.indexOf('>')+1,svg.lastIndexOf('</svg>'))+'</svg>';
}
const path=(d,color,width=1.7,dash='',arrow='')=>'<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="'+width+'" '+(dash?'stroke-dasharray="'+dash+'"':'')+(arrow?' marker-end="url(#'+arrow+')"':'')+'/>';
function node(n,kind,inside){
 return '<g role="button" tabindex="0" data-node="'+n+'" data-kind="'+kind+'" aria-label="'+esc(name(n))+'" aria-pressed="'+(stage===n||!stage&&pinned===n)+'"><title>'+esc(name(n))+'</title>'+inside+'</g>';
}
const fromStage=n=>!!stage&&level.routes[n].includes(stage);
function bead(n,x,y,measured){
 const selected=n===pinned&&!stage,related=fromStage(n);
 const fill=related?'#cab9de':measured?'#afd7c7':'white';
 return node(n,'compound','<circle cx="'+x+'" cy="'+y+'" r="8" fill="transparent"/><circle class="outline" cx="'+x+'" cy="'+y+'" r="'+(related?6:4.8)+'" fill="'+fill+'" stroke="'+(selected?ink:related?purple:'#9aaac0')+'"/>');
}
function mainNode(n,measured){
 const [x,y]=model.positions.get(n),on=n===pinned||fromStage(n),col=measured?teal:purple;
 const val=measured?nm(level.products[n].p):'$'+g.price(n)+' to make';
 const forecast=g.forecasts.get(n);
 let hint=measured?(n===model.best?'best measured':'assayed'):n===model.sar[0]&&n===model.priced[0]?'SAR + price picks agree':n===model.sar[0]?'SAR pick':n===model.priced[0]?'price-aware pick':forecast?'FEP queried':g.sources(n).length?'FEP available':'untested';
 return node(n,'compound','<rect class="outline" x="'+(x-78)+'" y="'+(y-45)+'" width="156" height="86" rx="8" fill="'+(measured?'#ffffff':'#ffffff')+'" stroke="'+(on?col:measured?'#a7c7bb':'#c5b6d1')+'" stroke-width="'+(on?3:1.4)+'"/>'+drawing(n,x-70,y-41,140,75)+textAt(x,y+59,name(n)+' · '+val,15,col,650,'middle')+textAt(x,y+76,hint,12,grey,480,'middle'));
}
function routeLane(){
 const target=pinned;
 const stages=level.routes[target].filter(n=>level.stages[n]), nodes=[...stages,target];
 const pos=new Map(nodes.map((n,i)=>[n,nodes.length===1?476:115+i*(775/(nodes.length-1))]));
 let s='<path d="M0 470 H1000 V630 H0Z" fill="#f7f9fc"/>'+path('M0 470H1000','#dce3ee',1)+textAt(24,495,'Synthesis route to '+name(target),17,purple,700);
 const [tx,ty]=model.positions.get(target),laneEnd=pos.get(target),corridor=tx+111;
 s+=path('M'+laneEnd+' 517 V466 Q'+laneEnd+' 459 '+(laneEnd-6)+' 459 H'+corridor+' V'+(ty+16)+' Q'+corridor+' '+(ty+12)+' '+(corridor-5)+' '+(ty+12)+' H'+(tx+81),purple,1.4,'','arr');
 for(const b of nodes)for(const a of nodes){
   if(a===b||!level.routes[b].includes(a))continue;
   if(nodes.some(mid=>mid!==a&&mid!==b&&level.routes[mid].includes(a)&&level.routes[b].includes(mid)))continue;
   const x=pos.get(a),X=pos.get(b),nonlocal=X-x>1.5*(775/Math.max(1,nodes.length-1));
   const y=nonlocal?507:551;
   s+=path('M'+(x+54)+' 551 Q'+(x+66)+' '+y+' '+(x+78)+' '+y+' L'+(X-79)+' '+y+' Q'+(X-66)+' '+y+' '+(X-56)+' 551',purple,1.8,'','arr');
 }
 for(const n of nodes){
   const x=pos.get(n),isTarget=n===target,chosen=stage===n,stocked=g.stock.has(n);
   const nmLabel=name(n).split(' · ')[0].replace(/^Intermediate /,'Int. ');
   s+=node(n,isTarget?'compound':'stage','<rect class="outline" x="'+(x-53)+'" y="517" width="106" height="62" rx="8" fill="'+(chosen?'#e8ddf3':'white')+'" stroke="'+(chosen||isTarget?purple:'#c4b3d0')+'" stroke-width="'+(chosen?2.8:1.5)+'"/>'+drawing(n,x-50,519,100,58)+textAt(x,599,nmLabel,14,purple,650,'middle')+textAt(x,617,stocked?'✓ in inventory':'$'+g.price(n)+(isTarget?' to make':' to stock'),12,grey,450,'middle'));
 }
 return s;
}
function map(){
 const {observed,picks,positions,made,pool,groups,parent}=model;
 let s='<defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="'+purple+'"/></marker></defs>';
 s+='<rect width="1000" height="470" fill="white"/>'+path('M314 16V450 M661 16V450','#dce3ee',1);
 for(const y of [199,331]) s+=path('M16 '+y+' H984','#eff2f7',1);
 s+=textAt(25,34,'Measured',22,teal,650)+textAt(329,34,'Candidates in focus',22,purple,650)+textAt(681,34,'Unassayed territory',22,ink,650);
 s+=textAt(25,54,made.length+' assay results',13,grey)+textAt(329,54,picks.length+' of '+pool.length+' unassayed',13,grey)+textAt(681,54,(pool.length-picks.length)+' hidden activities',13,grey);
 for(const b of picks){
   const [X,Y]=positions.get(b),a=parent(b),[x,y]=positions.get(a);
   const big=observed.includes(a);
   s+=path('M'+(x+(big?78:5))+' '+y+' C322 '+y+' 337 '+Y+' '+(X-78)+' '+Y,'#a7b5c7',1.7);
   for(const [a] of g.sources(b)){const [x,y]=positions.get(a);s+=path('M'+(x+(observed.includes(a)?76:5))+' '+(y+7)+' C337 '+(y+14)+' 345 '+(Y+10)+' '+(X-76)+' '+(Y+8),teal,2,'5 4');}
 }
 for(const [i,group] of groups.entries()){
   const y=positions.get(picks[i])[1];
   if(group.length)s+=textAt(701,y-28,'Nearest to '+name(picks[i]),12,grey,550);
   for(const n of group){
     const [x,Y]=positions.get(n);
     if(picks[i]===pinned && level.edges.some(([a,b])=>(a===pinned&&b===n)||(a===n&&b===pinned)))s+=path('M561 '+y+' Q632 '+y+' '+x+' '+Y,teal,1,'4 4');
   }
 }
 for(const n of [...made.filter(n=>!observed.includes(n)),...groups.flat()]){const [x,y]=positions.get(n);s+=bead(n,x,y,g.stock.has(n));}
 for(const n of observed)s+=mainNode(n,true);
 for(const n of picks)s+=mainNode(n,false);
 s+=routeLane();$('map').innerHTML=s;
}
function row(label,value){return '<div><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>';}
const btn=(type,label,cls='',disabled=false)=>'<button data-action="'+type+'" class="'+cls+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>';
function moveButton(type,id,label,cls=''){
 const dollars=type==='query'?1:g.price(id);
 return btn(type,label+' · $'+dollars,cls,finished());
}
function inspector(){
 const id=stage||pinned,made=g.stock.has(id);
 $('structure').innerHTML=level.drawings[id];$('title').textContent=name(id);
 $('role').textContent=stage?'Shared intermediate':made?'Measured compound':'Untested candidate';
 let detail='',buttons='';
 if(stage){
   const impacted=available().filter(n=>level.routes[n].some(i=>g.remaining(id).includes(i)));
   detail=row('Stock',made?'Prepared':cost(g.price(id)))+row('Analogs on this branch',level.order.filter(n=>level.routes[n].includes(id)).length);
   if(!made){detail+=row('Prices would fall for',impacted.length+' compounds');if(!g.goal())buttons+=moveButton('prepare',id,'Stock intermediate','main stage');}
   buttons+=btn('back','Back to '+name(pinned));
 }else if(made){
   detail=row('Measured '+level.endpoint,nm(level.products[id].p))+row('Untested FEP neighbors',available().filter(n=>g.sources(n).some(([r])=>r===id)).length);
   const forecast=g.forecasts.get(id);if(forecast)detail+=row('Earlier FEP prediction',nm(forecast.p));
   if(model.picks.length&&!g.goal())buttons+=btn('next','Inspect next move','main');
 }else{
   const sources=g.sources(id),f=g.forecasts.get(id);detail=row('SAR estimate',nm(g.sar(id).p))+row('Price from stock',cost(g.price(id)));
   if(f)detail+=row('FEP prediction',nm(f.p));
   if(f||sources.length){
     const parent=f?.parent??sources[0]?.[0], score=f?.score??sources[0]?.[1];
     if(parent&&Number.isFinite(score))detail+=row('FEP reference',name(parent))+row('LoMap score',score.toFixed(3))
       +row('Simulated error (1σ)',(f?.sigma??sigmaForScore(score)).toFixed(2)+' kcal/mol');
   }
   if(!g.goal()){buttons=moveButton('make',id,'Make & assay','main');if(sources.length&&!f)buttons+=moveButton('query',id,'Predict with FEP');
     const platform=level.routes[id].filter(i=>level.stages[i]&&!g.stock.has(i)).at(-1);
     if(platform)buttons+=btn('inspect-stage','Consider stocking '+name(platform).split(' · ')[0]);}
 }
 if(finished())buttons+=btn('restart','Play again');
 $('detail').innerHTML=detail;$('actions').innerHTML=buttons;
}
function markFepTargets(ids){
 const targets=new Set(ids);
 for(const item of $('map').querySelectorAll('[data-kind="compound"]'))item.classList.toggle('fepTarget',targets.has(item.dataset.node));
}
function render(){
 model=layout();$('goal').textContent=g.goal()?'Hit confirmed at '+nm(g.best)+'.':'Find and assay the '+nm(g.best)+' hit.';
 const stat=(n,s)=>'<span><b>'+esc(n)+'</b>'+s+'</span>';
 $('stats').innerHTML=stat('$'+spentCash(),'Money spent')+stat(new Set(g.history.map((a,i)=>a.batch??i)).size,'Moves played')+stat(nm(level.products[model.best].p),'Best assay');
 const eligible=g.eligibleFep().length;
 $('bulkFep').disabled=finished()||!eligible;
 $('bulkFep').textContent='Run FEP on all eligible · '+eligible+(eligible===1?' compound':' compounds')+' · $'+eligible;
 map();inspector();$('notice').textContent=message;
 $('find').innerHTML=level.order.map(n=>'<option value="'+n+'" '+(n===pinned?'selected':'')+'>'+esc(name(n))+(g.stock.has(n)?' ✓':'')+'</option>').join('');
}
function select(n,kind){
 stage=kind==='stage'?n:null;if(!stage)pinned=n;
 message=stage?'Highlighted molecules use this intermediate.':'';
 render();
}
function action(type){
 if(type==='inspect-stage'){
   const n=level.routes[pinned].filter(i=>level.stages[i]&&!g.stock.has(i)).at(-1);
   if(n)select(n,'stage');return;
 }
 if(type==='back'){select(pinned,'compound');return;}
 if(type==='next'){select(model.picks[0],'compound');return;}
 if(type==='restart'){restart();return;}
 const n=stage||pinned,src=type==='query'?g.sources(n)[0]?.[0]:undefined;
 if(finished()||!play(type,n,src))return;
 const e=g.history.at(-1);save();
 if(type==='query')message=name(src)+' predicts '+name(n)+' at '+nm(g.forecasts.get(n).p)+'. Its assay is still hidden.';
 else{const discounts=Object.entries(g.savings()).sort((a,b)=>b[1]-a[1]);message=(type==='make'?name(n)+' assayed at '+nm(level.products[n].p):name(n)+' prepared')+'. Spent '+cost(e.cost)+'.';if(discounts.length){const [k,v]=discounts.find(([id])=>id===pinned)||discounts[0];message+=' '+name(k)+' now costs '+cost(g.price(k))+' (was '+(g.price(k)+v)+').';}if(g.goal()){stage=null;pinned=g.made().find(id=>level.products[id].p>=g.best-1e-8);message+=' Winner confirmed.';}}
 render();
}
function openDialog(body){$('dialogBody').innerHTML=body;if(!$('dialog').open)$('dialog').showModal();}
function restart(){openDialog('<h2>Restart '+level.key+'?</h2><p>This clears your moves on this map.</p>'+btn('confirm','Restart map'));}
$('map').addEventListener('click',e=>{const item=e.target.closest('[data-node]');if(item)select(item.dataset.node,item.dataset.kind);});
$('map').addEventListener('keydown',e=>{const item=e.target.closest('[data-node]');if(item&&['Enter',' '].includes(e.key)){e.preventDefault();select(item.dataset.node,item.dataset.kind);$('map').querySelector('[data-node="'+item.dataset.node+'"][data-kind="'+item.dataset.kind+'"]')?.focus();}});
$('actions').onclick=e=>{const b=e.target.closest('[data-action]');if(b)action(b.dataset.action);};
$('bulkFep').onclick=()=>{
 const targets=g.queryAll();if(!targets.length)return;
 save();message='Predicted '+targets.length+' compounds · $'+targets.length+' spent.';render();
};
$('bulkFep').onpointerenter=$('bulkFep').onfocus=()=>markFepTargets(g.eligibleFep());
$('bulkFep').onpointerleave=$('bulkFep').onblur=()=>markFepTargets([]);
$('level').onchange=e=>chooseBoard(e.target.value);$('find').onchange=e=>select(e.target.value,'compound');
$('difficulty').onchange=$('boardCut').onchange=()=>{
 save();difficulty=$('difficulty').value;cut=$('boardCut').value;
 try{localStorage.setItem('sarbrain-rules-'+level.key,JSON.stringify({error:difficulty,cut}));}catch{}
 load(level.key);
};
$('guide').onclick=()=>openDialog('<h2>How to play</h2><p>Start with '+level.stock.filter(n=>idx.has(n)).length+' measured references. '+(level.openingPlatform?'These are three analogs with the fewest additional steps from one sampled upstream intermediate. ':'')+'Find and assay the '+nm(g.best)+' hit. Every hollow dot is a real compound with its activity hidden.</p><p><b>Make &amp; assay.</b> Pay $1 per missing synthesis operation. The assay is included. Its result updates SAR, and the intermediates you made stay in inventory.</p><p><b>Stock an intermediate.</b> Pay for its preparation now. Every analog whose route shares those operations becomes cheaper. The lower lane shows reusable stops on the selected route.</p><p><b>Predict.</b> Spend $1 to predict from the measured reference with the highest LoMap score of at least '+cut+'. At 0.60, simulated Gaussian error (1σ) is 0.5, 1 or 2 kcal/mol on Easy, Medium or Hard. Error decreases linearly to one fifth of that at score 1.00. Predictions stay fixed. Each difficulty saves its own game. Assay the hit to win.</p><p>Candidates are grouped by fingerprint similarity. The center shows the selected analog and leading moves by SAR or SAR with current price.</p><p>'+esc(level.patent)+' · '+(level.key==='RENIN'?'26 costed analogs and 15 early references':level.order.length+' costed compounds')+'. Prices are game dollars. Starting stock is supplied.</p>'+btn('restart','Restart board'));
$('dialogBody').onclick=e=>{const b=e.target.closest('[data-action]');if(!b)return;if(b.dataset.action==='restart')restart();else if(b.dataset.action==='confirm'){$('dialog').close();load(level.key,true);}};
$('close').onclick=()=>$('dialog').close();
const [startKey,startError,startCut]=location.hash.slice(1).split('/');
chooseBoard(Object.hasOwn(levels,startKey)?startKey:'S1P1',startError,startCut);
