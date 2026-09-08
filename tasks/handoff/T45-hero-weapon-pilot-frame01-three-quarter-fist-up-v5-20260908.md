# T45 主角武器首帧 · 3/4 拳高上移纠正 v5 交接

## 纠正原因

Leo 要求角色和剑的角度保持不变，将剑再向上提 `3/4` 拳头高度。v4 标记为 `superseded`；本版只做整层整数上移。

## 当前候选

- 身体：`assets/characters/hero/battle45/battle_idle_right.png`，角色与拳头像素冻结。
- 紧拳高度：遮罩 bbox `y=193..218`，高度 `26px`；`3/4 × 26 = 19.5px`，按像素取整为 `20px`。
- 独立剑层：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/normalized/hero_sword_held_rightup_v5.png`。
- 握点：由 v4 `(100,205)` 上移 `20px` 到 `(100,185)`；x 不变。
- 角度：继续 `-40°`，定义为握点→剑尖，`0°=screen-right`、`+Y down`、顺时针为正；剑尖向右上。
- 变换：逐像素继承 v4 剑层，整数平移 `(0,-20)`，不旋转、不重绘；v4→v5 精确平移核验 `mismatch=0`。
- 层级：`layerOrder=front`（right 向）；遮挡仍只使用原身体 alpha 紧拳 ROI。

## 机器门

`qa/pilot_v5.json`：`allMachineChecksPass=true`。

- 身体 `240×320 RGBA`、脚底 `y=300`、四边透明，SHA 冻结。
- 剑层 `240×320 RGBA`，alpha `[0,255]`，单连通主体，轴向长度 `115.4977px`（剑类 `110–140` 带内）。
- 握点 `(100,185)`、`-40°` 角度与角色右手/画面左侧拳语义记录齐全。
- 紧拳遮挡后拳内武器残留 `0`（`28→0`），武器 alpha `797→769`。
- native/2× 对照尺寸通过；`runtimeUntouched=true`；`generationCreditsZero=true`。

## 状态与消费边界

`artifactStage=candidate`、`visualReview=unreviewed`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。v4 与根 manifest/job 已按链路标记 superseded；本 v5 等待 Leo 视觉门和 PM 第二道规格门，通过前不写入正式路径。

## 活动文件 SHA-256

```text
5e1890c806f841a90befa5ed5c6da850395b2ab8db4dab005f8545c70257c2c7  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/manifest.json
555913ca52089295d70a78bd0d86eae7ddec9de0a6ee6aac7e6e6c8298b9144d  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/job.json
a0cba6e24d8458deed6516bf57a4e81c62e018b2e47ec9ebb7a1aadb05929acf  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/manifest.json
75e6de8b97d314c8e4fcf589dfc54e512b8f994e81c8bf924143fa3e02cb043e  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/job.json
d0d4e833fa348df14bf0010fbf281eac2405f1669fb68447df3c8c03563413de  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/build_pilot_v5.py
76275db1cf090b563db246ccc6b4520304b8db417f10f11d6c4e8ba25d558cd2  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/calibration/frame01_idle_right_v5.json
9098495cfe51dc2634ba170e4490c9fc0ae3c7e6184e88c8adc01ed8fee78ebb  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/composites_2x/hero_idle_right_sword_triptych_v5_2x.png
e15cffbbb1006e6750b37aa5ba894d32b34df2fe52fc0ef7dfb8a30a834e4f23  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/composites_native/hero_idle_right_sword_triptych_v5.png
f387badbdd18208fe6e6f37825ede158bd651ba84df45784e55ddb1cc1de0611  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/contact/hero_idle_right_sword_pilot_v5.png
41b61bb61fb2a17d1368bbe3c8f183e71d16b8b4d73228bcf440f0b71aa5539b  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/contact/hero_idle_right_sword_pilot_v5_2x.png
928292da3e036d4e649e42d3ccabdc9a0d30d769d24d0f6c8cff0c277aff47c1  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/job.json
02a919c22cf29069e9dc73662f94bfbc5a20661ee5ecbc6109595a025ad5fbc9  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/manifest.json
f58f3eef42f24d2ce00748645f2b097bc4924cc10c5c9d64e032dc25ca0a1a29  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/normalized/hero_sword_held_rightup_v5.png
6291bfd584bd8d4c3e915bf0b8a5a0548e5d368222e5d607e461070ab22b5c87  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/occlusion_masks/hero_idle_right_character_right_fist.png
d579967f2ef6851f40e65f0878abc69b27287f7de81c4d8c19bf4bf29e76f1ed  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/qa/pilot_v5.json
853bee2393fa263bbb46710d6bc10b4fa0a6065b68d7797f049b68585243bf7e  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/raw/hero_sword_held_transparent_source_attempt1.png
b5b744597d730236e7eeb1b2aca503e64f242a5461345f81e4d6b89dba4aae3c  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/refs/user_fist_center_sword_reference.png
d90e9f6337e8f6e510423576f332123923e58ddbbbd6eee0f6bd4d1676f24d38  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/refs.json
f0a4fd4edac55dccdd38ed487b4e19a09181c98d65bbe0cd65262cbb681f4032  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v5/request.md
```

活动文件共 19 项；artifact commit=`2c818f2da9329d1e142ba530f7773aec2802c406`，已推送 `origin/codex/t45-shanzei-2b-pilot`。`check_delivery.py` 对 19/19 活动路径逐文件 SHA 核验 PASS；该检查不替代 Leo 审美定稿、PM 规格门或研发接线验收。
