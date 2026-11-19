const {board:B,draws}=JSON.parse(document.getElementById('data').textContent);
const $=id=>document.getElementById(id), esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const preset=replayDefaults(B.key);
$('cut').value=preset.cut;$('error').value=preset.error;
const presetLabel='LoMap ≥ '+preset.cut+' · '+$('error').selectedOptions[0].text;
const run=playStrategy(sampledLevel(B,draws[[3,+preset.cut,preset.error]].seed),moviePolicies[3],+preset.cut,preset.error);
const {slides,winner,name}=campaignDeck(B,run);
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
