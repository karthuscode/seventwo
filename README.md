# SevenTwo

SevenTwo is a mobile-first PWA for running live Texas Hold'em home games: poker groups, players, game-night planning, buy-ins, rebuys, payments, cash-outs, bank reconciliation, history, and focused player statistics. It never tracks cards, hands, pots, or poker strategy.

## Current scope

- Independent workspaces with `OWNER`, `HOST`, and registered `PLAYER` roles
- Email/password SevenTwo accounts with display names
- Workspace Gateway for joining or creating poker groups after sign-in
- Single-use Player invitations; owners promote trusted players to Host when needed
- Player invitations can link existing poker history or create a new registered Player after nickname selection
- Concrete date/time Plans, registered-player votes, Host proxy votes for guests, turnout indicators, confirmation, and Plan → Session conversion
- Reusable players; safe rename, archive, restore, and deletion rules
- Sessions with configurable RON ↔ chips, buy-ins, rebuys, Cash/Card receipt state, cash-out, pending offsets, split payouts, and settlement
- Workspace-scoped Supabase persistence with RLS, plus coherent local/demo persistence
- Responsive installable PWA

## Architecture

```text
Device
  ↓
Supabase Auth (registered email/password user)
  ↓
workspace_members (OWNER / HOST / PLAYER)
  ↓
RLS-protected workspace data
  ├── canonical poker players (optionally linked to auth users)
  ├── Plans / times / votes
  └── Sessions / participants / financial ledger / settlement
```

Poker `Player` records remain the canonical table identities. Email registration alone never creates one. A Player invite either links a registered user to an exact existing row—preserving every historical session—or creates a new registered Player after the invited user chooses a unique nickname. Pages use the asynchronous repository boundary; persistence and settlement formulas stay outside UI components.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Leave the Supabase variables empty for local/demo mode. Local workspace/player invite codes do not sync across devices.

Frontend variables (public client settings only):

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Never put the database password, service-role key, Player invite code, or `WORKSPACE_CODE_PEPPER` in a frontend variable or Git.

## Supabase setup

1. In Authentication → Providers, enable Email with password sign-in/sign-up.
2. Disable email confirmations for the current MVP so registration signs the user in immediately.
3. Disable Anonymous Sign-Ins after existing guest-owner workspaces have been upgraded.
4. Add the production Site URL and local development URL to Authentication → URL Configuration.
5. Apply migrations in filename order (`supabase db push` when using a linked CLI project), including:
   - `20260901000000_phase4_player_role.sql`
   - `20260901001000_phase4_accounts_planning.sql`
   - `20260901002000_phase4_flexible_player_invites.sql`
   - `20260902000000_account_first_membership.sql`
6. Keep the existing server-side pepper, or set a new project secret only for a fresh database:

   ```bash
   supabase secrets set WORKSPACE_CODE_PEPPER=replace-with-at-least-32-random-characters
   ```

   Changing this value invalidates existing invite digests, so production must keep its current pepper.
7. Deploy the functions (all authenticate the bearer session themselves):

   ```bash
   supabase functions deploy create-workspace --no-verify-jwt
   supabase functions deploy create-player-invite --no-verify-jwt
   supabase functions deploy redeem-player-invite --no-verify-jwt
   supabase functions deploy redeem-invite-code --no-verify-jwt
   supabase functions deploy upgrade-anonymous-owner --no-verify-jwt
   ```
8. Keep the two public `VITE_SUPABASE_*` variables configured in Cloudflare Pages. Phase 4 adds no new frontend secret.

Google sign-in is intentionally not enabled in this pass. It can be added later through Supabase provider configuration and manual identity linking without changing the workspace/player model.

## Identity, roles, and invites

- New users register with username, email, and password. Username is display-only and may repeat; email is the login identity.
- Creating a workspace makes the current registered user the single `OWNER`.
- Player invite codes are HMAC-protected, 14-day, single-use invitations. Redemption requires a registered account and always creates `PLAYER` membership first.
- An `OWNER` can promote `PLAYER` to `HOST` or demote `HOST` to `PLAYER`; the `OWNER` role is protected from ordinary role controls.
- A Player invite either links one exact unclaimed Player row or asks for a unique nickname before atomically creating a new Player.
- A nickname collision never silently claims or duplicates a historical Player. The owner must issue a code tied to that exact unregistered profile, or the invited user must choose another nickname.
- Eight failed code attempts within the existing 15-minute window trigger a temporary cooldown.
- Legacy workspace Host-code functions may remain deployed temporarily for backward compatibility, but the normal UI no longer exposes Host access codes.

## Legacy owner upgrade

Older production workspaces may have an anonymous Supabase user as `OWNER`. The frontend detects a persisted anonymous session and shows an Upgrade account screen instead of the normal app. The `upgrade-anonymous-owner` Edge Function verifies that the current anonymous `auth.uid()` owns at least one workspace, then converts that same auth user to email/password and writes `user_profiles`. Because the `user_id` is preserved, workspace IDs, Players, Sessions, Plans, statistics, and the single OWNER membership remain intact.

Legacy anonymous `HOST` memberships are not used for new joins. They may remain in the database during migration, but new UI does not create or advertise anonymous Host access.

Safe production rollout:

1. Apply additive migrations through `20260902000000_account_first_membership.sql`.
2. Deploy `create-workspace`, `create-player-invite`, `redeem-player-invite`, `redeem-invite-code`, and `upgrade-anonymous-owner`.
3. Confirm Supabase Email password sign-in/sign-up is enabled and email confirmation is disabled.
4. Test the legacy owner upgrade on a staging/local Supabase project with copied-safe data.
5. Upgrade each existing anonymous production OWNER from the old browser session.
6. Verify each workspace still has exactly one OWNER and all Players, Sessions, Plans, and financial history are intact.
7. Disable Anonymous Sign-Ins once no anonymous OWNER still needs upgrade.
8. Deploy the frontend that removes anonymous and Host-code onboarding.

## Security

Authentication alone grants no workspace access. RLS checks membership for every workspace row. OWNER/HOST may administer sessions and Plans; PLAYER may read relevant Plans, vote only for its linked Player, and read its own poker/session data. Player linking, code lookup, and legacy owner upgrade use server-only Edge Functions/RPCs. The browser never receives invite digests, the HMAC pepper, or the service-role key.

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test:settlement
npm run test:planning
npm run test:auth
npm run build
```

See [docs/ROADMAP.md](docs/ROADMAP.md).
