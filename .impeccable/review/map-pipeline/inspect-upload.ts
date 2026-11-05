import {readFile,writeFile} from 'node:fs/promises';import {homedir} from 'node:os';import {resolve} from 'node:path';import {chromium} from 'playwright';import {normalizeSocialCookies} from '../../../server/services/social/cookies.ts';
let browser;
try{
 const cookies=normalizeSocialCookies(JSON.parse(await readFile(resolve(homedir(),'.local/share/codex-private/tiktok-cookies.json'),'utf8')),'tiktok');
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000}});await context.addCookies(cookies);
 const page=await context.newPage();await page.goto('https://www.tiktok.com/tiktokstudio/upload',{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('input[type=file]').first().setInputFiles('/home/davtian/Documents/map/exports/daily-library/u1/39567d04-01a6-40eb-bb4f-a465468df5e9/video.mp4',{timeout:60000});
 for(let i=0;i<3;i++){
  await page.waitForTimeout(i===0?10000:30000);
  const info=await page.evaluate(()=>({text:document.body.innerText.slice(-6500),editors:[...document.querySelectorAll('[contenteditable]')].map(e=>({tag:e.tagName,role:e.getAttribute('role'),editable:e.getAttribute('contenteditable'),placeholder:e.getAttribute('data-placeholder')})),inputs:[...document.querySelectorAll('input,textarea')].map(e=>({tag:e.tagName,type:e.getAttribute('type'),placeholder:e.getAttribute('placeholder')})),buttons:[...document.querySelectorAll('button')].map(e=>({text:e.textContent?.trim(),disabled:e.disabled}))}));
  console.log(JSON.stringify({pass:i,...info}));await page.screenshot({path:'.impeccable/review/map-pipeline/upload-pass-'+i+'.png',fullPage:true});
  await writeFile('.impeccable/review/map-pipeline/upload-pass-'+i+'.json',JSON.stringify(info,null,2));
 }
}catch{console.log('Upload inspection did not complete; no Post action was performed');process.exitCode=1}finally{await browser?.close()}
