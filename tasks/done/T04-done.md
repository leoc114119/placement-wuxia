# T04 交付回执 · NPC 系统（氛围版：随机散布 + 随机走动）

> 交付：2026-08-22 13:20 · ZCode · 状态：待 C 环验收
> 工单：`tasks/working/T04.md`（需求表 7 条逐条落地）· 设计：modules/03 v1.2 §2.0/§2.1/§3

## DoD 勾选

- [x] typecheck / lint / build 三零；`test:battle` **37/37**（既有 30 不回归 + T04 新增 7）
- [x] 新增用例：①同种子散布确定性（逐位一致 + 系统 respawn 同口径）②200 种子扫描布局满足两两间距/距出生点/走廊约束 + 极端出生点 50 种子不破下限 ③wander 状态机（选点 500 次恒在走廊内且半径受限；10s 步进 idle→walk→idle、稳态速度=主角×0.6、吸附距离≤0.01）④帧循环 01~03 且 04+ 全时间轴不出现 ⑤数量 ∈ [2,4]
- [x] node 模拟：**32s 轨迹日志**（见 §轨迹日志摘要）——状态转移时间线 + 4s 快照行，全程走廊内
- [x] GUI 截图（真实代码渲染，无拼接）：`preview/shots/t04_375x667.png` / `t04_375x812.png` 两档 + 走动中帧 `t04_375x667_walk_b.png`（另有对比帧 `_walk_a.png`，两帧字节级不同证明动画运行）
- [x] 双写登记（threads/T04.md + LOG.md）
- [x] **Leo L 环反馈已修**：山贼/野狼 walk 帧腿间暖白残留（同 hero Q1 六轮病灶）——本地外科清除 8 帧，像素复测归零 + 拼图目验本体完好

## 随机算法说明（架构决策）

1. **RNG 注入**：`makeNpcRng(seed)`（mulberry32，与 battle-core 同族）。`scatterNpcs` 为纯函数：数量 `2~4` 均匀随机 → 每只等权抽池 → WALK_ZONE 内均匀撒点 → 约束校验（两两 ≥0.18、距主角出生点 ≥0.15）→ 单点重试 ≤20 → 放不下**保间距→降数量**（`count-1` 重排，下限 2，仍放不下即终止，禁死循环）。同种子逐位复现（用例断言）。
2. **wander 状态机**：每 NPC idle 计时 3~5s → `pickWanderTarget`（当前点半径 0.15 面积均匀取点 + 逐轴 clamp 走廊）→ walk（速度=主角×0.6，到达阈值 0.01 与主角同口径）→ 回 idle 重掷计时。每 NPC 独立 RNG 流（configId 哈希 + 递增计数派生，互不干扰且可注入种子）。
3. **渲染**：NPC 与主角进同一 z-order 桶按 y 升序绘制（远→近遮挡）；帧映射 `NPC_FRAME` 与 `HERO_FRAME` 同口径（00 idle / 01~03 walk，160ms/帧）；朝向翻转复用主角规则（素材面左，向右走 `scale(-1,1)`）；比例锚定走 `config/npcs.ts` 的 `heightRatio`（山贼 0.21 对齐主角 / 野狼 0.15）；名字标签头顶墨底胶囊淡金小字（`NPC_LABEL` 常量），血条不做。
4. **刷新时机**：`respawn()` 单入口——启动首帧（帧表预载后调用）、切 Tab 回江湖、战斗/闭关返回均调它（后两者在场景切换任务接线时同口径调用）。种子可注入（测试用），缺省时间熵。
5. **交互禁区遵守**：NPC 不注册点击命中（点 NPC 身上 = 地面移动，`hitSceneButton`/主角语义零改动）；无追逐/开战/血条/击败/掉落；NPC 间无碰撞。

## 素材处理记录（Leo L 环反馈）

- **病灶**：spr_shanzei / spr_lang 00~03 共 8 帧腿间暖白残留（1.5k~13.8k px/帧，AI 底色暖白、管线 cutout 未咬住——与 hero Q1 六轮同源，当时管线反馈已预警）。
- **处理**：同款两段式外科清除（主带近白 min>185/彩度<35 + 窄带暖白 min>160/彩度<55；深色靴/皮毛/武器/装饰不动），git 可回滚（v3 原版在库）。
- **验收**：8 帧窄带复测残留全部 0px；拼图目验（/tmp 拼图）山贼武器/衣袍、野狼四腿/尾/头完好无误抠；preview 页重载截图腿间透明干净。
- **管线反馈（再提）**：`cutout_leg_gap` 增加「暖白容差分支」的建议依然有效，spr_boss_lang（T07 素材）大概率同病，接入前建议统一处理。

