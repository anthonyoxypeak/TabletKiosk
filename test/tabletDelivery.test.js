const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function helpApi(fetch){const source=fs.readFileSync(require.resolve('../tablet-support.js'),'utf8');const fn=source.slice(source.indexOf('    async function api('),source.indexOf('    function render()'));return vm.runInNewContext(fn+';api',{fetch,AbortController,setTimeout,clearTimeout,API_BASE_URL:'https://tablet.example',API_KEY:'tablet-test-key'});}
test('help requests omit staff cookies, retain the tablet key, and reject empty proxy responses',async()=>{
 let options,mode='ok';const api=helpApi(async(url,input)=>{options=input;return {ok:mode==='ok',status:mode==='ok'?200:403,json:async()=>{if(mode==='empty')throw new SyntaxError('Unexpected end of JSON input');return mode==='null'?null:{request:{id:'test'}};}};});
 assert.equal((await api('/api/tablet/help',{id:'test'})).request.id,'test');assert.equal(options.credentials,'omit');assert.equal(options.headers['X-Kiosk-Key'],'tablet-test-key');assert.equal(options.method,'POST');
 mode='empty';await assert.rejects(api('/api/tablet/help',{id:'same-test'}),e=>/could not confirm delivery/.test(e.message)&&!e.message.includes('JSON'));
 mode='null';await assert.rejects(api('/api/tablet/help',{id:'same-test'}),/could not confirm delivery/);
});
test('empty successful responses cannot be mistaken for a delivered help request',async()=>{
 const api=helpApi(async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('empty');}}));await assert.rejects(api('/api/tablet/help',{id:'test'}),/could not confirm delivery/);
});
test('staff writes retain Microsoft cookies, same-origin referrer and explicit CSRF header',async()=>{
 const source=fs.readFileSync(require.resolve('../staff.html'),'utf8');const fn=source.slice(source.indexOf('    async function post('),source.indexOf('    const expanded='));let sent;
 const post=vm.runInNewContext(fn+';post',{authMode:'entra',signedIn:true,key:'',AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{sent=options;return {ok:true,json:async()=>({ok:true})};}});
 await post('/api/staff/requests/test',{action:'resolved'});assert.equal(sent.credentials,'same-origin');assert.equal(sent.referrerPolicy,'same-origin');assert.equal(sent.headers['X-Staff-Action'],'1');
});
test('chat sends use tablet authentication without Microsoft cookies and handle empty rejections',async()=>{
 const source=fs.readFileSync(require.resolve('../seating-chat.js'),'utf8'),fn=source.slice(source.indexOf('    async function api('),source.indexOf('    function accept('));let sent,empty=false;
 const api=vm.runInNewContext(fn+';api',{apiBase:'https://tablet.example',apiKey:'test-key',token:'seat-token',AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{sent=options;return {ok:!empty,status:empty?403:200,json:async()=>{if(empty)throw new SyntaxError('Unexpected end of JSON input');return {token:'seat-token'};}};}});
 await api('/api/tablet/chat',{text:'Test'});assert.equal(sent.credentials,'omit');assert.equal(sent.headers['X-Kiosk-Key'],'test-key');assert.equal(sent.headers['X-Chat-Session'],'seat-token');empty=true;
 await assert.rejects(api('/api/tablet/chat',{text:'Test'}),e=>e.status===403&&!e.message.includes('JSON'));
});
