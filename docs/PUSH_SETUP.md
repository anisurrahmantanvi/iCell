# One-time setup for call alerts (rings when iCell is closed or the phone is locked)

Nothing below needs a secret typed into chat. Three things live outside the code:

1. **Firebase app for iCell.** In the same Firebase project iConnecto already uses: Project settings > Your apps > Add app > Android,
   package name `com.iconnecto.call`. Download `google-services.json`. In the iCell GitHub repo: Settings > Secrets and variables > Actions >
   New repository secret, name `GOOGLE_SERVICES_JSON`, value = the whole file's text. (Without it the APK still builds but cannot get a push token.)
2. **Deploy the server function.** Repo secret `SUPABASE_ACCESS_TOKEN` (Supabase > Account > Access Tokens), then Actions > "Deploy Supabase function" > Run.
   The function reuses the Edge Function secrets iConnecto's `send-push` already uses (`PUSH_WEBHOOK_SECRET`, `FCM_SERVICE_ACCOUNT`);
   the service account must belong to the same Firebase project as step 1.
3. **Database.** Run `supabase/migrations/icell_0003_push.sql` in the SQL Editor: PART A, then PART B (see the tip at the top of that file).

Then install the new APK, open Settings (or Calls) in iCell and tap **Turn on call alerts**.

Phones from some makers (Xiaomi, Redmi, Oppo, Vivo) also need Settings > Apps > iCell > "Show on lock screen" and
"Pop-up windows while running in background" switched on, and battery saving set to "No restrictions".
