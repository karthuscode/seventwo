# SevenTwo

SevenTwo is a mobile-first PWA for managing live Texas Hold'em home-game sessions. It gives trusted hosts a shared view of recurring players, sessions, buy-ins, rebuys, payment status, the common bank, history, and basic player statistics.

SevenTwo does **not** track cards, hands, individual pots, hand winners, or poker strategy.

## Current functionality

- Independent poker-group workspaces with OWNER and HOST roles
- Invisible Supabase Anonymous Auth—no registration, email, username, or password
- Secure six-digit workspace creation, joining, switching, and OWNER-only code rotation
- Reusable player list and player detail summaries
- Session creation with custom RON ↔ chip configuration
- Separate buy-in and rebuy transaction records
- Cash, Card, and Other payment methods
- Received and Pending payment tracking
- Committed, received, and pending bank calculations
- One-tap pending-payment confirmation and in-place transaction correction
- Active-session, history, and session-detail views
- Workspace-scoped Supabase persistence protected by RLS
- Installable responsive PWA
- Isolated local demo workspaces when Supabase is not configured
- Non-destructive Phase 1 browser-data migration/import support

Cash-out settlement and the blind timer remain planned features.

## Architecture

```text
Device
  ↓
Supabase Anonymous Auth (auth.uid())
  ↓
workspace_members (OWNER or HOST)
  ↓
RLS-protected workspace data
  ↓
Players / Sessions / SessionPlayers / Transactions
```

Poker `Player` records are participants such as Bendi or Csani. They are not authenticated users. One anonymous Supabase identity may belong to several workspaces, while each workspace remains an independent poker group.

React uses one asynchronous `AppRepository` selected at startup. A configured deployment uses `SupabaseRepository`; an unconfigured build uses `LocalStorageRepository`. Pages do not call Supabase directly, and bank/statistics calculations remain pure business logic.

## Tech stack

- React 19 and strict TypeScript
- Vite and Tailwind CSS
- React Router
- Supabase Auth, PostgreSQL, RLS, and Edge Functions
- Vite PWA plugin / Workbox

## Local setup

Requirements: a recent Node.js LTS release and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Leave the Supabase values absent to use local demo mode. Local workspace codes are only a UI simulation: all records and codes stay in that browser and cannot synchronize across devices.

## Frontend environment variables

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

These are public client settings. Do not put the workspace-code pepper, a database password, or a Supabase `service_role`/secret key in Vite variables. `.env` variants are ignored by Git; only `.env.example` is tracked.

## Supabase setup

### 1. Enable Anonymous Auth

In **Supabase Dashboard → Authentication → Providers**, enable **Anonymous Sign-Ins**. Public email/password sign-up is not used. If SevenTwo becomes broadly public, add CAPTCHA support before enabling CAPTCHA in Supabase so the frontend can submit the required token.

The browser calls `signInAnonymously()` once on a new device and Supabase persists that session locally. Clearing site data loses that device identity; access can be restored only by joining again with the current workspace code. Anonymous users should not be automatically deleted while they still need workspace membership.

### 2. Apply migrations

Apply the migrations in filename order with the Supabase CLI or SQL editor:

1. `supabase/migrations/20260826000000_initial_schema.sql`
2. `supabase/migrations/20260827000000_shared_host_workspaces.sql`
3. `supabase/migrations/20260828000000_workspace_access_codes.sql`

With a linked CLI project, this is normally:

```bash
supabase db push
```

The Phase 2.5 migration adds a hidden, unique access-code digest, a server-only rate-limit ledger, and column privileges that prevent ordinary clients from selecting the digest. Existing workspaces and poker records are not deleted.

### 3. Set the Edge Function secret

Generate a strong random pepper locally—for example, `openssl rand -hex 32`—then store the output directly as a Supabase project secret:

```bash
supabase secrets set WORKSPACE_CODE_PEPPER=replace-with-generated-value
```

Use at least 32 characters. Never place the real value in source control, frontend configuration, database rows, screenshots, or logs. The functions also use Supabase-provided runtime variables for the project URL, public/anon key, and service-role key; the service-role value never reaches the browser.

### 4. Deploy Edge Functions

```bash
supabase functions deploy create-workspace --no-verify-jwt
supabase functions deploy join-workspace --no-verify-jwt
supabase functions deploy rotate-workspace-code --no-verify-jwt
```

Gateway JWT verification is deliberately disabled because each function validates the bearer token itself with `auth.getUser()`, which supports current publishable-key behavior. Requests without a valid Supabase Auth session are rejected.

### 5. Configure and host the frontend

Set the two `VITE_SUPABASE_*` values in `.env.local` and in the hosting build environment, then rebuild. Host the production files over HTTPS for PWA installation. If using a private preview host, change its access settings before expecting trusted friends to open SevenTwo from their devices.

## Workspace-code security

- Edge Functions generate exactly six digits with Web Crypto; the frontend never uses `Math.random()` for real codes.
- PostgreSQL stores only `HMAC-SHA-256(code, WORKSPACE_CODE_PEPPER)`, not the plaintext code.
- The digest is unique and indexed for lookup, hidden from normal API column grants, and never returned by an Edge Function.
- Create makes the caller OWNER; join adds the caller as HOST without downgrading an existing OWNER.
- Rotation replaces the digest immediately, so the previous code can no longer create memberships. Existing members keep access.
- Plaintext is shown only after creation or rotation. There is intentionally no code-recovery feature.
- Join applies a per-anonymous-user 15-minute window and temporary block after eight failures.

A six-digit code has limited entropy. The lightweight throttle is suitable for this small private MVP, but it is not a substitute for CAPTCHA, network-level rate limiting, or longer invitations if SevenTwo becomes public at scale.

## RLS and data isolation

Anonymous Supabase users receive the normal `authenticated` database role, but authentication alone grants no workspace data. Every domain-table policy checks that `auth.uid()` exists in `workspace_members` for the row's `workspace_id`. Unauthenticated visitors have no policies, and membership in one workspace does not grant access to another.

Workspace creation, code lookup, join, and rotation run in focused Edge Functions. Ordinary player/session/transaction CRUD continues through the public client and RLS. The browser never uses `service_role`.

## Existing Phase 2 Supabase data

The migration preserves the previous workspace, records, and shared-host membership. The new app intentionally does not reuse the old email/password identity. To give a new anonymous device access to that legacy workspace:

1. Open SevenTwo once so the anonymous Auth user is created.
2. Find that anonymous user's UUID in **Authentication → Users**.
3. Find the existing workspace UUID in the Table Editor.
4. In the SQL editor, add that exact identity as OWNER:

```sql
insert into public.workspace_members (workspace_id, user_id, role)
values ('workspace-uuid', 'anonymous-user-uuid', 'OWNER')
on conflict (workspace_id, user_id)
do update set role = excluded.role;
```

Refresh SevenTwo, open the workspace switcher, and choose **Regenerate workspace code**. Future devices can then join normally. Keep the old membership until the migration is verified.

Phase 1 localStorage data is also left untouched. When an authenticated Supabase workspace is empty, SevenTwo offers to import that browser's legacy data into the selected workspace.

## PWA installation

Build and host SevenTwo over HTTPS, then use the browser's **Install app** or **Add to Home Screen** action. The manifest uses standalone display and the service worker precaches the application shell.

## Commands

```bash
npm run dev        # Start local development
npm run lint       # Run Oxlint
npm run typecheck  # Run strict TypeScript checks
npm run build      # Typecheck and create the production PWA
npm run preview    # Preview the production build locally
```

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the incremental development plan.
