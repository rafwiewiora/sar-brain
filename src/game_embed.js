// Native board, driven by the movie clock. Never writes the player's saved game.
level=Object.values(levels)[0];
idx=new Map(level.order.map((n,i)=>[n,i]));
$('level').value=level.key;
$('level').disabled=$('difficulty').disabled=$('boardCut').disabled=true;
$('strategyReplay').hidden=true;
$('actions').onclick=e=>{const a=e.target.closest('[data-action]')?.dataset.action;if(['inspect-stage','back','next'].includes(a))action(a);};
$('dialogBody').onclick=null;
$('bulkFep').onclick=null;
$('bulkFep').onpointerenter=$('bulkFep').onpointerleave=$('bulkFep').onfocus=$('bulkFep').onblur=null;
let activeMove;
const drawBoard=render;
if(level.key==='RENIN')installReninDecision();
render=function(){
 if(level.key==='RENIN'&&activeMove){renderReninDecision(activeMove);return;}
 drawBoard();
 if(!activeMove)return;
 const {archived,f,playAction,agentFocus}=activeMove;
 if(archived){
  $('stats').innerHTML='<span><b>'+f.spent+'</b>Synthesis steps</span><span><b>'+f.queries+'</b>FEP queries</span><span><b>'+nm(level.products[model.best].p)+'</b>Best assay</span>';
  $('goal').textContent='Replay the recorded selections from the original starting inventory.';
 }
 const {phase,delta,pair}=activeMove,after=phase==='pop'||phase==='settled';
 document.body.dataset.phase=phase;
 const bulk=!after&&playAction==='query-all';
 $('bulkFep').classList.toggle('agentMove',bulk);
 if(!after&&(bulk||playAction==='query'))markFepTargets(activeMove.targets);
 if(!after&&!bulk&&pinned===agentFocus&&!stage){
  $('actions').querySelector('[data-action="'+playAction+'"]')?.classList.add('agentMove');
 }
 if(after&&delta.money)$('stats').querySelector('b').dataset.gain='+$'+delta.money;
 document.querySelector('.pairCard')?.remove();
 if(pair){
  const matched=level.comparisonDrawings?.[pair.from]&&level.comparisonDrawings?.[pair.to];
  const drawings=matched?level.comparisonDrawings:level.drawings;
  const molecule=(n,label)=>'<div>'+drawings[n]+'<strong>'+esc(name(n))+'</strong><small>'+label+'</small></div>';
  const box=document.createElement('div');box.className='pairCard';
  box.innerHTML='<h3>'+(pair.measured?'Assay confirmed':'Reference → FEP prediction')+'</h3><div class="pairMols">'+molecule(pair.from,'Measured · '+nm(level.products[pair.from].p))+'<b>→</b>'+molecule(pair.to,(pair.measured?'Measured · ':'Predicted · ')+nm(pair.measured?level.products[pair.to].p:g.forecasts.get(pair.to).p))+'</div>'+(matched?'<p class="sub">Ring–OH → ring–CH₂OH</p>':'');
  $('map').parentElement.append(box);
 }
};

window.addEventListener('message',e=>{
 if(e.source!==parent||e.data?.type!=='board-frame')return;
 const {f,focus,info,playAction,targets,archived,setting}=e.data;
 difficulty=setting;cut=e.data.cutoff;$('boardCut').value=cut;
 if(setting==='ideal'&&!$('difficulty').querySelector('[value="ideal"]'))$('difficulty').add(new Option('Ideal','ideal'));
 $('difficulty').value=setting;
 g=campaign(level,s=>setting==='ideal'?0:gameSigma(s,setting));
 g.stock.clear();for(const n of f.inventory)g.stock.add(n);
 for(const [n,p] of Object.entries(f.forecasts)){
  const parent=f.parents[n];if(!level.products[n])continue;
  const score=g.sources(n).find(([a])=>a===parent)?.[1];
  g.forecasts.set(n,{p,parent,score,sigma:setting==='ideal'?0:gameSigma(score,setting)});
 }
 if(f.quotes){const base=g.price;g.price=n=>f.quotes[n]??base(n);}
 g.history.push(...f.history);
 activeMove={archived,f,playAction,targets,index:e.data.index,inspected:e.data.inspected,decision:e.data.decision,phase:e.data.phase,delta:e.data.delta,pair:e.data.pair,agentFocus:focus};pinned=focus;stage=null;message=info;render();
 document.body.dataset.tick=e.data.tick;
 parent.postMessage({type:'painted',side:'board',tick:e.data.tick},'*');
});
parent.postMessage({type:'loaded',side:'board'},'*');
const nativeGuide=$('guide').onclick;
$('guide').onclick=()=>{
 if(activeMove?.archived){
  openDialog('<h2>Archived replay</h2><p>The board shows the agent’s choice from the inventory available before this move. The SAR Brain shows the resulting measurements, predictions and synthesis steps.</p>');
 }else{
  nativeGuide();
  $('dialogBody').querySelector('[data-action="restart"]')?.remove();
 }
};
document.addEventListener('keydown',e=>{
 if($('dialog').open||e.target.closest('select,input,textarea')||!['ArrowLeft','ArrowRight'].includes(e.key))return;
 e.preventDefault();parent.postMessage({type:'navigate',delta:e.key==='ArrowRight'?1:-1},'*');
});
