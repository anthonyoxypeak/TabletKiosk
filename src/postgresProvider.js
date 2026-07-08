const { Pool } = require('pg');

const DEFAULT_STATUS_FILTER = ['scheduled', 'active', 'in_progress'];

const DEFAULT_TABLET_SESSION_QUERY = `
    SELECT
        su.id AS session_id,
        p.first_name,
        p.last_name,
        p.id AS patient_id,
        su.status,
        su.sequence_number,
        c.name AS chamber_name,
        s.seat_number,
        ts.date::text AS session_date,
        ts.start_time::text AS start_time,
        $6::int AS duration_minutes
    FROM scheduling_sessionunit su
    JOIN scheduling_package pkg ON su.package_id = pkg.id
    JOIN scheduling_patient p ON pkg.patient_id = p.id
    JOIN scheduling_timeslot ts ON su.timeslot_id = ts.id
    JOIN scheduling_chamber c ON ts.chamber_id = c.id
    JOIN scheduling_seat s ON su.seat_id = s.id
    WHERE c.name = $1
      AND s.seat_number = $2
      AND ts.date BETWEEN $3::date AND $4::date
      AND su.status = ANY($5::text[])
    ORDER BY ts.date ASC, ts.start_time ASC
`;

function hasPostgresConfig(env = process.env) {
    return Boolean(
        env.DATABASE_URL ||
        env.POSTGRES_CONNECTION_STRING ||
        env.PGHOST ||
        env.DB_HOST
    );
}

function buildPoolConfig(env = process.env) {
    const connectionString = env.DATABASE_URL || env.POSTGRES_CONNECTION_STRING;
    const sslDisabled = (env.PGSSLMODE || env.POSTGRES_SSLMODE || '').toLowerCase() === 'disable';
    const ssl = sslDisabled ? false : { rejectUnauthorized: false };

    if (connectionString) {
        return { connectionString, ssl };
    }

    return {
        host: env.PGHOST || env.DB_HOST,
        database: env.PGDATABASE || env.DB_NAME || 'hbot_scheduling',
        user: env.PGUSER || env.DB_USER || 'hbotadmin',
        password: env.PGPASSWORD || env.DB_PASSWORD,
        port: Number(env.PGPORT || env.DB_PORT || 5432),
        ssl
    };
}

function createPostgresProvider(options = {}) {
    const env = options.env || process.env;
    const pool = options.pool || new Pool(buildPoolConfig(env));
    const query = options.query || env.KIOSK_TABLET_SESSION_QUERY || DEFAULT_TABLET_SESSION_QUERY;
    const statusFilter = (env.KIOSK_STATUS_FILTER || DEFAULT_STATUS_FILTER.join(','))
        .split(',')
        .map(status => status.trim().toLowerCase())
        .filter(Boolean);
    const diveDurationMinutes = Number(env.KIOSK_DIVE_DURATION_MINUTES || options.diveDurationMinutes || 120);

    async function fetchSeatSessions({ chamberName, seatNumber, startDate, endDate }) {
        const result = await pool.query(query, [
            chamberName,
            seatNumber,
            startDate,
            endDate,
            statusFilter,
            diveDurationMinutes
        ]);
        return result.rows;
    }

    async function close() {
        await pool.end();
    }

    return {
        name: 'postgres',
        fetchSeatSessions,
        close
    };
}

module.exports = {
    DEFAULT_TABLET_SESSION_QUERY,
    buildPoolConfig,
    createPostgresProvider,
    hasPostgresConfig
};
