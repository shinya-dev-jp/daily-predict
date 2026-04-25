# TuringVote content-card.png — Antigravity 発注プロンプト

**用途**: Worldcoin Developer Portal の `content_card` スロット(1035×720)
**配置先**: `/Users/Shinya/turingvote/public/content-card.png`
**ブランド整合**: `app-icon-small.png`(vertical-split A/B terminal)の**ラージ版**として展開

---

## Antigravity 用プロンプト

```
TuringVote Content Card — 1035×720 PNG (landscape, Worldcoin Mini App portal preview card).

Core concept: scale up the app icon's A/B vertical-split into a cinematic landscape card. Communicate "Two choices. Real humans. No leaderboard." at a glance, even with no text.

Composition:
- Background: pure near-black flat #0A0A0A (no gradients, no glow, no noise).
- Left half: large filled rectangle in terminal green #22C55E (or #16A34A for slightly deeper). Occupies ~45% of the canvas width (x=0..465, full 720 tall), left-aligned.
- Right half: large filled rectangle in warm terminal orange #F97316 (or #EA580C). Occupies ~45% of the canvas width (x=570..1035, full 720 tall), right-aligned.
- Between the two rectangles: 90px of pure black (#0A0A0A) gap as a hard-edge separator.
- Centered vertically in each rectangle: giant monospace letter "A" (green half, black #0A0A0A fill) and "B" (orange half, white #FFFFFF fill). JetBrains Mono / IBM Plex Mono / Fira Code family, weight 700. Letter height approximately 60% of rectangle height.
- Top-left corner (x=30, y=30): small `>` prompt glyph in terminal green #22C55E, monospace, 36px height, followed by the word "turingvote" in light-gray monospace (#E5E7EB) at the same height — like a terminal prompt.
- Bottom-center or bottom-right: tiny 3-block ASCII bar "▓▓░" in #525252, monospace, 24px height, as a decorative grounding element.

Hard constraints:
- NO purple, violet, indigo, blue, lavender, magenta anywhere. Hue range HSL 200–320 forbidden.
- NO gradients, glows, glass morphism, neumorphism, drop shadows, or 3D bevels. Flat only.
- NO diamond, gem, crystal, orb, globe, checkmark, ballot, hand, or face imagery.
- NO English tagline or wordmark beyond `> turingvote` and the letters "A", "B". Do NOT add "Two choices. Real humans. No leaderboard." as text in the card — the visual IS the message.
- Hard-edge 90px gap between the A/B rectangles; not a soft blur.
- Letters must be legible when the card is resized to 256×178 (thumbnail) for portal listing views.

Why these constraints:
- Worldcoin Mini App marketplace is saturated with gradient purple/blue orb cards. Flat near-black + terminal-green/orange pops immediately at card size.
- The A/B split mirrors the app icon exactly — brand continuity from 48×48 icon to 1035×720 card.
- `> turingvote` establishes the terminal identity that the app UI uses (see `turingvote/$ report` prompt in SummaryDialog).

Deliverable:
- 1035×720 PNG, sRGB, no embedded metadata, no watermark.

Do NOT add: Worldcoin branding, World ID badge, user avatars, device mockups, checkmarks, percentages, metric numbers, timers, hashtags, version numbers, robot mascots, or tagline text.
```

---

## 配置手順(生成後 Shinya 実施)

1. Antigravity が生成した `.png` を `/Users/Shinya/turingvote/public/content-card.png` に上書き保存
2. ファイルサイズが 1035×720 であることを確認: `sips -g pixelWidth -g pixelHeight /Users/Shinya/turingvote/public/content-card.png`
3. Shinya が目視で「A/B letters legible + terminal prompt visible + 紫なし」を確認
4. `cd /Users/Shinya/turingvote && npx vercel deploy --prod --yes` で反映

---

## Alternative: Claude 自動生成の検討

もし Antigravity 発注が時間的に厳しければ、`content-card.png` は以下のいずれかで代替可能:

- **A. showcase-1.png をリサイズ流用**: 1080×1080 → 1035×720 に crop+resize(内容は似るが content-card 専用デザインではない)
- **B. Python + Pillow で自動生成**: 上記プロンプトを近似した SVG/PNG をコードで生成(Antigravity ほどの仕上がりは出ないが初提出 blocker 解除には十分)

B の場合は Claude に「content-card を Pillow で生成してくれ」と依頼。
