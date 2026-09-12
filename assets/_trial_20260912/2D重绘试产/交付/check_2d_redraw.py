#!/usr/bin/env python3
"""File-level QA for the two raw 2D redraw pilot outputs."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
NAMES = ("right", "rightdown")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    outputs = []
    for name in NAMES:
        path = ROOT / f"redraw_{name}.png"
        im = Image.open(path)
        outputs.append({
            "name": name,
            "path": str(path),
            "sha256": sha(path),
            "size": list(im.size),
            "mode": im.mode,
            "pass": im.mode == "RGB" and im.size[0] > 0 and im.size[1] > 0,
        })
    report = {
        "task": "T45",
        "seq": 380,
        "generationCount": 2,
        "referenceRoles": {"style": "online 2D reference", "pose": "our 3D render reference"},
        "processing": {"rawDirect": True, "resize": False, "alphaRestore": False, "detailBlend": None},
        "outputs": outputs,
        "allFilesPresentAndRgb": all(item["pass"] for item in outputs),
        "allUniqueSha256": len({item["sha256"] for item in outputs}) == len(outputs),
    }
    report["selfGatePass"] = report["allFilesPresentAndRgb"] and report["allUniqueSha256"]
    (ROOT / "qa_2d_redraw.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"selfGatePass": report["selfGatePass"], "outputs": outputs}, ensure_ascii=False))


if __name__ == "__main__":
    main()
