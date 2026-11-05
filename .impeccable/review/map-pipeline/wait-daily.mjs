import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const db=new DatabaseSync('data/app.db');
const owner=db.prepare('SELECT id FROM users WHERE username=?').get('armen');
const session=randomBytes(32).toString('hex');
db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(session,owner.id,new Date(Date.now()+900000).toISOString());
let last='';let terminal=false;
try {
 const deadline=Date.now()+12*60000;
 while(Date.now()<deadline){
  const r=await fetch('http://127.0.0.1:8080/api/map-pipeline',{headers:{cookie:'sid='+session},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Pipeline observation failed: '+r.status);
  const state=await r.json(); const job=state.jobs.find(j=>j.id==='59941e40-eb31-4d32-8ae6-e518609a82d3');
  if(!job)throw Error('Scheduled job is missing');
  if(job.stage!==last){console.log(JSON.stringify({id:job.id,status:job.status,stage:job.stage,title:job.idea?.title,error:job.error}));last=job.stage;}
  if(job.status==='ready'||job.status==='failed'){terminal=true;console.log(JSON.stringify({terminal:job.status,campaign:state.campaign,canGenerate:state.canGenerate}));if(job.status==='failed')process.exitCode=1;break;}
  await delay(15000);
 }
 if(!terminal)throw Error('Observation window elapsed; inspect the same scheduled job without restarting it');
} finally {db.prepare('DELETE FROM sessions WHERE token=?').run(session);db.close()}
