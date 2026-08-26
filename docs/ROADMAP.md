# Poker Session Manager Roadmap

The project is intentionally split into small phases so each step leaves the host with a usable application.

## Phase 1 — Foundation

- Establish the React, TypeScript, Vite, Tailwind, Router, and PWA baseline
- Define the player, session, participant, and transaction domain model
- Add the mobile-first shell and primary page routes
- Build local player management and session creation
- Record initial buy-ins and rebuys as separate ledger entries
- Calculate committed, received, and pending bank totals
- Prepare the Supabase client, SQL schema, and repository boundary

## Phase 2 — Session transactions

- Replace local persistence with an async Supabase repository
- Add players to an already active session
- Edit payment method and mark pending payments as received
- Improve transaction history, corrections, and safe reversal handling
- Add session finishing prerequisites and validation

## Phase 3 — Cash-out and settlement

- Record each player's remaining chip count
- Convert chips to RON using the session configuration
- Calculate player profit/loss
- Reconcile cash-outs with committed and received funds
- Surface discrepancies before finishing a session
- Save a final immutable settlement snapshot

## Phase 4 — Blind timer

- Add configurable small-blind and big-blind levels
- Provide a large, table-readable timer
- Support pause, resume, next level, and optional breaks
- Preserve timer settings per session without mixing timer logic into finance logic

## Phase 5 — Statistics and UX improvements

- Expand player and session statistics from historical records
- Add useful trends, filters, and search
- Improve offline behavior and install prompts
- Add data export and backup options
- Refine accessibility, keyboard support, and table-side ergonomics

## Phase 6 — Optional multi-user support

- Introduce authentication and host ownership
- Add row-level security policies
- Allow invited players to join from their own phones
- Define clear permissions for viewing, payment confirmation, and host-only changes
- Add safe real-time synchronization

## Architectural guardrails

- Transactions remain individual ledger entries; totals are derived rather than duplicated.
- Payment method and payment receipt status remain independent.
- Poker hand, pot, card, winner, and strategy tracking stay outside the product scope.
- Multi-user concerns should be added only when the single-host workflow is stable.
