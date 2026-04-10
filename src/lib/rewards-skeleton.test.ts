/**
 * Pure-logic tests for the login rewards skeleton.
 * Run with `npx tsx src/lib/rewards-skeleton.test.ts` once activated.
 *
 * No test runner is wired up yet — this is a self-asserting script that
 * documents the intended behavior of decideBonus() / postPayoutStreak() so the
 * activation phase can verify nothing regressed before going live.
 */

import {
  decideBonus,
  postPayoutStreak,
  todayUtcDate,
  previousUtcDate,
  type StreakState,
} from "./rewards-skeleton";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`✗ ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

const today = "2026-04-08";
const yesterday = "2026-04-07";
const twoDaysAgo = "2026-04-06";

// ─── First check-in ─────────────────────────────────────────────────────────
{
  const state: StreakState = {
    user_address: "0xabc",
    current_streak_day: 0,
    last_checkin_date: null,
    total_bonuses_received_wld: 0,
  };
  const d = decideBonus(state, today);
  assertEqual(d.shouldPay, true, "first check-in pays");
  assertEqual(d.newStreakDay, 1, "first check-in starts day 1");
  assertEqual(d.amountWld, 0.001, "day 1 amount is 0.001");
  assertEqual(d.reason, "first_checkin", "first check-in reason");
}

// ─── Continued streak ───────────────────────────────────────────────────────
{
  const state: StreakState = {
    user_address: "0xabc",
    current_streak_day: 3,
    last_checkin_date: yesterday,
    total_bonuses_received_wld: 0.003,
  };
  const d = decideBonus(state, today);
  assertEqual(d.newStreakDay, 4, "continued streak goes to day 4");
  assertEqual(d.amountWld, 0.001, "day 4 still base reward");
  assertEqual(d.reason, "streak_continued", "continued reason");
}

// ─── Day 7 streak completion ────────────────────────────────────────────────
{
  const state: StreakState = {
    user_address: "0xabc",
    current_streak_day: 6,
    last_checkin_date: yesterday,
    total_bonuses_received_wld: 0.006,
  };
  const d = decideBonus(state, today);
  assertEqual(d.newStreakDay, 7, "day 7 reached");
  assertEqual(d.amountWld, 0.01, "day 7 pays 0.01 bonus");
  assertEqual(postPayoutStreak(7), 0, "day 7 resets streak after payout");
}

// ─── Streak reset after a missed day ────────────────────────────────────────
{
  const state: StreakState = {
    user_address: "0xabc",
    current_streak_day: 5,
    last_checkin_date: twoDaysAgo, // skipped yesterday
    total_bonuses_received_wld: 0.005,
  };
  const d = decideBonus(state, today);
  assertEqual(d.newStreakDay, 1, "missed day resets to 1");
  assertEqual(d.amountWld, 0.001, "reset gives day 1 reward");
  assertEqual(d.reason, "streak_reset", "reset reason");
}

// ─── Already paid today (idempotent) ────────────────────────────────────────
{
  const state: StreakState = {
    user_address: "0xabc",
    current_streak_day: 4,
    last_checkin_date: today,
    total_bonuses_received_wld: 0.004,
  };
  const d = decideBonus(state, today);
  assertEqual(d.shouldPay, false, "double-pay blocked");
  assertEqual(d.reason, "already_paid_today", "already paid reason");
}

// ─── Date helpers ───────────────────────────────────────────────────────────
{
  assertEqual(previousUtcDate("2026-04-01"), "2026-03-31", "month boundary");
  assertEqual(previousUtcDate("2026-01-01"), "2025-12-31", "year boundary");
  assertEqual(typeof todayUtcDate(), "string", "todayUtcDate returns string");
}

console.log("\nDone. Activate the rewards system once all tests are green and the activation checklist in rewards-skeleton.ts is satisfied.");
