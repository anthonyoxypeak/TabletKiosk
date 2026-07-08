const path = require('path');
const express = require('express');
const cors = require('cors');
const { DateTime } = require('luxon');
require('dotenv').config();

const {
    DEFAULT_DIVE_DURATION_MINUTES,
    DEFAULT_TIME_ZONE,
    buildTabletSessionResponse,
    getLocationFromQuery
} = require('./src/kioskService');
const {
    createPostgresProvider,
    hasPostgresConfig
} = require('./src/postgresProvider');

const app = express();
const PORT = process.env.PORT || 3000;
const TIME_ZONE = process.env.KIOSK_TIME_ZONE || DEFAULT_TIME_ZONE;
const DIVE_DURATION_MINUTES = Number(process.env.KIOSK_DIVE_DURATION_MINUTES || DEFAULT_DIVE_DURATION_MINUTES);
const API_KEY = process.env.KIOSK_API_KEY || '';
const DEMO_MODE = process.env.KIOSK_DEMO_MODE === 'true';

app.use(cors({
    origin: process.env.KIOSK_ALLOWED_ORIGINS
        ? process.env.KIOSK_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
        : true
}));
app.use(express.json());

function createDemoProvider() {
    return {
        name: 'demo',
        async fetchSeatSessions({ chamberName, seatNumber }) {
            const now = DateTime.now().setZone(TIME_ZONE);
            const start = now.minus({ minutes: 18 });
            const date = start.toISODate();
            const startTime = start.toFormat('HH:mm:ss');
            return [{
                session_id: 'demo-active',
                first_name: 'Demo',
                last_name: 'Patient',
                status: 'scheduled',
                chamber_name: chamberName,
                seat_number: seatNumber,
                session_date: date,
                start_time: startTime,
                duration_minutes: DIVE_DURATION_MINUTES
            }];
        }
    };
}

const provider = DEMO_MODE
    ? createDemoProvider()
    : (hasPostgresConfig() ? createPostgresProvider({ diveDurationMinutes: DIVE_DURATION_MINUTES }) : null);

function requireKioskApiKey(req, res, next) {
    if (!API_KEY) return next();
    const provided = req.get('x-kiosk-key') || req.query.key;
    if (provided === API_KEY) return next();
    return res.status(401).json({ error: 'Invalid or missing kiosk API key' });
}

function getSessionWindow(now = DateTime.now().setZone(TIME_ZONE)) {
    return {
        startDate: now.minus({ days: 1 }).toISODate(),
        endDate: now.plus({ days: 1 }).toISODate()
    };
}

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'oxypeak-tablet-kiosk',
        provider: provider ? provider.name : 'not-configured',
        timeZone: TIME_ZONE,
        demoMode: DEMO_MODE,
        apiKeyEnabled: Boolean(API_KEY)
    });
});

app.get(['/api/tablet/session', '/api/seat-session'], requireKioskApiKey, async (req, res) => {
    if (!provider) {
        return res.status(503).json({
            error: 'Tablet API is not configured',
            detail: 'Set DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD on the Azure App Service.'
        });
    }

    let location;
    try {
        location = getLocationFromQuery(req.query, {
            chamberPrefix: process.env.KIOSK_CHAMBER_PREFIX || 'HBOT'
        });
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const now = DateTime.now().setZone(TIME_ZONE);
        const rows = await provider.fetchSeatSessions({
            ...location,
            ...getSessionWindow(now)
        });

        const payload = buildTabletSessionResponse(rows, {
            chamberName: location.chamberName,
            seatNumber: location.seatNumber,
            diveDurationMinutes: DIVE_DURATION_MINUTES,
            timeZone: TIME_ZONE,
            now: now.toJSDate()
        });

        res.json(payload);
    } catch (error) {
        console.error('Tablet session lookup failed:', error);
        res.status(500).json({
            error: 'Unable to load tablet session',
            detail: process.env.NODE_ENV === 'production' ? undefined : error.message
        });
    }
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'seat.html'));
});

if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`OxyPeak tablet kiosk API running on port ${PORT}`);
        if (!provider) {
            console.warn('No PostgreSQL configuration found. Set KIOSK_DEMO_MODE=true for local demo data or configure DATABASE_URL.');
        }
    });

    async function shutdown() {
        if (provider && provider.close) {
            await provider.close();
        }
        server.close(() => process.exit(0));
    }

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

module.exports = app;
