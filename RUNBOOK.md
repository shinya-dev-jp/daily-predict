# Daily Predict -- Operational Runbook

## Dashboards

- **Vercel Dashboard**: https://vercel.com (project: `daily-predict-two`)
- **Supabase Dashboard**: Check `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` -- open that URL in browser, replace `.supabase.co` path with Supabase Studio at https://supabase.com/dashboard
- **Live App**: https://daily-predict-two.vercel.app

---

## Environment Variables Checklist

All of these must be set in Vercel Project Settings > Environment Variables:

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_WLD_APP_ID` | Yes | World App ID (`app_xxx...`) |
| `NEXT_PUBLIC_WLD_ACTION` | Yes | World ID action name (e.g. `daily-predict-verify`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for question generation |
| `CRON_SECRET` | Yes | Shared secret for cron job auth |
| `COINGECKO_API_KEY` | No | For crypto price resolution |
| `OPENWEATHER_API_KEY` | No | For weather resolution |

---

## Daily Operations

### Check if today's question exists

**Via API:**
```bash
curl -s https://daily-predict-two.vercel.app/api/question | jq '.today'
```

If `today` is `null`, no question has been generated for today.

**Via Supabase SQL Editor:**
```sql
SELECT id, question_en, status, closes_at, vote_count
FROM predictions
WHERE created_at >= now()::date
  AND status IN ('open', 'closed')
ORDER BY created_at DESC
LIMIT 1;
```

### Manually trigger question generation

```bash
curl -X POST https://daily-predict-two.vercel.app/api/cron/generate \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Or use GET (Vercel Cron format):
```bash
curl https://daily-predict-two.vercel.app/api/cron/generate \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Replace `YOUR_CRON_SECRET` with the value of the `CRON_SECRET` env var.

### Manually resolve a prediction

```bash
curl -X POST https://daily-predict-two.vercel.app/api/cron/resolve \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

This will:
1. Close any open predictions whose `closes_at` has passed
2. Resolve closed predictions (determine result via CoinGecko for crypto, majority vote fallback for others)
3. Update user stats (total_correct, streak, points)

### Manually resolve a specific prediction via SQL

```sql
-- Set the result directly
UPDATE predictions
SET status = 'resolved', result = 'A'  -- or 'B'
WHERE id = '<prediction-uuid>';

-- Then mark user_predictions
UPDATE user_predictions SET is_correct = true
WHERE prediction_id = '<prediction-uuid>' AND chosen_option = 'A';

UPDATE user_predictions SET is_correct = false
WHERE prediction_id = '<prediction-uuid>' AND chosen_option = 'B';
```

---

## Cron Job Schedule

Configured in `vercel.json`:

| Job | Path | Schedule (UTC) | Description |
|---|---|---|---|
| Generate | `/api/cron/generate` | `0 21 * * *` (21:00 UTC = 06:00 JST) | Creates tomorrow's question |
| Resolve | `/api/cron/resolve` | `0 22 * * *` (22:00 UTC = 07:00 JST) | Closes expired predictions & resolves results |

### Check cron job status on Vercel

1. Go to Vercel Dashboard > Project > Settings > Cron Jobs
2. Each cron job shows last execution time and status
3. Click on a job to see execution logs

Alternatively, check Vercel Functions logs:
- Vercel Dashboard > Project > Logs
- Filter by `/api/cron/generate` or `/api/cron/resolve`

---

## Common Error Scenarios

### 1. "today" is null in /api/question

**Cause**: No question generated today. Either the cron job failed or hasn't run yet.

**Fix**: Manually trigger generation (see above). The app falls back to demo data in the UI so users still see content.

### 2. Cron job returns 401 Unauthorized

**Cause**: `CRON_SECRET` env var is missing or doesn't match.

**Fix**: Verify `CRON_SECRET` is set in Vercel Environment Variables and matches what Vercel Cron sends.

### 3. Supabase connection errors (500 on /api/question)

**Cause**: Missing or invalid `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_PUBLIC_SUPABASE_URL`.

**Fix**: Check env vars in Vercel. Verify the Supabase project is active and not paused.

### 4. Claude API fails during question generation

**Cause**: Invalid `ANTHROPIC_API_KEY` or API quota exceeded.

**Fix**: The generate endpoint has fallback questions built in. It will insert a random fallback question from a predefined list (Bitcoin, S&P 500, Tokyo weather, tech AI). Check logs for the specific error.

### 5. Crypto prediction not resolving correctly

**Cause**: CoinGecko API may be rate-limited or the question text doesn't contain a recognizable price threshold (e.g. `$85,000`).

**Fix**: The resolver falls back to majority vote if CoinGecko fails. For manual resolution, use the SQL method above.

### 6. User gets "Prediction not found" or 404

**Cause**: The prediction ID in the client state doesn't match any row in the database.

**Fix**: Hard refresh the app. Check if the predictions table has the expected row.

### 7. Duplicate prediction error (409)

**Cause**: User has already voted on this prediction (unique constraint on `user_address + prediction_id`).

**Expected behavior**: The UI should prevent double-voting. The 409 is a safety net.

---

## Database Schema Quick Reference

- **predictions**: One row per daily question. Fields: `id`, `question_en`, `question_ja`, `option_a`, `option_b`, `category`, `status`, `closes_at`, `result`, `vote_count`, `option_a_votes`
- **users**: One row per World-ID-verified user. Primary key: `address` (nullifier hash). Tracks `total_predictions`, `total_correct`, `streak`, `points`
- **user_predictions**: One row per user per prediction. Unique on `(user_address, prediction_id)`. Tracks `chosen_option` and `is_correct`
- **weekly_leaderboard**: Materialized view for leaderboard. Refresh with `REFRESH MATERIALIZED VIEW weekly_leaderboard;`

---

## Deployment

```bash
cd /Users/Shinya/daily-predict
npx vercel deploy --prod --yes
```

Or push to the connected Git branch for automatic deployment.
