from __future__ import annotations

from pathlib import Path
from collections import deque
import hashlib
import json

from PIL import Image

ROOT = Path(__file__).parent.parent
TARGET = ROOT / "hero_front_standing_final.png"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def components(image: Image.Image, threshold: int = 200):
    width, height = image.size
    pixels = image.load()
    mask = set()
    for y in range(height):
        for x in range(width):
            if min(pixels[x, y]) < threshold:
                mask.add((x, y))
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


def main():
    image = Image.open(TARGET).convert("RGB")
    width, height = image.size
    corner_points = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    corners = [list(image.getpixel(point)) for point in corner_points]
    edge_pixels = []
    for x in range(width):
        edge_pixels.extend([image.getpixel((x, 0)), image.getpixel((x, height - 1))])
    for y in range(height):
        edge_pixels.extend([image.getpixel((0, y)), image.getpixel((width - 1, y))])
    edge_min_channel = min(min(pixel) for pixel in edge_pixels)
    edge_pass = edge_min_channel >= 250

    comps = components(image, threshold=200)
    component_bboxes = [
        [min(x for x, _ in component), min(y for _, y in component),
         max(x for x, _ in component) + 1, max(y for _, y in component) + 1]
        for component in comps[:10]
    ]
    all_points = [point for component in comps for point in component]
    bbox = [
        min(x for x, _ in all_points), min(y for _, y in all_points),
        max(x for x, _ in all_points) + 1, max(y for _, y in all_points) + 1,
    ]
    margins = {
        "left": bbox[0] / width,
        "right": (width - bbox[2]) / width,
        "top": bbox[1] / height,
        "bottom": (height - bbox[3]) / height,
    }
    ratio = width / height
    qa = {
        "task": "T45",
        "seq": "360",
        "path": str(TARGET),
        "sha256": sha(TARGET),
        "size": [width, height],
        "mode": "RGB",
        "ratio": ratio,
        "criteria": {
            "sizeLongEdgeAtLeast1024": {"observed": max(width, height), "threshold": 1024, "pass": max(width, height) >= 1024},
            "ratio3to4Within2Percent": {"observed": ratio, "target": 0.75, "tolerance": 0.02, "pass": abs(ratio - 0.75) <= 0.02},
            "pureWhiteCornersAndEdges": {"corners": corners, "edgeMinChannel": edge_min_channel, "threshold": 250, "pass": edge_pass},
            "singleNonWhiteSubjectComponent": {"threshold": 200, "connectivity": 8, "count": len(comps), "componentSizes": [len(component) for component in comps[:10]], "componentBboxes": component_bboxes, "pass": len(comps) == 1},
            "fullBodyMarginAtLeast8Percent": {"bbox": bbox, "margins": margins, "threshold": 0.08, "pass": all(value >= 0.08 for value in margins.values())},
            "noTextVisual": {"observed": True, "method": "Codex single-image visual review", "pass": True},
        },
        "overallPass": max(width, height) >= 1024 and abs(ratio - 0.75) <= 0.02 and edge_pass and len(comps) == 1 and all(value >= 0.08 for value in margins.values()),
        "visualReview": {
            "description": "Single full-front character, level eyes, upright head, arms separated at sides, legs straight and feet forward; no visible text, weapon, shadow, or second character.",
            "status": "codex_reviewed_pending_Leo",
        },
        "conclusion": "FAIL: output has two thresholded non-white components and bottom margin below 8%; per handoff stop rule, no retry or crop was performed.",
    }
    (ROOT / "qa/front_standing.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "overallPass": qa["overallPass"],
        "ratio": ratio,
        "edgeMinChannel": edge_min_channel,
        "componentCount": len(comps),
        "bbox": bbox,
        "margins": margins,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
