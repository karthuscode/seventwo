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

- Shared access-code experience backed by one Supabase Auth host account
- Persisted authentication and logout
- Workspace and future-ready workspace membership architecture
- Workspace-scoped domain records and referential integrity
- Supabase-backed asynchronous repository
- Mandatory membership-based RLS policies
- Pending-payment confirmation
- In-place transaction corrections with creation/update timestamps
- Safe local demo separation and optional Phase 1 data import
- Shared cross-device data after Supabase configuration

## Phase 3 — Cash-out and settlement

- Record each player's remaining chip count
- Convert chips to RON using the session configuration
- Calculate player profit/loss
- Reconcile cash-outs with committed and received funds
- Surface discrepancies before finishing a session
- Save a final settlement snapshot

## Phase 4 — Blind timer

- Configurable small-blind and big-blind levels
- Large table-readable timer
- Pause, resume, next level, and optional breaks
- Timer settings isolated from financial records

## Phase 5 — Statistics and UX improvements

- Deeper player and session statistics derived from history
- Useful trends, filters, and search
- Improved offline and installation experience
- Data export and backup options
- Accessibility and table-side ergonomics refinement

## Phase 6 — Optional individual users

- Replace or supplement the shared host identity with individual accounts
- Invite additional OWNER or HOST workspace members
- Define host and viewer permissions
- Allow selected participants to join from their own phones
- Add safe real-time synchronization where it improves the workflow

## Architectural guardrails

- Transactions remain ledger entries; totals are derived rather than duplicated.
- Payment method and receipt status remain independent.
- Workspace membership—not possession of the public API key—authorizes data access.
- Poker players remain separate from authenticated application users.
- Cards, hands, pots, winners, and strategy stay outside product scope.
