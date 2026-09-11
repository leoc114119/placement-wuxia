from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent.parent
PANEL = (520, 430)
CONTENT = (500, 370)


def make_panel(path, label):
    image = Image.open(path).convert("RGBA")
    image.thumbnail(CONTENT, Image.Resampling.LANCZOS)
    panel = Image.new("RGBA", PANEL, (45, 45, 45, 255))
    x = (PANEL[0] - image.width) // 2
    y = 8 + (CONTENT[1] - image.height) // 2
    panel.alpha_composite(image, (x, y))
    ImageDraw.Draw(panel).text((8, 398), label, fill=(245, 245, 245, 255))
    return panel


entries = [
    (Path("assets/_trial_20260910/t45_chain_limb_alternation_v2/chain/idle_right.png"), "BASE idle"),
    (ROOT / "anchor/atk_right_1.png", "CHAIN atk_1 anchor"),
    (ROOT / "raw/atk_right_2.png", "CHAIN atk_2 v3"),
    (ROOT / "raw/atk_right_3.png", "CHAIN atk_3 v3"),
]
out = Image.new("RGBA", (PANEL[0] * len(entries), PANEL[1]), (25, 25, 25, 255))
for index, (path, label) in enumerate(entries):
    out.alpha_composite(make_panel(path, label), (index * PANEL[0], 0))
out.save(ROOT / "contact/fist_v3_3up.png")
