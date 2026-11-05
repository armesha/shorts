import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
const db=new DatabaseSync('data/app.db');
const owner=db.prepare('SELECT id FROM users WHERE username=?').get('armen');
const session=randomBytes(32).toString('hex');
db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(session,owner.id,new Date(Date.now()+600000).toISOString());
try {
 const action=process.argv[2] || 'status';
 const response=await fetch('http://127.0.0.1:8080/api/map-pipeline'+(action==='status'?'':'/'+(action==='rebuild'?'samples':action)),{method:action==='status'?'GET':'POST',headers:{cookie:'sid='+session,'content-type':'application/json',origin:'http://127.0.0.1:8080'},...(action==='status'?{}:{body:JSON.stringify(action==='rebuild'?{rebuild:true}:action==='deadline'?{endsAt:process.argv[3]}:{})})});
 const data=await response.json();
 console.log(JSON.stringify({status:response.status,campaign:data.campaign,jobs:data.jobs?.map(j=>({id:j.id,status:j.status,stage:j.stage,title:j.idea?.title,error:j.error})),error:data.error}));
} finally {db.prepare('DELETE FROM sessions WHERE token=?').run(session); db.close()}
