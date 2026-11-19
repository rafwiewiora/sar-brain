// The RENIN movie uses the same decisions and inventory as the full game board.
function installReninDecision(){
 document.body.classList.add('reninReplay');
 const panel=document.createElement('section');
 panel.id='reninDecision';
 document.querySelector('.board').replaceWith(panel);
 document.querySelector('.heading h1').textContent='RENIN';
 document.querySelector('.heading p').hidden=true;
}

// All columns use the same observations and stock at the start of this batch.
function reninRankPlot(ranking,pick){
 const {entries,activeColumn,shortlisted}=ranking,xs=[120,422,732],y=r=>45+(r-1)*248/Math.max(1,entries.length-1);
 const labels=['SAR only','SAR + cost',ranking.fepCost?'FEP or SAR + cost':'FEP or SAR'];
 const text=(x,y,value,anchor='middle',extra='')=>'<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'" '+extra+'>'+esc(value)+'</text>';
 const dots=(entry,color,r)=>xs.map((x,i)=>'<circle cx="'+x+'" cy="'+y(entry.ranks[i])+'" r="'+r+'" fill="'+color+'"/>').join('');
 let out=xs.map((x,i)=>text(x,22,labels[i],'middle',i===activeColumn?'class="activeRank"':'')).join('');
 out+='<rect x="66" y="36" width="683" height="'+(y(shortlisted.length+.5)-36)+'" rx="4" fill="#eaf6f1"/>';
 for(const r of [1,5,10,15,20,25].filter(r=>r<=entries.length)){
  out+='<path d="M66 '+y(r)+'H745" stroke="#dbe2e8"/>'+text(53,y(r)+4,r,'end');
 }
 const weight=e=>e.id===pick?2:shortlisted.includes(e.id)?1:0;
 const sorted=entries.slice().sort((a,b)=>weight(a)-weight(b));
 for(const e of sorted){
  const priority=weight(e),color=['#abb9c5','#24836e','#6738a9'][priority];
  const points=e.ranks.map((r,i)=>xs[i]+','+y(r)).join(' ');
  const forecast=g.forecasts.get(e.id);
  const prediction=forecast?' · FEP '+nm(forecast.p)+' (±1σ: '+nm(forecast.p+forecast.sigma/kcalPerLogPotency)+' – '+nm(forecast.p-forecast.sigma/kcalPerLogPotency)+')':'';
  const title=name(e.id)+' · '+e.ranks.map((r,i)=>labels[i]+' #'+r).join(' · ')+prediction;
  out+='<g class="rankSeries" data-rank-id="'+esc(e.id)+'" data-ranks="'+e.ranks.join(',')+'"><title>'+esc(title)+'</title><polyline points="'+points+'" fill="none" stroke="transparent" stroke-width="9"/><polyline class="rankStroke" points="'+points+'" fill="none" stroke="'+color+'" stroke-width="'+[1.25,2.6,4][priority]+'"/>'+dots(e,color,[2.3,3.6,5.3][priority])+'</g>';
 }
 const selected=entries.find(e=>e.id===pick);
 for(const col of [0,1])out+=text(xs[col]-9,y(selected.ranks[col])+5,'#'+selected.ranks[col],'end','class="rankNumber"');
 let last=20;
 for(const e of entries.filter(e=>weight(e)).sort((a,b)=>a.ranks[2]-b.ranks[2])){
  const yy=y(e.ranks[2]),ly=Math.max(last+20,yy),chosen=e.id===pick,color=chosen?'#6738a9':'#24836e';last=ly;
  out+='<path d="M739 '+yy+'L759 '+ly+'h8" stroke="'+color+'" fill="none"/>'+text(771,ly+4,'#'+e.ranks[2]+' '+name(e.id)+(chosen?' · pick':''),'start','fill="'+color+'" font-weight="720"');
 }
 return '<figure class="rankFigure"><figcaption>Round '+ranking.batch+' · '+entries.length+' candidates ranked before synthesis</figcaption><svg viewBox="0 0 925 308" role="img" aria-label="Candidate ranks across three scoring rules, highlighted compound selected for synthesis">'+out+'</svg></figure>';
}

function renderReninDecision(move){
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
 let heading='',content='',note='',button='',rankPlot='';
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
  if(decision.ranking){
   rankPlot=reninRankPlot(decision.ranking,id);
   const fepRange=from&&forecast.sigma>0?'<small class="rankRange">Modeled FEP range (±1σ) · '+nm(forecast.p+forecast.sigma/kcalPerLogPotency)+' – '+nm(forecast.p-forecast.sigma/kcalPerLogPotency)+'</small>':'';
   content=card(id,'Selected from the batch',info+fepRange+'<small class="rankRange">'+cost(delta.steps)+' from current stock</small>'+(after?'<strong class="decisionResult">Measured '+measured(id)+'</strong>':''));
  }
  if(after&&decision.unlocked.length)note='Now within FEP reach: '+(decision.unlocked.length===1?title(decision.unlocked[0]):count(decision.unlocked.length))+'.';
  button=action('make',after?cost(delta.steps)+' paid':'Make &amp; assay · '+cost(delta.steps)+' · $'+delta.money);
 }
 panel.dataset.index=move.index;
 panel.classList.toggle('withRanks',!!rankPlot);
 panel.innerHTML='<h2>'+heading+'</h2>'+rankPlot+'<div class="decisionMols">'+content+'</div>'+button+(note?'<div class="decisionNote">'+note+'</div>':'');
}
