"""Deterministic cleanup for the T45 2b enemy left-mirror _2 candidates.

This pass only removes exposed low-alpha near-neutral light fringe and four
explicitly reviewed opaque white islands between the arm, cuff and belt. It
never redraws, scales, crops or changes the runtime assets.
"""
from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = ROOT / "assets/_trial_20260907/t45_batch2b_enemy_left_mirror_codex_native/normalized"
TRIAL = ROOT / "assets/_trial_20260907/t45_batch2b_enemy_left_cleanup_v1_codex_native"
OUT = TRIAL / "normalized"
QA = TRIAL / "qa"
CONTACT = TRIAL / "contact"

FILES = [
    "shanzei_a_walk_left_2.png",
    "shanzei_a_walk_leftup_2.png",
    "shanzei_a_walk_leftdown_2.png",
    "shanzei_a_atk_left_2.png",
    "shanzei_a_atk_leftup_2.png",
    "shanzei_a_atk_leftdown_2.png",
    "shanzei_b_walk_leftdown_2.png",
    "shanzei_b_atk_leftup_2.png",
]

# (x0, y0, x1, y1), half-open image coordinates. These are the four opaque
# white islands Leo called out during the left-mirror review.
CLEAR_ROIS: Dict[str, Tuple[int, int, int, int]] = {
    "shanzei_a_walk_left_2.png": (134, 174, 160, 207),
    "shanzei_a_atk_leftup_2.png": (144, 154, 164, 185),
    "shanzei_b_walk_leftdown_2.png": (136, 151, 162, 191),
    "shanzei_b_atk_leftup_2.png": (136, 147, 156, 172),
}

# Keep the edge pass conservative: low-alpha bright/neutral matte can be
# removed; dark or sufficiently opaque character edge pixels are retained.
ALPHA_MAX = 96
LUMA_MIN = 140
NEUTRAL_RANGE_MAX = 30
EXPOSED_ALPHA_MAX = 16
EDGE_PASSES = 3


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remove_exposed_fringe(image: Image.Image) -> int:
    """Remove only exposed low-alpha, near-neutral light fringe pixels."""
    if image.mode != "RGBA":
        raise ValueError("cleanup expects an RGBA image")
    px = image.load()
    width, height = image.size
    removed = 0
    for _ in range(EDGE_PASSES):
        pending: List[Tuple[int, int]] = []
        for y in range(height):
            for x in range(width):
                r, g, b, alpha = px[x, y]
                if alpha == 0 or alpha > ALPHA_MAX:
                    continue
                if (r + g + b) / 3 < LUMA_MIN:
                    continue
                if max(r, g, b) - min(r, g, b) > NEUTRAL_RANGE_MAX:
                    continue
                if any(
                    nx < 0
                    or nx >= width
                    or ny < 0
                    or ny >= height
                    or px[nx, ny][3] <= EXPOSED_ALPHA_MAX
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                ):
                    pending.append((x, y))
        for x, y in pending:
            r, g, b, _ = px[x, y]
            px[x, y] = (r, g, b, 0)
        removed += len(pending)
    return removed


def clear_white_islands(image: Image.Image, roi: Tuple[int, int, int, int]) -> List[Dict[str, object]]:
    """Clear reviewed opaque near-white components fully contained by *roi*."""
    px = image.load()
    x0, y0, x1, y1 = roi
    seen = set()
    components: List[List[Tuple[int, int]]] = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x, y) in seen:
                continue
            r, g, b, alpha = px[x, y]
            if alpha < 180 or min(r, g, b) < 170 or max(r, g, b) - min(r, g, b) > 35:
                continue
            q: deque[Tuple[int, int]] = deque([(x, y)])
            seen.add((x, y))
            component: List[Tuple[int, int]] = []
            while q:
                cx, cy = q.popleft()
                component.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if not (x0 <= nx < x1 and y0 <= ny < y1) or (nx, ny) in seen:
                        continue
                    nr, ng, nb, na = px[nx, ny]
                    if na >= 180 and min(nr, ng, nb) >= 170 and max(nr, ng, nb) - min(nr, ng, nb) <= 35:
                        seen.add((nx, ny))
                        q.append((nx, ny))
            # The ROI is an explicitly reviewed exclusion zone, so a lone
            # opaque near-white pixel is also a matte remnant rather than a
            # protected costume highlight.
            if component:
                components.append(component)
    records = []
    for component in components:
        for x, y in component:
            r, g, b, _ = px[x, y]
            px[x, y] = (r, g, b, 0)
        records.append(
            {
                "pixelCount": len(component),
                "bbox": [
                    min(x for x, _ in component),
                    min(y for _, y in component),
                    max(x for x, _ in component) + 1,
                    max(y for _, y in component) + 1,
                ],
            }
        )
    return records


