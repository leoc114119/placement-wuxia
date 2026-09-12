from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw_fullbody_shading_imagegen.png"
OUT = ROOT / "全身_明暗分块.png"
Image.open(RAW).convert("RGB").resize((640, 1243), Image.Resampling.LANCZOS).save(OUT)
print({"raw": Image.open(RAW).size, "output": Image.open(OUT).size})
