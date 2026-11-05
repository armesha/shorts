import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { chromium } from '/home/davtian/Documents/map/node_modules/playwright/index.mjs';
const db = new DatabaseSync('data/app.db');
const owner = db.prepare('SELECT id FROM users WHERE username=?').get('armen');
const session = randomBytes(32).toString('hex');
db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(session,owner.id,new Date(Date.now()+600000).toISOString());
let browser;
try {
 browser=await chromium.launch({headless:true, executablePath:'/usr/bin/google-chrome'});
 const context=await browser.newContext({viewport:{width:1365,height:1000}});
 await context.addCookies([{name:'sid',value:session,domain:'shareboard.live',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);
 const page=await context.newPage();
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://shareboard.live/templates/maps/library',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Библиотека карт',exact:true}).waitFor();

 const snapshot=await page.evaluate(()=>({heading:document.querySelector('h1')?.textContent,videos:document.querySelectorAll('video').length,overflow:document.documentElement.scrollWidth>innerWidth,text:document.body.innerText.slice(-1800)}));
 console.log('DESKTOP',JSON.stringify(snapshot));
 const videos=page.locator('video');
 for(let i=0;i<await videos.count();i++){
  await videos.nth(i).evaluate(v=>v.load());
  await videos.nth(i).evaluate(v=>new Promise((ok,bad)=>{if(v.readyState>=1)return ok();v.addEventListener('loadedmetadata',()=>ok(),{once:true});v.addEventListener('error',()=>bad(Error('Video load failed')),{once:true});setTimeout(()=>bad(Error('Video timeout')),20000)}));
  console.log('MEDIA',JSON.stringify(await videos.nth(i).evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,error:!!v.error}))));
 }
 await page.screenshot({path:'.impeccable/review/map-pipeline/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(600);
 await page.screenshot({path:'.impeccable/review/map-pipeline/mobile.png',fullPage:true});
 console.log('MOBILE',JSON.stringify(await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth}))));
 console.log('PAGE_ERRORS',JSON.stringify(errors));
 const response=await context.request.get('https://shareboard.live/api/map-pipeline');
 const data=await response.json();
 console.log('LIVE_LIBRARY',JSON.stringify({status:response.status(),ready:data.jobs.filter(j=>j.status==='ready').length,campaign:data.campaign}));
 const unauth=await fetch('https://shareboard.live/api/map-pipeline');
 console.log('UNAUTHENTICATED_STATUS',unauth.status); await unauth.body?.cancel();
} finally {
 await browser?.close(); db.prepare('DELETE FROM sessions WHERE token=?').run(session); db.close();
}
