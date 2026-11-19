function campaignDeck(B,run){
const esc=x=>String(x).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const name=id=>B.products[id]?.name||B.stages[id], p=id=>B.products[id].p;
const nm=value=>Number((10**(9-value)).toPrecision(3)).toLocaleString('en-US',{maximumFractionDigits:3})+' nM';
const value=id=>nm(p(id));
const preset=replayDefaults(B.key);

const frames=run.frames,initial=frames[0],final=frames.at(-1),makes=frames.filter(f=>f.action==='make');
const winner=final.made.reduce((a,b)=>p(a)>p(b)?a:b),first=makes[0],firstId=first.targets[0];
const firstQuery=frames.find(f=>f.action==='query'),ref=final.parents[winner],discount=makes.find(f=>f.changes[winner]);
const oracle=hindsightReplay(B,+preset.cut);
const winRoute=B.routes[winner],discountIndex=frames.indexOf(discount);
const stage=(discount?winRoute.filter(n=>B.stages[n]&&discount.stock.includes(n)&&!frames[discountIndex-1].stock.includes(n)):winRoute.filter(n=>B.stages[n])).at(-1);
const mol=(id,note='',drawing=B.drawings[id])=>'<div class="mol">'+drawing+'<b>'+esc(name(id))+'</b><small>'+esc(note)+'</small></div>';
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
 [oracle.won?'Hindsight reaches the winner in '+oracle.hops+' FEP '+(oracle.hops===1?'hop':'hops'):'The opening FEP network cannot reach the winner',oracle.won?gallery(oracle.path.map((n,i)=>mol(n,i?'Known destination':'Opening reference')),true):gallery([mol(ref,'Reached in the forward run via SAR'),mol(winner,'Known destination')],true),oracle.won?'Oracle path costs $'+oracle.total+' including queries. Direct synthesis with the winner supplied costs $'+oracle.directCost+'.':'At LoMap '+preset.cut+' the winner is in another component. Knowing its identity would allow direct synthesis for $'+oracle.directCost+'.'],
 ['Four strategies, one opening inventory','','']
];

 if(B.key==='RENIN' && stage && B.platformReaction){
  const next=makes[1].targets[0],change=discount.changes[next];
  const square='<div class="priceUpdate"><span>'+name(next)+'</span><div class="priceSquare"><b class="oldPrice">'+change[0]+'</b><b class="newPrice">'+change[1]+'</b></div><span>steps from stock</span></div>';
  slides[3]=['Prepare I5 on the route to '+name(firstId),'<div class="prepScheme">'+B.platformReaction+'</div>'+square,
   'Green follows Boc-piperazine into I5. Purple marks the new amide bond. <a href="https://patents.google.com/patent/US8580813B2/en#:~:text=Step5%3A%204-(2-Chloro" target="_blank" rel="noopener">Patent · Example 1, step 5 ↗</a>'];
  slides[4]=['Reuse I5 to make '+name(next)+' in two steps',gallery([mol(stage,'Peach · chloride and Boc removed',B.reuseDrawings[0]),mol(next,'Green · 2-methylbenzyl added. Purple · new C–C bond.',B.reuseDrawings[1])],true),
   name(firstId)+' measured '+value(firstId)+' against a '+nm(first.decision.estimate)+' prediction. Its route still saved seven synthesis steps on '+name(next)+'.'];
  if(name(ref)==='CPD 239'&&name(winner)==='CPD 270'){
   const [left,right]=B.fepPairDrawings;
   const pair=gallery([mol(ref,'Reference · '+value(ref)+' · Cl in peach',left),mol(winner,'Predicted · '+nm(final.forecasts[winner])+' · Me and F in green',right)],true);
   slides[5][1]=gallery([mol(ref,'Measured reference · '+value(ref),left),mol(winner,'New FEP neighbor',right)],true);
   slides[6][1]=pair;
  }
 }
 // Several events can coincide in one move. Show the most specific matching slide.
 const slideForFrame=new Map([[initial,1],[firstQuery,2],[first,3],[discount,4],[refMake,5],[predictionFrame,6],[wMake,7]]);
 return {slideForFrame,slides,winner,name,mol,gallery,ledger,run,preset,value};
}
