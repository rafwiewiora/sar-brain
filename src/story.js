const {board:B,draws}=JSON.parse(document.getElementById('data').textContent);
const $=id=>document.getElementById(id), esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const name=id=>B.products[id]?.name||B.stages[id], p=id=>B.products[id].p;
const nm=value=>Number((10**(9-value)).toPrecision(3)).toLocaleString('en-US',{maximumFractionDigits:3})+' nM';
const value=id=>nm(p(id));
const run=playStrategy(sampledLevel(B,draws['3,0.6,medium'].seed),moviePolicies[3],.6,'medium');
const frames=run.frames,initial=frames[0],final=frames.at(-1),makes=frames.filter(f=>f.action==='make');
const winner=final.made.reduce((a,b)=>p(a)>p(b)?a:b),first=makes[0],firstId=first.targets[0];
const firstQuery=frames.find(f=>f.action==='query'),ref=final.parents[winner],discount=makes.find(f=>f.changes[winner]);
const oracle=hindsightReplay(B,.6);
const winRoute=B.routes[winner],discountIndex=frames.indexOf(discount);
const stage=(discount?winRoute.filter(n=>B.stages[n]&&discount.stock.includes(n)&&!frames[discountIndex-1].stock.includes(n)):winRoute.filter(n=>B.stages[n])).at(-1);
const mol=(id,note='')=>'<div class="mol">'+B.drawings[id]+'<b>'+esc(name(id))+'</b><small>'+esc(note)+'</small></div>';
const gallery=(items,arrows=false)=>'<div class="gallery">'+items.join(arrows?'<span class="arrow">→</span>':'')+'</div>';
const ledger=items=>'<div class="ledger">'+items.map(([n,label])=>'<div><b>'+esc(n)+'</b>'+esc(label)+'</div>').join('')+'</div>';
const bestStart=initial.made.slice().sort((a,b)=>p(b)-p(a));
const refMake=makes.find(f=>f.targets.includes(ref));
const predictionFrame=frames.find(f=>f.action==='query'&&f.targets.includes(winner));
const wMake=makes.find(f=>f.made.includes(winner)), winPrice=wMake?.amounts[winner];
const startPrice=campaign(B).price(winner);
const familySize=stage?B.order.filter(n=>B.routes[n].includes(stage)).length:0;
const slides=[
 ['Find the strongest '+B.key+' compound',gallery([mol(bestStart[0],value(bestStart[0])+' · best starting assay'),mol(winner,value(winner)+' · campaign target')]),'The replay sees an unmade compound’s assay only after it is made.'],
 [initial.made.length+' measured compounds supply the opening references',gallery(bestStart.slice(0,3).map(n=>mol(n,value(n)))),initial.made.length>3?'The three strongest opening assays are shown.':'The same opening inventory is supplied to all four strategies.'],
 ['The first screen buys '+firstQuery.targets.length+' local FEP predictions',ledger([[B.order.length-initial.made.length,'unmade candidates'],[firstQuery.targets.length,'reachable from stock'],['$'+firstQuery.queries,'spent on predictions']]),'One query costs $1. The strategy uses SAR for candidates outside the FEP neighborhood.'],
 ['The first synthesis is '+name(firstId),gallery([mol(firstId,'Assay '+value(firstId))]),'Chosen using '+first.decision.model+' · '+first.amounts[firstId]+' synthesis steps from starting stock.'],
 discount?[name(discount.targets[0])+' makes the winner cheaper to synthesize',gallery([mol(discount.targets[0],'Product made · '+value(discount.targets[0])),...(stage?[mol(stage,'Retained while making '+name(discount.targets[0]))]:[]),mol(winner,discount.changes[winner].join(' → ')+' remaining steps')]),'A shared preparation is now in inventory.']:
 ['The winner’s route passes through a reusable intermediate',gallery([mol(stage,familySize+' candidate routes use it'),mol(winner,startPrice+' steps from the opening inventory')],true),'This replay reaches the winner on its first synthesis.'],
 [refMake?name(ref)+' becomes the reference after a '+refMake.decision.model+' selection':name(ref)+' is already available as a reference',gallery([mol(ref,'Measured '+value(ref)),mol(winner,'FEP neighbor')],true),refMake?'The assay opens a new set of one-hop predictions.':'The starting reference can support this comparison before any new synthesis.'],
 ['FEP predicts '+nm(final.forecasts[winner])+' for '+name(winner),gallery([mol(ref,'Reference · '+value(ref)),mol(winner,'Predicted · '+nm(final.forecasts[winner]))],true),'Prediction purchased in round '+predictionFrame.batch+' · one fixed error draw per transformation.'],
 ['The assay confirms '+value(winner)+' for '+name(winner),gallery([mol(winner,'Measured '+value(winner))]),'Synthesis '+(makes.indexOf(wMake)+1)+' of '+makes.length+' · '+winPrice+' additional steps on this move.'],
 ['The campaign spends $'+run.total+' to confirm the hit',ledger([['$'+run.steps,'synthesis'],['$'+final.queries,'FEP queries'],['$'+run.total,'total spent']]),makes.length+' new synthesis decisions · median-spend trajectory among 101 paired error draws.'],
 [oracle.won?'Hindsight reaches the winner in '+oracle.hops+' FEP '+(oracle.hops===1?'hop':'hops'):'The opening FEP network cannot reach the winner',oracle.won?gallery(oracle.path.map((n,i)=>mol(n,i?'Known destination':'Opening reference')),true):gallery([mol(ref,'Reached in the forward run via SAR'),mol(winner,'Known destination')],true),oracle.won?'Oracle path costs $'+oracle.total+' including queries. Direct synthesis with the winner supplied costs $'+oracle.directCost+'.':'At LoMap 0.60 the winner is in another component. Knowing its identity would allow direct synthesis for $'+oracle.directCost+'.'],
 ['Four strategies, one opening inventory','','']
];
function summary(){
 const cut=+$('cut').value,error=$('error').value,metric=$('metric').value;
 const rows=moviePolicies.map((policy,i)=>{
  if(i>=2&&error!=='ideal')return draws[[i,cut,error]][metric];
  const r=playStrategy(B,policy,cut,error,false),v=metric==='stepInterval'?r.steps:r.total;return [v,v,v];
 });
 const colors=['#718197','#6844aa','#1749a6','#007c78'],max=Math.max(1,...rows.flat()),unit=metric==='stepInterval'?'Synthesis steps':'Dollars spent';
 const increment=Math.max(1,Math.ceil(max/5)),x=n=>365+650*n/(5*increment);
 const text=(a,b,s,size=18,color='#526782',weight=500,anchor='start')=>'<text x="'+a+'" y="'+b+'" fill="'+color+'" font-size="'+size+'" font-weight="'+weight+'" text-anchor="'+anchor+'">'+esc(s)+'</text>';
 let svg=text(14,36,'Strategy')+text(365,36,unit+' to reach '+name(winner));
 for(let i=0;i<=5;i++){const px=x(i*increment);svg+='<path d="M'+px+' 50v230" stroke="#e2e8ef"/>'+text(px,305,i*increment,16,undefined,500,'middle');}
 rows.forEach(([lo,mid,hi],i)=>{const y=85+i*55,c=colors[i];svg+=text(14,y+6,moviePolicies[i][1],21,'#18283b',650)+'<path d="M'+x(lo)+' '+(y-8)+'v16 M'+x(lo)+' '+y+'H'+x(hi)+' M'+x(hi)+' '+(y-8)+'v16" stroke="'+c+'" stroke-width="3"/><circle cx="'+x(mid)+'" cy="'+y+'" r="7" fill="'+c+'"/>'+text(x(hi)+15,y+6,mid,21,c,650);});
 return '<svg class="chart" role="img" aria-label="Four strategy medians and interquartile ranges" viewBox="0 0 1120 330">'+svg+'</svg>';
}
let index=0;
function show(i){
 index=Math.min(10,Math.max(0,i));const [title,body,foot]=slides[index],compare=index===10;
 $('title').textContent=title;$('visual').innerHTML=compare?summary():body;
 $('context').textContent=B.key+(compare?' · Strategy comparison · LoMap ≥ '+$('cut').value+' · '+$('error').selectedOptions[0].text:' · FEP with SAR fallback + cost · LoMap ≥ 0.60 · Medium');
 $('foot').textContent=compare?($('error').value==='ideal'?'Ideal predictions · deterministic strategies · same starting compounds.':'Dot = median · whiskers = middle 50% across 101 FEP error draws · same starting compounds.'):foot;
 $('controls').hidden=!compare;$('prev').disabled=index===0;$('next').textContent=compare?'Play →':'→';$('counter').textContent=(index+1)+' / 11';
 $('movie').href='strategy_movie.html#'+B.key+'/'+(compare?$('error').value:'medium')+'/3/'+(compare?$('cut').value:'0.60');
 history.replaceState(null,'','#slide-'+(index+1));
}
function next(){if(index===10)location.href=$('movie').href;else show(index+1);}
$('next').onclick=next;$('prev').onclick=()=>show(index-1);
for(const id of ['metric','cut','error'])$(id).onchange=()=>show(10);
document.addEventListener('keydown',e=>{if(e.target.matches('select,input')||e.repeat)return;if(e.key==='ArrowRight'){e.preventDefault();next();}if(e.key==='ArrowLeft'){e.preventDefault();show(index-1);}});
show((Number(location.hash.match(/slide-(\d+)/)?.[1])||1)-1);
