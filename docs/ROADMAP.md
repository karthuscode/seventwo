# SevenTwo Roadmap

## Phase 1 — Foundation ✅

- React, strict TypeScript, Vite, Tailwind, Router, and PWA baseline
- Player, session, participant, and transaction domain model
- Mobile-first application shell and primary routes
- Local player management and session creation
- Separate buy-in and rebuy ledger entries
- Committed, received, and pending bank calculations
- Supabase client and initial PostgreSQL schema preparation

## Phase 2 — Shared host access and persistence ✅

- Workspace and future-ready workspace membership architecture
- Workspace-scoped domain records and referential integrity
- Supabase-backed asynchronous repository
- Mandatory membership-based RLS policies
- Pending-payment confirmation
- In-place transaction corrections with creation/update timestamps
- Safe local demo separation and optional Phase 1 data import
- Shared cross-device data after Supabase configuration

## Phase 2.5 — Workspace access codes ✅

- Invisible, persisted Supabase Anonymous Auth
- Multiple independent workspaces per anonymous device identity
- Secure server-side workspace creation and OWNER membership
- Six-digit HMAC-protected access codes with no plaintext database storage
- HOST joins through a focused Edge Function
- Mobile workspace selector with data-layer remount on switch
- OWNER-only access-code rotation
- Lightweight failed-join throttling
- Digest-hiding database privileges and preserved membership-based RLS
- Multi-workspace local demo simulation
- Superseded in the normal product flow by Phase 4 registered accounts and PLAYER-only workspace invites; legacy anonymous rows can remain temporarily for migration.

## Phase 3 — Cash-out and settlement ✅

- Record each player's remaining chip count
- Convert chips to RON using the session configuration
- Calculate player profit/loss
- Reconcile cash-outs with committed and received funds
- Surface discrepancies before finishing a session
- Preserve complete cash-out, offset, payout, and settlement inputs for historical summaries

## Phase 4 — Accounts, roles, invites, and planning (release candidate)

- Email/password account registration and login with display names
- Account-first Auth screen and Workspace Gateway
- OWNER / HOST / PLAYER permissions and linked canonical Player identities
- One reusable, owner-managed workspace invite code that always grants PLAYER
- Automatic registered Player identity for workspace creators and joiners
- Owner-controlled linking of historical unregistered Players to eligible registered members
- OWNER-only PLAYER ↔ HOST role management from the Players roster
- Isolated legacy anonymous OWNER migration path that preserves workspace IDs and historical data
- Visible account identity, active-workspace role, role-aware onboarding, and profile states
- Concrete timeslot Plans, registered self-voting, and operator proxy voting for unregistered Players
- Attendance viability, deterministic best option, confirmation, primary host, and Plan → Session conversion
- RLS policies that prevent PLAYER financial administration and cross-workspace access

## Phase 5 — Blind timer

- Configurable small-blind and big-blind levels
- Large table-readable timer
- Pause, resume, next level, and optional breaks
- Timer settings isolated from financial records

## Phase 6 — Statistics and UX improvements

- Deeper player and session statistics derived from history
- Useful trends, filters, and search
- Improved offline and installation experience
- Data export and backup options
- Accessibility and table-side ergonomics refinement

## Phase 7 — Optional collaboration expansion

- Optional Google OAuth identity linking
- Additional owner-transfer and member-removal administration
- Optional co-hosting and richer planning controls
- Add safe real-time synchronization where it improves the workflow

## Architectural guardrails

- Transactions remain ledger entries; totals are derived rather than duplicated.
- Payment method and receipt status remain independent.
- Workspace membership—not possession of the public API key—authorizes data access.
- Poker players remain separate from authenticated application users.
- Cards, hands, pots, winners, and strategy stay outside product scope.
