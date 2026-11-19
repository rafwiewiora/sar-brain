// Forward policies play only on observed assays and the predictions they purchased.
const moviePolicies=[
 ['sar','SAR only','Rank by measured-neighbor SAR and novelty.'],
 ['aware','SAR + synthesis cost','Rank by SAR and novelty, with a penalty for remaining synthesis steps.'],
 ['hybridFree','FEP with SAR fallback','Rank by FEP when reachable and SAR elsewhere, plus novelty.'],
 ['hybrid','FEP with SAR fallback + cost','Use FEP when reachable and SAR elsewhere. Include novelty and remaining synthesis steps.']
];
// Re-evaluate the display after each observation. Batch commitments are stored separately.
function reninLiveRanks(g,ids,mode){
 const activeColumn=mode==='sar'?0:mode==='aware'?1:2;
 const entries=ids.map(id=>{
  const sar=g.sar(id),price=g.price(id),penalty=.5*Math.log(Math.max(1,price));
  const first=sar.p+sar.novelty,hybrid=(g.forecasts.get(id)?.p??sar.p)+sar.novelty;
  return {id,price,sar:sar.p,scores:[first,first-penalty,hybrid-(mode==='hybridFree'?0:penalty)],ranks:[]};
 });
 for(let col=0;col<3;col++)entries.slice().sort((a,b)=>b.scores[col]-a.scores[col]).forEach((e,i)=>{e.ranks[col]=i+1;});
 return {entries,activeColumn,fepCost:mode!=='hybridFree'};
}
function playStrategy(level,policy,cutoff,difficulty,record=true){
 const [mode,method,rule]=policy, g=campaign({...level,edges:level.edges.filter(e=>e[2]>=cutoff-1e-12)},s=>difficulty==='ideal'?0:gameSigma(s,difficulty));
 const batchSize=level.key==='RENIN'?2:4,frames=[];
 const pool=()=>level.order.filter(n=>!g.stock.has(n)),quotes=()=>Object.fromEntries(pool().map(n=>[n,g.price(n)]));
 const steps=()=>g.spent()-level.start;
 function capture(batch,action,targets,extra={}){
   if(!record)return;
   const liveRanks=level.key==='RENIN'?reninLiveRanks(g,pool(),mode):null;
   frames.push({liveRanks,batch,action,targets,spent:steps(),queries:g.forecasts.size,
     made:g.made(),pred:Array.from(g.forecasts.keys()),forecasts:Object.fromEntries(Array.from(g.forecasts,([n,v])=>[n,v.p])),
     parents:Object.fromEntries(Array.from(g.forecasts,([n,v])=>[n,v.parent])),stock:Object.keys(level.stages).filter(n=>g.stock.has(n)),amounts:{},changes:{},...extra});
 }
 capture(0,'open',g.made());
 const wantsFep=mode==='hybrid'||mode==='hybridFree';
 for(let batch=1;!g.goal();batch++){
   if(wantsFep){
     const queried=g.queryAll();
     if(queried.length)capture(batch,'query',queried);
   }
   const candidates=pool();
   if(!candidates.length)break;
   const base=Object.fromEntries(candidates.map(n=>{
     const sar=g.sar(n),estimate=wantsFep?(g.forecasts.get(n)?.p??sar.p):sar.p;
     return [n,{sar:sar.p,novelty:sar.novelty,estimate,utility:estimate+sar.novelty,model:wantsFep&&g.forecasts.has(n)?'FEP':'SAR'}];
   }));
   function score(n){const cost=mode==='aware'||mode==='hybrid'?g.price(n):1;return base[n].utility-.5*Math.log(Math.max(1,cost));}
   const batchPicks=candidates.sort((a,b)=>score(b)-score(a)).slice(0,batchSize);
   const live=record?frames.at(-1).liveRanks:null;
   const ranking=live?{...live,batch,shortlisted:batchPicks.slice()}:null;
   while(batchPicks.length&&!g.goal()){
     batchPicks.sort((a,b)=>score(b)-score(a));
     const n=batchPicks.shift();if(g.stock.has(n))continue;
     const before=record?quotes():{},price=g.price(n);
     if(!g.act('make',n))throw Error('Invalid policy move');
     const changes={};if(record)for(const [id,v] of Object.entries(quotes()))if(v<before[id])changes[id]=[before[id],v];
     capture(batch,'make',[n],{amounts:{[n]:price},changes,decision:base[n],ranking});
   }
 }
 const end=g.goal()?'Winner assayed.':'No eligible FEP candidate remains.';
 return {method,rule,end,frames,won:g.goal(),steps:steps(),total:steps()+g.forecasts.size,setting:'LoMap ≥ '+cutoff.toFixed(2)+'   /   '+difficulty[0].toUpperCase()+difficulty.slice(1)+(difficulty==='ideal'?' FEP':' error (σ at 0.60 = '+gameErrorScale[difficulty]+' kcal/mol)')};
}

