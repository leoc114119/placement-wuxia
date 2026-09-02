# T16 交付回执 · 战斗界面渲染+输入+HUD（frontend · T-F1）

> 交付：2026-09-02 午 · 执行者：frontend · 状态：**待 C 环验收**
> 运行方式：`node proto/battle_demo/build.mjs`（bundle 已预生成）→ 浏览器/微信开发者工具直开 `proto/battle_demo/index.html`（file:// 可跑）

## 1. DoD 逐项

- [x] **三零**：`tsc --noEmit` 0 错 / `eslint` 0 错 / `tsc` build 0 错（本机复跑通过）
- [x] **全量测试不回归**：vitest 8 文件 **108/108 全绿**（含 T15 侧 battle 14/hex/session 用例；本卡新增 23 例）
- [x] **渲染层 import battle-core = 0 自动化断言**：`tests/battle-hex-render.test.ts` 扫描 ui/battle-hex-render.ts、ui/battle-input.ts、config/battle-hex.ts、proto/battle_demo/{mock_session,main}.ts 五文件（匹配 from/require 模块路径形态，注释宣示字样不计）
- [x] **battle_demo preview 全链可跑**：渲染/镜头拖动/点击移动/普攻+技能施放/特绝轻毒弹出/HUD/组件接入（截图 6 张 `proto/battle_demo/shots/`，playwright-core+本机 Chrome 驱动 `shot.mjs` 可复跑）
- [x] **契约咬合测试**：T15 已冻结契约进 types.ts → 直接消费；新增「真实 createHexBattle 快照 → updateView/drawFrame 全链」用例 + mock 会话 3 例
- [x] 文件清单+架构决策说明（下）+任务箱三同步（threads/LOG/box.db 均更新）

## 2. 文件清单

**新增（渲染层交付物）**
- `config/battle-hex.ts` — 表现层常量唯一真值（HEX/BOARD/CAMERA/TILE/HUD/ARC_BTNS/TOPBAR 标定/组件布局/资源路径表 BATTLE_HEX_RES）
- `ui/battle-hex-render.ts` — 七层渲染器（L0 底图→L1 立体瓦片→L2 高亮→L3 棋子 billboard/y 排序/lerp/跳跃→L4 三件套+弧形四钮→L5 三组件→L6 特效+结算遮罩），只读快照
- `ui/battle-input.ts` — 输入翻译（命中优先级 弧钮>ctrl>木牌>格子；>8px 拖镜判定）→ ActionRequest
- `proto/battle_demo/`：index.html / main.ts / mock_session.ts / bundle.js（生成物）/ build.mjs / shot.mjs
- `proto/battle_demo/cutout/`：png_codec.mjs（零依赖 PNG 编解码）/ cutout.mjs（去背管线）/ bottom_clean.mjs / post_trim.mjs / crop.mjs / measure.mjs（标定测量）
- `tests/battle-hex-render.test.ts` — 23 例

**素材产物（本卡透明化管线产出）**
- `assets/ui/pixel/battle/components/plaque_l_alpha.png`（310×680，去背+暖色保护）
- `assets/ui/pixel/battle/components/ctrl_r_alpha.png`（223×448，自 v8 定稿基准重裁+去背；源切图缺逃跑钮）
- 前后对比：`proto/battle_demo/shots/cmp_plaque.png`、`cmp_ctrl.png`

**修改（最小步）**
- `tsconfig.json`：include 增 `proto/battle_demo/**/*.ts`（preview 代码过三零）
- `env.d.ts`：测试用 node:fs/node:path 最小 ambient 声明（vitest 运行时可用；小游戏运行时禁用）

## 3. 架构决策说明

1. **契约直接消费 types.ts（超出批复口径的简化）**：开工发现 T15 M0 已把 §3.2/3.3 冻结进 types.ts（含 O3 无 deploy）→ 放弃 proto 内镜像，直接 import——避免两份定义漂移，"冻结后切 import"天然完成，PM 批复意图（不擅改 types.ts）未违背。
2. **契约缺口两处**：① `heroSkills`（弧钮置灰的内力/冷却数据源）不在冻结契约 → 以 `BattleSnapshotExt` 可选扩展段由 mock 供给，渲染器可选消费（对切需 T15 供给同形字段或登记工单补契约）；② `selectedCell` 选中格高亮 → 纯演出态存 view，不进会话真值。
3. **hex 几何 FE 自含**：投影/拾取（hexToWorld/worldToHex）落 config+render，不 import T15 systems/hex（其仍在演进；FE 只需像素投影，无图论）。测试锚定 96 号公式。
4. **零依赖打包器**：环境无 esbuild → 用 devDep typescript 的 transpileModule + 70 行 CJS 注册表拼单文件经典脚本（ESM 在 file:// 被 CORS 拦，必须 bundle）。
5. **透明化管线（Q2 批复落地，纯 node zlib）**：边缘洪泛 + 封闭孔洞兜底 + 1px 羽化 + 小岛/细笔画清理 + **暖色保护门控（R>G+12 永不算背景）**——最后一项解决"暗棕木面 vs 暗绿背景同亮度异色调"误抠问题（黑底目验盲区，靠绿底衬对比图暴露）；ctrl_r 源切图缺逃跑钮 → 从 v8 定稿基准重裁；plaque 红穗曾用家场景 plaque_chain 正料合成（最终版原生穗被暖色保护保住，合成不再需要）。
6. **资源路径**：config BATTLE_HEX_RES 保持包根相对（生产唯一真值）；file:// 预览 loader 加 `../../` 前缀适配；占位帧沿用 `assets/ui/frames/battle/` 小表（T14 到位换表+调 PIECE.heightPerTile）。
7. **数值集中**：展示/几何参数全在 config/battle-hex.ts；mock 数值全在 mock_session.ts 且标注演出占位；渲染/输入层零数值计算。

## 4. 交接与观察项

- **对切 T15**：render/input 类型已按冻结契约；真快照咬合用例已绿。剩余：① heroSkills 同形供给（工单或 session 扩展）；② mock 替换点=main.ts 的 `createMockSession`（单点）。
- **L 环目验项**：弧钮间距/弹出时长（ARC_BTNS）、演出时序（CHOREO）、压暗层深度（TOPBAR.dimAlpha）、棋子定尺（PIECE.heightPerTile，T14 后校）均为 config 手感项。
- **后置**：顶栏文字/胶囊烘焙（M4 真机对位+canvas 叠字配方）；事件流驱动 L6 特效（Q1② 裁决留迭代）；跳格轻功抛物线启发式（renderPos-pos 距离>1.5 格触发）。
