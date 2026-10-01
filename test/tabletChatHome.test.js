const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('home chat badge requests count-only data, clears read counts, expires offline and clears before rebinding a moved seat',async()=>{
 const elements=new Map(),events={},timers=new Map(),intervals=[],calls=[];let now=0,n=0,status=200,count=2,closed=0,opened=0;
 const element=()=>({textContent:'',hidden:true,setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},click(){opened++;}});
 const document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},addEventListener:(name,fn)=>events[name]=fn};
 const window={addEventListener(){},TabletExperience:{closeChart(){closed++;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../tablet-chat-home.js'),'utf8'),{window,document,URLSearchParams,AbortController,performance:{now:()=>now},CHAMBER_NUMBER:3,SEAT_NUMBER:2,API_BASE_URL:'http://test',API_KEY:'test-key',setTimeout:(fn,ms)=>{timers.set(++n,{fn,at:now+ms});return n;},clearTimeout:id=>timers.delete(id),setInterval:fn=>intervals.push(fn),fetch:async(url,options)=>{calls.push({url,options});return {ok:status===200,status,json:async()=>({token:'seat-token',unreadCount:count,fetchedAt:new Date(100000).toISOString(),validUntil:new Date(102000).toISOString()})};}});
 const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};events.DOMContentLoaded();await settle();
 const badge=elements.get('homeChatBadge'),button=elements.get('homeChatButton');assert.equal(badge.textContent,'2');assert.equal(badge.hidden,false);assert.match(calls[0].url,/summary=1/);button.onclick();assert.equal(opened,1);
 count=0;await intervals[0]();assert.equal(badge.hidden,true);count=3;await intervals[0]();assert.equal(badge.hidden,false);
 now=2000;for(const [id,timer] of timers)if(timer.at<=now){timers.delete(id);timer.fn();}assert.equal(badge.hidden,true);
 status=409;await intervals[0]();assert.equal(closed,1);assert.equal(badge.hidden,true);
 status=200;await intervals[0]();assert.equal(calls.at(-1).options.headers['X-Chat-Session'],undefined);
 document.hidden=true;events.visibilitychange();assert.equal(badge.hidden,true);
});
