from __future__ import annotations

from pathlib import Path
import hashlib
import json

from PIL import Image, ImageChops

ROOT = Path(__file__).parent.parent
IDLE = ROOT / "idle_right.png"
PATH_A = ROOT / "pathA"
PATH_B = ROOT / "pathB"
COMPARE_SIZE = (240, 320)


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
                    "bbox": [min(xs), min(ys), max(xs) + 1, max(ys) + 1],
                    "center": [sum(xs) / len(xs), sum(ys) / len(ys)],
                })
    return sorted(out, key=lambda component: component["pixels"], reverse=True)


def measure_hands(path: Path):
    image = Image.open(path).convert("RGBA")
    width, height = image.size

    def skin(r, g, b, a):
        return a > 0 and r > 150 and g > 60 and b < 160 and r > g + 30

    min_pixels = max(300, int(width * height * 0.00045))
    candidates = components(image, skin, (0, int(height * 0.30), width, int(height * 0.78)), min_pixels)
    candidates = [
        component for component in candidates
        if component["bbox"][1] >= int(height * 0.35)
        and component["bbox"][2] - component["bbox"][0] < int(width * 0.13)
        and component["bbox"][3] - component["bbox"][1] < int(height * 0.13)
    ]
    selected = sorted(candidates[:2], key=lambda component: component["center"][0])
    result = []
    for component in selected:
        result.append({
            "pixels": component["pixels"],
            "bboxRaw": component["bbox"],
            "centerRaw": component["center"],
            "centerNormalized": [component["center"][0] * 240 / width, component["center"][1] * 320 / height],
        })
    return result


def normalize(path: Path):
    return Image.open(path).convert("RGB").resize(COMPARE_SIZE, Image.Resampling.LANCZOS)


def non_arm_diff_percent(left: Path, right: Path):
    a = normalize(left)
    b = normalize(right)
    diff = ImageChops.difference(a, b)
    # Keep head, central torso and lower body; exclude the broad arm bands and
    # the front fists so D3 measures body continuity rather than the intended change.
    changed = 0
    total = 0
    for y in range(320):
        for x in range(240):
            in_arm_band = 105 <= y <= 215 and (x < 70 or x > 170)
            if in_arm_band:
                continue
            total += 1
            if max(diff.getpixel((x, y))) > 8:
                changed += 1
    return changed / total * 100


def evaluate_pair(alpha_path: Path, beta_path: Path, d5_manual=True):
    frames = [
        {"name": "alpha", "path": str(alpha_path), "hands": measure_hands(alpha_path)},
        {"name": "beta", "path": str(beta_path), "hands": measure_hands(beta_path)},
    ]
    normalized = {
        frame["name"]: [
            {"x": hand["centerNormalized"][0], "y": hand["centerNormalized"][1]}
            for hand in frame["hands"]
        ]
        for frame in frames
    }
    front_zone = {
        name: bool(hands) and sum(point["x"] >= 190 and 150 <= point["y"] <= 180 for point in hands) == 1
        for name, hands in normalized.items()
    }
    waist_zone = {
        name: bool(hands) and sum(85 <= point["x"] <= 215 for point in hands) == 1
        for name, hands in normalized.items()
    }
    waist_x = {name: hands[0]["x"] if hands else None for name, hands in normalized.items()}
    d1 = all(front_zone.values()) and all(waist_zone.values())
    d2 = (
        waist_x["alpha"] is not None and waist_x["beta"] is not None
        and abs(waist_x["alpha"] - 101) <= 18
        and abs(waist_x["beta"] - 183) <= 18
        and abs(waist_x["alpha"] - waist_x["beta"]) >= 46
    )
    d3_diff = non_arm_diff_percent(alpha_path, beta_path)
    d3 = d3_diff <= 8
    counts = {name: len(hands) for name, hands in normalized.items()}
    d4 = all(count == 2 for count in counts.values())
    return {
        "frames": frames,
        "normalizedHands": normalized,
        "frontZonePass": front_zone,
        "waistZonePass": waist_zone,
        "waistFistCentersX": waist_x,
        "D1_poseCorrect": d1,
        "D2_waistFistSwap": d2,
        "D3_nonArmDiffPercent": {"observed": d3_diff, "threshold": 8, "pass": d3},
        "D4_fistCounts": {"observed": counts, "pass": d4},
        "D5_singleCharacter": {"observed": d5_manual, "pass": d5_manual, "method": "contact-sheet visual review"},
        "overallPass": d1 and d2 and d3 and d4 and d5_manual,
    }


def main():
    path_a = evaluate_pair(PATH_A / "atk_alpha.png", PATH_A / "atk_beta.png")
    path_b = evaluate_pair(PATH_B / "atk_alpha.png", PATH_B / "atk_beta.png")
    qa = {
        "task": "T45",
        "seq": "358",
        "route": "twopanel_A_plus_independent_B",
        "runtimeTouched": False,
        "transparentJudged": False,
        "ratioJudged": False,
        "generationBudget": {"pathA": 1, "pathB": 2, "total": 3, "cost": 0},
        "source": {"idle": str(IDLE), "idleSha256": sha(IDLE)},
        "pathA": {
            "sheet": str(PATH_A / "sheet_2panel.png"),
            "sheetSha256": sha(PATH_A / "sheet_2panel.png"),
            "cutMethod": "equal half-width crops, no interpolation",
            "frames": [
                {"path": str(PATH_A / "atk_alpha.png"), "sha256": sha(PATH_A / "atk_alpha.png")},
                {"path": str(PATH_A / "atk_beta.png"), "sha256": sha(PATH_A / "atk_beta.png")},
            ],
            "evaluation": path_a,
        },
        "pathB": {
            "frames": [
                {"path": str(PATH_B / "atk_alpha.png"), "sha256": sha(PATH_B / "atk_alpha.png")},
                {"path": str(PATH_B / "atk_beta.png"), "sha256": sha(PATH_B / "atk_beta.png")},
            ],
            "independentInputs": True,
            "evaluation": path_b,
        },
        "contactSheet": "contact/fist_v5_compare.png",
        "contactReview": {
            "status": "codex_reviewed_pending_Leo",
            "description": "Contact sheet reviewed: path A contains one character per panel and two visually present fists per panel, but its active fist sits above the required D1 shoulder-height zone; path B has one character and two fists in each frame but both independent frames keep the same waist-fist position.",
        },
        "conclusion": "FAIL: path A fails D1/D2; path B fails D2 and D3. Neither route produces a compliant alpha/beta exchange; stop after the authorized three generations and report to PM2/Leo.",
    }
    (ROOT / "qa/fist_v5.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "pathAOverallPass": path_a["overallPass"],
        "pathBOverallPass": path_b["overallPass"],
        "pathAD2": path_a["D2_waistFistSwap"],
        "pathBD2": path_b["D2_waistFistSwap"],
        "pathAWaistX": path_a["waistFistCentersX"],
        "pathBWaistX": path_b["waistFistCentersX"],
        "pathAD3Diff": path_a["D3_nonArmDiffPercent"]["observed"],
        "pathBD3Diff": path_b["D3_nonArmDiffPercent"]["observed"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
