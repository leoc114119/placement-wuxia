#!/usr/bin/env python3
"""Deterministic resize and file/geometry evidence for T45 seq=392."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw"
NORMALIZED = ROOT / "normalized"
DELIVERY = ROOT.parent / "交付"

TARGETS = {
    "left": (640, 1421),
    "leftdown": (640, 1691),
    "leftup": (640, 1243),
    "right": (640, 1421),
    "rightup": (640, 1691),
}

VISUAL_STATUS = {
    "left": "candidate_pending_visual_review",
    "leftdown": "candidate_pending_visual_review",
    "leftup": "candidate_pending_visual_review",
    "right": "candidate_pending_visual_review",
    "rightup": "fail_attempt2_removed_existing_embroidery_and_attempt1_added_or_changed_embroidery",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rgb_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])


def mask_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    """Approximate person bbox from a dark-background distance mask.

    This is comparison evidence only, not the production gate: the source is
    an opaque RGB image and the task explicitly forbids semantic processing.
    """
    im = image.convert("RGB")
    w, h = im.size
    corners = [im.getpixel((0, 0)), im.getpixel((w - 1, 0)), im.getpixel((0, h - 1)), im.getpixel((w - 1, h - 1))]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    xs: list[int] = []
    ys: list[int] = []
    for y in range(h):
        for x in range(w):
            if rgb_distance(im.getpixel((x, y)), bg) > 24:
                xs.append(x)
                ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def resize_uniform(raw: Image.Image, target: tuple[int, int]) -> Image.Image:
    rw, rh = raw.size
    tw, th = target
    sx = tw / rw
    sy = th / rh
    if abs(sx - sy) > 0.001:
        raise ValueError(f"non-uniform source ratio: raw={raw.size} target={target} sx={sx} sy={sy}")
    return raw.convert("RGB").resize(target, Image.Resampling.LANCZOS)


reports: dict[str, object] = {"task": "T45", "seq": 392, "processing": "uniform resize only", "directions": {}}
for direction, target in TARGETS.items():
    raw_path = RAW / f"{direction}.png"
    if not raw_path.exists():
        raise FileNotFoundError(raw_path)
    raw = Image.open(raw_path).convert("RGB")
    normalized = resize_uniform(raw, target)
    normalized_path = NORMALIZED / f"全身_{direction}_明暗分块.png"
    delivery_path = DELIVERY / f"全身_{direction}_明暗分块.png"
    normalized.save(normalized_path, format="PNG", optimize=False)
    # rightup is intentionally excluded from delivery after two failed
    # native attempts; preserve its normalized failure evidence only.
    if not VISUAL_STATUS[direction].startswith("fail"):
        normalized.save(delivery_path, format="PNG", optimize=False)

    # The source input is resized only for evidence; no source pixels are
    # copied into the candidate and no semantic correction is attempted.
    input_path = ROOT.parent / "其余五向输入" / f"全身_{direction}_要上明暗的图.png"
    source = Image.open(input_path).convert("RGB")
    source_resized = source.resize(target, Image.Resampling.LANCZOS)
    diff = ImageChops.difference(source_resized, normalized)
    diff_stat = diff.getbbox()
    raw_scale = [target[0] / raw.width, target[1] / raw.height]
    delivery_report = {"path": str(delivery_path), "exists": delivery_path.exists()}
    if delivery_path.exists():
        delivery_report.update({"sha256": sha(delivery_path), "size": list(Image.open(delivery_path).size)})
    report = {
        "raw": {"path": str(raw_path), "sha256": sha(raw_path), "size": list(raw.size), "mode": raw.mode},
        "input": {"path": str(input_path), "sha256": sha(input_path), "size": list(source.size), "mode": source.mode},
        "normalized": {"path": str(normalized_path), "sha256": sha(normalized_path), "size": list(normalized.size), "mode": normalized.mode},
        "delivery": delivery_report,
        "uniformScale": raw_scale,
        "backgroundCorners": [normalized.getpixel(p) for p in [(0, 0), (target[0] - 1, 0), (0, target[1] - 1), (target[0] - 1, target[1] - 1)]],
        "inputApproxForegroundBBox": mask_bbox(source_resized),
        "outputApproxForegroundBBox": mask_bbox(normalized),
        "inputOutputRgbDiffBBox": list(diff_stat) if diff_stat else None,
        "visualStatus": VISUAL_STATUS[direction],
        "selfGatePass": normalized.size == target and normalized.mode == "RGB" and delivery_path.exists(),
    }
    reports["directions"][direction] = report

(ROOT / "qa" / "qa_seq392.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(reports, ensure_ascii=False, indent=2))
