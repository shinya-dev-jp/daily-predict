# Daily Predict Backlog
Last updated: 2026-04-08 (Loop 9-11 完了)

## P0 (今すぐ — 審査通過後 即着手 / 自動着手OK)
- [ ] Dev Portal "Supported Languages" を 6言語に拡張（KO/TH/PT 追加 + 各言語のメタデータ入力）
- [ ] Spark Track Grant 申請（Airtable フォーム提出、GRANTS_APPLICATION.md がドラフト済）
- [ ] 既存セッションの再認証問題を実機で確認（Loop 5 で auth_token 制を入れたため、初回 401 → 自動再 verify が走る想定）

## P1 (今週)
- [ ] **Streak の semantics 修正 (優先度UP・2026-04-08 実機で問題確認)**: 現状は「連続正解日数」計算のため、初日ユーザーが投票しても Streak=0 と表示され離脱リスク。**2軸の整理が必要**:
  - 軸1: 「スキップした日」の扱い (途切れる=案A厳格 / 維持=案B寛容) — 案A 推奨済み
  - 軸2: **「何を数えるか」 (連続正解 vs 連続投票)** ← 新規論点 / **連続投票推奨** (理由: Wordle/Duolingo 等の世界的 DAU 獲得成功事例は全て参加ベース、Grants の目標は DAU)
  - 修正ファイル: `src/app/api/cron/resolve/route.ts` 近辺の streak 計算ロジック、`src/lib/rewards-skeleton.ts` の仕様確認
- [ ] **ProfileScreen の Best streak メッセージ 動的化 (2026-04-08 実機で問題確認)**: 現状「Best streak: 0 days — keep it up」が **初日ユーザーに論理矛盾メッセージ** (0日 vs keep it up)。状態別の動的メッセージに変更:
  - `streak=0, best=0` → "初めての連続記録を作ろう" / "Let's start your first streak!"
  - `streak=0, best>0` → "過去最高 N日。また挑戦しよう"
  - `streak>0, best=streak` → "現在、過去最高更新中!"
  - `streak>0, best>streak` → "Best: N days — keep it up" (現状維持)
  - 修正ファイル: `src/components/screens/ProfileScreen.tsx` + `src/i18n/*.json` (6言語新キー)
- [ ] **i18n ja.json: 「サインイン」→「ログイン」 (2026-04-08 実機で違和感確認)**: 日本の UI 慣習では "ログイン" の方が自然。審査チームが使った "login" 原文とも直訳一致。影響ファイル: `src/i18n/ja.json` の verify.button / verify.verifying / verify.notInWorldApp / verify.footer の4行
- [ ] **LanguageToggle ドロップダウンが外側タップで閉じない バグ (2026-04-08 実機で問題確認)**: `<div className="fixed inset-0 z-40" onClick={...} />` backdrop は実装済だが、祖先 header の `backdrop-blur-lg` が CSS の containing block 規則を変え、fixed 要素が viewport 全体を覆えない状態。結果、メニューの外をタップしても閉じない (言語を選ばざるを得ない)。**修正案A推奨**: `useEffect` + `document.addEventListener('mousedown', handler)` で click-outside 検知。追加15行程度。影響ファイル: `src/app/page.tsx` の LanguageToggle コンポーネント (line 33-72)
- [ ] /api/leaderboard の period パラメタ実装（weekly/monthly/allTime が現在無視されている）
- [ ] /api/cron/resolve のユーザー更新ループをバッチ化（現状 N user で N updates、Supabase RPC でまとめる）
- [ ] backlog.md 自体を運用テスト（日次/夜間モードで実際に書き換わるか）

> **審査中のため、上記 P1-1/P1-2/P1-3 は着手禁止**。`Verified` 検知後に P0 3件 (言語拡張 / Grant 申請 / 再認証確認) → その後 P1 に取り掛かる。

