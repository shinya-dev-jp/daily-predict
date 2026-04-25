#!/usr/bin/env python3
"""Capture TuringVote production UI screenshots for World App store listing.

Replaces Daily Predict imagery in public/ with live TuringVote UI shots.

Output:
  public/showcase-{1,2,3}.png         (1080x1080 EN)
  public/showcase-{1,2,3}_ja.png      (1080x1080 JA)
  public/content-card.png             (1035x720 desktop EN)
  public/app-icon-small.png           (512x512 designed logo)

Usage:
  python3 capture_screenshots.py [--scene=1|2|3|all] [--logo-only]
"""

import argparse
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont

BASE = "https://turingvote.vercel.app"
PUBLIC = Path(__file__).parent / "public"
TEMP = PUBLIC / "_temp_capture"

# Terminal palette (inferred from page.tsx style references)
BG_BLACK = (10, 10, 10)
TERMINAL_GREEN = (0, 230, 118)  # var(--terminal-prompt) approx
TERMINAL_DIM = (90, 110, 100)
FOREGROUND = (220, 230, 220)


async def capture(context, url, locale, output_path, wait_ms=4500):
    """Open page with given locale, screenshot to output_path."""
    page = await context.new_page()
    # localStorage seed for locale persistence
    await page.add_init_script(
        f"window.localStorage.setItem('tv.locale', '{locale}')"
    )
    await page.goto(url, wait_until="domcontentloaded")
    await page.wait_for_timeout(wait_ms)
    await page.screenshot(path=str(output_path), full_page=False)
    await page.close()


def compose_square_from_mobile(mobile_shot_path, output_path, size=1080):
    """Resize mobile screenshot to fit centred on square dark canvas."""
    img = Image.open(mobile_shot_path).convert("RGB")
    # Fit screenshot height to ~92% of square
    target_h = int(size * 0.92)
    aspect = img.width / img.height
    new_w = int(target_h * aspect)
    new_h = target_h
    if new_w > size * 0.95:
        new_w = int(size * 0.95)
        new_h = int(new_w / aspect)
    img = img.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGB", (size, size), BG_BLACK)
    # Subtle terminal-grid feel: thin centred separator (avoid heavy)
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    # add 1px terminal-green border around screenshot for branding
    bordered = Image.new("RGB", (new_w + 2, new_h + 2), TERMINAL_GREEN)
    bordered.paste(img, (1, 1))
    canvas.paste(bordered, (x - 1, y - 1))
    canvas.save(output_path, "PNG", optimize=True)