def alpha_bbox(image: Image.Image, threshold: int = 32):
    alpha = image.getchannel("A")
    if threshold == 0:
        return alpha.getbbox()
    return alpha.point(lambda value: 255 if value > threshold else 0).getbbox()


def qa_record(name: str, source: Path, output: Path, edge_removed: int, island_records: Sequence[Dict[str, object]]) -> Dict[str, object]:
    image = Image.open(output).convert("RGBA")
    source_image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha_bbox(image)
    bbox0 = alpha_bbox(image, 0)
    px = image.load()
    source_px = source_image.load()
    changed = removed = added = 0
    for y in range(image.height):
        for x in range(image.width):
            if px[x, y] != source_px[x, y]:
                changed += 1
                if source_px[x, y][3] > 0 and px[x, y][3] == 0:
                    removed += 1
                if source_px[x, y][3] == 0 and px[x, y][3] > 0:
                    added += 1
    residual_white = 0
    if name in CLEAR_ROIS:
        x0, y0, x1, y1 = CLEAR_ROIS[name]
        for y in range(y0, y1):
            for x in range(x0, x1):
                r, g, b, pixel_alpha = px[x, y]
                if pixel_alpha >= 180 and min(r, g, b) >= 170 and max(r, g, b) - min(r, g, b) <= 35:
                    residual_white += 1
    edge_alpha_zero = all(px[x, y][3] == 0 for x in range(image.width) for y in (0, image.height - 1)) and all(px[x, y][3] == 0 for y in range(image.height) for x in (0, image.width - 1))
    connected = 0
    seen = set()
    for y in range(image.height):
        for x in range(image.width):
            if px[x, y][3] <= 32 or (x, y) in seen:
                continue
            connected += 1
            q = deque([(x, y)])
            seen.add((x, y))
            while q:
                cx, cy = q.popleft()
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < image.width and 0 <= ny < image.height and (nx, ny) not in seen and px[nx, ny][3] > 32:
                        seen.add((nx, ny))
                        q.append((nx, ny))
    sx = sy = count = 0
    for y in range(image.height):
        for x in range(image.width):
            if px[x, y][3] > 32:
                sx += x
                sy += y
                count += 1
    cx = sx / count if count else None
    cy = sy / count if count else None
    # Keep the T45 release geometry gate explicit and independent of the
    # cleanup delta; all eight candidates retain the same visual height/feet.
    hard_pass = bool(
        image.size == (240, 320)
        and image.mode == "RGBA"
        and bbox is not None
        and bbox[3] == 300
        and bbox[1] == 44
        and bbox[3] - bbox[1] == 256
        and abs(cx - 120) <= 20
        and edge_alpha_zero
        and connected == 1
        and added == 0
        and residual_white == 0
    )
    return {
        "name": name,
        "source": str(source.relative_to(ROOT)),
        "output": str(output.relative_to(ROOT)),
        "sourceSha256": sha256(source),
        "outputSha256": sha256(output),
        "size": list(image.size),
        "mode": image.mode,
        "bboxT32": list(bbox) if bbox else None,
        "bboxAlphaPositive": list(bbox0) if bbox0 else None,
        "visualHeightT32": bbox[3] - bbox[1] if bbox else None,
        "feetY": bbox[3] if bbox else None,
        "alpha32CentroidX": cx,
        "alpha32CentroidY": cy,
        "alphaExtrema": list(alpha.getextrema()),
        "edgeFringeRemovedByPass": edge_removed,
        "whiteIslandComponents": list(island_records),
        "residualWhitePixelsInClearRoi": residual_white,
        "changedPixels": changed,
        "removedAlphaPixels": removed,
        "addedAlphaPixels": added,
        "edgeAlphaZero": edge_alpha_zero,
        "connectedComponentsT32": connected,
        "hardGatesPass": hard_pass,
    }


