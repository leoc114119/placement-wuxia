#!/usr/bin/env python3
"""Normalize the selected shared die-bone pose3 more-Q candidate without redrawing it.

The ImageGen source is an RGB image on a neutral white background.  This
script performs only deterministic processing: edge-connected neutral flood
cut, repeated bright-edge defringing, aspect-preserving width normalization,
and placement on the T45 240x320 frame.  The low-contrast contact shadow is
kept as part of the connected source silhouette.
"""
from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "raw" / "die_common_bone_pose3_more_q_attempt1.png"
OUT = ROOT / "normalized" / "die_common_bone_pose3_more_q.png"
DARK = ROOT / "contact" / "die_common_bone_pose3_more_q_dark_check.png"
QA = ROOT / "qa" / "die_common_bone_pose3_more_q.json"

CANVAS = (240, 320)
TARGET_WIDTH = 150
FLOOD_THRESHOLD = 60
DEFRINGE_LUMA = 195
ALPHA_GATE = 32


def flood_cut_neutral(im: Image.Image) -> tuple[Image.Image, int]:
    """Remove only near-white pixels connected to the outer frame."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    mask = rgb.copy()
    seeds = [
        (0, 0),
        (w - 1, 0),
        (0, h - 1),
        (w - 1, h - 1),
        (w // 2, 0),
        (w // 2, h - 1),
        (0, h // 2),
        (w - 1, h // 2),
    ]
    for seed in seeds:
        ImageDraw.floodfill(mask, seed, (0, 255, 0), thresh=FLOOD_THRESHOLD)

    out = rgb.convert("RGBA")
    opx = out.load()
    mpx = mask.load()
    removed = 0
    for y in range(h):
        for x in range(w):
            if mpx[x, y] == (0, 255, 0):
                opx[x, y] = (0, 0, 0, 0)
                removed += 1
    return out, removed


def defringe(im: Image.Image) -> int:
    """Drop bright pixels directly touching transparency; return count."""
    px = im.load()
    w, h = im.size
    edge: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if any(
                0 <= x + dx < w
                and 0 <= y + dy < h
                and px[x + dx, y + dy][3] == 0
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                edge.append((x, y))
    removed = 0
    for x, y in edge:
        r, g, b, _ = px[x, y]
        if (r + g + b) / 3 > DEFRINGE_LUMA:
            px[x, y] = (0, 0, 0, 0)
            removed += 1
    return removed


def alpha_bbox(im: Image.Image, threshold: int = ALPHA_GATE) -> tuple[int, int, int, int]:
    px = im.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3] > threshold:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise ValueError("no foreground pixels after flood-cut")
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def measure(im: Image.Image) -> dict:
    px = im.load()
    bb = alpha_bbox(im)
    points = {
        (x, y)
        for y in range(im.height)
        for x in range(im.width)
        if px[x, y][3] > ALPHA_GATE
    }
    remaining = set(points)
    components: list[int] = []
    while remaining:
        stack = [remaining.pop()]
        size = 0
        while stack:
            x, y = stack.pop()
            size += 1
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (x + dx, y + dy)
                    if q in remaining:
                        remaining.remove(q)
                        stack.append(q)
        components.append(size)

    centroid_x = sum(x for x, _ in points) / len(points)
    centroid_y = sum(y for _, y in points) / len(points)
    border_nonzero = sum(
        1
        for x in range(im.width)
        for y in (0, im.height - 1)
        if px[x, y][3] > 0
    ) + sum(
        1
        for y in range(im.height)
        for x in (0, im.width - 1)
        if px[x, y][3] > 0
    )
    light_boundary = 0
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0 or (r + g + b) / 3 <= DEFRINGE_LUMA:
                continue
            if any(
                0 <= x + dx < im.width
                and 0 <= y + dy < im.height
                and px[x + dx, y + dy][3] == 0
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                light_boundary += 1
    return {
        "bboxT32": list(bb),
        "visualWidth": bb[2] - bb[0],
        "visualHeight": bb[3] - bb[1],
        "feetY": bb[3],
        "bboxCenterX": (bb[0] + bb[2]) / 2,
        "alpha32CentroidX": centroid_x,
        "alpha32CentroidY": centroid_y,
        "alphaExtrema": list(im.getchannel("A").getextrema()),
        "components": len(components),
        "largestComponent": max(components),
        "borderNonzero": border_nonzero,
        "lightBoundaryPixels": light_boundary,
    }


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    DARK.parent.mkdir(parents=True, exist_ok=True)

    source = Image.open(SRC).convert("RGB")
    cut, background_pixels = flood_cut_neutral(source)
    removed = 0
    passes = 0
    while passes < 8:
        n = defringe(cut)
        removed += n
        passes += 1
        if n == 0:
            break

    highres_bbox = cut.getbbox()
    if highres_bbox is None:
        raise ValueError("empty source after flood-cut")
    cropped = cut.crop(highres_bbox)
    scale = TARGET_WIDTH / cropped.width
    target_h = round(cropped.height * scale)
    resized = cropped.resize((TARGET_WIDTH, target_h), Image.Resampling.LANCZOS)

    frame = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    x = (CANVAS[0] - resized.width) // 2
    # T45 uses the visible content bottom as the baseline.  The bbox uses
    # half-open coordinates, so y=300-target_h places the last content row at
    # index 299 and reports feetY=300, matching the existing frame QA.
    y = 300 - resized.height
    frame.alpha_composite(resized, (x, y))
    frame.save(OUT, "PNG", optimize=False)

    # A dark inspection plate makes retained light halos and the contact shadow
    # visible without altering the release PNG.
    plate = Image.new("RGB", CANVAS, (38, 38, 42))
    plate.paste(frame, (0, 0), frame.getchannel("A"))
    plate.resize((CANVAS[0] * 3, CANVAS[1] * 3), Image.Resampling.NEAREST).save(DARK, "PNG", optimize=False)

    m = measure(frame)
    hard = bool(
        frame.size == CANVAS
        and frame.mode == "RGBA"
        and 120 <= m["visualWidth"] <= 160
        and m["feetY"] == 300
        and m["bboxCenterX"] == 120
        and m["components"] == 1
        and m["borderNonzero"] == 0
        and m["alphaExtrema"] == [0, 255]
    )
    record = {
        "key": "die_common_bone_pose3_more_q",
        "source": str(SRC.relative_to(ROOT)),
        "output": str(OUT.relative_to(ROOT)),
        "darkCheck": str(DARK.relative_to(ROOT)),
        "size": list(frame.size),
        "mode": frame.mode,
        "sourceSize": list(source.size),
        "sourceSha256": hashlib.sha256(SRC.read_bytes()).hexdigest(),
        "outputSha256": hashlib.sha256(OUT.read_bytes()).hexdigest(),
        "processing": {
            "background": "edge-connected neutral flood-cut",
            "floodThreshold": FLOOD_THRESHOLD,
            "backgroundPixelsRemoved": background_pixels,
            "defringeLuma": DEFRINGE_LUMA,
            "defringePasses": passes,
            "defringePixelsRemoved": removed,
            "aspectPreservingTargetWidth": TARGET_WIDTH,
            "canvas": list(CANVAS),
            "placement": "bbox centered x=120; bottom y=300",
            "redraw": False,
            "shadow": "retained from selected source; no synthetic redraw",
        },
        **m,
        "mechanicalPass": hard,
    }
    QA.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record, ensure_ascii=False, indent=2))
    if not hard:
        raise SystemExit("shared die-bone pose2 mechanical gate failed")


if __name__ == "__main__":
    main()
