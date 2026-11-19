// The RENIN movie uses the same decisions and inventory as the full game board.
function installReninDecision(){
 document.body.classList.add('reninReplay');
 const panel=document.createElement('section');
 panel.id='reninDecision';
 document.querySelector('.board').replaceWith(panel);
 document.querySelector('.heading h1').textContent='RENIN';
 document.querySelector('.heading p').hidden=true;
}

function renderReninDecision(move){
 if(move.decision.afterRanks){renderRankBoard(move);return;}
 const {phase,delta,targets,playAction,agentFocus:id,decision}=move;
 const after=phase==='pop'||phase==='settled';
 const measured=n=>nm(level.products[n].p);
 const title=n=>esc(name(n));
 const card=(n,role,detail)=>'<div class="decisionMol"><small>'+role+'</small>'+level.drawings[n]+'<h3>'+title(n)+'</h3><p>'+detail+'</p></div>';
 const action=(kind,label)=>'<button type="button" tabindex="-1" data-action="'+kind+'" class="decisionButton '+(after?'complete':'agentMove')+'">'+label+'</button>';
 const count=n=>n+' candidate'+(n===1?'':'s');
 const stats=$('stats'),panel=$('reninDecision');
 const best=g.made().reduce((a,b)=>level.products[a].p>=level.products[b].p?a:b);
 stats.innerHTML='<span><b>$'+(move.f.spent+move.f.queries)+'</b>Money spent</span><span><b>'+measured(best)+'</b>Best assay</span>';
 if(after&&delta.money)stats.querySelector('b').dataset.gain='+$'+delta.money;
 document.body.dataset.phase=phase;
 let heading='',content='',note='',button='';
 if(!playAction){
  heading='Start with '+targets.length+' measured compounds';
  const n=move.inspected?id:best;
  content=card(n,n===best?'Best starting assay':'Starting assay','Measured '+measured(n));
 }else if(playAction==='query-all'||playAction==='query'){
  const byRef=new Map();
  for(const n of targets){
   const parent=decision.parents[n];
   if(!byRef.has(parent))byRef.set(parent,[]);
   byRef.get(parent).push(n);
  }
  const single=targets.length===1||move.inspected;
  heading=targets.length===1?'Predict '+title(id):'Screen '+count(targets.length)+' with FEP';
  if(single){
   const ref=decision.parents[id];
   content=card(ref,'Measured reference',measured(ref))+'<span class="decisionArrow">→</span>'+card(id,'FEP candidate',after?'Predicted '+nm(g.forecasts.get(id).p):'Awaiting prediction');
   if(targets.length>1)note='Showing one comparison from this batch.';
  }else{
   const groups=[...byRef].sort((a,b)=>b[1].length-a[1].length);
   content=groups.slice(0,2).map(([ref,nodes])=>card(ref,'Measured reference','Reference for <b>'+count(nodes.length)+'</b>')).join('');
   if(groups.length>2)note=(groups.length-2)+' more references in this batch.';
  }
  if(targets.length>1){
   const sameMove=panel.dataset.index===String(move.index),open=sameMove&&panel.querySelector('details')?.open;
   note+='<details'+(open?' open':'')+'><summary>See all '+targets.length+' candidates</summary>'+[...byRef].map(([ref,nodes])=>'<p><b>'+title(ref)+' → </b>'+nodes.map(n=>'<span data-batch-target="'+esc(n)+'">'+title(n)+'</span>').join(', ')+'</p>').join('')+'</details>';
  }
  button=action(playAction,after?targets.length+' prediction'+(targets.length===1?'':'s')+' received':(playAction==='query-all'?'Run FEP on all eligible':'Run FEP')+' · $'+delta.queries);
 }else{
  const forecast=g.forecasts.get(id),from=decision.model==='FEP'&&forecast?forecast.parent:null;
  heading=(after?'Assayed ':'Make and assay ')+title(id);
  const info=from?'FEP from '+title(from)+' · '+nm(forecast.p):decision.model==='SAR'?'SAR estimate · '+nm(decision.estimate):'Selected by the hindsight oracle';
  content=card(id,'Selected for synthesis',info+(after?'<strong class="decisionResult">Measured '+measured(id)+'</strong>':''));
  if(after&&decision.unlocked.length)note='Now within FEP reach: '+(decision.unlocked.length===1?title(decision.unlocked[0]):count(decision.unlocked.length))+'.';
  button=action('make',after?cost(delta.steps)+' paid':'Make &amp; assay · '+cost(delta.steps)+' · $'+delta.money);
 }
 panel.dataset.index=move.index;
 panel.className='';
 panel.innerHTML='<h2>'+heading+'</h2>' + '<div class="decisionMols">'+content+'</div>'+button+(note?'<div class="decisionNote">'+note+'</div>':'');
}

