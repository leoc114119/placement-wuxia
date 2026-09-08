#!/usr/bin/env python3
"""Deterministic post-processing for the T45 upright-fist pilot.

ImageGen output may contain a baked checkerboard. This script removes only the
edge-connected near-white checkerboard, preserves enclosed character pixels,
normalizes the full-body alpha bbox to 240x320 / visual height 256 / feet y=300,
and builds review-only source-vs-candidate contact sheets.
"""
from __future__ import annotations
import hashlib, json, sys
from pathlib import Path
from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[3]
ROOT = Path(__file__).resolve().parent
W, H, TARGET_H, FEET_Y, CENTER_X = 240, 320, 256, 300, 120
SPECS = {
    "shanzei_a": {
        "raw": "raw/shanzei_a_atk_right_2_upright_fist_attempt1.png",
        "normalized": "normalized/shanzei_a_atk_right_2_upright_fist.png",
        "source": "assets/characters/enemy/shanzei_a/battle45/atk_right_2.png",
        "sourceSha256": "72389c7651305cb19061d5337a38fa8bc472e29b61c2a2a8b27dfecfd31c218a",
        "identity": "assets/_trial_20260906/t45_batch2a_a_right_singleframe_v1_codex_native/normalized/shanzei_a_right.png",
        "label": "shanzei_a / atk_right_2",
    },
    "shanzei_b": {
        "raw": "raw/shanzei_b_atk_right_2_upright_fist_attempt1.png",
        "normalized": "normalized/shanzei_b_atk_right_2_upright_fist.png",
        "source": "assets/characters/enemy/shanzei_b/battle45/atk_right_2.png",
        "sourceSha256": "9729be6f684f31077c5f4347c03f178869593679576c8d1320f5587cd68fa31f",
        "identity": "assets/_trial_20260906/t45_batch2a_bright_v8_two_ref_hero_height_codex_native/normalized/shanzei_b_right.png",
        "label": "shanzei_b / atk_right_2",
    },
}

def sha256(p: Path) -> str:
    h = hashlib.sha256(); h.update(p.read_bytes()); return h.hexdigest()

def cut_and_normalize(raw: Path) -> tuple[Image.Image, dict]:
    # Use the project flood-cut implementation: it removes connected near-white
    # checkerboard squares while preserving enclosed white clothing/details.
    sys.path.insert(0, str(REPO / "scripts"))
    from build_walk_frames import flood_cut, feather
    im = Image.open(raw).convert("RGB")
    cut, bg = flood_cut(im)
    cut = feather(cut)
    bb = cut.getbbox()
    if bb is None: raise ValueError(f"empty cutout: {raw}")
    ch = cut.crop(bb)
    scale = TARGET_H / (bb[3] - bb[1])
    nw = round((bb[2] - bb[0]) * scale)
    ch = ch.resize((nw, TARGET_H), Image.Resampling.LANCZOS)
    ap = ch.getchannel("A").load(); sa = sax = 0
    for y in range(ch.height):
        for x in range(ch.width):
            a = ap[x, y]; sa += a; sax += a * x
    cx = sax / sa
    frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    paste_x = round(CENTER_X - cx)
    frame.paste(ch, (paste_x, FEET_Y - TARGET_H), ch)
    return frame, {"rawSize": list(im.size), "backgroundPixelsRemoved": bg, "cutBBox": list(bb), "scale": scale, "scaledWidth": nw, "alphaCentroidXLocal": cx, "paste": [paste_x, FEET_Y - TARGET_H]}

