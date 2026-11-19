// The RENIN movie uses the same decisions and inventory as the full game board.
function installReninDecision(){
 document.body.classList.add('reninReplay');
 const panel=document.createElement('section');
 panel.id='reninDecision';
 panel.addEventListener('click',e=>{
  const pick=e.target.closest('button[data-pick]');
  if(pick)parent.postMessage({type:'pick',id:pick.dataset.pick,tick:Number(document.body.dataset.tick)},'*');
 });
 document.querySelector('.board').replaceWith(panel);
 document.querySelector('.heading h1').textContent='RENIN';
 document.querySelector('.heading p').hidden=true;
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
 let heading='',content='',note='',button='';
 if(playAction==='compare'){
  heading='Which would you make first?';
  content=decision.options.map((o,i)=>{
   const letter=i===0?'A':'B';
   const ref=o.model==='FEP'?decision.parents[o.id]:null;
   return '<div class="choiceOption">'+card(o.id,'Option '+letter,o.model+' estimate · <b>'+nm(o.estimate)+'</b><br>'+cost(o.price)+' from stock'+(ref?'<br>Reference · '+title(ref):''))+'<button data-pick="'+esc(o.id)+'">Choose '+letter+'</button></div>';
  }).join('');
  note='Two shortlisted compounds. Pick one to reveal the agent’s move.';
 }else if(!playAction){
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
  if(decision.pick)note='Your pick · '+title(decision.pick)+' &nbsp; / &nbsp; Agent’s pick · '+title(id);
  button=action('make',after?cost(delta.steps)+' paid':'Make &amp; assay · '+cost(delta.steps)+' · $'+delta.money);
 }
 panel.dataset.index=move.index;
 panel.innerHTML='<h2>'+heading+'</h2><div class="decisionMols">'+content+'</div>'+button+(note?'<div class="decisionNote">'+note+'</div>':'');
}
