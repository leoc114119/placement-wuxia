#!/usr/bin/env python3
"""QA for the narrowed idle scope: exactly one usable frame per direction."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
FACES = ("left", "leftdown", "leftup", "right", "rightdown", "rightup")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    outputs = []
    for facing in FACES:
        path = ROOT / f"idle_{facing}_1.png"
        im = Image.open(path)
        outputs.append({"facing": facing, "path": str(path), "sha256": sha(path), "size": list(im.size), "mode": im.mode, "pass": im.mode == "RGB" and im.size[0] > 0 and im.size[1] > 0})
    report = {
        "task": "T45",
        "seq": 383,
        "usableScope": "six directions × one idle frame",
        "faces": FACES,
        "generationCount": 10,
        "usableFrameCount": 6,
        "oldUnusedFramesRetained": ["idle_right_2", "idle_right_3", "idle_right_4", "idle_right_5"],
        "processing": {"rawDirect": True, "resize": False, "alphaRestore": False, "detailBlend": None},
        "outputs": outputs,
    }
    report["selfGatePass"] = all(item["pass"] for item in outputs) and len({item["sha256"] for item in outputs}) == len(outputs)
    (ROOT / "qa_idle_scope.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"selfGatePass": report["selfGatePass"], "usableFrameCount": len(outputs), "allUnique": len({item["sha256"] for item in outputs}) == len(outputs)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
