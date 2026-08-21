# T03 交付回执 · 场景系统（江湖主场景 · 手动移动）

> 交付：2026-08-21 21:30 · ZCode · 状态：待 C 环验收

## DoD 勾选

- [x] `npm run typecheck` / `npm run lint` / `npm run build` 0 error
- [x] `npm run test:battle` 全绿：**24/24 用例**（T05 既有 14 不回归 + T03 新增 10，需求表 #10 要求 ≥4）
- [x] node 模拟验证（wx mock）：点击→移动状态机转移正确，日志贴本回执 §node 模拟日志
- [ ] 开发者工具：场景显示 + 点击移动 + walk 动画 + 三按钮 —— **留 Leo L 环点验**（GUI 部分）
- [x] 回执含：渲染分层说明 + 帧动画接入方式 + 触摸封装决策（见架构决策）
- [x] 未触碰禁止区：无 NPC/战斗/挂机逻辑；未改帧表素材；未动 docs/ tasks/ assets/（tasks/ 仅协议流转）；T05 battle-core 零改动；T02 主循环结构原样（仅增量接入 4 行）

## 文件清单

| 文件 | 变更 |
|---|---|
| `env.d.ts` | 追加 wx.createImage / onTouch×4 / getSystemInfoSync / WxImage·Touch·SystemInfo 类型（T02 原有声明未动） |
| `types.ts` | 追加场景类型（TouchPoint/Facing/AvatarState/PlayerAvatar/SceneConfig/SceneButton/SceneAssets/SceneView + EMPTY_SCENE_ASSETS），既有类型未动 |
| `config/scenes.ts` | **新增**：场景表（scene-qingniu，数据源 config/场景与NPC配置.md §2；npcs/boss/hangup 留给 03/04/08） |
| `config/numbers.ts` | 追加 T03 只读展示参数（速度/clamp/帧映射/标签/按钮布局），无结算公式（ADR-004 合规） |
| `systems/scene.ts` | **新增**：纯函数（clampTarget/facingToward/stepAvatar/walkFrame/layoutSceneButtons/hitSceneButton）+ createSceneSystem 状态机 + bindTapInput 触摸接入 |
| `ui/assets.ts` | **新增**：wx.createImage 预载（bg 1 + hero 00~04 共 5 帧），失败置 null + 日志不崩 |
| `ui/render.ts` | 重写为分层渲染（原 T02 仅 9 行清屏占位，注释即写明「界面随 T03+ 任务卡补全」） |
| `game.ts` | 增量接入：建 scene 系统 + 异步载资源 + bindTapInput；render 多传一个 view 参数。**RAF 主循环结构未动** |
| `tests/scene.test.ts` | **新增**：10 用例（纯函数 5 组 + wx mock 状态机模拟 1 组） |

## 架构决策与理由

1. **渲染分层说明**：`render(frame, view)` 单入口按 L0 背景 → L1 主角 → L2 UI 浮层顺序绘制（需求表 #1）。背景 cover 裁切（短边撑满、长边居中裁，1440×2560 竖版素材在非 9:16 屏不拉伸变形）；主角脚底锚点 = 逻辑坐标像素点，高 0.3×屏高；L2 场景名胶囊 + 三按钮。**助战入口不渲染**（R-03）。
2. **帧动画接入方式**：帧号由场景系统算好（view.heroFrameIdx），渲染层只取帧画图——动画计时归系统、贴图归渲染，职责单一。walk 累计时间在停止时清零，保证起步总是 01 帧（模块 02 §2.2）。素材用 `hero_0X_transparent.png`（实测 `hero_0X.png` 为白底不透明、`_transparent` 变体透明像素 ~67%，符合任务卡「透明 PNG」口径；文件名与任务卡 §5 写法 `00.png~07.png` 有后缀差异，已在领单线程报备，未改素材）。只预载 00~04（05+ 暂不用，需求表 #2）。**朝向**：AI 视觉核验帧 01 面左、00 正面、脚贴底边 → 素材默认面左，`direction='right'` 时 `scale(-1,1)` 翻转。无帧降级：墨色胶囊 + 行走正弦颠簸（模块 02 §2.2「无帧时回退代码颠簸」）。
3. **触摸封装决策**：`bindTapInput(system, size, hooks?)` 收敛在 systems/scene.ts——① 用 **touchend** 触发（抬起才算点击，防滑动误触）；② 坐标换算 client 逻辑px × (canvas 物理px/window 逻辑px)，getSystemInfoSync 失败兜底 1:1；③ hooks 参数注入触摸依赖，node 单测无需全局 mock wx 也能测状态机（真实路径仍走 wx.onTouchEnd）。命中优先级在 `system.tap` 内：按钮圆 → 地面（NPC 层由模块 03 在两者之间插入），点按钮只 console.log 占位（需求表 #8）。
4. **纯函数/状态机分层**：6 个导出纯函数（clamp/朝向/步进/帧号/布局/命中）无任何 wx/Canvas 依赖，node 可测；createSceneSystem 内部 `Object.assign(avatar, stepAvatar(...))` 把纯函数结果回写共享引用，外部引用稳定、逻辑仍可独立断言。布局函数 `layoutSceneButtons` 是渲染与命中的**同一来源**，按钮位置改一处两边同步。
5. **数值边界**：速度 0.4 逻辑坐标/秒（任务卡建议值）、clamp [0.05,0.95]、到达阈值 0.01 全部走 config/numbers.ts 只读常量；fight/hangup 状态 tap 直接忽略（状态归属模块 03/04/08，防御式放行，不加新功能）。
6. **资源加载失败策略**：loadImage 永不 reject（onerror/throw 都 resolve null），游戏不阻塞不崩；背景失败降级宣纸纯色（需求表 #9 的「纯色+日志」）。

