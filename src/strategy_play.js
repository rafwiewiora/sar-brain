// Forward policies play only on observed assays and the predictions they purchased.
const moviePolicies=[
 ['hybrid','FEP + SAR + current price','Query reachable candidates. Rank by prediction, novelty and current synthesis price.'],
 ['aware','SAR + current price','Rank by measured-neighbor SAR, novelty and current synthesis price.'],
 ['sar','SAR only','Rank by measured-neighbor SAR and novelty. Pay actual synthesis costs.'],
 ['fixed','SAR + fixed price','Rank using the standalone synthesis price. Pay the actual inventory-adjusted price.'],
 ['local','FEP neighbors only + current price','Buy reachable predictions and choose only among those candidates.']
];
function playStrategy(level,policy,cutoff,difficulty,record=true){
 const [mode,method,rule]=policy, g=campaign({...level,edges:level.edges.filter(e=>e[2]>=cutoff-1e-12)},s=>difficulty==='ideal'?0:gameSigma(s,difficulty));
 const batchSize=level.key==='RENIN'?2:4,frames=[];
 const pool=()=>level.order.filter(n=>!g.stock.has(n)),quotes=()=>Object.fromEntries(pool().map(n=>[n,g.price(n)]));
 const steps=()=>g.spent()-level.start;
 const stand=Object.fromEntries(level.order.map(n=>[n,level.routes[n].reduce((s,r)=>s+level.rx[r].cost,0)]));
 function capture(batch,action,targets,extra={}){
   if(!record)return;
   frames.push({batch,action,targets,spent:steps(),queries:g.forecasts.size,
     made:g.made(),pred:Array.from(g.forecasts.keys()),forecasts:Object.fromEntries(Array.from(g.forecasts,([n,v])=>[n,v.p])),
     parents:Object.fromEntries(Array.from(g.forecasts,([n,v])=>[n,v.parent])),stock:Object.keys(level.stages).filter(n=>g.stock.has(n)),amounts:{},changes:{},...extra});
 }
 capture(0,'open',g.made());
 const wantsFep=mode==='hybrid'||mode==='local';
 for(let batch=1;!g.goal();batch++){
   const queried=[];
   if(wantsFep){
     for(const n of pool()){
       const link=g.sources(n)[0];
       if(link&&!g.forecasts.has(n)&&g.act('query',n,link[0]))queried.push(n);
     }
     if(queried.length)capture(batch,'query',queried);
   }
   const candidates=pool().filter(n=>mode!=='local'||g.forecasts.has(n));
   if(!candidates.length)break;
   const base=Object.fromEntries(candidates.map(n=>{
     const sar=g.sar(n),estimate=wantsFep?(g.forecasts.get(n)?.p??sar.p):sar.p;
     return [n,{estimate,utility:estimate+sar.novelty,model:wantsFep&&g.forecasts.has(n)?'FEP':'SAR'}];
   }));
   function score(n){const cost=mode==='sar'?1:mode==='fixed'?stand[n]:g.price(n);return base[n].utility-.5*Math.log(Math.max(1,cost));}
   const batchPicks=candidates.sort((a,b)=>score(b)-score(a)).slice(0,batchSize);
   while(batchPicks.length&&!g.goal()){
     batchPicks.sort((a,b)=>score(b)-score(a));
     const n=batchPicks.shift();if(g.stock.has(n))continue;
     const before=record?quotes():{},price=g.price(n);
     if(!g.act('make',n))throw Error('Invalid policy move');
     const changes={};if(record)for(const [id,v] of Object.entries(quotes()))if(v<before[id])changes[id]=[before[id],v];
     capture(batch,'make',[n],{amounts:{[n]:price},changes,decision:base[n]});
   }
 }
 const end=g.goal()?'Winner assayed.':'No eligible FEP candidate remains.';
 return {method,rule,end,frames,won:g.goal(),total:steps()+g.forecasts.size,setting:'LoMap ≥ '+cutoff.toFixed(2)+'   /   '+difficulty[0].toUpperCase()+difficulty.slice(1)+(difficulty==='ideal'?' FEP':' error (σ at 0.60 = '+gameErrorScale[difficulty]+' kcal/mol)')};
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
  results.push({seed,won:run.won,total:run.total});
 }
 // A trajectory that exhausts its frontier has no finite spend-to-hit.
 // Sort those last, then by actual expenditure and seed for reproducibility.
 results.sort((a,b)=>Number(b.won)-Number(a.won)||a.total-b.total||a.seed-b.seed);
 const at=q=>results[Math.round((count-1)*q)];
 const cost=q=>at(q).won?at(q).total:null;
 const middle=at(.5);
 return {count,wins:results.filter(r=>r.won).length,seed:middle.seed,
         median:cost(.5),low:cost(.1),high:cost(.9)};
}
