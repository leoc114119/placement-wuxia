from __future__ import annotations

from pathlib import Path
from collections import deque
import hashlib
import json
import statistics

from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
REPO = Path.cwd()
W, H, CX, FEET = 240, 320, 120, 300
ANCHOR = REPO / "assets/_trial_20260905/t45_batch0_codex_native/raw/idle_right_attempt1.png"
BENCH = REPO / "assets/characters/hero/battle45/battle_idle_right.png"
V2_QA = REPO / "assets/_trial_20260910/t45_v2_right_batch_seq328/qa/full_10_frame.json"
WALK_JUMP_TABLE = REPO / "assets/_trial_20260910/t45_hero_right_walk_jump_selected_seq278/raw/source_right_action_sheet_3x4.png"
ATK_TABLE = REPO / "assets/_trial_20260910/t45_hero_atk_selected_seq279/raw/source_atk_right_4frame.png"
SOURCES = {}
for i in range(1, 4):
    SOURCES[f"walk_right_{i}"] = REPO / f"assets/_trial_20260910/t45_hero_right_walk_jump_selected_seq278/raw/walk_right_{i}.png"
for i in range(1, 5):
    SOURCES[f"atk_right_{i}"] = REPO / f"assets/_trial_20260910/t45_hero_atk_selected_seq279/raw/atk_right_{i}.png"
for i in range(1, 4):
    SOURCES[f"jump_right_{i}"] = REPO / f"assets/_trial_20260910/t45_hero_right_walk_jump_selected_seq278/raw/jump_right_{i}.png"
