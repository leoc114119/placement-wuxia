# T45 主角武器合成 · frame03 walk_right_2 水平剑候选 v1 交接

## 当前状态

- artifactStage=candidate
- visualReview=pending_Leo
- specGate=pending_pm_scan（PM 第二道门按 Leo 授权延后至全部动作帧确定后统一处理）
- integrationGate=not_handed_off
- runtimeRelease=false
- 仅处理主角右系 `walk_right_2` frame03；不改身体、不写正式 runtime。

## 本次唯一改动

frame02 的水平剑 v2 已获 Leo 目验通过；本帧只将已接受的水平剑层按下一帧拳心平移到 `walk_right_2`。保持水平 `0°`、前景层级、剑身几何与当前接受的清晰度/模糊度；不重新旋转、不生成新图。

- 身体冻结：`assets/characters/hero/battle45/walk_right_2.png`。
- 武器源冻结：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/normalized/hero_sword_held_horizontal_walk_right_1_v2.png`。
- 角色自身右手投影为画面左侧拳；下一帧皮肤核心质心 `(101.5363,203.7542)`，拳心取 `(102,204)`。
- 以 frame02 已接受柄中心 `(83.5737,206.5878)` 为基准平移 `(+18,-3)`，得到本帧柄中心 `(101.5737,203.5878)`，距拳心 `0.586px`。
- 握点目标约 `(116.4897,203.5878)`；剑轴保持 `0°` 水平，`layerOrder=front`。
- Pillow 整数 RGBA 平移；零生图、credits=0、无身体改动、runtime 未写入。

## 机械门

`qa/pilot_walk_right_2_v1.json` 的 `checks.allMachineChecksPass=True`。

- 240×320 RGBA、真实 alpha、边界透明、脚底 y=300、武器单连通。
- 轴向长度 116px，落在剑类 110~140px 带内；目标角度 0° 水平。
- 皮肤核心取值 179px，四舍五入到拳心 `(102,204)`；柄中心同样落入该拳心。
- 精确拳遮挡后武器残留 0；native / 2x 对照尺寸通过；零生成。

## 目测入口

- 三联 2×：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/contact/hero_walk_right_2_sword_pilot_2x.png`
- 拳心像素放大：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/contact/walk_right_2_fist_center_zoom.png`

## 研发消费边界

- candidate-only，仅交校准、武器层、遮挡引用与证据；不进入 `assets/characters/hero/battle45/` runtime。
- Leo 目验通过前不启动下一帧；若有缺陷只改本帧平移/局部遮挡参数，保持 frame02 已接受基线。
- PM 第二道规格门暂不阻塞动作帧继续确定，待全部动作帧定稿后统一送检。

## 活动路径 SHA-256

- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/calibration/frame03_walk_right_2_v1.json · SHA256 ca3d066caa7844881e20d7847eb52ee48f8d6dc61c8b56947cefdabd51b017ba
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/composites_2x/hero_walk_right_2_sword_triptych_2x.png · SHA256 cbb0c2cc9a65e3955a2bab0a3f2efc985569412dfc3c7eed5927ec26b2fb9a75
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/composites_native/hero_walk_right_2_sword_triptych.png · SHA256 9131403879ead68d3084abecdb25d1db7892774674264bf124ea69aa42a05d74
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/contact/hero_walk_right_2_sword_pilot.png · SHA256 89fce31b98f556bcd88365dcd551b7af5da6c2f52aa524d9b9f1a0bcee67625e
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/contact/hero_walk_right_2_sword_pilot_2x.png · SHA256 c57dd49c832952bb73eb18cfece90d35588e05ca812d30d1acf722e36f048233
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/contact/walk_right_2_fist_center_zoom.png · SHA256 bc8d4b63152c02f32e9c3cffd7f2f5c44fe296bf38a7389ef413ca3293e04b41
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/job.json · SHA256 81dd81ca3e18ec9758cde207936a74afef557d480c22155c7b48e2ad5811f748
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/manifest.json · SHA256 6eb9001a33c1029b50c796e23f130263aa6c4de3fad1d7d6fc22dc72fafb0563
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/normalized/hero_sword_held_horizontal_walk_right_2_v1.png · SHA256 e9332f9671badc6f0bc6436caddc212391162c8078eb25e74582f88c7801f434
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/occlusion_masks/hero_walk_right_2_character_right_fist.png · SHA256 20f268a866555c2c45f0c40b77f980dca24b14136ab3ad9fd39785d753404395
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/qa/pilot_walk_right_2_v1.json · SHA256 8cbfe3194b41961035a22dcc5636c4e9a6e7cdbb8ed29316067b63af65cc01a9
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/raw/hero_sword_held_horizontal_source_v2.png · SHA256 e4daf035adf788de89c44fadde74ba4cf337b3b7373d8bb001f465b0470bb1d4
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/refs.json · SHA256 c62e8feda6b58c92ed2280a3618c002462fa063e2b6be0f034799202e75711b8
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/request.md · SHA256 443ed2b8df83ffb2e273821a5fe0c3a08ffe3569aaa83878e2c22bb153ac3a69

## 运输证据

- artifact commit：`ea7c46ff8c21e7f1dc11a746b4a3cdd9b76d8383`。
- check_delivery.py：19/19 PASS（候选包、frame02 状态证据与生成脚本路径逐文件 SHA 核验）。
- docs/handoff commit：本文件随本次证据提交。
- projbus delivery：seq=207，messageId=`16154c79412f442a8df270106df13ea6`。
- runtimeRelease=false；Leo 目验待办；PM 第二道规格门按授权延后至全部动作帧确定后统一处理。
