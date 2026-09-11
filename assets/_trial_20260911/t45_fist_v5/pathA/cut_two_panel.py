from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
source = Image.open(ROOT / "sheet_2panel.png")
width, height = source.size
if width % 2:
    raise SystemExit(f"双格图宽度必须为偶数，实际为 {width}")
half = width // 2
source.crop((0, 0, half, height)).save(ROOT / "atk_alpha.png")
source.crop((half, 0, width, height)).save(ROOT / "atk_beta.png")
print({"source": [width, height], "panel": [half, height]})
