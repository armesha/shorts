import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {isRetiredPage} from './retired-pages.ts';

test('removed pages return 404 before the SPA or public assets can serve them',async()=>{
 const app=Fastify();
 app.addHook('onRequest',async(req,reply)=>{if(isRetiredPage(req.url))return reply.code(404).send({error:'not found'});});
 app.get('/*',async()=>({spa:true}));
 try{
  for(const url of ['/cards','/cards/','/editor?lang=ru','/editor/anything','/admin/banners','/admin/banners/','/banners','/template-editor/index.html','/template-editor/editor.js']){
   const response=await app.inject({url});assert.equal(response.statusCode,404,url);assert.equal(response.json().spa,undefined);
   const head=await app.inject({method:'HEAD',url});assert.equal(head.statusCode,404,url);
  }
  for(const url of ['/channels','/library','/creator','/circles','/circle-editor/index.html','/template-runtime/fonts/inter-400-normal-cyrillic.woff2','/api/creator/packs/example/cards'])assert.equal(isRetiredPage(url),false,url);
 }finally{await app.close();}
});