def design_app_icon(output_path, size=512):
    """Vertical-split TuringVote logo: terminal black + green prompt + 'tv:' wordmark."""
    img = Image.new("RGB", (size, size), BG_BLACK)
    draw = ImageDraw.Draw(img)

    # Subtle vertical separator line at 38% (asymmetric split)
    split_x = int(size * 0.38)
    draw.line([(split_x, int(size * 0.2)), (split_x, int(size * 0.8))],
              fill=TERMINAL_DIM, width=2)

    # Try several mono fonts
    font_candidates = [
        "/System/Library/Fonts/Supplemental/Menlo.ttc",
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Monaco.ttf",
        "/Library/Fonts/Andale Mono.ttf",
    ]
    font_big = None
    font_small = None
    for fp in font_candidates:
        if Path(fp).exists():
            try:
                font_big = ImageFont.truetype(fp, 220)
                font_small = ImageFont.truetype(fp, 56)
                break
            except OSError:
                continue
    if font_big is None:
        font_big = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Left half: green ">" prompt
    prompt = ">"
    bbox = draw.textbbox((0, 0), prompt, font=font_big)
    pw, ph = bbox[2] - bbox[0], bbox[3] - bbox[1]
    px = (split_x - pw) // 2 - bbox[0]
    py = (size - ph) // 2 - bbox[1]
    draw.text((px, py), prompt, font=font_big, fill=TERMINAL_GREEN)

    # Right half: 'tv' wordmark in foreground colour
    wordmark = "tv"
    bbox2 = draw.textbbox((0, 0), wordmark, font=font_big)
    ww, wh = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]
    wx = split_x + (size - split_x - ww) // 2 - bbox2[0]
    wy = (size - wh) // 2 - bbox2[1]
    draw.text((wx, wy), wordmark, font=font_big, fill=FOREGROUND)

    # Tiny subtitle below: 'verified' in dim
    subtitle = "verified"
    bbox3 = draw.textbbox((0, 0), subtitle, font=font_small)
    sw = bbox3[2] - bbox3[0]
    sx = (size - sw) // 2 - bbox3[0]
    sy = int(size * 0.78)
    draw.text((sx, sy), subtitle, font=font_small, fill=TERMINAL_DIM)

    img.save(output_path, "PNG", optimize=True)
    print(f"[icon] wrote {output_path}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene", default="all", choices=["1", "2", "3", "all"])
    parser.add_argument("--logo-only", action="store_true")
    parser.add_argument("--test-one", action="store_true",
                        help="Capture scene 1 EN only (smoke test)")
    args = parser.parse_args()

    TEMP.mkdir(parents=True, exist_ok=True)

    # Logo first (independent)
    if args.logo_only:
        design_app_icon(PUBLIC / "app-icon-small.png")
        return

    design_app_icon(PUBLIC / "app-icon-small.png")

    # Scene definitions
    scenes = {
        "1": {
            "url": f"{BASE}/",
            "label": "signin",
            "description": "WalletAuthScreen / sign-in",
        },
        "2": {
            "url": f"{BASE}/?preview=1&showcase=1",
            "label": "vote",
            "description": "VoteScreen with seeded demo data",
        },
        "3": {
            "url": f"{BASE}/about",
            "label": "about",
            "description": "About page (utility explainer)",
        },
    }

    # Smoke test mode
    if args.test_one:
        scenes_to_run = {"1": scenes["1"]}
        locales = ["en"]
    elif args.scene == "all":
        scenes_to_run = scenes
        locales = ["en", "ja"]
    else:
        scenes_to_run = {args.scene: scenes[args.scene]}
        locales = ["en", "ja"]

    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # Mobile viewport for showcase (3x DPR for crisp UI on 1080 canvas)
        mobile_ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},  # iPhone 14
            device_scale_factor=3,
        )

        for scene_id, scene in scenes_to_run.items():
            for locale in locales:
                suffix = "" if locale == "en" else "_ja"
                temp_shot = TEMP / f"shot{scene_id}_{locale}.png"
                final = PUBLIC / f"showcase-{scene_id}{suffix}.png"

                print(f"[scene {scene_id}/{locale}] {scene['description']} → {final.name}")
                await capture(mobile_ctx, scene["url"], locale, temp_shot)
                compose_square_from_mobile(temp_shot, final)
                print(f"  ✓ {final}")

        await mobile_ctx.close()

        # content-card.png — 1035x720 horizontal marketing card.
        # Source: mobile sign-in screenshot composed onto wider canvas with
        # branding accents. Avoids /about (production has stale Daily-Predict-era
        # content until next deploy).
        if args.scene == "all" or not args.test_one:
            print(f"[content-card] composing 1035x720 marketing card from sign-in shot")
            signin_shot = TEMP / "shot1_en.png"
            if not signin_shot.exists():
                # capture if not already done
                tmp_ctx = await browser.new_context(
                    viewport={"width": 390, "height": 844},
                    device_scale_factor=3,
                )
                await capture(tmp_ctx, f"{BASE}/", "en", signin_shot)
                await tmp_ctx.close()

            mobile = Image.open(signin_shot).convert("RGB")
            # fit mobile shot to 95% of card height, then centre-paste with
            # terminal-styled side panels showing wordmark + tagline.
            card_w, card_h = 1035, 720
            target_h = int(card_h * 0.96)
            aspect = mobile.width / mobile.height
            new_w = int(target_h * aspect)
            new_h = target_h
            mobile = mobile.resize((new_w, new_h), Image.LANCZOS)

            card = Image.new("RGB", (card_w, card_h), BG_BLACK)
            draw = ImageDraw.Draw(card)

            # Place screenshot on right side
            x = card_w - new_w - 24
            y = (card_h - new_h) // 2
            bordered = Image.new("RGB", (new_w + 2, new_h + 2), TERMINAL_GREEN)
            bordered.paste(mobile, (1, 1))
            card.paste(bordered, (x - 1, y - 1))

            # Left panel: brand block
            try:
                font_h1 = ImageFont.truetype("/System/Library/Fonts/Supplemental/Menlo.ttc", 56)
                font_body = ImageFont.truetype("/System/Library/Fonts/Supplemental/Menlo.ttc", 22)
                font_tag = ImageFont.truetype("/System/Library/Fonts/Supplemental/Menlo.ttc", 16)
            except OSError:
                font_h1 = font_body = font_tag = ImageFont.load_default()

            left_x = 56
            draw.text((left_x, 110), "> turingvote: boot", font=font_tag, fill=TERMINAL_GREEN)
            draw.text((left_x, 170), "TuringVote", font=font_h1, fill=FOREGROUND)
            draw.text((left_x, 260), "Mountains or ocean?", font=font_body, fill=FOREGROUND)
            draw.text((left_x, 290), "Dog or cat?", font=font_body, fill=FOREGROUND)
            draw.text((left_x, 340), "A/B polls only", font=font_body, fill=TERMINAL_DIM)
            draw.text((left_x, 370), "Verified Humans", font=font_body, fill=TERMINAL_DIM)
            draw.text((left_x, 400), "can answer.", font=font_body, fill=TERMINAL_DIM)
            draw.text((left_x, 560), "// VERIFIED HUMANS ONLY", font=font_tag, fill=TERMINAL_GREEN)

            card.save(PUBLIC / "content-card.png", "PNG", optimize=True)
            print(f"  ✓ {PUBLIC / 'content-card.png'}")

        await browser.close()

    print("\nDone. Generated files:")
    for f in sorted(PUBLIC.glob("showcase-*.png")):
        print(f"  {f.name}  ({Image.open(f).size})")
    for f in [PUBLIC / "content-card.png", PUBLIC / "app-icon-small.png"]:
        if f.exists():
            print(f"  {f.name}  ({Image.open(f).size})")


if __name__ == "__main__":
    asyncio.run(main())
