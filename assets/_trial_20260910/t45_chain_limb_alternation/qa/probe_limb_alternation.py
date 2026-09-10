from __future__ import annotations

from pathlib import Path
import hashlib
import json

from PIL import Image

ROOT = Path(__file__).parent.parent
RAW = ROOT / "raw"
CHAIN = ROOT / "chain"
REPO = Path.cwd()
SCALE_X = 240 / 1086
SCALE_Y = 320 / 1448


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def components(image: Image.Image, predicate, box, min_pixels=20):
    x0, y0, x1, y1 = box
    px = image.load(); seen = set(); out = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x, y) in seen or not predicate(*px[x, y]):
                continue
            stack = [(x, y)]; seen.add((x, y)); points = []
            while stack:
                xx, yy = stack.pop(); points.append((xx, yy))
                for nx, ny in ((xx - 1, yy), (xx + 1, yy), (xx, yy - 1), (xx, yy + 1)):
                    if x0 <= nx < x1 and y0 <= ny < y1 and (nx, ny) not in seen and predicate(*px[nx, ny]):
                        seen.add((nx, ny)); stack.append((nx, ny))
            if len(points) >= min_pixels:
                xs = [p[0] for p in points]; ys = [p[1] for p in points]
                out.append({
                    "pixels": len(points),
                    "bboxRaw": [min(xs), min(ys), max(xs) + 1, max(ys) + 1],
                    "centerRaw": [sum(xs) / len(xs), sum(ys) / len(ys)],
                })
    return sorted(out, key=lambda c: c["pixels"], reverse=True)


def measure_feet(path: Path):
    image = Image.open(path).convert("RGBA")
    def sole(r, g, b, a):
        return a > 0 and r > 120 and 50 < g < 190 and b < 100 and r > g + 30
    candidates = [c for c in components(image, sole, (0, 1050, image.width, image.height), 200)
                  if c["bboxRaw"][2] - c["bboxRaw"][0] > 40]
    candidates = sorted(candidates[:2], key=lambda c: c["centerRaw"][0])
    for c in candidates:
        c["centerNormalized"] = [c["centerRaw"][0] * SCALE_X, c["centerRaw"][1] * SCALE_Y]
    return candidates


def measure_fists(path: Path):
    image = Image.open(path).convert("RGBA")
    def skin(r, g, b, a):
        return a > 0 and r > 150 and g > 60 and b < 130 and r > g + 40
    cs = components(image, skin, (0, 600, image.width, 1050), 500)
    # The generated native frame contains face/ear skin as well. Locate the two
    # hand regions by their stable spatial roles: image-right active fist and
    # image-left waist fist.
    right = [c for c in cs if c["bboxRaw"][0] > 850 and c["bboxRaw"][1] > 650]
    left = [c for c in cs if 350 < c["bboxRaw"][0] < 550 and c["bboxRaw"][1] > 800]
    selected = []
    if right: selected.append(max(right, key=lambda c: c["pixels"]))
    if left: selected.append(max(left, key=lambda c: c["pixels"]))
    selected = sorted(selected, key=lambda c: c["centerRaw"][0])
    for c in selected:
        c["centerNormalized"] = [c["centerRaw"][0] * SCALE_X, c["centerRaw"][1] * SCALE_Y]
    return selected


def chain_records(prefix, names):
    records = []
    previous = CHAIN / "idle_right.png"
    previous_output_sha = None
    for name in names:
        output = RAW / f"{prefix}_{name}_chain.png"
        input_sha = sha(previous)
        records.append({
            "frame": f"{prefix}_{name}",
            "input": str(previous),
            "inputSha256": input_sha,
            "output": str(output),
            "outputSha256": sha(output),
            "inputMatchesPreviousOutput": previous_output_sha is None or input_sha == previous_output_sha,
        })
        previous_output_sha = sha(output)
        previous = output
    return records


