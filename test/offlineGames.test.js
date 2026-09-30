const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('offline worker caches only public games and never patient pages or API responses',async()=>{
 const events={},cached=[],deleted=[];const cache={addAll:async urls=>cached.push(...urls),match:async req=>'cached:'+req.url};
 const sandbox={URL,caches:{open:async()=>cache,keys:async()=>['other-cache','oxypeak-games-old','oxypeak-games-1.2.1'],delete:async k=>deleted.push(k)},self:{location:{href:'https://example.test/offline-worker.js'},addEventListener:(name,fn)=>events[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../offline-worker.js'),'utf8'),sandbox);
 let work;events.install({waitUntil:p=>work=p});await work;assert.deepEqual(cached.map(x=>new URL(x).pathname),['/games.html','/games.js','/games.css']);
 events.activate({waitUntil:p=>work=p});await work;assert.deepEqual(deleted,['oxypeak-games-old']);
 for(const url of ['/seat.html?key=secret','/api/tablet/session','/api/tablet/communications','/seating-chart.html'])events.fetch({request:{method:'GET',url:'https://example.test'+url},respondWith:()=>assert.fail('Private content intercepted')});
 events.fetch({request:{method:'GET',url:cached[0]},respondWith:p=>work=p});assert.equal(await work,'cached:'+cached[0]);
});
