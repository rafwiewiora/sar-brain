// Validate both views against the exact trajectory for every supported setting.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'dist/strategy_movie.html'),'utf8');
const data=JSON.parse(html.match(/<script id="data" type="application\/json">(.*?)<\/script>/s)[1]);
const ctx=vm.createContext({});
for(const file of ['engine','strategy_play','native_movie','story_cards'])vm.runInContext(fs.readFileSync(path.join(root,'src',file+'.js'),'utf8'),ctx);
const policies=vm.runInContext('moviePolicies',ctx);
let forward=0,oracles=0,moves=0;
for(const [key,board] of Object.entries(data.boards)){
 function check(run,cut,useFep){
  const narration=ctx.campaignNarration(board,run,cut,useFep);
  const slides=ctx.campaignSlides(board,run,narration,cut);
  const projection=ctx.project(key,board,run,data.native[key],true,narration);
  assert.equal(narration.stories.length,run.frames.length);
  assert.ok(slides.every(s=>s.length===3&&!/undefined|NaN nM/.test(s.join(''))));
  for(const [i,s] of narration.stories.entries()){
   const f=run.frames[i],prev=run.frames[Math.max(0,i-1)];
   assert.ok(!/undefined|NaN nM/.test(s.card.join('')));
   assert.deepEqual([...s.added],[...f.stock.filter(n=>!prev.stock.includes(n))]);
   if(s.stage)assert.ok(s.added.includes(s.stage)&&board.routes[s.id].includes(s.stage));
   if(s.reused)assert.ok(prev.stock.includes(s.reused)&&board.routes[s.id].includes(s.reused));
   if(s.watch)assert.ok(f.changes[s.watch][0]>f.changes[s.watch][1]);
   if(s.kind==='query'){
    assert.ok(prev.made.includes(s.reference)&&f.targets.includes(s.candidate));
    assert.equal(f.parents[s.candidate],s.reference);
    assert.ok(board.edges.some(([a,b,v])=>v>=cut-1e-12&&[a,b].includes(s.reference)&&[a,b].includes(s.candidate)));
   }
   for(const n of s.unlocked){
    const ns=board.edges.filter(([a,b,v])=>v>=cut-1e-12&&(a===n||b===n)).map(([a,b])=>a===n?b:a);
    assert.ok(useFep&&ns.includes(s.id)&&!ns.some(id=>prev.made.includes(id))&&!f.made.includes(n));
   }
   assert.equal(projection.D.paths.movie[i].spent,f.spent);
   moves++;
  }
 }
 for(let i=0;i<4;i++)for(const c of (i>=2?[.6,.7,.8,.9]:[.6]))for(const e of (i>=2?['ideal','easy','medium','hard']:['ideal'])){
  const b=i>=2&&e!=='ideal'?ctx.sampledLevel(board,data.draws[key][[i,c,e]].seed):board;
  check(ctx.playStrategy(b,policies[i],c,e),c,i>=2);forward++;
 }
 for(const c of [.6,.7,.8,.9])for(const direct of [false,true]){
  check(ctx.hindsightReplay(board,c,direct),c,!direct);oracles++;
 }
}
console.log({forward,oracles,moves});