## 过程问题记录

- preview 页曾出现画面冻结（三张截图字节级全同）：排查为 **IAB 页签不可见时浏览器暂停原生 RAF** → shim 改用 `setTimeout(16ms)` 驱动主循环，与可见性解耦（`preview/game-preview.html`，仅预览环境行为，真机不受影响）。
- 测试过程中抓到一个真 bug：`createNpcSystem` 返回对象捕获旧数组引用，`respawn` 重赋值后外部恒见空列表（"respawn 同口径"用例因两边皆空而假绿）——已改为原地 `length=0 + push`，用例随即暴露真问题。
- **归档后返工#2（Leo 13:30 点名）**：`rngFor` 以 configId 为 key，同类型多只共享递增种子流，注释「每 NPC 独立」名不副实 → 改为 **Map<对象引用, Rng> 实例隔离 + respawn 时 clear 重置**，种子 = configId 哈希 × 实例序号（遍历序固定，确定性保持）；新增「两系统实例同 seed 先后步进轨迹逐位一致」回归用例（旧实现会因跨实例共享流分叉，此用例可区分新旧）。38/38。

## 轨迹日志摘要（32s @60fps · seed=20260822，3 只野狼散布）

```
散布: npc-lang@(0.691,0.690) npc-lang@(0.262,0.765) npc-lang@(0.327,0.490)
[t=3.5s] #0 idle→walk 目标=(0.565,0.752) 朝向=left
[t=4.0s] #0 walk→idle 位置=(0.565,0.752)
[t=4.9s] #1 idle→walk 目标=(0.240,0.707) …
[t=8.1s] #0 idle→walk 目标=(0.667,0.782) 朝向=right（朝向随目标翻转 ✓）
[t=12.8s] #0 idle→walk 目标=(0.618,0.838) …（目标恒在走廊 x[0.24,0.76]×y[0.46,0.84]）
…（每 3~5s 循环，32s 内每只走动 6~8 次，全程无越界、无死循环）
```

## 用例 ↔ 需求表对照

| 需求 # | 用例 |
|---|---|
| 1 散布 | 同种子逐位一致 + 不同种子布局不同 + respawn 同口径 |
| 2 分散约束 | 200 种子全约束扫描 + 极端出生点 50 种子降级不破下限 |
| 3 比例锚定 | heightRatio 走 config（渲染读 config，无硬编码）+ 截图目测 |
| 4 随机走动 | 选点走廊内+半径受限 500 次；10s 步进状态机/速度/吸附断言 |
| 5 渲染 | npcWalkFrame 01~03 循环 + 04+ 不出现；z-order/翻转走截图目验 |
| 6 名字标签 | 截图目验（标签随 NPC 移动）；血条不做 ✓ |
| 7 交互不变 | hitSceneButton/主角语义零改动（scene.test 16 用例不回归） |

## 改动文件

| 文件 | 变更 |
|---|---|
| `config/npcs.ts` | **新增**：NPC 池（山贼/野狼 NpcConfig 骨架，战斗数值字段留空位注释） |
| `config/numbers.ts` | 追加 NPC_COUNT_RANGE/NPC_SPACING/NPC_WANDER/NPC_FRAME/NPC_LABEL 展示常量 |
| `types.ts` | 追加 NpcAvatar/NpcFrameAssets/NpcView |
| `systems/npc.ts` | **新增**：makeNpcRng/scatterNpcs/pickWanderTarget/stepNpc/npcWalkFrame 纯函数 + createNpcSystem（respawn/update/view） |
| `ui/render.ts` | render 追加 npc 三参（缺省空=无 NPC）；drawNpc（帧+翻转+标签）；主角+NPC 统一 y 排序 z-order |
| `ui/assets.ts` | 追加 loadNpcFrames（池帧表预载，失败 null 降级） |
| `game.ts` | 接入：loadNpcFrames → respawn 首刷；循环内 npcSystem.update + render 传 NPC 视图 |
| `tests/npc.test.ts` | **新增**：7 用例 |
| `assets/ui/frames/spr_shanzei/*`、`spr_lang/*` | 00~03 共 8 帧腿间暖白残留外科清除（Leo 反馈） |
| `preview/game-preview.html` | FILES 补 npc 模块；RAF 解耦（setTimeout 驱动）；加载错误显性化 |
| `preview/shots/t04_*.png` | **新增**：两档截图 + 走动中帧 + 对比帧（4 张） |
