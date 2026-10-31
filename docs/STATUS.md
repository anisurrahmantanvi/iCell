# Status: what is verified, what is not

Last updated 2026-10-31.

## Verified
- Step 1 skeleton: GitHub Actions "Build check" (type check + production build) passed on commit ae4455f, and the owner installed the APK, signed in with the shared account and saw the Coming soon tabs on a real Android phone (reported by the owner).
- Live database (read-only look, 2026-10-31): `call_sessions`, `call_signals`, `push_tokens`, `blocks` and `profiles` columns, the call policies and triggers, and Realtime on `call_sessions` / `call_signals` match iConnecto's migrations 0005, 0014, 0015, 0016. No `icell_` objects existed. Not checked: column grants and function EXECUTE grants.

## Written but NOT built or tested
- Step 5 (phone push + lock-screen call): the SQL has not been run, the Edge Function has not been deployed, the Firebase config (`GOOGLE_SERVICES_JSON`) has not been added, and the native Java code (notification, full-screen launch, plugin) has never run on a phone. Whether a given Android phone shows the call over the lock screen depends on the phone maker's settings (Xiaomi/Redmi/Oppo/Vivo often block it by default).
- Step 3a (voice calls): `icell_0002_calls.sql` has not been run; the call screens, incoming-call sheet and ringtone have never been used on a phone. Calls work only while iCell is open on both phones. No TURN yet, so calls over some mobile networks will fail to connect. Android microphone permission prompt inside the APK is unverified.
- Step 2 (contacts): SQL run and search shown working on a phone (owner's screenshot). Add / favourite / remove not yet reported.
- Step 1 (skeleton): the workspace that wrote it could not reach the npm registry, so `npm install`, `tsc`,
  `vite build` and the app itself have **never run**. Expect possible type or build errors on the first
  GitHub Actions run ("Build check"). Sign-in against the real Supabase project is untested.
- The APK workflow (`apk.yml`) has never run.

## Not implemented
Everything on the roadmap in README.md from step 2 onward.
