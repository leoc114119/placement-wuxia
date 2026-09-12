#!/usr/bin/env python3
"""Check the twelve authorized pitch-ring raw outputs."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
NAMES = [f"up25_yaw{a}" for a in ("000", "045", "090", "135", "180", "225", "270", "315")] + [f"dn20_yaw{a}" for a in ("045", "135", "225", "315")]
EXPECTED_SIZE = (1086, 1448)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    outputs = []
    for name in NAMES:
        path = ROOT / f"raw_{name}_imagegen.png"
        im = Image.open(path)
        outputs.append({
            "name": name,
            "path": str(path),
            "sha256": sha(path),
            "size": list(im.size),
            "mode": im.mode,
            "pass": im.size == EXPECTED_SIZE and im.mode == "RGB",
        })
    report = {
        "task": "T45",
        "seq": 378,
        "generationCount": 12,
        "pitchAngles": NAMES,
        "enemyFramesProcessed": False,
        "styleReference": "raw_view_yaw270_imagegen.png",
        "processing": {"rawDirect": True, "detailBlend": None, "alphaRestore": False, "registration": False},
        "outputs": outputs,
        "allExpectedSizeAndMode": all(item["pass"] for item in outputs),
        "allUniqueSha256": len({item["sha256"] for item in outputs}) == len(outputs),
    }
    report["selfGatePass"] = report["allExpectedSizeAndMode"] and report["allUniqueSha256"] and not report["enemyFramesProcessed"]
    (ROOT / "qa_pitch12.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "selfGatePass": report["selfGatePass"],
        "count": len(outputs),
        "allSizeAndMode": report["allExpectedSizeAndMode"],
        "allUnique": report["allUniqueSha256"],
        "enemyFramesProcessed": report["enemyFramesProcessed"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
