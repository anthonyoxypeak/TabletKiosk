# OxyPeak Tablet Kiosk

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
