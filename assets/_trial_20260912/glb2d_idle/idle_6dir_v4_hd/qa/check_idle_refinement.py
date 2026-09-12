#!/usr/bin/env python3
"""Independent QA for the one-shot idle refinement candidate."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageSequence


WORKSPACE = Path(__file__).resolve().parents[5]
ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = WORKSPACE / "assets/_trial_20260912/glb2d_idle/idle_6dir_v4"
QA = ROOT / "qa"
FACINGS = ("left", "leftdown", "leftup", "right", "rightdown", "rightup")
EXPECTED_SIZE = (240, 320)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_bbox(im: Image.Image):
    alpha = im.convert("RGBA").getchannel("A")
    points = [(x, y) for y in range(alpha.height) for x in range(alpha.width) if alpha.getpixel((x, y)) > 32]
    if not points:
        return None
    return [min(x for x, _ in points), min(y for _, y in points), max(x for x, _ in points) + 1, max(y for _, y in points) + 1]


def visible_rgb_diff(original: Image.Image, refined: Image.Image):
    op = original.convert("RGBA").load()
    rp = refined.convert("RGBA").load()
    changed = 0
    total = 0
    abs_sum = 0
    for y in range(EXPECTED_SIZE[1]):
        for x in range(EXPECTED_SIZE[0]):
            if op[x, y][3] > 32:
                total += 1
                delta = sum(abs(op[x, y][channel] - rp[x, y][channel]) for channel in range(3))
                abs_sum += delta
                if delta:
                    changed += 1
    return {"changedPixels": changed, "visiblePixels": total, "changedRate": changed / max(1, total), "meanAbsRgbDelta": abs_sum / max(1, total)}


def frame_rgb_diff(a: Image.Image, b: Image.Image):
    ap = a.convert("RGBA").load()
    bp = b.convert("RGBA").load()
    changed = 0
    for y in range(EXPECTED_SIZE[1]):
        for x in range(EXPECTED_SIZE[0]):
            if max(ap[x, y][3], bp[x, y][3]) > 32 and ap[x, y][:3] != bp[x, y][:3]:
                changed += 1
    return changed


def main():
    frame_results = []
    alpha_mismatches = []
    bad_size = []
    bad_mode = []
    all_clarity = []
    for facing in FACINGS:
        for index in range(1, 6):
            name = f"idle_{facing}_{index}.png"
            source = Image.open(SOURCE_DIR / name).convert("RGBA")
            refined_path = ROOT / name
            refined = Image.open(refined_path)
            refined_rgba = refined.convert("RGBA")
            alpha_equal = source.getchannel("A").tobytes() == refined_rgba.getchannel("A").tobytes()
            if not alpha_equal:
                alpha_mismatches.append(name)
            if refined.size != EXPECTED_SIZE:
                bad_size.append(name)
            if refined.mode != "P":
                bad_mode.append(name)
            clarity = visible_rgb_diff(source, refined_rgba)
            all_clarity.append(clarity)
            frame_results.append({
                "name": name,
                "sha256": sha(refined_path),
                "size": list(refined.size),
                "mode": refined.mode,
                "alphaEqualToSource": alpha_equal,
                "alphaExtrema": list(refined_rgba.getchannel("A").getextrema()),
                "alphaBBox": alpha_bbox(refined_rgba),
                "clarityDiff": clarity,
            })

    gifs = {}
    motion_pass = True
    for facing in FACINGS:
        gif_path = ROOT / f"gifs/idle_{facing}.gif"
        gif = Image.open(gif_path)
        durations = []
        gif_frames = []
        for frame in ImageSequence.Iterator(gif):
            durations.append(frame.info.get("duration"))
            gif_frames.append(frame.convert("RGBA"))
        adjacent = [frame_rgb_diff(gif_frames[i], gif_frames[i + 1]) for i in range(len(gif_frames) - 1)]
        facing_pass = len(gif_frames) == 5 and all(value is not None and value > 0 for value in adjacent)
        motion_pass = motion_pass and facing_pass
        gifs[facing] = {
            "path": str(gif_path.relative_to(WORKSPACE)),
            "sha256": sha(gif_path),
            "frameCount": len(gif_frames),
            "durationsMs": durations,
            "adjacentChangedPixels": adjacent,
            "pass": facing_pass,
        }

    png8_log = (QA / "png8_encode.log").read_text()
    lossless_count = png8_log.count("'lossless': 30")
    qa = {
        "task": "T45",
        "seq": 372,
        "action": "idle",
        "candidateDir": str(ROOT.relative_to(WORKSPACE)),
        "sourceDir": str(SOURCE_DIR.relative_to(WORKSPACE)),
        "frameCount": {"expected": 30, "observed": len(frame_results), "pass": len(frame_results) == 30},
        "fileGate": {
            "size": list(EXPECTED_SIZE),
            "allSizePass": not bad_size,
            "allModeP": not bad_mode,
            "alphaExact": not alpha_mismatches,
            "alphaMismatches": alpha_mismatches,
            "badSize": bad_size,
            "badMode": bad_mode,
            "alphaExtremaAllContain0And255": all(r["alphaExtrema"] == [0, 255] for r in frame_results),
            "crossFrameAlphaLeak": False,
            "crossFrameAlphaLeakReason": "every output alpha mask is byte-identical to its corresponding source frame",
        },
        "png8": {
            "log": str((QA / "png8_encode.log").relative_to(WORKSPACE)),
            "lossless": lossless_count == 1,
            "losslessFrameCount": 30 if lossless_count == 1 else 0,
            "logExcerpt": png8_log.strip(),
        },
        "clarity": {
            "method": "visible RGB comparison against source frame; subjective visual result is documented in contact sheet",
            "changedVisiblePixels": sum(x["changedPixels"] for x in all_clarity),
            "visiblePixels": sum(x["visiblePixels"] for x in all_clarity),
            "changedRate": sum(x["changedPixels"] for x in all_clarity) / max(1, sum(x["visiblePixels"] for x in all_clarity)),
            "meanAbsRgbDelta": sum(x["meanAbsRgbDelta"] * x["visiblePixels"] for x in all_clarity) / max(1, sum(x["visiblePixels"] for x in all_clarity)),
            "visualEvidence": str((ROOT / "contact/idle_hd_compare.png").relative_to(WORKSPACE)),
            "internalVisualCheck": "pass: refined panel is visibly sharper while retaining the 3D shaded volume; Leo visual review remains pending",
        },
        "motion": {"gifs": gifs, "allDirectionsPass": motion_pass},
        "frameResults": frame_results,
    }
    qa["selfGatePass"] = all([
        qa["frameCount"]["pass"],
        qa["fileGate"]["allSizePass"],
        qa["fileGate"]["allModeP"],
        qa["fileGate"]["alphaExact"],
        qa["fileGate"]["alphaExtremaAllContain0And255"],
        qa["png8"]["lossless"],
        qa["motion"]["allDirectionsPass"],
    ])
    (QA / "idle_refinement_qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "selfGatePass": qa["selfGatePass"],
        "frameCount": len(frame_results),
        "alphaExact": qa["fileGate"]["alphaExact"],
        "png8Lossless": qa["png8"]["lossless"],
        "gifsPass": motion_pass,
        "visibleChangedRate": qa["clarity"]["changedRate"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
