# T45 主角武器合成 · frame02 `walk_right_1` v1 逐帧候选交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=pending_Leo`
- `specGate=pending_pm_scan`（Leo 已授权：全部动作帧确定后统一做第二道规格门）
- `integrationGate=not_handed_off`
- `runtimeRelease=false`
- 只处理主角右系 `walk_right_1`；不扩展下一帧；正式 runtime 未改。

## 本帧范围与冻结项

- 身体：`assets/characters/hero/battle45/walk_right_1.png`，空手身体字节冻结。
- 武器源：Leo 已目验通过的 frame01 v9 透明剑层 `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/normalized/hero_sword_held_rightup_v9.png`。
- 角色自身右手在该右向帧投影为画面左侧拳；橙色皮肤核心全像素质心 `(83.9535,206.6744)`，取整拳心 `(84,207)`。
- 保留 frame01 v9 剑身像素、`-40°` 右上轴线、`layerOrder=front`；只沿画布整数像素平移 `(-18,+1)`。
- v9 柄中心 `(101.5737,205.5878)` → 目标 `(83.5737,206.5878)`，距拳心 `0.593px`；握点 `(113,196)` → `(95,197)`。
- 遮挡只取本帧原身体 alpha 的紧角色右拳 ROI，不画替代手；D 对照用于技术核验，不是 runtime 素材。
- 零生图、零旋转、零重采样，`generationCredits=0`。

## 机械门

`qa/pilot_walk_right_1_v1.json` 的 `checks.allMachineChecksPass=true`。

- 240×320 RGBA、真实 alpha、边界透明、脚底 y=300。
- 武器单连通；轴向长度 `115.4977px`，落在剑类 110~140px 带内；握径/刃长沿用 frame01 v9 通过件。
- 紧拳遮挡后拳区武器残留 `0`；柄中心目标像素命中，柄心到拳心 `0.593px`。
- native / 2x 对照尺寸通过；身体与武器源 SHA 冻结；runtime 未写入。

## 目测入口

- 三联（2×）：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/contact/hero_walk_right_1_sword_pilot_v1_2x.png`
- 拳心像素放大：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/contact/walk_right_1_fist_center_zoom_v1.png`
- D 面板展示原身体拳形作为遮挡职责核验；Full 面板供 Leo 判断持握关系与动作读法。

## 研发消费边界

- 本包是 candidate-only，仅交逐帧校准、武器层、遮挡引用与证据；不进入 `assets/characters/hero/battle45/` runtime。
- PM 第二道规格门暂不阻塞后续动作帧生产，按 Leo 当前安排待动作帧全部确定后统一送检。
- 本帧视觉未过前不启动 `walk_right_2`；若 Leo 指出缺陷，只做该帧单点修订并保留 v1 对照。

## 活动路径 SHA-256

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/build_frame02.py` · SHA256 `c8728945164cafab5ef8923731ce323455324270f59339abc857b4b64640d544`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/calibration/frame02_walk_right_1_v1.json` · SHA256 `8707f1648951c233eb39ba033ae7c99bcf612c4d406bc6fd1be3d7b9ec9b7575`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/composites_2x/hero_walk_right_1_sword_triptych_v1_2x.png` · SHA256 `94cc9007cec69300fb67099e30ffe538bade8a56068a3ebc3d55fab21ddbcc6e`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/composites_native/hero_walk_right_1_sword_triptych_v1.png` · SHA256 `f475312f75115335cd682b2e181efa8d409cc1981928d48976d84195a5c95714`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/contact/hero_walk_right_1_sword_pilot_v1.png` · SHA256 `ed6a827d89cc02cc60a7f9b1dbfcbbea873140ec411086a174b9035ea348ea18`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/contact/hero_walk_right_1_sword_pilot_v1_2x.png` · SHA256 `c13ea21a030dbcf99ab5da68dbad87bb2a877862ddcb235e4829084f68f897fd`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/contact/walk_right_1_fist_center_zoom_v1.png` · SHA256 `774e060faa22582c825c85e91f8086c611c7a5380e7ccbaaf35c83f3b4a6247a`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/job.json` · SHA256 `e035bb3a96a13c3d613ae6ab986d3b276e044034164391531a1b4d60f7c70ca6`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/manifest.json` · SHA256 `249c828adc045515e33e9961609e964928380d973cc444b43e59f705a34bce0b`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/normalized/hero_sword_held_rightup_walk_right_1_v1.png` · SHA256 `8e412206f0e55af9295267fef6a72b3bbc7c3864556087100f335e6cb072ee78`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/occlusion_masks/hero_walk_right_1_character_right_fist.png` · SHA256 `f13d411c43ee95a7b0666ec6e93bf16853c225815a00b6360f27a9949270c1a1`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/qa/pilot_walk_right_1_v1.json` · SHA256 `f03dd350b42a1b0d5d565baa53178869d13d118b3c62affab8613e62090e8a52`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/raw/hero_sword_held_transparent_source_attempt1.png` · SHA256 `853bee2393fa263bbb46710d6bc10b4fa0a6065b68d7797f049b68585243bf7e`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/refs.json` · SHA256 `00bf60a5f1b785ef4eb90ff3a3d14c5d2d88ecd75fda2d763293c9d3b3c87df1`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/request.md` · SHA256 `c861727348ff9a7aa9f76c1c4848f45c22942a4b7cc68c2d07c2fa5f5e35149a`
