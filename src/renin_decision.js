function rankLeaders(snapshot){
 const col=snapshot.activeColumn;
 return snapshot.entries.filter(e=>e.ranks[col]<=3).sort((a,b)=>a.ranks[col]-b.ranks[col]);
}
function leaderCards(move,label){
 const {decision:d,phase}=move,col=d.afterRanks.activeColumn;
 const before=rankLeaders(d.beforeRanks),after=rankLeaders(d.afterRanks);
 const oldRows=new Map(d.beforeRanks.entries.map(e=>[e.id,e]));
 const showPrevious=phase==='pop'||phase==='depart',top=showPrevious?before:after;
 const heading=phase==='pop'?'Previous top three':phase==='depart'?'Leaving the top three':phase==='arrive'?'Entering the top three':'Top '+top.length;
 if(!top.length)return '<section class="topRanked"><h3>All candidates assayed</h3></section>';
 const drawings=top.map(e=>level.rankStructures[e.id]);
 const keys=new Set(drawings.flatMap(d=>Object.keys(d.sites)));
 const varying=[...keys].filter(k=>new Set(drawings.map(d=>d.sites[k]?.[0]??'')).size>1);
 const oldTopIds=new Set(before.map(e=>e.id));
 const cards=top.map((entry,i)=>{
  const d=drawings[i],parts=varying.map(k=>d.sites[k]).filter(Boolean);
  const markers='<g stroke="#83d7ae" fill="#83d7ae">'+parts.map(p=>p[2]).join('')+'</g>';
  const structure=d.svg.replace('<!-- END OF HEADER -->',markers);
  const annotations=[...new Set(varying.map(k=>{
   if(d.sites[k])return d.sites[k][1];
   if(level.key==='RENIN'&&/^s1[2-6]$/.test(k))return (Number(k.slice(1))-10)+'-H';
   return '';
  }).filter(Boolean))];
  const description=annotations.join(' · ')||(varying.length?'Unsubstituted at the differing sites':'');
  const score=entry.scores[col].toFixed(2),rank=entry.ranks[col],before=oldRows.get(entry.id)?.ranks[col];
  const movement=!showPrevious&&before&&before!==rank?' <small>was #'+before+'</small>':'';
  const leaving=phase==='depart'&&!after.some(e=>e.id===entry.id);
  const entering=phase==='arrive'&&!oldTopIds.has(entry.id);
  const change=leaving?(move.playAction==='make'&&move.targets.includes(entry.id)?'Assayed':'Left top three'):entering?'New to top three':'';
  const title='<b>#'+rank+' '+esc(name(entry.id))+'</b>'+movement+(change?' <em>'+change+'</em>':'');
  const details='<span>'+esc(description)+'</span><small>Score '+score+'</small>';
  const contents=phase==='depart'||phase==='arrive'?'<div class="leaderCopy">'+title+details+'</div>'+structure:title+structure+details;
  return '<div class="rankCandidate'+(leaving?' leaving':entering?' entering':'')+'" data-candidate="'+esc(entry.id)+'">'+contents+'</div>';
 }).join('');
 return '<section class="topRanked"><h3>'+esc(heading)+' · '+esc(label)+'</h3><div class="rankCards">'+cards+'</div>'+(varying.length?'<p><i></i> Groups that differ across these compounds</p>':'')+'</section>';
}

