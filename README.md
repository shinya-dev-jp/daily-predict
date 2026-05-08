# TuringVote

**RESOLVE IN PROGRESS 2026-05-08** — TuringVote is being updated for a World App reviewer concern that the app utility was unclear. The current resolve pack focuses on making the user benefit explicit: a 90-second bot-resistant preference check for Verified Humans, ending with a majority/minority self-profile.

Two choices. Real humans. No leaderboard. A pure two-choice poll app for Verified Humans on World App. Tap A or B on short neutral questions — morning person or night owl, coffee or tea, logic or intuition, stability or challenge, honesty or kindness — and see how other Verified Humans chose. Answer five in a row to get a one-screen summary of whether you lean majority or minority. One nullifier, one vote per question. No points, no streaks, no rewards, no leaderboard.

## Tech Stack

- **Framework**: Next.js 16 / React 19 / TypeScript
- **Styling**: Tailwind CSS 4
- **Backend**: Supabase (PostgreSQL + Row-Level Security)
- **Identity**: World ID (Orb Legacy verify + Wallet SIWE fallback)
- **Deployment**: Vercel (Routing Middleware = `src/proxy.ts`)

## Getting Started

```bash
npm install
```

Apply the Supabase schema (one-time) by pasting `src/scripts/tc_init.sql` into the Supabase SQL Editor for the `world-apps` project, then apply any subsequent migrations from `supabase/migrations/` in chronological order (e.g. `20260419_tc_users_drop_prediction_columns.sql`).

Create `.env.local` with:

```
# ─── Worldcoin / MiniKit ─────────────────────────────────────────────
NEXT_PUBLIC_WLD_APP_ID=           # e.g. app_abc123... (Worldcoin Developer Portal)
NEXT_PUBLIC_WLD_ACTION=turingvote-vote

# ─── Supabase ────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # service role, server-only

# ─── Session / vote secrets (server-only) ───────────────────────────
# HMAC secret that signs the tv_auth session cookie (lib/auth.ts).
# CRON_SECRET is used as a silent fallback for local dev only.
DP_AUTH_SECRET=                   # ≥32 chars random

# HMAC secret that pseudonymizes wallet addresses into action-scoped
# nullifier hashes in /api/vote. REQUIRED in prod: wallet-tier votes
# fail-closed with 401 if this is missing. DO NOT ROTATE after launch —
# rotating it allows the same wallet to double-vote on every question.
NULLIFIER_SECRET=                 # ≥32 chars random, TuringVote-only
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use `?preview=1` for a seed-free demo flow (DEMO tallies, no network).

## API Routes

| Route | Description |
|---|---|
| `GET /api/questions` | Random neutral question from `src/data/tc_questions.json` |
| `GET /api/questions?id=<n>` | Fetch a specific question by id |
| `GET /api/questions?count=5&exclude=1,7` | Session fetch, no duplicates |
| `POST /api/vote` | Cast a vote. Dual verify: orb_legacy or wallet_siwe. question_id must be in the static pool. Wallet tier nullifier = HMAC(NULLIFIER_SECRET, "turingvote-vote:" + address). |
| `GET /api/tally/[id]` | Aggregate A/B tally for the Reveal screen (only whitelisted question_id) |
| `GET /api/auth/nonce` | SIWE nonce for wallet auth |
| `POST /api/auth/wallet` | Verify SIWE signature, mint HttpOnly `tv_auth` Cookie |

## Deployment

```bash
npx vercel deploy --prod --yes
```

Mirror every `.env.local` entry above into the Vercel project settings (Production **and** Preview). `NULLIFIER_SECRET` and `DP_AUTH_SECRET` must be present in Production — both routes log a loud `console.error` at module load if they are missing or shorter than 16 chars.

## Reviewer Notes (Worldcoin Mini App audit)

- No rewards, no streaks, no points, no leaderboards. The app stores only `(nullifier_hash, question_id, choice, tier, created_at)` per vote.
- Wallet addresses are never written to vote rows. Only `sha256-hmac(NULLIFIER_SECRET, "turingvote-vote:" + address)` reaches `tc_votes`.
- `tv_auth` is HttpOnly, `sameSite=lax`, `secure`, signed with `DP_AUTH_SECRET`.
- Rate-limiting is in-memory interim (see `src/proxy.ts` header comment). Upstash Redis is on the roadmap before large launch campaigns.

## License

MIT
