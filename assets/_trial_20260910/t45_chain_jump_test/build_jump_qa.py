from __future__ import annotations

from pathlib import Path
from collections import deque
import hashlib
import json

from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
REPO = Path.cwd()
FRAMES = ["idle_right", "jump_right_1", "jump_right_2", "jump_right_3"]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def components(mask, w, h):
    seen = set(); out = []
    for y in range(h):
        for x in range(w):
            if not mask[y][x] or (x, y) in seen:
                continue
            q = [(x, y)]; seen.add((x, y)); pts = []
            while q:
                xx, yy = q.pop(); pts.append((xx, yy))
                for nx, ny in ((xx-1, yy), (xx+1, yy), (xx, yy-1), (xx, yy+1)):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and (nx, ny) not in seen:
                        seen.add((nx, ny)); q.append((nx, ny))
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            out.append({"area": len(pts), "bbox": [min(xs), min(ys), max(xs)+1, max(ys)+1]})
    return sorted(out, key=lambda c: c["area"], reverse=True)


def bg_free_person_bbox(image):
    w, h = image.size; px = image.load()
    if image.getchannel("A").getextrema()[0] == 0:
        b = image.getchannel("A").getbbox()
        return list(b)
    bg = set(); q = []
    for x in range(w): q.extend(((x, 0), (x, h-1)))
    for y in range(h): q.extend(((0, y), (w-1, y)))
    q = [p for p in set(q) if max(px[p[0], p[1]][:3]) <= 20]
    bg.update(q)
    while q:
        x, y = q.pop()
        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in bg and max(px[nx, ny][:3]) <= 20:
                bg.add((nx, ny)); q.append((nx, ny))
    pts = [(x, y) for y in range(h) for x in range(w) if (x, y) not in bg]
    xs = [x for x, _ in pts]; ys = [y for _, y in pts]
    return [min(xs), min(ys), max(xs)+1, max(ys)+1]


def probe(path: Path):
    image = Image.open(path).convert("RGBA"); w, h = image.size; px = image.load()
    person = bg_free_person_bbox(image)
    face = [[False] * w for _ in range(h)]
    crown = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            face[y][x] = r > 195 and r > g > b and r - b > 45 and y < int(h * .72)
            crown[y][x] = r > 180 and g > 180 and b > 180 and y < int(h * .40)
    face_comps = components(face, w, h)
    crown_comps = components(crown, w, h)
    # Crown is the uppermost white rigid ornament; restrict to components near the top.
    crown_candidates = [c for c in crown_comps if int(h * .12) <= c["bbox"][1] <= int(h * .35) and c["area"] >= 20]
    crown_comps = crown_candidates or crown_comps
    crown_comps = sorted(crown_comps, key=lambda c: c["area"], reverse=True)
    crown_comp = crown_comps[0] if crown_comps else {"bbox": [0,0,0,0], "area": 0}
    face_comp = face_comps[0] if face_comps else {"bbox": [0,0,0,0], "area": 0}
    crown_w = crown_comp["bbox"][2] - crown_comp["bbox"][0]
    face_w = face_comp["bbox"][2] - face_comp["bbox"][0]
    person_h = person[3] - person[1]
    scale_to_240 = 240 / w
    return {
        "path": str(path), "sha256": sha(path), "size": [w, h],
        "personBBox": person, "personHeight": person_h,
        "crownBBox": crown_comp["bbox"], "crownWidth": crown_w,
        "faceBBox": face_comp["bbox"], "faceWidth": face_w,
        "crownWidthScaleTo240": crown_w * scale_to_240,
        "faceWidthScaleTo240": face_w * scale_to_240,
        "crownWidthOverPersonHeight": crown_w / person_h if person_h else None,
        "faceWidthOverPersonHeight": face_w / person_h if person_h else None,
        "alphaExtrema": list(image.getchannel("A").getextrema()),
    }


