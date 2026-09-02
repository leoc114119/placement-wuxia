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


---

## 5. 追加批次一：联调（mock→真 session）+ L 环三修复（2026-09-02 午后）

### 5.1 联调（工单：mock→真 session 单点替换 + F1/F2/F3 消费）
- `proto/battle_demo/main.ts`：createMockSession → createHexBattle 单点替换（演示四技 te/jue/qing/du 对齐 ARC_BTNS；敌阵容 npc-shanzei+npc-lang，name=configId）
- F2：heroSkills 转正为快照必选字段直读，ui 内临时定义删除（re-export types 保 mock 零改）
- F3：spriteKinds 增 npc-lang；spriteKey=configId 端到端验证
- F1：moveKind 金格换色 + isJump 真值抛物线（pieceHop 纯函数，相位基准改 axial 空间——屏幕投影非线性会越界，测试抓出）
- 七项清单 9 断言全 PASS（shot.mjs 可复现）

### 5.2 L 环三修复（Leo 真机反馈）
- ④ ctrl 看不到 → 右下锚定+短边约束（w=min(18.3%W, 42%H÷宽高比)，任何窗口比例恒贴右下）+ 组件资源失败时代码占位兜底（功能钮永不消失）+ 画布逻辑尺寸自适应窗口（每帧检测 rect 变化，resize 事件不可靠）+ index.html 防变形 CSS（width:min(100%, 100vh×9/16)）
- ⑤ 拖镜反向 → 相机平移符号取反（画面跟手），单测断言 -30/-20
- ⑥ 弧钮放大 → 直径 1.8→2.4 头宽（实测 33px），弧半径同步 3.6，间距 42>33 防重叠（断言在案）

### 5.3 追加批次二：投影改造（压扁瓦片透视，Leo 看稿修正版）
- 形态：尖角朝上/下压扁六边形（1:0.7，上下尖角、左右竖直边），**非平顶**（规格修正二版）
- 阵列：奇偶行错位半格 + 行距 0.75×格高 + **战区矩形裁剪**（错位行边缘裁平 = 长方形战区，无锯齿菱形边）
- 投影参数：TILE_SPEC（TILE_W/TILE_H/ROW_H/SIDE_DEPTH 派生），hexToWorld/worldToHex 重写为错位网格（逻辑格 q/r 不变，input 拾取同函数零分叉）
- L1：代码临时瓦片（顶面+下斜边/下尖角侧面+上暗下亮描边），TILE_SPRITES 素材位预留（草绿/土黄到位即贴）
- 棋子定尺基准改 TILE_H，heightPerTile 1.5→2.0（压扁格保观感）