def write_contacts(records: Sequence[Dict[str, object]]) -> None:
    font = ImageFont.load_default()
    files = [TRIAL / "normalized" / name for name in FILES]
    for background, suffix in [((0, 0, 0, 255), "dark"), ((255, 255, 255, 255), "light")]:
        tile_w, tile_h, header, cols = 240, 320, 20, 4
        rows = (len(files) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * tile_w, rows * (tile_h + header)), background)
        draw = ImageDraw.Draw(sheet)
        for i, path in enumerate(files):
            x = (i % cols) * tile_w
            y = (i // cols) * (tile_h + header)
            draw.rectangle((x, y, x + tile_w - 1, y + header - 1), fill=(70, 70, 70, 255))
            draw.text((x + 3, y + 4), path.stem, fill=(255, 255, 255, 255), font=font)
            sheet.alpha_composite(Image.open(path).convert("RGBA"), (x, y + header))
        sheet.save(CONTACT / f"cleanup_full_{suffix}.png", "PNG", optimize=False)

    rois = [(name, CLEAR_ROIS[name]) for name in FILES if name in CLEAR_ROIS]
    scale = 8
    pad = 12
    tiles = []
    for name, (x0, y0, x1, y1) in rois:
        source = Image.open(SOURCE_ROOT / name).convert("RGBA")
        output = Image.open(OUT / name).convert("RGBA")
        before = source.crop((x0, y0, x1, y1)).resize(((x1 - x0) * scale, (y1 - y0) * scale), Image.Resampling.NEAREST)
        after = output.crop((x0, y0, x1, y1)).resize(before.size, Image.Resampling.NEAREST)
        width, height = before.size
        tile = Image.new("RGBA", (width * 2 + pad, height + 24), (22, 24, 29, 255))
        tile.alpha_composite(Image.new("RGBA", before.size, (0, 0, 0, 255)), (0, 24))
        tile.alpha_composite(before, (0, 24))
        tile.alpha_composite(Image.new("RGBA", after.size, (0, 0, 0, 255)), (width + pad, 24))
        tile.alpha_composite(after, (width + pad, 24))
        draw = ImageDraw.Draw(tile)
        draw.text((3, 4), f"{name}: before", fill=(255, 255, 255), font=font)
        draw.text((width + pad + 3, 4), "after", fill=(255, 255, 255), font=font)
        tiles.append(tile)
    width = max(tile.width for tile in tiles)
    sheet = Image.new("RGB", (width, sum(tile.height for tile in tiles)), (210, 210, 210))
    y = 0
    for tile in tiles:
        sheet.paste(tile, (0, y))
        y += tile.height
    sheet.convert("RGB").save(CONTACT / "cleanup_target_crops_8x.png", "PNG", optimize=False)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    CONTACT.mkdir(parents=True, exist_ok=True)
    records = []
    for name in FILES:
        source = SOURCE_ROOT / name
        image = Image.open(source).convert("RGBA")
        edge_removed = remove_exposed_fringe(image)
        island_records = clear_white_islands(image, CLEAR_ROIS[name]) if name in CLEAR_ROIS else []
        output = OUT / name
        image.save(output, "PNG", optimize=False)
        records.append(qa_record(name, source, output, edge_removed, island_records))
    (QA / "cleanup_check.json").write_text(json.dumps({
        "task": "T45",
        "batch": "2b-enemy-left-cleanup-v1",
        "count": len(records),
        "allMechanicalPass": all(r["hardGatesPass"] for r in records),
        "allAddedAlphaZero": all(r["addedAlphaPixels"] == 0 for r in records),
        "records": records,
    }, ensure_ascii=False, indent=2) + "\n")
    write_contacts(records)
    manifest = {
        "task": "T45",
        "batch": "2b-enemy-left-cleanup-v1",
        "artifactStage": "candidate_revision",
        "visualReview": "pending_Leo_recheck",
        "specGate": "pending",
        "integrationGate": "not_handed_off",
        "runtimeRelease": False,
        "sourcePackage": "assets/_trial_20260907/t45_batch2b_enemy_left_mirror_codex_native/",
        "processing": "Three deterministic passes remove exposed alpha<=96 near-neutral light fringe (luma>=140, channel range<=30, exposed neighbor alpha<=16); four explicit ROI flood-clears remove opaque near-white islands. No redraw/crop/scale/runtime edit.",
        "clearRois": {name: list(roi) for name, roi in CLEAR_ROIS.items()},
        "count": len(records),
        "files": records,
        "hardGatesAllPass": all(r["hardGatesPass"] for r in records),
        "qaPath": "qa/cleanup_check.json",
        "contactPaths": ["contact/cleanup_full_dark.png", "contact/cleanup_full_light.png", "contact/cleanup_target_crops_8x.png"],
    }
    (TRIAL / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (TRIAL / "request.md").write_text("""# T45 批 2b 山贼左系 `_2` 镜像清理候选 v1\n\n- 范围：甲 `walk/atk × left/leftup/leftdown × _2` 共 6 张；乙仅 `walk_leftdown_2`、`atk_leftup_2` 2 张。\n- 来源：`t45_batch2b_enemy_left_mirror_codex_native/normalized/` 已通过镜像机械门的候选帧。\n- 处理：确定性去除低透明度浅色边缘晕染；在 4 个已定位的手臂/腰带留白 ROI 内清除不透明近白残块。无重绘、无裁切、无缩放、无运行时改动。\n- 门检：8 张均保持 240×320 RGBA、视觉高 256、脚底 y=300、alpha>32 质心在 x=120±20、四边透明、单连通、无新增 alpha；原镜像包保留不变。\n- 状态：新候选 revision，等待 Leo 目验与 PM 规格门；不进入 runtime。\n""")


if __name__ == "__main__":
    main()
