// Derive chemistry scenes from the completed simulation. These annotations never enter the policy.
function campaignNarration(board,run,cutoff,useFep){
 const {frames}=run,open=frames[0],final=frames.at(-1);
 const name=n=>board.products[n]?.name||board.stages[n];
 const potency=n=>Number((10**(9-n)).toPrecision(3)).toLocaleString('en-US',{maximumFractionDigits:4})+' nM';
 const activity=n=>potency(board.products[n].p);
 const best=ids=>ids.reduce((a,b)=>board.products[b].p>board.products[a].p?b:a);
 const winner=best(run.won?final.made:board.order),opening=campaign(board);
 const mol=(n,label='',drawing)=>'<div class="mol">'+(drawing||board.drawings[n])+'<b>'+name(n)+'</b><small>'+label+'</small></div>';
 const gallery=items=>'<div class="gallery">'+items.join('')+'</div>';
 function pair(a,b,left,right){
  const ids=[a,b],entry=board.storyEvidence?.pairs?.find(e=>ids.every(n=>e.ids.includes(n)));
  const rank=ids.map(n=>board.rankStructures?.[n]);
  let svgs=ids.map(n=>board.drawings[n]),note='';
  if(entry){
   svgs=ids.map(n=>entry.drawings[entry.ids.indexOf(n)]);note=entry.note;
  }else if(rank.every(Boolean)){
   const keys=[...new Set(rank.flatMap(r=>Object.keys(r.sites)))].filter(k=>rank[0].sites[k]?.[0]!==rank[1].sites[k]?.[0]);
   svgs=rank.map(r=>r.svg.replace('<!-- END OF HEADER -->','<g fill="#83d7ae" stroke="#83d7ae">'+keys.map(k=>r.sites[k]?.[2]||'').join('')+'</g>'));
   if(keys.length)note='Green marks the groups that differ.';
  }
  return {visual:gallery([mol(a,left,svgs[0]),'<span class="arrow">→</span>',mol(b,right,svgs[1])]),note};
 }
 function prep(stage){
  const record=board.storyEvidence?.preparations?.[stage];
  if(record)return {visual:'<div class="prepScheme">'+record.drawing+'</div>',note:'<a href="'+record.source+'" target="_blank" rel="noopener">'+record.citation+' ↗</a>'};
  const rx=board.rx[stage],inputs=(rx?.inputs||[]).map(n=>board.drawings[n]||board.precursorDrawings?.[n]);
  if(!inputs.length||inputs.some(svg=>!svg))return {visual:gallery([mol(stage,'Retained intermediate')]),note:rx?.name||''};
  const structures=inputs.map(svg=>'<div class="mol">'+svg+'</div>').join('<span>+</span>');
  return {visual:gallery([structures,'<span class="arrow">→</span>',mol(stage,rx.name)]),note:''};
 }
 const square=(n,change)=>'<div class="priceUpdate"><span>'+name(n)+'</span><div class="priceSquare"><b class="oldPrice">'+change[0]+'</b><b class="newPrice">'+change[1]+'</b></div><span>steps from stock</span></div>';
 const neighbors=new Map(board.order.map(n=>[n,[]]));
 if(useFep)for(const [a,b,s] of board.edges)if(s>=cutoff-1e-12){neighbors.get(a).push(b);neighbors.get(b).push(a);}
 const stories=frames.map((f,i)=>{
  const prev=frames[Math.max(0,i-1)],id=f.targets[0],added=f.stock.filter(n=>!prev.stock.includes(n));
  const step={kind:f.action,added,unlocked:[],watch:null,view:'brain',id};
  if(f.action==='open'){
   const top=open.made.slice().sort((a,b)=>board.products[b].p-board.products[a].p).slice(0,3);
   step.card=[open.made.length+' measured compounds supply the opening references',gallery(top.map(n=>mol(n,activity(n)+' measured'))),'Each new synthesis operation and each simulated FEP query costs $1.'];
  }else if(f.action==='query'){
   const target=f.targets.includes(winner)?winner:f.targets.reduce((a,b)=>f.forecasts[a]>f.forecasts[b]?a:b);
   const ref=f.parents[target],p=pair(ref,target,'Measured · '+activity(ref),'Predicted · '+potency(f.forecasts[target]));
   step.reference=ref;step.candidate=target;
   const rank=s=>s?.entries.find(e=>e.id===target)?.ranks[s.activeColumn];
   const before=rank(prev.liveRanks),after=rank(f.liveRanks);
   const shift=before&&after?' · strategy rank #'+before+' → #'+after:'';
   step.card=['FEP predicts '+potency(f.forecasts[target])+' for '+name(target),p.visual,'$'+(f.queries-prev.queries)+' for '+f.targets.length+' new '+(f.targets.length===1?'prediction':'predictions')+shift+'. '+p.note];
  }else{
   const route=board.routes[id],cost=f.spent-prev.spent;
   const saved=opening.price(id)-cost,retained=route.filter(n=>prev.stock.includes(n)&&board.stages[n]).at(-1);
   const candidates=Object.keys(f.changes);
   const committed=(f.ranking?.shortlisted||[]).filter(n=>candidates.includes(n));
   // Prefer the next committed batch partner, otherwise the largest evidenced saving.
   const sorted=candidates.slice().sort((a,b)=>(f.changes[b][0]-f.changes[b][1])-(f.changes[a][0]-f.changes[a][1]));
   const watch=committed[0]||sorted[0];
   const stage=added.filter(n=>watch&&board.routes[watch].includes(n)).at(-1)||added.at(-1);
   const newly=neighbors.get(id).filter(n=>!f.made.includes(n)&&!neighbors.get(n).some(m=>prev.made.includes(m)));
   step.unlocked=newly;step.reused=retained;step.cost=cost;step.saved=saved;step.watch=watch;step.stage=stage;
   const prediction=f.decision?.estimate??prev.forecasts[id],model=f.decision?.model||(Number.isFinite(prediction)?'FEP':'');
   const stronger=board.products[id].p>board.products[best(prev.made)].p;
   const assay=name(id)+' measured '+activity(id)+(stronger?' (new best)':'')+(model?' · '+model+' predicted '+potency(prediction):'');
   const growth=newly.length?' · '+newly.length+' newly reachable by FEP':'';
   const delta=watch?f.changes[watch]:null;
   const expense=cost+' synthesis '+(cost===1?'step':'steps')+' from current stock';
   const short=n=>name(n).split(' · ')[0];
   if(stage){
    const scheme=prep(stage);
    step.card=['Prepare '+short(stage)+' on the route to '+name(id),scheme.visual+(watch?square(watch,delta):''),[assay,expense+growth,scheme.note].filter(Boolean).join(' · ')];
    step.view='retro';
   }else if(newly.includes(winner)){
    const p=pair(id,winner,'Measured · '+activity(id),'Newly reachable');
    step.card=[name(id)+' opens an FEP link to '+name(winner),p.visual,assay+' · '+expense+'. '+p.note];
   }else if(retained&&saved>0){
    const p=pair(retained,id,'Already in stock','Measured · '+activity(id));
    step.card=['Reuse '+short(retained)+' to make '+name(id),p.visual,assay+' · '+opening.price(id)+' steps from opening stock → '+cost+' now. '+p.note];step.view='retro';
   }else{
    step.card=['Make and assay '+name(id),gallery([mol(id,activity(id)+' measured')]),assay+' · '+expense+growth];
   }
   if(run.won&&i===frames.length-1){
    // Keep preparation visible if this winning synthesis also introduced a platform.
    if(!stage)step.card=['The assay confirms '+activity(id)+' for '+name(id),step.card[1],step.card[2]];
    step.view='brain';
   }
  }
  return step;
 });
 let comparisonNote='';
 if(run.won&&run.method!==moviePolicies[1][1]){
  const baseline=playStrategy(board,moviePolicies[1],cutoff,'ideal',false);
  if(baseline.won&&baseline.steps){
   const percent=Math.round(100*Math.abs(run.steps-baseline.steps)/baseline.steps);
   comparisonNote=run.steps===baseline.steps?'Same synthesis cost as SAR + cost':percent+'% '+(run.steps<baseline.steps?'fewer':'more')+' synthesis steps than SAR + cost';
   comparisonNote+=' ('+baseline.steps+' steps, $'+baseline.total+' total).';
  }
 }
 return {stories,winner,activity,name,mol,gallery,pair,comparisonNote};
}
function campaignSlides(board,run,narration,cutoff){
 const {stories,winner,activity,name,mol,gallery,pair,comparisonNote}=narration,final=run.frames.at(-1),start=run.frames[0],bestStart=start.made.reduce((a,b)=>board.products[a].p>board.products[b].p?a:b);
 const makes=stories.filter(s=>s.kind==='make'),queries=stories.filter(s=>s.kind==='query');
 const comparison=['Four strategies, one opening inventory','',''];
 const outcome=[run.won?'The campaign spends $'+run.total+' to confirm the hit':'The winner is unreachable at this cutoff',gallery([mol(run.won?winner:bestStart,run.won?activity(winner)+' measured':'Opening reference')]),run.steps+' synthesis steps · '+final.queries+' FEP queries · $'+run.total+' total. '+comparisonNote];
 const title=['Find the strongest '+board.key+' compound',gallery([mol(bestStart,'Best starting assay · '+activity(bestStart)),mol(winner,'Campaign target · '+activity(winner))]),'The target is supplied here for the retrospective comparison.'];
 if(!makes.length)return [title,stories[0].card,outcome,comparison];
 const oracle=hindsightReplay(board,cutoff);
 const oracleSlide=[oracle.won?'Hindsight reaches the winner in '+oracle.hops+' FEP '+(oracle.hops===1?'hop':'hops'):'The opening FEP network cannot reach the winner',oracle.won?gallery(oracle.path.map((n,i)=>mol(n,i?'':'Starting reference'))):gallery([mol(winner,'Known destination')]),'Known-winner direct synthesis costs $'+oracle.directCost+(oracle.won?' · shortest FEP path costs $'+oracle.total:' · no eligible path at LoMap '+cutoff.toFixed(2))];
 // In a longer trajectory, keep the milestones that explain how the winning experiment became possible.
 const discount=makes.find(s=>s.watch===winner||run.frames[stories.indexOf(s)].changes[winner]);
 const winningQuery=queries.find(s=>s.candidate===winner);
 if(winningQuery&&run.won){
  const platformMove=discount||makes.find(s=>s.stage)||makes.find(s=>s.reused);
  let platformSlide;
  if(platformMove){
   const f=run.frames[stories.indexOf(platformMove)],id=platformMove.stage||platformMove.reused;
   const beneficiary=f.changes[winner]?winner:platformMove.watch;
   const visual=[mol(platformMove.id,'Compound made · '+activity(platformMove.id))];
   if(id)visual.push(mol(id,platformMove.stage?'Prepared on this route':'Used from stock'));
   if(beneficiary)visual.push(mol(beneficiary,f.changes[beneficiary].join(' → ')+' remaining steps'));
   platformSlide=[beneficiary?name(platformMove.id)+' lowers the price of '+name(beneficiary):'The route to '+name(platformMove.id)+' uses a shared intermediate',gallery(visual),id?board.order.filter(n=>board.routes[n].includes(id)).length+' candidate routes include '+name(id)+'.':'Shared operations are retained in stock.'];
  }else{
   platformSlide=['Price the winning synthesis from current stock',gallery([mol(winner,activity(winner)+' measured')]),makes.at(-1).cost+' operations on the winning move.'];
  }
  const ref=winningQuery.reference,refMake=makes.find(s=>s.id===ref);
  const reference=pair(ref,winner,'Measured · '+activity(ref),'Eligible FEP neighbor');
  const refSlide=[name(ref)+(refMake?' becomes an assayed FEP reference':' is an opening reference'),reference.visual,'This measured reference supports the purchased prediction for '+name(winner)+'. '+reference.note];
  const winSlide=['The assay confirms '+activity(winner)+' for '+name(winner),gallery([mol(winner,activity(winner)+' measured')]),makes.at(-1).cost+' synthesis operations on this move.'];
  const firstQuery=run.frames[stories.indexOf(queries[0])];
  const firstScreen=['The first screen buys '+firstQuery.targets.length+' FEP predictions',queries[0].card[1],queries[0].card[2]];
  // The recap separates contributions that may coincide in the same experimental move.
  if(platformMove===makes[0]&&makes[1]?.reused&&makes[1]?.saved&&makes[1].view==='retro')platformSlide=makes[1].card;
  return [title,stories[0].card,firstScreen,makes[0].card,platformSlide,refSlide,winningQuery.card,winSlide,outcome,oracleSlide,comparison];
 }
 const milestones=new Set([stories[0],queries[0],makes[0],makes.find(s=>s.stage),makes.find(s=>s.saved>0&&s.reused),discount,makes.find(s=>s.unlocked.includes(winner)),queries.find(s=>s.candidate===winner),makes.at(-1)]);
 const slides=[title,...stories.filter(s=>milestones.has(s)).map(s=>s.card)];
 slides.push(outcome,oracleSlide,comparison);
 return slides;
}

