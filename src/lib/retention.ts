export const WEEKLY_PACK_SIZE = 5;

function getIsoWeekParts(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function getIsoWeekId(date = new Date()): string {
  const { year, week } = getIsoWeekParts(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function selectWeeklyPackQuestions<T extends { id: number }>(
  pool: T[],
  weekId = getIsoWeekId(),
  packSize = WEEKLY_PACK_SIZE,
): T[] {
  if (pool.length <= packSize) return [...pool];
  const sorted = [...pool].sort((a, b) => a.id - b.id);
  const chunkCount = Math.ceil(sorted.length / packSize);
  const startChunk = stableHash(weekId) % chunkCount;
  const result: T[] = [];

  for (let offset = 0; offset < chunkCount && result.length < packSize; offset++) {
    const chunk = (startChunk + offset) % chunkCount;
    const start = chunk * packSize;
    result.push(...sorted.slice(start, start + packSize));
  }

  return result.slice(0, packSize);
}
