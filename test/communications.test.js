const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createCommunications,sessionToken}=require('../src/communications');
test('durable requests, acknowledgement, reassignment, and exact expiry',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kiosk-comms-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let now=1000;const options={filePath:path.join(dir,'state.json'),now:()=>now},store=createCommunications(options);
 const input={chamber:6,seat:9,token:'dive-one',expiresAt:5000,id:'request-one'};
 await Promise.all([store.request(input),store.request({...input,id:'request-two'})]);
 assert.equal((await store.snapshot()).requests.length,1);
 assert.equal((await createCommunications(options).snapshot()).requests[0].id,'request-one');
 assert.equal(await store.updateRequest('request-one','acknowledged'),true);
 assert.equal((await store.forTablet(6,9,'dive-one')).request.status,'acknowledged');
 assert.equal((await store.forTablet(6,9,'dive-two')).request,null);
 await store.reconcile(6,9,'dive-two');assert.equal((await store.snapshot()).requests.length,0);
 await store.request({...input,id:'request-three',token:'dive-two'});now=5000;
 assert.equal((await store.snapshot()).requests.length,0);assert.equal((await store.forTablet(6,9,'dive-two')).request,null);
 assert.deepEqual(JSON.parse(await fs.readFile(options.filePath,'utf8')).requests,{});
});
test('announcements target only their chamber and dive, count displayed seats once, and cannot be resurrected',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kiosk-comms-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let now=1000;
 const store=createCommunications({filePath:path.join(dir,'state.json'),now:()=>now});
 const input={id:'message-one',chamber:6,text:'Test announcement',expiresAt:5000,recipients:{9:'dive-one',10:'dive-two'}};
 await store.announce(input);
 assert.equal((await store.forTablet(3,9,'dive-one')).announcement,null);assert.equal((await store.forTablet(6,9,'next-dive')).announcement,null);
 assert.equal(await store.receipt(input.id,6,9,'next-dive'),false);
 await Promise.all([store.receipt(input.id,6,9,'dive-one'),store.receipt(input.id,6,9,'dive-one')]);
 assert.equal((await store.snapshot()).announcements[0].displayedCount,1);
 await store.dismiss(input.id);await store.announce(input);assert.equal((await store.snapshot()).announcements.length,0);
 await store.announce({...input,id:'message-two'});now=5000;assert.equal((await store.forTablet(6,9,'dive-one')).announcement,null);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8')).announcements,{});
});
test('failed persistence never reports a request as delivered',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kiosk-comms-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'blocked');await fs.writeFile(file,'not a directory');
 const store=createCommunications({filePath:path.join(file,'state.json')});
 await assert.rejects(store.request({chamber:6,seat:9,token:'token',expiresAt:Date.now()+60000,id:'request-one'}));
 const snapshot=await store.snapshot().catch(()=>null);if(snapshot)assert.equal(snapshot.requests.length,0);
});
test('dive tokens change with seat, booking, and dive start',()=>{
 const a={chamberNumber:6,seatNumber:9,id:'booking',startTime:'2026-09-30T07:30:00-04:00'};
 for(const change of [{seatNumber:8},{id:'replacement'},{startTime:'2026-09-30T10:00:00-04:00'}])assert.notEqual(sessionToken(a),sessionToken({...a,...change}));
});
