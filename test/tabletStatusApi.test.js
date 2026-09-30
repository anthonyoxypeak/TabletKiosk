const test=require('node:test');const assert=require('node:assert/strict');
process.env.KIOSK_DEMO_MODE='true';process.env.KIOSK_API_KEY='tablet-test';process.env.KIOSK_STAFF_KEY='staff-test';
const app=require('../server');
test('heartbeat and staff dashboard enforce separate keys when configured and never cache status',async()=>{
    const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const base=`http://127.0.0.1:${server.address().port}`;
    try {
        const heartbeat={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chamber:6,seat:9,version:'1.1.0',sync:'ok'})};
        assert.equal((await fetch(base+'/api/tablet/heartbeat',heartbeat)).status,401);
        heartbeat.headers['X-Kiosk-Key']='tablet-test';assert.equal((await fetch(base+'/api/tablet/heartbeat',heartbeat)).status,200);
        assert.equal((await fetch(base+'/api/staff/tablets?key=staff-test')).status,401);
        assert.equal((await fetch(base+'/api/staff/tablets',{headers:{'X-Kiosk-Key':'tablet-test'}})).status,401);
        const response=await fetch(base+'/api/staff/tablets',{headers:{'X-Kiosk-Key':'staff-test'}});
        assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
        assert.equal((await response.json()).tablets.find(t=>t.chamber===6&&t.seat===9).status,'reporting');
        for(const path of ['/staff.html','/tablet-session.js','/tablet-experience.js'])assert.equal((await fetch(base+path)).status,200);
    } finally {await new Promise(r=>server.close(r));}
});
