const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),crypto=require('node:crypto');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createTabletChat,cleanMessage}=require('../src/tabletChat');
test('profanity is rejected with case, leetspeak, separators and invisible characters; innocent words pass',()=>{
 for(const text of ['SHIT','shit!','sh!t!','fuuuck','sh!t','f.u.c.k','f u c k','fu\u200bck','b1tch','asshole','fucking','you bastard'])assert.throws(()=>cleanMessage(text),e=>e.status===422,text);
 for(const text of ['Hello Dr. Mo!','This class is fun','Scunthorpe','The therapist was helpful','Oxygen & HBOT','How are you?'])assert.equal(cleanMessage(text),text);
 assert.throws(()=>cleanMessage(' '.repeat(10)),e=>e.status===400);assert.throws(()=>cleanMessage('x'.repeat(301)),e=>e.status===400);
});
async function fixture(t,settingsPath){
 let clock=Date.parse('2026-10-01T14:00:00Z'),unavailable=false;
 let rows=[1,2,3].map(seat=>({session_id:'booking-'+seat,patient_id:'private-'+seat,first_name:['Alex','Sam','Jo'][seat-1],last_name:'Hidden',chamber_name:'HBOT 3',seat_number:seat,start_at:'2026-10-01T14:00:00Z',duration_minutes:120,status:'active',timeslot_id:10}));
 const auth=key=>(req,res,next)=>req.get('x-kiosk-key')===key?next():res.sendStatus(401);
 const chat=createTabletChat({now:()=>clock,loadRows:async name=>{if(unavailable)throw Error('offline');return rows.filter(r=>r.chamber_name===name);},requireTablet:auth('tablet'),requireStaff:auth('staff'),settingsPath});
 const app=express();app.use(express.json());app.use(chat.router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{chat.close();server.closeAllConnections();return new Promise(r=>server.close(r));});
 const base='http://127.0.0.1:'+server.address().port;
 async function request(url,body,key='tablet',token=''){const response=await fetch(base+url,{method:body?'POST':'GET',headers:{'X-Kiosk-Key':key,'Content-Type':'application/json','X-Chat-Session':token||''},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json().catch(()=>null)};}
 const join=(seat,token,chamber=3)=>request('/api/tablet/chat?'+new URLSearchParams({chamber,seat}),null,'tablet',token);
 const send=(from,to,text='Hi!',id=crypto.randomUUID())=>request('/api/tablet/chat',{chamber:3,seat:from.seat||1,token:from.token,to,text,id});
 return {request,join,send,chat,advance:ms=>clock+=ms,rows:()=>rows,change:fn=>{rows=fn(rows);},offline:value=>unavailable=value};
}
test('chat authenticates, isolates two participants, deduplicates retries, rate limits and filters before delivery',async t=>{
 const f=await fixture(t),a=(await f.join(1)).body,b=(await f.join(2)).body,c=(await f.join(3)).body;
 assert.equal((await f.request('/api/tablet/chat?chamber=3&seat=1',null,'bad')).status,401);
 assert.equal((await f.join(14)).status,409);assert.equal((await f.join(1,null,4)).body.testMode,true);
 assert.ok(!JSON.stringify(a).includes('private-'));assert.ok(!JSON.stringify(a.participants).includes(b.token));
 assert.equal((await f.join(1,b.token)).status,409);
 const id=crypto.randomUUID(),sent=await f.send(a,b.self,'Hello!',id);assert.equal(sent.status,200);assert.match(sent.cache,/no-store/);
 assert.equal((await f.send(a,b.self,'Hello!',id)).body.messages.length,1);
 assert.equal((await f.join(2,b.token)).body.messages[0].text,'Hello!');assert.equal((await f.join(3,c.token)).body.messages.length,0);
 assert.equal((await f.send(a,b.self)).status,429);f.advance(1600);
 assert.equal((await f.send(a,b.self,'sh!t')).status,422);assert.equal((await f.join(2,b.token)).body.messages.length,1);
 assert.equal((await f.send({...b,seat:2},a.self,'Hello back')).status,200);
});
test('reassigned seat cannot inherit messages or use old tokens, and stale recipient IDs cannot receive a message',async t=>{
 const f=await fixture(t),a=(await f.join(1)).body,b=(await f.join(2)).body;await f.send(a,b.self);
 f.change(rows=>rows.map(r=>r.seat_number===2?{...r,patient_id:'replacement',session_id:'replacement-booking',first_name:'New'}:r));
 assert.equal((await f.join(2,b.token)).status,409);const replacement=(await f.join(2)).body;assert.notEqual(replacement.token,b.token);assert.equal(replacement.messages.length,0);
 assert.equal((await f.join(1,a.token)).body.messages.length,0);f.advance(2000);assert.equal((await f.send(a,b.self)).status,409);
});
test('dive expiry, cancellation, conflicting dives, and database failure fail closed',async t=>{
 const f=await fixture(t),a=(await f.join(1)).body,b=(await f.join(2)).body;await f.send(a,b.self);
 f.offline(true);assert.equal((await f.join(1,a.token)).status,503);f.offline(false);
 f.change(rows=>rows.map(r=>r.seat_number===3?{...r,timeslot_id:99}:r));assert.equal((await f.join(1,a.token)).status,409);
 f.change(rows=>rows.map(r=>({...r,timeslot_id:10})));assert.equal((await f.join(1)).body.messages.length,0);
 f.advance(120*60000);assert.equal((await f.join(1,a.token)).status,409);
 f.change(rows=>rows.map(r=>({...r,start_at:'2026-10-01T16:00:00Z',session_id:r.session_id+'next'})));assert.equal((await f.join(1)).body.messages.length,0);
 f.change(rows=>rows.map(r=>({...r,status:'cancelled'})));assert.equal((await f.join(1)).body.testMode,true);
});
test('block and personal pause reject delivery in both directions, staff pause clears messages and persists across restart',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tablet-chat-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'settings.json');
 const f=await fixture(t,file),a=(await f.join(1)).body,b=(await f.join(2)).body;
 await f.request('/api/tablet/chat/preferences',{chamber:3,seat:2,token:b.token,to:a.self,blocked:true});assert.equal((await f.send(a,b.self)).status,403);
 await f.request('/api/tablet/chat/preferences',{chamber:3,seat:2,token:b.token,to:a.self,blocked:false,muted:true});assert.equal((await f.send(a,b.self)).status,403);
 await f.request('/api/tablet/chat/preferences',{chamber:3,seat:2,token:b.token,muted:false});assert.equal((await f.send(a,b.self)).status,200);
 assert.equal((await f.request('/api/staff/chat',{chamber:3,paused:true})).status,401);
 assert.equal((await f.request('/api/staff/chat',{chamber:3,paused:true},'staff')).status,200);assert.equal((await f.join(1,a.token)).status,403);
 const second=await fixture(t,file);assert.equal((await second.join(1)).status,403);
 await f.request('/api/staff/chat',{chamber:3,paused:false},'staff');assert.equal((await f.join(1)).body.messages.length,0);
});

