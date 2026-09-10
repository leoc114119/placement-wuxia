from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).parent.parent
RAW = ROOT / "raw"
CHAIN = ROOT / "chain"
PARALLEL = Path("assets/_trial_20260910/t45_v2_right_batch_seq328/normalized")
PANEL = (520, 430)
CONTENT = (500, 370)


def make_panel(path, crop_box, label):
    im = Image.open(path).convert("RGBA").crop(crop_box)
    im.thumbnail(CONTENT, Image.Resampling.LANCZOS)
    panel = Image.new("RGBA", PANEL, (45, 45, 45, 255))
    x = (PANEL[0] - im.width) // 2
    y = 8 + (CONTENT[1] - im.height) // 2
    panel.alpha_composite(im, (x, y))
    ImageDraw.Draw(panel).text((8, 398), label, fill=(245, 245, 245, 255))
    return panel


def strip(name, entries, crop_box):
    out = Image.new("RGBA", (PANEL[0] * len(entries), PANEL[1]), (25, 25, 25, 255))
    for i, (path, label) in enumerate(entries):
        out.alpha_composite(make_panel(path, crop_box, label), (i * PANEL[0], 0))
    out.save(ROOT / "contact" / name)


strip(
    "legs_3up_chain.png",
    [(RAW / f"walk_right_{i}_chain.png", f"CHAIN walk_{i}") for i in range(1, 4)],
    (150, 780, 950, 1448),
)
strip(
    "legs_3up_parallel.png",
    [(PARALLEL / f"walk_right_{i}.png", f"PARALLEL walk_{i}") for i in range(1, 4)],
    (15, 140, 225, 320),
)
strip(
    "fists_4up_chain.png",
    [(CHAIN / "idle_right.png", "CHAIN idle")]
    + [(RAW / f"atk_right_{i}_chain.png", f"CHAIN atk_{i}") for i in range(1, 4)],
    (200, 500, 1050, 1020),
)
strip(
    "fists_4up_parallel.png",
    [(PARALLEL / "idle_right.png", "PARALLEL idle")]
    + [(PARALLEL / f"atk_right_{i}.png", f"PARALLEL atk_{i}") for i in range(1, 4)],
    (20, 85, 225, 235),
)
