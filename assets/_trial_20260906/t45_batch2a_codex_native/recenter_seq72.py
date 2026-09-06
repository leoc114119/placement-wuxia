from pathlib import Path

from PIL import Image


ROOT = Path(__file__).parent
SOURCE = ROOT / "normalized" / "shanzei_a_right.png"
BACKUP = ROOT / "qa" / "shanzei_a_right_before_seq72.png"
DX = 14


source = Image.open(SOURCE).convert("RGBA")
if source.size != (240, 320):
    raise ValueError(f"unexpected source size: {source.size}")
if not BACKUP.exists():
    source.save(BACKUP, "PNG", optimize=False)

shifted = Image.new("RGBA", source.size, (0, 0, 0, 0))
shifted.alpha_composite(source, (DX, 0))
shifted.save(SOURCE, "PNG", optimize=False)
print(f"shifted {SOURCE} by +{DX}px; backup={BACKUP}")