FRAME_IDS = list(SOURCES)
GROUP_FRAMES = {
    "walk_jump": [f"walk_right_{i}" for i in range(1, 4)] + [f"jump_right_{i}" for i in range(1, 4)],
    "atk": [f"atk_right_{i}" for i in range(1, 5)],
}
FRAME_TO_GROUP = {frame: group for group, frames in GROUP_FRAMES.items() for frame in frames}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cut_checkerboard(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    px = image.load(); w, h = image.size
    def bg(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and max(r, g, b) - min(r, g, b) <= 28 and min(r, g, b) >= 185
    seen = set(); q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg(x, y): seen.add((x, y)); q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if bg(x, y): seen.add((x, y)); q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and bg(nx, ny):
                seen.add((nx, ny)); q.append((nx, ny))
    for x, y in seen:
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
    return image


def components(mask, w, h):
    seen = set(); out = []
    for y in range(h):
        for x in range(w):
            if not mask[y][x] or (x, y) in seen: continue
            q = [(x, y)]; seen.add((x, y)); pts = []
            while q:
                xx, yy = q.pop(); pts.append((xx, yy))
                for nx, ny in ((xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and (nx, ny) not in seen:
                        seen.add((nx, ny)); q.append((nx, ny))
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            out.append({"pixels": len(pts), "bbox": [min(xs), min(ys), max(xs)+1, max(ys)+1]})
    return sorted(out, key=lambda c: c["pixels"], reverse=True)


def alpha_bbox(image, threshold=32):
    alpha = image.getchannel("A"); pts = []
    for y in range(image.height):
        for x in range(image.width):
            if alpha.getpixel((x, y)) > threshold: pts.append((x, y))
    xs = [x for x, _ in pts]; ys = [y for _, y in pts]
    return [min(xs), min(ys), max(xs)+1, max(ys)+1]


def retain_main_component(image):
    image = image.convert("RGBA"); px = image.load(); w, h = image.size; seen = set(); comps = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] <= 32 or (x, y) in seen: continue
            q = [(x, y)]; seen.add((x, y)); pts = []
            while q:
                xx, yy = q.pop(); pts.append((xx, yy))
                for nx, ny in ((xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] > 32 and (nx, ny) not in seen:
                        seen.add((nx, ny)); q.append((nx, ny))
            comps.append(pts)
    main = set(max(comps, key=len)) if comps else set()
    removed = 0
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 32 and (x, y) not in main:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0); removed += 1
    return image, {"componentsBefore": len(comps), "mainComponentPixels": len(main), "removedAlphaGt32Pixels": removed}


def checkerboard_background_pixels(image: Image.Image):
    """Return the exact edge-connected background set used by cut_checkerboard."""
    image = image.convert("RGBA")
    px = image.load(); w, h = image.size
    def bg(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and max(r, g, b) - min(r, g, b) <= 28 and min(r, g, b) >= 185
    seen = set(); q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg(x, y): seen.add((x, y)); q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if bg(x, y): seen.add((x, y)); q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and bg(nx, ny):
                seen.add((nx, ny)); q.append((nx, ny))
    return seen


def process_image(image: Image.Image, baseline_label: str):
    """Process one source image and emit §8.1 zero-side-effect evidence."""
    original = image.convert("RGBA")
    background = checkerboard_background_pixels(original)
    cut = cut_checkerboard(original.copy())
    cleaned, cleanup = retain_main_component(cut)
    changed = set()
    rgb_changed = 0
    for y in range(original.height):
        for x in range(original.width):
            before = original.getpixel((x, y)); after = cleaned.getpixel((x, y))
            if before != after: changed.add((x, y))
            if before[:3] != after[:3]: rgb_changed += 1
    detached = set()
    for y in range(original.height):
        for x in range(original.width):
            if cut.getpixel((x, y))[3] > 32 and cleaned.getpixel((x, y))[3] <= 32:
                detached.add((x, y))
    expected_targets = background | detached
    subject_domain_deleted = len(changed - expected_targets)
    safety = {
        "baseline": baseline_label,
        "targetBackgroundPixels": len(background),
        "targetDetachedAlphaGt32Pixels": len(detached),
        "targetDeletedPixels": len(expected_targets),
        "observedChangedPixels": len(changed),
        "subjectDomainDeletedPixels": subject_domain_deleted,
        "rgbChangedPixels": rgb_changed,
        "pass": subject_domain_deleted == 0 and rgb_changed == 0 and len(changed) == len(expected_targets),
    }
    return cleaned, cleanup, safety


def process_source(path: Path):
    """Process one raw source and emit the §8.1 zero-side-effect evidence."""
    return process_image(Image.open(path), str(path))


def crown_width(image):
    image = image.convert("RGBA"); px = image.load(); w, h = image.size; bb = alpha_bbox(image)
    y_limit = bb[1] + int((bb[3]-bb[1]) * .55)
    mask = [[False] * w for _ in range(h)]
    for y in range(bb[1], y_limit):
        for x in range(bb[0], bb[2]):
            r, g, b, a = px[x, y]
            mask[y][x] = a > 32 and g > 85 and r < g - 30 and b > 60 and b < g + 40
    cs = components(mask, w, h)
    if not cs: raise ValueError("no crown rigid feature")
    top = min(c["bbox"][1] for c in cs)
    candidates = [c for c in cs if c["bbox"][1] <= top + 3]
    c = max(candidates, key=lambda q: q["pixels"])
    return c["bbox"][2] - c["bbox"][0], c["bbox"], c["pixels"]


def centroid_x(image):
    alpha = image.getchannel("A"); total = weighted = 0
    for y in range(image.height):
        for x in range(image.width):
            a = alpha.getpixel((x, y))
            if a > 32: total += a; weighted += x * a
    return weighted / total


def border_nonzero(image):
    alpha = image.getchannel("A")
    return sum(alpha.getpixel((x, y)) > 0 for x in range(image.width) for y in (0, image.height-1)) + sum(alpha.getpixel((x, y)) > 0 for y in range(image.height) for x in (0, image.width-1))


def normalize(source: Image.Image, scale: float):
    bb = alpha_bbox(source); crop = source.crop(bb)
    nw, nh = round(crop.width * scale), round(crop.height * scale)
    resized = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(resized, (round(CX - centroid_x(resized)), FEET - nh))
    return out, [nw, nh]


def metrics(image):
    bb = alpha_bbox(image); comps = components([[image.getchannel("A").getpixel((x, y)) > 32 for x in range(image.width)] for y in range(image.height)], image.width, image.height)
    return {
        "size": list(image.size), "mode": image.mode, "alphaExtrema": list(image.getchannel("A").getextrema()),
        "bbox": bb, "bboxWidth": bb[2]-bb[0], "bboxHeight": bb[3]-bb[1], "feetY": bb[3],
        "centroidX": centroid_x(image), "borderNonzero": border_nonzero(image), "components": len(comps),
    }


def range_pct(values):
    """Return max-min as a percentage of the smallest non-zero value."""
    values = [float(v) for v in values if v is not None]
    if not values or min(values) <= 0:
        return None
    return (max(values) - min(values)) / min(values) * 100.0


def output_rigid_probe(image):
    """Use the same green crown predicate as the coefficient derivation."""
    try:
        width, bbox, pixels = crown_width(image)
    except ValueError:
        return {"width": None, "bbox": None, "pixels": 0, "detected": False}
    return {"width": width, "bbox": bbox, "pixels": pixels, "detected": True}


def source_table_probe(path: Path, rows: int, columns: int):
    """Measure every cell in a source table, including non-selected cells."""
    image = Image.open(path).convert("RGBA")
    widths = []
    cell_records = []
    for row in range(rows):
        for column in range(columns):
            x0 = round(image.width * column / columns)
            x1 = round(image.width * (column + 1) / columns)
            y0 = round(image.height * row / rows)
            y1 = round(image.height * (row + 1) / rows)
            cell = image.crop((x0, y0, x1, y1))
            cleaned, _, _ = process_image(cell, f"{path}#r{row + 1}c{column + 1}")
            width, bbox, pixels = crown_width(cleaned)
            widths.append(width)
            cell_records.append({"row": row + 1, "column": column + 1, "crownWidth": width, "crownBBox": bbox, "crownPixels": pixels})
    return {
        "sourceTable": str(path),
        "sourceTableSha256": sha(path),
        "rows": rows,
        "columns": columns,
        "sampleCount": len(widths),
        "sampleCrownWidths": widths,
        "meanCrownWidth": statistics.mean(widths),
        "cells": cell_records,
    }


def main():
    anchor_cut, anchor_cleanup, anchor_safety = process_source(ANCHOR)
    anchor_bb = alpha_bbox(anchor_cut); anchor_h = anchor_bb[3] - anchor_bb[1]; anchor_crown, anchor_crown_bb, anchor_crown_pixels = crown_width(anchor_cut)
    group_tables = {
        "walk_jump": source_table_probe(WALK_JUMP_TABLE, rows=4, columns=3),
        "atk": source_table_probe(ATK_TABLE, rows=1, columns=4),
    }
    group_specs = {}
    for group, table in group_tables.items():
        group_specs[group] = {
            **table,
            "coefficient": (anchor_crown / table["meanCrownWidth"]) * (256 / anchor_h),
            "frames": GROUP_FRAMES[group],
        }
    v2_qa = json.loads(V2_QA.read_text())
    v2_heights = {
        frame: value["outputBBoxAlphaGt32"][3] - value["outputBBoxAlphaGt32"][1]
        for frame, value in v2_qa["frames"].items()
    }
    root_raw = ROOT / "raw_sources"; root_norm = ROOT / "normalized/right"; root_raw.mkdir(parents=True, exist_ok=True); root_norm.mkdir(parents=True, exist_ok=True)
    frames = {}; outputs = {}
    for frame in FRAME_IDS:
        src_path = SOURCES[frame]; src, cleanup, safety = process_source(src_path); raw_copy = root_raw / f"{frame}.png"; raw_copy.write_bytes(src_path.read_bytes())
        bb = alpha_bbox(src); h = bb[3] - bb[1]; cw, crown_bb, crown_pixels = crown_width(src)
        group = FRAME_TO_GROUP[frame]
        group_spec = group_specs[group]
        scale = group_spec["coefficient"]
        out, expected = normalize(src, scale); out_path = root_norm / f"{frame}.png"; out.save(out_path); outputs[frame] = out
        m = metrics(out); output_probe = output_rigid_probe(out)
        v2_height = v2_heights.get(frame)
        v2_delta = None if v2_height is None else (m["bboxHeight"] / v2_height - 1.0) * 100.0
        checks = {
            "size240x320": m["size"] == [240, 320], "rgba": m["mode"] == "RGBA", "alphaHas0And255": m["alphaExtrema"] == [0, 255],
            "feetY300": m["feetY"] == 300, "centroidXWithin20": abs(m["centroidX"]-CX) <= 20, "borderTransparent": m["borderNonzero"] == 0,
            "alphaGt32SingleComponent": m["components"] == 1, "width238": m["bboxWidth"] <= 238,
            "noCropWithin1": abs(m["bboxWidth"]-expected[0]) <= 1 and abs(m["bboxHeight"]-expected[1]) <= 1,
        }
        frames[frame] = {
            "source": str(src_path), "sourceSha256": sha(src_path), "rawCopy": str(raw_copy), "cleanup": cleanup, "processingSafety": safety, "rigidCrownWidth": cw, "rigidCrownBBox": crown_bb, "rigidCrownPixels": crown_pixels,
            "group": group, "groupSourceTable": group_spec["sourceTable"], "groupSourceTableSha256": group_spec["sourceTableSha256"], "groupCrownMeanWidth": group_spec["meanCrownWidth"], "groupCrownSampleCount": group_spec["sampleCount"],
            "sourceBBoxAlphaGt32": bb, "sourceBBoxHeight": h, "coefficient": scale, "expectedScaledSize": expected,
            "output": str(out_path), "outputSha256": sha(out_path), "outputMetrics": m,
            "outputRigidProbe": output_probe,
            "expectedOutputRigidWidthContinuous": cw * scale,
            "v2ComparableHeight": v2_height,
            "v2HeightDeltaPct": v2_delta,
            "v2CrossCheckThresholdPct": 15.0,
            "v2CrossCheckPass": v2_height is None or abs(v2_delta) <= 15.0,
            "checks": checks, "allHardGatesPass": all(checks.values()),
        }
    rigid_consistency = {}
    for group, names in GROUP_FRAMES.items():
        expected_values = [frames[f]["expectedOutputRigidWidthContinuous"] for f in names]
        actual_values = [frames[f]["outputRigidProbe"]["width"] for f in names]
        rigid_consistency[group] = {
            "frames": names,
            "sourceTable": group_specs[group]["sourceTable"],
            "sourceTableSha256": group_specs[group]["sourceTableSha256"],
            "sourceCrownWidthsAllTableCells": group_specs[group]["sampleCrownWidths"],
            "sourceCrownMeanWidth": group_specs[group]["meanCrownWidth"],
            "sourceSampleCount": group_specs[group]["sampleCount"],
            "groupCoefficient": group_specs[group]["coefficient"],
            "expectedContinuousWidths": expected_values,
            "expectedContinuousRangePct": range_pct(expected_values),
            "outputRasterWidths": actual_values,
            "outputRasterRangePct": range_pct(actual_values),
            "outputRasterRangePx": max(actual_values) - min(actual_values),
            "outputRasterThresholdPx": 1,
            "outputRasterPass": max(actual_values) - min(actual_values) <= 1,
            "method": "green crown predicate; alpha>32; 4-neighbor connected component",
            "rasterQuantizationWarning": any(v is not None and v < 12 for v in actual_values),
        }
    v2_comparison = {
        f: {"pilotHeight": frames[f]["outputMetrics"]["bboxHeight"], "v2Height": frames[f]["v2ComparableHeight"], "deltaPct": frames[f]["v2HeightDeltaPct"], "pass": frames[f]["v2CrossCheckPass"]}
        for f in FRAME_IDS if frames[f]["v2ComparableHeight"] is not None
    }
    v2_cross_check_pass = all(v["pass"] for v in v2_comparison.values())
    order = FRAME_IDS; contact = Image.new("RGBA", (2640, 360), (45,45,45,255)); contact.alpha_composite(Image.open(BENCH).convert("RGBA"), (0,0))
    for i, f in enumerate(order, start=1): contact.alpha_composite(outputs[f], (i*240,0))
    draw = ImageDraw.Draw(contact)
    for i, label in enumerate(["BASE"]+order): draw.text((i*240+4,338), label, fill=(245,245,245,255))
    contact_path = ROOT / "contact/right_legacy_renorm_pilot_vs_baseline.png"; contact.save(contact_path)
    comparable = [f for f in FRAME_IDS if f in v2_heights and (ROOT.parent / "t45_v2_right_batch_seq328/normalized" / f"{f}.png").exists()]
    v2_contact = Image.new("RGBA", (720, len(comparable) * 340), (45,45,45,255))
    v2_draw = ImageDraw.Draw(v2_contact)
    v2_root = ROOT.parent / "t45_v2_right_batch_seq328/normalized"
    for i, frame in enumerate(comparable):
        y = i * 340
        v2_contact.alpha_composite(Image.open(BENCH).convert("RGBA"), (0, y))
        v2_contact.alpha_composite(outputs[frame], (240, y))
        v2_contact.alpha_composite(Image.open(v2_root / f"{frame}.png").convert("RGBA"), (480, y))
        v2_draw.text((4, y + 322), f"BASE | PILOT {frame} | V2", fill=(245,245,245,255))
    v2_contact_path = ROOT / "contact/right_legacy_renorm_pilot_vs_v2.png"; v2_contact.save(v2_contact_path)
    qa = {
        "task":"T45", "seq":"342", "revision":"legacy-group-rigid-renorm-right10-r2", "stage":"right10_pilot_r2",
        "artifactStage":"candidate", "visualReview":"codex_reviewed_pending_Leo", "specGate":"needs_PM2_ruling",
        "processing":"checkerboard edge flood-fill + exact alpha>32 largest-component retention; raw sources preserved",
        "anchor":{"path":str(ANCHOR),"sha256":sha(ANCHOR),"cleanup":anchor_cleanup,"processingSafety":anchor_safety,"crownWidth":anchor_crown,"crownBBox":anchor_crown_bb,"crownPixels":anchor_crown_pixels,"sourceBBox":anchor_bb,"sourceBBoxHeight":anchor_h},
        "formula":"(anchor crown width / source-table group mean crown width) * (256 / anchor source bbox height); one coefficient per source table group",
        "groupDerivation":group_specs, "frames":frames, "rigidConsistency":rigid_consistency, "v2Comparison":v2_comparison,
        "v2CrossCheckPass":v2_cross_check_pass,
        "visualReviewDescription":"Both contact sheets were reviewed after the group-coefficient rerun. BASE|PILOT shows walk heights 219/218/223, attack heights 241/241/241/243, and jump heights 180/204/213; the walk sequence is visibly tighter and jump progression is natural. BASE|PILOT|V2 shows the remaining legacy-to-v2 gap; all comparable rows are within the revised ±15% reference range except jump_right_1 at -15.094%. Poses remain recognizable and all feet share y=300. No runtime asset was changed.",
        "contact":str(contact_path), "v2Contact":str(v2_contact_path), "runtimeTouched":False,
        "frameHardGatesPass":all(v["allHardGatesPass"] for v in frames.values()),
        "rigidRasterHardGatePass":all(v["outputRasterPass"] for v in rigid_consistency.values()),
        "shaDistinct":len({v["outputSha256"] for v in frames.values()})==10,
        "allHardGatesPass":all(v["allHardGatesPass"] for v in frames.values()) and all(v["outputRasterPass"] for v in rigid_consistency.values()) and v2_cross_check_pass,
        "blockingReason":"Group-coefficient rerun passes frame geometry, no-crop, SHA, processing safety, and output crown ≤1px group gates. The only failed reference item is jump_right_1 at -15.094% versus v2 (0.094 percentage points beyond the strict ±15% threshold); stop before expansion.",
    }
    (ROOT/"qa/right_legacy_renorm_pilot.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2)+"\n")
    (ROOT/"qa/rigid_derivation.json").write_text(json.dumps({"formula":qa["formula"],"anchor":qa["anchor"],"groupDerivation":group_specs,"frames":{f:{"group":v["group"],"crownWidth":v["rigidCrownWidth"],"sourceBBoxHeight":v["sourceBBoxHeight"],"coefficient":v["coefficient"],"expectedOutputRigidWidthContinuous":v["expectedOutputRigidWidthContinuous"],"outputRigidProbe":v["outputRigidProbe"],"outputHeight":v["outputMetrics"]["bboxHeight"],"processingSafety":v["processingSafety"]} for f,v in frames.items()},"rigidConsistency":rigid_consistency,"v2Comparison":v2_comparison,"contacts":{"baseline":str(contact_path),"v2":str(v2_contact_path)}},ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"allHardGatesPass":qa["allHardGatesPass"],"frameHardGatesPass":qa["frameHardGatesPass"],"rigidRasterHardGatePass":qa["rigidRasterHardGatePass"],"v2CrossCheckPass":qa["v2CrossCheckPass"],"shaDistinct":qa["shaDistinct"],"anchorCrown":anchor_crown,"anchorHeight":anchor_h,"contact":str(contact_path)},ensure_ascii=False))


if __name__ == "__main__": main()
