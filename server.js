const path = require('path');
const express = require('express');
const cors = require('cors');
const { DateTime } = require('luxon');
require('dotenv').config();
const { buildSeatingChart } = require('./src/seatingChart');
const { createTabletStatus } = require('./src/tabletStatus');
const { createCommunications, sessionToken, idleToken } = require('./src/communications');
const { createCommunicationRoutes } = require('./src/communicationRoutes');
const { normalizeSessionRow, serializeAppointment } = require('./src/kioskService');
const os = require('node:os');
const communications = createCommunications({ filePath:process.env.KIOSK_STATE_FILE || path.join(process.env.WEBSITE_SITE_NAME ? '/home/data' : os.tmpdir(), 'oxypeak-tablet-data', 'communications.json') });
function staffMessagingEnabled() { return Boolean(process.env.KIOSK_STAFF_KEY || API_KEY); }
function requireStaffControl(req,res,next) {
    if(!staffMessagingEnabled()) return res.status(503).json({error:'Staff access is not configured.'});
    if(req.get('x-kiosk-key')!==(process.env.KIOSK_STAFF_KEY || API_KEY)) return res.status(401).json({error:'Staff access required'});
    next();
}
const APP_VERSION = require('./package.json').version;
const tabletStatus = createTabletStatus({ version:APP_VERSION });

