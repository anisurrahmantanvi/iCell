# iCell

Calling-only Android app. It shares one Supabase project and one account system with iConnecto
(same login; the Supabase project is the one iConnecto already uses).

Stack: React + TypeScript + Vite, Supabase (publishable key only), Capacitor 6 for the Android APK
(package `com.iconnecto.call`, files bundled in the APK).

## Rules

- No secret or key is ever committed or pasted in chat. The app reads `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). A service-role key is rejected at start-up.
- iConnecto and iCell share one database. iCell never changes or drops an iConnecto table; its own tables
  and functions use the `icell_` prefix. Look at the real schema before any change.
- Unfinished features show "Coming soon" and are switched on one at a time.
- iCell has its own design; it does not copy another app's UI.

## Build

- Every push to `main` runs **Build check** (type check + build) and **Android APK** (debug APK, published on the `built-apk` branch and as an Actions artifact).
- The APK build reads the repository Variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` when they exist, otherwise the public defaults in `.github/workflows/apk.yml` (same project and publishable key as iConnecto). Only publishable values; never a secret key.

## Roadmap

| # | Step | State |
|---|------|-------|
| 1 | App skeleton, sign-in with the shared account, Coming soon tabs | written, **not built or run yet** |
| 2 | Contacts (find by username, favourites) | written, needs `supabase/migrations/icell_0001_contacts.sql` run once; **not built or tested yet** |
| 3a | iCell-to-iCell voice calls, app open, STUN only (own tables `icell_calls`, `icell_call_signals`; run `icell_0002_calls.sql`) | written, **built by CI only; not tested on phones** |
| 3b | TURN relay credentials service (Cloudflare) | Coming soon |
| 5 | Phone push + full-screen incoming call (rings when closed / locked): `icell_0003_push.sql`, function `icell-send-push`, native `mobile/*.java`, secrets `GOOGLE_SERVICES_JSON` + `SUPABASE_ACCESS_TOKEN` | written, **needs one-time setup (docs/PUSH_SETUP.md); not tested on a phone** |
| 4 | Call history | Coming soon |
| 5 | Native incoming-call screen and ringtone (lock screen) | Coming soon |
| 6 | Calls between iCell and iConnecto users | Coming soon |

Hosting: GitHub Pages (workflow `pages.yml`) serves the web build and `download.html` (APK link). Needs Settings > Pages > Source = GitHub Actions once.

See `docs/STATUS.md` for what has and has not been verified.
