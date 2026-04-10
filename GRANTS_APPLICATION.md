# Daily Predict — World Foundation Grants Application (Spark Track)

## Problem Statement
In a world flooded with AI-generated opinions and bot activity, there is no way to know what *real humans* think about tomorrow's events. Existing prediction markets (Polymarket, Kalshi) require real money and attract speculators, not everyday people. There is no casual, free, daily prediction game that guarantees one-person-one-vote through proof of personhood.

## Solution
Daily Predict is a free daily prediction game where World ID-verified humans vote on real-world outcomes. One question per day. One vote per person. Results the next day. Simple.

## Key Features (Live)
- World ID Orb-level verification via IDKit (sybil-resistant, orbLegacy preset)
- Daily prediction questions across 6 categories (crypto, world, weather, tech, sports, entertainment)
- Real-time vote distribution display
- Leaderboard with weekly/monthly/all-time rankings
- Profile with accuracy stats, calendar heatmap, and badge system
- **6-language support (EN/JA/ES/KO/TH/PT)** — meets World Mini App i18n requirements
- Deep link sharing for viral growth
- Anonymous-by-default identity (`#xxxxxx` auto-handle) preserving World ID privacy

## Technical Stack
- Next.js 16 + React 19 + TypeScript + Tailwind
- Supabase (PostgreSQL + RLS)
- @worldcoin/idkit-core + @worldcoin/mini-apps-ui-kit-react
- Server-side RP signature flow (signRequest) + v4 verify endpoint
- Vercel deployment with cron jobs for daily question generation/resolution
- Rate limiting middleware
- Atomic vote counting (no race conditions)
- Anthropic Claude API for automated daily question generation

## Traction
- App verified end-to-end on World App (April 2026)
- Re-submitted for review after migrating to the IDKit orbLegacy flow
- Live at https://daily-predict-two.vercel.app
- 196 supported countries, 6 localized languages

## Milestones
| Timeline | Milestone |
|---|---|
| April 2026 | App review approval + first 100 DAU |
| May 2026 | 500 DAU + Phase 3 WLD Login Rewards launched |
| June 2026 | 1,000 DAU + Dev Rewards qualification |
| July 2026 | AgentKit integration + AI-powered question generation |
| Q3 2026 | 5,000 DAU + second Mini App launch |

## WLD Distribution Design (Phase 3 — Post-Grant Launch)

Daily Predict is designed to **return a portion of received grants back to verified human users** as a retention mechanism. This creates a direct flywheel between Grant funding and ecosystem DAU.

### Design: 7-Day Streak Login Rewards

A pure utility-based daily check-in bonus tied to actual app usage (prediction voting). **No gambling mechanics**, **no claim flow**, **no tiers** — fully automatic and transparent.

```
Day 1: 0.001 WLD  ┐
Day 2: 0.001 WLD  │
Day 3: 0.001 WLD  │ 6 base days
Day 4: 0.001 WLD  │
Day 5: 0.001 WLD  │
Day 6: 0.001 WLD  ┘
Day 7: 0.010 WLD  ← streak-complete bonus (10x)

Per-week max: 0.016 WLD per user
Per-year max: 0.832 WLD per user
```

- **Trigger**: User submits a prediction on a given UTC day → eligible
- **Streak tracking**: Resets to Day 1 if the user misses a day
- **Distribution**: MiniKit Pay, automatic batch at UTC midnight via Vercel Cron
- **Budget allocation**: 20–30% of received Grant amount is reserved as the user rewards treasury

### Why Login Bonus (not Pro-Rata or Prize Pool)

| Concern | Pro-rata pool | Prize pool (winners) | **Login bonus (selected)** |
|---|---|---|---|
| Gambling classification (Apple 5.3) | Grey | **High risk** | **Zero risk** |
| CS overhead | Medium | High | **Near-zero** |
| Rule transparency | Formula-based | Subjective | **One-sentence rule** |
| Sybil resistance | Weak without World ID | Weak | **Perfect** (1 person = 1 account) |
| DAU alignment | Indirect | Indirect | **Direct by definition** |

### Budget Projection

| DAU | Max annual reward cost (WLD) | At $2/WLD |
|---|---|---|
| 100 | 83 | $166 |
| 1,000 | 832 | $1,664 |
| 5,000 | 4,160 | $8,320 |
| 10,000 | 8,320 | $16,640 |

With a 1,000 WLD treasury allocation, Daily Predict can sustain 1,000 active users for ~10 months without additional funding. This is directly visible to users via the in-app Rewards History page.

### CS Cost Minimization

- **No claim flow** — users do nothing, rewards auto-deposited
- **Public formula** — no "why did I get X?" questions
- **On-chain verification** — users can verify via Worldchain explorer themselves
- **FAQ preempts 80%+ of questions**
- **Tax responsibility disclaimer** — users responsible for their own reporting
- **Dust threshold** — payments below 0.001 WLD rolled over (no micro-disputes)

## Team
Solo developer (Shinya, Nagoya, Japan). Full-stack development with AI-assisted workflow. Previously built Human Poll (World App Mini App prototype).

## Budget Request
Spark-level grant to cover:
- Supabase Pro plan ($25/mo)
- Vercel Pro plan ($20/mo)
- Anthropic API for daily question generation ($10/mo)
- Marketing/user acquisition

## Links
- Live App: https://daily-predict-two.vercel.app
- Developer Portal: app_9ea9956fcd3bcb53a6accf1e93383e22
- Privacy Policy: https://daily-predict-two.vercel.app/privacy
- Terms of Service: https://daily-predict-two.vercel.app/terms
