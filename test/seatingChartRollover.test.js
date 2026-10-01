const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildSeatingChart } = require('../src/seatingChart');

// Execute the actual page script with a deterministic clock and an API backed by
// the real roster builder. No production data or credentials are needed.
function createPage(rows, startTime) {
    let now = Date.parse(startTime);
    let nextId = 0;
    let offline = false;
    const timers = new Map();
    const windowEvents = {};
    const documentEvents = {};
    const calls = [];
    function element() {
        return { children:[], textContent:'', className:'',
            append(...children) { this.children.push(...children); },
            replaceChildren(...children) { this.children = children; },
            addEventListener(type, callback) { this[type] = callback; }
        };
    }
    const elements = Object.fromEntries(['back','suite','status','seats','refresh'].map(id => [id,element()]));
    const document = { hidden:false, getElementById:id => elements[id], createElement:element,
        addEventListener:(type, callback) => { documentEvents[type] = callback; } };
    function schedule(callback, delay, interval = 0) {
        const id = ++nextId;
        timers.set(id,{ callback, at:now + delay, interval });
        return id;
    }
    const location = new URL('http://localhost/seating-chart.html?chamber=3&seat=7#key=test-only');
    const context = {
        URL, URLSearchParams, Intl, AbortController, Map, Number,
        // Deliberately put the tablet clock an hour ahead of the server.
        Date:class extends Date { static now() { return now + 3600000; } },
        performance:{ now:() => now },
        location, document,
        sessionStorage:{ setItem() {}, getItem:() => null },
        history:{ replaceState() {} },
        window:{ addEventListener:(type, callback) => { windowEvents[type] = callback; } },
        setTimeout:(fn, delay) => schedule(fn,delay), clearTimeout:id => timers.delete(id),
        setInterval:(fn,delay) => schedule(fn,delay,delay),
        fetch:async (url, options) => {
            calls.push({ url,options });
            if (offline) throw new Error('Offline');
            const body = buildSeatingChart(rows, { chamberName:'HBOT 3',seatNumber:7,now:new Date(now) });
            return { ok:true,json:async () => body };
        }
    };
    const html = fs.readFileSync(path.join(__dirname,'../seating-chart.html'),'utf8');
    vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
    async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
    async function advance(ms) {
        const target = now + ms;
        for (;;) {
            const entry = [...timers.entries()].filter(([,timer]) => timer.at <= target).sort((a,b) => a[1].at-b[1].at)[0];
            if (!entry) break;
            const [id,timer] = entry;
            now = timer.at;
            if (timer.interval) timer.at += timer.interval;
            else timers.delete(id);
            timer.callback();
            await settle();
        }
        now = target;
        await settle();
    }
    return {
        elements, calls, advance,
        names:() => elements.seats.children.map(item => item.children[1].textContent),
        async open() { windowEvents.pageshow(); await settle(); },
        async refresh() { elements.refresh.click(); await settle(); },
        async hide() { document.hidden = true; documentEvents.visibilitychange(); await settle(); },
        async show() { document.hidden = false; documentEvents.visibilitychange(); await settle(); },
        setOffline(value) { offline = value; }
    };
}

function booking(name, start, changes = {}) {
    return { first_name:name, preferred_name:null, last_name:'HiddenSurname',
        chamber_name:'HBOT 3',seat_number:7,session_date:'2026-09-30',
        start_time:start,duration_minutes:120,status:'scheduled', ...changes };
}

test('open chart automatically replaces names at back-to-back dive boundary and keeps the tablet seat highlighted', async () => {
    const page = createPage([booking('Earlier','08:00:00',{ timeslot_id:1 }),
        booking('Later','10:00:00',{ timeslot_id:2,preferred_name:'New Nickname' })], '2026-09-30T09:59:58-04:00');
    await page.open();
    assert.equal(page.names()[6],'Earlier');
    await page.advance(1999);
    assert.equal(page.names()[6],'Earlier');
    await page.advance(1);
    assert.equal(page.names()[6],'New Nickname');
    assert.ok(!page.names().includes('Earlier'));
    const mine = page.elements.seats.children.filter(item => item.className.includes('mine'));
    assert.equal(mine.length,1);
    assert.equal(mine[0].children[0].textContent,'Seat 7 · You');
    assert.match(page.calls.at(-1).url,/chamber=3&seat=7/);
    assert.equal(page.calls.at(-1).options.headers['X-Kiosk-Key'],'test-only');
});

test('gap between dives shows unassigned seats and the next scheduled dive appears without reopening the chart', async () => {
    const page = createPage([booking('Earlier','08:00:00'),booking('Later','10:01:00')], '2026-09-30T09:59:58-04:00');
    await page.open();
    await page.advance(2000);
    assert.deepEqual(page.names(),Array(14).fill('Unassigned'));
    await page.advance(59000);
    assert.deepEqual(page.names(),Array(14).fill('Unassigned'));
    await page.advance(15000);
    assert.equal(page.names()[6],'Later');
});

test('offline at dive end clears the old names even when the next fetch fails', async () => {
    const page = createPage([booking('Earlier','08:00:00')],'2026-09-30T09:59:58-04:00');
    await page.open();
    page.setOffline(true);
    await page.advance(2000);
    assert.deepEqual(page.names(),[]);
    assert.match(page.elements.status.textContent,/unavailable/);
});

test('a canceled booking and seat reassignment are reflected on the next refresh', async () => {
    const old = booking('Earlier','08:00:00');
    const moved = booking('Moved','08:00:00',{ seat_number:8 });
    const page = createPage([old,moved],'2026-09-30T09:00:00-04:00');
    await page.open();
    old.status = 'cancelled';
    moved.seat_number = 7;
    await page.advance(15000);
    assert.equal(page.names()[6],'Moved');
    assert.equal(page.names()[7],'Unassigned');
    assert.ok(!page.names().includes('Earlier'));
});

test('returning from a sleeping or backgrounded tablet fetches a fresh roster', async () => {
    const page = createPage([booking('Earlier','08:00:00'),booking('Later','10:00:00')],'2026-09-30T09:59:58-04:00');
    await page.open();
    await page.hide();
    assert.deepEqual(page.names(),[]);
    await page.advance(65000);
    await page.show();
    assert.equal(page.names()[6],'Later');
});
