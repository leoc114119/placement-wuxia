# T45 主角武器首帧 · 半剑柄右上位移、拳心对柄心修正版 v9 交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=selected_by_Leo`
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`
- Leo 已目测通过（“好，可以了，目测通过”）；v8 保留作对照证据并标记为 superseded；本 v9 送 PM 第二道规格门。

## 本次修正

Leo 要求保持当前剑角度，把剑“往右上拉半个剑柄的位置”，使拳头中心正对剑柄中心。v9 以 v8 透明剑层为唯一源，角色身体、剑身形状与 `-40°` 右上轴线冻结，只做沿剑轴的确定性整数平移。

- 身体冻结：`assets/characters/hero/battle45/battle_idle_right.png`
- 身体 SHA：`713095264eead7e19fc6a0bded89af98b3b29fba68d5ad945a29820f0f5ec498`
- 武器源：v8 `normalized/hero_sword_held_rightup_v8.png`，SHA `b413978ccaff1e22cd0bd02188203d3cb6b27be5d215e2a37702c899c8f2b72c`
- 目标武器层：`normalized/hero_sword_held_rightup_v9.png`，SHA `9d6d593e664f40f91baf26968d5c9c2d24280e38dd54bf3007fc09c56fb4258d`
- 既有剑轴：`-40°` 向右上；实测柄轴向跨度 `29.832px`，取半柄 `14.916px`
- 沿轴取最近整数位移：`(+11,-10)px`
- v8 握点 `(102,206)` → v9 握点 `(113,196)`；柄中心由 `(90.5737,215.5878)` → `(101.5737,205.5878)`，距冻结拳心 `(102,206)` 为 `0.593px`
- 目标柄中心像素四舍五入落在拳心 `(102,206)`；刀柄中心在拳心处可见
- 不旋转、不重绘、不重新生图；`generationCredits=0`；`layerOrder=front`
- 拳部遮挡仍只使用原身体 alpha 的紧角色右拳 ROI，不绘制替代手

## 机械核验

`qa/pilot_v9.json`：`allMachineChecksPass=true`。

- 240×320 RGBA、真实 alpha、单主体连通、边界透明、脚底 y=300
- 皮肤核心四舍五入命中 `(102,206)`
- 源/目标柄中心像素通过；柄中心到拳心距离 `0.593px`（≤1px）
- `-40°` 轴保持不变，轴向长度 `115.4977px`（110~140px 带内）
- 拳区武器遮挡后残留 `0`
- native/2x 对照尺寸通过
- `runtimeUntouched=true`、`runtimeRelease=false`

## 目测证据

- 全图三联对照：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/contact/hero_idle_right_sword_pilot_v9_2x.png`
- 拳心像素放大（12× 最近邻网格，红十字为 `(102,206)`）：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/contact/fist_center_zoom_v9.png`

## 活动路径

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/build_pilot_v9.py`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/request.md`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/refs.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/raw/hero_sword_held_transparent_source_attempt1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/normalized/hero_sword_held_rightup_v9.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/calibration/frame01_idle_right_v9.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/occlusion_masks/hero_idle_right_character_right_fist.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/composites_native/hero_idle_right_sword_triptych_v9.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/composites_2x/hero_idle_right_sword_triptych_v9_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/contact/hero_idle_right_sword_pilot_v9.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/contact/hero_idle_right_sword_pilot_v9_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/contact/fist_center_zoom_v9.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/qa/pilot_v9.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/manifest.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/job.json`

本包为 `candidate-only`，已完成 Leo 视觉门；提交并发送 PM 第二道规格门，正式 runtime 未改。

## 运输证据

- artifact+docs commit：`5707f2b8d8ed94e0cdeda4eb7803b1853b1e60b1`，已推送 `origin/codex/t45-shanzei-2b-pilot`
- `check_delivery.py`：52/52 activity paths PASS；该检查只证明 commit/path/bytes，不替代 PM 规格门
- projbus 最终送检：`seq=201`，messageId=`e860994328e94a5e86b83b41749cd9d4`
- 当前等待 PM2 第二道规格门 ACK；正式 runtime 仍未写入
