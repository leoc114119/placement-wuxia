#!/usr/bin/env python3
"""Mechanical gates for the yaw270 texture-detail pilot."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / "角度图/view_yaw270.png"
ALPHA = ROOT.parent / "alpha/view_yaw270_alpha.png"
OUTPUT = ROOT / "view_yaw270_detail.png"
RAW = ROOT / "raw_view_yaw270_imagegen.png"
BG = (20, 20, 24)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bbox(points):
    return [min(x for x, _ in points), min(y for _, y in points), max(x for x, _ in points) + 1, max(y for _, y in points) + 1]


def luminance(pixel):
    return 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2]


def interior_gradient(im: Image.Image, mask, radius=3):
    pix = im.load()
    values = []
    width, height = im.size
    for y in range(radius, height - radius):
        for x in range(radius, width - radius):
            if not mask[y][x]:
                continue
            if not all(mask[ny][nx] for ny in range(y - radius, y + radius + 1) for nx in range(x - radius, x + radius + 1)):
                continue
            center = luminance(pix[x, y])
            values.append((abs(luminance(pix[x + 1, y]) - center) + abs(luminance(pix[x, y + 1]) - center)) / 2)
    return sum(values) / max(1, len(values)), len(values)


def main():
    source = Image.open(SOURCE).convert("RGB")
    alpha = Image.open(ALPHA).convert("L")
    output = Image.open(OUTPUT).convert("RGB")
    raw = Image.open(RAW).convert("RGB")
    source_mask = [[alpha.getpixel((x, y)) > 127 for x in range(source.width)] for y in range(source.height)]
    output_mask = [[output.getpixel((x, y)) != BG for x in range(output.width)] for y in range(output.height)]
    source_points = [(x, y) for y in range(source.height) for x in range(source.width) if source_mask[y][x]]
    output_points = [(x, y) for y in range(output.height) for x in range(output.width) if output_mask[y][x]]
    source_set = set(source_points)
    output_set = set(output_points)
    intersection = len(source_set & output_set)
    union = len(source_set | output_set)
    src_bbox = bbox(source_points)
    out_bbox = bbox(output_points)
    bbox_shift = [abs(out_bbox[i] - src_bbox[i]) for i in range(4)]
    src_w, src_h = src_bbox[2] - src_bbox[0], src_bbox[3] - src_bbox[1]
    out_w, out_h = out_bbox[2] - out_bbox[0], out_bbox[3] - out_bbox[1]

    outside_bad = 0
    abs_sum = 0
    channel_sum = [0, 0, 0]
    interior_count = 0
    source_pix = source.load()
    output_pix = output.load()
    for y in range(source.height):
        for x in range(source.width):
            if source_mask[y][x]:
                delta = [abs(output_pix[x, y][i] - source_pix[x, y][i]) for i in range(3)]
                channel_sum = [channel_sum[i] + delta[i] for i in range(3)]
                abs_sum += sum(delta)
                interior_count += 1
            elif output_pix[x, y] != BG:
                outside_bad += 1

    src_grad, grad_count = interior_gradient(source, source_mask, 3)
    out_grad, _ = interior_gradient(output, source_mask, 3)
    qa = {
        "task": "T45",
        "seq": 374,
        "view": "yaw270",
        "source": {"path": str(SOURCE), "sha256": sha(SOURCE), "size": list(source.size)},
        "rawImagegen": {"path": str(RAW), "sha256": sha(RAW), "size": list(raw.size)},
        "output": {"path": str(OUTPUT), "sha256": sha(OUTPUT), "size": list(output.size), "mode": output.mode},
        "geometry": {
            "sourceAlphaBBox": src_bbox,
            "outputNonBackgroundBBox": out_bbox,
            "bboxShiftPx": bbox_shift,
            "bboxWidthRelativeDiff": abs(out_w - src_w) / max(1, src_w),
            "bboxHeightRelativeDiff": abs(out_h - src_h) / max(1, src_h),
            "iouAgainstSourceAlpha": intersection / max(1, union),
            "pass": intersection / max(1, union) >= 0.97 and max(bbox_shift) <= 2 and abs(out_w - src_w) / max(1, src_w) <= 0.01 and abs(out_h - src_h) / max(1, src_h) <= 0.01,
        },
        "color": {
            "meanAbsChannelDelta": [value / max(1, interior_count) for value in channel_sum],
            "meanAbsRgbDelta": abs_sum / max(1, interior_count * 3),
            "threshold": 6,
            "pass": abs_sum / max(1, interior_count * 3) <= 6,
        },
        "background": {
            "expected": list(BG),
            "outsideAlphaNonBackgroundPixels": outside_bad,
            "pass": outside_bad == 0,
        },
        "interiorGradientRadius3": {
            "sourceMean": src_grad,
            "outputMean": out_grad,
            "samples": grad_count,
            "pass": out_grad >= src_grad,
        },
        "deterministicProcessing": json.loads((ROOT / "qa_prepare_yaw270.json").read_text()),
    }
    qa["selfGatePass"] = all([
        output.size == (1024, 1365),
        qa["geometry"]["pass"],
        qa["color"]["pass"],
        qa["background"]["pass"],
        qa["interiorGradientRadius3"]["pass"],
    ])
    (ROOT / "qa_yaw270.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "selfGatePass": qa["selfGatePass"],
        "size": output.size,
        "iou": qa["geometry"]["iouAgainstSourceAlpha"],
        "bboxShiftPx": bbox_shift,
        "meanAbsRgbDelta": qa["color"]["meanAbsRgbDelta"],
        "outsideBad": outside_bad,
        "gradient": [src_grad, out_grad],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
