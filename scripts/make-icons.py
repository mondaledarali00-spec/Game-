#!/usr/bin/env python3
"""Generate GymFlow launcher icons (all densities) with Pillow.

    python3 scripts/make-icons.py

Writes android/res/mipmap-*/ic_launcher.png plus a 512px master in
docs/assets for store listings.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "res"
DOCS = ROOT / "docs" / "assets"

SIZE = 512
BG = (11, 18, 13, 255)
BG_TOP = (17, 32, 20, 255)
ACCENT = (163, 230, 53, 255)
ACCENT_DARK = (108, 168, 25, 255)

DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def make_master() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)

    # subtle vertical gradient
    for y in range(SIZE):
        t = y / SIZE
        r = int(BG_TOP[0] * (1 - t) + BG[0] * t)
        g = int(BG_TOP[1] * (1 - t) + BG[1] * t)
        b = int(BG_TOP[2] * (1 - t) + BG[2] * t)
        draw.line([(0, y), (SIZE, y)], fill=(r, g, b, 255))

    # lime glow behind the dumbbell
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse((70, 150, 442, 360), fill=(163, 230, 53, 46))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    # dumbbell: bar + two plates
    bar_h = 30
    rounded(draw, (150, SIZE // 2 - bar_h // 2, 362, SIZE // 2 + bar_h // 2), bar_h // 2, ACCENT)

    plate_w, plate_h = 54, 168
    cy = SIZE // 2
    rounded(draw, (96, cy - plate_h // 2, 96 + plate_w, cy + plate_h // 2), 22, ACCENT)
    rounded(draw, (SIZE - 96 - plate_w, cy - plate_h // 2, SIZE - 96, cy + plate_h // 2), 22, ACCENT)

    inner_w, inner_h = 30, 116
    rounded(draw, (168, cy - inner_h // 2, 168 + inner_w, cy + inner_h // 2), 14, ACCENT_DARK)
    rounded(draw, (SIZE - 168 - inner_w, cy - inner_h // 2, SIZE - 168, cy + inner_h // 2), 14, ACCENT_DARK)

    # rounded outer corners so the icon looks deliberate on old launchers
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, SIZE, SIZE), radius=112, fill=255)
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main() -> None:
    master = make_master()
    DOCS.mkdir(parents=True, exist_ok=True)
    master.save(DOCS / "icon-512.png")
    for folder, size in DENSITIES.items():
        target = RES / folder
        target.mkdir(parents=True, exist_ok=True)
        master.resize((size, size), Image.LANCZOS).save(target / "ic_launcher.png")
        print(f"wrote {target / 'ic_launcher.png'} ({size}x{size})")
    print(f"wrote {DOCS / 'icon-512.png'}")


if __name__ == "__main__":
    main()
