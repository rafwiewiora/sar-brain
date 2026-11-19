// Optional release task: PLAYWRIGHT_MODULE may point to an existing Playwright installation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
async function main(){
 const browser=await chromium.launch(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sar-story-'));
 const page=await browser.newPage({viewport:{width:2240,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>typeof tick!=='undefined'&&document.body.dataset.ready===String(tick),null,{timeout:20000});
 try{
  await page.goto(pathToFileURL(path.join(dist,'medicinal_chemistry_world_map.html')).href+'#ABL1');
  const bulk=page.locator('#bulkFep');
  if(!(await bulk.innerText()).includes('24 compounds · $24'))throw Error('Opening bulk quote');
  await page.locator('[data-action="query"]').click();
  if(!(await bulk.innerText()).includes('23 compounds · $23'))throw Error('Duplicate individual quote');
  await bulk.click();
  await page.reload();
  if(!await bulk.isDisabled()||!await page.evaluate(()=>g.forecasts.size===24&&spentCash()===24))throw Error('Bulk purchase persistence');
  if(!await page.locator('#stats').innerText().then(t=>t.includes('2Moves played')||t.match(/2\s+Moves played/)))throw Error('Bulk move count');
  for(const target of ['RENIN','ABL1','S1P1']){
   await page.goto(pathToFileURL(path.join(dist,target+'_intro.html')).href);await page.waitForSelector('#title:not(:empty)');
   const slides=[];
   for(let i=0;i<11;i++){
    await page.evaluate(i=>show(i),i);
    slides.push(await page.locator('article').innerHTML());
   }
   await page.selectOption('#metric','moneyInterval');await page.selectOption('#cut','0.90');await page.selectOption('#error','hard');
   if(!(await page.locator('.chart').textContent()).includes('FEP with SAR fallback + cost'))throw Error('Missing policy in slide 11');
   if(!page.url().endsWith('#slide-11'))throw Error('Invalid slide address');
   await page.evaluate(slides=>{
    const pages=slides.map(contents=>{const section=document.createElement('article');section.innerHTML=contents;return section;});
    document.body.replaceChildren(...pages);
   },slides);
   await page.addStyleTag({content:'@page{size:320mm 180mm;margin:0}@media print{article{box-sizing:border-box;padding:12mm 14mm;width:320mm;height:180mm;break-after:page}article:last-child{break-after:auto}.controls{display:none}body{margin:0}}'});
   await page.pdf({path:path.join(dist,target+'_slides.pdf'),preferCSSPageSize:true,printBackground:true});
   await page.goto(pathToFileURL(path.join(dist,'strategy_movie.html')).href+'#'+target);await ready();
   const policyList=await page.locator('#policy option').allTextContents();
   if(policyList.length!==5||policyList[3]!=='FEP with SAR fallback + cost')throw Error('Invalid policy options');
   for(const policy of ['0','1','2','oracle']){
    await page.selectOption('#policy',policy);await ready();
    if(policy==='oracle'){
     for(const route of ['fep','direct']){
      await page.selectOption('#route',route);await ready();
      await page.evaluate(()=>step(run().frames.length-1));await ready();
      if(route==='direct'&&!await page.evaluate(()=>run().won))throw Error('Direct oracle failed');
     }
    }
   }
   await page.selectOption('#policy','3');await ready();
   const expected=await page.evaluate(()=>run().total);
   await page.goto(pathToFileURL(path.join(dist,target+'_intro.html')).href+'#slide-11');
   const storyCost=await page.evaluate(()=>run.total);if(storyCost!==expected)throw Error('Slide trajectory differs from movie');
   await Promise.all([page.waitForURL('**/strategy_movie.html#**'),page.locator('#movie').click()]);await ready();
   const len=await page.evaluate(()=>run().frames.length), manifest=[];
   for(let i=0;i<len;i++){
    await page.evaluate(i=>step(i),i);await ready();
    const total=await page.evaluate(()=>run().frames[index].spent+run().frames[index].queries);
    if(await page.frameLocator('#brainPane').locator('#money').innerText()!=='$'+total+' spent')throw Error('Ledger mismatch');
    const action=await page.evaluate(()=>run().frames[index].action);
    const board=page.frameLocator('#game');
    if(action==='query'){
     const count=await page.evaluate(()=>run().frames[index].targets.length);
     if(!(await board.locator('button.agentMove').innerText()).includes('all eligible · '+count))throw Error('Bulk selection highlight');
     const marked=await board.locator('#map .fepTarget').evaluateAll(items=>new Set(items.map(el=>el.dataset.node)).size);
     if(marked!==count)throw Error('Queried map coverage');
    }else if(action==='make'&&await board.locator('button.agentMove').getAttribute('data-action')!=='make')throw Error('Make button highlight');
    const name=target+i+'.png';
    await page.screenshot({path:path.join(tmp,name),animations:'disabled'});
    manifest.push("file '"+name+"'",'duration '+(i===0||i===len-1?'3':'2'));
   }
   manifest.push(manifest.at(-2));fs.writeFileSync(path.join(tmp,'frames.txt'),manifest.join('\n')+'\n');
   const film=path.join(root,'media',target+'_strategy_movie.mp4');
   execFileSync('ffmpeg',['-v','error','-y','-f','concat','-safe','0','-i',path.join(tmp,'frames.txt'),'-vf','fps=24','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(tmp,'film.mp4')]);
   fs.copyFileSync(path.join(tmp,'film.mp4'),film);fs.copyFileSync(film,path.join(dist,path.basename(film)));
   console.log(target,len,'frames; slides and controls verified');
  }
  if(errors.length)throw Error(errors.join('; '));
 }finally{await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
