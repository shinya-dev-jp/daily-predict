# TuringVote

Verified-human only 2-choice polls for World App. Tap A or B on neutral questions — the kind an AI cannot honestly prefer — and see how other Verified Humans chose. One nullifier, one vote per question.

## Tech Stack

- **Framework**: Next.js 16 / React 19 / TypeScript
- **Styling**: Tailwind CSS 4
- **Backend**: Supabase (PostgreSQL + Row-Level Security)
- **Identity**: World ID (Orb Legacy verify + Wallet SIWE fallback)
- **Deployment**: Vercel

## Getting Started

```bash
npm install
```

Apply the Supabase schema (one-time) by pasting `src/scripts/tc_init.sql` into the Supabase SQL Editor for the `world-apps` project.

Create `.env.local` with:

```
NEXT_PUBLIC_WLD_APP_ID=
NEXT_PUBLIC_WLD_ACTION=turingvote-vote
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DP_AUTH_SECRET=
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API Routes

| Route | Description |
|---|---|
| `GET /api/questions` | Random neutral question from `src/data/tc_questions.json` |
| `GET /api/questions?id=<n>` | Fetch a specific question by id |
| `POST /api/vote` | Cast a vote (dual verify: orb_legacy or wallet_siwe) |
| `GET /api/tally/[id]` | Aggregate A/B tally for the Reveal screen |
| `GET /api/auth/nonce` | SIWE nonce for wallet auth |
| `POST /api/auth/wallet` | Verify SIWE signature, mint session token |

## Deployment

Deploy to Vercel:

```bash
npx vercel deploy --prod --yes
```

Set the environment variables listed above in the Vercel project settings.

## License

MIT
