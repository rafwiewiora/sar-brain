// Regenerate the summaries using the same simulator as the offline player.
const fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({});
for(const name of ['engine.js','strategy_play.js']){
 vm.runInContext(fs.readFileSync(path.join(root,'src',name),'utf8'),context);
}
const run=vm.runInContext('(level, index, cut, error) => summarizeDraws(level, moviePolicies[index], cut, error, 101)',context);
for(const file of fs.readdirSync(path.join(root,'data')).filter(f=>f.endsWith('.json.gz'))){
 const level=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data',file)))).boards;
 const summaries={};
 for(const i of [2,3])for(const cut of [.6,.7,.8,.9])for(const error of ['easy','medium','hard']){
  summaries[[i,cut,error]]=run(level,i,cut,error);
 }
 fs.writeFileSync(path.join(root,'data',level.key+'.draws.json'),JSON.stringify(summaries,null,2)+'\n');
 console.log(level.key,'completed');
}
