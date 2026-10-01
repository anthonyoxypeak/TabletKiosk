# Release history

## 1.11.0 — October 1, 2026

- SECURITY: Microsoft sign-in for approved staff accounts when enabled by IT. Tablet guests do not need Microsoft accounts.
- SECURITY: Public downloads are limited to tablet pages and game assets. API access fails closed without tablet authentication; unapproved website origins and URL-based API keys are rejected.
- PRIVACY: Future guest names are no longer sent to tablets. Tablet page keys are removed from the visible address; no-referrer protection prevents forwarding the page URL to external sites.
- SECURITY: Database certificates are verified. Expired announcements and help requests are removed from active server storage. Staff access and actions produce security events without message text or patient names.
- NEW: Chat follows a guest to their new seat when an IA moves them within the same dive in Dionâ€™s app. The old tabletâ€™s chat session is revoked; the new seatâ€™s tablet can reopen the conversation.
- NEW: A Chat button at the top of the tablet homepage shows the unread-message count, without names or message previews. Read messages clear the badge. Open the seating chart to read and reply.
- NEW: Between dives, all 14 seats show Unassigned with Chat buttons for testing. These separate test conversations expire after 30 minutes or when the next dive starts. Failed schedule checks do not enable test mode.
- NEW October 1: Tap Chat on an occupied seating-chart seat to message that guest during the same dive. Includes unread badges, an English profanity filter, blocking a seat and pausing your chat. Staff can pause or resume each chamber from the dashboard.
- Chats are temporary: only the current two seat assignments can retrieve a conversation. Old conversations clear at dive end, seat reassignment, staff pause or server restart. Messages are never saved in browser storage. Wi-Fi is required; delivery may wait while the other guest is outside the seating chart. The filter catches common profanity and obfuscations but cannot catch every offensive message.
- Louder staff help alert: six sustained alternating tones replace the quiet chime. Test sound previews the new alert. Mute and 30-second reminders still work; overlapping sounds are prevented.
- Todayâ€™s IA briefing â€” September 30, 2026. This release brings together all of todayâ€™s tablet updates.
- NEW: Staff alerts keep checking while the dashboard is in a background tab. Click Enable alerts after signing in to enable a chime and allow desktop notifications. A blinking tab title and red icon identify waiting requests; sound repeats about every 30 seconds until acknowledgment. Test sound and Mute controls are included. Desktop alerts show only suite and seat, not guest names. Alerts pause if the connection cannot be confirmed. Keep the computer awake and the dashboard tab out of browser sleeping mode.
- Seating Chart replaces CogniFit. It uses Dionâ€™s current dive assignments, shows first names or nicknames, and highlights the guestâ€™s own seat.
- The chart matches the chamber layout: seats 14â€“8 across the top, seats 1â€“7 below, with the IA station and center aisle. It now fills the tablet screen with larger names and chair icons.
- The chart refreshes every 5 seconds, clears old names when the scheduled dive ends, and checks for the next dive. Returning from sleep fetches the current roster; unavailable or stale data does not leave old names on screen.
- Games Hub replaces the Wordle tile. Its overview offers the original Wordle plus Matching Pairs, Word Scramble, Number Slide, Sudoku, Sequence Memory, Number Sense and Color Focus. Reading was removed.
- Matching Pairs now uses exactly these 20 labels: Dr. Mo, HBOT, Oxygen, Hyperbaric, Hypoxic, Brain, Brain Gym, Longevity, Veterans, Focus, Aging, Healthy Aging, Therapy, The Villages, Community, Life Span, Chamber 1, Chamber 3, Chamber 4 and Chamber 6. No repeated OxyPeak prefix. Eight pairs per round rotate through the full collection.
- Word Scramble has 2,478 words, category hints, letter hints, reshuffling and reveal controls. Its saved deck avoids repeating a word until the collection is exhausted.
- Sudoku offers a 4Ã—4 Starter and Easy, Medium and Hard 9Ã—9 puzzles, each with one solution. Guests can select numbers, erase entries and check their work.
- Sequence Memory offers Easy (3 starting steps), Medium (5) and Hard (7 in reverse order), with faster playback at higher difficulty and an extra step after each successful round.
- Color Focus offers untimed Easy, 7-second Medium and 4-second Hard rounds. Hard alternates between reading the word and matching its ink color; higher levels use six colors.
- Number Sense offers Gentle, Balanced and Stretch arithmetic challenges. Number Slide has solvable boards, a clearly marked empty space and highlighted movable tiles; guests can tap or swipe, with no typing required.
- Games and the seating chart open over the homepage with Back to home navigation. The seven built-in games are saved for Wi-Fi interruptions after loading; the original Wordle still needs internet. Guest names and schedules are not saved with games.
- At a booking change or scheduled dive end, the app clears the previous guest, closes games or the chart, and resets the welcome screen and comfort settings. A sleeping tablet performs cleanup when it wakes.
- Help is beside the moon on the main screen. Guests see a large Request staff help button and clear sent, seen-by-staff, completed or cancelled messages. Optional instructions cover headphones, home navigation and dimming. Volume instructions now say to tap the volume buttons on the main screen.
- Help requests work during and between dives. The dashboard shows the current guest name, suite, seat and wait time. IAs can Acknowledge and Complete requests; acknowledged requests move below waiting guests. A changed assignment clears the old request. Between-dive requests expire after 15 minutes.
- Staff can send an announcement to one chamber, including between dives, with a headphones reminder preset. It targets all 14 seats, counts tablets that displayed it, and can be ended early. Announcements expire after two minutes or the dive ends; sleeping tablets and external apps may miss them.
- The staff dashboard now prioritizes waiting guests and uses four compact, expandable suite rows. The confusing Tablets reporting and Check connection tiles were removed. Individual details explain recent contact, unavailable schedules and last contact time.
- Version tracking shows the current release, these update notes, and tablets last seen on current, older or unknown versions. Tablets send their loaded version every minute while the homepage runs. Missing contact does not prove a tablet is offline; status records restart when the server restarts.
- The bottom of the tabletâ€™s Settings gear shows its loaded version, whether it is up to date, or whether an update check is unavailable. Reload the homepage when the guest is finished, then reopen Games Hub. Updates do not forcibly interrupt an active guest.
- Text cleanup: the home tile reads GAMES / Games Hub. The offline-download explanations, First names and nicknames only, and Updates automatically captions were removed from the guest-facing screens.
- IA access: use the existing staff dashboard sign-in. Keep the dashboard open and attended for requests. The Help button is for routine assistance; urgent needs still require getting staff attention directly.

## 1.12.0 — October 1, 2026

- Four new brain games: Word Search, Pattern Recall, Number Trail and Lights Out—with Easy, Medium and Hard options.
- A steadier tablet toolbar: background checks no longer flash “Checking” or blink the chat badge.
- A simpler staff dashboard: Guest assistance, Tablets & updates, and What’s new each have their own place.
- Help requests come first, with guest names, suite and seat. Announcements are beside the queue; chat controls are tucked below.
- Shorter release notes and smoother dashboard updates. Microsoft staff sign-in and existing tablet links continue to work.
