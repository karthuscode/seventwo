# SevenTwo

SevenTwo is a mobile-first PWA for running live Texas Hold'em home games: poker groups, Players, game-night planning, buy-ins, rebuys, payments, cash-outs, bank reconciliation, history, and focused statistics. It never tracks cards, hands, pots, or poker strategy.

## Current scope

- Email/password accounts with username, email, and password
- Workspace Gateway with explicit create, join, and workspace selection
- One `OWNER`, plus `HOST` and `PLAYER` memberships
- One reusable six-digit workspace invite code; every new member joins as `PLAYER`
- Automatic linked `REGISTERED` Player identity for workspace creators and joiners
- Owner-controlled role changes and safe historical `UNREGISTERED` Player linking
- Concrete date/time Plans, self-voting for registered Players, proxy voting for unregistered Players, turnout indicators, confirmation, and Plan → Session conversion
- Player lifecycle management, configurable sessions, Cash/Card payments, cash-out, payout allocation, settlement, history, and statistics
- Supabase persistence with workspace-scoped RLS and a local/demo repository
- Responsive installable PWA

## Identity and access

```text
Email/password account
  ↓
workspace_members (OWNER / HOST / PLAYER)
  ↓
RLS-protected workspace
  ↓
linked poker Player (REGISTERED)
```

An account and a poker Player remain separate records. Creating or joining a workspace creates one linked Player in that workspace. Manually added poker participants remain `UNREGISTERED` and cannot sign in. An owner can link an existing historical unregistered Player only to an eligible registered workspace member; the original Player ID, sessions, and statistics stay intact.

Every workspace has exactly one protected `OWNER`. A workspace invite always creates `PLAYER` membership. The owner may then promote that member to `HOST` or demote a Host back to Player. Normal UI cannot transfer or downgrade ownership.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Leave the Supabase values empty for local/demo mode. Local data and invite codes remain on that browser only.

Frontend variables are public client settings:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Never place a database password, service-role key, workspace code, or `WORKSPACE_CODE_PEPPER` in frontend variables or Git.

## Supabase setup

In Authentication → Providers:

- Enable Email with password sign-up and sign-in.
- Disable email confirmation for this MVP so registration returns a session immediately.
- Disable Anonymous Sign-Ins after the legacy owner migration is complete.
- Add production and localhost URLs under Authentication → URL Configuration.

Apply every migration in filename order, including:

```text
20260901000000_phase4_player_role.sql
20260901001000_phase4_accounts_planning.sql
20260901002000_phase4_flexible_player_invites.sql
20260902000000_account_first_membership.sql
20260903000000_workspace_creator_player.sql
```

Keep the existing production pepper. On a fresh project, set a strong server-only value:

```bash
supabase secrets set WORKSPACE_CODE_PEPPER=replace-with-at-least-32-random-characters
```

Changing the pepper invalidates existing invite digests.

Deploy the active normal-flow functions:

```bash
supabase functions deploy create-workspace --no-verify-jwt
supabase functions deploy get-workspace-invite --no-verify-jwt
supabase functions deploy rotate-workspace-code --no-verify-jwt
supabase functions deploy join-workspace --no-verify-jwt
```

Each function validates the bearer session itself. The service-role credential remains inside Supabase Functions only.

## Workspace invite security

- Codes are exactly six digits.
- A server-side random UUID seed is generated with Web Crypto.
- The visible code is derived server-side with HMAC-SHA-256 and `WORKSPACE_CODE_PEPPER`.
- PostgreSQL stores the seed and an indexed HMAC digest, never the plaintext code.
- Only the owner can view or rotate the code through server-side functions.
- Rotation replaces the seed and digest, immediately invalidating the previous code.
- Failed joins retain the existing cooldown/rate-limit protection.
- Joining requires a registered session and grants `PLAYER` only.

## Legacy owner migration

The normal application never shows anonymous or upgrade-account onboarding. The internal `upgrade-anonymous-owner` function is retained only for a controlled one-time migration of an existing anonymous production owner.

Before disabling Anonymous Sign-Ins:

1. Back up the database and verify the legacy browser still holds the anonymous owner session.
2. Apply migrations through `20260903000000_workspace_creator_player.sql` and deploy `upgrade-anonymous-owner` temporarily.
3. Invoke the upgrade from a controlled migration client using that legacy bearer session and the intended email, username, and password.
4. Sign in with the new email/password account and verify the same auth user ID, exactly one `OWNER`, the same workspace ID, and intact Players, Plans, Sessions, settlement, history, and statistics.
5. Rotate the workspace invite code so the workspace has a recoverable Phase 4 code seed.
6. Disable Anonymous Sign-Ins and remove the migration client. Keep the function undeployed or restricted after verification.

Legacy anonymous `HOST` memberships may remain as historical rows during cleanup. No new anonymous or code-based Host access is created.

## Safe rollout order

1. Back up production and test the migration against a staging Supabase project.
2. Configure Email/Password auth; keep Anonymous Sign-Ins temporarily enabled only if the legacy owner still needs migration.
3. Apply `20260903000000_workspace_creator_player.sql` after all earlier migrations.
4. Set or verify `WORKSPACE_CODE_PEPPER` without changing the existing production value.
5. Deploy `create-workspace`, `get-workspace-invite`, `rotate-workspace-code`, and `join-workspace`.
6. Complete and verify the legacy owner migration.
7. Test create, refresh, invite, join, nickname collision, role promotion/demotion, historical linking, and Plan voting with two registered accounts.
8. Disable Anonymous Sign-Ins.
9. Deploy the frontend only after the backend checks pass.

## Edge Function status

Active normal flow:

- `create-workspace`
- `get-workspace-invite`
- `rotate-workspace-code`
- `join-workspace`

Deprecated compatibility/migration paths:

- `create-player-invite`
- `redeem-player-invite`
- `redeem-invite-code`
- `transfer-anonymous-access`
- `upgrade-anonymous-owner` (one-time owner migration only)

The deprecated functions are not called by the normal frontend and can be removed after production migration and rollback windows close.

## Verification commands

```bash
npm run lint
npm run typecheck
npm run test:settlement
npm run test:planning
npm run test:auth
npm run build
git diff --check
```

See [docs/ROADMAP.md](docs/ROADMAP.md).
