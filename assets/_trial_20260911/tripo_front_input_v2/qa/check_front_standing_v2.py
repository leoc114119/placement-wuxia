from __future__ import annotations

from pathlib import Path
from collections import deque
import hashlib
import json

from PIL import Image

ROOT = Path(__file__).parent.parent
TARGET = ROOT / "hero_front_standing_v2.png"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def flood_foreground(image: Image.Image, threshold: int = 240):
    width, height = image.size
    pixels = image.load()
    background = set()
    for y in range(height):
        for x in range(width):
            if min(pixels[x, y]) < threshold:
                continue
            background.add((x, y))
    seen = set()
    queue = deque()
    for x in range(width):
        queue.extend([(x, 0), (x, height - 1)])
    for y in range(height):
        queue.extend([(0, y), (width - 1, y)])
    while queue:
        point = queue.popleft()
        if point in seen or point not in background:
            continue
        seen.add(point)
        x, y = point
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if (nx, ny) in background and (nx, ny) not in seen:
                queue.append((nx, ny))
    return {(x, y) for y in range(height) for x in range(width) if (x, y) not in seen}


def foreground_components(image: Image.Image, threshold: int = 240):
    width, height = image.size
    mask = flood_foreground(image, threshold)
    seen = set()
    result = []
    for point in mask:
        if point in seen:
            continue
        queue = deque([point])
        seen.add(point)
        points = []
        while queue:
            x, y = queue.popleft()
            points.append((x, y))
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1),
                           (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1), (x + 1, y + 1)):
                if (nx, ny) in mask and (nx, ny) not in seen:
                    seen.add((nx, ny))
                    queue.append((nx, ny))
        result.append(points)
    result.sort(key=len, reverse=True)
    return result


def arm_gap_rows(image: Image.Image, bbox, foreground):
    # Review window is the middle 35%..75% of the subject bbox. For each row,
    # count foreground runs; a valid A-pose row has left arm | torso | right arm.
    width, height = image.size
    x0, y0, x1, y1 = bbox
    start = y0 + int((y1 - y0) * 0.35)
    stop = y0 + int((y1 - y0) * 0.75)
    rows = []
    for y in range(start, stop):
        runs = []
        in_run = False
        for x in range(x0, x1):
            fg = (x, y) in foreground
            if fg and not in_run:
                run_start = x
                in_run = True
            if in_run and (not fg or x == x1 - 1):
                run_end = x if fg and x == x1 - 1 else x - 1
                if run_end - run_start + 1 >= max(2, int(width * 0.004)):
                    runs.append((run_start, run_end + 1))
                in_run = False
        rows.append({"y": y, "runCount": len(runs), "runs": runs})
    passing = sum(row["runCount"] >= 3 for row in rows)
    return {"rows": rows, "passingRows": passing, "totalRows": len(rows), "passRate": passing / len(rows) if rows else 0}


def main():
    image = Image.open(TARGET).convert("RGB")
    width, height = image.size
    edges = []
    for x in range(width):
        edges.extend([image.getpixel((x, 0)), image.getpixel((x, height - 1))])
    for y in range(height):
        edges.extend([image.getpixel((0, y)), image.getpixel((width - 1, y))])
    edge_min = min(min(pixel) for pixel in edges)
    comps = foreground_components(image, threshold=240)
    points = [point for component in comps for point in component]
    bbox = [min(x for x, _ in points), min(y for _, y in points), max(x for x, _ in points) + 1, max(y for _, y in points) + 1]
    margins = {"left": bbox[0] / width, "right": (width - bbox[2]) / width, "top": bbox[1] / height, "bottom": (height - bbox[3]) / height}
    ratio = width / height
    foreground = flood_foreground(image, threshold=240)
    gaps = arm_gap_rows(image, bbox, foreground)
    qa = {
        "task": "T45", "seq": "362", "path": str(TARGET), "sha256": sha(TARGET),
        "size": [width, height], "mode": "RGB", "ratio": ratio,
        "criteria": {
            "sizeLongEdgeAtLeast1024": {"observed": max(width, height), "threshold": 1024, "pass": max(width, height) >= 1024},
            "ratio3to4Within2Percent": {"observed": ratio, "target": 0.75, "tolerance": 0.02, "pass": abs(ratio - 0.75) <= 0.02},
            "pureWhiteCornersAndEdges": {"edgeMinChannel": edge_min, "threshold": 250, "pass": edge_min >= 250},
            "singleSubjectByBackgroundFlood": {"threshold": 240, "backgroundConnectivity": 4, "subjectConnectivity": 8, "count": len(comps), "componentSizes": [len(component) for component in comps[:10]], "pass": len(comps) == 1},
            "armTorsoGap": {"method": "background threshold 240; rows in subject bbox 35%..75%; require >=3 foreground runs", "passRate": gaps["passRate"], "threshold": 0.90, "pass": gaps["passRate"] >= 0.90},
            "bodyMarginAtLeast5Percent": {"bbox": bbox, "margins": margins, "threshold": 0.05, "pass": all(value >= 0.05 for value in margins.values())},
            "noTextVisual": {"observed": True, "method": "Codex single-image visual review", "pass": True},
        },
        "manualPoseReview": {"frontFacing": True, "aPoseNotTPose": True, "headSimplified": True, "armsVisiblySeparate": True, "legsAndFeetStable": True},
        "overallPass": max(width, height) >= 1024 and abs(ratio - 0.75) <= 0.02 and edge_min >= 250 and len(comps) == 1 and gaps["passRate"] >= 0.90 and all(value >= 0.05 for value in margins.values()),
        "conclusion": "pending_visual_review",
    }
    (ROOT / "qa/front_standing_v2.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"overallPass": qa["overallPass"], "size": [width, height], "ratio": ratio, "edgeMin": edge_min, "componentCount": len(comps), "armGapPassRate": gaps["passRate"], "margins": margins}, ensure_ascii=False))


if __name__ == "__main__":
    main()
