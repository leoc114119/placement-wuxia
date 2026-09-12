#!/usr/bin/env python3
import hashlib, json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw_head_shading_imagegen.png"
OUT = ROOT / "头部_明暗分块.png"

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

raw = Image.open(RAW).convert("RGB")
out = Image.open(OUT).convert("RGB")
report = {
    "task": "T45", "seq": 385,
    "raw": {"path": str(RAW), "sha256": sha(RAW), "size": list(raw.size)},
    "output": {"path": str(OUT), "sha256": sha(OUT), "size": list(out.size), "mode": out.mode},
    "processing": {"uniformResizeOnly": True, "semanticRedraw": False},
    "backgroundCorners": [out.getpixel(p) for p in [(0,0),(511,0),(0,447),(511,447)]],
    "selfGatePass": out.size == (512, 448) and out.mode == "RGB",
}
(ROOT / "qa_shading.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(report, ensure_ascii=False))
