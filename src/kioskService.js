const { DateTime } = require('luxon');

const DEFAULT_TIME_ZONE = 'America/New_York';
const DEFAULT_DIVE_DURATION_MINUTES = 120;
const DEFAULT_PRE_DIVE_DISPLAY_MINUTES = 15;
const DEFAULT_CHAMBER_PREFIX = 'HBOT';

const ACTIVE_STATUSES = new Set(['scheduled', 'active', 'in_progress']);

function resolveChamberName(value, prefix = DEFAULT_CHAMBER_PREFIX) {
    const raw = String(value || '').trim();
    if (!raw) return `${prefix} 1`;

    const numberOnlyMatch = raw.match(/^(\d+)$/);
    if (numberOnlyMatch) return `${prefix} ${numberOnlyMatch[1]}`;

    if (/^hbot\s+suite\s+\d+$/i.test(raw)) {
        return raw.replace(/hbot\s+suite/i, prefix).replace(/\s+/g, ' ').trim();
    }
    if (/^suite\s+\d+$/i.test(raw)) {
        return raw.replace(/suite/i, prefix).replace(/\s+/g, ' ').trim();
    }
    return raw.replace(/\s+/g, ' ');
}

function chamberNumberFromName(chamberName) {
    const match = String(chamberName || '').match(/\d+/);
    return match ? Number(match[0]) : null;
}

function parseSeatNumber(value) {
    const seat = Number.parseInt(value, 10);
    if (!Number.isInteger(seat) || seat < 1 || seat > 99) {
        throw new Error('Seat must be a number between 1 and 99');
    }
    return seat;
}

function getLocationFromQuery(query, options = {}) {
    const chamberName = resolveChamberName(query.chamber || query.chamberName, options.chamberPrefix);
    const seatNumber = parseSeatNumber(query.seat || query.seatNumber);
    return {
        chamberName,
        chamberNumber: chamberNumberFromName(chamberName),
        seatNumber
    };
}

function dateText(value, timeZone = DEFAULT_TIME_ZONE) {
    if (value instanceof Date) {
        return DateTime.fromJSDate(value).setZone(timeZone).toISODate();
    }
    return String(value || '').slice(0, 10);
}

function timeText(value) {
    if (value instanceof Date) {
        return DateTime.fromJSDate(value).toFormat('HH:mm:ss');
    }
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (!match) return '';
    return match[1].length === 5 ? `${match[1]}:00` : match[1];
}

function dateTimeFromParts(dateValue, timeValue, timeZone = DEFAULT_TIME_ZONE) {
    const date = dateText(dateValue, timeZone);
    const time = timeText(timeValue);
    if (!date || !time) return null;
    const dt = DateTime.fromISO(`${date}T${time}`, { zone: timeZone });
    return dt.isValid ? dt : null;
}

function dateTimeFromValue(value, timeZone = DEFAULT_TIME_ZONE) {
    if (!value) return null;
    if (value instanceof Date) {
        return DateTime.fromJSDate(value).setZone(timeZone);
    }
    const raw = String(value).trim();
    const dt = DateTime.fromISO(raw.includes('T') ? raw : raw.replace(' ', 'T'), { zone: timeZone });
    return dt.isValid ? dt : null;
}

function pick(row, keys) {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
            return row[key];
        }
    }
    return null;
}

function formatPatientDisplayName(row) {
    const explicit = pick(row, ['patient_display_name', 'patientDisplayName', 'patient_name', 'patientName']);
    if (explicit) {
        const parts = String(explicit).trim().split(/\s+/);
        if (parts.length <= 1) return parts[0] || 'Patient';
        return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
    }

    const firstName = pick(row, ['first_name', 'firstName']);
    const lastName = pick(row, ['last_name', 'lastName']);
    if (firstName && lastName) return `${firstName} ${String(lastName).charAt(0)}.`;
    if (firstName) return String(firstName);
    return 'Patient';
}

