const test = require('node:test');
const assert = require('node:assert/strict');
process.env.KIOSK_DEMO_MODE = 'true';
process.env.KIOSK_API_KEY = 'test-only-key';
const app = require('../server');

test('seating chart API requires the key, validates location, and prevents caching', async () => {
    const server = app.listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const denied = await fetch(`${base}/api/tablet/seating-chart?chamber=1&seat=1`);
        assert.equal(denied.status,401);
        assert.match(denied.headers.get('cache-control'),/no-store/);
        const headers = { 'X-Kiosk-Key':'test-only-key' };
        const valid = await fetch(`${base}/api/tablet/seating-chart?chamber=1&seat=1`,{ headers });
        assert.equal(valid.status,200);
        const data = await valid.json();
        assert.equal(data.seats.length,6);
        assert.deepEqual(Object.keys(data.seats[0]).sort(),['name','seatNumber']);
        for (const query of ['chamber=2&seat=1','chamber=1&seat=15','chamber=1&seat=1junk','seat=1']) {
            assert.equal((await fetch(`${base}/api/tablet/seating-chart?${query}`,{ headers })).status,400);
        }
        const page = await fetch(`${base}/seating-chart.html`);
        assert.match(page.headers.get('cache-control'),/no-store/);
        assert.equal(page.headers.get('referrer-policy'),'no-referrer');
    } finally { await new Promise(resolve => server.close(resolve)); }
});
