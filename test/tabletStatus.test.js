const test = require('node:test');
const assert = require('node:assert/strict');
const {createTabletStatus}=require('../src/tabletStatus');
test('status is bounded to 56 seats, excludes patient data, and expires check-ins using server time',()=>{
    let now=1000000;const status=createTabletStatus({version:'1.1.0',now:()=>now});
    assert.equal(status.snapshot().tablets.length,56);
    assert.ok(status.snapshot().tablets.every(t=>t.status==='unknown'));
    assert.equal(status.record({chamber:6,seat:9,version:'1.0.0',sync:'ok',patientName:'NEVER STORE',lastSeen:'2099-01-01'}),true);
    const tablet=()=>status.snapshot().tablets.find(t=>t.chamber===6&&t.seat===9);
    assert.equal(tablet().status,'reporting');assert.equal(tablet().updateAvailable,true);
    assert.ok(!JSON.stringify(status.snapshot()).includes('NEVER STORE'));
    now+=150001;assert.equal(tablet().status,'stale');
    assert.equal(status.record({chamber:2,seat:1,version:'x',sync:'ok'}),false);
    assert.equal(status.record({chamber:6,seat:15,version:'x',sync:'ok'}),false);
    assert.equal(status.record({chamber:6,seat:9,version:'<script>',sync:'ok'}),false);
});
