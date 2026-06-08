#!/usr/bin/env python3
"""Generate the TuringVote Open Graph share image (public/og.png).

2026-05-29 — acquisition fix. Shared links (X / Discord / iMessage) had NO
preview image, so they rendered bland and earned few clicks. This produces a
1200x630 branded OG image matching the in-app terminal aesthetic.

Honesty constraint (no-overclaim principle): the image contains ONLY
verifiable value-prop copy — no user counts, no "proven", no rankings, no
fake numbers. It also leans on the genuine differentiator that is also
Worldcoin-policy-aligned: "No points. No streaks. Just real opinions."

Deterministic: same fonts + same text => same PNG. Re-run to regenerate.

Usage:
    python3 scripts/gen_og_image.py
"""

from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ── Brand (from src/app/globals.css) ─────────────────────────────────────────
BG = (10, 10, 10)            # near-black #0A0A0A (--background)
FG = (245, 245, 245)         # off-white (--foreground)
DIM = (120, 120, 120)        # dim gray
GREEN = (74, 222, 128)       # terminal green (--terminal-prompt / option-a)
MAGENTA = (232, 121, 249)    # magenta (option-b)

W, H = 1200, 630
MARGIN = 90

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "og.png"

# macOS system fonts. Menlo = monospace (terminal feel); Helvetica = display.
MONO = "/System/Library/Fonts/Menlo.ttc"
SANS_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def main() -> None:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Subtle top hairline border in green (terminal frame feel)
    d.rectangle([0, 0, W, 6], fill=GREEN)

    # Terminal prompt line (top)
    f_prompt = font(MONO, 30)
    d.text((MARGIN, 70), "> turingvote", font=f_prompt, fill=GREEN)

    # Big product name
    f_title = font(SANS_BOLD, 110)
    d.text((MARGIN, 130), "TuringVote", font=f_title, fill=FG)

    # Value prop line 1 (white)
    f_sub = font(SANS_BOLD, 50)
    d.text((MARGIN, 270), "5-question this-or-that mirror", font=f_sub, fill=FG)

    # Value prop line 2 (green accent) — verifiable, no numbers
    f_sub2 = font(SANS_BOLD, 50)
    d.text((MARGIN, 332), "majority or minority?", font=f_sub2, fill=GREEN)

    # Supporting line (off-white) — what you do
    f_body = font(SANS, 34)
    d.text((MARGIN, 420), "Compare your choices with verified humans.", font=f_body, fill=FG)

    # Differentiator (dim) — honest + Worldcoin-aligned, no fake engagement
    f_diff = font(SANS, 30)
    d.text((MARGIN, 470), "No rewards. No streaks. No bots.", font=f_diff, fill=DIM)

    # A / B chips (bottom-left) — green A, magenta B, mirrors the vote UI
    f_chip = font(MONO, 30)
    chip_y = 535
    # A chip
    d.rounded_rectangle([MARGIN, chip_y, MARGIN + 64, chip_y + 50], radius=8, outline=GREEN, width=2)
    d.text((MARGIN + 22, chip_y + 10), "A", font=f_chip, fill=GREEN)
    # B chip
    bx = MARGIN + 80
    d.rounded_rectangle([bx, chip_y, bx + 64, chip_y + 50], radius=8, outline=MAGENTA, width=2)
    d.text((bx + 24, chip_y + 10), "B", font=f_chip, fill=MAGENTA)

    # URL (bottom-right, dim)
    f_url = font(MONO, 26)
    url = "worldcoin.org/mini-app"
    bbox = d.textbbox((0, 0), url, font=f_url)
    uw = bbox[2] - bbox[0]
    d.text((W - MARGIN - uw, chip_y + 12), url, font=f_url, fill=DIM)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {W}x{H})")


if __name__ == "__main__":
    main()