def main():
    leg_records = chain_records("walk_right", ["1", "2", "3"])
    fist_records = chain_records("atk_right", ["1", "2", "3"])
    leg_frames = []
    for rec in leg_records:
        feet = measure_feet(Path(rec["output"]))
        leg_frames.append({"frame": rec["frame"], "feet": feet, "frontFoot": "image-right", "rearFoot": "image-left"})
    fist_frames = []
    for rec in fist_records:
        fists = measure_fists(Path(rec["output"]))
        fist_frames.append({"frame": rec["frame"], "fists": fists, "frontFist": "image-right", "rearFist": "image-left"})

    front_x = [f["feet"][-1]["centerNormalized"][0] for f in leg_frames]
    rear_x = [f["feet"][0]["centerNormalized"][0] for f in leg_frames]
    stride = [front - rear for front, rear in zip(front_x, rear_x)]
    order = [1 if front > rear else -1 if front < rear else 0 for front, rear in zip(front_x, rear_x)]
    reversals = sum(a != b for a, b in zip(order, order[1:]) if a and b)
    leg_qa = {
        "task": "T45", "seq": "349", "chain": "A_legs", "runtimeTouched": False,
        "transparentJudged": False, "ratioJudged": False,
        "chainIntegrity": leg_records,
        "chainIntegrityPass": all(r["inputMatchesPreviousOutput"] for r in leg_records),
        "normalization": {"rawCanvas": [1086, 1448], "comparisonCanvas": [240, 320], "scaleX": SCALE_X, "scaleY": SCALE_Y},
        "frames": leg_frames,
        "measureMethod": "orange shoe/sole mask in lower-body crop; front=larger normalized x; raw generated backgrounds ignored",
        "frontFootCentersX": front_x, "rearFootCentersX": rear_x, "frontFootRangePx": max(front_x) - min(front_x),
        "rearFootRangePx": max(rear_x) - min(rear_x), "frontRearStridePx": stride, "phaseOrder": order, "phaseReversalCount": reversals,
        "baseline": {"source": "assets/_trial_20260910/t45_v2_right_batch_seq328/contact/pm2_walk_legs_3up_parallel_baseline.png", "frontFootRangePx": 8, "rearFootRangePx": 27, "phaseReversalCount": 0},
        "criteria": {
            "A1_frontFootRangeAtLeast15": {"observed": max(front_x) - min(front_x), "threshold": 15, "pass": max(front_x) - min(front_x) >= 15},
            "A2_phaseReversalAtLeast1": {"observed": reversals, "threshold": 1, "pass": reversals >= 1},
            "A3_stride20to160EachFrame": {"observed": stride, "pass": all(20 <= s <= 160 for s in stride)},
        },
        "overallPass": max(front_x) - min(front_x) >= 15 and reversals >= 1 and all(20 <= s <= 160 for s in stride),
        "visualDescription": "walk_right_1/2/3 all keep the image-right foot as the forward foot and the image-left foot as the rear foot; no front/rear phase reversal is visible.",
    }

    front_fist_x = [f["fists"][-1]["centerNormalized"][0] for f in fist_frames]
    front_fist_y = [f["fists"][-1]["centerNormalized"][1] for f in fist_frames]
    hand_labels = [f["frontFist"] for f in fist_frames]
    fist_counts = [len(f["fists"]) for f in fist_frames]
    fist_qa = {
        "task": "T45", "seq": "349", "chain": "B_fists", "runtimeTouched": False,
        "transparentJudged": False, "ratioJudged": False,
        "chainIntegrity": fist_records,
        "chainIntegrityPass": all(r["inputMatchesPreviousOutput"] for r in fist_records),
        "normalization": {"rawCanvas": [1086, 1448], "comparisonCanvas": [240, 320], "scaleX": SCALE_X, "scaleY": SCALE_Y},
        "frames": fist_frames,
        "measureMethod": "skin-color components in upper-body crop; front=outermost larger normalized x; final hand identity by visual inspection",
        "frontFistCenters": [{"x": x, "y": y} for x, y in zip(front_fist_x, front_fist_y)],
        "frontFistRangeX": max(front_fist_x) - min(front_fist_x), "frontFistRangeY": max(front_fist_y) - min(front_fist_y),
        "frontFistLabels": hand_labels, "handSwitchCount": sum(a != b for a, b in zip(hand_labels, hand_labels[1:])),
        "fistCounts": fist_counts,
        "baseline": {"source": "assets/_trial_20260910/t45_v2_right_batch_seq328/normalized/atk_right_{1,2,3}.png", "frontFistY": [196, 194, 188], "frontFistRangePx": 8, "handSwitchCount": 0, "fistCounts": [2, 2, 2]},
        "criteria": {
            "B1_frontFistPositionRangeAtLeast15": {"observedX": max(front_fist_x) - min(front_fist_x), "observedY": max(front_fist_y) - min(front_fist_y), "threshold": 15, "pass": max(front_fist_x) - min(front_fist_x) >= 15 or max(front_fist_y) - min(front_fist_y) >= 15},
            "B2_handSwitchAtLeast1": {"observed": sum(a != b for a, b in zip(hand_labels, hand_labels[1:])), "threshold": 1, "pass": sum(a != b for a, b in zip(hand_labels, hand_labels[1:])) >= 1},
            "B3_exactlyTwoFistsEachFrame": {"observed": fist_counts, "pass": all(c == 2 for c in fist_counts)},
        },
        "overallPass": (max(front_fist_x) - min(front_fist_x) >= 15 or max(front_fist_y) - min(front_fist_y) >= 15) and sum(a != b for a, b in zip(hand_labels, hand_labels[1:])) >= 1 and all(c == 2 for c in fist_counts),
        "visualDescription": "atk_right_1/2/3 all keep the image-right fist extended and the image-left fist retracted at the waist; no hand switch occurs, although each frame visibly contains two fists.",
    }
    (ROOT / "qa/leg_alternation.json").write_text(json.dumps(leg_qa, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "qa/fist_alternation.json").write_text(json.dumps(fist_qa, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"legOverallPass": leg_qa["overallPass"], "fistOverallPass": fist_qa["overallPass"], "legFrontRange": leg_qa["frontFootRangePx"], "fistFrontRangeX": fist_qa["frontFistRangeX"], "fistSwitches": fist_qa["handSwitchCount"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
