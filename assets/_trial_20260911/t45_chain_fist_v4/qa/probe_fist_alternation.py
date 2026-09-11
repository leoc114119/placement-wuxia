from __future__ import annotations

from pathlib import Path
import hashlib
import json

from PIL import Image, ImageChops

ROOT = Path(__file__).parent.parent
CHAIN = ROOT / "chain/idle_right.png"
RAW = ROOT / "raw"
RAW_SIZE = (1086, 1448)
COMPARE_SIZE = (240, 320)
SCALE_X = COMPARE_SIZE[0] / RAW_SIZE[0]
SCALE_Y = COMPARE_SIZE[1] / RAW_SIZE[1]
V2_ATK1 = Path("assets/_trial_20260910/t45_chain_limb_alternation_v2/raw/atk_right_1_chain.png")


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
                xs = [point[0] for point in points]
                ys = [point[1] for point in points]
                out.append({
                    "pixels": len(points),
                    "bboxRaw": [min(xs), min(ys), max(xs) + 1, max(ys) + 1],
                    "centerRaw": [sum(xs) / len(xs), sum(ys) / len(ys)],
                })
    return sorted(out, key=lambda component: component["pixels"], reverse=True)


def measure_hands(path: Path):
    image = Image.open(path).convert("RGBA")

    def skin(r, g, b, a):
        return a > 0 and r > 150 and g > 60 and b < 160 and r > g + 30

    candidates = components(image, skin, (0, 650, image.width, 1000), 900)
    candidates = [
        component for component in candidates
        if component["bboxRaw"][1] >= 680 and component["bboxRaw"][2] - component["bboxRaw"][0] < 130
    ]
    candidates = sorted(candidates[:2], key=lambda component: component["centerRaw"][0])
    for component in candidates:
        component["centerNormalized"] = [
            component["centerRaw"][0] * SCALE_X,
            component["centerRaw"][1] * SCALE_Y,
        ]
    return candidates


def torso_diff_percent(left: Path, right: Path):
    a = Image.open(left).convert("RGB").crop((0, 579, 1086, 1014))
    b = Image.open(right).convert("RGB").crop((0, 579, 1086, 1014))
    diff = ImageChops.difference(a, b)
    changed = 0
    for pixel in diff.getdata():
        if max(pixel) > 8:
            changed += 1
    return changed / (diff.width * diff.height) * 100


def main():
    raw_frames = [RAW / f"atk_right_{i}.png" for i in range(1, 4)]
    records = [
        {
            "frame": "atk_right_1",
            "input": str(CHAIN),
            "inputSha256": sha(CHAIN),
            "output": str(raw_frames[0]),
            "outputSha256": sha(raw_frames[0]),
            "inputMatchesPreviousOutput": True,
        },
        {
            "frame": "atk_right_2",
            "input": str(raw_frames[0]),
            "inputSha256": sha(raw_frames[0]),
            "output": str(raw_frames[1]),
            "outputSha256": sha(raw_frames[1]),
            "inputMatchesPreviousOutput": None,
        },
        {
            "frame": "atk_right_3",
            "input": str(raw_frames[1]),
            "inputSha256": sha(raw_frames[1]),
            "output": str(raw_frames[2]),
            "outputSha256": sha(raw_frames[2]),
            "inputMatchesPreviousOutput": None,
        },
    ]
    records[1]["inputMatchesPreviousOutput"] = records[1]["inputSha256"] == records[0]["outputSha256"]
    records[2]["inputMatchesPreviousOutput"] = records[2]["inputSha256"] == records[1]["outputSha256"]
    frames = [{"frame": r["frame"], "hands": measure_hands(Path(r["output"]))} for r in records]
    normalized = [
        [{"x": hand["centerNormalized"][0], "y": hand["centerNormalized"][1]} for hand in frame["hands"]]
        for frame in frames
    ]
    front = [hands[-1] if hands else None for hands in normalized]
    waist = [hands[0] if hands else None for hands in normalized]
    front_zone = [point and point["x"] >= 190 and 150 <= point["y"] <= 180 for point in front]
    waist_zone = [point and 85 <= point["x"] <= 135 and 185 <= point["y"] <= 215 for point in waist]
    torso_diffs = [torso_diff_percent(raw_frames[i - 1], raw_frames[i]) for i in range(1, 3)]
    # C3 is intentionally a manual visual criterion: the exposed fist blocks
    # do not prove shoulder identity. Contact-sheet review observed alpha-alpha-alpha.
    observed_phase = ["alpha", "alpha", "alpha"]
    c1 = all(front_zone) and all(waist_zone)
    c2 = all(diff >= 6 for diff in torso_diffs)
    c3 = observed_phase in (["alpha", "beta", "alpha"], ["beta", "alpha", "beta"])
    c4 = all(len(frame["hands"]) == 2 for frame in frames)
    c5 = all(record["inputMatchesPreviousOutput"] for record in records)
    qa = {
        "task": "T45",
        "seq": "356",
        "chain": "B_fist_alternation_v4",
        "runtimeTouched": False,
        "transparentJudged": False,
        "ratioJudged": False,
        "chainIntegrity": records,
        "chainIntegrityPass": c5,
        "normalization": {"rawCanvas": list(RAW_SIZE), "comparisonCanvas": list(COMPARE_SIZE), "scaleX": SCALE_X, "scaleY": SCALE_Y},
        "frames": frames,
        "normalizedHands": normalized,
        "frontZone": {"xMin": 190, "yMin": 150, "yMax": 180, "observed": front_zone},
        "waistZone": {"xMin": 85, "xMax": 135, "yMin": 185, "yMax": 215, "observed": waist_zone},
        "torsoBandDiffPercent": torso_diffs,
        "observedPhaseByPositionReview": observed_phase,
        "criteria": {
            "C1_oneFrontFistAndOneWaistFistEachFrame": {"observedFrontZone": front_zone, "observedWaistZone": waist_zone, "pass": c1},
            "C2_adjacentTorsoDiffAtLeast6Percent": {"observed": torso_diffs, "threshold": 6, "pass": c2},
            "C3_manualHandAlternation": {"observed": observed_phase, "required": "alpha→beta→alpha or beta→alpha→beta", "pass": c3},
            "C4_exactlyTwoFistsEachFrame": {"observed": [len(frame["hands"]) for frame in frames], "pass": c4},
            "C5_sequentialChainSha": {"pass": c5},
        },
        "overallPass": c1 and c2 and c3 and c4 and c5,
        "visualReview": {
            "contactSheet": "contact/fist_v4_4up.png",
            "description": "All three generated action frames show the same alpha-position fist remaining in the front zone toward image-right; beta remains at the waist. Direction is constant, but the required alpha→beta→alpha hand alternation is not visible.",
            "status": "codex_reviewed_pending_Leo",
        },
        "conclusion": "FAIL: v4 did not produce hand alternation; per handoff red line, stop without extra generation and report to PM2/Leo.",
    }
    (ROOT / "qa/fist_alternation.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "overallPass": qa["overallPass"],
        "frontZone": front_zone,
        "waistZone": waist_zone,
        "torsoDiffPercent": torso_diffs,
        "observedPhase": observed_phase,
        "counts": [len(frame["hands"]) for frame in frames],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
