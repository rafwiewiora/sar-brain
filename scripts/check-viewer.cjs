const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {pathToFileURL}=require('node:url'),path=require('node:path');
const url=pathToFileURL(path.resolve(__dirname,'../dist')+'/').href;
(async()=>{const b=await chromium.launch();try{const p=await b.newPage({viewport:{width:1440,height:900}}); const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(url+'strategy_movie.html'); const ready=()=>p.waitForFunction(()=>typeof tick!=='undefined'&&document.body.dataset.ready===String(tick),null,{timeout:8000});
await ready(); const state=()=>p.evaluate(()=>[index,segment,phase,playing,$('sheetTitle').textContent]);console.log('initial',await state());
if(!await p.evaluate(()=>index===0&&segment==='intro'&&!playing&&timer===null))throw Error('Unexpected autoplay');
await p.locator('#next').click();await ready();if(!await p.evaluate(()=>index===0&&segment==='action'&&!playing&&timer===null))throw Error('Opening move advanced itself');
await p.locator('#next').click();await ready();
await p.locator('#scrub').evaluate(e=>{e.value=2;e.dispatchEvent(new Event('input'))});await ready();
if(!(await p.locator('#sheetVisual').textContent()).includes('TOTU'))throw Error('Missing step-5 chemistry');
await p.locator('#reveal').click();await ready();
const left=p.frameLocator('#game');
if(!await left.locator('.board').isVisible())throw Error('The move must start on the game board');
await p.waitForFunction(()=>phase==='press');await ready();
if(!await left.locator('[data-action="make"].agentMove').isVisible())throw Error('Missing board button press');
const cell=p.frameLocator('#brainPane').locator('[data-cell="CPD_121"]').first();if(await cell.locator('b').innerText({timeout:2000})!=='9')throw Error('Wrong opening cost');await p.waitForFunction(()=>phase==='pop');await ready();
await left.locator('#movingRanks').waitFor({state:'visible'});
const boardFrame=await (await p.locator('#game').elementHandle()).contentFrame();
await boardFrame.waitForFunction(()=>Number(document.querySelector('#movingRanks')?.dataset.progress)===1);
await p.waitForFunction(()=>phase==='settled');await ready();
if(!await left.locator('.board').isVisible()||await left.locator('#movingRanks').isVisible())throw Error('Missing return to updated board');
if(await cell.locator('b').innerText()!=='2')throw Error('Wrong inventory discount');if(!await p.evaluate(()=>!playing&&timer===null&&index===2))throw Error('Did not stop after synthesis');
await p.locator('#next').click();await ready();console.log('chemistry',await state());if(!(await p.locator('#sheetTitle').innerText()).includes('Reuse I5'))throw Error('Missing reuse slide');
await p.locator('#withSlides').uncheck();await ready();if(await p.locator('#stepSheet').isVisible())throw Error('toggle failed');
await p.locator('#withSlides').check();await ready();
await p.locator('#scrub').evaluate(e=>{e.value=8;e.dispatchEvent(new Event('input'))});await ready();await p.locator('#reveal').click();await ready();
await p.waitForFunction(()=>phase==='settled');await p.waitForFunction(()=>segment==='outro',null,{timeout:16000});console.log('outro',await state());if(!await p.evaluate(()=>!playing&&timer===null&&$('sheetTitle').textContent==='Campaign won'&&$('sheetVisual').textContent.includes('CPD 270')))throw Error('Missing confirmed-winner popup');
await p.frameLocator('#brainPane').locator('.winnerStar').waitFor({state:'attached'});
await p.locator('#reveal').click();await p.locator('#play').click();await ready();console.log('restart',await state());if(!await p.evaluate(()=>playing&&timer!==null))throw Error('Explicit Play did not start');
await p.selectOption('#target','ABL1');await ready();console.log('other',await state());if(!await p.evaluate(()=>!playing&&timer===null))throw Error('Campaign switch started playback');
for(const key of ['ABL1','S1P1']){
 await p.selectOption('#target',key);await ready();
 await p.locator('#scrub').evaluate(e=>{e.value=1;e.dispatchEvent(new Event('input'))});await ready();
 await p.locator('#reveal').click();await ready();
 if(!await left.locator('#bulkFep.agentMove').isVisible())throw Error(key+' screen must start on the board');
 await p.waitForFunction(()=>phase==='pop');await ready();await left.locator('#movingRanks').waitFor({state:'visible'});
 await p.waitForFunction(()=>phase==='settled');await ready();
 if(!await left.locator('.board').isVisible())throw Error(key+' screen did not return to board');
}
for(const k of ['RENIN','ABL1','S1P1']){await p.goto(url+k+'_intro.html#slide-5');await p.waitForSelector('#title:not(:empty)',{timeout:2000});console.log('deck',k,await p.locator('#title').innerText());await p.evaluate(()=>show(10));if(!await p.locator('svg.chart').count())throw Error('comparison failed')}
await p.goto(url+'medicinal_chemistry_world_map.html#RENIN/hard/0.80');
const winner=await p.evaluate(()=>level.order.find(n=>level.products[n].name==='CPD 270'));
await p.selectOption('#find',winner);await p.locator('#actions [data-action="make"]').click();
await p.locator('dialog[open] .winCard').waitFor();
if(!(await p.locator('.winCard').textContent()).includes('1 nM'))throw Error('Winning assay missing');
await p.locator('#close').click();if(!(await p.locator('#map').textContent()).includes('★ CPD 270'))throw Error('Board winner unmarked');
if(errors.length)throw Error(errors.join(';'));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1})
