from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw


ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT / "normalized"
QA = ROOT / "qa"
OUT.mkdir(exist_ok=True)
QA.mkdir(exist_ok=True)


def cutout_white(src: Path) -> Image.Image:
    """Flood-cut connected neutral background, retaining enclosed light pixels."""
    rgb = Image.open(src).convert("RGB")
    mask = rgb.copy()
    for corner in ((0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)):
        ImageDraw.floodfill(mask, corner, (0, 255, 0), thresh=60)
    out = rgb.convert("RGBA")
    op, mp = out.load(), mask.load()
    for y in range(out.height):
        for x in range(out.width):
            if mp[x, y] == (0, 255, 0):
                r, g, b, _ = op[x, y]
                op[x, y] = (r, g, b, 0)
    return out


def bbox(im: Image.Image):
    return im.getchannel("A").point(lambda p: 255 if p >= 30 else 0).getbbox()


def frame_for(src: Path, key: str, mode: str) -> dict:
    cut = cutout_white(src)
    box = bbox(cut)
    if not box:
        raise ValueError(f"empty cutout: {src}")
    crop = cut.crop(box)
    if mode == "vertical":
        scale = 256 / crop.height
        sprite = crop.resize((round(crop.width * scale), 256), Image.Resampling.LANCZOS)
        x = round(120 - sprite.width / 2)
        y = 44
    elif mode == "die":
        # Horizontal death frame is width-normalized to 210 px; bottom baseline is y=300.
        scale = 210 / crop.width
        sprite = crop.resize((210, round(crop.height * scale)), Image.Resampling.LANCZOS)
        x = round(120 - sprite.width / 2)
        y = 300 - sprite.height
    else:
        raise ValueError(mode)
    frame = Image.new("RGBA", (240, 320), (0, 0, 0, 0))
    frame.alpha_composite(sprite, (x, y))
    out = OUT / f"{key}.png"
    frame.save(out, "PNG", optimize=False)
    out_box = bbox(frame)
    alpha = frame.getchannel("A")
    w = out_box[2] - out_box[0]
    h = out_box[3] - out_box[1]
    record = {
        "key": key,
        "source": str(src.relative_to(Path.cwd())),
        "output": str(out.relative_to(Path.cwd())),
        "size": list(frame.size),
        "sourceAlphaBBox": list(box),
        "bbox": list(out_box),
        "visualWidth": w,
        "visualHeight": h,
        "feetY": out_box[3],
        "centroidX": (out_box[0] + out_box[2]) / 2,
        "widthHeightRatio": w / h,
        "alphaExtrema": list(alpha.getextrema()),
        "sourceSha256": hashlib.sha256(src.read_bytes()).hexdigest(),
        "outputSha256": hashlib.sha256(out.read_bytes()).hexdigest(),
        "processing": "connected neutral-background flood-cut; aspect-preserving resize; 240x320 RGBA frame; no redraw",
        "mechanicalPass": bool(
            frame.size == (240, 320)
            and out_box[3] == 300
            and abs((out_box[0] + out_box[2]) / 2 - 120) <= 1
            and alpha.getextrema()[0] == 0
            and ((mode == "vertical" and h == 256 and 0.38 <= w / h <= 0.55) or (mode == "die" and w <= 220)),
        ),
    }
    (QA / f"{key}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    return record


records = [
    frame_for(RAW / "walk_right_1_attempt1.png", "walk_right_1", "vertical"),
    frame_for(RAW / "atk_right_1_attempt1.png", "atk_right_1", "vertical"),
    frame_for(RAW / "die_common_attempt1.png", "die_common", "die"),
]
(QA / "summary.json").write_text(
    json.dumps({"count": len(records), "mechanicalPass": all(r["mechanicalPass"] for r in records), "files": records}, ensure_ascii=False, indent=2) + "\n"
)
print(json.dumps(records, ensure_ascii=False, indent=2))
