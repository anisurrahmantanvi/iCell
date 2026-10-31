# Status: what is verified, what is not

Last updated 2026-10-31.

## Verified
Nothing has been executed yet.

## Written but NOT built or tested
- Step 1 (skeleton): the workspace that wrote it could not reach the npm registry, so `npm install`, `tsc`,
  `vite build` and the app itself have **never run**. Expect possible type or build errors on the first
  GitHub Actions run ("Build check"). Sign-in against the real Supabase project is untested.
- The APK workflow (`apk.yml`) has never run.

## Not implemented
Everything on the roadmap in README.md from step 2 onward.