let rankAnimation=0,rankMotionPaused=false;
function renderRankBoard(move){
 cancelAnimationFrame(rankAnimation);
 const {decision:d,phase,playAction}=move, after=d.afterRanks,col=after.activeColumn;
 const oldRows=new Map(d.beforeRanks.entries.map(e=>[e.id,e])),newRows=new Map(after.entries.map(e=>[e.id,e]));
 const making=playAction==='make',pick=move.agentFocus;
 const leader=after.entries.find(e=>e.ranks[col]===1)?.id;
 let spotlight=pick;
 const secondary=making?(d.unlocked.length===1?d.unlocked[0]:d.ranking?.shortlisted.find(n=>n!==pick&&newRows.has(n))):null;
 const labels=['SAR only','SAR + cost',after.fepCost?'FEP or SAR + cost':'FEP or SAR'];
 const panel=$('reninDecision');
 panel.className='liveRanks';
 const label=making&&d.ranking?' · batch pick '+(d.ranking.shortlisted.indexOf(pick)+1)+' of '+d.ranking.shortlisted.length:'';
 const caption=(playAction===''?'Opening ranks':making?'Ranks after assay':'Ranks after FEP')+' · '+newRows.size+' candidates'+label;
 if(phase==='depart'||phase==='arrive'){
  panel.className='leaderUpdate';panel.innerHTML=leaderCards(move,labels[col]);return;
 }
 panel.innerHTML='<figure class="rankFigure"><figcaption>'+caption+'</figcaption><svg id="movingRanks" viewBox="0 0 925 320" role="group" aria-label="Candidate rankings"></svg></figure>'+leaderCards(move,labels[col])+(phase==='settled'?stockRow(d.stock,d.addedStages):'');
 const chart=$('movingRanks'),xs=[115,407,705],y=r=>48+(r-1)*247/Math.max(1,d.axisCount-1);
 chart.onclick=e=>{
  const id=e.target.closest('[data-rank-id]')?.dataset.rankId;
  if(id){spotlight=id;ordered.sort((a,b)=>priority(a)-priority(b));paint(Number(chart.dataset.progress));}
 };
 const text=(x,y,t,ext='')=>'<text x="'+x+'" y="'+y+'" '+ext+'>'+esc(t)+'</text>';

 const header=labels.map((t,i)=>text(xs[i],23,t,'text-anchor="middle"'+(i===col?' class="activeRank"':''))).join('');
 let grid='<rect x="60" y="39" width="665" height="'+(y(2.5)-39)+'" fill="#eaf6f1"/>';
 const interval=d.axisCount>40?10:5;
 const ticks=[1,...Array.from({length:Math.floor(d.axisCount/interval)},(_,i)=>(i+1)*interval)];
 for(const r of ticks)grid+='<path d="M60 '+y(r)+'H725" stroke="#dbe3e8"/>'+text(50,y(r)+4,String(r),'text-anchor="end"');
 const ordered=[...oldRows.keys()].sort((a,b)=>priority(a)-priority(b));
 function priority(n){return n===spotlight?2:n===secondary||n===leader?1:0;}
 function paint(t){
  let svg=header+grid;
  const captions=[];
  for(const n of ordered){
   const a=oldRows.get(n),b=newRows.get(n),ending=!b;
   if(ending&&t>=1)continue;
   const yy=a.ranks.map((v,i)=>y(v+((b?.ranks[i]??v)-v)*t));
   const pr=priority(n),color=['#afbdc8','#24836e','#6738a9'][pr];
   const pts=yy.map((v,i)=>xs[i]+','+v).join(' ');
   const ranks=(t>=1?b:a).ranks;
   svg+='<g class="rankSeries" data-rank-id="'+esc(n)+'" data-ranks="'+ranks.join(',')+'" opacity="'+(ending?1-t:1)+'"><title>'+esc(name(n))+' · '+ranks.map(r=>'#'+r).join(' / ')+'</title><polyline points="'+pts+'" fill="none" stroke="transparent" stroke-width="9"/><polyline class="rankStroke" points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="'+[1.35,2.4,4][pr]+'"/>'+yy.map((v,i)=>'<circle cx="'+xs[i]+'" cy="'+v+'" r="'+[2,3.4,5][pr]+'" fill="'+color+'"/>').join('')+'</g>';
   if(pr===2)for(const i of [0,1])svg+=text(xs[i]-9,yy[i]+4,'#'+ranks[i],'text-anchor="end" class="rankNumber" opacity="'+(ending?1-t:1)+'" pointer-events="none"');
   if(pr)captions.push({n,yy:yy[2],color,alpha:ending?1-t:1,rank:ranks[2]});
  }
  let last=22;
  for(const c of captions.sort((a,b)=>a.yy-b.yy)){
   const ly=Math.max(last+18,c.yy);last=ly;
   svg+='<g data-rank-id="'+esc(c.n)+'" opacity="'+c.alpha+'"><path d="M713 '+c.yy+'L735 '+ly+'h6" stroke="'+c.color+'" fill="none"/>'+text(746,ly+5,'#'+c.rank+' '+name(c.n)+(making&&c.n===pick?' · pick':''),'fill="'+c.color+'" font-weight="700"')+'</g>';
  }
  chart.innerHTML=svg;chart.dataset.progress=t.toFixed(3);
 }
 if(phase==='pop'&&d.progress==null&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  let lastTime=performance.now(),elapsed=0;
  function advance(now){if(!rankMotionPaused)elapsed+=now-lastTime;lastTime=now;const u=Math.min(1,elapsed/d.animateMs);paint(u*u*(3-2*u));if(u<1)rankAnimation=requestAnimationFrame(advance);}
  paint(0);rankAnimation=requestAnimationFrame(advance);
 }else paint(d.progress??1);
}
