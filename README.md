# Poker Session Manager

A mobile-first personal host console for live Texas Hold'em home games. It keeps the practical parts of running a table organized: recurring players, sessions, buy-ins, rebuys, payment receipt status, and the shared bank.

The app deliberately does not track cards, hands, pots, hand winners, or strategy.

## Current MVP scope

Phase 1 provides a clean working foundation:

- Responsive dark PWA shell with phone-first controls and desktop navigation
- Player creation, roster, and derived player summary pages
- Session creation with a configurable RON-to-chip conversion
- Existing-player selection and inline player creation
- Initial buy-ins plus separate rebuy transaction records
- Independent payment method and payment status fields
- Committed, received, and pending bank calculations
- Pending-payment explanations and per-player transaction history
- Active-session, history, and session-detail layouts
- Local browser persistence for credential-free development
- Supabase client scaffold and PostgreSQL migration

Cash-out buttons are intentionally placeholders. Settlement, reconciliation, blind timers, and multi-user support are not part of Phase 1.

## Tech stack

- React 19 and strict TypeScript
- Vite
- Tailwind CSS
- React Router
- Supabase client and PostgreSQL schema
- Vite PWA plugin / Workbox

## Setup

Requirements: a recent Node.js LTS release and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

The Supabase variables are optional for now. Without them, the app compiles and uses the isolated local-storage repository.

## Environment variables

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Only use the public anonymous key in a Vite client. Never put a Supabase service-role key in a `VITE_` variable.

## Commands

```bash
npm run dev        # Start local development
npm run lint       # Run Oxlint
npm run typecheck  # Run strict TypeScript checks
npm run build      # Typecheck and create the production PWA
npm run preview    # Preview the production build locally
```

## Persistence architecture

UI components use `AppDataProvider`, which currently delegates persistence to `LocalStorageRepository`. Domain types and calculations do not depend on storage. This keeps the app usable without credentials and leaves a narrow seam for a future async Supabase repository.

The initial PostgreSQL schema is in [`supabase/migrations/20260826000000_initial_schema.sql`](supabase/migrations/20260826000000_initial_schema.sql). Apply it through the Supabase dashboard or CLI when a project is ready. Authentication and row-level security are deliberately deferred; do not expose the database publicly until appropriate RLS policies are added.

Initial player buy-ins created with a session currently default to Cash / Received. Rebuys expose the full method and status choices.

## Feature status

| Area | Status |
| --- | --- |
| Players and derived lifetime summaries | Foundation complete |
| Session setup and configurable chip conversion | Foundation complete |
| Buy-in / rebuy ledger | Initial workflow complete |
| Payment receipt and bank summaries | Initial workflow complete |
| Supabase persistence | Schema and client prepared; repository integration pending |
| Cash-out and settlement | Planned |
| Blind timer | Planned |
| Long-term statistics | Calculation layer started; deeper views planned |
| Authentication / multiple users | Optional later phase |

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the incremental plan.
