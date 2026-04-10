/**
 * ============================================================================
 * Daily Predict — Login Rewards Distribution (SKELETON, not yet wired)
 * ============================================================================
 *
 * Phase 3 implementation, activated AFTER Grants funds are received.
 * Design rationale lives in GRANTS_APPLICATION.md → "WLD Distribution Design".
 *
 * Activation checklist (do NOT enable until all true):
 *   1. Daily Predict app review approved by Worldcoin (live in World App)
 *   2. Spark Track grant received (treasury funded with WLD)
 *   3. DAU > 500 (so login bonus drives positive ROI)
 *   4. Supabase migration applied (user_streaks + reward_payouts tables)
 *   5. Vercel Cron added in vercel.json
 *   6. RewardsTreasury wallet has sufficient balance + monitoring alert
 *   7. FAQ page deployed
 *   8. Tax disclaimer in TOS
 *
 * Once enabled:
 *   - Wire awardDailyBonus() into /api/predict on successful vote
 *   - Add /api/cron/distribute-rewards endpoint calling distributeWeeklyBatch()
 *   - Add Supabase RLS policies on the new tables
 *   - Move this file to src/lib/rewards.ts
 * ============================================================================
 */

// import { supabaseAdmin } from "./supabase";
// import { MiniKit, Tokens, tokenToDecimals } from "@worldcoin/minikit-js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — adjust per Grant treasury size
// ─────────────────────────────────────────────────────────────────────────────