// One standard-normal draw per undirected edge, before cutoff filtering.
// The fixed edge order pairs each draw across strategies and error settings.
function sampledLevel(level,seed){
 let state=seed;
 const uniform=()=>{
  state=(state+0x6d2b79f5)>>>0;
  let t=Math.imul(state^(state>>>15),1|state);
  t^=t+Math.imul(t^(t>>>7),61|t);
  return ((t^(t>>>14))>>>0)/4294967296;
 };
 const edges=level.edges.map(([a,b,score])=>{
  const z=Math.sqrt(-2*Math.log(1-uniform()))*Math.cos(2*Math.PI*uniform());
  return [a,b,score,z];
 });
 return {...level,edges};
}

function summarizeDraws(level,policy,cutoff,difficulty,count){
 const results=[];
 for(let seed=1;seed<=count;seed++){
  const run=playStrategy(sampledLevel(level,seed),policy,cutoff,difficulty,false);
  results.push({seed,won:run.won,total:run.total,steps:run.steps});
 }
 // A trajectory that exhausts its frontier has no finite spend-to-hit.
 // Sort those last, then by actual expenditure and seed for reproducibility.
 results.sort((a,b)=>Number(b.won)-Number(a.won)||a.total-b.total||a.seed-b.seed);
 const at=q=>results[Math.round((count-1)*q)];
 const cost=q=>at(q).won?at(q).total:null;
 const middle=at(.5);
 const stepCosts=results.map(r=>r.won?r.steps:Infinity).sort((a,b)=>a-b);
 return {count,wins:results.filter(r=>r.won).length,seed:middle.seed,
         median:cost(.5),low:cost(.1),high:cost(.9),
         moneyInterval:[cost(.25),cost(.5),cost(.75)],
         stepInterval:[.25,.5,.75].map(q=>{const v=stepCosts[Math.round((count-1)*q)];return Number.isFinite(v)?v:null;})};
}

// Compare the unrestricted direct make with the FEP-constrained shortest path.
// The latter minimizes graph hops first, then counts shared operations once.
function hindsightReplay(level,cutoff,direct=false){
 const board={...level,edges:level.edges.filter(e=>e[2]>=cutoff-1e-12)};
 const g=campaign(board),roots=g.made(),winners=level.order.filter(n=>level.products[n].p>=g.best-1e-8);
 const adjacency=new Map(level.order.map(n=>[n,[]]));
 for(const [a,b] of board.edges){adjacency.get(a).push(b);adjacency.get(b).push(a);}
 const dist=new Map(roots.map(n=>[n,0])),previous=new Map(),queue=roots.slice();
 for(let i=0;i<queue.length;i++){
  const a=queue[i],depth=dist.get(a)+1;
  for(const b of adjacency.get(a)){
   if(!dist.has(b)){dist.set(b,depth);queue.push(b);previous.set(b,[]);}
   if(dist.get(b)===depth)previous.get(b).push(a);
  }
 }
 const directWinner=winners.reduce((a,b)=>g.price(b)<g.price(a)?b:a);
 const directCost=g.price(directWinner);
 const hops=Math.min(...winners.map(n=>dist.get(n)??Infinity));
 let bestPath=null,minCost=Infinity,paths=0;
 function visit(n,suffix){
  const path=[n,...suffix];
  if(dist.get(n)>0){for(const a of previous.get(n))visit(a,path);return;}
  ++paths;
  const operations=new Set(path.slice(1).flatMap(id=>g.remaining(id)));
  const cost=[...operations].reduce((s,id)=>s+board.rx[id].cost,0);
  if(cost<minCost){minCost=cost;bestPath=path;}
 }
 if(Number.isFinite(hops))for(const n of winners)if(dist.get(n)===hops)visit(n,[]);
 const frames=[];
 function capture(action,targets,amounts={}){
  frames.push({batch:frames.length,action,targets,amounts,changes:{},spent:g.spent()-board.start,queries:g.forecasts.size,
   made:g.made(),pred:[...g.forecasts.keys()],forecasts:Object.fromEntries([...g.forecasts].map(([n,f])=>[n,f.p])),
   parents:Object.fromEntries([...g.forecasts].map(([n,f])=>[n,f.parent])),stock:Object.keys(board.stages).filter(n=>g.stock.has(n))});
 }
 capture('open',roots);
 const toMake=direct?[directWinner]:bestPath?.slice(1)||[];
 for(const [i,n] of toMake.entries()){
  if(g.goal())break;
  if(!direct){if(!g.act('query',n,bestPath[i]))throw Error('Infeasible oracle edge');capture('query',[n]);}
  const price=g.price(n);
  if(!g.act('make',n))throw Error('Infeasible oracle synthesis');
  capture('make',[n],{[n]:price});
 }
 const rule=direct?'Winner supplied. Make it immediately from starting inventory.':
  bestPath?'Winner supplied. Fewest FEP hops, then least synthesis among tied paths.':
  'No FEP path from the starting references at this cutoff. Choose Direct synthesis to play the known winner.';
 const steps=g.spent()-board.start;
 return {method:direct?'Direct synthesis oracle':'Shortest FEP hindsight path',rule,frames,steps,total:steps+g.forecasts.size,
  won:g.goal(),end:g.goal()?'Winner assayed.':'Winner unreachable on this FEP graph.',hops,paths,directCost,
  path:bestPath,setting:'Hindsight · ideal FEP · LoMap ≥ '+cutoff.toFixed(2)};
}
