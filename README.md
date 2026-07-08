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

The tablet only shows a patient while their dive is active. Add `showNext=1` to the tablet URL only if you explicitly want upcoming patients shown before the active window starts.
