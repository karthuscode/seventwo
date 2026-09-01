# Push notification setup

SevenTwo uses standards-based Web Push. The production public key is bundled with the client because it is not secret. Local and staging builds may override it:

```dotenv
VITE_WEB_PUSH_PUBLIC_KEY=your-url-safe-vapid-public-key
```

The Supabase Edge Function requires these server-only secrets:

```text
WEB_PUSH_VAPID_PUBLIC_KEY
WEB_PUSH_VAPID_PRIVATE_KEY
NOTIFICATION_DISPATCH_SECRET
```

After applying the Phase 5.1 migration and deploying `dispatch-notifications`, invoke the function once with `{ "configure": true }` and the dispatch secret header. That service-only call stores the dispatcher configuration and schedules the one-minute Supabase Cron job. Never commit the private VAPID key or dispatch secret.

On iPhone and iPad, Web Push requires iOS/iPadOS 16.4 or later and SevenTwo must be opened from its Home Screen icon. Permission is requested only after the user taps **Enable notifications** in Profile.
