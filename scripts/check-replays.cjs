// Check that the full player reproduces every saved representative and its spend.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ctx=vm.createContext({});
for(const name of ['engine.js','strategy_play.js']){
 vm.runInContext(fs.readFileSync(path.join(root,'src',name),'utf8'),ctx);
}
const replay=vm.runInContext('(b,i,cut,error,seed)=>playStrategy(sampledLevel(b,seed),moviePolicies[i],cut,error)',ctx);
let checked=0;
for(const key of ['RENIN','ABL1','S1P1']){
 const b=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data',key+'.json.gz')))).boards;
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'data',key+'.draws.json'),'utf8'));
 for(const [k,s] of Object.entries(catalog)){
  const [policy,cut,error]=k.split(',');
  const r=replay(b,+policy,+cut,error,s.seed);
  assert.equal(r.won,s.median!==null);
  if(r.won)assert.equal(r.total,s.median);
  const last=r.frames.at(-1);
  assert.equal(last.spent+last.queries,r.total);
  let spend=0;
  for(const frame of r.frames){
   const delta=frame.action==='query'?frame.targets.length:Object.values(frame.amounts).reduce((a,b)=>a+b,0);
   spend+=delta;
   assert.equal(spend,frame.spent+frame.queries);
  }
  checked++;
 }
}
console.log(checked+' representative trajectories reproduce the saved result and every action charge.');