function strategyComparison(B,draws,cut,error,metric,winnerName){
 const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const rows=moviePolicies.map((policy,i)=>{
  if(i>=2&&error!=='ideal')return draws[[i,cut,error]][metric];
  const r=playStrategy(B,policy,cut,error,false),v=metric==='stepInterval'?r.steps:r.total;return [v,v,v];
 });
 const colors=['#718197','#6844aa','#1749a6','#007c78'],max=Math.max(1,...rows.flat()),unit=metric==='stepInterval'?'Synthesis steps':'Dollars spent';
 const increment=Math.max(1,Math.ceil(max/5)),x=n=>365+650*n/(5*increment);
 const text=(a,b,s,size=18,color='#526782',weight=500,anchor='start')=>'<text x="'+a+'" y="'+b+'" fill="'+color+'" font-size="'+size+'" font-weight="'+weight+'" text-anchor="'+anchor+'">'+esc(s)+'</text>';
 let svg=text(14,36,'Strategy')+text(365,36,unit+' to reach '+winnerName);
 for(let i=0;i<=5;i++){const px=x(i*increment);svg+='<path d="M'+px+' 50v230" stroke="#e2e8ef"/>'+text(px,305,i*increment,16,undefined,500,'middle');}
 rows.forEach(([lo,mid,hi],i)=>{const y=85+i*55,c=colors[i];svg+=text(14,y+6,moviePolicies[i][1],21,'#18283b',650)+'<path d="M'+x(lo)+' '+(y-8)+'v16 M'+x(lo)+' '+y+'H'+x(hi)+' M'+x(hi)+' '+(y-8)+'v16" stroke="'+c+'" stroke-width="3"/><circle cx="'+x(mid)+'" cy="'+y+'" r="7" fill="'+c+'"/>'+text(x(hi)+15,y+6,mid,21,c,650);});
 return '<svg class="chart" role="img" aria-label="Four strategy medians and interquartile ranges" viewBox="0 0 1120 330">'+svg+'</svg>';
}
