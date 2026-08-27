# SevenTwo

SevenTwo is a mobile-first PWA for running live Texas Hold'em home games: poker groups, players, game-night planning, buy-ins, rebuys, payments, cash-outs, bank reconciliation, history, and focused player statistics. It never tracks cards, hands, pots, or poker strategy.

## Current scope

- Independent workspaces with `OWNER`, `HOST`, and registered `PLAYER` roles
- Optional email magic-link accounts layered onto invisible Supabase Anonymous Auth
- One unified invite-code entry for secure Host access and single-use Player invitations
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
Supabase Auth (anonymous or registered)
  ↓
workspace_members (OWNER / HOST / PLAYER)
  ↓
RLS-protected workspace data
  ├── canonical poker players (optionally linked to auth users)
  ├── Plans / times / votes
  └── Sessions / participants / financial ledger / settlement
```

Poker `Player` records remain the canonical identities. Email registration alone never creates one. A Player invite either links a registered user to an exact existing row—preserving every historical session—or creates a new registered Player after the invited user chooses a unique nickname. Pages use the asynchronous repository boundary; persistence and settlement formulas stay outside UI components.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Leave the Supabase variables empty for local/demo mode. Local codes and accounts do not sync across devices.

Frontend variables (public client settings only):

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Never put the database password, service-role key, Host/Player code, or `WORKSPACE_CODE_PEPPER` in a frontend variable or Git.

## Supabase setup

1. In Authentication → Providers, enable Anonymous Sign-Ins and Email. Configure magic-link email delivery.
2. Add every deployed/local origin that may receive an email link to Authentication → URL Configuration, including the production Site URL and redirect URLs such as `http://localhost:5173/**`.
3. Apply migrations in filename order (`supabase db push` when using a linked CLI project), including:
   - `20260901000000_phase4_player_role.sql`
   - `20260901001000_phase4_accounts_planning.sql`
   - `20260901002000_phase4_flexible_player_invites.sql`
4. Keep the existing server-side pepper, or set a new project secret only for a fresh database:

   ```bash
   supabase secrets set WORKSPACE_CODE_PEPPER=replace-with-at-least-32-random-characters
   ```

   Changing this value invalidates existing Host-code digests, so production must keep its current pepper.
5. Deploy the functions (all authenticate the bearer session themselves):

   ```bash
   supabase functions deploy create-workspace --no-verify-jwt
   supabase functions deploy join-workspace --no-verify-jwt
   supabase functions deploy rotate-workspace-code --no-verify-jwt
   supabase functions deploy create-player-invite --no-verify-jwt
   supabase functions deploy redeem-player-invite --no-verify-jwt
   supabase functions deploy redeem-invite-code --no-verify-jwt
   supabase functions deploy transfer-anonymous-access --no-verify-jwt
   ```
6. Keep the two public `VITE_SUPABASE_*` variables configured in Cloudflare Pages. Phase 4 adds no new frontend secret.

Google sign-in is intentionally not enabled in this pass. It can be added later through Supabase provider configuration and manual identity linking without changing the workspace/player model.

## Identity and invite behavior

- A guest Host may remain anonymous indefinitely.
- “Keep this access with an account” upgrades the anonymous Supabase user in place by confirming an email, retaining the same `auth.uid()` and memberships.
- Signing into an existing account first creates a short-lived, random server-side transfer token. After the magic link completes, memberships and linked poker identity are transferred transactionally; conflicts stop for manual review rather than silently losing data.
- The app presents one six-digit invite field; the server securely determines whether the digest represents Host access or a Player invitation.
- Host codes remain HMAC-protected workspace access. Redeeming one upgrades `PLAYER` to `HOST` but never downgrades `OWNER`.
- Player codes are separately HMAC-protected, 14-day, single-use invitations. Redemption requires a registered account and either links one exact unclaimed Player row or asks for a unique nickname before atomically creating a new Player.
- A nickname collision never silently claims or duplicates a historical Player. The owner must issue a code tied to that exact unregistered profile, or the invited user must choose another nickname.
- Eight failed code attempts within the existing 15-minute window trigger a temporary cooldown.

## Security

Authentication alone grants no workspace access. RLS checks membership for every workspace row. OWNER/HOST may administer sessions and Plans; PLAYER may read relevant Plans, vote only for its linked Player, and read its own poker/session data. Player linking, code lookup, and account transfer use server-only Edge Functions/RPCs. The browser never receives invite digests, the HMAC pepper, or the service-role key.

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test:settlement
npm run test:planning
npm run build
```

See [docs/ROADMAP.md](docs/ROADMAP.md).
