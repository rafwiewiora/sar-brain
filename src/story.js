const {board:B,draws}=JSON.parse(document.getElementById('data').textContent);
const $=id=>document.getElementById(id);
const preset=replayDefaults(B.key);
$('cut').value=preset.cut;$('error').value=preset.error;
const presetLabel='LoMap ≥ '+preset.cut+' · '+$('error').selectedOptions[0].text;
const run=playStrategy(sampledLevel(B,draws[[3,+preset.cut,preset.error]].seed),moviePolicies[3],+preset.cut,preset.error);
const {slides,winner,name}=campaignDeck(B,run);
let index=0;
function show(i){
 index=Math.min(10,Math.max(0,i));const [title,body,foot]=slides[index],compare=index===10;
 $('title').textContent=title;$('visual').innerHTML=compare?strategyComparison(B,draws,+$('cut').value,$('error').value,$('metric').value,name(winner)):body;
 $('context').textContent=B.key+(compare?' · Strategy comparison · LoMap ≥ '+$('cut').value+' · '+$('error').selectedOptions[0].text:' · FEP with SAR fallback + cost · '+presetLabel);
 $('foot').innerHTML=compare?($('error').value==='ideal'?'Ideal predictions · deterministic strategies · same starting compounds.':'Dot = median · whiskers = middle 50% across 101 FEP error draws · same starting compounds.'):foot;
 $('controls').hidden=!compare;$('prev').disabled=index===0;$('next').textContent=compare?'Play →':'→';$('counter').textContent=(index+1)+' / 11';
 $('movie').href='strategy_movie.html#'+B.key+'/'+(compare?$('error').value:preset.error)+'/3/'+(compare?$('cut').value:preset.cut);
 history.replaceState(null,'','#slide-'+(index+1));
}
function next(){if(index===10)location.href=$('movie').href;else show(index+1);}
$('next').onclick=next;$('prev').onclick=()=>show(index-1);
for(const id of ['metric','cut','error'])$(id).onchange=()=>show(10);
document.addEventListener('keydown',e=>{if(e.target.matches('select,input')||e.repeat)return;if(e.key==='ArrowRight'){e.preventDefault();next();}if(e.key==='ArrowLeft'){e.preventDefault();show(index-1);}});
show((Number(location.hash.match(/slide-(\d+)/)?.[1])||1)-1);
