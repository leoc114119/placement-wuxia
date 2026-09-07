#!/usr/bin/env python3
"""Final deterministic gate and release for T45's shared die_common frame."""
from __future__ import annotations

import hashlib
import json
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

PACKAGE = Path(__file__).resolve().parents[1]
REPO = PACKAGE.parents[2]
CANDIDATE = PACKAGE / "normalized" / "die_common_bone_pose6_gag_white.png"
QA_PATH = PACKAGE / "qa" / "release_preflight.json"
MANIFEST_PATH = PACKAGE / "manifest.json"
RUNTIME_PATHS = [
    REPO / "assets/characters/hero/battle45/die_common.png",
    REPO / "assets/characters/enemy/shanzei_a/battle45/die_common.png",
    REPO / "assets/characters/enemy/shanzei_b/battle45/die_common.png",
]
HERO_TARGET = RUNTIME_PATHS[0]
HERO_BACKUP = HERO_TARGET.parent / "backup" / "die_common_pre_shared_20260907.png"


def measure(path: Path) -> dict:
    im = Image.open(path)
    if im.mode != "RGBA":
        raise AssertionError(f"{path}: mode={im.mode}, expected RGBA")
    if im.size != (240, 320):
        raise AssertionError(f"{path}: size={im.size}, expected 240x320")
    px = im.load()
    points = {(x, y) for y in range(im.height) for x in range(im.width) if px[x, y][3] > 32}
    if not points:
        raise AssertionError(f"{path}: no alpha>32 foreground")
    xs = [x for x, _ in points]
    ys = [y for _, y in points]
    bbox = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    remaining = set(points)
    components = 0
    while remaining:
        components += 1
        start = remaining.pop()
        stack = [start]
        while stack:
            x, y = stack.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    p = (x + dx, y + dy)
                    if p in remaining:
                        remaining.remove(p)
                        stack.append(p)
    border_nonzero = sum(1 for x in range(im.width) for y in (0, im.height - 1) if px[x, y][3] > 0)
    border_nonzero += sum(1 for y in range(im.height) for x in (0, im.width - 1) if px[x, y][3] > 0)
    alpha = im.getchannel("A").getextrema()
    return {
        "path": str(path.relative_to(REPO)),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "size": list(im.size),
        "mode": im.mode,
        "bboxT32": list(bbox),
        "visualWidth": bbox[2] - bbox[0],
        "visualHeight": bbox[3] - bbox[1],
        "feetY": bbox[3],
        "bboxCenterX": (bbox[0] + bbox[2]) / 2,
        "alpha32CentroidX": sum(xs) / len(xs),
        "alpha32CentroidY": sum(ys) / len(ys),
        "alphaExtrema": list(alpha),
        "components": components,
        "borderNonzero": border_nonzero,
    }


def assert_gate(m: dict) -> None:
    checks = {
        "canvas_240x320": m["size"] == [240, 320],
        "rgba": m["mode"] == "RGBA",
        "content_width_120_160": 120 <= m["visualWidth"] <= 160,
        "feet_y_300": m["feetY"] == 300,
        "bbox_center_x_120": m["bboxCenterX"] == 120,
        "single_connected_subject": m["components"] == 1,
        "alpha_extrema_0_255": m["alphaExtrema"] == [0, 255],
        "four_edges_transparent": m["borderNonzero"] == 0,
    }
    failed = [name for name, ok in checks.items() if not ok]
    if failed:
        raise AssertionError(f"{m['path']}: failed {failed}")
    m["hardGates"] = checks
    m["hardGatesPass"] = True


