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
    (ROOT / "idle_right.png", "BASE idle"),
    (ROOT / "pathA/atk_alpha.png", "PATH A alpha"),
    (ROOT / "pathA/atk_beta.png", "PATH A beta"),
    (ROOT / "pathB/atk_alpha.png", "PATH B alpha"),
    (ROOT / "pathB/atk_beta.png", "PATH B beta"),
]
out = Image.new("RGBA", (PANEL[0] * len(entries), PANEL[1]), (25, 25, 25, 255))
for index, (path, label) in enumerate(entries):
    out.alpha_composite(make_panel(path, label), (index * PANEL[0], 0))
out.save(ROOT / "contact/fist_v5_compare.png")
