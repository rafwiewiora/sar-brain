const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {pathToFileURL}=require('node:url'),path=require('node:path');
const url=pathToFileURL(path.resolve(__dirname,'../dist')+'/').href;
(async()=>{const b=await chromium.launch();try{const p=await b.newPage({viewport:{width:1440,height:900}}); const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(url+'strategy_movie.html'); const ready=()=>p.waitForFunction(()=>typeof tick!=='undefined'&&document.body.dataset.ready===String(tick),null,{timeout:8000});
await ready(); const state=()=>p.evaluate(()=>[index,segment,phase,playing,$('sheetTitle').textContent]);console.log('initial',await state());
await p.waitForFunction(()=>index===0&&segment==='action',null,{timeout:11000});await p.waitForFunction(()=>index===1&&segment==='intro',null,{timeout:11000});console.log('automatic',await state());
await p.locator('#play').click();await p.locator('#scrub').evaluate(e=>{e.value=2;e.dispatchEvent(new Event('input'))});await ready();
if(!(await p.locator('#sheetVisual').textContent()).includes('TOTU'))throw Error('Missing step-5 chemistry');
await p.locator('#reveal').click();await ready();
const cell=p.frameLocator('#brainPane').locator('[data-cell="CPD_121"]').first();if(await cell.locator('b').innerText({timeout:2000})!=='9')throw Error('Wrong opening cost');await p.waitForFunction(()=>phase==='settled');await ready();if(await cell.locator('b').innerText()!=='2')throw Error('Wrong inventory discount');
await p.locator('#next').click();await ready();console.log('chemistry',await state());if(!(await p.locator('#sheetTitle').innerText()).includes('Reuse I5'))throw Error('Missing reuse slide');
await p.locator('#withSlides').uncheck();await ready();if(await p.locator('#stepSheet').isVisible())throw Error('toggle failed');
await p.locator('#withSlides').check();await ready();
await p.locator('#scrub').evaluate(e=>{e.value=8;e.dispatchEvent(new Event('input'))});await ready();await p.locator('#reveal').click();await ready();
await p.waitForFunction(()=>segment==='outro',null,{timeout:16000});console.log('outro',await state());
await p.locator('#reveal').click();await p.locator('#play').click();await ready();console.log('restart',await state());
await p.selectOption('#target','ABL1');await ready();console.log('other',await state());
for(const k of ['RENIN','ABL1','S1P1']){await p.goto(url+k+'_intro.html#slide-5');await p.waitForSelector('#title:not(:empty)',{timeout:2000});console.log('deck',k,await p.locator('#title').innerText());await p.evaluate(()=>show(10));if(!await p.locator('svg.chart').count())throw Error('comparison failed')}
if(errors.length)throw Error(errors.join(';'));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1})
