const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function page(){
 let now=0,calls=0,status=200;const document={hidden:false,getElementById:()=>null,createElement:()=>({setAttribute(){},style:{}}),body:{append(){}}};
 const window={dispatchEvent(){},fetch:async()=>{calls++;return {status,ok:status===200};}};window.parent=window;
 vm.runInNewContext(fs.readFileSync(require.resolve('../tablet-polling.js'),'utf8'),{window,document,location:new URL('https://tablet.test/seat.html'),URL,Headers,Event,Map,Math,Date:{now:()=>now}});
 return {window,document,advance:n=>now+=n,setStatus:n=>status=n,calls:()=>calls,request:()=>window.fetch('/api/tablet/chat?summary=1',{headers:{'X-Kiosk-Key':'test'}})};
}
test('poll budget suppresses sync duplicates, pauses hidden pages, and separates open chat from home summary',()=>{
 const p=page(),gate=p.window.TabletPolling;
 assert.equal(gate.begin('chat-summary',15000),true);assert.equal(gate.begin('chat-summary',15000),false);
 assert.equal(gate.begin('chat',5000),true);p.advance(15000);assert.equal(gate.begin('chat-summary',15000),true);
 p.document.hidden=true;p.advance(60000);assert.equal(gate.begin('chat-summary',15000),false);
});
test('401 stops all tablet requests including manual requests; server failures back off and recover',async()=>{
 const p=page();p.setStatus(503);await p.request();assert.equal(p.window.TabletPolling.begin('chat-summary',15000),false);
 p.advance(15000);assert.equal(p.window.TabletPolling.begin('chat-summary',15000),true);
 p.setStatus(200);await p.request();assert.equal(p.window.TabletPolling.state.failures.size,0);
 p.setStatus(401);await assert.rejects(p.request(),/needs setup/);const count=p.calls();p.advance(600000);
 assert.equal(p.window.TabletPolling.begin('session',30000),false);await assert.rejects(p.request(),/needs setup/);assert.equal(p.calls(),count);
});
test('missing credentials never generate an HTTP retry loop',async()=>{
 const p=page();await assert.rejects(p.window.fetch('/api/tablet/session'),/needs setup/);assert.equal(p.calls(),0);
});
