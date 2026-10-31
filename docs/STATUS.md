# Status: what is verified, what is not

Last updated 2026-10-31.

## Verified
- Step 1 skeleton: GitHub Actions "Build check" (type check + production build) passed on commit ae4455f, and the owner installed the APK, signed in with the shared account and saw the Coming soon tabs on a real Android phone (reported by the owner).
- Live database (read-only look, 2026-10-31): `call_sessions`, `call_signals`, `push_tokens`, `blocks` and `profiles` columns, the call policies and triggers, and Realtime on `call_sessions` / `call_signals` match iConnecto's migrations 0005, 0014, 0015, 0016. No `icell_` objects existed. Not checked: column grants and function EXECUTE grants.

## Written but NOT built or tested
- Step 2 (contacts): `icell_0001_contacts.sql` has never been run, and the Contacts screen has never been built or run. Until the SQL is run the screen shows a "one-time database setup" notice.
- Step 1 (skeleton): the workspace that wrote it could not reach the npm registry, so `npm install`, `tsc`,
  `vite build` and the app itself have **never run**. Expect possible type or build errors on the first
  GitHub Actions run ("Build check"). Sign-in against the real Supabase project is untested.
- The APK workflow (`apk.yml`) has never run.

## Not implemented
Everything on the roadmap in README.md from step 2 onward.
