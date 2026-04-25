import { NextRequest, NextResponse } from "next/server";

/**
 * ⚠ INTERIM in-memory rate limiter — NOT production-grade.
 *
 * ── 既知の欠点 ──────────────────────────────────────────────────────────────
 * ・ cold start でリセット(= 再デプロイ直後は保護が一度消える)
 * ・ Vercel Functions は region/instance ごとに独立したメモリ空間を持つため、
 *    同じ IP でも別インスタンスに振られた呼び出しはカウントが分断される
 * ・ 悪意ある高頻度呼び出しで OOM したり、逆に全く効かないケースがありうる
 *
 * ── 置き換え計画 ────────────────────────────────────────────────────────────
 * Vercel Marketplace の Upstash Redis(KV-compat・無料枠あり)を provisioning
 * して `@upstash/ratelimit` で sliding window へ置き換える。
 * 手順:
 *   1. `vercel integration add upstash` で Redis を接続
 *   2. `vercel env pull` で UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN を同期
 *   3. 以下の関数を Upstash 版に差し替え、isRateLimited を async 化
 *   4. 中間のロールアウト期間は Upstash 失敗時に in-memory にフォールバック
 *
 * 重要度(MVP 段階では Warning 出しつつ暫定):
 *   VOTE / AUTH は Supabase 側で UNIQUE(nullifier,question_id) + SIWE nonce burn
 *   によって二重投票・replay を防いでいるので、"DoS 的 brute force を完全に
 *   止める" 責務は Upstash 統合完了までは負えない、と明記する。
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = 30; // requests per window
const WINDOW_MS = 60_000; // 1 minute
const MAX_MAP_SIZE = 10_000; // 冗長: 攻撃時に Map が無限膨張しないよう上限を設ける

// 起動時に1回だけ「これは暫定」警告を吐く。Vercel Functions は同一インスタンス
// 内で複数リクエストを処理するため、cold start ごとに1行だけ出る。
let warnedOnce = false;
function warnIfInterim() {
  if (warnedOnce) return;
  warnedOnce = true;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[middleware] Using INTERIM in-memory rate limiter. " +
        "Replace with Upstash Redis (Vercel Marketplace) before relying on this for abuse prevention.",
    );
  }
}

function isRateLimited(key: string): boolean {
  warnIfInterim();
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    // Map が肥大化したら一番古い半分を捨てる(防御的)。
    if (rateLimitMap.size >= MAX_MAP_SIZE) {
      const cutoff = now;
      for (const [k, v] of rateLimitMap) {
        if (v.resetAt <= cutoff) rateLimitMap.delete(k);
      }
      // まだ多ければ iteration 順(=挿入順)で先頭の半分を捨てる。
      if (rateLimitMap.size >= MAX_MAP_SIZE) {
        const target = Math.floor(MAX_MAP_SIZE / 2);
        let removed = 0;
        for (const k of rateLimitMap.keys()) {
          rateLimitMap.delete(k);
          if (++removed >= target) break;
        }
      }
    }
    rateLimitMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT;
}

// Next.js 16 の Routing Middleware は「proxy」命名に移行。function 名も
// proxy に揃えないと turbopack の prod build が export 検査で失敗する。
export function proxy(req: NextRequest) {
  // Only rate-limit API routes
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip cron routes (authenticated by CRON_SECRET)
  if (req.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // C9(Evaluator Round 2): 認証系エンドポイントを rate limit から除外。
  // World App の正規ユーザーは同一キャリア NAT 配下に集中するため、/api/auth/nonce
  // と /api/auth/wallet を 30 req/min/IP で絞ると、正規ログインが 429 で弾かれて
  // Worldcoin 審査で一発 Reject になる。
  //   - Replay 対策は /api/auth/nonce の Cookie-burn ロジックで担保
  //   - Brute-force 耐性は SIWE 署名検証の計算コスト(= 1回あたり数十ms)で担保
  //   - Upstash Redis 統合後は user-id ベースの緩い bucket(= IP 非依存)で再保護する予定
  if (req.nextUrl.pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // Skip analytics events: they are high-frequency by design (every screen
  // view, vote, etc) and would otherwise trip the per-IP limit. The endpoint
  // itself enforces a strict event whitelist + payload size cap to mitigate
  // abuse, and writes are silently rate-limited at the database level by
  // Supabase free-tier connection limits.
  if (req.nextUrl.pathname === "/api/events") {
    return NextResponse.next();
  }

  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${ip}:${req.nextUrl.pathname}`;

  if (isRateLimited(key)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