def metrics(im: Image.Image) -> dict:
    if im.mode != "RGBA": im = im.convert("RGBA")
    a = im.getchannel("A"); bb = a.getbbox()
    vals = list(a.getdata())
    if bb is None: return {"size": list(im.size), "mode": im.mode, "alphaExtrema": list(a.getextrema()), "bbox": None}
    x0,y0,x1,y1 = bb; total = sum(vals); cx = sum((i % im.width) * v for i,v in enumerate(vals)) / total
    cy = sum((i // im.width) * v for i,v in enumerate(vals)) / total
    border = sum(a.getpixel((x, y)) > 0 for x in range(im.width) for y in (0, im.height-1)) + sum(a.getpixel((x, y)) > 0 for y in range(im.height) for x in (0, im.width-1))
    # count 8-connected alpha components at alpha>32
    pix=a.load(); seen=set(); comps=0
    for y in range(im.height):
      for x in range(im.width):
        if pix[x,y] <= 32 or (x,y) in seen: continue
        comps += 1; stack=[(x,y)]; seen.add((x,y))
        while stack:
          sx,sy=stack.pop()
          for dy in (-1,0,1):
            for dx in (-1,0,1):
              if dx==0 and dy==0: continue
              nx,ny=sx+dx,sy+dy
              if 0<=nx<im.width and 0<=ny<im.height and (nx,ny) not in seen and pix[nx,ny] > 32:
                seen.add((nx,ny)); stack.append((nx,ny))
    return {"size": list(im.size), "mode": im.mode, "alphaExtrema": list(a.getextrema()), "bbox": list(bb), "visualWidth": x1-x0, "visualHeight": y1-y0, "feetYExclusive": y1, "alpha32CentroidX": cx, "alpha32CentroidY": cy, "borderNonzero": border, "alpha32Components": comps}

def make_contact(rows, out: Path):
    panel_w, panel_h = 240, 320; label_h=24; gap=18
    sheet = Image.new("RGBA", (panel_w*2, (panel_h+label_h+gap)*len(rows)), (226,226,226,255)); d=ImageDraw.Draw(sheet)
    for i,(ident,spec,cand) in enumerate(rows):
        y=i*(panel_h+label_h+gap)
        src=Image.open(REPO/spec["source"]).convert("RGBA")
        sheet.alpha_composite(src,(0,y+label_h)); sheet.alpha_composite(cand,(panel_w,y+label_h))
        d.text((4,y+4), f"{spec['label']} · SOURCE", fill=(18,18,18,255))
        d.text((panel_w+4,y+4), f"{spec['label']} · UPRIGHT FIST CANDIDATE", fill=(18,18,18,255))
    sheet.save(out)

def make_closeups(rows, out: Path):
    crop=(145,90,235,180); scale=4; cw=(crop[2]-crop[0])*scale; ch=(crop[3]-crop[1])*scale; label=24
    sheet=Image.new("RGBA",(cw*2,(ch+label)*len(rows)),(226,226,226,255)); d=ImageDraw.Draw(sheet)
    for i,(ident,spec,cand) in enumerate(rows):
      y=i*(ch+label); src=Image.open(REPO/spec["source"]).convert("RGBA")
      a=src.crop(crop).resize((cw,ch),Image.Resampling.NEAREST); b=cand.crop(crop).resize((cw,ch),Image.Resampling.NEAREST)
      sheet.alpha_composite(a,(0,y+label)); sheet.alpha_composite(b,(cw,y+label)); d.text((4,y+4),f"{ident} SOURCE fist crop",fill=(18,18,18,255)); d.text((cw+4,y+4),f"{ident} CANDIDATE fist crop",fill=(18,18,18,255))
    sheet.save(out)

def main():
    rows=[]; qa={"task":"T45","scope":"upright closed right punching fist pilot","status":"candidate_pending_leo_visual","frames":{}}
    for ident,spec in SPECS.items():
        raw=ROOT/spec["raw"]; out=ROOT/spec["normalized"]
        cand,proc=cut_and_normalize(raw); cand.save(out)
        src=Image.open(REPO/spec["source"]).convert("RGBA")
        m=metrics(cand); sm=metrics(src); source_sha=sha256(REPO/spec["source"])
        gates={"size240x320":m["size"]==[240,320],"rgba":m["mode"]=="RGBA","alphaHas0And255":m["alphaExtrema"]==[0,255],"visualHeight256":m["visualHeight"]==256,"feetY300":m["feetYExclusive"]==300,"centroidXWithin1":abs(m["alpha32CentroidX"]-120)<=1.0,"borderTransparent":m["borderNonzero"]==0,"singleComponent":m["alpha32Components"]==1,"bodySourceShaMatchesExpected":source_sha==spec["sourceSha256"],"noRuntimeWrite":True}
        qa["frames"][ident]={"sourcePath":spec["source"],"sourceSha256":source_sha,"sourceShaExpected":spec["sourceSha256"],"rawPath":str(raw.relative_to(REPO)),"rawSha256":sha256(raw),"normalizedPath":str(out.relative_to(REPO)),"normalizedSha256":sha256(out),"sourceMetrics":sm,"processing":proc,"normalizedMetrics":m,"checks":gates,"allHardGatesPass":all(gates.values())}
        rows.append((ident,spec,cand))
    make_contact(rows,ROOT/"contact/upright_fist_pilot_compare.png")
    make_closeups(rows,ROOT/"contact/upright_fist_pilot_fist_closeups_4x.png")
    qa["checks"]={"frames2of2":all(v["allHardGatesPass"] for v in qa["frames"].values()),"noRuntimeWrites":True,"generationCredits":0,"visualReview":"pending_Leo","specGate":"pending_pm_scan"}
    (ROOT/"qa/upright_fist_pilot.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2)+"\n")
    manifest={"task":"T45","revision":"upright-fist-pilot-v1","generatedAt":"2026-09-08","trialOnly":True,"scope":"shanzei_a|b × atk_right_2 (right)","decision":"A: all 24 NPC attack body frames eventually use upright closed punching fist; this is the 2-frame pilot","generation":{"provider":"Codex native ImageGen","model":None,"credits":0,"rawImageGeneration":True},"processing":{"cutout":"project flood_cut + feather","normalize":"240x320 RGBA, visualHeight=256, feetY=300, alpha32 centroid x≈120"},"visualReview":"pending_Leo","specGate":"pending_pm_scan","integrationGate":"not_handed_off","runtimeRelease":False,"formalRuntimeTouched":False,"artifactPaths":[]}
    manifest["artifactPaths"]=[str(p.relative_to(REPO)) for p in sorted(ROOT.rglob("*")) if p.is_file() and p.name!="manifest.json"]
    (ROOT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"frames":2,"allHardGatesPass":qa["checks"]["frames2of2"],"contact":"contact/upright_fist_pilot_compare.png"},ensure_ascii=False))
if __name__=="__main__": main()