test('same-dive seat moves preserve messages and unread state but revoke the old tablet token',async t=>{
 const f=await fixture(t),a=(await f.join(1)).body,b=(await f.join(2)).body;
 await f.send(a,b.self,'See you in the next seat');
 f.change(rows=>rows.map(r=>r.seat_number===2?{...r,seat_number:4,session_id:'replacement-booking-same-person'}:r));
 assert.equal((await f.join(2,b.token)).status,409);
 assert.equal((await f.join(4,b.token)).status,409);
 const moved=(await f.join(4)).body;assert.equal(moved.self,b.self);assert.notEqual(moved.token,b.token);assert.equal(moved.messages[0].text,'See you in the next seat');assert.equal(moved.unreadCount,1);
 const sender=(await f.join(1,a.token)).body;assert.equal(sender.participants.find(p=>p.id===b.self).seat,4);
 const summary=await f.request('/api/tablet/chat?chamber=3&seat=4&summary=1',null,'tablet',moved.token);assert.equal(summary.body.unreadCount,1);assert.equal(summary.body.messages,undefined);assert.equal(summary.body.participants,undefined);
 await f.request('/api/tablet/chat/preferences',{chamber:3,seat:4,token:moved.token,readFrom:a.self,through:moved.messages[0].id});assert.equal((await f.join(4,moved.token)).body.unreadCount,0);
 assert.equal((await f.send({...moved,seat:4},a.self,'I moved!')).status,200);
});
test('swapping two assigned seats preserves each guest and prevents either previous token from reading the other guest',async t=>{
 const f=await fixture(t),a=(await f.join(1)).body,b=(await f.join(2)).body;await f.send(a,b.self);
 f.change(rows=>rows.map(r=>({...r,seat_number:r.seat_number===1?2:r.seat_number===2?1:r.seat_number})));
 assert.equal((await f.join(1,a.token)).status,409);assert.equal((await f.join(2,b.token)).status,409);
 assert.equal((await f.join(2)).body.self,a.self);assert.equal((await f.join(1)).body.self,b.self);assert.equal((await f.join(1)).body.messages.length,1);
});
test('between-dive test chat has 14 unassigned seats, clears at a real dive and never activates on lookup failure',async t=>{
 const f=await fixture(t),bookings=f.rows();f.change(()=>[]);
 const a=(await f.join(1)).body,b=(await f.join(2)).body;assert.equal(a.testMode,true);assert.equal(a.participants.length,14);assert.ok(a.participants.every(p=>p.name==='Unassigned'));
 await f.send(a,b.self,'Testing only');assert.equal((await f.join(2,b.token)).body.messages.length,1);
 f.offline(true);assert.equal((await f.join(1)).status,503);f.offline(false);
 f.change(()=>bookings);assert.equal((await f.join(1,a.token)).status,409);const live=(await f.join(1)).body;assert.equal(live.testMode,false);assert.equal(live.messages.length,0);
 f.change(()=>[]);assert.equal((await f.join(1)).body.messages.length,0);
});
