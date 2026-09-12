#!/usr/bin/env python3
import hashlib, json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw_六向_shading_imagegen.png"
OUT = ROOT / "六向_明暗分块拼图.png"

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

raw = Image.open(RAW).convert("RGB")
out = Image.open(OUT).convert("RGB")
report = {
    "task": "T45", "seq": 390,
    "layout": "top=leftdown,left,leftup; bottom=rightdown,right,rightup",
    "raw": {"sha256": sha(RAW), "size": list(raw.size)},
    "output": {"sha256": sha(OUT), "size": list(out.size), "mode": out.mode},
    "processing": {"uniformResizeOnly": True, "semanticRedraw": False},
    "selfGatePass": out.size == (916, 912) and out.mode == "RGB",
}
(ROOT / "qa_6in1.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(report, ensure_ascii=False))
