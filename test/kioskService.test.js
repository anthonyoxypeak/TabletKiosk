const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildTabletSessionResponse,
    getLocationFromQuery,
    resolveChamberName
} = require('../src/kioskService');

test('normalizes chamber URL values to Dion database chamber names', () => {
    assert.equal(resolveChamberName('1'), 'HBOT 1');
    assert.equal(resolveChamberName('Suite 3'), 'HBOT 3');
    assert.equal(resolveChamberName('HBOT Suite 4'), 'HBOT 4');
    assert.equal(resolveChamberName('HBOT 6'), 'HBOT 6');

    const location = getLocationFromQuery({ chamber: '1', seat: '12' });
    assert.deepEqual(location, {
        chamberName: 'HBOT 1',
        chamberNumber: 1,
        seatNumber: 12
    });
});

test('returns an active appointment during the two-hour dive window', () => {
    const payload = buildTabletSessionResponse([
        {
            session_id: 101,
            first_name: 'Jane',
            last_name: 'Smith',
            status: 'scheduled',
            chamber_name: 'HBOT 1',
            seat_number: 3,
            session_date: '2026-07-06',
            start_time: '08:00:00',
            duration_minutes: 120
        }
    ], {
        chamberName: 'HBOT 1',
        seatNumber: 3,
        timeZone: 'America/New_York',
        now: new Date('2026-07-06T09:15:00-04:00')
    });

    assert.equal(payload.state, 'active');
    assert.equal(payload.activeAppointment.patientName, 'Jane S.');
    assert.equal(payload.activeAppointment.seat, 3);
    assert.equal(payload.nextAppointment, null);
});

test('returns an active appointment during the pre-dive display window', () => {
    const payload = buildTabletSessionResponse([
        {
            session_id: 303,
            first_name: 'Jane',
            last_name: 'Smith',
            status: 'scheduled',
            chamber_name: 'HBOT 1',
            seat_number: 3,
            session_date: '2026-07-06',
            start_time: '08:00:00',
            duration_minutes: 120
        }
    ], {
        chamberName: 'HBOT 1',
        seatNumber: 3,
        timeZone: 'America/New_York',
        now: new Date('2026-07-06T07:45:00-04:00')
    });

    assert.equal(payload.state, 'active');
    assert.equal(payload.activeAppointment.patientName, 'Jane S.');
    assert.equal(payload.nextAppointment, null);
    assert.equal(payload.preDiveDisplayMinutes, 15);
});

test('hides patient before the pre-dive display window starts', () => {
    const payload = buildTabletSessionResponse([
        {
            session_id: 202,
            first_name: 'Future',
            last_name: 'Patient',
            status: 'scheduled',
            chamber_name: 'HBOT 4',
            seat_number: 9,
            session_date: '2026-07-06',
            start_time: '15:30:00',
            duration_minutes: 120
        }
    ], {
        chamberName: 'HBOT 4',
        seatNumber: 9,
        timeZone: 'America/New_York',
        now: new Date('2026-07-06T15:14:59-04:00')
    });

    assert.equal(payload.state, 'available');
    assert.equal(payload.activeAppointment, null);
    assert.equal(payload.nextAppointment.patientName, 'Future P.');
});

test('hides patient exactly when the scheduled dive window ends', () => {
    const payload = buildTabletSessionResponse([
        {
            session_id: 404,
            first_name: 'Done',
            last_name: 'Patient',
            status: 'scheduled',
            chamber_name: 'HBOT 1',
            seat_number: 3,
            session_date: '2026-07-06',
            start_time: '08:00:00',
            duration_minutes: 120
        }
    ], {
        chamberName: 'HBOT 1',
        seatNumber: 3,
        timeZone: 'America/New_York',
        now: new Date('2026-07-06T10:00:00-04:00')
    });

    assert.equal(payload.state, 'available');
    assert.equal(payload.activeAppointment, null);
    assert.equal(payload.nextAppointment, null);
});
