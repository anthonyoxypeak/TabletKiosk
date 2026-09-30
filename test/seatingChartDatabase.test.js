const test = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { Pool } = require('pg');

process.env.KIOSK_DEMO_MODE = 'false';
process.env.KIOSK_API_KEY = 'database-test-key';
process.env.PGHOST = 'test-database.invalid';
const start = DateTime.now().setZone('America/New_York').startOf('hour');
function booking(seat, first, preferred, changes = {}) {
    return {
        session_id:100+seat,timeslot_id:42,patient_id:200+seat,
        first_name:first,preferred_name:preferred,last_name:'NotForChart',
        status:'scheduled',chamber_name:'HBOT 3',seat_number:seat,
        session_date:start.toISODate(),start_time:start.toFormat('HH:mm:ss'),duration_minutes:120,
        ...changes
    };
}
const rows = [booking(7,'Jonathan','Jon'),booking(2,'Mary Jane',null),
    booking(4,'Canceled',null,{ status:'cancelled' }),
    booking(7,'Next dive',null,{ timeslot_id:43,start_time:start.plus({ hours:2 }).toFormat('HH:mm:ss') })];
const queries = [];
// Replace only the network boundary; use the real SQL provider and HTTP routes.
Pool.prototype.query = async function(sql, params) {
    queries.push({ sql,params });
    return { rows:sql.includes('s.seat_number = $2') ? rows.filter(row => row.seat_number === params[1]) : rows };
};
const app = require('../server');

test('production path uses Dion database joins and matches the current tablet patient to its chart seat', async () => {
    const server = app.listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { 'X-Kiosk-Key':'database-test-key' };
    try {
        const health = await (await fetch(`${base}/health`)).json();
        assert.equal(health.provider,'postgres');
        assert.equal(health.demoMode,false);
        const chart = await (await fetch(`${base}/api/tablet/seating-chart?chamber=3&seat=7`,{ headers })).json();
        assert.deepEqual(chart.seats,[{ seatNumber:2,name:'Mary Jane' },{ seatNumber:7,name:'Jon' }]);
        assert.equal(chart.seatNumber,7);
        const session = await (await fetch(`${base}/api/tablet/session?chamber=3&seat=7`,{ headers })).json();
        assert.equal(session.activeAppointment.preferredName,chart.seats[1].name);
        assert.equal(session.activeAppointment.seatNumber,chart.seatNumber);
        const query = queries[0];
        assert.equal(query.params[0],'HBOT 3');
        assert.match(query.sql,/JOIN scheduling_package pkg ON su.package_id = pkg.id/);
        assert.match(query.sql,/JOIN scheduling_patient p ON pkg.patient_id = p.id/);
        assert.match(query.sql,/JOIN scheduling_timeslot ts ON su.timeslot_id = ts.id/);
        assert.match(query.sql,/JOIN scheduling_seat s ON su.seat_id = s.id/);
        assert.match(query.sql,/ts.id AS timeslot_id/);
        assert.doesNotMatch(JSON.stringify(chart),/NotForChart|patient_id|session_id|Next dive|Canceled/);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