## P2 (時間あれば)
- [ ] プロフィール画面に「名前を変更」UI を追加（任意、デフォルトは #xxxxxx 匿名ID）
- [ ] 結果画面の共有テキストに自分の連続日数を含める（バイラル係数UP）
- [ ] Eruda 組み込み（実機デバッグ用、preview=1 のときだけ）
- [ ] Sentry / Logtail などのエラー監視ツール導入検討
- [ ] 質問品質チェックの自動化（Anthropic API の出力を週次レビュー → 不適切な質問を検知）
- [ ] Quick Actions（World App のショートカット機能）対応
- [ ] アプリアイコン・スクショの品質再検討（審査通過後 v2 に差し替え）
- [ ] /api/cron/resolve の crypto resolution が "above $X" / "below $X" のみ対応 → "$X 以上" 等の日本語文も解決可能に
- [ ] 投票後の通知許可リクエストの A/B テスト（タイミング・文言）

## Phase 3 🔒 (Grants 受取後のみ着手 — 自動着手禁止)
- [ ] Login Bonus 実装本番化（src/lib/rewards-skeleton.ts → src/lib/rewards.ts に昇格）
- [ ] reward_payouts / user_streaks テーブルの本番マイグレーション
- [ ] Treasury wallet からの WLD 送金実装（viem/ethers 経由のサーバーサイド送金）
- [ ] Rewards History 画面の追加
- [ ] FAQ ページ追加

## Blocked / Waiting
- [ ] Daily Predict 審査結果（現在 "In review" / 2026-04-08 13:25 再申請完了 / 1-3日想定）
- [ ] Worldcoin Grants 採否連絡（申請後 2-4週間想定）
- [ ] WLD 国内取引所上場（現状不可、海外取引所経由のみ）
- [ ] 持続化補助金 **第20回** の公募要領発表（第19回 4/30 はスライド決定済 by Shinya 4/4）

## Done (直近10件)
- [x] 2026-04-08 Loop 11: ProfileScreen ローディングスケルトン追加（デモデータフリッカー解消）
- [x] 2026-04-08 Loop 10: /api/predict + /api/verify の input validation 強化（JSON parse 明示、prediction_id 型/長さガード、payload 構造チェック）
- [x] 2026-04-08 Loop 9: rule_audit warning 2件解消（MiniKitWrapper useEffect deps コメント、share.ts Permission enum 型化）→ **0 critical / 0 warning ✅ PASS**
- [x] 2026-04-08 予測ページ言語選択UIバグ修正: header の z-10→z-50 で LanguageToggle ドロップダウンが質問ボックス背面に隠れる問題を解消
- [x] 2026-04-07 Loop 8: a11y 改善（Navigation/vote button に role/aria-label 追加）
- [x] 2026-04-07 Loop 7: パフォーマンス（public assets 12MB→256KB、layout.tsx の他人URL/ギャンブル誤認誘発文言/og画像参照漏れ修正）
- [x] 2026-04-07 Loop 6: コード品質（date-util 統一・dead code削除・DBインデックス追加・ログ標準化）
- [x] 2026-04-07 Loop 5: セキュリティハードニング（HMAC auth_token、PII ログ削除、profile/leaderboard 認証化）
- [x] 2026-04-07 Loop 4: Analytics（app_events テーブル + tracking 配線）
- [x] 2026-04-07 Loop 3: TOS に税務責任条項追加
- [x] 2026-04-07 Loop 2: Phase 3 設計（7日ストリーク login bonus）+ UI 予告
- [x] 2026-04-07 Loop 1: i18n 6言語化（KO/TH/PT 追加）
- [x] 2026-04-07 不要App削除（app_df76...）
- [x] 2026-04-07 World ID verify 動作確認 + 再申請（IDKit orbLegacy）

## Notes
- 審査中は破壊的変更（API設計大幅変更、UIフロー変更）を避ける
- セキュリティに関わる変更は Loop 5 のパターンを継承（HMAC, PII redaction, RLS）
- 全ての本番デプロイは Gate 必須（rule_audit PASS + ユーザー承認）
- Phase 3 セクションは私（Claude）から自動着手しない。Grants受取確認後に Shinya さんが「Phase 3 着手」と明示的に言うまでロック。