## node 模拟日志（wx mock · C 环自测）

```
=== T03 node 模拟(wx mock)· 点击→移动状态机 ===
[初始] state=idle moving=false dir=left pos=(0.500,0.720) target=(0.500,0.720) frame=0
-- 点击右下地面 (0.9, 0.72) --
[点击后] state=walk moving=true dir=right pos=(0.500,0.720) target=(0.900,0.720) frame=1
[行走 0.5s] state=walk moving=true dir=right pos=(0.700,0.720) target=(0.900,0.720) frame=4
-- 出界点击 (-0.2, 1.5) → clamp --
[出界点击后] state=walk moving=true dir=left pos=(0.700,0.720) target=(0.050,0.950) frame=1
[步进 4s(到达)] state=idle moving=false dir=left pos=(0.050,0.950) target=(0.050,0.950) frame=0
-- 点击挂机按钮(圆心) --
[scene] 按钮点击占位：guaji
[点按钮后] state=idle moving=false dir=left pos=(0.050,0.950) target=(0.050,0.950) frame=0
=== 模拟结束:转移链 idle→walk→(clamp目标)→到达idle·按钮不触发移动 ===

walk 帧序列(1.25s @60fps 采样): 1×9 → 2×10 → 3 → 4 → 回卷 1；到达后帧=0(idle)
```

## 用例 ↔ 需求表对照

| 需求 # | 用例 |
|---|---|
| 3 点击移动 | stepAvatar 直线推进/到达即停不过冲/斜线向量推进 + mock 状态机 idle→walk→idle |
| 4 坐标与朝向 | clampTarget 出界/边界/界内 5 断言 + facingToward 左/右/保持 + 点左半屏 dir=left |
| 2 帧表 | walkFrame 01→04 循环回卷 + 起步 01 帧 + 待机 00 帧 |
| 5 命中优先级 | 三按钮等距布局断言 + 圆内命中/圆外不命中 + 点按钮 moving=false |
| 8 三按钮 | 按钮点击占位 log 断言（guaji） |
| 9 资源降级 | loadImage 失败 resolve null（代码路径）+ 降级渲染分支存在；断图名实机由 L 环覆盖 |
| 1/6/7 渲染 | 渲染层纯绘制无逻辑，模拟器点验归 L 环（Leo） |

## 已知边界（不属本卡）

- 开发者工具真机 canvas 物理像素与 windowWidth 换算已按标准 dpr 公式处理；若个别机型有偏差，调 bindTapInput 换算一处即可。
- 场景内「点 NPC 触发」层（UI>NPC>地面 的中段）留接口在 tap 内，T04 插入。

## 打回修复记录（Q1-T03 · 2026-08-21 22:05）

**打回**：Leo L 环反馈 walk 动画不自然（高抬腿帧）+ 走动后出现「抬剑」帧。工单 `questions/Q1-T03.md`。

