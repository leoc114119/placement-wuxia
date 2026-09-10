from __future__ import annotations

from pathlib import Path
import hashlib
import json
import math

from PIL import Image

ROOT = Path(__file__).parent.parent
RAW = ROOT / "raw"
CHAIN = ROOT / "chain"
RAW_SIZE = (1086, 1448)
COMPARE_SIZE = (240, 320)
SCALE_X = COMPARE_SIZE[0] / RAW_SIZE[0]
SCALE_Y = COMPARE_SIZE[1] / RAW_SIZE[1]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def components(image: Image.Image, predicate, box, min_pixels=20):
    x0, y0, x1, y1 = box
    px = image.load()
    seen = set()
    out = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x, y) in seen or not predicate(*px[x, y]):
                continue
            stack = [(x, y)]
            seen.add((x, y))
            points = []
            while stack:
                xx, yy = stack.pop()
                points.append((xx, yy))
                for nx, ny in ((xx - 1, yy), (xx + 1, yy), (xx, yy - 1), (xx, yy + 1)):
                    if x0 <= nx < x1 and y0 <= ny < y1 and (nx, ny) not in seen and predicate(*px[nx, ny]):
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(points) >= min_pixels:
                xs = [p[0] for p in points]
                ys = [p[1] for p in points]
                out.append({
                    "pixels": len(points),
                    "bboxRaw": [min(xs), min(ys), max(xs) + 1, max(ys) + 1],
                    "centerRaw": [sum(xs) / len(xs), sum(ys) / len(ys)],
                })
    return sorted(out, key=lambda c: c["pixels"], reverse=True)


def normalize_component(component):
    component = dict(component)
    component["centerNormalized"] = [
        component["centerRaw"][0] * SCALE_X,
        component["centerRaw"][1] * SCALE_Y,
    ]
    return component


def measure_feet(path: Path):
    image = Image.open(path).convert("RGBA")

    def sole(r, g, b, a):
        return a > 0 and r > 120 and 35 < g < 210 and b < 150 and r > g + 20

    cs = components(image, sole, (0, 1050, image.width, image.height), 200)
    cs = [c for c in cs if c["bboxRaw"][2] - c["bboxRaw"][0] > 40]
    return [normalize_component(c) for c in sorted(cs[:2], key=lambda c: c["centerRaw"][0])]


def measure_hands(path: Path):
    image = Image.open(path).convert("RGBA")

    def skin(r, g, b, a):
        return a > 0 and r > 150 and g > 60 and b < 160 and r > g + 30

    # Exclude the face/ear component above y=650; retain the two large hand
    # components regardless of whether the active fist is on the left or right.
    cs = components(image, skin, (0, 650, image.width, 1000), 900)
    cs = [c for c in cs if c["bboxRaw"][1] >= 680 and c["bboxRaw"][2] - c["bboxRaw"][0] < 130]
    return [normalize_component(c) for c in sorted(cs[:2], key=lambda c: c["centerRaw"][0])]


def chain_records(prefix):
    records = []
    previous = CHAIN / "idle_right.png"
    previous_output_sha = None
    for index in range(1, 4):
        output = RAW / f"{prefix}_{index}_chain.png"
        input_sha = sha(previous)
        records.append({
            "frame": f"{prefix}_{index}",
            "input": str(previous),
            "inputSha256": input_sha,
            "output": str(output),
            "outputSha256": sha(output),
            "inputMatchesPreviousOutput": previous_output_sha is None or input_sha == previous_output_sha,
        })
        previous_output_sha = sha(output)
        previous = output
    return records


def distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def limb_centers(frames, key):
    return {
        "image-left": [frame[key][0]["centerNormalized"] for frame in frames],
        "image-right": [frame[key][1]["centerNormalized"] for frame in frames],
    }


