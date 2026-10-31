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

## Roadmap

| # | Step | State |
|---|------|-------|
| 1 | App skeleton, sign-in with the shared account, Coming soon tabs | written, **not built or run yet** |
| 2 | Contacts (find by username, favourites) | Coming soon |
| 3 | iCell-to-iCell voice calls + TURN credentials service | Coming soon |
| 4 | Call history | Coming soon |
| 5 | Native incoming-call screen and ringtone (lock screen) | Coming soon |
| 6 | Calls between iCell and iConnecto users | Coming soon |

See `docs/STATUS.md` for what has and has not been verified.