**根因**（逐帧 AI 视觉目验 00~04，证据见 `questions/Q1-T03-素材目验回报.md`）：
- 素材实物 = **77 §2.2 六帧表口径**（00 待机 / 01 左脚 / 02 右脚 / 03 左脚 / 04 举手预备 / 05 挥出 / 06 普攻），任务卡「01~04=walk」按 §0.1 八帧设计口径预写，与素材不符。
- **04 号帧是出招预备（站定举剑），被映射进 walk 循环** → 每个 walk 圈出现一次「抬剑」帧，且 03 抬腿后接 04 站定，步态被打断 = 「高抬腿/不自然」观感来源。两现象同一根因，代码侧。
- 排除代码时序嫌疑：主循环 update→render 同帧生效，到达即显 00，无多播帧。

**修法**（2 文件，未动其他）：
- `config/numbers.ts`：`HERO_FRAME.walkEnd` 4→**3**（walk=01~03 左右脚交替），`preloadCount` 5→4（04 出招帧留给 T06）；注释写明六帧表口径与本次根因。
- `tests/scene.test.ts`：walkFrame 用例按 3 帧循环口径重写 + 「全循环不越界到 04」扫描断言；mock 模拟注释同步。

**复验证据**：typecheck/lint/build 0 error；test:battle **24/24**；node 帧序列复测 `1 1 1...2 2...3 3...→回卷 1`，到达后 0（待机）。

**素材侧结论**：无必须重生成的硬伤；抬腿幅度（02/03 约 45°）与 walk 只有 3 帧两条可选项待 Leo 复验拍板，走 `assets_pipeline.py --only hero`，ZCode 侧届时只改一行 `walkEnd`。

**流程确认**：bug 修复归属 ZCode（Leo 拍板）；本工单由 ZCode 修复完毕，未动 CodeBuddy 热修成果（update 接入/0.21 比例/contain 铺底均保留）。

### 复验反馈#2（Leo 22:15：「不举剑了，但高抬腿帧仍奇怪，左右走交替就可以了」）

- **残余定位**：01 号起步抬腿帧——77 §0.1 设计里即「起步抬腿」，六帧素材里步幅最夸张的一帧；02/03 为镜像自然步态。
- **修法**：`config/numbers.ts` `walkStart 1→2` → walk = **02~03 左右两帧交替**（160ms/帧）；01 弃用不进循环（文件保留，预载不变）。`tests/scene.test.ts` 帧用例同步 + 01/04 全时间轴不出现断言。
- **复测**：三零 + 24/24 + node 帧序列 `2→3→2→3` 交替。
- **素材管线不动**（Leo 拍板不重生成，回报单可选项关闭）。

### 复验反馈#3（Leo 22:35：「现在是滑动…左走只左边出脚，右走只右边出脚，要两只脚交替走的两帧」）

- **根因**：二轮选的 (02,03) 虽为「右/左」腿位，但两帧同为迈开姿势、步幅开合变化不足，交替感弱 → 观感单侧伸脚滑行。
- **定位方法**：拼图（01|02|03 并排带色条）严格对比 + 脚区前景像素水平范围客观测量（01=[0.23,1] / 02=[0.06,1] / 03=[0,0.86]）→ 腿位定论：**01=左腿在前(收步)、02=右腿在前(迈开)、03=左腿在前(收步变体)**。
- **修法**：`config/numbers.ts` `walkStart 2→1` → walk = **01↔02 左右脚严格交替**（收步↔迈开，开合差最大），03 弃用；`tests/scene.test.ts` 帧用例同步 + 03/04 全时间轴不出现断言。
- **复测**：三零 + 24/24 + node 帧序列 `1→2→1→2` 交替。
- 教训记录：视觉模型单帧目验两次不稳定（02/03 腿位误判），最终以「拼图同图对比 + 像素范围测量」双证据定案——后续帧类素材判定优先用此法。

### 五轮 · 素材 v3 接入（ZCode 23:20 · threads 21:58 素材落地）

- **四项核验全过**：①腿位 01左/02右/03收拢小步交替（拼图对比）②朝向全侧左（拼图对比）③剑收鞘背背后（拼图对比）④腿间透明（像素测量：行走帧腿区中央条带 ~50% 不透明 vs 待机 72%，全帧透明 66~71% 无残留）。
- **接入**：播报硬规则「走位=01~03 循环」→ `walkStart 1 / walkEnd 3`；用例同步 + 04 永不进 walk 防回归断言。
- **复测**：三零 + 24/24 + node 帧序列 `1→2→3→回卷`。
- 素材 v3 由 CodeBuddy 管线产出（git 14edb87/15932c5），ZCode 未动 assets/。
