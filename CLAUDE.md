# CLAUDE.md — Daily Predict プロジェクト指示書

このファイルは Claude Code がこのリポジトリで作業する際に **最初に読む** 設定ファイルです。

## プロジェクト概要
Daily Predict は World App 内で動く Mini App。World ID で認証されたユーザーが毎日1問の予測（Yes/No）を投票し、ストリーク・ランキングを競うゲーム。

- **スタック**: Next.js 16.2.1 / React 19 / TypeScript / Supabase / IDKit (orbLegacy preset) / Anthropic SDK / Tailwind 4
- **本番URL**: https://daily-predict-two.vercel.app
- **App ID**: app_9ea9956fcd3bcb53a6accf1e93383e22
- **デプロイ**: Vercel
- **DB**: Supabase (project: wgszbxgsxekwdmssnvvd)

## 過剰な確認を避ける（最重要）

**ユーザーに確認を求めるのは、以下の場面のみ：**
1. **Gate D**: 本番デプロイ（`--prod`）の直前
2. **Gate A**: Supabase migration の適用直前
3. **Phase 0**: 夜間モード起動時（モデル選択 + 設計判断要件を **1回で全部** 聞く）
4. **真の設計判断**: コードを読んでも答えが出ない、ユーザーの好み・戦略次第のもの
5. **破壊的操作**: rm -rf、git reset --hard、ブランチ削除等

**それ以外は確認なしで進める。** 「念の為聞いておく」「Yes で進めますか?」のような儀式的確認は禁止。
ループ間・タスク間で「次へ進みますか?」を挟まない。連続実行と言われたら止まらず最後まで回す。

## 不変ルール（絶対に違反しない）

### セキュリティ
1. `SUPABASE_SERVICE_ROLE_KEY` / `RP_SIGNING_KEY` / `DP_AUTH_SECRET` を **クライアントコード or ログに出さない**
2. ログ出力は `src/lib/server-log.ts` の `logInfo/logWarn/logError` を使う（PII redaction 済み）
3. 認証が必要な API では `src/lib/auth.ts` の `authenticateRequest()` で nullifier を取得する。**request body から nullifier を信用しない**
4. nullifier_hash を **クライアントレスポンスに含めない**（leaderboard など、`opaque_id` を使う）

### デプロイ
5. **本番デプロイ (`--prod`) は必ずユーザー承認後**。preview deploy は自由
6. 例外: `docs/` `*.test.ts` のみの変更で `rule_audit PASS` のときは自動 prod 可
7. デプロイ前に `npm run build` 成功 + `python3 .claude/rule_audit.py` で CRITICAL=0 を確認

### スキーマ
8. Supabase migration は **必ず `supabase/migrations/YYYYMMDD_*.sql` 命名規則に従う**
9. migration 適用は **常に手動 + ユーザー承認** (Gate A 必須)
10. World ID 関連の API ルート (`/api/verify` `/api/rp-signature`) は **1コミットあたり1ファイルまで** の変更

### コンテンツ・ビジネス
11. 「Win WLD」「Earn WLD」「Prize」など、ギャンブル誤認誘発する文言を metadata / UI に **入れない**（Apple 5.3 連鎖リスク）
12. **Phase 3 (Login Bonus 実装)** は `.claude/backlog.md` でロック中。Grants 受取確認後にユーザーが明示的に解除するまで着手しない
13. backlog.md の **P0 を勝手に追加しない**。P1/P2/Done は更新可

## ワークフロートリガー

### 📅 日次モード
ユーザー入力: `日次` / `/daily` / `日次お願いします`

詳細: `.claude/daily_workflow.md`

**フロー**:
1. **Phase 1** (Haiku): 残タスク集計 → 推奨モデル+工数提示 → **応答待ち**
2. **Phase 2** (ユーザー選択モデル): D1→D5 を順次実行 → 1サイクルで停止

### 🌙 夜間モード
ユーザー入力: `夜間` / `/overnight` / `朝まで回して`

詳細: `.claude/overnight_workflow.md`

**フロー**:
1. **Phase 0** (1回だけ・必須・省略禁止): 起動前プランニング → **応答待ち**
   - 必須8項目: 残タスク全件の表（モデル+工数+Stream）/ 設計判断要タスク / モデル候補比較 / 時間帯プラン / 完了見込み / migration注意 / セッション制約 / 停止条件
   - Haiku では出力品質が落ちるため Phase 0 は **Sonnet Medium 以上** 推奨
2. **メインループ**: Stream A (外部依存) / B (新規実装) / C (既存修正) を並行
3. 停止条件: 全完了 / context 15%残 / 朝6時 / ユーザー停止 / レート制限
4. `/compact` は1回のみ許可（context 20%残時点）
5. 朝のラップアップ必須（state.json 保存 + 承認待ち一覧）

### 🔍 監査モード
ユーザー入力: `/audit` / `監査して`

`python3 .claude/rule_audit.py` を実行 → 結果を表示 → CRITICAL は即修正提案。

## モデル選択基準

