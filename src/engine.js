function replayDefaults(target){
 return target==='RENIN'?{cut:'0.80',error:'hard'}:{cut:'0.60',error:'medium'};
}
const gameErrorScale={easy:.5,medium:1,hard:2};
const gameSigma=(score,difficulty)=>gameErrorScale[difficulty]*(.5+5*(1-score))/2.5;
// A prepared molecular node represents one distinct, paid reaction output.
function campaign(level, sigmaForScore = () => 0, {completeBatch=false}={}) {
  const {order,products,rx,routes,stages}=level;
  const index=new Map(order.map((id,i)=>[id,i]));
  const best=Math.max(...order.map(id=>products[id].p));
  const neighbors=Object.fromEntries(order.map(id=>[id,[]]));
  for(const [a,b,score,z=0] of level.edges){
    neighbors[a].push([b,score,z]);neighbors[b].push([a,score,-z]);
  }
  let stock=new Set(level.stock), forecasts=new Map(), history=[], lastSaving={};
  const made=()=>order.filter(id=>stock.has(id));
  const goal=()=>made().some(id=>products[id].p>=best-1e-8);
  const remaining=id=>routes[id].filter(n=>!stock.has(n));
  const price=id=>remaining(id).reduce((sum,n)=>sum+rx[n].cost,0);
  const spent=()=>Array.from(stock).reduce((sum,n)=>sum+(rx[n]?.cost||0),0);
  const sources=id=>neighbors[id].filter(([r])=>stock.has(r)).sort((a,b)=>b[1]-a[1]||index.get(a[0])-index.get(b[0]));
  function eligibleFep(){
    return order.filter(n=>!stock.has(n)&&!forecasts.has(n)&&sources(n).length);
  }
  function queryAll(){
    const targets=eligibleFep(),batch=history.length;
    if(goal())return [];
    for(const n of targets){
      if(!act('query',n,sources(n)[0][0]))throw Error('Ineligible FEP target');
      history.at(-1).batch=batch;
    }
    return targets;
  }
  function sar(id){
    const row=level.sim[index.get(id)], near=made().map(n=>[row[index.get(n)],n]).sort((a,b)=>b[0]-a[0]||index.get(a[1])-index.get(b[1])).slice(0,5);
    let w=0,s=0; for(const [t,n] of near){const weight=t**4+1e-8;s+=weight*products[n].p;w+=weight;}
    return {p:s/w,novelty:1-near[0][0]};
  }
  function rank(id,mode){
    const {p,novelty}=sar(id);
    return ((mode==='hybrid' && forecasts.has(id))?forecasts.get(id).p:p)+novelty-(mode==='sar'?0:.5*Math.log(Math.max(1,price(id))));
  }
  function act(type,id,parent){
    if((!completeBatch&&goal())||stock.has(id))return false;
    if(type==='query'){
      if(!products[id]||forecasts.has(id))return false;
      const link=sources(id).find(([n])=>n===parent);
      if(!link)return false;
      const [,score,z]=link, sigma=sigmaForScore(score);
      const p=products[id].p + z*sigma/(0.00198720425864*298.15*Math.LN10);
      forecasts.set(id,{p,parent,score,sigma});history.push({type,id,parent});return true;
    }
    if(type==='make'?!products[id]:type==='prepare'?!stages[id]:true)return false;
    const previous=Object.fromEntries(order.filter(n=>!stock.has(n)).map(n=>[n,price(n)]));
    const ops=remaining(id),cost=price(id),prior=new Set(made());
    for(const n of ops){if(rx[n].inputs.some(i=>rx[i]&&!stock.has(i)))throw Error('Unprepared input');stock.add(n);}
    lastSaving=Object.fromEntries(Object.keys(previous).filter(n=>!stock.has(n)&&previous[n]>price(n)).map(n=>[n,previous[n]-price(n)]));
    history.push({type,id,cost,assayed:made().filter(n=>!prior.has(n)),cheaper:Object.keys(lastSaving).length});return true;
  }
  return {eligibleFep,queryAll,made,goal,remaining,price,spent,sources,sar,rank,act,stock,forecasts,history,best,
          savings:()=>lastSaving,name:id=>(products[id]?.name||stages[id]||'Intermediate '+id.slice(2))};
}
function rival(level,mode){
  const sim=campaign(level);
  while(!sim.goal()){
    const pool=level.order.filter(id=>!sim.stock.has(id));
    if(mode==='hybrid')for(const id of pool){const link=sim.sources(id)[0];if(link&&!sim.forecasts.has(id))sim.act('query',id,link[0]);}
    const scores=pool.map(id=>[id,sim.rank(id,mode)]).sort((a,b)=>b[1]-a[1]);
    if(!sim.act('make',scores[0][0]))throw Error('Illegal computer move');
  }
  return {steps:sim.spent(),queries:sim.forecasts.size};
}
