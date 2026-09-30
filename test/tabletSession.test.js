const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../tablet-session');
function fixture(saved) {
    let time = Date.parse('2026-09-30T18:00:00Z'); // Deliberately wrong tablet clock.
    let value = saved || null;
    const resets = [], timers = new Map(); let serial = 0;
    const options = { storage:{ getItem:()=>value,setItem:(k,v)=>{value=v;},removeItem:()=>{value=null;} }, storageKey:'expiry',
        onReset:reason=>resets.push(reason), now:()=>time,
        schedule:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id) };
    const session = create(options);
    return { session, resets, saved:()=>value,
        advance(ms) {time+=ms; for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}},
        sleep(ms) {time+=ms;}, options };
}
const serverTime = '2026-09-30T13:29:58Z';
const appointment = { key:'session-1:start-1',endTime:'2026-09-30T13:30:00Z' };
test('offline deadline uses server time and subtracts request duration, resetting exactly once',()=>{
    const f=fixture();f.session.sync(appointment,serverTime,500);
    f.advance(1499);assert.equal(f.resets.length,0);
    f.advance(1);assert.deepEqual(f.resets,['ended']);
    f.advance(60000);f.session.check();assert.equal(f.resets.length,1);assert.equal(f.saved(),null);
});
test('reassignment clears old session before the replacement; same-session refresh does not reset',()=>{
    const f=fixture();f.session.sync(appointment,serverTime);f.session.sync(appointment,serverTime);
    assert.equal(f.resets.length,0);
    f.session.sync({...appointment,key:'new-assignment'},serverTime);assert.deepEqual(f.resets,['changed']);
    f.session.sync(null,serverTime);assert.deepEqual(f.resets,['changed','ended']);
});
test('wake and reload expire a saved session without a working connection',()=>{
    const f=fixture();f.session.sync(appointment,serverTime);f.session.dispose();f.sleep(60000);
    const restored=create(f.options);restored.start();assert.deepEqual(f.resets,['ended']);
    assert.equal(restored.active(),false);
});
test('a response arriving after its dive end cannot establish a new session',()=>{
    const f=fixture();f.session.sync(appointment,serverTime,3000);assert.equal(f.session.active(),false);
    assert.equal(f.saved(),null);
});