const {
    DEFAULT_DIVE_DURATION_MINUTES,
    DEFAULT_PRE_DIVE_DISPLAY_MINUTES,
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
const PRE_DIVE_DISPLAY_MINUTES = Number(process.env.KIOSK_PRE_DIVE_DISPLAY_MINUTES || DEFAULT_PRE_DIVE_DISPLAY_MINUTES);
const API_KEY = process.env.KIOSK_API_KEY || '';
const DEMO_MODE = process.env.KIOSK_DEMO_MODE === 'true';

app.use(cors({
    origin: process.env.KIOSK_ALLOWED_ORIGINS
        ? process.env.KIOSK_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
        : true
}));
app.use(express.json());
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store, private'); next(); });

app.post('/api/tablet/heartbeat', (req, res, next) => {
    if (!API_KEY && !DEMO_MODE) return res.status(503).json({ error:'Tablet authentication is not configured' });
    return requireKioskApiKey(req, res, next);
}, (req, res) => {
    if (!tabletStatus.record(req.body)) return res.status(400).json({ error:'Invalid tablet status' });
    res.json({ version:APP_VERSION });
});

app.get('/api/staff/tablets', async (req, res) => {
    const staffKey = process.env.KIOSK_STAFF_KEY || API_KEY;
    if (!staffKey) return res.status(503).json({ error:'Staff access is not configured' });
    if (req.get('x-kiosk-key') !== staffKey) return res.status(401).json({ error:'Enter the staff access key' });
    try {
        const snapshot=await communications.snapshot({includeTokens:true});
        snapshot.requests=(await Promise.all(snapshot.requests.map(async ({token,...request})=>{
            try {
                const appointment=await currentSeat(request);
                const current=sessionToken(appointment)||idleToken(request.chamber,request.seat);
                if(current!==token){await communications.reconcile(request.chamber,request.seat,current);return null;}
                return {...request,guestName:appointment?.patientName||null,nameStatus:appointment?'verified':'unassigned'};
            } catch (_) {return {...request,guestName:null,nameStatus:'unavailable'};}
        }))).filter(Boolean);
        res.json({ ...tabletStatus.snapshot(), release:require('./release.json'), messagingEnabled:staffMessagingEnabled(), ...snapshot });
    }
    catch (_) { res.status(503).json({error:'Staff request status is unavailable. Check tablets directly.'}); }
});

app.get(['/staff.html', '/staff-alerts.js', '/seat.html', '/tablet-session.js', '/tablet-experience.js', '/tablet-support.js', '/games.html', '/games.js', '/games.css', '/games-core.js', '/game-words.js', '/offline-worker.js'], (req, res) => {
    res.set('Cache-Control', 'no-store, private');
    res.set('Referrer-Policy', 'no-referrer');
    res.sendFile(path.join(__dirname, req.path));
});

function createDemoProvider() {
    return {
        name: 'demo',
        async fetchChamberSessions({ chamberName }) {
            const start = DateTime.now().setZone(TIME_ZONE).startOf('hour');
            return ['Alex', 'Sam', 'Jo', 'Mary Jane', 'Taylor', 'Chris'].map((name, index) => ({
                session_id: 'demo-active',
                first_name: name,
                chamber_name: chamberName,
                seat_number: index + 1,
                start_at: start.toISO(),
                duration_minutes: DIVE_DURATION_MINUTES,
                status: 'scheduled'
            }));
        },
        async fetchSeatSessions({ chamberName, seatNumber }) {
            const now = DateTime.now().setZone(TIME_ZONE);
            const start = now.startOf('hour');
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

async function currentSeat({chamber,seat}) {
    if(!provider) throw Error('Schedule unavailable');
    const chamberName=(process.env.KIOSK_CHAMBER_PREFIX || 'HBOT')+' '+chamber;
    const rows=await provider.fetchSeatSessions({chamberName,seatNumber:seat,...getSessionWindow()});
    return buildTabletSessionResponse(rows,{chamberName,seatNumber:seat,timeZone:TIME_ZONE,diveDurationMinutes:DIVE_DURATION_MINUTES,preDiveDisplayMinutes:PRE_DIVE_DISPLAY_MINUTES}).activeAppointment;
}
app.use(createCommunicationRoutes({
    store:communications,
    requireTablet(req,res,next) {
        if(!API_KEY && !DEMO_MODE) return res.status(503).json({error:'Tablet authentication is not configured'});
        return requireKioskApiKey(req,res,next);
    },
    staffEnabled:staffMessagingEnabled,
    requireStaff:requireStaffControl,
    currentSeat,
    async currentChamber(chamber) {
        if(!provider?.fetchChamberSessions)throw Error('Schedule unavailable');
        const chamberName=(process.env.KIOSK_CHAMBER_PREFIX || 'HBOT')+' '+chamber;
        const rows=await provider.fetchChamberSessions({chamberName,...getSessionWindow()});
        return Array.from({length:14},(_,i)=>{
            const seatNumber=i+1;
            const seatRows=rows.filter(row=>normalizeSessionRow(row,{chamberName,timeZone:TIME_ZONE})?.seatNumber===seatNumber);
            const active=buildTabletSessionResponse(seatRows,{chamberName,seatNumber,timeZone:TIME_ZONE,diveDurationMinutes:DIVE_DURATION_MINUTES,preDiveDisplayMinutes:PRE_DIVE_DISPLAY_MINUTES}).activeAppointment;
            return {seatNumber,token:sessionToken(active)||idleToken(chamber,seatNumber),endTime:active?.endTime};
        });
    }
}));

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
        const sessionWindow = getSessionWindow(now);
        const seatSessionRequest = {
            ...location,
            ...sessionWindow
        };
        const [rows, chamberRows] = await Promise.all([
            provider.fetchSeatSessions(seatSessionRequest),
            provider.fetchChamberSessions
                ? provider.fetchChamberSessions({
                    chamberName: location.chamberName,
                    ...sessionWindow
                })
                : provider.fetchSeatSessions(seatSessionRequest)
        ]);

        const payload = buildTabletSessionResponse(rows, {
            chamberName: location.chamberName,
            seatNumber: location.seatNumber,
            chamberRows,
            diveDurationMinutes: DIVE_DURATION_MINUTES,
            preDiveDisplayMinutes: PRE_DIVE_DISPLAY_MINUTES,
            timeZone: TIME_ZONE,
            now: now.toJSDate()
        });

        payload.sessionToken = sessionToken(payload.activeAppointment) || idleToken(location.chamberNumber, location.seatNumber);
        payload.staffMessagingEnabled = staffMessagingEnabled();
        try { await communications.reconcile(location.chamberNumber, location.seatNumber, payload.sessionToken); }
        catch (_) { payload.staffMessagingEnabled=false; }
        res.json(payload);
    } catch (error) {
        console.error('Tablet session lookup failed:', error);
        res.status(500).json({
            error: 'Unable to load tablet session',
            detail: process.env.NODE_ENV === 'production' ? undefined : error.message
        });
    }
});

app.get('/api/tablet/seating-chart', (req, res, next) => {
    res.set('Cache-Control', 'no-store, private');
    res.set('Pragma', 'no-cache');
    if (!API_KEY && !DEMO_MODE) return res.status(503).json({ error: 'Seating chart authentication is not configured' });
    return requireKioskApiKey(req, res, next);
}, async (req, res) => {
    let location;
    try {
        if (!/^(1|3|4|6)$/.test(String(req.query.chamber || ''))
            || !/^(?:[1-9]|1[0-4])$/.test(String(req.query.seat || ''))) {
            throw new Error('A valid chamber and seat are required');
        }
        location = getLocationFromQuery(req.query, {
            chamberPrefix: process.env.KIOSK_CHAMBER_PREFIX || 'HBOT'
        });
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
    if (!provider || !provider.fetchChamberSessions) {
        return res.status(503).json({ error: 'Seating chart is not configured' });
    }
    try {
        const rows = await provider.fetchChamberSessions({ ...location, ...getSessionWindow() });
        return res.json(buildSeatingChart(rows, {
            chamberName: location.chamberName,
            seatNumber: location.seatNumber,
            timeZone: TIME_ZONE,
            diveDurationMinutes: DIVE_DURATION_MINUTES
        }));
    } catch (error) {
        console.error('Seating chart lookup failed; code=%s', error.code || 'unknown');
        return res.status(500).json({ error: 'Unable to load seating chart' });
    }
});

app.get('/seating-chart.html', (req, res) => {
    res.set('Cache-Control', 'no-store, private');
    res.set('Referrer-Policy', 'no-referrer');
    res.sendFile(path.join(__dirname, 'seating-chart.html'));
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
