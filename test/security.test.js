const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),crypto=require('node:crypto');
const {tabletAuth,staffAuth,originGuard,securityHeaders}=require('../src/security');
const {buildPoolConfig}=require('../src/postgresProvider');
const tenant='11111111-1111-1111-1111-111111111111',oid='22222222-2222-2222-2222-222222222222';
const principal=(changes={})=>Buffer.from(JSON.stringify({auth_typ:'aad',claims:[{typ:'tid',val:tenant},{typ:'oid',val:oid}],...changes})).toString('base64');
async function serve(app,run){const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));try{await run('http://127.0.0.1:'+s.address().port);}finally{await new Promise(r=>s.close(r));}}
test('SSO permits assigned staff only and never accepts the tablet key as staff authentication',async()=>{
 const app=express();app.use(express.json());app.use(securityHeaders);app.use(originGuard());
 const auth=staffAuth({KIOSK_STAFF_AUTH_MODE:'entra',WEBSITE_SITE_NAME:'test',KIOSK_ENTRA_TENANT_ID:tenant,KIOSK_STAFF_OBJECT_IDS:oid,KIOSK_API_KEY:'old-key'});
 app.all('/api/staff/action',auth.middleware,(req,res)=>res.json({actor:req.securityActor}));
 await serve(app,async base=>{
  const url=base+'/api/staff/action';
  assert.equal((await fetch(url,{headers:{'x-kiosk-key':'old-key'}})).status,401);
  assert.equal((await fetch(url,{headers:{'x-ms-client-principal':'malformed'}})).status,401);
  assert.equal((await fetch(url,{headers:{'x-ms-client-principal':principal({auth_typ:'github'})}})).status,401);
  for(const claims of [[{typ:'tid',val:'wrong'},{typ:'oid',val:oid}],[{typ:'tid',val:tenant},{typ:'oid',val:'33333333-3333-3333-3333-333333333333'}]]){
   assert.ok([401,403].includes((await fetch(url,{headers:{'x-ms-client-principal':principal({claims})}})).status));
  }
  const headers={'x-ms-client-principal':principal()};
  assert.equal((await fetch(url,{headers})).status,200);
  assert.equal((await fetch(url,{method:'POST',headers})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'x-staff-action':'1',Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'x-staff-action':'1',Origin:base}})).status,200);
 });
});
test('SSO fails closed outside Azure and without configured authorization',async()=>{
 for(const env of [{KIOSK_STAFF_AUTH_MODE:'entra',KIOSK_ENTRA_TENANT_ID:tenant},{KIOSK_STAFF_AUTH_MODE:'entra',WEBSITE_SITE_NAME:'test',KIOSK_ENTRA_TENANT_ID:tenant}]){
  const app=express();app.get('/',staffAuth(env).middleware,(req,res)=>res.sendStatus(200));
  await serve(app,async base=>assert.ok([403,503].includes((await fetch(base,{headers:{'x-ms-client-principal':principal()}})).status)));
 }
});
test('staff group claims allow the approved group and deny absent, unrelated and overage-only claims',async()=>{
 const group='44444444-4444-4444-4444-444444444444';const app=express();
 const auth=staffAuth({KIOSK_STAFF_AUTH_MODE:'entra',WEBSITE_SITE_NAME:'test',KIOSK_ENTRA_TENANT_ID:tenant,KIOSK_STAFF_GROUP_IDS:group});
 app.get('/',auth.middleware,(req,res)=>res.sendStatus(200));
 await serve(app,async base=>{
  for(const [extra,status] of [[[],403],[[{typ:'groups',val:'unrelated'}],403],[[{typ:'hasgroups',val:'true'}],403],[[{typ:'groups',val:group}],200]]){
   const token=principal({claims:[{typ:'tid',val:tenant},{typ:'oid',val:oid},...extra]});
   assert.equal((await fetch(base,{headers:{'x-ms-client-principal':token}})).status,status);
  }
 });
});
test('tablets remain independent of Microsoft and bound device credentials reject another seat',async()=>{
 const key='synthetic-device-secret';const env={KIOSK_DEVICE_KEYS:JSON.stringify([{id:'tablet-1',chamber:3,seat:7,sha256:crypto.createHash('sha256').update(key).digest('hex')}])};
 const app=express();app.use(express.json());app.all('/tablet',tabletAuth(env),(req,res)=>res.json({actor:req.securityActor}));
 await serve(app,async base=>{
  assert.equal((await fetch(base+'/tablet?chamber=3&seat=7',{headers:{'x-kiosk-key':key}})).status,200);
  assert.equal((await fetch(base+'/tablet?chamber=3&seat=8',{headers:{'x-kiosk-key':key}})).status,403);
  assert.equal((await fetch(base+'/tablet?chamber=3&seat=7&key='+key)).status,401);
  assert.equal((await fetch(base+'/tablet',{method:'POST',headers:{'x-kiosk-key':key,'content-type':'application/json'},body:JSON.stringify({chamber:6,seat:7})})).status,403);
 });
 const closed=express();closed.get('/',tabletAuth({}),(req,res)=>res.sendStatus(200));await serve(closed,async base=>assert.equal((await fetch(base)).status,503));
});
test('database TLS verifies certificates and connection-string parameters cannot disable validation',()=>{
 const cfg=buildPoolConfig({DATABASE_URL:'postgres://test:test@db.example/test?sslmode=no-verify&sslrootcert=bad&ssl=false',WEBSITE_SITE_NAME:'test'});
 assert.equal(cfg.ssl.rejectUnauthorized,true);assert.doesNotMatch(cfg.connectionString,/ssl/);
 assert.throws(()=>buildPoolConfig({PGSSLMODE:'disable',WEBSITE_SITE_NAME:'test'}),/require TLS/);
});
test('public routes cannot download server code, tests, packages, repository data or setup tools',async()=>{
 process.env.KIOSK_DEMO_MODE='true';process.env.KIOSK_API_KEY='test-secret';const app=require('../server');
 await serve(app,async base=>{
  for(const file of ['/server.js','/src/security.js','/package.json','/package-lock.json','/.git/config','/test/security.test.js','/README.md','/setup-generator.html','/.env'])assert.equal((await fetch(base+file)).status,404,file);
  const page=await fetch(base+'/seat.html');assert.equal(page.status,200);assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert.equal(page.headers.get('x-content-type-options'),'nosniff');assert.equal(page.headers.get('x-powered-by'),null);
  assert.equal((await fetch(base+'/api/tablet/session?chamber=1&seat=1&key=test-secret')).status,401);
  assert.equal((await fetch(base+'/api/tablet/session?chamber=1&seat=1',{headers:{'x-kiosk-key':'test-secret',origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(base+'/api/tablet/heartbeat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({x:'a'.repeat(9000)})})).status,413);
 });
});
