const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSeatingChart } = require('../src/seatingChart');
const options = { chamberName:'HBOT 1', now:'2026-09-30T09:00:00-04:00' };
const row = (changes = {}) => ({
    session_id:123, patient_id:456, first_name:'Jonathan', last_name:'SecretSurname',
    preferred_name:'Johnny', status:'scheduled', chamber_name:'HBOT 1',
    seat_number:3, start_at:'2026-09-30T08:00:00-04:00', duration_minutes:120, ...changes
});

test('returns only seat numbers and preferred or first names, sorted by seat', () => {
    const chart = buildSeatingChart([
        row(), row({ seat_number:1, preferred_name:'Mary Jane' }),
        row({ seat_number:2, preferred_name:'  ', first_name:'Alex' })
    ], options);
    assert.deepEqual(chart.seats, [
        { seatNumber:1, name:'Mary Jane' }, { seatNumber:2, name:'Alex' }, { seatNumber:3, name:'Johnny' }
    ]);
    assert.doesNotMatch(JSON.stringify(chart), /SecretSurname|patient_id|session_id|Jonathan/);
});

test('excludes other chambers, canceled bookings, past and future dives', () => {
    const chart = buildSeatingChart([
        row(), row({ chamber_name:'HBOT 3' }), row({ status:'cancelled' }),
        row({ start_at:'2026-09-30T10:00:00-04:00' }),
        row({ start_at:'2026-09-30T06:00:00-04:00' }), row({ seat_number:99 })
    ], options);
    assert.deepEqual(chart.seats, [{ seatNumber:3, name:'Johnny' }]);
});

test('shows the chart at dive start and clears it exactly at dive end', () => {
    for (const [now, count] of [
        ['2026-09-30T07:59:59-04:00',0], ['2026-09-30T08:00:00-04:00',1],
        ['2026-09-30T09:59:59-04:00',1], ['2026-09-30T10:00:00-04:00',0]
    ]) assert.equal(buildSeatingChart([row()], { ...options, now }).seats.length, count);
});

test('never combines overlapping dives or duplicate assignments', () => {
    for (const extra of [row({ start_at:'2026-09-30T08:30:00-04:00', seat_number:4 }), row()]) {
        const chart = buildSeatingChart([row(),extra],options);
        assert.equal(chart.unavailable,true);
        assert.deepEqual(chart.seats,[]);
        assert.equal(chart.dive,null);
    }
});

test('missing first name never falls back to a full display name', () => {
    const chart = buildSeatingChart([row({ first_name:null, preferred_name:null, patient_name:'Private Fullname' })],options);
    assert.deepEqual(chart.seats,[{ seatNumber:3,name:'Guest' }]);
});

test('membership expiry uses the earliest end time', () => {
    const chart = buildSeatingChart([row(),row({ seat_number:4, duration_minutes:90 })],options);
    assert.equal(chart.validUntil,'2026-09-30T09:30:00.000-04:00');
});

test('handles dives that cross midnight', () => {
    const chart = buildSeatingChart([row({ start_at:'2026-09-29T23:30:00-04:00' })],{
        ...options,now:'2026-09-30T00:30:00-04:00'
    });
    assert.equal(chart.seats.length,1);
});

test('different Dion timeslot IDs are never combined even if their start times match', () => {
    const chart = buildSeatingChart([row({ timeslot_id:11 }),row({ timeslot_id:12,seat_number:4 })],options);
    assert.equal(chart.unavailable,true);
    assert.deepEqual(chart.seats,[]);
});
