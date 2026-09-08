# T45 主角武器首帧 · 红箭头方向纠正 v3 交接

## 纠正原因

Leo 复核 v2 后明确：用户附件中的红箭头就是剑尖方向，剑应从拳心指向右上。v2 虽已把握点移到角色自身右手（右向姿态的画面左侧拳），但仍使用 `60°` 向右下轴线，现标记为 `superseded`。身体帧、既有透明剑源层和正式 runtime 继续冻结。

## 当前候选

- 身体：`assets/characters/hero/battle45/battle_idle_right.png`；角色自身右手在该右向姿态中对应**画面左侧拳**。
- 独立剑层：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/normalized/hero_sword_held_rightup_v3.png`。
- 握点：身体画布 `(100,208)`，语义 `character_right_hand`，投影 `screen-left fist`。
- 角度：`-40°`，定义为握点→剑尖，`0°=screen-right`、`+Y down`、顺时针为正；剑尖朝右上，与 Leo 红箭头一致。
- 层级：`layerOrder=front`（right 向）。
- 变换：复用既有透明剑源层；从源层轴角 `46.3774266°` 确定性旋转 `-86.3774266°` 到 `-40°`，平移 `(-75,+13)` 到握点；无新生图，credits=0。
- 用户附件：`revisions/red-arrow-angle-v3/refs/user_fist_center_sword_reference.png`，只负责方向和握点语义核对，不描摹像素。
- 遮挡：仅使用原身体 alpha 在画面左侧紧拳 ROI 内的二值遮挡；不重绘手，不把袖口/躯干并入遮罩。

## 机器门

`qa/pilot_v3.json`：`allMachineChecksPass=true`。

- 身体 `240×320 RGBA`、脚底 `y=300`、四边透明，SHA 冻结。
- 剑层 `240×320 RGBA`，alpha `[0,255]`，单连通主体，轴向长度 `115.4977px`（剑类 `110–140` 带内）。
- 角色右手语义、画面左侧拳握点和 `-40°` 角度记录齐全。
- 紧拳遮挡后拳内武器残留 `0`（`216→0`），武器 alpha `797→581`。
- native/2× 对照尺寸通过；`runtimeUntouched=true`；`generationCreditsZero=true`。

## 状态与消费边界

`artifactStage=candidate`、`visualReview=unreviewed`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。本候选等待 Leo 视觉门和 PM 第二道规格门；两道门通过前不扩展下一帧、不写入正式路径。研发只消费 v3 的握点、角度、层级和遮挡引用。v1 与 v2 的 manifest/job 已显式标记由 v3 supersede。

## 活动文件 SHA-256

```text
3fc64ea13a0acef68edf527202480607ff1773208938fb809956b1805927ddeb  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/manifest.json
302ba9ae2699a6355c56a075dfa4e57fe836b20f9f8f35c00e5563b66ae9c6eb  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/job.json
1b8ca85b06875c4de411f7d5503103245f780f80f2f212ef988bd3880d6f3d4b  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-hand-angle-v2/manifest.json
32479c3eb3e1693c8fd42860976bcafd19008cdab453512ec1d350cb5c99d684  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-hand-angle-v2/job.json
a4bda0f221443ed2c1b3861427c2b3371fc08b3d0c632b68b105e7519f842c57  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/build_pilot_v3.py
f5bc350aa15bd3fee7bf05a78a65c64ef2c713a693ae05d36a3d00b583539efd  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/calibration/frame01_idle_right_v3.json
bfa40b56c88efa84a96631b5eef135573b4d0ae6547ad862c5b27d5d39cb222e  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/composites_2x/hero_idle_right_sword_triptych_v3_2x.png
2b902c257cb47f3259de1f4b55c95b481550150242979fc3e2bf115d26b29891  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/composites_native/hero_idle_right_sword_triptych_v3.png
fa3462e3b2f313c853ce96be6a88b4678d6ec0724724387c4680bb9d7f771f7b  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/contact/hero_idle_right_sword_pilot_v3.png
9b6855be454d5fae004c2b106889d981341dff0864e31e5f80bdc533786a3b12  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/contact/hero_idle_right_sword_pilot_v3_2x.png
fd6a880d723ab47358189972c4df5d51503fbcce825d95540748755dca22b669  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/job.json
fb81a3c74dc6b78f1dc3ba100733cd3804437da4028ca45d8a6d87e979532741  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/manifest.json
135f5e148e4534ee9a50cfe25bff9e8dfc196af5633cfcad6a46fcb1361ea811  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/normalized/hero_sword_held_rightup_v3.png
6291bfd584bd8d4c3e915bf0b8a5a0548e5d368222e5d607e461070ab22b5c87  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/occlusion_masks/hero_idle_right_character_right_fist.png
39257a29867a2caac78b7ca86a522a0c50d027ac6832cfbea264eda9fa840fc0  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/qa/pilot_v3.json
853bee2393fa263bbb46710d6bc10b4fa0a6065b68d7797f049b68585243bf7e  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/raw/hero_sword_held_transparent_source_attempt1.png
b5b744597d730236e7eeb1b2aca503e64f242a5461345f81e4d6b89dba4aae3c  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/refs/user_fist_center_sword_reference.png
5302b4e92b346d2e56f6d737ffa676a653a478f092d4d2d97da62c9f3ec33b28  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/refs.json
a0727d8f91bf96f146ae4c1ed70442248c038649da594332a3e5890e01268be6  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/red-arrow-angle-v3/request.md
```

活动文件共 19 项；artifact commit=`10a63463e051bfaffc09e0f9dd246d79a2266697`，已推送 `origin/codex/t45-shanzei-2b-pilot`。`check_delivery.py` 对 19/19 活动路径逐文件 SHA 核验 PASS；该检查只证明路径与字节，不替代 Leo 审美定稿、PM 规格门或研发接线验收。
