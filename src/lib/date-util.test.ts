/**
 * Tests for date-util.ts.
 * Run with: npx tsx src/lib/date-util.test.ts
 */

import {
  jstDateString,
  jstStartOfDay,
  jstEndOfDay,
  jstStartOfDayDelta,
  jstYearMonth,
  todaysCloseAt,
} from "./date-util";

let pass = 0;
let fail = 0;

function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`✓ ${label}`);
    pass++;
  } else {
    console.error(`✗ ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
    fail++;
    process.exitCode = 1;
  }
}

// jstDateString — moments at JST boundaries
eq(jstDateString(new Date("2026-04-07T14:59:59.999Z")), "2026-04-07", "1 minute before JST midnight = same JST day");
eq(jstDateString(new Date("2026-04-07T15:00:00.000Z")), "2026-04-08", "JST midnight = next JST day");
eq(jstDateString(new Date("2026-04-07T23:59:00.000Z")), "2026-04-08", "JST 8:59am = next JST day");
eq(jstDateString(new Date("2026-04-08T14:59:59.999Z")), "2026-04-08", "8:59 JST next day");

// jstStartOfDay — converts back to UTC
eq(
  jstStartOfDay(new Date("2026-04-08T05:00:00.000Z")).toISOString(),
  "2026-04-07T15:00:00.000Z",
  "JST start of Apr 8 (when given UTC noon Apr 8) = 2026-04-07T15:00 UTC"
);

// Apr 8 02:00 JST → JST date is "2026-04-08", start = 2026-04-07T15:00 UTC
eq(
  jstStartOfDay(new Date("2026-04-07T17:00:00.000Z")).toISOString(),
  "2026-04-07T15:00:00.000Z",
  "Apr 8 02:00 JST → Apr 8 JST start = Apr 7 15:00 UTC"
);

// jstEndOfDay
eq(
  jstEndOfDay(new Date("2026-04-08T05:00:00.000Z")).toISOString(),
  "2026-04-08T15:00:00.000Z",
  "JST end of Apr 8 = next day 00:00 JST = 2026-04-08T15:00 UTC"
);

// jstStartOfDayDelta
eq(
  jstStartOfDayDelta(-1, new Date("2026-04-08T05:00:00.000Z")).toISOString(),
  "2026-04-06T15:00:00.000Z",
  "yesterday JST start"
);
eq(
  jstStartOfDayDelta(0, new Date("2026-04-08T05:00:00.000Z")).toISOString(),
  "2026-04-07T15:00:00.000Z",
  "today JST start (delta 0)"
);

// jstYearMonth — handles month boundary
eq(
  jstYearMonth(new Date("2026-03-31T20:00:00.000Z")), // Apr 1 05:00 JST
  { year: 2026, month: 4 },
  "JST Apr 1 morning (UTC Mar 31 evening) → year=2026 month=4"
);
eq(
  jstYearMonth(new Date("2026-04-01T14:59:59.000Z")), // Mar 31 23:59 JST? No → Apr 1 23:59 JST
  { year: 2026, month: 4 },
  "JST Apr 1 23:59 → still month 4"
);
eq(
  jstYearMonth(new Date("2026-04-01T15:00:00.000Z")), // Apr 2 00:00 JST
  { year: 2026, month: 4 },
  "JST Apr 2 00:00 → still month 4"
);

// todaysCloseAt — should be 23:59 JST
{
  const close = todaysCloseAt(new Date("2026-04-08T05:00:00.000Z")); // Apr 8 14:00 JST
  // Should return Apr 8 23:59 JST = Apr 8 14:59 UTC
  eq(close.toISOString(), "2026-04-08T14:59:00.000Z", "todaysCloseAt for mid-day JST = same day 23:59");
}
{
  // Already past 23:59 JST today → return tomorrow's close
  const close = todaysCloseAt(new Date("2026-04-08T15:30:00.000Z")); // Apr 9 00:30 JST
  eq(close.toISOString(), "2026-04-09T14:59:00.000Z", "todaysCloseAt past today's close → tomorrow");
}

console.log(`\n${pass} passed, ${fail} failed`);
