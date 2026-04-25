import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAuthToken } from "@/lib/auth";
import { logError, logInfo } from "@/lib/server-log";
import { AUTH_COOKIE_NAME } from "@/lib/constants";
import questionsData from "@/data/tc_questions.json";

// tc_questions.json の全 question_id を起動時に1回だけ Set 化。
// クライアントが存在しない ID を投げ込んで Supabase に腐ったレコードを
// 作成するのを防ぐ。
const VALID_QUESTION_IDS = new Set<number>(
  (questionsData as { questions: { id: number }[] }).questions.map((q) => q.id),
);

/**
 * C1 対策 — Wallet tier の nullifier を HMAC で action-scoped pseudonym に変換。
 * 以前は wallet address を平文のまま nullifier_hash 列に入れていたため、
 * leaderboard 等の公開サーフェスから wallet を逆引きできる K-anonymity 違反が
 * あった。NULLIFIER_SECRET を環境変数に固定し、"turingvote-vote:" をドメイン
 * セパレータにすることで、他アプリのログに混入した同じ wallet から推測される
 * リスクも排除する。
 *
 * ── Secret 運用ルール(Evaluator Round 2 I-R2-1 対策)─────────────────────────
 * 1. **ROTATE 禁止**: secret を差し替えると、同じユーザーでも HMAC 出力が変わる。
 *    UNIQUE(nullifier_hash, question_id) は同じ wallet + 同じ質問の二重投票を
 *    防ぐ設計なので、secret が変わると同じ人の二票目が通ってしまう。Secret を
 *    変更する場合は、事前に tc_votes を空にして全ユーザーに再投票を促す以外の
 *    安全な経路はない(= "絶対に rotate しない" が運用既定)。
 * 2. **Vercel Production env 必須**: "NULLIFIER_SECRET" を Vercel Project settings
 *    の Environment Variables(Production + Preview)に 32 文字以上のランダム
 *    文字列で設定する。未設定だと wallet tier 投票が全滅するため、下の
 *    `assertNullifierSecret` で module load 時に 1回だけ loud に警告する。
 * 3. **他アプリとの secret 共有禁止**: "turingvote-vote:" プレフィックスで
 *    action-scope しているが、同じ secret を別アプリで使うと cross-app linkage
 *    の足場になる。TuringVote 専用の値を用いる。
 */
function walletToActionScopedNullifier(address: string): string | null {
  const secret = process.env.NULLIFIER_SECRET;
  if (!secret || secret.length < 16) {
    logError("api/vote", "NULLIFIER_SECRET missing or too short (<16 chars)");
    return null;
  }
  return createHmac("sha256", secret)
    .update(`turingvote-vote:${address.toLowerCase()}`)
    .digest("hex");
}

/**
 * Module load 時に NULLIFIER_SECRET の存在を自己診断する。未設定なら loud な
 * console.error を1回だけ吐いて、Vercel runtime log で誰でも気づけるようにする。
 * throw はしない(= deploy を止めない)。Secret が無い状態でも、fetch は 401 で
 * 返るため UX 上は "ログインしたのに投票できない" と見える。その状態は runtime
 * log + vote route の個別 error で二重に検知できる。
 */
(function assertNullifierSecret() {
  if (process.env.NODE_ENV === "test") return;
  const secret = process.env.NULLIFIER_SECRET;
  if (!secret || secret.length < 16) {
    console.error(
      "[api/vote] NULLIFIER_SECRET missing or <16 chars. " +
        "All wallet-tier votes will fail with 401. " +
        "Set it in Vercel Project → Settings → Environment Variables " +
        "(Production + Preview) to a 32+ char random string. " +
        "DO NOT ROTATE: changing this secret breaks UNIQUE(nullifier_hash, question_id) " +
        "and allows double-voting by users who voted under the previous secret.",
    );
  }
})();

type VerifyPayload = {
  verification_level?: "orb" | "device";
  merkle_root: string;
  nullifier_hash: string;
  proof: string;
};

type VoteBody = {
  question_id: number;
  choice: "A" | "B";
  verify_payload?: VerifyPayload;
};

type VerifiedIdentity = {
  nullifier: string;
  tier: "orb_legacy" | "wallet_siwe";
};

/**
 * POST /api/vote
 *
 * Dual-path verification. Either path is sufficient to cast a vote:
 *
 *   Path A — Orb legacy (preferred):
 *     Client passes `verify_payload` from IDKit/MiniKit `verify` command.
 *     We forward it to developer.world.org /api/v4/verify/{app_id}.
 *     On success, the verified `nullifier_hash` is the vote identity.
 *
 *   Path B — Wallet SIWE (fallback):
 *     HttpOnly Cookie `tv_auth` (set by /api/auth/wallet) carries the HMAC
 *     session token. We extract the wallet address from the token and use
 *     it as the identity.
 *
 * UNIQUE(nullifier_hash, question_id) in Supabase prevents double-voting.
 */
