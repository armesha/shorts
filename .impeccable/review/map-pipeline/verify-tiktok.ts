import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {normalizeSocialCookies} from '../../../server/services/social/cookies.ts';
import {createSocialBrowser} from '../../../server/services/social/browser.ts';
let phase='load';
try {
 const file=resolve(homedir(),'.local/share/codex-private/tiktok-cookies.json');
 const cookies=normalizeSocialCookies(JSON.parse(await readFile(file,'utf8')),'tiktok');
 console.log(JSON.stringify({phase:'normalized',cookieCount:cookies.length,domains:[...new Set(cookies.map(c=>c.domain))]}));
 phase='verify';
 const profile=await createSocialBrowser('/usr/bin/google-chrome').verify('tiktok',cookies);
 console.log(JSON.stringify({authenticated:true,handle:profile.handle,userId:profile.userId}));
} catch { console.log(JSON.stringify({authenticated:false,phase,error:'Stored session could not be verified'}));process.exitCode=1; }
