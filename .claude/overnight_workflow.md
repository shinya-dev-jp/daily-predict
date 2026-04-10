# Overnight Workflow — Daily Predict
朝まで連続実行する夜間モード。3ストリームを並行で回す。

## トリガー
ユーザーが以下のいずれかを入力したら起動:
- `夜間`
- `/overnight`
- `朝まで回して`
- `朝までお願いします`

## Phase 0: 起動前プランニング（1回だけ・必須）

「夜間」トリガー受信後、メインループに入る前に **必ず** 以下の8項目を出力する。
省略・簡略化禁止。Haiku では出力品質が落ちるため、Phase 0 は **Sonnet Medium 以上** を推奨。

**重要**: Phase 0 は **このセッションで唯一の確認停止点**。設計判断要件・モデル選択・起動可否を **1つの応答で全て** 集約する。Phase 0 後にユーザーに「次へ進みますか?」を挟むのは禁止。Gate D（本番デプロイ）と Gate A（migration 適用）と破壊的操作・真の追加設計判断以外は、朝までノンストップで回す。

### 実行手順
1. `.claude/daily_state/YYYY-MM-DD.json` を読む（無ければ template から新規作成）
2. `.claude/backlog.md` から P0 / P1 / P2 / Phase3 / Blocked / Done(直近) を全件読む
3. `python3 .claude/rule_audit.py --json` を実行し warning を Stream C 候補に登録
4. 各タスクに以下を判定:
   - 推奨モデル（Haiku / Sonnet Low/Medium/High / Opus Medium/High）
   - 工数（分単位、レンジ可）
   - Stream 振り分け（A: 外部依存・preview deploy / B: 新規実装 / C: 既存修正・リファクタ）
   - 設計判断が必要か（Y/N）
   - migration を伴うか（Y/N、Y なら Gate A 必須）
5. 開始時刻 → 朝6時 を逆算して時間帯ごとの実行プランを組む
6. 完了見込み / 持ち越し見込みを推定
7. 以下のフォーマットで出力:

```
## 夜間モード Phase 0 — YYYY-MM-DD HH:MM JST

### 1. 残タスクフル一覧

#### P0（審査ブロック中／自動着手禁止）
| # | タスク | 推奨モデル | 工数 | 備考 |
|---|---|---|---|---|
| P0-1 | ... | Haiku | 30分 | 審査 Verified 検知後のみ着手 |
| ... | | | | |

#### P1（今週・夜間メインターゲット）
| # | タスク | 推奨モデル | 工数 | Stream | 備考 |
|---|---|---|---|---|---|
| P1-1 | ... | Sonnet High | 90-120分 | B | 設計判断あり |
| ... | | | | | |

#### P2（時間あれば）
| # | タスク | 推奨モデル | 工数 | Stream | 備考 |
|---|---|---|---|---|---|
| P2-1 | ... | Sonnet Medium | 60分 | B | migration 伴う → Gate A |
| ... | | | | | |

#### Stream C（rule_audit warning + 既存リファクタ）
| # | タスク | 推奨モデル | 工数 | 備考 |
|---|---|---|---|---|
| C-1 | useEffect([]) warning in path:line | Sonnet Low | 15分 | rule_audit |
| ... | | | | |

### 2. 設計判断が必要なタスク（着手前にユーザー決定必須）
- [ ] P1-1: 案A（厳格） / 案B（寛容） / 案C（grace day 1日許容）
- [ ] ...

### 3. 全体推奨モデル（1回選択・途中変更不可）

| モデル | 強み | 弱み | 推奨ケース |
|---|---|---|---|
| **Opus 4.6 1M Medium** | 1M context、複雑判断◎ | コスト最高 | 設計判断・複雑refactor多い夜 |
| **Sonnet 4.6 High** | サステインワーク◎、コスト/性能比◎ | 1Mなし、複雑設計やや弱 | デフォルト推奨 |
| Haiku 4.5 | 最安・最速 | 設計判断不可 | Stream C専用 / 単純作業のみ |

**私の推奨**: [モデル名]
**理由**: [1-3行]

### 4. 想定実行プラン（推奨モデル × 残時間で逆算）

| 時間帯 | 順 | タスク | Stream | 累計工数 |
|---|---|---|---|---|
| HH:MM-HH:MM | 1 | P1-1 ... | B | 90分 |
| HH:MM-HH:MM | 2 | P1-2 ... | B | 60分 |
| ... | | | | |
| 05:30-06:00 | 最後 | 朝のラップアップ | C | 30分 |

### 5. 完了見込み

- **確実に完了**: P1-1 / P1-2 / C-1 / C-2 / 朝のラップアップ
- **可能なら完了**: P2-2 / P2-3 / ...
- **持ち越し**: P2-5 / P2-9 / ...

### 6. Migration 注意（Gate A 必須）

migration を伴うタスク:
- P1-3: cron バッチ化 RPC（新規 supabase/migrations/YYYYMMDD_*.sql）
- P2-1: profile に display_name カラム追加

→ migration ファイルだけ作成、適用は朝の手動承認待ち（state.json `pending_approvals` に記録）

### 7. このセッション固有の制約

- 作業ディレクトリ: [cwd]
- daily-predict 外で動いている場合は絶対パス＋Bashで毎回 cd
- preview deploy のみ自動可、本番デプロイは Gate D（朝の承認）
- Phase 3（Login Bonus）には絶対触らない
- backlog.md の P0 を勝手に追加しない
- /compact は1回のみ（context 20%残時点）

### 8. 停止条件

- 朝6時 JST / context 15%残 / 全 backlog 完了 / 停止コマンド（stop / 止めて / おはよう）/ 破壊的エラー×3 / レート制限

### 起動可否の選択肢

- **「[モデル] で起動、[設計判断A]」** — このまま開始、設計判断も同時に
- **「[モデル] で起動、[設計判断B]」** — 同上
- **「カスタム」** — タスク順序やスコープを調整
- **「待って、◯◯確認したい」** — 起動前の追加チェック
- **「新セッションで起動」** — ここでは起動せず再開コマンド出力
```