const REWARD_CONFIG = {
  /** WLD per day for days 1-6 of streak */
  DAILY_BASE: 0.001,
  /** WLD bonus on day 7 (streak completion) */
  DAY7_BONUS: 0.01,
  /** Streak resets after this many days */
  STREAK_LENGTH: 7,
  /** Don't pay below this threshold (anti-dust) */
  DUST_THRESHOLD: 0.001,
  /** Hard cap per user per month (safety net) */
  MONTHLY_CAP_PER_USER: 0.1,
  /** Treasury wallet alerts when balance drops below this */
  TREASURY_LOW_THRESHOLD: 50,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Database schema (Supabase migration)
// ─────────────────────────────────────────────────────────────────────────────
//
// CREATE TABLE user_streaks (
//   user_address TEXT PRIMARY KEY REFERENCES users(address) ON DELETE CASCADE,
//   current_streak_day INTEGER NOT NULL DEFAULT 0,
//   last_checkin_date DATE,
//   total_bonuses_received_wld NUMERIC(18, 6) NOT NULL DEFAULT 0,
//   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );
//
// CREATE TABLE reward_payouts (
//   id BIGSERIAL PRIMARY KEY,
//   user_address TEXT NOT NULL REFERENCES users(address),
//   amount_wld NUMERIC(18, 6) NOT NULL,
//   streak_day INTEGER NOT NULL,
//   payout_date DATE NOT NULL,
//   tx_hash TEXT,
//   tx_status TEXT NOT NULL DEFAULT 'pending',
//   reference TEXT UNIQUE NOT NULL,
//   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );
//
// CREATE INDEX idx_payouts_user ON reward_payouts(user_address);
// CREATE INDEX idx_payouts_date ON reward_payouts(payout_date);
//
// ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;
// ALTER TABLE reward_payouts ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Public read own streak" ON user_streaks FOR SELECT
//   USING (true);
// CREATE POLICY "Public read own payouts" ON reward_payouts FOR SELECT
//   USING (true);

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic — easy to unit test
// ─────────────────────────────────────────────────────────────────────────────

export interface StreakState {
  user_address: string;
  current_streak_day: number;
  last_checkin_date: string | null; // ISO date YYYY-MM-DD
  total_bonuses_received_wld: number;
}

export interface BonusDecision {
  shouldPay: boolean;
  newStreakDay: number;
  amountWld: number;
  reason: "first_checkin" | "streak_continued" | "streak_reset" | "already_paid_today";
}

/**
 * Decide what bonus to award based on current streak state and today's date.
 * Pure function — no DB or network. Used by both real awarding and tests.
 */
export function decideBonus(state: StreakState, todayUtc: string): BonusDecision {
  // Already paid today — no double bonus
  if (state.last_checkin_date === todayUtc) {
    return {
      shouldPay: false,
      newStreakDay: state.current_streak_day,
      amountWld: 0,
      reason: "already_paid_today",
    };
  }

  const yesterdayUtc = previousUtcDate(todayUtc);
  const continuesStreak = state.last_checkin_date === yesterdayUtc;

  // Determine new streak day:
  //  - never checked in → day 1
  //  - continued from yesterday → previous + 1
  //  - missed a day → reset to 1
  let newStreakDay: number;
  let reason: BonusDecision["reason"];
  if (state.last_checkin_date === null) {
    newStreakDay = 1;
    reason = "first_checkin";
  } else if (continuesStreak) {
    newStreakDay = state.current_streak_day + 1;
    reason = "streak_continued";
  } else {
    newStreakDay = 1;
    reason = "streak_reset";
  }

  const amountWld =
    newStreakDay === REWARD_CONFIG.STREAK_LENGTH
      ? REWARD_CONFIG.DAY7_BONUS
      : REWARD_CONFIG.DAILY_BASE;

  return {
    shouldPay: amountWld >= REWARD_CONFIG.DUST_THRESHOLD,
    newStreakDay,
    amountWld,
    reason,
  };
}

/**
 * After paying day 7, the streak should reset back to 0 so the user starts a
 * fresh week on their next check-in. Returns the next-state streak day to
 * persist.
 */
export function postPayoutStreak(streakDayJustPaid: number): number {
  return streakDayJustPaid === REWARD_CONFIG.STREAK_LENGTH ? 0 : streakDayJustPaid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers (UTC-only to avoid timezone bugs)
// ─────────────────────────────────────────────────────────────────────────────

export function todayUtcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function previousUtcDate(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Side-effecting flow (commented out — wire up at activation time)
// ─────────────────────────────────────────────────────────────────────────────

/*
export async function awardDailyBonus(userAddress: string): Promise<void> {
  const today = todayUtcDate();

  // 1. Load or initialize streak state
  const { data: existing } = await supabaseAdmin
    .from("user_streaks")
    .select("*")
    .eq("user_address", userAddress)
    .maybeSingle();

  const state: StreakState = existing ?? {
    user_address: userAddress,
    current_streak_day: 0,
    last_checkin_date: null,
    total_bonuses_received_wld: 0,
  };

  // 2. Pure decision
  const decision = decideBonus(state, today);
  if (!decision.shouldPay) return;

  // 3. Idempotent reference for this exact payout
  const reference = `bonus-${today}-${userAddress}`;

  // 4. Check monthly cap (safety net)
  const monthStart = today.slice(0, 7) + "-01";
  const { data: paidThisMonth } = await supabaseAdmin
    .from("reward_payouts")
    .select("amount_wld")
    .eq("user_address", userAddress)
    .gte("payout_date", monthStart);
  const monthTotal = (paidThisMonth ?? []).reduce(
    (sum, r) => sum + Number(r.amount_wld),
    0
  );
  if (monthTotal + decision.amountWld > REWARD_CONFIG.MONTHLY_CAP_PER_USER) {
    console.warn(`[rewards] Monthly cap reached for ${userAddress}`);
    return;
  }

  // 5. Insert pending payout (uniqueness on reference prevents double-pay)
  const { error: insertErr } = await supabaseAdmin
    .from("reward_payouts")
    .insert({
      user_address: userAddress,
      amount_wld: decision.amountWld,
      streak_day: decision.newStreakDay,
      payout_date: today,
      reference,
      tx_status: "pending",
    });
  if (insertErr) {
    if (insertErr.code === "23505") return; // duplicate reference = already processing
    throw insertErr;
  }

  // 6. Update streak state (regardless of payout success — user did check in)
  await supabaseAdmin
    .from("user_streaks")
    .upsert({
      user_address: userAddress,
      current_streak_day: postPayoutStreak(decision.newStreakDay),
      last_checkin_date: today,
      total_bonuses_received_wld: state.total_bonuses_received_wld + decision.amountWld,
      updated_at: new Date().toISOString(),
    });

  // 7. Send the WLD via MiniKit Pay (server-initiated)
  // NOTE: MiniKit Pay is client-initiated by default. For server-side automated
  // payouts you need either:
  //   (a) a treasury wallet + raw on-chain transfer via viem/ethers
  //   (b) the user opens the app and we trigger an in-flow MiniKit.commandsAsync.pay
  // Approach (a) is the right pattern for auto-distribution.
  //
  // try {
  //   const txHash = await sendWldFromTreasury({
  //     to: userAddress,
  //     amount: decision.amountWld,
  //     reference,
  //   });
  //   await supabaseAdmin
  //     .from("reward_payouts")
  //     .update({ tx_status: "success", tx_hash: txHash })
  //     .eq("reference", reference);
  // } catch (err) {
  //   console.error("[rewards] Payout failed", reference, err);
  //   await supabaseAdmin
  //     .from("reward_payouts")
  //     .update({ tx_status: "failed" })
  //     .eq("reference", reference);
  //   // Failed payouts are retried by the daily reconciliation cron
  // }
}

export async function distributeWeeklyBatch(): Promise<void> {
  // Re-tries any payouts in 'pending' or 'failed' state that haven't been sent.
  // Runs from /api/cron/distribute-rewards on a daily schedule.
  const { data: pending } = await supabaseAdmin
    .from("reward_payouts")
    .select("*")
    .in("tx_status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(500);

  for (const payout of pending ?? []) {
    // ... retry sendWldFromTreasury ...
  }
}
*/
