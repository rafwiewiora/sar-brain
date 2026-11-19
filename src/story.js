const {board:B,draws}=JSON.parse(document.getElementById('data').textContent);
const $=id=>document.getElementById(id);
const preset=replayDefaults(B.key),params=new URLSearchParams(location.search);
const policy=['0','1','2','3','oracle'].includes(params.get('policy'))?params.get('policy'):'3';
const oracle=policy==='oracle',direct=oracle&&params.get('route')==='direct';
const cut=['0.60','0.70','0.80','0.90'].includes(params.get('cut'))?params.get('cut'):preset.cut;
const error=oracle?'ideal':['ideal','easy','medium','hard'].includes(params.get('error'))?params.get('error'):preset.error;
$('cut').value=cut;$('error').value=error;
const summary=+policy>=2&&error!=='ideal'?draws[[+policy,+cut,error]]:null;
const level=summary?sampledLevel(B,summary.seed):B;
const run=oracle?hindsightReplay(level,+cut,direct):playStrategy(level,moviePolicies[+policy],+cut,error);
const narration=campaignNarration(B,run,+cut,+policy>=2||(oracle&&!direct));
const {winner}=narration,slides=campaignSlides(B,run,narration,+cut);
const strategyName=oracle?(direct?'Hindsight · direct synthesis':'Hindsight · shortest FEP path'):moviePolicies[+policy][1];
const mode=oracle?(direct?'':' · LoMap ≥ '+cut):+policy>=2?' · LoMap ≥ '+cut+' · '+$('error').selectedOptions[0].text:'';
let index=0;
function show(i){
 index=Math.min(slides.length-1,Math.max(0,i));const [title,body,foot]=slides[index],compare=index===slides.length-1;
 $('title').textContent=title;$('visual').innerHTML=compare?strategyComparison(B,draws,+$('cut').value,$('error').value,$('metric').value,B.products[winner].name):body;
 $('context').textContent=B.key+' · '+(compare?'Strategy comparison · LoMap ≥ '+$('cut').value+' · '+$('error').selectedOptions[0].text:strategyName+mode);
 $('foot').innerHTML=compare?($('error').value==='ideal'?'Ideal predictions · deterministic strategies · same starting compounds.':'Dot = median · whiskers = middle 50% across 101 FEP error draws · same starting compounds.'):foot;
 $('controls').hidden=!compare;$('prev').disabled=index===0;$('next').textContent=compare?'Play →':'→';$('counter').textContent=(index+1)+' / '+slides.length;
 $('movie').href='strategy_movie.html#'+B.key+'/'+(compare?$('error').value:error)+'/'+policy+'/'+(compare?$('cut').value:cut)+(direct?'/direct':'');
 history.replaceState(null,'','#slide-'+(index+1));
}
function next(){if(index===slides.length-1)location.href=$('movie').href;else show(index+1);}
$('next').onclick=next;$('prev').onclick=()=>show(index-1);
for(const id of ['metric','cut','error'])$(id).onchange=()=>show(slides.length-1);
document.addEventListener('keydown',e=>{if(e.target.matches('select,input')||e.repeat)return;if(e.key==='ArrowRight'){e.preventDefault();next();}if(e.key==='ArrowLeft'){e.preventDefault();show(index-1);}});
show((Number(location.hash.match(/slide-(\d+)/)?.[1])||1)-1);
