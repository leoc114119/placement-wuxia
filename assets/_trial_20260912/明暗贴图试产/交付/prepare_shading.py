#!/usr/bin/env python3
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw_head_shading_imagegen.png"
OUT = ROOT / "头部_明暗分块.png"
Image.open(RAW).convert("RGB").resize((512, 448), Image.Resampling.LANCZOS).save(OUT)
print({"raw": Image.open(RAW).size, "output": Image.open(OUT).size})
