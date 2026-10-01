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

## Tablet experience and staff status (1.1.0)

The homepage opens the seating chart in a full-screen dialog. Returning home
does not reload the homepage. Closing the chart destroys its roster and pending
requests; each opening fetches a fresh roster. Older browsers without dialog
support keep the original full-page navigation.

Session cleanup uses the API's server timestamp and scheduled end, subtracting
request time. It closes the embedded chart, removes the welcome acknowledgement,
clears displayed guest names, and resets comfort settings when a booking ends,
changes, or disappears from a successful schedule response. An expiry record
containing only the session identifier and deadline survives refreshes. Failed
requests do not erase that deadline. Sleeping browsers clean up on resuming;
browser timers cannot guarantee execution while Android suspends the app.
Fully Kiosk's existing JavaScript bridge is used to focus the home tab if available.
External tabs, external app sessions, and third-party cookies are not cleared.

Open `/staff.html` on the Azure site. Enter `KIOSK_STAFF_KEY` if configured;
otherwise use the existing `KIOSK_API_KEY`. The key stays in page memory, is sent
only in a request header, and is removed by **Lock dashboard**. The dashboard
does not show patient names. A separate staff key can be
configured without changing tablet credentials.

Homepages send a bounded status check-in every 60 seconds. The dashboard shows
56 configured seats, version, last reported schedule-sync state and view.
After 150 seconds without a check-in, it says **No recent check-in**, which is
not proof the device is offline. Old app versions that never send check-ins
remain **Not yet seen**. Reload the tablet homepage once to enable this release.
Records are in memory and reset on restart; this dashboard is intended for the
current single-instance deployment. Multiple server instances require a shared
status store before using these reports operationally.

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

## Games, Help, and staff announcements (1.2.0)

The former Wordle tile is now Games Hub. Its popup offers the original external Wordle plus Matching Pairs, Word Scramble, Number Slide, Mini Sudoku, Sequence Memory, Number Sense, and Color Focus. There is no reading library. The seven local games are cached after a successful download; Wordle still requires internet. Only games.html, games.js, games.css, games-core.js, and game-words.js are cached. Home, patient data, and APIs are never cached by this worker. Guest changes and the known dive deadline close the popup.

Help sits beside the moon icon and includes navigation and headphone guidance. Routine requests highlight the chamber/seat on staff.html. Staff can acknowledge and complete them. Requests expire with the assignment, or after 15 minutes between dives. A database lookup validates the current seat context before accepting a request. Failed delivery is shown explicitly. Urgent assistance should use the chamber's usual method.

Sign into staff.html with the existing KIOSK_API_KEY to send announcements and acknowledge help requests. No tablet links or Azure settings need changing. Anyone who knows that shared key can use staff controls. An optional KIOSK_STAFF_KEY takes precedence if configured later. Without either key, staff controls remain disabled. Keep the staff dashboard open and attended.

Announcements target all 14 seats of the selected chamber, including between dives, and expire after two minutes or at the earliest assigned dive end. The dashboard counts tablets that displayed the message, not human reads. Backgrounded apps, external Wordle, sleeping tablets, or disconnected devices may not receive announcements.

Communication state contains seat numbers, opaque booking tokens, staff message text and timestamps, never patient names. It is stored outside public web files at /home/data/oxypeak-tablet-data/communications.json on Azure (or the OS temporary directory locally). KIOSK_STATE_FILE can override this with a private persistent path. Acknowledgements are returned only after saving. This file store is for the current single-instance service; use a shared transactional store before scaling to multiple instances. Tablet check-ins remain process-local and reset on restart.

## Games Hub (1.3.0)

The eight game choices fit a landscape tablet. Word Scramble contains 2,478 unique curated words and remembers its shuffled word deck locally across visits, avoiding repeats until the entire deck is exhausted. It does not record player names. Mini Sudoku generates uniquely solvable 4×4 puzzles; Number Slide starts with solvable boards. Number Sense has three difficulty levels and Color Focus has ten-round sets, without time pressure. Sequence Memory uses both shapes and labels. Help remains only on the main tablet screen, beside the moon icon.

## Tablet polish and between-dive assistance (1.4.0)

The seating chart is a compact chamber map with the same physical seat order and current-seat highlight. Matching Pairs uses illustrated OxyPeak themes, including Dr. Mo, HBOT and Oxygen. Sudoku offers a 4×4 starter and Easy/Medium/Hard classic 9×9 uniquely solvable boards. Sequence Memory starts at 3/5/7 steps, speeds up by difficulty, and requires reverse recall on Hard. Color Focus adds six-color timed rounds (7 seconds Medium, 4 seconds Hard) and switches between ink and word rules on Hard. Number Slide accepts taps or directional swipes toward a visible empty space.

An available seat receives a server-issued daily idle context so help and announcements work without a scheduled dive. Idle requests expire after 15 minutes. Announcements target every seat, using its current appointment or idle context, and expire after two minutes. A new booking changes the context and clears the prior request on the next schedule sync. A scheduling outage does not masquerade as an empty chamber; staff actions fail explicitly if the current context cannot be checked. The staff dashboard uses the existing key and displays actual tablet receipt counts.

## Staff dashboard and matching variety (1.5.0)

The dashboard prioritizes waiting requests, showing guest name, suite, seat and wait time above the chamber overview. Acknowledged requests move below waiting guests. Summary counts separate waiting, being helped, reporting and connection issues; per-tablet technical details expand on demand. Guest names are fetched from Dion's current seat assignment for active requests only. The request token must still match that assignment; reassignment cancels the stale request before returning a name. A scheduling failure keeps the request visible as Name unavailable. Names are never persisted in the request queue or heartbeat records, and the authenticated dashboard response is not cached.