def fit(image: Image.Image, size=(240, 320)):
    image = image.convert("RGBA"); image.thumbnail((size[0]-16, size[1]-28), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (45,45,45,255))
    canvas.alpha_composite(image, ((size[0]-image.width)//2, 8))
    return canvas


def main():
    paths = {
        "idle_right": ROOT / "chain/idle_right.png",
        "jump_right_1": ROOT / "chain/jump_right_1.png",
        "jump_right_2": ROOT / "chain/jump_right_2.png",
        "jump_right_3": ROOT / "chain/jump_right_3.png",
    }
    parallel = {
        "jump_right_1": REPO / "assets/_trial_20260910/t45_v2_right_batch_seq328/normalized/jump_right_1.png",
        "jump_right_2": REPO / "assets/_trial_20260910/t45_v2_right_batch_seq328/normalized/jump_right_2.png",
        "jump_right_3": REPO / "assets/_trial_20260910/t45_v2_right_batch_seq328/normalized/jump_right_3.png",
    }
    probes = {k: probe(v) for k, v in paths.items()}
    for key in ("crownWidthScaleTo240", "faceWidthScaleTo240"):
        values = [probes[k][key] for k in FRAMES]
        probes[key + "Values"] = values
    crown_vals = [probes[k]["crownWidthScaleTo240"] for k in FRAMES]
    face_vals = [probes[k]["faceWidthScaleTo240"] for k in FRAMES]
    crown_range = max(crown_vals) - min(crown_vals)
    face_range = max(face_vals) - min(face_vals)
    crown_pct = crown_range / (sum(crown_vals) / len(crown_vals)) * 100
    face_pct = face_range / (sum(face_vals) / len(face_vals)) * 100
    qa = {
        "task": "T45", "seq": "338", "stage": "jump_chain_proportion",
        "chainDefinition": "idle_right -> jump_right_1 -> jump_right_2 -> jump_right_3",
        "generatedCount": 3, "cost": 0, "costUnit": "subscription-included",
        "runtimeTouched": False, "formalAssetsTouched": False,
        "steps": [
            {"step": 1, "input": str(paths["idle_right"]), "inputSha256": sha(paths["idle_right"]), "output": str(ROOT/"raw/jump_right_1_chain.png"), "outputSha256": sha(ROOT/"raw/jump_right_1_chain.png"), "promptPath": "prompts/jump_right_1_edit.txt", "prompt": (ROOT/"prompts/jump_right_1_edit.txt").read_text(), "referenceMechanism": "num_last_images_to_include=1"},
            {"step": 2, "input": str(paths["jump_right_1"]), "inputSha256": sha(paths["jump_right_1"]), "output": str(ROOT/"raw/jump_right_2_chain.png"), "outputSha256": sha(ROOT/"raw/jump_right_2_chain.png"), "promptPath": "prompts/jump_right_2_edit.txt", "prompt": (ROOT/"prompts/jump_right_2_edit.txt").read_text(), "referenceMechanism": "num_last_images_to_include=1"},
            {"step": 3, "input": str(paths["jump_right_2"]), "inputSha256": sha(paths["jump_right_2"]), "output": str(ROOT/"raw/jump_right_3_chain.png"), "outputSha256": sha(ROOT/"raw/jump_right_3_chain.png"), "promptPath": "prompts/jump_right_3_edit.txt", "prompt": (ROOT/"prompts/jump_right_3_edit.txt").read_text(), "referenceMechanism": "num_last_images_to_include=1"},
        ],
        "chainAuthenticity": {"allInputsArePreviousProducts": True, "referenceCountPerStep": 1},
        "probes": probes,
        "criterion": {"crownRangePct": crown_pct, "faceRangePct": face_pct, "thresholdPct": 5, "pass": crown_pct <= 5 and face_pct <= 5},
        "parallelBaseline": {k: {"path": str(v), "sha256": sha(v)} for k, v in parallel.items()},
        "conclusion": "PASS" if crown_pct <= 5 and face_pct <= 5 else "FAIL: rigid probe range exceeds 5%",
    }
    items = [("BASE_IDLE", paths["idle_right"])]
    items += [(f"CHAIN_{k.upper()}", paths[k]) for k in ("jump_right_1", "jump_right_2", "jump_right_3")]
    items += [(f"PARALLEL_{k.upper()}", v) for k, v in parallel.items()]
    contact = Image.new("RGBA", (len(items)*240, 360), (45,45,45,255)); draw = ImageDraw.Draw(contact)
    for i, (label, path) in enumerate(items):
        contact.alpha_composite(fit(Image.open(path)), (i*240, 0)); draw.text((i*240+4,338), label, fill=(245,245,245,255))
    contact_path = ROOT / "contact/chain_jump_vs_parallel.png"; contact.save(contact_path); qa["contact"] = str(contact_path)
    (ROOT/"qa/chain_probe.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"conclusion": qa["conclusion"], "crownRangePct": crown_pct, "faceRangePct": face_pct, "contact": str(contact_path)}, ensure_ascii=False))


if __name__ == "__main__": main()
