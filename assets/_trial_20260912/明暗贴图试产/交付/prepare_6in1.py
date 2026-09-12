from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw_六向_shading_imagegen.png"
OUT = ROOT / "六向_明暗分块拼图.png"
Image.open(RAW).convert("RGB").resize((916, 912), Image.Resampling.LANCZOS).save(OUT)
print({"raw": Image.open(RAW).size, "output": Image.open(OUT).size})
