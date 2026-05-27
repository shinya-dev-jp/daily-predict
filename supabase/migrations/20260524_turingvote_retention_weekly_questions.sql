-- ============================================================================
-- TuringVote retention pack questions
-- Created: 2026-05-24
--
-- Required before deploying code that serves question IDs 31-45 from
-- src/data/tc_questions.json. The /api/vote route inserts into tc_votes with a
-- foreign key to tc_questions(id), so deploy without this migration would make
-- votes on new weekly-pack questions fail.
-- ============================================================================

begin;

insert into tc_questions (
  id,
  category,
  ja_prompt,
  ja_option_a,
  ja_option_b,
  en_prompt,
  en_option_a,
  en_option_b,
  is_active
) values
  (31, 'lifestyle', '自由な1時間ができたら？', '外に出る', '家で過ごす', 'A free hour opens up?', 'Step outside', 'Stay in', true),
  (32, 'style', '作業机は？', 'すっきり整理', '少し散らかっている', 'Your workspace?', 'Clear desk', 'Cozy mess', true),
  (33, 'preference', '道を選ぶなら？', '最短ルート', '景色のいい道', 'Choosing a route?', 'Fastest way', 'Scenic way', true),
  (34, 'lifestyle', '夜の過ごし方は？', '静かに整える', '少し冒険する', 'Evening mood?', 'Quiet reset', 'Small adventure', true),
  (35, 'style', '学び方は？', '短く何度も', '深くじっくり', 'Learning style?', 'Short lessons', 'Deep dives', true),
  (36, 'preference', '連絡するなら？', 'まずテキスト', 'まず声で話す', 'Getting in touch?', 'Text first', 'Voice first', true),
  (37, 'style', '予定が変わったら？', '組み直す', 'その場で合わせる', 'Plans changed?', 'Rebuild the plan', 'Improvise', true),
  (38, 'lifestyle', '小休憩するなら？', '体を伸ばす', '軽く食べる', 'A small break?', 'Stretch', 'Snack', true),
  (39, 'style', '荷物は？', '必要最小限', '予備も持つ', 'Packing light?', 'Essentials only', 'Extra options', true),
  (40, 'preference', '初めての場所では？', '地図を先に見る', '歩きながら探す', 'In a new place?', 'Map it first', 'Explore first', true),
  (41, 'style', '創作を始めるなら？', '構成から', '遊びながら', 'Starting something creative?', 'Start with structure', 'Start with play', true),
  (42, 'values', 'みんなで決める時は？', 'すぐ投票する', 'もう少し話す', 'A group decision?', 'Vote quickly', 'Discuss more', true),
  (43, 'lifestyle', '空いた朝は？', '早めに出かける', 'ゆっくり始める', 'A free morning?', 'Go out early', 'Slow start', true),
  (44, 'values', '贈り物を選ぶなら？', '実用的なもの', 'その人らしいもの', 'Choosing a gift?', 'Practical', 'Personal', true),
  (45, 'style', '謎を解くなら？', 'まず試す', '先に考える', 'Solving a puzzle?', 'Try first', 'Think first', true)
on conflict (id) do update set
  category = excluded.category,
  ja_prompt = excluded.ja_prompt,
  ja_option_a = excluded.ja_option_a,
  ja_option_b = excluded.ja_option_b,
  en_prompt = excluded.en_prompt,
  en_option_a = excluded.en_option_a,
  en_option_b = excluded.en_option_b,
  is_active = excluded.is_active;

commit;
