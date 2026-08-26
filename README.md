# SevenTwo

SevenTwo is a mobile-first PWA for managing live Texas Hold'em home-game sessions. It gives trusted hosts one shared view of recurring players, sessions, buy-ins, rebuys, payment status, the common bank, history, and basic player statistics.

SevenTwo does **not** track cards, hands, individual pots, hand winners, or poker strategy.

## Current functionality

- Reusable player list and player detail summaries
- Session creation with custom RON ↔ chip configuration
- Separate buy-in and rebuy transaction records
- Cash, Card, and Other payment methods
- Received and Pending payment tracking
- Committed, received, and pending bank calculations
- One-tap pending-payment confirmation
- In-place transaction corrections without deleting ledger entries
- Active-session, history, and session-detail views
- Shared host access through Supabase Auth
- Workspace-scoped Supabase persistence across devices
- Installable responsive PWA
- Local demo fallback when Supabase is not configured
- One-time Phase 1 local-data import when the shared workspace is empty

Cash-out settlement and the blind timer remain planned features.

## Tech stack

- React 19 and strict TypeScript
- Vite
- Tailwind CSS
- React Router
- Supabase Auth and PostgreSQL
- Vite PWA plugin / Workbox

## Local setup

Requirements: a recent Node.js LTS release and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without Supabase environment variables, SevenTwo presents an explicit local demo option. Demo records remain on that browser only and are never mixed with an authenticated Supabase session.

## Environment variables

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
VITE_SUPABASE_HOST_EMAIL=host@example.com
```

`VITE_SUPABASE_HOST_EMAIL` is a non-secret identifier for the shared host account. The host password/access code is never configured in Vite: hosts enter it at runtime and the browser sends it directly to Supabase Auth.

Never place a database password, host password, or Supabase `service_role` key in frontend environment variables. `.env` variants are ignored by Git; only `.env.example` is tracked.

## Supabase setup

### 1. Apply database migrations

Apply these migrations in order through the Supabase CLI or SQL editor:

1. `supabase/migrations/20260826000000_initial_schema.sql`
2. `supabase/migrations/20260827000000_shared_host_workspaces.sql`

The second migration creates an initial `SevenTwo` workspace, adds workspace ownership to all domain tables, preserves existing Phase 1 database rows, and enables RLS.

### 2. Create the shared host Auth user

In **Supabase Dashboard → Authentication → Users**, choose **Add user** and:

- use the same email configured as `VITE_SUPABASE_HOST_EMAIL`;
- choose a reasonably strong shared password/access code;
- create the user as confirmed;
- do not enable public sign-up in the application.

The password is shared out-of-band with trusted hosts and is never committed or stored in application configuration.

### 3. Assign the host to the workspace

Run the following in the Supabase SQL editor after replacing the email:

```sql
insert into public.workspace_members (workspace_id, user_id, role)
select workspace.id, host.id, 'OWNER'::public.workspace_role
from public.workspaces as workspace
cross join auth.users as host
where workspace.name = 'SevenTwo'
  and host.email = 'host@example.com'
on conflict (workspace_id, user_id)
do update set role = excluded.role;
```

The app intentionally does not create workspaces or membership from the browser. Administrative setup uses the Supabase dashboard/SQL editor, which runs outside normal client RLS.

### 4. Configure the frontend

Copy the project URL, public publishable/anonymous key, and host email into `.env.local`. Configure the same three public values in the deployment environment. Restart or rebuild after changing Vite environment variables.

## Authentication and security

- The access screen calls `signInWithPassword` for one manually created shared Supabase Auth account.
- Supabase persists and refreshes the authenticated session in the browser.
- No sign-up or individual poker-player accounts exist.
- Poker `Player` records are separate from authenticated application users.
- Every Player, Session, SessionPlayer, and Transaction has a `workspace_id`.
- `workspace_members` links `auth.users` identities to workspaces with `OWNER` or `HOST` roles.
- RLS checks `auth.uid()` membership for every protected read and write.
- Unauthenticated clients have no table policies and cannot access workspace data, even with the public Supabase URL and publishable/anon key.
- The frontend never uses the `service_role` key.

## Persistence architecture

React uses one asynchronous `AppRepository` selected at access time:

- Authenticated configured sessions use `SupabaseRepository` as the only source of truth.
- Unconfigured development sessions use `LocalStorageRepository` in clearly labeled demo mode.

Page components do not call Supabase directly. Calculations remain pure and independent of persistence.

If Phase 1 browser data exists and the authenticated workspace is empty, SevenTwo offers a one-time import. The original local browser data is left untouched as a safety copy.

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
