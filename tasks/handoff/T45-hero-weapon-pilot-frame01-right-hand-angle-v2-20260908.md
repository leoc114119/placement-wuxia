# T45 主角武器首帧 · 右手与角度纠正 v2 交接

## 纠正原因

Leo 指出上一版首帧的两个可见问题：剑接在画面右侧拳（角色左手），且剑轴角度过平。本版将 v1 标记为 `superseded`，只修手位与剑轴，身体帧和正式 runtime 字节冻结。

## 当前候选

- 身体：`assets/characters/hero/battle45/battle_idle_right.png`，角色自身右手在该右向姿态中对应**画面左侧拳**。
- 独立剑层：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-hand-angle-v2/normalized/hero_sword_held_rightdown_v2.png`。
- 握点：身体画布 `(100,208)`，语义 `character_right_hand`，投影 `screen-left fist`。
- 角度：`60°`，定义为握点→剑尖，`0°=screen-right`、`+Y down`、顺时针为正；剑尖朝右下，采用现行“垂向右下”战备口径。
- 层级：`layerOrder=front`（right 向）。
- 剑件：复用 v1 已生成的透明剑层，确定性旋转 `+13.622573°` 并平移 `(-75,+13)`；本版无新生图，credits=0。
- 遮挡：仅使用原身体 alpha 在画面左侧紧拳 ROI 内的二值遮挡；不重绘手，不把袖口/躯干并入遮罩。

## 机器门

`qa/pilot_v2.json`：`allMachineChecksPass=true`。

- 身体 240×320 RGBA、脚底 y=300、四边透明，SHA 冻结。
- 剑层 240×320 RGBA，alpha `[0,255]`，单连通主体，轴向长度 `121.5666px`（剑类 110–140 带内）。
- 角色右手语义与画面左侧拳握点记录齐全；角度=60°。
- 紧拳遮挡后拳内武器残留 0；native/2x 对照尺寸通过。
- 正式 runtime 未写入，状态仍为 `candidate-only`。

## 文件

- `revisions/right-hand-angle-v2/build_pilot_v2.py`
- `revisions/right-hand-angle-v2/normalized/hero_sword_held_rightdown_v2.png`
- `revisions/right-hand-angle-v2/calibration/frame01_idle_right_v2.json`
- `revisions/right-hand-angle-v2/occlusion_masks/hero_idle_right_character_right_fist.png`
- `revisions/right-hand-angle-v2/composites_native/hero_idle_right_sword_triptych_v2.png`
- `revisions/right-hand-angle-v2/composites_2x/hero_idle_right_sword_triptych_v2_2x.png`
- `revisions/right-hand-angle-v2/contact/hero_idle_right_sword_pilot_v2.png`
- `revisions/right-hand-angle-v2/contact/hero_idle_right_sword_pilot_v2_2x.png`
- `revisions/right-hand-angle-v2/qa/pilot_v2.json`
- `revisions/right-hand-angle-v2/manifest.json`
- `revisions/right-hand-angle-v2/job.json`
- `revisions/right-hand-angle-v2/request.md`
- `revisions/right-hand-angle-v2/refs.json`
- `revisions/right-hand-angle-v2/refs/user_fist_center_sword_reference.png`（Leo 提供的握拳中心/剑轴视觉参照，仅作 placement 参考）

## 门状态与消费边界

`artifactStage=candidate`、`visualReview=unreviewed`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。Leo 视觉确认与 PM 规格门通过前，不扩展下一帧、不写入正式路径；研发仅消费 v2 的握点、角度、层级和遮挡引用。