### 5.4 追加验证
- 三零 + battle-hex-render 25/25 全绿；全量 116/117——**唯一失败 = backend 工作区未提交 WIP**（tests/battle-hex-timeline.test.ts，仅 import systems/*，与渲染侧文件零交集；battle-session.ts 13:22 仍在被 backend 修改中）
- 多窗口截图：shot_size_375x667 / 560x700 / 900x560-wide（ctrl/plaque 恒可见断言 3 PASS）
- 压扁透视截图：shot_0（长方形战区）/ shot_1（放大弧钮+金格选中）


---

## 6. 追加批次三：L 环二次反馈修复（2026-09-02 晚）

### 6.1 ① 格子放大+绿区铺满
- TILE_SPEC.w 62→88（560 宽基准每行 6.4 格 ∈ 6-7 格口径）
- computeCamera 改 **movableBounds 聚焦**（可动区 8×8 + followPad 96 窄边）——土黄外围自然推出视口，绿区铺满画面主体（截图 shot_0：视口内近全绿，土黄只余窄边）；boardBounds 保留供战区裁剪
- 顺带修：__demo.W/H 快照改 getter（此前 resize 后断言基准假阳）

### 6.2 ② 托管/加速状态反馈 + 三钮完整
- 根因判定：三钮本地三尺寸+逐行在屏断言均完整；"无法取消"实为**无状态可视反馈**（切托管/加速后钮面无变化，感知为没反应）
- 修复：view.uiState（演出态，宿主填充 mode/speed）→ ctrl 钮状态高亮（托管中=金边框住托管钮；加速中=绿边框住加速钮）；main.ts 维护 speedOn（submit 返回值翻转发）；CTRL_ART 标定常量与图片对象解耦（NaN/异常尺寸防御）
- 回归锁定：ctrl 三钮**逐行在屏**断言入 tests（640×480 非常规比例下验证）

### 6.3 验证
- 三零 + 117/117 全绿（backend timeline WIP 已由其提交修复，全量回归干净）
- 端到端 13 断言全 PASS（shot.mjs）：七项清单 + L④ 三尺寸 + L⑥ 直径/防重叠
- 截图：shot_0（绿区铺满）/ shot_7_auto（托管高亮+AI 聚战）/ shot_size_*


---

## 7. 追加批次四：L 环追加小工单（跳跃演出 + 镜头策略）+ T15 R3 同步（2026-09-02 晚）

### 7.1 T15 R3 同步
- movable 口径：config 新增 FIELD（col 4..11 / row 2..13，12 高 × 8 宽）——BOARD.movable 方形假设删除，isMovableCell/movableBounds/mock reachable 分轴对齐
- rejected 消费：types 'rejected'（bar/range/invalid）→ render `spawnNoteFx`（头顶冒字上浮渐隐）+ main events 游标消费；端到端 PASS（shot_reject_note.png）

### 7.2 L 环追加①②：轻功跳跃演出参数化
- config 新增 `JUMP = { duration: 0.6, height: 88 }`（0.3→0.6s 起步、高度翻倍，可调）
- 实现：**FE 表现层重映射**——跳跃上升沿记 from，表现位置沿 from→pos 以 JUMP.duration 独立演画（session 位移 lerp 0.3s 数据不直接决定观感；isJump 快照窗口短于演出，jumpT 演出中 hop 保持）
- 架构合规：纯表现层二级插值，快照只读、零数值计算；跳跃三帧对比可截（shot_4a/4b/4c）

### 7.3 L 环追加③：镜头策略
- **非主角行动镜头静止**（敌方行动不牵引）；**主角条满时平滑回拉**（指数平滑 tau=CAMERA.smoothingSec 0.22s）；拖镜 delta 即时叠加保证跟手；首帧直接定位理想机位（camInit，修开场漂移）
- 实现：updateCamera（updateView 尾调用）+ computeCamera 保留纯函数语义（测试锚定）
- 确定性单测：敌方行动 1s 镜头静止 + 条满回拉收敛（时序敏感不进截图驱动）

### 7.4 验证
- 三零 + **140/140 全绿**（本文件累计 27 例；backend FIELD WIP 已合入对齐）
- 端到端 14 断言全 PASS（含 R3 rejected、L③ 跳跃三帧、L④ 三尺寸）


---

## 8. 追加批次五：跳跃距离插值（Leo 实测反馈①，2026-09-02 晚）

- **根因**：演出时长/高度固定（0.6s/88px），长距位移被同一时长拉平——弧线撑不起来，观感"跳起来被扯下来"
- **修法**：config `JUMP` 增插值参数组（baseCells 2 / durationPerTile 0.15 / heightPerTileRatio 0.25 / maxDuration 1.2 / maxHeight 176）+ `jumpParamsFor(cells)` 纯函数 + `hexDist`（cube 口径，渲染侧自含）
- **渲染**：跳跃上升沿按 hex 距离锁定插值参数（view.jumpParams），推进/顶高全用锁定值；短距 ≤2 格观感不变；封顶防浮夸
- **sticky 去除确认**：backend 已改（跳一次回落普通移动），FE moveKind 消费不变（金格=跳跃演出）
- 验证：三零 + **142/142 全绿**（新增插值参数组用例：基准不变/+2 格/封顶/上升沿锁定）；shot_4a 长距腾空帧在案


---

## 9. 追加批次六：L 环终验——移动演出"双轨打架"查修一体（2026-09-02 晚）

### 9.1 查修一体定位（PM 初判不约束，以实测为准）
- **复现**：帧序列单调性复现测试（跳跃/普通移动各 50 帧采样）——**FE 演出插值数学本身连续无跳变**
- **真根因（三处快照驱动缺口，非插值数学）**：
  1. 普通移动**完全无演出插值**（draw 直用快照 renderPos，0.3s session lerp 窗口边界闪）
  2. 跳跃演出期 animState 0.3s 后随快照切 idle——空中后半段"站立帧滑行"+帧组跳变（闪烁观感）
  3. isJump 快照窗口（0.3s）与演出期（0.6s+）错位，hop 需要 gate 特判

### 9.2 修法（统一移动演出管线，演出计时主导）
- view.moveAnims（MoveAnim：from/pos 锁定/t/duration/hopHeight）——跳跃与普通行走**共用一条演出管线**：
  - 上升沿（jumpRise=快照 isJump 上升；walkRise=进 walk 且 renderPos≠pos）锁 from/pos/duration/hop
  - duration 插值：跳=jumpParamsFor(dist)；走=moveLerpSec×max(1,dist)（多格不闪）
  - 演出期：draw 位置=演出插值（**快照 renderPos 全程不参与移动期绘制，双轨消灭**）、帧组**强制 walk**（空中/走中不站立滑行）
  - 结束帧：smooth 终点=锁定 pos，无缝衔接；session 中途改目标 → 以快照为准续画（真值变更非跳变）
- 镜头跟随同步改走 moveAnim 表现位置（主角跳跃期镜头跟表现位）

### 9.3 证据
- 单测：帧序列单调（跳跃/普通双复现转正，回跳帧=[]）+ moveAnim 版 pieceHop 三态
- 端到端：shot.mjs 新增**连续帧采样单调断言**（jump/walk 各 40 帧投影无回跳，回跳帧=[]）——16 断言全 PASS
- 三零 + 142→**全量回归干净**

### 9.4 驱动脚本稳定性
- 修复 shot.mjs 间歇崩：R3 演示段 submit 会消耗回合，挪至清单末尾；① 移动段补等回合与 cell 防御（间歇性根因=敌我出生距离随机的回合消耗不确定性）


---

## 10. 追加批次七：L 环终验两缺陷（根因 A/B，2026-09-02 晚）

### 10.1 根因 A：特/绝选中后无法释放
- 修：`ui/battle-input.ts` 敌棋子命中改按**逻辑 hex（快照 pos）**匹配（原按 renderPos 动画位——敌移动动画中 renderPos≠pos 点击落空 → 误走 cancelSkill）
- 用例：敌 renderPos(4.2,6.5)≠pos(5,6) 动画中，点击逻辑格 → attack 受理派发 ✓

### 10.2 根因 B：跳一次后穿模（直线插值穿单位）
- **方案抉择：渲染侧自算 BFS 路径**（不走契约工单）。理由：①契约零改动——moveCells 语义（可达格集合）不变，path 属表现细节；②渲染侧 BFS 与 session reachable 同参同数学（FIELD 内/6 邻/阻挡=占格），同一 BFS 无漂移源；③路径方向选择只影响观感不影响结算；④避免快照每帧重建的 path 数组成本
- 实现：`computeMovePath`（BFS 自含，路径含 from/pos）+ `moveAnimDrawPos`（path 逐格分段插值）+ MoveAnim 扩展 path；drawPieces/y 排序/updateCamera 位置采样统一走 moveAnimDrawPos
- 用例：绕行场景（col 5 纵向、(5,6) 占格）——路径不含占格、逐段 6 邻相邻、分段采样 30ms 步进连续且不落占格中心 ✓


---

## 11. 追加批次八：终验复测——真实 rAF 实证 + 闪烁根治（2026-09-02 晚）

### 11.1 真实环境复现（工单要求①，Performance.now 时间轴）
- `proto/battle_demo/main.ts` 增 rAF 帧日志（startFrameLog/stopFrameLog，每渲染帧记录采样位置）
- `proto/battle_demo/record.mjs`：真实浏览器录制 + **像素投影空间**垂直分量分析（axial 空间分析恒直线是假象——错位网格锯齿只在像素系显形，前两轮"修不好"的分析盲区即此）
- **修前实证**：三段斜线，段间**单帧垂直瞬跳 45.9px**（错位半格×2），即 Leo"左闪右闪"

### 11.2 真根因（rAF 数据实证，两轮修正）
1. BFS 等距多解路径在像素投影下呈 **L 形折线**（每段横向偏移 20-46px，段间瞬跳）——hex_lerp 直线化后**折线依旧**：hex_lerp 中间格**越出 FIELD 走廊**被判 blocked 回退 BFS（纵向窄走廊下斜向直线必越带）
2. clamp 进带后折线**依旧**：三段形态=**clamp 后路径贴带边的固有三段**（非重启）——沿格中心走必然蛇形

### 11.3 终修（演出与格中心解耦）
- **演出插值迁移到像素空间**：MoveAnim.pathPx（路径格中心 hexToWorld 像素点列），moveAnimDrawPosPx 沿点列线性插值
- **computeMovePath 定版**：hex_lerp 中段**出 FIELD 带格 clamp 吸附带边**（贴边直行不折返）+ 占格阻挡 → BFS 绕行（Chaikin 两轮圆化折角）；jump 凌空恒直线
- drawPieces/y 排序/updateCamera 全部改读像素采样位置（快照 renderPos 移动期彻底退出渲染）

### 11.4 修复前后对比（同场景 7 格移动，rAF 逐帧）
- 修前：垂直分量三段斜线，段间**单帧瞬跳 45.9px**（frame_log_before.json）
- 修后：**段内垂直分量恒定零抖动**（187.6 恒定值序列），仅一次 23px 平滑方向修正脉冲（frame_log_after2.json）

### 11.5 验证
- 三零 + **148/148 全绿**（含 backend 凌空回归锁用例：computeMovePath 4 参 isJump 凌空恒直线，已对齐其语义）
- 端到端 shot.mjs 16 断言全 PASS