/**
 * I-R2-1(Evaluator Round 2): CSRF 防御の二層目。
 *
 * sameSite: "lax" Cookie は top-level POST も通してしまう環境があり、MiniKit の
 * webview コンテキストで同等に扱われる保証も無い。そのため Origin / Referer
 * header が TuringVote 本体 or World App webview/preview origin に一致することを
 * 追加で検証する。未知 origin からの POST は Cookie があっても弾く。
 *
 * 許可リスト:
 *   - 本番: https://turingvote.vercel.app
 *   - preview/branch: *.vercel.app(Shinya が Vercel の同一 project 以下で
 *     管理している前提。将来 Team を分けるならホスト名一致に狭める)
 *   - ローカル開発: http://localhost:3000, http://127.0.0.1:3000
 *   - World App webview: origin が空 or null で来るケースがあるため、その場合は
 *     Referer 側で再判定する
 */
function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const source = origin && origin !== "null" ? origin : referer;
  if (!source) {
    // World App webview で origin/referer が両方無いことは実運用で
    // 観測されているため、そのケースは blocking しない(= 通過させる)。
    // Cookie 側の authenticity と UNIQUE 制約で十分防御できる。
    return true;
  }
  try {
    const host = new URL(source).host;
    if (host === "turingvote.vercel.app") return true;
    if (host.endsWith(".vercel.app")) return true;
    if (host === "localhost:3000" || host === "127.0.0.1:3000") return true;
    return false;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // CSRF: Origin/Referer が許可リストに無い外部サイトからの POST を弾く。
  if (!isAllowedOrigin(req)) {
    logError("api/vote", "CSRF: origin rejected", {
      origin: req.headers.get("origin") ?? "(none)",
    });
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }

  let body: VoteBody;
  try {
    body = (await req.json()) as VoteBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { question_id, choice, verify_payload } = body;

  // C2: question_id は「正の整数」かつ「tc_questions.json に実在する ID」であることを保証。
  // 以前は Number.isFinite だけで済ませていたため、0 / 負数 / 小数 / 知らない整数も
  // 全て Supabase insert に流れ込んでいた。存在しない ID のレコードは leaderboard を
  // 汚染し、tally endpoint も 0/0 で返して UI を壊しうる。
  if (
    typeof question_id !== "number" ||
    !Number.isInteger(question_id) ||
    question_id <= 0 ||
    !VALID_QUESTION_IDS.has(question_id)
  ) {
    return NextResponse.json({ error: "missing or invalid question_id" }, { status: 400 });
  }
  if (choice !== "A" && choice !== "B") {
    return NextResponse.json({ error: "choice must be 'A' or 'B'" }, { status: 400 });
  }

  // HttpOnly Cookie からセッショントークンを取得(クライアントから読めない安全な経路)
  const authTokenFromCookie = req.cookies.get(AUTH_COOKIE_NAME)?.value;

  const identity = await resolveIdentity(question_id, verify_payload, authTokenFromCookie);
  if (!identity) {
    return NextResponse.json({ error: "verification_failed" }, { status: 401 });
  }
  // Q1 B+ — wallet has session but not Orb-verified yet
  if ("error" in identity && identity.error === "needs_orb_verify") {
    return NextResponse.json(
      { error: "needs_orb_verify", hint: "Call POST /api/auth/verify-orb with verify_payload first" },
      { status: 403 },
    );
  }

  const verifiedIdentity = identity as VerifiedIdentity;
  const supabase = getSupabaseAdmin();

  // Latency fix v2 (Shinya 2026-04-19 実機 2nd feedback「改善してない」):
  //   INSERT と tally SELECT を **並列** で実行し、返ってきた tally に対して
  //   今回の +1 を手元で合成する。sequential(v1)で 2RTT × 100ms = 200ms
  //   → parallel(v2)で 1RTT 分 = 100ms 節約。誤差は表示の 1 票だけで、
  //   次回 fetch で整合が取れる。23505(duplicate)の時だけは local 合成を
  //   せず素直に再取得する。
  const insertPromise = supabase
    .from("tc_votes")
    .insert({
      nullifier_hash: verifiedIdentity.nullifier,
      question_id,
      choice,
      verification_tier: verifiedIdentity.tier,
    });
  const tallyBeforePromise = fetchTally(supabase, question_id);

  const [{ error }, tallyBefore] = await Promise.all([
    insertPromise,
    tallyBeforePromise,
  ]);

  if (error) {
    if (error.code === "23505") {
      // Already voted — still try to return the current tally so the UI can
      // re-render the result instead of leaving the user on a dead state.
      return NextResponse.json(
        { error: "already_voted", tally: tallyBefore },
        { status: 409 },
      );
    }
    // ログには code と汎用カテゴリのみ残す。Supabase のエラーメッセージは
    // 競合キー値(=nullifier)を含む可能性があるため記録しない。
    logError("api/vote", "insert failed", { code: error.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // R2 C3 fix: 並列取得した tally に今回の +1 を合成(round trip を 1 回分節約)。
  //   tallyBefore が null(fetchTally 失敗 or データなし)の場合に「1 票だけ」
  //   の fabricated tally を返すと、ユーザーに「自分一人しか投票してない」と
  //   誤解させる UI になる(Evaluator Round 1 指摘)。代わりに tally=null を
  //   返し、クライアント側で「集計準備中」プレースホルダを出す。
  const tally = tallyBefore
    ? {
        ...tallyBefore,
        total_votes: tallyBefore.total_votes + 1,
        votes_a: choice === "A" ? tallyBefore.votes_a + 1 : tallyBefore.votes_a,
        votes_b: choice === "B" ? tallyBefore.votes_b + 1 : tallyBefore.votes_b,
      }
    : null;

  logInfo("api/vote", "vote recorded", {
    question_id,
    choice,
    tier: verifiedIdentity.tier,
  });
  return NextResponse.json({
    success: true,
    tier: verifiedIdentity.tier,
    tally,
  });
}

async function fetchTally(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  questionId: number,
) {
  const { data, error } = await supabase
    .from("tc_question_tally")
    .select("question_id, category, total_votes, votes_a, votes_b")
    .eq("question_id", questionId)
    .maybeSingle();
  if (error) {
    logError("api/vote", "tally fetch failed (non-fatal)", { code: error.code });
    return null;
  }
  // data=null(view に該当行なし=まだ誰も投票してない)は 0/0 の tally で返す。
  // これは「集計ゼロ」という事実。fabricated ではない。
  return (
    data ?? {
      question_id: questionId,
      category: null,
      total_votes: 0,
      votes_a: 0,
      votes_b: 0,
    }
  );
}

async function resolveIdentity(
  questionId: number,
  verifyPayload: VerifyPayload | undefined,
  authToken: string | undefined,
): Promise<VerifiedIdentity | { error: "needs_orb_verify" } | null> {
  if (verifyPayload) {
    const ok = await verifyOrbLegacy(questionId, verifyPayload);
    if (ok) {
      return { nullifier: verifyPayload.nullifier_hash, tier: "orb_legacy" };
    }
  }

  if (authToken) {
    const address = verifyAuthToken(authToken);
    if (address) {
      // Q1 B+ (2026-04-19): require one-time Orb verification per wallet.
      // walletAuth alone proves "I control this wallet" (★1 Sybil — wallets
      // are infinite). Combining with users.orb_verified_at gates voting
      // behind "the human who controls this wallet has Orb-proved themselves
      // at least once" → ★3 Sybil resistance, no per-vote auth dialog.
      const { data: userRow } = await getSupabaseAdmin()
        .from("users")
        .select("orb_verified_at")
        .eq("address", address)
        .maybeSingle();
      if (!userRow?.orb_verified_at) {
        return { error: "needs_orb_verify" };
      }
      // C1: wallet address は K-anonymity 違反になるため、HMAC で
      // action-scoped pseudonym に変換してから nullifier_hash に入れる。
      const nullifier = walletToActionScopedNullifier(address);
      if (nullifier) {
        return { nullifier, tier: "wallet_siwe" };
      }
      // NULLIFIER_SECRET 未設定なら wallet tier での投票を拒否(fail-closed)。
      logError("api/vote", "wallet tier rejected: NULLIFIER_SECRET missing");
    }
  }

  return null;
}

async function verifyOrbLegacy(
  questionId: number,
  payload: VerifyPayload,
): Promise<boolean> {
  const appId = process.env.NEXT_PUBLIC_WLD_APP_ID;
  const action = process.env.NEXT_PUBLIC_WLD_ACTION ?? "turingvote-vote";
  if (!appId) {
    logError("api/vote", "NEXT_PUBLIC_WLD_APP_ID missing");
    return false;
  }

  const signalHash = hashSignal(String(questionId));
  const identifier = payload.verification_level === "device" ? "device" : "orb";

  try {
    const res = await fetch(`https://developer.world.org/api/v4/verify/${appId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocol_version: "3.0",
        nonce: signalHash,
        action,
        responses: [
          {
            identifier,
            merkle_root: payload.merkle_root,
            nullifier: payload.nullifier_hash,
            proof: payload.proof,
            signal_hash: signalHash,
          },
        ],
      }),
    });
    const json = await res.json();
    return json?.success === true;
  } catch (err) {
    logError("api/vote", "v4 verify fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
