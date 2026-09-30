const { DateTime } = require('luxon');
const { normalizeSessionRow, DEFAULT_TIME_ZONE } = require('./kioskService');

const ACTIVE_STATUSES = new Set(['scheduled', 'active', 'in_progress']);

// Never derive this from patientName: that field can contain a surname.
function firstNameOnly(row) {
    for (const field of ['preferred_name', 'preferredName', 'first_name', 'firstName']) {
        if (typeof row[field] === 'string' && row[field].trim()) return row[field].trim();
    }
    return 'Guest';
}

function buildSeatingChart(rows, options = {}) {
    const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
    const now = options.now
        ? DateTime.fromJSDate(new Date(options.now)).setZone(timeZone)
        : DateTime.now().setZone(timeZone);
    const active = rows.map(row => ({ row, session: normalizeSessionRow(row, options) }))
        .filter(({ session }) => session
            && session.chamberName === options.chamberName
            && ACTIVE_STATUSES.has(session.status)
            && Number.isInteger(session.seatNumber)
            && session.seatNumber >= 1 && session.seatNumber <= 14
            && now >= session.start && now < session.end);
    const result = {
        chamberName: options.chamberName,
        seatNumber: options.seatNumber,
        facilityTimeZone: timeZone,
        fetchedAt: now.toISO(),
        dive: null,
        seats: []
    };
    if (!active.length) return result;

    // Conflicting overlapping dives must never be combined into one roster.
    const starts = new Set(active.map(({ session }) => session.start.toMillis()));
    const timeslots = new Set(active.map(({ row }) => row.timeslot_id).filter(id => id != null).map(String));
    if (starts.size !== 1 || timeslots.size > 1) return { ...result, unavailable: true };
    const end = Math.max(...active.map(({ session }) => session.end.toMillis()));
    result.dive = {
        startTime: active[0].session.start.toISO(),
        endTime: DateTime.fromMillis(end, { zone: timeZone }).toISO()
    };
    // Expire the response at the earliest membership change, even if polling stops.
    result.validUntil = DateTime.fromMillis(
        Math.min(...active.map(({ session }) => session.end.toMillis())), { zone: timeZone }
    ).toISO();
    const seats = new Map();
    for (const { row, session } of active) {
        if (seats.has(session.seatNumber)) return { ...result, dive: null, seats: [], unavailable: true };
        seats.set(session.seatNumber, { seatNumber: session.seatNumber, name: firstNameOnly(row) });
    }
    result.seats = [...seats.values()].sort((a, b) => a.seatNumber - b.seatNumber);
    return result;
}

module.exports = { buildSeatingChart };
