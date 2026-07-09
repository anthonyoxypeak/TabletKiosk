# OxyPeak Tablet Kiosk Setup

This repo now runs the tablet display from OxyPeak's scheduling database instead of Dr. Chrono.

## What The Tablet Calls

Tablet URL:

```text
https://YOUR-KIOSK-APP/seat.html?chamber=1&seat=3
```

Optional secure/shared-key URL:

```text
https://YOUR-KIOSK-APP/seat.html?chamber=1&seat=3&key=LONG_RANDOM_KEY
```

Optional "show next patient" mode:

```text
https://YOUR-KIOSK-APP/seat.html?chamber=1&seat=3&showNext=1
```

Default behavior is privacy-first: the tablet shows the patient starting 15 minutes before the scheduled dive, keeps them visible through the 2-hour dive window, then returns to `Available` at the scheduled end.

## API Endpoint

```text
GET /api/tablet/session?chamber=1&seat=3
```

Response shape:

```json
{
  "state": "active",
  "chamberName": "HBOT 1",
  "seatNumber": 3,
  "preDiveDisplayMinutes": 15,
  "activeAppointment": {
    "patientName": "Jane S.",
    "startTime": "2026-07-06T08:00:00.000-04:00",
    "endTime": "2026-07-06T10:00:00.000-04:00",
    "seat": 3
  },
  "nextAppointment": null
}
```

## Azure App Service Settings

Set these in the kiosk App Service:

```text
KIOSK_TIME_ZONE=America/New_York
KIOSK_DIVE_DURATION_MINUTES=120
KIOSK_PRE_DIVE_DISPLAY_MINUTES=15
KIOSK_CHAMBER_PREFIX=HBOT
KIOSK_API_KEY=long-random-value
KIOSK_ALLOWED_ORIGINS=https://anthonyoxypeak.github.io,https://YOUR-KIOSK-APP.azurewebsites.net
```

Set Postgres either as a connection string:

```text
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/hbot_scheduling?sslmode=require
```

Or as individual variables:

```text
PGHOST=psql-hbot-prod.postgres.database.azure.com
PGDATABASE=hbot_scheduling
PGUSER=hbotadmin
PGPASSWORD=...
PGPORT=5432
```

Dion's guide says the production database is Azure PostgreSQL Flexible Server with private VNet access, so the kiosk App Service must have outbound VNet integration enabled.

## Database Join Used

The default query reads Dion's Django tables:

```sql
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
ORDER BY ts.date ASC, ts.start_time ASC;
```

Parameters:

```text
$1 chamber name, e.g. HBOT 1
$2 seat number
$3 start date
$4 end date
$5 allowed statuses
$6 dive duration minutes
```

## Local Demo

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000/seat.html?chamber=1&seat=1
```

Demo mode shows a fake active patient and does not connect to production.
