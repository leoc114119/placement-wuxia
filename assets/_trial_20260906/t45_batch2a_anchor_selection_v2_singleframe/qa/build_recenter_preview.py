from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw


ROOT = Path(__file__).parents[1]
SOURCE = ROOT.parent / "t45_batch2a_a_right_singleframe_v1_codex_native" / "normalized" / "shanzei_a_right.png"
PREVIEW = ROOT / "qa" / "shanzei_a_right_recentered_preview.png"
REPORT = ROOT / "qa" / "recenter_canonical_a_right_preview.json"
CONTACT = ROOT / "qa" / "recenter_canonical_six_preview.png"
DX = 6
THRESHOLD = 32

CANONICAL = [
    ("A · right · preview +6px", PREVIEW),
    ("A · rightup · unchanged", ROOT.parent / "t45_batch2a_a_rightup_singleframe_v1_codex_native" / "normalized" / "shanzei_a_rightup.png"),
    ("A · rightdown · unchanged", ROOT.parent / "t45_batch2a_a_rightdown_singleframe_v1_codex_native" / "normalized" / "shanzei_a_rightdown.png"),
    ("B · right · unchanged", ROOT.parent / "t45_batch2a_bright_v8_two_ref_hero_height_codex_native" / "normalized" / "shanzei_b_right.png"),
    ("B · rightup · unchanged", ROOT.parent / "t45_batch2a_b_rightup_singleframe_v5_codex_native" / "normalized" / "shanzei_b_rightup.png"),
    ("B · rightdown · unchanged", ROOT.parent / "t45_batch2a_b_rightdown_singleframe_v1_codex_native" / "normalized" / "shanzei_b_rightdown.png"),
]


def facts(image: Image.Image) -> dict:
    image = image.convert("RGBA")
    points = [
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if image.getpixel((x, y))[3] > THRESHOLD
    ]
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return {
        "size": list(image.size),
        "mode": image.mode,
        "bboxInclusive": [min(xs), min(ys), max(xs), max(ys)],
        "visualHeight": max(ys) - min(ys) + 1,
        "feetY": max(ys) + 1,
        "centroidX": sum(xs) / len(xs),
        "alphaExtrema": [min(p[3] for p in image.getdata()), max(p[3] for p in image.getdata())],
        "perimeterNonzero": sum(
            1
            for x in range(image.width)
            for y in (0, image.height - 1)
            if image.getpixel((x, y))[3] > THRESHOLD
        )
        + sum(
            1
            for y in range(1, image.height - 1)
            for x in (0, image.width - 1)
            if image.getpixel((x, y))[3] > THRESHOLD
        ),
    }


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    before = facts(source)
    shifted = Image.new("RGBA", source.size, (0, 0, 0, 0))
    shifted.alpha_composite(source, (DX, 0))
    shifted.save(PREVIEW, "PNG", optimize=False)
    after = facts(shifted)

    report = {
        "task": "T45",
        "scope": "canonical selected A-right preview only",
        "source": str(SOURCE),
        "preview": str(PREVIEW),
        "operation": "deterministic horizontal translation; no redraw",
        "shiftX": DX,
        "alphaThreshold": THRESHOLD,
        "before": before,
        "after": after,
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "previewSha256": hashlib.sha256(PREVIEW.read_bytes()).hexdigest(),
        "manifestUpdated": False,
        "runtimeRelease": False,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    cell_w, cell_h = 520, 650
    sheet = Image.new("RGBA", (cell_w * 3, cell_h * 2 + 54), (31, 35, 42, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((24, 14), "T45 canonical six · A-right recenter preview", fill=(236, 231, 215, 255))
    for index, (label, path) in enumerate(CANONICAL):
        sprite = Image.open(path).convert("RGBA")
        x = (index % 3) * cell_w
        y = 54 + (index // 3) * cell_h
        draw.rounded_rectangle((x + 10, y + 8, x + cell_w - 10, y + cell_h - 10), radius=16, fill=(50, 56, 64, 255))
        sheet.alpha_composite(sprite.resize((390, 520), Image.Resampling.NEAREST), (x + 65, y + 54))
        draw.line((x + 28, y + 536, x + cell_w - 28, y + 536), fill=(199, 103, 73, 255), width=2)
        draw.text((x + 24, y + 18), label, fill=(236, 231, 215, 255))
    sheet.save(CONTACT, "PNG", optimize=False)
    print(json.dumps({"preview": str(PREVIEW), "contact": str(CONTACT), "before": before, "after": after}, ensure_ascii=False))


if __name__ == "__main__":
    main()