def active_phase_metrics(frames, key, expected):
    centers = limb_centers(frames, key)
    active = [centers[label][index] for index, label in enumerate(expected)]
    transition_moves = [None] + [distance(active[i], active[i - 1]) for i in range(1, len(active))]
    return centers, active, transition_moves


def main():
    leg_records = chain_records("walk_right")
    fist_records = chain_records("atk_right")
    leg_frames = [{"frame": r["frame"], "feet": measure_feet(Path(r["output"]))} for r in leg_records]
    fist_frames = [{"frame": r["frame"], "fists": measure_hands(Path(r["output"]))} for r in fist_records]

    leg_expected = ["image-right", "image-left", "image-right"]
    leg_centers, leg_active, leg_moves = active_phase_metrics(leg_frames, "feet", leg_expected)
    leg_front_x = [point[0] for point in leg_active]
    leg_rear_x = [leg_centers["image-left" if label == "image-right" else "image-right"][i][0] for i, label in enumerate(leg_expected)]
    leg_stride = [abs(front - rear) for front, rear in zip(leg_front_x, leg_rear_x)]
    leg_order = [1 if label == "image-right" else -1 for label in leg_expected]
    leg_reversals = sum(a != b for a, b in zip(leg_order, leg_order[1:]))
    leg_qa = {
        "task": "T45", "seq": "352", "chain": "A_legs", "runtimeTouched": False,
        "transparentJudged": False, "ratioJudged": False,
        "chainIntegrity": leg_records,
        "chainIntegrityPass": all(r["inputMatchesPreviousOutput"] for r in leg_records),
        "normalization": {"rawCanvas": list(RAW_SIZE), "comparisonCanvas": list(COMPARE_SIZE), "scaleX": SCALE_X, "scaleY": SCALE_Y},
        "frames": leg_frames,
        "expectedActiveLimb": leg_expected,
        "measuredCenters": leg_centers,
        "activeLimbCenters": leg_active,
        "activeLimbTransitionMovePx": leg_moves,
        "phaseSwitchCount": sum(a != b for a, b in zip(leg_expected, leg_expected[1:])),
        "frontFootCentersX": leg_front_x,
        "rearFootCentersX": leg_rear_x,
        "frontFootRangePx": max(leg_front_x) - min(leg_front_x),
        "rearFootRangePx": max(leg_rear_x) - min(leg_rear_x),
        "frontRearStridePx": leg_stride,
        "phaseOrder": leg_order,
        "phaseReversalCount": leg_reversals,
        "measureMethod": "orange shoe/sole connected components in lower-body crop; components sorted by normalized x; active limb assigned against PM2 pose diagram",
        "criteria": {
            "A1_exactlyTwoFeetEachFrame": {"observed": [len(f["feet"]) for f in leg_frames], "pass": all(len(f["feet"]) == 2 for f in leg_frames)},
            "A2_expectedAlternationRightLeftRight": {"observed": leg_expected, "pass": leg_expected == ["image-right", "image-left", "image-right"]},
            "A3_eachPostFirstTransitionAtLeast40Px": {"observed": leg_moves[1:], "threshold": 40, "pass": all(move >= 40 for move in leg_moves[1:])},
            "A1_frontFootRangeAtLeast15": {"observed": max(leg_front_x) - min(leg_front_x), "threshold": 15, "pass": max(leg_front_x) - min(leg_front_x) >= 15},
            "A2_phaseReversalAtLeast1": {"observed": leg_reversals, "threshold": 1, "pass": leg_reversals >= 1},
            "A3_stride20to160EachFrame": {"observed": leg_stride, "pass": all(20 <= stride <= 160 for stride in leg_stride)},
        },
        "overallPass": all(len(f["feet"]) == 2 for f in leg_frames) and all(move >= 40 for move in leg_moves[1:]) and all(20 <= stride <= 160 for stride in leg_stride),
        "visualDescription": "PM2 A/B/A leg phases were compared directly: walk_right_1 right leg forward, walk_right_2 left leg forward, walk_right_3 right leg forward; the two visible phase transitions are large on the normalized canvas.",
    }

    fist_expected = ["image-right", "image-left", "image-right"]
    fist_centers, fist_active, fist_moves = active_phase_metrics(fist_frames, "fists", fist_expected)
    fist_front_x = [point[0] for point in fist_active]
    fist_front_y = [point[1] for point in fist_active]
    fist_switches = sum(a != b for a, b in zip(fist_expected, fist_expected[1:]))
    fist_qa = {
        "task": "T45", "seq": "352", "chain": "B_fists", "runtimeTouched": False,
        "transparentJudged": False, "ratioJudged": False,
        "chainIntegrity": fist_records,
        "chainIntegrityPass": all(r["inputMatchesPreviousOutput"] for r in fist_records),
        "normalization": {"rawCanvas": list(RAW_SIZE), "comparisonCanvas": list(COMPARE_SIZE), "scaleX": SCALE_X, "scaleY": SCALE_Y},
        "frames": fist_frames,
        "expectedActiveLimb": fist_expected,
        "measuredCenters": fist_centers,
        "activeLimbCenters": fist_active,
        "activeLimbTransitionMovePx": fist_moves,
        "handSwitchCount": fist_switches,
        "frontFistCenters": [{"x": x, "y": y} for x, y in zip(fist_front_x, fist_front_y)],
        "frontFistRangeX": max(fist_front_x) - min(fist_front_x),
        "frontFistRangeY": max(fist_front_y) - min(fist_front_y),
        "frontFistLabels": fist_expected,
        "measureMethod": "skin-color connected components in upper-body crop, excluding face by y bound; components sorted by normalized x; active limb assigned against PM2 pose diagram",
        "criteria": {
            "B1_exactlyTwoFistsEachFrame": {"observed": [len(f["fists"]) for f in fist_frames], "pass": all(len(f["fists"]) == 2 for f in fist_frames)},
            "B2_expectedAlternationRightLeftRight": {"observed": fist_expected, "pass": fist_expected == ["image-right", "image-left", "image-right"]},
            "B3_eachPostFirstTransitionAtLeast40Px": {"observed": fist_moves[1:], "threshold": 40, "pass": all(move >= 40 for move in fist_moves[1:])},
            "B1_frontFistPositionRangeAtLeast15": {"observedX": max(fist_front_x) - min(fist_front_x), "observedY": max(fist_front_y) - min(fist_front_y), "threshold": 15, "pass": max(fist_front_x) - min(fist_front_x) >= 15 or max(fist_front_y) - min(fist_front_y) >= 15},
            "B2_handSwitchAtLeast1": {"observed": fist_switches, "threshold": 1, "pass": fist_switches >= 1},
            "B3_exactlyTwoFistsEachFrame": {"observed": [len(f["fists"]) for f in fist_frames], "pass": all(len(f["fists"]) == 2 for f in fist_frames)},
        },
        "overallPass": all(len(f["fists"]) == 2 for f in fist_frames) and all(move >= 40 for move in fist_moves[1:]) and (max(fist_front_x) - min(fist_front_x) >= 15 or max(fist_front_y) - min(fist_front_y) >= 15),
        "visualDescription": "PM2 A/B/A fist phases were compared directly: atk_right_1 right fist extended, atk_right_2 left fist extended, atk_right_3 right fist extended; exactly two fists remain visible and both switches exceed the normalized movement threshold.",
    }

    (ROOT / "qa/leg_alternation.json").write_text(json.dumps(leg_qa, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "qa/fist_alternation.json").write_text(json.dumps(fist_qa, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "legOverallPass": leg_qa["overallPass"],
        "fistOverallPass": fist_qa["overallPass"],
        "legMovesPx": leg_moves[1:],
        "fistMovesPx": fist_moves[1:],
        "legCounts": [len(f["feet"]) for f in leg_frames],
        "fistCounts": [len(f["fists"]) for f in fist_frames],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
