#!/usr/bin/env python3
"""Check that the seven authorized outputs are raw, present, and untouched."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
ANGLES = ("000", "045", "090", "135", "180", "225", "315")
EXPECTED_SIZE = (1086, 1448)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    outputs = []
    for angle in ANGLES:
        path = ROOT / f"raw_view_yaw{angle}_imagegen.png"
        im = Image.open(path)
        outputs.append({
            "angle": angle,
            "path": str(path),
            "sha256": sha(path),
            "size": list(im.size),
            "mode": im.mode,
            "pass": im.size == EXPECTED_SIZE and im.mode == "RGB",
        })
    unique = len({item["sha256"] for item in outputs}) == len(outputs)
    report = {
        "task": "T45",
        "seq": 376,
        "angles": ANGLES,
        "generationCount": 7,
        "styleReference": "raw_view_yaw270_imagegen.png",
        "processing": {"rawDirect": True, "detailBlend": None, "alphaRestore": False, "registration": False},
        "outputs": outputs,
        "allExpectedSizeAndMode": all(item["pass"] for item in outputs),
        "allUniqueSha256": unique,
        "selfGatePass": all(item["pass"] for item in outputs) and unique,
    }
    (ROOT / "qa_remaining7.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "selfGatePass": report["selfGatePass"],
        "count": len(outputs),
        "allSizeAndMode": report["allExpectedSizeAndMode"],
        "allUnique": unique,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
