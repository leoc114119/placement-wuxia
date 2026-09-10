from __future__ import annotations

from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw

ROOT = Path(__file__).parent


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_info(path: Path):
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    return {
        "size": list(image.size),
        "alphaExtrema": list(alpha.getextrema()),
        "alphaBBox": list(alpha.getbbox()) if alpha.getbbox() else None,
        "sha256": sha(path),
    }


def fit(image: Image.Image, size=(240, 320)):
    image = image.convert("RGBA")
    image.thumbnail((size[0] - 16, size[1] - 28), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (45, 45, 45, 255))
    canvas.alpha_composite(image, ((size[0] - image.width) // 2, 8))
    return canvas


def main():
    base = ROOT / "chain/idle_right.png"
    parallel = [
        Path("assets/_trial_20260910/t45_v2_right_batch_seq328/normalized/walk_right_1.png"),
        Path("assets/_trial_20260910/t45_v2_right_batch_seq328/normalized/walk_right_2.png"),
        Path("assets/_trial_20260910/t45_v2_right_batch_seq328/normalized/walk_right_3.png"),
    ]
    chain_attempts = [ROOT / "raw/walk_right_1_chain.png", ROOT / "raw/walk_right_1_chain_attempt2.png"]
    qa = {
        "task": "T45",
        "seq": "336",
        "stage": "chain_edit_verification",
        "chainDefinition": "idle_right -> walk_right_1 -> walk_right_2 -> walk_right_3",
        "costCapPoints": 6,
        "costUsedPoints": 4,
        "base": {"path": str(base), **alpha_info(base)},
        "steps": [
            {
                "step": 1,
                "target": "walk_right_1",
                "attempts": [
                    {
                        "attempt": 1,
                        "mode": "edit",
                        "inputMechanism": "num_last_images_to_include=1",
                        "referencedImagePaths": [],
                        "visibleInputPath": str(base),
                        "visibleInputSha256": sha(base),
                        "promptPath": "prompts/walk_right_1_edit.txt",
                        "outputPath": "raw/walk_right_1_chain.png",
                        "fileGate": "FAIL: alphaExtrema=[255,255], checkerboard baked into opaque canvas",
                        **alpha_info(ROOT / "raw/walk_right_1_chain.png"),
                    },
                    {
                        "attempt": 2,
                        "mode": "edit",
                        "inputMechanism": "num_last_images_to_include=1",
                        "referencedImagePaths": [],
                        "visibleInputPath": str(base),
                        "visibleInputSha256": sha(base),
                        "promptPath": "prompts/walk_right_1_edit_attempt2.txt",
                        "outputPath": "raw/walk_right_1_chain_attempt2.png",
                        "fileGate": "FAIL: alphaExtrema=[255,255], checkerboard baked into opaque canvas",
                        **alpha_info(ROOT / "raw/walk_right_1_chain_attempt2.png"),
                    },
                ],
                "status": "closed_after_two_attempts",
            }
        ],
        "chainAuthenticity": {
            "step1VisibleInputWasPreviousProduct": True,
            "step1VisibleInputPath": str(base),
            "step1ReferenceCount": 1,
            "step2": "not_run",
            "step3": "not_run",
        },
        "probe": {
            "criterion": "four-frame crown width + face width range <=5%",
            "status": "not_run_due_step1_file_failure",
            "conclusion": "chain_edit_route_not_validated; close verification without step2/step3",
        },
        "parallelBaseline": [str(p) for p in parallel],
        "runtimeTouched": False,
        "formalAssetsTouched": False,
    }
    contact_items = [("BASE_IDLE", base)] + [(f"PARALLEL_{i+1}", p) for i, p in enumerate(parallel)] + [("CHAIN_FAIL_1", chain_attempts[0]), ("CHAIN_FAIL_2", chain_attempts[1])]
    contact = Image.new("RGBA", (len(contact_items) * 240, 360), (45, 45, 45, 255))
    draw = ImageDraw.Draw(contact)
    for i, (label, path) in enumerate(contact_items):
        contact.alpha_composite(fit(Image.open(path)), (i * 240, 0))
        draw.text((i * 240 + 4, 338), label, fill=(245, 245, 245, 255))
    contact_path = ROOT / "contact/chain_vs_parallel.png"
    contact.save(contact_path)
    qa["contact"] = str(contact_path)
    (ROOT / "qa/chain_probe.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": qa["probe"]["status"], "contact": str(contact_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
