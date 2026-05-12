# corgi-tracker

A small SPA for tracking your corgi's daily lifecycle — naps, outside trips, meals, pees, and poops — with charts to spot metabolism patterns. Builds on the same stack as [`tanstack-spa`](../tanstack-spa) (TanStack Router + Query + DB, shadcn UI) and adds:

- **localStorage persistence** — the mock "API" in `src/db.ts` reads/writes JSON to `localStorage`, so data survives reload.
- **Singleton collection** — the corgi profile is a one-row TanStack DB collection (id = 1) to show that the pattern works for single records too.
- **Charts** — uses shadcn's `chart` component wrapping recharts (`BarChart`, `LineChart`) for daily nap and poop trends.

## What to read first

1. `src/db.ts` — both collections and the localStorage mock API.
2. `src/routes/index.tsx` — chart wiring + the in-memory day-bucket aggregation.
3. `src/routes/log.tsx` — optimistic insert/update/delete via collection mutations, including an "open nap" state.

## Run

```sh
bun install        # from repo root, once
bun run dev --filter=example-corgi-tracker
```

Then visit http://localhost:5175.

## Routes

- `/` — Dashboard: today's stat cards + a 7-day "rest vs. activity" bar chart (nap minutes vs. outside minutes) and a 7-day line chart of bathroom + meal counts.
- `/log` — Quick-entry buttons for live events (start/end nap, start/end outside, log poop / pee / meal) plus an "Add entry" dialog for retroactive logging. Every row in the recent-events list can be edited (time, type, notes) or deleted.
- `/profile` — Edit the corgi's name and birthdate.

## Run on your phone (Capacitor)

Capacitor wraps the built `dist/` in a native iOS/Android shell. The web code stays the same — it's just hosted by a WebView with a JS bridge to native APIs.

### One-time setup

From `examples/corgi-tracker/`:

```sh
bun install                          # picks up @capacitor/* from the root catalog
bun run build                        # produce dist/
bunx cap add ios                     # generates ./ios (commit it)
bunx cap add android                 # generates ./android (commit it)
```

### iOS (requires macOS + Xcode)

```sh
bun run cap:ios     # rebuilds web, syncs, opens Xcode
```

In Xcode:
1. Plug in your iPhone via USB. Trust the computer on the phone.
2. Select your device in the run-target dropdown (top bar).
3. Signing & Capabilities → set a **Team** (your free Apple ID works; sign in via Xcode → Settings → Accounts).
4. Press ▶︎. First launch the phone will refuse — go to **Settings → General → VPN & Device Management → Developer App** and trust the profile.
5. App stays installed for 7 days on a free Apple ID; re-deploy from Xcode to refresh.

### Android (any OS)

```sh
bun run cap:android   # rebuilds web, syncs, opens Android Studio
```

Or skip Android Studio entirely:
1. On your phone: **Settings → About → tap "Build number" 7 times** to unlock developer mode, then **Developer options → USB debugging**.
2. Plug it in, accept the RSA prompt.
3. `bun run cap:run:android` — Capacitor installs and launches the APK directly.

### Live-reload on the device (optional, fast iteration)

Edit `capacitor.config.ts` and uncomment `server.url`, set it to your dev machine's LAN IP (`ipconfig getifaddr en0` on macOS). Then:

```sh
bun run dev          # keep Vite running, bound to 0.0.0.0
bunx cap sync        # native shell now points at your dev server
```

The app reloads as you edit. Comment `server.url` back out before producing release builds.

### Notes

- Data still lives in the WebView's localStorage — survives reopens, wiped on app uninstall.
- The `ios/` and `android/` folders are platform projects; commit them so the build is reproducible.
- Bundle ID is set in `capacitor.config.ts` (`xyz.merkl.corgitracker`) — change before submitting to a store.

## Resetting the data

Wipe in DevTools:

```js
localStorage.removeItem("corgi:profile");
localStorage.removeItem("corgi:events");
```