def update_json_files(sha: str, release_time: str, candidate_metrics: dict, runtime_metrics: list[dict]) -> None:
    qa = {
        "task": "T45",
        "batch": "shared-die-bone",
        "stage": "release_preflight",
        "artifactStage": "release",
        "visualReview": "selected_by_Leo",
        "specGate": "pass",
        "integrationGate": "not_handed_off",
        "runtimeRelease": True,
        "source": str(CANDIDATE.relative_to(REPO)),
        "sourceRaw": "assets/_trial_20260907/t45_shared_die_bone_codex_native/raw/die_common_bone_pose6_gag_white_attempt1.png",
        "userBase": "assets/_trial_20260907/t45_shared_die_bone_codex_native/raw/die_common_bone_gag_base_user.png",
        "processing": "deterministic normalization already recorded in qa/die_common_bone_pose6_gag_white.json; release copies are byte-identical",
        "semanticChecks": {
            "headDirection": "left",
            "pose": "diagonal back-lying splay preserved",
            "style": "friendly gag Q-version white skeleton; Leo visual review selected",
            "textOrUi": "none by visual review and source constraints",
            "mirrorPolicy": "shared byte-identical frame; no directional mirror",
        },
        "candidate": candidate_metrics,
        "runtimeCopies": runtime_metrics,
        "allHardGatesPass": True,
        "releasedAt": release_time,
        "sha256": sha,
    }
    QA_PATH.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manifest = {
        "task": "T45",
        "batch": "shared-die-bone",
        "assetRole": "all-character shared battle45 death frame",
        "identity": "all-characters-shared",
        "artifactStage": "release",
        "visualReview": "selected_by_Leo",
        "specGate": "pass",
        "integrationGate": "not_handed_off",
        "runtimeRelease": True,
        "sourceJob": "assets/_trial_20260907/t45_shared_die_bone_codex_native/job.json",
        "sourceRaw": "assets/_trial_20260907/t45_shared_die_bone_codex_native/raw/die_common_bone_pose6_gag_white_attempt1.png",
        "sourceCandidate": "assets/_trial_20260907/t45_shared_die_bone_codex_native/normalized/die_common_bone_pose6_gag_white.png",
        "qaEvidence": "assets/_trial_20260907/t45_shared_die_bone_codex_native/qa/release_preflight.json",
        "deterministicProcessing": "edge-connected neutral flood-cut, defringe, aspect-preserving width 150, bbox centered x=120 and bottom y=300; no redraw",
        "mirrorPolicy": "shared across all six directions and all characters; no mirror",
        "releasedAt": release_time,
        "frames": [{
            "name": "die_common.png",
            "runtimePaths": [m["path"] for m in runtime_metrics],
            "source": "assets/_trial_20260907/t45_shared_die_bone_codex_native/normalized/die_common_bone_pose6_gag_white.png",
            "sha256": sha,
            "size": candidate_metrics["size"],
            "mode": candidate_metrics["mode"],
            "bboxT32": candidate_metrics["bboxT32"],
            "visualWidth": candidate_metrics["visualWidth"],
            "visualHeight": candidate_metrics["visualHeight"],
            "feetY": candidate_metrics["feetY"],
            "bboxCenterX": candidate_metrics["bboxCenterX"],
            "components": candidate_metrics["components"],
            "alphaExtrema": candidate_metrics["alphaExtrema"],
            "borderNonzero": candidate_metrics["borderNonzero"],
            "visualReview": "selected_by_Leo",
            "specGate": "pass",
            "integrationGate": "not_handed_off",
        }],
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    job_path = PACKAGE / "job.json"
    job = json.loads(job_path.read_text(encoding="utf-8"))
    job.update({
        "status": "release_ready",
        "artifactStage": "release",
        "visualReview": "selected_by_Leo",
        "specGate": "pass",
        "integrationGate": "not_handed_off",
        "runtimeRelease": True,
        "continuationStatus": "released_shared_die_common_pose6_selected_by_Leo_spec_pass",
        "continuationFrame": "die_common",
        "releaseManifest": "manifest.json",
        "releaseQa": "qa/release_preflight.json",
        "releasedAt": release_time,
        "runtimePaths": [m["path"] for m in runtime_metrics],
        "releaseSha256": sha,
    })
    attempt6 = job.setdefault("attemptResults", {}).setdefault("attempt6", {})
    attempt6.update({"visualStatus": "selected_by_Leo", "mechanicalStatus": "PASS", "specGate": "pass", "runtimeRelease": True})
    for output in ["qa/release_preflight.py", "qa/release_preflight.json", "manifest.json", "assets/characters/hero/battle45/die_common.png", "assets/characters/enemy/shanzei_a/battle45/die_common.png", "assets/characters/enemy/shanzei_b/battle45/die_common.png"]:
        if output not in job.setdefault("outputs", []):
            job["outputs"].append(output)
    job_path.write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    refs_path = PACKAGE / "refs.json"
    refs = json.loads(refs_path.read_text(encoding="utf-8"))
    refs["activeGeneration"].update({"status": "selected_by_Leo_spec_pass", "visualReview": "selected_by_Leo", "specGate": "pass", "runtimeRelease": True})
    refs["generationCompleted"]["visualStatus"] = "selected_by_Leo"
    refs["release"] = {"manifest": "manifest.json", "qa": "qa/release_preflight.json", "sha256": sha, "runtimePaths": [m["path"] for m in runtime_metrics], "artifactStage": "release", "visualReview": "selected_by_Leo", "specGate": "pass", "integrationGate": "not_handed_off", "runtimeRelease": True, "releasedAt": release_time}
    refs_path.write_text(json.dumps(refs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Attach the same shared frame to each existing enemy battle manifest.
    for identity in ("shanzei_a", "shanzei_b"):
        path = REPO / f"assets/characters/enemy/{identity}/battle45/manifest.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data["sharedDieCommon"] = {
            "name": "die_common.png",
            "path": f"assets/characters/enemy/{identity}/battle45/die_common.png",
            "source": "assets/_trial_20260907/t45_shared_die_bone_codex_native/normalized/die_common_bone_pose6_gag_white.png",
            "sha256": sha,
            "size": candidate_metrics["size"],
            "mode": candidate_metrics["mode"],
            "bboxT32": candidate_metrics["bboxT32"],
            "visualWidth": candidate_metrics["visualWidth"],
            "visualHeight": candidate_metrics["visualHeight"],
            "feetY": candidate_metrics["feetY"],
            "bboxCenterX": candidate_metrics["bboxCenterX"],
            "components": candidate_metrics["components"],
            "alphaExtrema": candidate_metrics["alphaExtrema"],
            "borderNonzero": candidate_metrics["borderNonzero"],
            "reuse": "all-character shared Q-version skeleton death frame",
            "mirrorPolicy": "no mirror; one shared frame for six directions",
            "visualReview": "selected_by_Leo",
            "specGate": "pass",
            "integrationGate": "not_handed_off",
        }
        data["sourceJob"] = "assets/_trial_20260907/t45_shared_die_bone_codex_native/job.json"
        data["sharedDieSource"] = "assets/_trial_20260907/t45_shared_die_bone_codex_native/manifest.json"
        data["releasedAt"] = release_time
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if not CANDIDATE.exists():
        raise SystemExit(f"missing candidate: {CANDIDATE}")
    candidate = measure(CANDIDATE)
    assert_gate(candidate)
    candidate_bytes = CANDIDATE.read_bytes()
    current_hero_bytes = HERO_TARGET.read_bytes()
    if not HERO_BACKUP.exists():
        HERO_BACKUP.parent.mkdir(parents=True, exist_ok=True)
        HERO_BACKUP.write_bytes(current_hero_bytes)
    elif current_hero_bytes != candidate_bytes and HERO_BACKUP.read_bytes() != current_hero_bytes:
        raise AssertionError(f"backup exists but does not match current pre-release hero frame: {HERO_BACKUP}")
    for path in RUNTIME_PATHS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(CANDIDATE.read_bytes())
    runtime = []
    for path in RUNTIME_PATHS:
        m = measure(path)
        assert_gate(m)
        if m["sha256"] != candidate["sha256"]:
            raise AssertionError(f"{path}: runtime SHA differs from candidate")
        runtime.append(m)
    release_time = datetime.now(timezone.utc).astimezone().isoformat()
    update_json_files(candidate["sha256"], release_time, candidate, runtime)
    print(json.dumps({"candidate": candidate, "runtimeCopies": runtime, "backup": str(HERO_BACKUP.relative_to(REPO)), "allHardGatesPass": True}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