Matching Pairs rotates 64 themes in eight-pair rounds, saving the remaining deck locally. Every theme appears once across eight rounds before the deck reshuffles. Themes include OxyPeak care, wellbeing, nature and friendly animals.

## Guest clarity and release tracking (1.6.0)

All 64 matching themes now relate to OxyPeak, Dr. Mo, HBOT, the chamber experience or the OxyPeak tablet; generic animal/nature cards have been removed. The deck storage key changes so a prior deck cannot mix old and new themes. Guest help prioritizes a large request button and readable sent/acknowledged/completed messages, with optional guidance collapsed. The chamber seating map uses the available landscape viewport.

The staff dashboard displays the current version and release.json notes, with compact expandable suite rows. Tablet version counts describe the latest received heartbeat, not proof that every device is online. Unknown versions remain explicit, and operational check-ins still reset with a server restart. Settings shows the actual loaded tablet-experience.js version and compares it with the server heartbeat response. A failed check displays Update check unavailable. Reload the homepage after the guest finishes to receive a new release; no active guest is forcibly reloaded. Reopen Games Hub to load the updated offline cache. Keep package.json, lockfile, release.json, tablet script version, script query version and offline cache version aligned; the release test checks this contract.

## IA daily briefing (1.7.0)

The current release notes are a cumulative IA briefing for September 30, covering seating and dive cleanup, navigation, all eight games and difficulty options, guest Help, staff requests and announcements, dashboard changes, and version tracking. Matching Pairs uses exactly Anthony's 20 requested labels, without an OxyPeak prefix. Eight-pair rounds exhaust the saved collection before reshuffling, including the partial-deck boundary, without duplicate themes in a round. Help directs guests to the volume buttons on the main screen.

## Background staff alerts (1.8.0)

After sign-in, the dashboard keeps polling while hidden and shows waiting requests in an alternating tab title and red favicon. Enable alerts unlocks Web Audio and requests desktop-notification permission from a user click; Test sound and Mute sound are available. Each new request gets a chime; waiting requests remind approximately every 30 seconds until acknowledged, completed, cancelled or expired. Desktop notifications contain only suite and seat, never names or keys. They close when the request stops waiting. Muting sound affects only this dashboard, not requests or other staff computers.

Hidden pages clear guest names from their DOM while continuing to check. Requests do not overlap; failures, snapshots older than 20 seconds, and server-scheduled expiry suppress reminders until a fresh successful check. Locking stops checks and alerts and closes notifications. Browser timers, OS notification settings, muted speakers and sleeping computers/tabs can still delay or suppress alerts; this is not a push service for closed tabs. Keep the staff dashboard awake, signed in and attended. Notification permission is controlled by each staff browser. A declined permission still permits tab indicators and enabled sound. The offline games worker never caches the staff script or API data.


## Dive chat (1.9.0)

The seating chart now offers one-to-one guest messaging. Tap Chat below an occupied seat, type up to 300 characters and Send. Unread badges appear on the sender's seat. Guests can block/unblock a seat or pause/resume their own chat. Staff can pause/resume each chamber in Guest chat on the staff dashboard; pausing clears that chamber's conversations. The seating chart receives messages every five seconds. The homepage also checks a count-only endpoint and displays an unread badge at the top; opening/reading a conversation updates server-side read markers. There are no outside-app notifications.

Every chat request checks Dion's active chamber roster. Conflicting rosters, empty seats, stale sender tokens, departed recipients and failed lookups reject access. Public participant IDs are separate from private sender tokens. Within one dive, stable patient identity (booking fallback), timeslot and start time preserve the conversation when an IA moves a guest. The private tablet token rotates on a seat change, while public conversation identity, blocks and read state follow the guest. The new-seat tablet can reopen the conversation; old-seat tokens are rejected. New guests and new dives never inherit it. Client views and drafts clear on hiding, timeout or the server-derived dive deadline, including offline.

Messages and blocks live only in this Node process, with a 500-message chamber limit and a 1.5-second per-sender rate limit. Messages are not logged, cached or written to disk/browser storage. They disappear at expiry, departure from the dive, staff pause or server restart. This design assumes the current single app instance; shared storage and coordination are required before scaling to multiple workers or instances. Staff pause preferences alone are saved atomically beside KIOSK_STATE_FILE (or /home/data on Azure), persist across restart, and remain paused until staff resume them.

The server rejects common English profanity, slurs, repeated-letter variants, common leetspeak and separated letters; it asks the guest to reword the message. This is a best-effort word filter, not comprehensive content moderation. Block and staff pause are available when a message slips through. Text is rendered literally, never as HTML.

Chat uses the existing trusted kiosk access model: the configured chamber/seat and shared tablet key identify the device. It does not establish a personal guest login or protect against an operator who has the shared key and deliberately changes a tablet's seat URL. No individual credentials or external moderation service were added.


## Between-dive testing (1.10.0)

When a successful schedule lookup confirms no active dive, all 14 seats appear as Unassigned and can exchange test messages. This room is separate from patient chat, expires after 30 minutes or the next scheduled start (whichever comes first), and is discarded when an actual dive appears. Schedule failures or conflicting active dives never enable test mode. Staff pause applies to both live and test chat. To test, use two different seat URLs in the same idle chamber, keep one on its homepage, and send from the other seating chart. The home Chat badge should update within about five seconds and clear after reading.

This release is not a HIPAA compliance certification. First names associated with treatment may remain PHI. Existing shared-key access and editable seat URLs require privacy/security review, along with staff identity/audit controls, authorized patient disclosures, and cloud business-associate agreements. Profanity filtering and temporary storage do not establish compliance.
