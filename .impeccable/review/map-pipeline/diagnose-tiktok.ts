import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {normalizeSocialCookies} from '../../../server/services/social/cookies.ts';
let browser;
try {
 const cookies=normalizeSocialCookies(JSON.parse(await readFile(resolve(homedir(),'.local/share/codex-private/tiktok-cookies.json'),'utf8')),'tiktok');
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});await context.addCookies(cookies);const page=await context.newPage();
 let status;let navigation='ok';try{status=(await page.goto('https://www.tiktok.com/',{waitUntil:'domcontentloaded',timeout:45000}))?.status();}catch{navigation='failed'}
 console.log(JSON.stringify({status,navigation,path:new URL(page.url()).pathname}));
 const info=await page.evaluate(()=>{let data;try{data=JSON.parse(document.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__')?.textContent||'{}')}catch{}const ctx=data?.__DEFAULT_SCOPE__?.['webapp.app-context'];return{title:document.title,hasAppContext:!!ctx,loggedIn:ctx?.isLogin,handle:ctx?.user?.uniqueId||null,hasUid:!!ctx?.user?.uid,userFields:Object.keys(ctx?.user||{}),challenge:!!document.querySelector('iframe[src*="captcha"], [id*="captcha"]'),text:document.body.innerText.slice(0,800)}});console.log(JSON.stringify(info));
 for(const path of ['/passport/web/account/info/?aid=1459','/passport/web/account/info/?aid=1988']){try{const response=await context.request.get('https://www.tiktok.com'+path,{timeout:20000});const body=await response.json();console.log(JSON.stringify({endpoint:path,status:response.status(),message:body.message,fields:Object.keys(body.data||{}),uid:String(body.data?.user_id||body.data?.uid||body.data?.id||''),errorCode:body.data?.error_code,handle:body.data?.username||body.data?.user?.uniqueId||null,description:typeof body.data?.description==='string'?body.data.description.slice(0,120):null}));}catch{console.log('Account identity endpoint unavailable')}}
 await page.screenshot({path:'.impeccable/review/map-pipeline/tiktok-session-check.png'});
} catch {console.log('Session diagnostic could not complete');process.exitCode=1}finally{await browser?.close()}
