const test=require('node:test'),assert=require('node:assert/strict');
const {cacheScheduleProvider}=require('../src/scheduleCache');
test('56 simultaneous seat readers share chamber queries; expiry refreshes and errors never serve stale rows',async()=>{
    let now=0,calls=0,fail=false;
    const provider=cacheScheduleProvider({async fetchChamberSessions({chamberName}){calls++;if(fail)throw Error('offline');return [{seat_number:1,chamberName}];}},{now:()=>now});
    const request={chamberName:'HBOT 1',startDate:'2026-10-08',endDate:'2026-10-09'};
    await Promise.all(Array.from({length:56},()=>provider.fetchSeatSessions({...request,seatNumber:1})));
    assert.equal(calls,1);
    assert.equal((await provider.fetchSeatSessions({...request,seatNumber:2})).length,0);
    await provider.fetchChamberSessions({...request,chamberName:'HBOT 3'});assert.equal(calls,2);
    now=9999;await provider.fetchChamberSessions(request);assert.equal(calls,2);
    now=10000;fail=true;await assert.rejects(provider.fetchChamberSessions(request),/offline/);
    fail=false;await provider.fetchChamberSessions(request);assert.equal(calls,4);
    await provider.fetchChamberSessions({...request,endDate:'2026-10-10'});assert.equal(calls,5);
});
