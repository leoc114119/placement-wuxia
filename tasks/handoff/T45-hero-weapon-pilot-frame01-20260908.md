# T45 主角武器合成首帧 pilot 交接

## 状态

- **范围**：只做主角 `battle_idle_right.png` 首帧；主角身体继续使用已冻结的空手帧。
- **artifactStage**：`candidate`
- **visualReview**：`unreviewed`，等待 Leo 目验
- **specGate**：`pending_pm_scan`，尚未进入研发线第二道规格门
- **integrationGate**：`not_handed_off`
- **runtime 落库**：`false`。本次未写 `assets/characters/hero/battle45/`，未改任何运行时代码或正式素材。

## 产物与来源

试产包：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/`

- `raw/hero_sword_held_checkerboard_rejected_attempt1.png`：原生首轮输出，棋盘格已烘焙进 RGB，保留为 rejected 证据，**不消费**。
- `raw/hero_sword_held_transparent_attempt1.png`：同一剑体的一次针对性透明背景编辑结果，RGBA alpha 极值 `[0,255]`。
- `normalized/hero_sword_held_rightdown.png`：240×320 独立手持剑层；不含人物、手或背景。
- `occlusion_masks/hero_idle_right_fist_roi.png`：主角画面右侧拳头紧 ROI 的原身体 alpha 遮挡数据。
- `composites_native/hero_idle_right_sword_triptych.png`：`FULL FRONT / D HAND OCCLUSION / BACK COMPARATOR` 三联图。
- `composites_2x/hero_idle_right_sword_triptych_2x.png`：同一三联图最近邻 2×放大核验图。
- `contact/hero_idle_right_sword_pilot.png`、`contact/hero_idle_right_sword_pilot_2x.png`：带标题与状态标注的目验图。
- `calibration/frame01_idle_right.json`：首帧握点、剑件 handle pivot、轴角、层级和遮挡引用。
- `qa/pilot.json`：机器门与源 SHA 证据。
- `manifest.json`、`job.json`、`request.md`、`refs.json`：状态、请求边界和参考职责。

## 冻结身体与标定数据

- 身体：`assets/characters/hero/battle45/battle_idle_right.png`
- 身体 SHA-256：`713095264eead7e19fc6a0bded89af98b3b29fba68d5ad945a29820f0f5ec498`
- 身体：240×320 RGBA，alpha `[0,255]`，视觉高 256px，脚底 y=300，四边透明。
- 握点（身体画布坐标）：`x=175, y=195`。主角画面右侧拳的实际皮肤组件约在 x=172..188；握点向画面左收 4px，避免 122px 剑尖触碰右边界。
- 剑层 handle pivot：`[24,21]`（剑层画布坐标）。
- 轴线：握点→剑尖，`angleDeg=46.3774`，约 46° 向右下；约定 `0°=screen-right, +Y down, clockwise-positive`。
- 层级：`layerOrder=front`（right 向）。D 面板只从剑 alpha 中扣除原拳 alpha，保持原拳为顶层，不重画手。
- 规格目标：总轴向长 `122px`（剑类 110–140）；柄/刃目标分别 25–35 / 85–105，握径留 PM 门复核。

## 机器门

`qa/pilot.json` 的 `checks.allMachineChecksPass=true`，具体包括：

- 身体 SHA/尺寸/alpha/脚底/边界冻结通过；
- 剑层真实 RGBA、单连通主体、尺寸和 110–140px 长度带通过；
- 握点、角度、layerOrder、遮挡引用齐全；
- D 遮挡后剑 alpha 从 805 降为 625，原拳 ROI 仍来自身体源；
- native/2×三联图尺寸通过；
- `runtimeUntouched=true`。

## 架构与停点

本 pilot 只验证 D 路线的“独立柄类武器 + 身体原拳局部遮挡”数据形态。剑体以当前原生方向保留，pilot 合成不再额外旋转（`renderRotationAppliedDeg=0`），角度字段记录该剑件握点→剑尖的测量轴线，后续 FE 采用 canonical weapon transform 时再由接线卡统一裁决，避免在美术候选阶段写入第二套旋转约定。

候选交给 Leo 做视觉判断；若通过，再由 PM 复核长度/握径/alpha/路径和 manifest，之后才允许扩展到其余 hero idle、walk、atk、cast 消费帧。jump 按已定口径豁免，die 不配锚。此交接不替代 Leo 目验、PM 规格门或研发接线。

## 活动文件 SHA-256

```text
f6aa51d674a828608a24210575d26bf8af88c619cba9b4f0e57a7a3fe6e1828d  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/calibration/frame01_idle_right.json
27ecd6bc4b07e486b4a3f0d6723cf7ce0b28ab5a730a3123568bc0f28914dfac  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/composites_2x/hero_idle_right_sword_triptych_2x.png
dff56bb0cd9f27ca12e75f994fd6384f93130be17afa26d7b4db050d1994febb  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/composites_native/hero_idle_right_sword_triptych.png
508cd00b20a83030467c96cae85bafde32b8249be908565f8403497141f0e042  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/contact/hero_idle_right_sword_pilot.png
41d3ce72293189cbd99a4f98280cec4c7c62dccbff35d445e1e9a30325422f4f  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/contact/hero_idle_right_sword_pilot_2x.png
f45bcfa5244183729899d5cf15c84b368f2170cfb7f8fe6865c6b509630f7732  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/job.json
08b3ada15db6108cd7754a7c75c698af1ab4288bafd987d8a057909d82757ab9  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/manifest.json
3e4524c1a0bac0d1abe56f8d7c7e53c35b191d110427da9d0377b47175e50208  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/normalized/hero_sword_held_rightdown.png
32216986ceff01808dfca8eb087389228f81090834311ed6eb76f122deda2710  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/occlusion_masks/hero_idle_right_fist_roi.png
f37481a4ace4ea11f4590d721004d47e1ebf661d29b8ed4a91df3f5566559fbb  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/prompts/hero_sword_held_cutout.txt
0f1f186b46f2a6817aa681a098abee0dc86e2efedf7c5f4372786c2af7249dc0  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/prompts/hero_sword_held_generate.txt
5194cc400dabec2cf1f2fcedae47735c0b3ff98ebef456fa32c198859592daf7  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/qa/pilot.json
678e272999b70ac180c77552e87a28e32dc53be1b658ebe9f2e6b47a87ff7360  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/raw/hero_sword_held_checkerboard_rejected_attempt1.png
853bee2393fa263bbb46710d6bc10b4fa0a6065b68d7797f049b68585243bf7e  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/raw/hero_sword_held_transparent_attempt1.png
d5bfc4740be2db8c57c90e4528aaecc22e6216ee4ec3345c3713614c2fe746aa  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/refs.json
73adbabb351dae9b8c5d5b0a7f0ccdb2a3f5c19f5ea0123a9c3e7c61ab489945  assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/request.md
```

`build_pilot.py` 是可复跑的确定性生产脚本；运行它只写本试产包，不写正式 runtime。
