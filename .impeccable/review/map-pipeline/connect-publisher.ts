import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {openDb} from '../../../server/db.ts';
import {createSocialService} from '../../../server/services/social/store.ts';
import {createSocialBrowser} from '../../../server/services/social/browser.ts';
const db=openDb('data/app.db');
try {
 const owner=db.db.prepare('SELECT id FROM users WHERE username=?').get('armen') as {id:number};
 const viewer=db.db.prepare('SELECT id FROM users WHERE username=?').get('stas') as {id:number};
 let account=db.listAccountsByUser(owner.id).find(a=>a.platform==='tiktok'&&(a.socialHandle==='worldfightversus'||a.channelName==='Карты · @worldfightversus'));
 if(!account) account=db.createAccount({userId:owner.id,platform:'tiktok',channelName:'Карты · @worldfightversus',lang:'ru',channelLang:'ru',sourceDecks:[],schedule:[],timezone:'Europe/Prague'});
 db.shareAccountReadOnly(owner.id,account.id,viewer.id);
 const social=createSocialService(db,resolve('data/social-private'),resolve('data/output'),createSocialBrowser('/usr/bin/google-chrome'));
 const cookies=JSON.parse(await readFile(resolve(homedir(),'.local/share/codex-private/tiktok-cookies.json'),'utf8'));
 social.importForAccount(owner.id,account.id,cookies);
 const connection=await social.verifyForAccount(owner.id,account.id);
 if(connection.status!=='connected'||connection.handle!=='worldfightversus')throw Error('TikTok identity was not confirmed');
 db.db.prepare('INSERT INTO map_publication_bindings(owner_id,account_id,enabled) VALUES(?,?,0) ON CONFLICT(owner_id) DO UPDATE SET account_id=excluded.account_id,enabled=0').run(owner.id,account.id);
 console.log(JSON.stringify({accountId:account.id,ownerId:owner.id,sharedWith:viewer.id,handle:connection.handle,status:connection.status,publishingEnabled:false}));
} catch {console.error('Channel setup did not complete; publishing remains disabled');process.exitCode=1}finally{db.db.close()}
