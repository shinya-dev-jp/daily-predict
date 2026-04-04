# Daily Predict

A daily prediction game for World App. Verified humans make one prediction per day and compete for WLD rewards.

## Tech Stack

- **Framework**: Next.js 16 / React 19 / TypeScript
- **Styling**: Tailwind CSS 4
- **Backend**: Supabase (PostgreSQL + Row-Level Security)
- **Identity**: World ID via MiniKit SDK
- **AI**: Anthropic Claude API (question generation)
- **Deployment**: Vercel

## Getting Started

```bash
npm install
```

Create `.env.local` with the required variables:

```
NEXT_PUBLIC_WLD_APP_ID=
NEXT_PUBLIC_WLD_ACTION=daily-predict-verify
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
CRON_SECRET=
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API Routes

| Route | Description |
|---|---|
| `/api/question` | Fetch or generate today's prediction question |
| `/api/predict` | Submit a user's prediction |
| `/api/verify` | Verify World ID proof |
| `/api/cron` | Scheduled tasks (resolve yesterday's question, generate new) |

## Deployment

Deploy to Vercel:

```bash
npx vercel deploy --prod --yes
```

Set the environment variables listed above in the Vercel project settings.

## License

MIT
