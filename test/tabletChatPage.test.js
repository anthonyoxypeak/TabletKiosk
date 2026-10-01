const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('chat page clears messages and drafts at the server deadline, on hiding, and rejects late responses after hiding',async()=>{
 let now=0,body={token:'private-token',self:'public-id',participants:[],messages:[],blocked:[],muted:false,fetchedAt:new Date(100000).toISOString(),validUntil:new Date(102000).toISOString()},hold=false,resolve;
 const elements=new Map(),events={},timers=new Map();let id=0;
 function element(){return {textContent:'',value:'',disabled:false,open:false,children:[],replaceChildren(){this.children=[];},append(e){this.children.push(e);},addEventListener(){},close(){this.open=false;},showModal(){this.open=true;},focus(){}};}
 const document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelector:()=>element(),querySelectorAll:()=>[],createElement:element,addEventListener:(name,fn)=>events[name]=fn};
 const window={addEventListener(){}};
 const context={window,document,URLSearchParams,AbortController,crypto:{randomUUID:()=> 'test-message-id'},performance:{now:()=>now},setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>{},fetch:async()=>{if(hold)await new Promise(r=>resolve=r);return {ok:true,json:async()=>body};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../seating-chat.js'),'utf8'),context);
 const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 window.createSeatChat({apiBase:'http://test',apiKey:'key',chamber:'3',seat:'1'});await settle();assert.equal(elements.get('chat-pause').disabled,false);
 elements.get('chat-draft').value='private draft';elements.get('chat-log').append('private message');
 now=2000;for(const [i,timer] of timers)if(timer.at<=now){timers.delete(i);timer.fn();}
 assert.equal(elements.get('chat-draft').value,'');assert.equal(elements.get('chat-log').children.length,0);assert.equal(elements.get('chat-pause').disabled,true);
 body={...body,fetchedAt:new Date(102000).toISOString(),validUntil:new Date(104000).toISOString()};hold=true;events.visibilitychange();await settle();
 document.hidden=true;events.visibilitychange();resolve();await settle();assert.equal(elements.get('chat-pause').disabled,true);assert.equal(elements.get('chat-log').children.length,0);
 document.hidden=false;hold=false;events.visibilitychange();await settle();assert.equal(elements.get('chat-pause').disabled,false);
});
