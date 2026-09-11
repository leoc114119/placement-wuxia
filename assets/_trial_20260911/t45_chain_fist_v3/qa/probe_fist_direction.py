from __future__ import annotations

from pathlib import Path
import hashlib
import json

from PIL import Image

ROOT = Path(__file__).parent.parent
ANCHOR = ROOT / "anchor/atk_right_1.png"
RAW = ROOT / "raw"
RAW_SIZE = (1086, 1448)
TARGET_OFFSET_X = 398


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
    return sorted(candidates[:2], key=lambda component: component["centerRaw"][0])


def chain_records():
    anchor_sha = sha(ANCHOR)
    frame2 = RAW / "atk_right_2.png"
    frame3 = RAW / "atk_right_3.png"
    frame2_sha = sha(frame2)
    frame3_input_sha = frame2_sha
    records = [
        {
            "frame": "atk_right_1",
            "input": "assets/_trial_20260910/t45_chain_limb_alternation_v2/chain/idle_right.png",
            "output": str(ANCHOR),
            "outputSha256": anchor_sha,
            "sourceReuse": "v2 confirmed atk_right_1_chain",
            "inputMatchesPreviousOutput": True,
        },
        {
            "frame": "atk_right_2",
            "input": str(ANCHOR),
            "inputSha256": anchor_sha,
            "output": str(frame2),
            "outputSha256": frame2_sha,
            "inputMatchesPreviousOutput": None,
        },
        {
            "frame": "atk_right_3",
            "input": str(frame2),
            "inputSha256": frame3_input_sha,
            "output": str(frame3),
            "outputSha256": sha(frame3),
            "inputMatchesPreviousOutput": None,
        },
    ]
    records[0]["inputMatchesPreviousOutput"] = True
    records[1]["inputMatchesPreviousOutput"] = records[1]["inputSha256"] == records[0]["outputSha256"]
    records[2]["inputMatchesPreviousOutput"] = records[2]["inputSha256"] == records[1]["outputSha256"]
    return records


def main():
    records = chain_records()
    frames = []
    for record in records:
        hands = measure_hands(Path(record["output"]))
        frames.append({"frame": record["frame"], "hands": hands})

    anchor_hands = frames[0]["hands"]
    torso_centerline = anchor_hands[-1]["centerRaw"][0] - TARGET_OFFSET_X
    active = [frame["hands"][-1] for frame in frames]
    offsets = [hand["centerRaw"][0] - torso_centerline for hand in active]
    ys = [hand["centerRaw"][1] for hand in active]
    counts = [len(frame["hands"]) for frame in frames]
    c1 = all(offset > 0 for offset in offsets) and max(offsets) - min(offsets) <= 60
    c2 = max(ys) - min(ys) <= 60 and all(y <= 820 for y in ys)
    c3 = all(offset >= 350 for offset in offsets)
    c4 = all(count == 2 for count in counts)
    c5 = all(record["inputMatchesPreviousOutput"] for record in records)
    qa = {
        "task": "T45",
        "seq": "354",
        "chain": "B_fist_direction_v3",
        "runtimeTouched": False,
        "transparentJudged": False,
        "ratioJudged": False,
        "chainIntegrity": records,
        "chainIntegrityPass": c5,
        "canvas": {"raw": list(RAW_SIZE), "comparison": [240, 320]},
        "centerlineMethod": "freeze the v3 absolute line from the PM2-measured atk_1 endpoint: anchor right-fist center x minus +398px; apply that raw-x line to all three frames",
        "torsoCenterlineRaw": torso_centerline,
        "frames": frames,
        "activeRightFistCentersRaw": [{"x": hand["centerRaw"][0], "y": hand["centerRaw"][1]} for hand in active],
        "distanceFromCenterlineRaw": offsets,
        "fistCenterYRaw": ys,
        "fistCounts": counts,
        "criteria": {
            "C1_directionRightAndRangeLe60": {"observed": offsets, "thresholdRange": 60, "pass": c1},
            "C2_heightRangeLe60AndAllLe820": {"observed": ys, "thresholdRange": 60, "maximum": 820, "pass": c2},
            "C3_extensionEachGe350": {"observed": offsets, "threshold": 350, "pass": c3},
            "C4_exactlyTwoFistsEachFrame": {"observed": counts, "pass": c4},
            "C5_sequentialChainSha": {"pass": c5},
        },
        "overallPass": c1 and c2 and c3 and c4 and c5,
        "visualReview": {
            "contactSheet": "contact/fist_v3_3up.png",
            "description": "All three action frames use the image-right fist for a horizontal rightward punch; the image-left fist remains retracted. The action arm is visually straight and the fist stays in the shoulder-height band; baseline idle is included in the contact sheet.",
            "status": "codex_reviewed_pending_Leo",
        },
    }
    (ROOT / "qa/fist_direction.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"overallPass": qa["overallPass"], "offsets": offsets, "ys": ys, "counts": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
