# T45 主角武器首帧 · 拳心上移纠正 v4 交接

## 纠正原因

Leo 指出剑的位置需要上移，确保准备位的剑柄对齐拳头中心。v3 的角色右手/画面左侧拳与 `-40°` 向右上方向保持不变；本版只做整层垂直上移。

## 当前候选

- 身体：`assets/characters/hero/battle45/battle_idle_right.png`，身体字节冻结；紧拳 ROI 的 alpha 质心约 `(101.37,204.77)`。
- 独立剑层：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/normalized/hero_sword_held_rightup_v4.png`。
- 握点：由 v3 `(100,208)` 上移到 `(100,205)`；保留 x，y 上移 `3px`，对齐拳心 y。
- 角度：继续 `-40°`，定义为握点→剑尖，`0°=screen-right`、`+Y down`、顺时针为正；剑尖向右上。
- 变换：逐像素继承 v3 剑层，整数平移 `(0,-3)`，不旋转、不重绘；与 v3 对比 `exact_up3_mismatch=0`。
- 层级：`layerOrder=front`（right 向）。
- 遮挡：仍只使用原身体 alpha 的紧拳 ROI，不重绘手、不并入袖口/躯干。

## 机器门

`qa/pilot_v4.json`：`allMachineChecksPass=true`。

- 身体 `240×320 RGBA`、脚底 `y=300`、四边透明，SHA 冻结。
- 剑层 `240×320 RGBA`，alpha `[0,255]`，单连通主体，轴向长度 `115.4977px`（剑类 `110–140` 带内）。
- 握点 `(100,205)`、角色右手/画面左侧拳语义、`-40°` 方向记录齐全。
- 紧拳遮挡后拳内武器残留 `0`（`215→0`），武器 alpha `797→582`。
- native/2× 对照尺寸通过；`runtimeUntouched=true`；`generationCreditsZero=true`。

## 状态与消费边界

`artifactStage=candidate`、`visualReview=unreviewed`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。v3、v2 及根 manifest/job 已按链路标记 superseded；本 v4 等待 Leo 视觉门和 PM 第二道规格门，通过前不扩展下一帧、不写入正式路径。

## 活动文件 SHA-256

```text
bd82ff65180995024c50558b6b2105ebead0ac70f3df440348c72da7ab9aff79  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/manifest.json
7172c525b96b9727edc406ac7c7b16dcc6b057d667973b71b1632cd8f7f15dc6  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/job.json
52574447051bf2579f6e9ea91c7e69943ab56584b311ecd2cc083a7dbf0f5683  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/manifest.json
dc46d157ae40652f1596d7ac031d60753e5246edc19c9d87b015de49f524d661  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/job.json
89c9877605be421560f363e7e337ed00da0f91af8872a261cd6d8c2caa39f7c0  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/build_pilot_v4.py
3d91ef7a623948c03285f721024c73c8748e1622ad9bb812339cf182f7a3244a  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/calibration/frame01_idle_right_v4.json
9d2ac48ac6aa9bf44e3ca89f28481c23b1e7e9c77d2776d96cf283134a2c72d0  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/composites_2x/hero_idle_right_sword_triptych_v4_2x.png
2dd9b91658206ccc86704286f5a73cbc0d8546ff7cce576dfc4215bdf32f976b  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/composites_native/hero_idle_right_sword_triptych_v4.png
51214ceb4d2f58963786063e8bb414b0d498eeff42752f9917b17b7516270f94  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/contact/hero_idle_right_sword_pilot_v4.png
9d2480b96392bc4d7be5582480c5e722c91f3830df2e29127be356704d65704a  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/contact/hero_idle_right_sword_pilot_v4_2x.png
0b0a6cb5cf9e0c10105e6a69932635b48dba3c941121750a2a0776e73a198a84  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/job.json
dcc618a98334b002e7ff739ecdd57a2e80c5c05a9e64e5b821238309704139a4  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/manifest.json
83206e70bc3b474b5b49a40ff7e2cf5648e5a7ddbdbad99aafd9921b2685e368  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/normalized/hero_sword_held_rightup_v4.png
6291bfd584bd8d4c3e915bf0b8a5a0548e5d368222e5d607e461070ab22b5c87  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/occlusion_masks/hero_idle_right_character_right_fist.png
bc752a91f9a97edc2777a7057b784e1df0d7b69720c5fd18763350c8ad1c3298  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/qa/pilot_v4.json
853bee2393fa263bbb46710d6bc10b4fa0a6065b68d7797f049b68585243bf7e  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/raw/hero_sword_held_transparent_source_attempt1.png
b5b744597d730236e7eeb1b2aca503e64f242a5461345f81e4d6b89dba4aae3c  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/refs/user_fist_center_sword_reference.png
6cbc99c567d9817f8b75c87fea08b300093ee7bfca684aebf8bf89a99c006d00  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/refs.json
c5880aacb01c328a950fc8b877a3b1386e32723c4ab9ab19f2b35fe4ab150b91  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-up-v4/request.md
```

活动文件共 19 项；artifact commit=`47c77eca407a8bc6e284d17862fd604fc61a8267`，已推送 `origin/codex/t45-shanzei-2b-pilot`。`check_delivery.py` 对 19/19 活动路径逐文件 SHA 核验 PASS；该检查不替代 Leo 审美定稿、PM 规格门或研发接线验收。