| 作業内容 | 推奨 |
|---|---|
| 新機能実装・複雑なリファクタリング・アーキテクチャ変更 | **Sonnet High / Opus Medium** |
| バグ修正（root cause調査あり）・テスト追加 | **Sonnet Medium** |
| 軽微な修正・型追加・Lint修正 | **Sonnet Low / Haiku** |
| 状態確認・ログ読み・進捗更新 | **Haiku** |
| 夜間連続実行 | **Sonnet High** (デフォルト) |

利用可能な組み合わせ:
- Opus 4.6 / 1M: Low / Medium / High / Max
- Sonnet 4.6: Low / Medium / High（Maxなし）
- Haiku 4.5: 工数選択なし

## Phase 0/1/2 出力フォーマット例

### 日次 Phase 1 (Haiku)
```
## 日次計画 - 2026-04-08

### 残タスク
| # | タスク | 推奨モデル | 工数 |
|---|---|---|---|
| D1 | 審査ステータス確認 + 障害監視 | Haiku | 5分 |
| D2 | [P1: Streak semantics 修正] | Sonnet Medium | 60分 |
| D3 | テスト追加 (lib/track.test.ts) | Sonnet Low | 30分 |
| D4 | rule_audit + 違反1件修正 | Sonnet Low | 20分 |
| D5 | backlog.md 整理 | Haiku | 10分 |

### 推奨実行モデル
- D2: Sonnet Medium / D3,D4: Sonnet Low / D1,D5: Haiku

### 確認
このセットで進めて良いですか？ Yes / カスタム / Skip [N]
```

### 夜間 Phase 0 — 拡張版（必須8項目・省略禁止）

詳細フォーマットは `.claude/overnight_workflow.md` を参照。最低限以下を出す:

```
## 夜間モード Phase 0 — YYYY-MM-DD HH:MM JST

### 1. 残タスクフル一覧
（P0/P1/P2/Stream C を表形式で。各タスクに 推奨モデル + 工数 + Stream + 備考）

### 2. 設計判断が必要なタスク（着手前にユーザー決定必須）
（リスト化、選択肢A/B/C を提示）

### 3. 全体推奨モデル比較表（Opus 1M / Sonnet High / Haiku）
**私の推奨**: [モデル名]
**理由**: ...

### 4. 想定実行プラン（時間帯ごと、朝6時逆算）
| 時間帯 | 順 | タスク | Stream | 累計工数 |

### 5. 完了見込み / 持ち越し見込み
- 確実に完了 / 可能なら完了 / 持ち越し

### 6. Migration 注意（Gate A 必須タスク）
- 朝の手動適用待ちリスト

### 7. このセッション固有の制約
- 作業ディレクトリ / preview/prod 制約 / Phase 3 ロック / etc

### 8. 停止条件
- 朝6時 / context 15%残 / 全完了 / 停止コマンド / 破壊的エラー×3 / レート制限
- /compact は1回のみ (context 20%残時点)

### 起動可否の選択肢
- 「[モデル] で起動、[設計判断A]」
- カスタム / 待って / 新セッションで起動
```

**Haiku 禁止理由**: Phase 0 で省略・推測が増えてプランが破綻する。Sonnet Medium 以上で実行すること。

## state.json の使い方

`.claude/daily_state/YYYY-MM-DD.json` に当日の進捗を保存。
- セッション開始時: 既存ファイルを読む or template.json から作成
- タスク開始時: `current_task` を更新、`tasks[]` に append
- タスク完了時: `status` を `completed` / `partial` / `blocked` / `skipped` に更新
- セッション終了時: `next_session_resume` に再開地点を記録

status 値:
- `pending`: 未着手
- `in_progress`: 実行中
- `completed`: 完了
- `partial`: 部分完了 (再開可能)
- `blocked`: ブロック中 (`reason` 必須)
- `skipped`: スキップ

## 既知の制約

- **テストランナー**: Vitest 等は導入していない。`npx tsx src/lib/X.test.ts` で直接実行
- **本番デプロイ**: `npx vercel deploy --prod --yes`（承認後のみ）
- **preview デプロイ**: `npx vercel deploy --yes`（自由）
- **migration 適用**: Supabase Dashboard SQL Editor から手動 (Claude in Chrome 経由可)

## 起動例

```
ユーザー: 日次
Claude:  [Phase 1: 計画提示] → 応答待ち
ユーザー: Yes
Claude:  [Phase 2: 実行] → 1サイクル後停止

ユーザー: 夜間
Claude:  [Phase 0: モデル推奨] → 応答待ち
ユーザー: Sonnet High で
Claude:  [メインループ開始] → ... → [朝のラップアップ] → 停止
```

## 関連ファイル
- `.claude/backlog.md` — タスク管理 (P0/P1/P2/Phase3/Blocked/Done)
- `.claude/daily_workflow.md` — 日次モード詳細
- `.claude/overnight_workflow.md` — 夜間モード詳細
- `.claude/rule_audit.py` — 機械チェック
- `.claude/daily_state/` — セッション state
- `GRANTS_APPLICATION.md` — Spark Track 申請書ドラフト
- `RUNBOOK.md` — 運用マニュアル
