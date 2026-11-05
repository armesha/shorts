import {DatabaseSync} from 'node:sqlite';import {randomBytes} from 'node:crypto';
import {chromium} from '/home/davtian/Documents/map/node_modules/playwright/index.mjs';
const db=new DatabaseSync('data/app.db');let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'});
 for(const name of ['armen','stas']){
  const u=db.prepare('SELECT id FROM users WHERE username=?').get(name);const session=randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(session,u.id,new Date(Date.now()+600000).toISOString());
  const context=await browser.newContext({viewport:name==='armen'?{width:1365,height:1000}:{width:390,height:844}});
  try{
   await context.addCookies([{name:'sid',value:session,domain:'shareboard.live',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);
   const accounts=await(await context.request.get('https://shareboard.live/api/accounts')).json();
   const library=await(await context.request.get('https://shareboard.live/api/map-pipeline')).json();
   const social=await context.request.get('https://shareboard.live/api/accounts/132/social');
   console.log(JSON.stringify({user:name,channelVisible:accounts.some(a=>a.id===132),jobs:library.jobs.length,canGenerate:library.canGenerate,targets:library.targets,socialStatus:social.status()}));
   if(name==='stas'){const denied=await context.request.post('https://shareboard.live/api/map-pipeline/publishing',{data:{accountId:132,enabled:false}});console.log('VIEWER_MUTATION_STATUS',denied.status());}
   const page=await context.newPage();await page.goto('https://shareboard.live/templates/maps/library',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Библиотека карт',exact:true}).waitFor();
   await page.screenshot({path:'.impeccable/review/map-pipeline/shared-'+name+'.png',fullPage:true});
   console.log('PAGE',JSON.stringify({user:name,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),text:(await page.locator('body').innerText()).slice(0,1000)}));
  }finally{await context.close();db.prepare('DELETE FROM sessions WHERE token=?').run(session)}
 }
}finally{await browser?.close();db.close()}
