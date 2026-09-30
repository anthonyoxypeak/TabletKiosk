# OxyPeak Tablet Kiosk

## Seating chart

The Seating Chart button uses the same server-side Dion PostgreSQL connection as
the tablet home screen. It shows preferred names (or first names) and assigned
seats for the tablet's chamber and the currently scheduled dive, and highlights
the tablet's configured seat. Last names and patient IDs are not returned by the
chart endpoint. Conflicting timeslots or duplicate seat assignments show an
unavailable message instead of a potentially incorrect roster.

The chart refreshes every 15 seconds and clears the roster at the scheduled dive
end, immediately checking for the next dive. It also clears names on a failed
refresh, on leaving the page, or if the last response is over 25 seconds old.
Returning from the background fetches fresh data. Timing uses the server's
schedule and configured dive duration (120 minutes by default), rather than the
tablet clock; this is not a signal from the physical chamber equipment.

`GET /api/tablet/seating-chart?chamber=3&seat=7` requires the existing kiosk key.
No new database credentials or production configuration are required. Tests use
synthetic bookings; live health verification alone does not verify patient rows.

Tablet display for OxyPeak HBOT chambers.

The tablets call this app, and this app reads Dion's scheduling database through a server-side PostgreSQL connection. The browser page never stores database credentials or Dr. Chrono OAuth tokens.

## Local Demo

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000/seat.html?chamber=1&seat=1
```

## Production

See [docs/TABLET_KIOSK_SETUP.md](docs/TABLET_KIOSK_SETUP.md).

Main endpoint:

```text
GET /api/tablet/session?chamber=1&seat=1
```

The tablet shows a patient starting 15 minutes before the scheduled dive, keeps them visible through the 2-hour dive window, then returns to `Available` at the scheduled end. Add `showNext=1` to the tablet URL only if you explicitly want later upcoming patients shown before their privacy window starts.