let watchCompound='',rankAnimation=0;
function renderRankBoard(move){
 cancelAnimationFrame(rankAnimation);
 const {decision:d,phase,targets,playAction,delta,index}=move;
 const before=d.beforeRanks,after=d.afterRanks,col=after.activeColumn,oldRows=new Map(before.entries.map(e=>[e.id,e]));
 const newRows=new Map(after.entries.map(e=>[e.id,e]));
 const done=phase==='settled'||phase==='pop',current=done?newRows:oldRows;
 const making=playAction==='make',query=playAction?.startsWith('query'),opened=!playAction;
 const best=g.made().reduce((a,b)=>level.products[a].p>=level.products[b].p?a:b);
 const pick=move.agentFocus;
 const leader=[...current.values()].find(e=>e.ranks[col]===1)?.id;
 const automatic=opened?best:making||done||move.inspected||query&&targets.length===1?pick:leader;
 const id=watchCompound||automatic;
 const panel=$('reninDecision');
 panel.className=d.story?'liveRanks narrated':'liveRanks';
 const predictionCount=targets.length+' prediction'+(targets.length===1?'':'s');
 const title=making?(done?'Assayed ':'Make & assay ')+name(pick):query?(done?'Received '+predictionCount:'Run FEP on '+targets.length+' candidate'+(targets.length===1?'':'s')):'Opening inventory';
 const money=move.f.spent+move.f.queries;
 $('stats').innerHTML='<span><b'+(done&&delta.money?' data-gain="+$'+delta.money+'"':'')+'>$'+money+'</b>Money spent</span><span><b>'+nm(level.products[best].p)+'</b>Best assay</span>';
 document.body.dataset.phase=phase;

 const subtitle=opened?'Starting ranks':done?(making?'Ranks after assay':'Ranks after FEP'):(making?'Ranks before assay':'Ranks before FEP');
 const label=making&&d.ranking?' · batch pick '+(d.ranking.shortlisted.indexOf(pick)+1)+' of '+d.ranking.shortlisted.length:'';
 const actionLabel=query?(done?predictionCount+' received':'Run FEP on all eligible · $'+delta.queries):making?(done?cost(delta.steps)+' paid':'Make & assay · $'+delta.money):'';
 const btn=actionLabel?'<button tabindex="-1" data-action="'+playAction+'" class="decisionButton '+(done?'complete':'agentMove')+'">'+actionLabel+'</button>':'';
 const compoundLink=n=>'<button type="button" class="watchLink" data-watch="'+esc(n)+'">'+esc(name(n))+'</button>';
 let note='';
 if(done&&making){
  const partner=d.ranking?.shortlisted.find(n=>n!==pick&&newRows.has(n)&&oldRows.get(n).price>newRows.get(n).price);
  if(d.unlocked.length===1)note='FEP now reaches '+compoundLink(d.unlocked[0]);
  else if(partner)note=compoundLink(partner)+' now costs '+newRows.get(partner).price+' steps (was '+oldRows.get(partner).price+')';
  else if(d.unlocked.length)note='New FEP access · '+d.unlocked.length+' candidates';
 }
 const spotlight=watchCompound||(making||query&&(done||targets.length===1)?pick:leader);
 const secondary=making?(done&&d.unlocked.length===1?d.unlocked[0]:d.ranking?.shortlisted.find(n=>n!==pick&&current.has(n))):null;
 const optionIds=[...new Set([...level.order.filter(n=>g.stock.has(n)||current.has(n)),id])];
 const selector='<label>Inspect <select id="rankInspect"><option value="">Follow replay</option>'+optionIds.map(n=>'<option value="'+esc(n)+'" '+(n===watchCompound?'selected':'')+'>'+esc(name(n))+'</option>').join('')+'</select></label>';
 const role=watchCompound?'Inspecting':opened?'Best starting assay':making?'Selected for synthesis':done?'FEP prediction':query&&targets.length===1?'Awaiting FEP':'Current leader';
 const f=g.forecasts.get(id),held=g.stock.has(id),s=current.get(id),old=oldRows.get(id),next=newRows.get(id);
 const price=s?.price??(making&&id===pick?delta.steps:undefined);
 const modelLine=f?'FEP from '+esc(name(f.parent))+' · <b>'+nm(f.p)+'</b>':s?'SAR estimate · <b>'+nm(s.sar)+'</b>':'';
 const range=f?.sigma>0?'<span class="rankRange">Modeled ±1σ · '+nm(f.p+f.sigma/kcalPerLogPotency)+' – '+nm(f.p-f.sigma/kcalPerLogPotency)+'</span>':'';
 const rankText=done&&old&&next&&old.ranks[col]!==next.ranks[col]?'Rank #'+old.ranks[col]+' → #'+next.ranks[col]:s?'Rank #'+s.ranks[col]:making&&id===pick?'Assayed · removed from ranking':'Measured reference';
 const result=held?'<strong class="decisionResult">Measured '+nm(level.products[id].p)+'</strong>':'';
 const pickRanks=making&&id===pick?d.ranking?.entries.find(e=>e.id===pick)?.ranks:null;
 const selectedRanks=pickRanks?'<p>Batch ranks · '+pickRanks.map(r=>'#'+r).join(' → ')+'</p>':'';
 const listOpen=panel.dataset.index===String(index)&&panel.querySelector('details')?.open;
 const batchList=query?'<details'+(listOpen?' open':'')+'><summary>'+targets.length+' FEP '+(targets.length===1?'target':'targets')+'</summary><div>'+targets.map(n=>'<span data-batch-target="'+esc(n)+'">'+esc(name(n))+'</span>').join(', ')+'</div></details>':'';
 panel.dataset.index=index;
 panel.innerHTML='<div class="rankTitle"><h2>'+esc(title)+'</h2>'+btn+'</div><figure class="rankFigure"><figcaption>'+subtitle+' · '+current.size+' candidates'+label+'</figcaption><svg id="movingRanks" viewBox="0 0 925 320" role="group" aria-label="Candidate ranks, select a line to inspect"></svg></figure>'+
 '<section class="rankInfo"><header><b>Compound details</b>'+selector+'</header><div class="infoBody"><div class="infoMol">'+level.drawings[id]+'</div><div><small>'+role+'</small><h3>'+esc(name(id))+'</h3><p>'+modelLine+range+'</p>'+result+'</div><div class="infoMovement"><b>'+rankText+'</b>'+selectedRanks+(price!==undefined?'<p class="price">'+cost(price)+(held?' paid':' from stock')+'</p>':'')+(note&&id===pick?'<p class="access">'+note+'</p>':'')+'</div></div>'+batchList+'</section>';
 if(d.story){
  if(id===pick&&d.story.focus){
   const selector={assay:'.decisionResult',price:'.infoMovement .price',link:'.infoMovement .access',rank:'.infoMovement>b'}[d.story.focus];
   const evidence=panel.querySelector(selector);
   if(evidence)evidence.classList.add('storyEvidence',d.story.tone==='caution'?'caution':'positive');
  }
 }
 $('rankInspect').onchange=e=>{watchCompound=e.target.value;renderRankBoard({...move,decision:{...d,progress:done?1:0}});};
 const chart=$('movingRanks'),xs=[115,407,705],y=r=>48+(r-1)*247/Math.max(1,d.axisCount-1);
 function inspect(n){watchCompound=n;renderRankBoard({...move,decision:{...d,progress:done?1:0}});$('rankInspect').focus();}
 const watchLink=panel.querySelector('[data-watch]');if(watchLink)watchLink.onclick=()=>inspect(watchLink.dataset.watch);
 chart.onclick=e=>{const n=e.target.closest('[data-rank-id]')?.dataset.rankId;if(n)inspect(n);};
 const text=(x,y,t,ext='')=>'<text x="'+x+'" y="'+y+'" '+ext+'>'+esc(t)+'</text>';
 const labels=['SAR only','SAR + cost',after.fepCost?'FEP or SAR + cost':'FEP or SAR'];
 const header=labels.map((t,i)=>text(xs[i],23,t,'text-anchor="middle"'+(i===col?' class="activeRank"':''))).join('');
 let grid='<rect x="60" y="39" width="665" height="'+(y(2.5)-39)+'" fill="#eaf6f1"/>';
 for(const r of [1,5,10,15,20,25].filter(r=>r<=d.axisCount))grid+='<path d="M60 '+y(r)+'H725" stroke="#dbe3e8"/>'+text(50,y(r)+4,String(r),'text-anchor="end"');
 const ordered=[...oldRows.keys()].sort((a,b)=>priority(a)-priority(b));
 function priority(n){return n===spotlight?2:n===secondary||n===leader?1:0;}
 function paint(t){
  let svg=header+grid;
  const captions=[];
  for(const n of ordered){
   const a=oldRows.get(n),b=newRows.get(n),ending=!b;
   if(ending&&t>=1)continue;
   const yy=a.ranks.map((v,i)=>y(v+((b?.ranks[i]??v)-v)*t));
   const pr=priority(n),color=['#afbdc8','#24836e','#6738a9'][pr];
   const pts=yy.map((v,i)=>xs[i]+','+v).join(' ');
   const ranks=(t>=1?b:a).ranks;
   svg+='<g class="rankSeries" data-rank-id="'+esc(n)+'" data-ranks="'+ranks.join(',')+'" opacity="'+(ending?1-t:1)+'"><title>'+esc(name(n))+' · '+ranks.map(r=>'#'+r).join(' / ')+'</title><polyline points="'+pts+'" fill="none" stroke="transparent" stroke-width="9"/><polyline class="rankStroke" points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="'+[1.35,2.4,4][pr]+'"/>'+yy.map((v,i)=>'<circle cx="'+xs[i]+'" cy="'+v+'" r="'+[2,3.4,5][pr]+'" fill="'+color+'"/>').join('')+'</g>';
   if(pr===2)for(const i of [0,1])svg+=text(xs[i]-9,yy[i]+4,'#'+ranks[i],'text-anchor="end" class="rankNumber" opacity="'+(ending?1-t:1)+'" pointer-events="none"');
   if(pr)captions.push({n,yy:yy[2],color,alpha:ending?1-t:1,rank:ranks[2]});
  }
  let last=22;
  for(const c of captions.sort((a,b)=>a.yy-b.yy)){
   const ly=Math.max(last+18,c.yy);last=ly;
   svg+='<g data-rank-id="'+esc(c.n)+'" opacity="'+c.alpha+'"><path d="M713 '+c.yy+'L735 '+ly+'h6" stroke="'+c.color+'" fill="none"/>'+text(746,ly+5,'#'+c.rank+' '+name(c.n)+(making&&c.n===pick?' · pick':''),'fill="'+c.color+'" font-weight="700"')+'</g>';
  }
  chart.innerHTML=svg;chart.dataset.progress=t.toFixed(3);
 }
 if(phase==='pop'&&d.progress==null&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const start=performance.now();
  function advance(now){const u=Math.min(1,(now-start)/d.animateMs);paint(u*u*(3-2*u));if(u<1)rankAnimation=requestAnimationFrame(advance);}
  paint(0);rankAnimation=requestAnimationFrame(advance);
 }else paint(d.progress??(done?1:0));
}
