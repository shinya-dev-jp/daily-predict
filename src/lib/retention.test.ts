import { strict as assert } from "assert";
import { getIsoWeekId, selectWeeklyPackQuestions, WEEKLY_PACK_SIZE } from "./retention";

const pool = Array.from({ length: 12 }, (_, index) => ({ id: index + 1 }));

assert.equal(getIsoWeekId(new Date("2026-05-24T00:00:00Z")), "2026-W21");

const first = selectWeeklyPackQuestions(pool, "2026-W21");
const second = selectWeeklyPackQuestions(pool, "2026-W21");
assert.deepEqual(first, second);
assert.equal(first.length, WEEKLY_PACK_SIZE);
assert.equal(new Set(first.map((q) => q.id)).size, first.length);

const smallPool = pool.slice(0, 3);
assert.deepEqual(selectWeeklyPackQuestions(smallPool, "2026-W21"), smallPool);
