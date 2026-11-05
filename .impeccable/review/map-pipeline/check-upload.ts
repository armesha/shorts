import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {normalizeSocialCookies} from '../../../server/services/social/cookies.ts';
let browser;
try{
 const cookies=normalizeSocialCookies(JSON.parse(await readFile(resolve(homedir(),'.local/share/codex-private/tiktok-cookies.json'),'utf8')),'tiktok');
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000}});await context.addCookies(cookies);
 const page=await context.newPage();await page.goto('https://www.tiktok.com/tiktokstudio/upload',{waitUntil:'domcontentloaded',timeout:60000});
 try{await page.locator('input[type=file]').first().waitFor({state:'attached',timeout:45000})}catch{}
 console.log(JSON.stringify({path:new URL(page.url()).pathname,fileInputs:await page.locator('input[type=file]').count(),editors:await page.locator('[contenteditable=true]').count(),text:(await page.locator('body').innerText()).slice(0,1800)}));
 await page.screenshot({path:'.impeccable/review/map-pipeline/studio-upload-check.png'});
}catch{console.log('Upload editor check did not complete');process.exitCode=1}finally{await browser?.close()}