8. ユーザー応答待ち（**ここで停止**）
9. 承認後、メインループ開始（state.json の current_task を `overnight-loop-YYYY-MM-DD` に更新）

### Phase 0 で省略してはいけない理由

- **モデル選択は途中変更不可** → 全タスクのモデル要件を事前に見ないと、後から「Opus が必要だった」と気づいても変更できない
- **設計判断の事前提示** → 夜間中に判断ブロックで止まると context を消費する
- **時間帯プラン** → 朝6時逆算で「やれること/やれないこと」を可視化、過剰約束を防ぐ
- **migration 事前申告** → Gate A 必須タスクを朝の承認リストに先に積む

## メインループ（3ストリーム並行）

### Stream A: 外部依存（デプロイ・PR・外部API）
**特徴**: 失敗率高、レート制限あり、Gate D 必須
- ローカルビルド検証 (`npm run build`)
- preview deploy 作成 (`npx vercel deploy --yes` ← `--prod` ナシ)
- preview URL を state.json `pending_approvals` に記録
- **本番デプロイは絶対に自動実行しない**（朝の手動承認待ち）
- 例外: docs/test のみの変更は自動 prod 可（Gate C PASS 時のみ）

### Stream B: 新規実装（機能追加・テスト追加・i18n）
**特徴**: backlog 駆動、創造的、context 消費大
- backlog.md P0 → P1 → P2 順で1件ずつ
- 各タスク完了ごとに state.json に記録
- テスト追加が伴う場合は同じコミットに含める
- **Phase 3 タスクには絶対着手しない**（ロック）

### Stream C: 既存修正（リファクタ・型強化・バグ修正）
**特徴**: 低リスク、context 消費小、フォールバック向き
- rule_audit.py の WARNING を1件ずつ修正
- `any` 型削除、構造化ログへの統一
- dead code / unused export 削除
- コメント追加（複雑なロジックのみ）

## 順序戦略
1. **最初の1時間**: Stream B から1件（一番重い実装を context が新鮮なうちに）
2. **次の1時間**: Stream A の preview deploy + Stream C の small fix を並行
3. **以降**: B → C → B → C → A の循環（A は溜まったら一括）

## Gate実行（簡略版 / 1行サマリー）
日次モードよりも軽量。詳細は state.json に記録:

```
[Gate C] file=src/lib/x.ts | build=ok | audit=PASS(0critical/2warning) | tests=12/12 | proceed
[Gate D] preview=https://...vercel.app | recorded=state.json | wait=approval
```

## /compact ルール (Q4 拡張版)
| context残 | アクション |
|---|---|
| 50%以上 | 通常モード |
| 30% | wrap_up 警告開始 (state.json に「次回起点」を準備) |
| 20% | /compact 1回実行 → 50%復活 → 残作業継続 |
| 15% | 強制 wrap_up モード（新規作業禁止、進行中の完了+保存のみ） |
| 10% | 即停止（次セッションで再開可能な状態を保証） |

**/compact は夜間中1回のみ。** それ以降は wrap_up へ。

## 停止条件
1. 全 backlog (P0+P1+P2) 完了
2. /compact 後の context 15% 到達
3. ユーザー停止コマンド (`stop` / `止めて` / `おはよう`)
4. 破壊的エラー × 3回連続
5. 朝6時 (JST)
6. Anthropic API レート制限

## 朝のラップアップフォーマット
夜間モード終了時、必ず以下を出力:

```
## 夜間モード ラップアップ - YYYY-MM-DD HH:MM JST

### 完了 (N件)
- ✅ [task] - commit hash / preview URL
- ✅ ...

### 承認待ち (Gate D)
- ⏳ preview: https://...vercel.app
  - 変更概要: ...
  - 影響範囲: ...
  - リスク: low / med / high
  - 「approve」と返信で本番デプロイ

### blocked / 持ち越し (M件)
- 🚫 [task] - 理由
- 🚫 ...

### 統計
- 開始時 context: 100%
- 終了時 context: X%
- /compact 実行: Y回
- Stream A/B/C 件数: a/b/c
- 経過時間: H時間 M分

### state.json 保存先
.claude/daily_state/YYYY-MM-DD.json
```

## 制約事項（絶対守る）
1. **本番デプロイ自動実行禁止**（doc/test のみ例外、Gate D 必須）
2. **Supabase スキーマ変更禁止**（migration ファイル作成のみ可、適用は手動）
3. **World ID 関連の変更は1コミットあたり1ファイルまで**（影響範囲を限定）
4. **Phase 3 (Login Bonus 本番化) には絶対着手しない**
5. **backlog.md の P0 を勝手に追加しない**（P1/P2/Done は更新可）
