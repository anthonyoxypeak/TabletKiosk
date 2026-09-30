const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createState}=require('../staff-alerts');
test('help alerts deduplicate polling, remind every 30 seconds, and stop on acknowledgment, cancellation and expiry',()=>{
 let now=100000,server=200000;const state=createState(()=>now),r={id:'request-1',chamber:3,seat:7,status:'requested',expiresAt:server+120000,guestName:'Not in alerts'};
 const update=rows=>state.update(rows,new Date(server).toISOString());
 assert.equal(update([r]).length,1);assert.equal(state.view().pending[0].guestName,undefined);assert.equal(state.due(true),true);
 now+=5000;server+=5000;assert.equal(update([r]).length,0);assert.equal(state.due(),false);
 now+=25000;server+=25000;update([r]);assert.equal(state.due(),true);assert.equal(state.due(),false);
 update([{...r,status:'acknowledged'}]);assert.equal(state.due(true),false);assert.equal(state.view().pending.length,0);
 update([{...r,id:'request-2'}]);assert.equal(state.due(true),true);update([{...r,status:'cancelled'}]);assert.equal(state.view().pending.length,0);
 update([{...r,expiresAt:server+1000}]);now+=1001;assert.equal(state.view().pending.length,0);assert.equal(state.due(true),false);
});
test('connection failure, stale snapshots, network delay and locking cannot produce a stale reminder',()=>{
 let now=1000;const state=createState(()=>now),r={id:'waiting',status:'requested',chamber:6,seat:2,expiresAt:15000};
 state.update([r],new Date(10000).toISOString(),5001);assert.equal(state.view().pending.length,0);
 state.update([{...r,expiresAt:999999}],new Date(10000).toISOString());state.failed();assert.equal(state.due(true),false);
 state.update([{...r,expiresAt:999999}],new Date(10000).toISOString());now+=20001;assert.equal(state.view().connected,false);assert.equal(state.due(true),false);
 state.reset();assert.equal(state.view().pending.length,0);assert.equal(state.view().connected,false);
});
function element(){return {hidden:false,textContent:'',value:'',replaceChildren(){},append(){},setAttribute(){},addEventListener(name,fn){this[name]=fn;},reset(){}};}
test('dashboard continues authenticated polling while hidden, without rendering guest names, and stops after lock',async()=>{
 const elements=new Map(),events={},intervals=[],updates=[];let calls=0,resets=0;
 const document={hidden:true,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},addEventListener(name,fn){events[name]=fn;}};
 const context={document,StaffAlerts:{mount:()=>({update:d=>updates.push(d),failed(){},reset(){resets++;}})},AbortController,Date,setTimeout,clearTimeout,setInterval:fn=>intervals.push(fn),fetch:async()=>{calls++;return {ok:true,json:async()=>({fetchedAt:new Date().toISOString(),requests:[{id:'req',guestName:'Private name',status:'requested'}]})};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../staff.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],context);
 document.getElementById('key').value='test-key';document.getElementById('login').submit({preventDefault(){}});await new Promise(r=>setImmediate(r));
 assert.equal(calls,1);assert.equal(updates.length,1);assert.equal(document.getElementById('requests').textContent,'');
 await intervals[0]();assert.equal(calls,2);events.visibilitychange();await intervals[0]();assert.equal(calls,3);
 document.getElementById('signout').click();await intervals[0]();assert.equal(calls,3);assert.equal(resets,1);
});
test('alert controls play sound, mute reminders, hide names in notifications and clear browser alerts on acknowledgment and lock',async()=>{
 const elements=new Map(),intervals=[],notices=[];let now=100000,tones=0;class Clock extends Date{static now(){return now;}}
 class Audio {constructor(){this.state='suspended';Object.defineProperty(this,'currentTime',{get:()=>now/1000});this.destination={};}async resume(){this.state='running';}async suspend(){this.state='suspended';}createOscillator(){return {frequency:{},connect(){},start(){tones++;},stop(){},disconnect(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}}
 class Notice {static permission='granted';constructor(title,options){this.title=title;this.options=options;notices.push(this);}close(){this.closed=true;this.onclose?.();}}
 const document={title:'',head:{append(){}},createElement:()=>element(),getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}};
 const window={AudioContext:Audio,matchMedia:()=>({matches:false}),focus(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../staff-alerts'),'utf8'),{window,document,Notification:Notice,Date:Clock,setInterval:fn=>intervals.push(fn),encodeURIComponent});
 const alerts=window.StaffAlerts.mount(),r={id:'request',chamber:3,seat:7,status:'requested',expiresAt:now+120000,guestName:'Private name'};
 const data=()=>({requests:[r],fetchedAt:new Date(now).toISOString()});alerts.update(data());assert.equal(notices.length,1);assert.ok(!JSON.stringify(notices).includes('Private name'));assert.match(document.title,/waiting for help/);
 await elements.get('enable-alerts').onclick();assert.equal(tones,6);intervals[0]();assert.equal(tones,6);
 elements.get('mute-alerts').onclick();now+=30000;alerts.update(data());intervals[0]();assert.equal(tones,6);
 elements.get('mute-alerts').onclick();intervals[0]();assert.equal(tones,12);
 alerts.update({...data(),requests:[{...r,status:'acknowledged'}]});assert.equal(notices[0].closed,true);assert.equal(document.title,'Tablet Dashboard · OxyPeak');
 alerts.reset();now+=30000;intervals[0]();assert.equal(tones,12);assert.equal(elements.get('alert-controls').hidden,true);
 Notice.permission='denied';alerts.update(data());const count=notices.length;await elements.get('enable-alerts').onclick();assert.equal(notices.length,count);assert.match(elements.get('alert-status').textContent,/notifications blocked/);assert.equal(tones,18);
});
