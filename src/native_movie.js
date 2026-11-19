// Translate one saved sequence of decisions into the board and the SAR Brain.
function project(key,level,run,base,ideal,narration){
 const D={...base,paths:{},reactions:{...base.reactions},panels:[...base.panels]};
 const byNode=Object.fromEntries(Object.values(D.compounds).map(c=>[c.node,c.id]));
 const cid=n=>byNode[n]||n, node=n=>D.compounds[n]?.node||n;
 const opening=run.frames[0].made.map(node);
 const stock=new Set([...level.stock,...opening]);
 const group=new Map(D.groups.flatMap(g=>g.nodes.map(n=>[n,g.id])));
 const nearby=new Map();
 function upstream(n){
  if(!nearby.has(n))nearby.set(n,[...new Set((level.rx[n]?.inputs||[]).flatMap(p=>group.has(p)?[group.get(p)]:upstream(p)))]);
  return nearby.get(n);
 }
 const molecules=D.molecules,paidRoutes={},history=[],states=[];
 for(const [n,r] of Object.entries(level.rx))D.reactions[n]={...r,outputs:[n]};
 const uncovered=level.order.filter(n=>!D.panels.some(p=>p.ids.includes(cid(n))));
 if(uncovered.length)D.panels.push({id:'other',goal:'other',title:'Other routes',ids:uncovered.map(cid)});
 if(!D.panels.some(p=>p.id===D.platform))D.platform=D.panels[0].id;
 const initialNetwork=(base.openingInventory||[]);
 const bestPotency=Math.max(...level.order.map(id=>level.products[id].p));
 let previousMade=new Set(opening);
 for(const [i,raw] of run.frames.entries()){
  const made=raw.made.map(node),pred=raw.pred.map(node),targets=raw.targets.map(node);
  const parents=Object.fromEntries(Object.entries(raw.parents).map(([n,v])=>[node(n),node(v)]));
  const estimates=Object.fromEntries(raw.pred.map(n=>[node(n),raw.forecasts?.[n]??level.products[node(n)].p]));
  const prior=run.frames[Math.max(0,i-1)];
  const historyBatch=history.length;
  if(i&&raw.action==='query')for(const n of targets)history.push({type:'query',id:n,parent:parents[n],batch:historyBatch});
  if(i&&raw.action==='make'){
   for(const n of targets){
    const route=(level.routes[n]||[]).filter(r=>!stock.has(r));
    paidRoutes[cid(n)]=route;
    for(const r of route)stock.add(r);
    history.push({type:'make',id:n,cost:raw.amounts[n]??raw.spent-prior.spent});
   }
  }
  made.forEach(n=>stock.add(n));
  const inv=[...new Set([...stock,...initialNetwork])];
  const routes={},quotes={};
  for(const n of level.order){const rs=(level.routes[n]||[]).filter(r=>!stock.has(r));routes[cid(n)]=rs;quotes[cid(n)]=rs.reduce((s,r)=>s+level.rx[r].cost,0);}
  const links=[],platformLinks=[];
  for(const n of made.filter(n=>!i||!previousMade.has(n))){
   for(const g of upstream(n))links.push([g,cid(n)]);
   for(const stage of level.routes[n]||[])if(group.has(stage))for(const a of upstream(stage))if(a!==group.get(stage))platformLinks.push([a,group.get(stage)]);
  }
  const madeIds=made.map(cid), picked=targets.map(cid);
  const caption=raw.action==='open'?('Start with '+made.length+' measured compounds.'):raw.action==='query'?('Predict '+targets.length+' '+(targets.length===1?'candidate':'candidates')+' with FEP.'):('Make '+targets.map(n=>level.products[n].name).join(' + ')+' · +'+(raw.spent-prior.spent)+' synthesis steps');
  const winningIds=raw.made.filter(id=>level.products[id].p>=bestPotency-1e-8).map(cid);
  const frame={winningIds,routes,quotes,paidRoutes:{...paidRoutes},inventory:inv,links,platformLinks,paid:[],
   spent:raw.spent,queries:raw.queries,known:[...new Set([...madeIds,...pred.map(cid)])],made:madeIds,targets:picked,
   forecasts:Object.fromEntries(Object.entries(estimates).map(([n,v])=>[cid(n),v])),edges:Object.entries(parents).map(([n,p])=>[cid(p),cid(n)]),caption};
  states.push({inventory:[...new Set([...inv,...made])],spent:raw.spent,queries:raw.queries,forecasts:estimates,parents,history:[...history],quotes:Object.fromEntries(Object.entries(frame.quotes).map(([id,v])=>[node(id),v]))});
  (D.paths.movie??=[]).push(frame);previousMade=new Set(made);
 }
 if(narration){
  const {stories,winner,name,activity}=narration;
  for(const [i,s] of stories.entries()){
   const beat=D.paths.movie[i],f=run.frames[i];
   if(s.kind==='make'&&s.unlocked.includes(winner)){
    Object.assign(beat,{beat:'unlock',reference:cid(s.id),candidate:cid(winner),caption:name(s.id)+' opens an FEP link to '+name(winner)+'.'});
   }else if(s.kind==='query'){
    Object.assign(beat,{beat:'prediction',reference:cid(s.reference),candidate:cid(s.candidate),caption:s.card[0]+'.'});
   }else if(s.kind==='make'&&f.parents[s.id]){
    Object.assign(beat,{beat:'assay',reference:cid(f.parents[s.id]),candidate:cid(s.id),caption:name(s.id)+' measures '+activity(s.id)+'.'});
   }
  }
 }
 D.startingReferences=opening.map(cid);
 D.movie={archived:false,target:key,endpoint:level.endpoint,ideal,policy:run.method,
  title:key==='RENIN'?'RENIN · Routes to the 1 nM compound':key+' · Routes to the best measured compound',
  subtitle:key==='RENIN'?'15 starting assays · 16 March 2006':level.patent+' · '+level.order.length+' compounds',
  assumptions:[run.rule,run.setting||'Archived ideal predictions.'].join(' ')};
 delete D.openingInventory;
 return {D,states,cid,node};
}
