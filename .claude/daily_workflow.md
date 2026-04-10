# Daily Workflow — Daily Predict
1サイクルで停止する日次定型タスク。

## トリガー
ユーザーが以下のいずれかを入力したら起動:
- `日次`
- `/daily`
- `日次お願いします`

## Phase 1: 計画提示（Haiku 推奨）
1. `.claude/daily_state/YYYY-MM-DD.json` を読む（無ければ template から作成）
2. `.claude/backlog.md` を読み、P0 → P1 → P2 の順で未完了タスクを抽出
3. 残タスク集計と推奨モデル・工数を以下のフォーマットで出力:

```
## 日次計画 - YYYY-MM-DD

### 残タスク
| # | タスク | 推奨モデル | 工数 |
|---|---|---|---|
| D1 | 審査ステータス確認 + 障害監視 | Haiku | 5分 |
| D2 | [backlog から1件] | Sonnet Medium | 60-90分 |
| D3 | テストカバレッジ追加 | Sonnet Low | 30分 |
| D4 | rule_audit.py 実行 + 違反1件修正 | Haiku → Sonnet Low | 20分 |
| D5 | ドキュメント1つ更新 | Haiku | 15分 |

### 推奨実行モデル
- D1, D5: Haiku
- D2: Sonnet Medium（複雑なら Sonnet High）
- D3, D4: Sonnet Low

### 確認
このセットで進めて良いですか？ Yes / カスタム / Skip [N]
```

4. ユーザー応答待ち（**ここで停止**）

## Phase 2: 本実行
ユーザー承認後、上から順に実行:

### D1: 審査ステータス確認 + 障害監視
- Dev Portal の status を確認（"In review" / "Verified" / "Rejected"）
- 状態変化があれば backlog.md と state.json に記録
- "Verified" 検知 → 自動的に backlog P0 着手モードに移行
- Vercel 直近24h のエラーログをチェック（Bash で `npx vercel logs --since 24h | grep -i error`）
- Supabase のクォータ確認は手動（Phase1で記載）

### D2: 新機能 / バグ修正 1件
- backlog.md の P0 → P1 → P2 順で1件選択
- **Gate B**（実装前）: 影響範囲を特定 → state.json に記録
- 実装 → ローカルビルド → テスト追加（D3 と兼ねてもOK）
- **Gate C**（commit 前）: rule_audit.py 実行 → CRITICAL なら中止
- **Gate D**（deploy 前）: ユーザー承認待機（自動 prod デプロイ禁止）

### D3: テストカバレッジ追加
- `src/lib/*.ts` のうち `*.test.ts` が無いものを発見
- 1ファイル選んで `npx tsx src/lib/{name}.test.ts` 形式でテスト追加
- 既存の auth.test.ts / date-util.test.ts / rewards-skeleton.test.ts を雛形に

### D4: rule_audit.py 実行 + 違反1件修正
- `python3 .claude/rule_audit.py src/` 実行
- WARNING の中から1件選び修正
- CRITICAL があれば即修正（Phase 2 の他作業より優先）

### D5: ドキュメント1つ更新
- 候補: GRANTS_APPLICATION.md / RUNBOOK.md / README.md / CLAUDE.md / backlog.md
- 1つだけ更新、複数手を出さない

## Gate定義（破壊的アクションの直前チェック）

### Gate A: スキーマ変更 (Supabase migration 作成時)
- [ ] migration ファイルが `supabase/migrations/YYYYMMDD_*.sql` 命名規則に従う
- [ ] DROP/ALTER 文がある場合はバックアップ計画を state.json に記録
- [ ] 既存データへの影響を明示
- [ ] **常にユーザー承認必須**（自動実行不可）

### Gate B: 新規実装の着手前
- [ ] 影響範囲のファイル一覧を state.json に記録
- [ ] 既存テストが壊れないか想定
- [ ] backlog.md の該当タスクが存在する（行き当たりばったり禁止）

### Gate C: commit / deploy 前
- [ ] `npm run build` 成功
- [ ] `python3 .claude/rule_audit.py src/` で CRITICAL ゼロ
- [ ] 既存テストが全部 PASS
- [ ] state.json の `current_task.status` を `partial` 以上に更新

### Gate D: 本番デプロイ前
- [ ] Gate C 全部 PASS
- [ ] preview deploy URL を state.json に記録
- [ ] **ユーザー承認必須**（"approve" / "本番OK" 等）
- [ ] World ID 関連の変更を含む場合は特に慎重に説明

## エラー時のフォールバック作業カタログ
主作業が詰まった時に、これらの非ブロッキング作業に切り替え:

1. **テスト追加**: `src/lib/*.test.ts` のケース追加
2. **型強化**: `any` / `as any` を適切な型に置き換え
3. **dead code 削除**: grep で参照されていない export を発見 → 削除
4. **ドキュメント更新**: 古い RUNBOOK / README の修正
5. **i18n キー追加**: en.json にあって他言語に無いキーを追加
6. **コメント追記**: 複雑なロジック箇所の意図説明
7. **依存関係チェック**: `npm outdated` の確認
8. **backlog.md 整理**: P2 項目のグルーピング、Done の古い項目を archive に

## 停止条件
- 全タスク完了 → state.json を `completed` でクローズ → 翌日用テンプレ準備
- ユーザー停止コマンド → state.json を `partial` 保存
- 破壊的エラー（Gate 失敗 + リトライ3回）→ blocked として保存 + ユーザー報告
