# TuringVote 再審査前 Shinya 事前アクション(Claude 実施不可)

**生成**: 2026-04-19 夜 Claude Code / **所要**: 約 8 分

---

## 検証結果サマリ(2026-04-19 Claude 確認済)

| チェック | 状態 |
|---|---|
| Supabase migration(users 残骸列 DROP) | ❌ **未適用** — `total_predictions=4` 等残存 |
| Vercel 本番環境変数 | ❌ **1つも未設定**(`vercel env ls` が空) |
| 最終 Deploy | ✅ READY (dpl_31UDzCuWDgEJMmRcELQy2VPJPskQ → 6回目 dpl_5ceydSLF3rVZ4CiYL6RyPVg1JdDr) |
| Preview mode 動作 | ✅ `?preview=1` で 5問完走 + ESC 閉じ + 新セッション再開全て動作 |
| SummaryDialog ESC | ✅ 完全動作(6回目 deploy で確定) |

**本番稼働不可の理由**: Vercel 環境変数が全滅のため、wallet SIWE / Supabase 投票は全て失敗する。Preview mode はネット非依存なので動く。

---

## ⚠ 作業順序(厳守)

### Step 1: NULLIFIER_SECRET を決める(所要 1 分)

**Claude が生成した候補値**(使い回しなし・TuringVote 専用):

```
a3f276d6f20fe7f31a86eb8ca67951baca9eb5ab47026d1ed0b1523c5c37d668
```

- 保存場所: `/tmp/turingvote_nullifier_secret_candidate.txt`(ローカルのみ)
- Shinya が自分で生成したい場合: `openssl rand -hex 32`
- **⚠ 一度 Vercel に設定したら絶対 ROTATE 禁止**(UNIQUE(nullifier_hash, question_id) が機能せず二重投票可能になる)

### Step 2: Vercel 環境変数を 7 件全て設定(所要 5 分)

1. https://vercel.com/shinyayudab-2161s-projects/turingvote/settings/environment-variables
2. 以下を **Production + Preview** 両方にチェックして追加:

| Key | Value の取得方法 |
|---|---|
| `NULLIFIER_SECRET` | Step 1 の値 |
| `DP_AUTH_SECRET` | `/Users/Shinya/turingvote/.env.local` の DP_AUTH_SECRET を丸ごとコピー |
| `NEXT_PUBLIC_WLD_APP_ID` | `.env.local` の NEXT_PUBLIC_WLD_APP_ID |
| `NEXT_PUBLIC_WLD_ACTION` | `turingvote-vote`(`.env.local` 値と一致確認) |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` の NEXT_PUBLIC_SUPABASE_URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` の NEXT_PUBLIC_SUPABASE_ANON_KEY(`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` の SUPABASE_SERVICE_ROLE_KEY(`sb_secret_...`) |

設定後、Vercel が自動で新規 deploy を走らせる(1 分程度)。

### Step 3: Supabase migration を適用(所要 1 分)

1. https://supabase.com/dashboard/project/wgszbxgsxekwdmssnvvd/sql/new(`world-apps` プロジェクト)
2. 以下を貼り付けて実行:

```sql
alter table users drop column if exists total_predictions;
alter table users drop column if exists total_correct;
alter table users drop column if exists streak;
alter table users drop column if exists best_streak;
alter table users drop column if exists points;
alter table users drop column if exists last_correct_date;
alter table users drop column if exists badges;
drop index if exists idx_users_points;
drop index if exists idx_users_correct;
```

元ファイル: `/Users/Shinya/turingvote/supabase/migrations/20260419_tc_users_drop_prediction_columns.sql`

### Step 4: Claude に完了通知(所要 30 秒)

「**TuringVote 事前完了**」と Claude に伝える → Claude が以下を自動実行:

1. 環境変数の反映確認(`vercel env ls`)
2. 削除カラム確認(PostgREST で 400 応答が返るか)
3. Chrome MCP で wallet SIWE モック動作確認(可能な範囲)
4. Worldcoin Developer Portal 再審査リクエスト送信支援(文面下書き生成)

---

## 注意事項

- **本職守秘義務・数字訴求禁止・偽 Engagement 禁止** は再審査文面でも厳守
- `NEXT_PUBLIC_WLD_APP_ID` が Daily Predict と共有の場合は、Worldcoin Developer Portal で TuringVote 専用の app_id を別途発行した方が安全(要判断)
- 実 wallet での本番投票テストは、Step 1-3 完了後のみ実行
