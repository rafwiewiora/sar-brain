// Optional release task: PLAYWRIGHT_MODULE may point to an existing Playwright installation.
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
async function main(){
 const browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:2240,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  for(const target of (process.argv.length>2?process.argv.slice(2):['RENIN','ABL1','S1P1'])){
   await page.goto(pathToFileURL(path.join(dist,target+'_intro.html')).href);await page.waitForSelector('#title:not(:empty)');
   const slides=[];
   const pages=await page.evaluate(()=>slides.length);
   for(let i=0;i<pages;i++){
    await page.evaluate(i=>show(i),i);
    slides.push(await page.locator('article').innerHTML());
   }
   await page.selectOption('#metric','moneyInterval');await page.selectOption('#cut','0.90');await page.selectOption('#error','hard');
   if(!(await page.locator('.chart').textContent()).includes('FEP with SAR fallback + cost'))throw Error('Missing policy in slide 11');
   if(!page.url().endsWith('#slide-'+pages))throw Error('Invalid slide address');
   await page.evaluate(slides=>{
    const pages=slides.map(contents=>{const section=document.createElement('article');section.innerHTML=contents;return section;});
    document.body.replaceChildren(...pages);
   },slides);
   await page.addStyleTag({content:'@page{size:320mm 180mm;margin:0}@media print{article{box-sizing:border-box;padding:12mm 14mm;width:320mm;height:180mm;break-after:page}article:last-child{break-after:auto}.controls{display:none}body{margin:0}}'});
   await page.pdf({path:path.join(dist,target+'_slides.pdf'),preferCSSPageSize:true,printBackground:true});
   console.log(target,pages,'slides verified and exported');
  }
  if(errors.length)throw Error(errors.join('; '));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