function normalizeSessionRow(row, options = {}) {
    const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
    const durationMinutes = Number(
        pick(row, ['duration_minutes', 'durationMinutes']) || options.diveDurationMinutes || DEFAULT_DIVE_DURATION_MINUTES
    );

    let start = dateTimeFromValue(pick(row, ['start_at', 'startAt', 'scheduled_time', 'scheduledTime']), timeZone);
    if (!start) {
        start = dateTimeFromParts(
            pick(row, ['session_date', 'sessionDate', 'date']),
            pick(row, ['start_time', 'startTime']),
            timeZone
        );
    }

    if (!start) return null;

    const explicitEnd = dateTimeFromValue(pick(row, ['end_at', 'endAt', 'end_time', 'endTime']), timeZone);
    const end = explicitEnd || start.plus({ minutes: durationMinutes || DEFAULT_DIVE_DURATION_MINUTES });

    const status = String(pick(row, ['status']) || 'scheduled').toLowerCase();
    return {
        id: pick(row, ['session_id', 'sessionId', 'id']),
        patientName: formatPatientDisplayName(row),
        chamberName: pick(row, ['chamber_name', 'chamberName', 'chamber']) || options.chamberName,
        chamberNumber: chamberNumberFromName(pick(row, ['chamber_name', 'chamberName', 'chamber']) || options.chamberName),
        seatNumber: Number(pick(row, ['seat_number', 'seatNumber', 'seat']) || options.seatNumber),
        status,
        start,
        end,
        durationMinutes: durationMinutes || DEFAULT_DIVE_DURATION_MINUTES,
        sequenceNumber: pick(row, ['sequence_number', 'sequenceNumber'])
    };
}

function serializeAppointment(session) {
    if (!session) return null;
    return {
        id: session.id,
        patientName: session.patientName,
        patient_name: session.patientName,
        chamber: session.chamberName,
        chamberName: session.chamberName,
        chamberNumber: session.chamberNumber,
        seat: session.seatNumber,
        seatNumber: session.seatNumber,
        status: session.status,
        startTime: session.start.toISO(),
        start_time: session.start.toISO(),
        endTime: session.end.toISO(),
        end_time: session.end.toISO(),
        durationMinutes: session.durationMinutes,
        duration_minutes: session.durationMinutes,
        sequenceNumber: session.sequenceNumber
    };
}

function buildTabletSessionResponse(rows, options = {}) {
    const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
    const preDiveDisplayMinutes = Number(
        options.preDiveDisplayMinutes ?? DEFAULT_PRE_DIVE_DISPLAY_MINUTES
    );
    const now = options.now
        ? DateTime.fromJSDate(options.now instanceof Date ? options.now : new Date(options.now)).setZone(timeZone)
        : DateTime.now().setZone(timeZone);

    const sessions = rows
        .map(row => normalizeSessionRow(row, options))
        .filter(Boolean)
        .filter(session => ACTIVE_STATUSES.has(session.status))
        .sort((a, b) => a.start.toMillis() - b.start.toMillis());

    const active = sessions.find(session => {
        const displayStart = session.start.minus({ minutes: preDiveDisplayMinutes });
        return now >= displayStart && now < session.end;
    }) || null;
    const next = sessions.find(session => session !== active && session.start > now) || null;
    const state = active ? 'active' : 'available';

    const activeAppointment = serializeAppointment(active);
    const nextAppointment = serializeAppointment(next);

    return {
        state,
        fetchedAt: now.toISO(),
        facilityTimeZone: timeZone,
        chamber: options.chamberName,
        chamberName: options.chamberName,
        chamberNumber: chamberNumberFromName(options.chamberName),
        seat: options.seatNumber,
        seatNumber: options.seatNumber,
        preDiveDisplayMinutes,
        pre_dive_display_minutes: preDiveDisplayMinutes,
        activeAppointment,
        active_appointment: activeAppointment,
        nextAppointment,
        next_appointment: nextAppointment
    };
}

module.exports = {
    DEFAULT_DIVE_DURATION_MINUTES,
    DEFAULT_PRE_DIVE_DISPLAY_MINUTES,
    DEFAULT_TIME_ZONE,
    buildTabletSessionResponse,
    chamberNumberFromName,
    dateTimeFromParts,
    formatPatientDisplayName,
    getLocationFromQuery,
    normalizeSessionRow,
    parseSeatNumber,
    resolveChamberName,
    serializeAppointment
};
