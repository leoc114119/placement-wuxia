# 光影组合试点技术方案：`trial_fx_01`

> 分类：03-战斗系统 · 性质：研发施工蓝图（不含代码实现）
> 方案版本：v0.1 · 基座：`origin/main@b036b78` · 2026-09-08
> 状态：🟡 方案草案；素材帧数验收口径待 PM 裁决后发卡

## 1. 目标、依据与边界

本卡只把一套三层光影组合接入战斗表现，用来在 MVP 中验证“老网金光影叠放”的视觉效果。组合后台、名条（WF-2）、音效均不在本卡；不改变伤害、范围、行动条、RNG 或结算事件。

唯一配方真源为《光影序列素材库》§6.1 `trial_fx_01`：

| 层 | 序列 | 逻辑帧 | 相对出招时长 `T` 的时窗 | 缩放 | 语义 |
|---|---|---:|---:|---:|---|
| L1 聚气 | `kf7/15-1` | 12 | `0% ~ 45%` | `0.5` | 紫红大环收缩 + 绿粒子 |
| L2 主体爆 | `kf1/14-1` | 22 | `35% ~ 90%` | `1.4` | 橙红刺环爆 → 金爆团 |
| L3 余韵 | `kf1/125-1` | 7 | `78% ~ 100%` | `1.2` | 橙月牙弧收尾 |

锚点固定为施法者中心格（WF-8）；`T` 完全跟随该次出招时长（WF-9 / AS-1），层内帧在自己的时窗内等分播放。绘制只做视觉叠加，绝不从前端反推数值。

### 基线依赖门

`origin/main@b036b78` 尚未包含上游光影素材库文档及 `assets/_trial_20260907/wangjin_fx_units/`。发实现卡前，必须让任务分支可读到《光影序列素材库》§6.1 及三条序列的透明 PNG；缺任一项不得把候选素材称为已入库。

## 2. 配方数据结构（`types.ts` 增量）

结构保持“后台导出 JSON 可直接消费”：层顺序由数组决定，帧顺序由显式文件数组决定，窗口使用归一化比例，不把运行时毫秒写入素材配置。

```ts
export interface FxAnchorOffsetPx {
  x: number;
  y: number;
}

export interface FxLayerRecipe {
  id: string;                 // 稳定层 ID，例如 L1
  frameDir: string;           // 运行时资源目录
  frames: string[];           // 播放顺序，文件名相对 frameDir
  windowStart: number;        // [0, 1]，相对本次 T
  windowEnd: number;          // (windowStart, 1]
  scale: number;              // 等比缩放
  anchorOffsetPx: FxAnchorOffsetPx;
  blendMode: 'lighter';       // 试点固定加色；后台可扩展但不得改本卡口径
}

export interface FxRecipe {
  id: string;                 // trial_fx_01
  durationSource: 'cast';     // T = 本次 castDurationMs
  anchor: 'casterCellCenter';
  layers: FxLayerRecipe[];
}
```

约束：`windowStart/windowEnd` 必须满足 `0 ≤ start < end ≤ 1`；`frames` 非空且顺序稳定；`scale > 0`；`anchorOffsetPx` 以 Canvas 世界像素表示，默认 `{x: 0, y: 0}`。播放器对时窗左闭右开，`end` 时刻夹取该层最后一帧，避免浮点尾帧丢失。

## 3. 播放器与绘制接线

### 3.1 模块选择：新建 `ui/fx-player.ts`

选择独立播放器，不并入 `ui/battle-hex-render.ts`：

1. 播放器拥有配方实例、局部时钟、帧选择和资源缺图降级；战场渲染器继续只负责 L0~L6 场景/棋子/UI 顺序。
2. 纯帧选择、时窗和生命周期可在无 Canvas 环境单测；不会把 `battle-core`、结算公式或 RNG 引入 UI。
3. 未来组合后台只需导出同一 `FxRecipe`，不需要改战场渲染器接口。

`FxPlayer` 最小职责：`start(recipe, anchor, startedAtSec, durationMs)`、`update(nowSec)`、`draw(ctx, camera)`、`clear(instanceId)`。一个施法实例对应一个播放实例；实例 ID 不复用。

### 3.2 世界层绘制

在 `drawFrame` 的世界裁剪区内接入，绘制顺序放在棋子之后、血条/名字牌之前（既能盖住角色又不污染 HUD）；这就是试点的 L1 世界特效层。锚点统一复用现有 `hexToWorld(actor.renderPos.q, actor.renderPos.r)`，再减镜头偏移并加 `anchorOffsetPx`，禁止在播放器内复制第二套格心换算。

每层绘制只包围自己的 Canvas 状态：

```text
ctx.save()
ctx.globalCompositeOperation = 'lighter'
ctx.drawImage(frame, cx - w/2, cy - h/2, w, h)
ctx.restore()
```

不得把 `lighter` 泄漏到棋子、HUD 或下一帧；图片按原始宽高等比乘 `scale`，不拉伸到格子尺寸。

## 4. 素材预载与入库

### 4.1 运行时路径

将已通过 PM 素材门的帧拷贝为：

```text
assets/ui/fx/trial_fx_01/L1/15-1_f01.png ...
assets/ui/fx/trial_fx_01/L2/14-1_f01.png ...
assets/ui/fx/trial_fx_01/L3/125-1_f01.png ...
assets/ui/fx/trial_fx_01/SHA256SUMS.txt
```

原始 BMP、`assets/_trial_20260907/wangjin_fx_units/` 候选目录不作为小游戏运行时路径。回执必须同时给出路径、数量及 SHA-256；PM 再登记《素材落地账》。

### 4.2 微信环境加载

战斗入口开始时，与战场背景/角色帧并行调用 `wx.createImage` 预载三层所有帧；全部 Promise settle 后才允许首个特功演出。播放器不在施法中途懒加载，缺图只允许记录告警并跳过该帧，不得抛异常打崩战斗；但缺图或数量不符时 DoD 必须 FAIL。

预载断言的期望数量必须跟 PM 对下面“帧数待裁”给出的最终口径同步。当前请求目标写为 41 张（12+22+7），而现有 `kf1/125-1` manifest 是 7 个逻辑帧、6 张 saved PNG（1 张空帧被库规则剔除），故本方案不擅自把 40 或 41 写死到实现。

## 5. 触发、时序与中断策略

### 5.1 触发点

接受一次 `special` 施放的 `t0`，与出招 `04→05` 演出并行调用：

```text
T = castDurationMs（该次提交的速度快照）
fx.start('trial_fx_01', casterCellCenter, t0, T)
```

这不是伤害事件监听器：段 1 是否命中、目标是否为空、暴击与否都不改变光影时间轴。每次 accepted cast 只启动一次；rejected action 不启动。三层相对时间轴为：L1 `[0, .45T)`、L2 `[.35T, .90T)`、L3 `[.78T, T]`，重叠部分按 `lighter` 叠加。

### 5.2 中断、死亡与终局

- 施法者在 `t0` 后死亡：不回滚、不截断，视觉实例继续播放至 `t0 + T`；死亡姿态由既有棋子层覆盖。
- 目标死亡、段 1/段 2 消散或终局：不影响已接受的视觉实例；FX 播放器不写 HP、不掷 RNG、不发战斗事件。
- 逃跑、离开战斗或重建 session：按实例 ID 清空未完成 FX，防止旧战斗残留到新战斗。
- 图片加载失败：该帧跳过并记录路径；不得以占位色块冒充已通过的素材验收。

## 6. 文件面清单与禁碰区

| 类型 | 文件 | 本卡动作 |
|---|---|---|
| 类型 | `types.ts` | 只新增 `FxRecipe`/`FxLayerRecipe`/锚点偏移类型 |
| 播放器 | `ui/fx-player.ts` | 新建独立播放器与纯帧选择逻辑 |
| 战场接线 | `ui/battle-hex-render.ts` | 仅接入 L1 世界绘制 hook，不改现有格心/镜头公式 |
| 资源加载 | `ui/assets.ts` 或战斗 demo loader | 战斗进场预载 FX 帧并返回资源包 |
| 预览 | `preview/game-preview.html` | `FILES` 增加 `dist/ui/fx-player.js` 及其直接依赖；保证 loader 能解析 `require` |
| 测试 | `tests/fx-player.test.ts`（建议）及相关 render 测试 | 纯时窗/帧序/终止清理测试，禁止依赖真实微信运行时 |
| 素材 | `assets/ui/fx/trial_fx_01/**` | 仅落通过门的 PNG 与 SHA 清单 |

明确不碰：`cloudfunctions/settle/core.js`、`systems/battle-core.ts`、结算相关 `battle-session` 逻辑、`config/numbers.ts`、伤害/范围/RNG/行动条公式、WF-2 名条、音效。UI 层不得 import `battle-core`。

## 7. DoD（发卡验收清单）

- [ ] `typecheck`、构建、lint 通过；FX 纯逻辑单测全绿，原有 battle/render 用例零回归。
- [ ] 预览 `preview/game-preview.html` 的 `FILES` 能加载新增播放器模块，无 `module not preloaded`；开发者工具/浏览器控制台无资源路径错误。
- [ ] 固定 seed 的战斗预览可见 L1 聚气、L2 主体爆、L3 余韵三段，层间重叠呈加色效果；镜头拖动后锚仍在施法者中心格。
- [ ] 特功 `t0` 与 `04→05` 同步开始，x1/x2 只改变同一逻辑时钟下的播放速度；施法者死亡/终局仍按 §5 收尾。
- [ ] 入库目录逐帧数量、文件名顺序、透明 PNG、SHA-256 清单与 PM 最终帧数口径一致；`sha256sum -c SHA256SUMS.txt` 通过。
- [ ] 交付回执附 commit、文件路径和 runtime 落库状态；候选素材不得标成“已入库/已过门”。

## 8. 任务拆分建议

建议发 **一张纵向切片单卡**，把“类型契约 → 预载 → 播放器 → 战场接线 → 预览 FILES → 三层视觉验收”放在同一 DoD 下；这些环节共享同一配方和时钟，拆成独立卡会产生“能编译但无法看效果”的半成品。卡内可按三个阶段执行：

1. 类型与 `fx-player` 纯逻辑、单测；
2. 运行时预载、L1 hook、t0 接线；
3. 预览 FILES、SHA 核验、截图验收。

素材从候选目录拷贝到 runtime 目录是本卡前置门，不另开“组合后台”卡。PM 裁决帧数矛盾、确认上游素材文档/PNG 可从任务分支读取后，才把本方案转成实现卡。

## 待裁节

**Q-FX-01（已通过 projbus seq=147 发给研发线 PM）**：L3 `kf1/125-1` 表格为 7 个逻辑帧，但当前 manifest 只有 6 张 saved PNG，因 1 张空帧被剔除；请求中的“预载 41 张”与实际 40 张透明 PNG 不一致。需在实现卡前明确：恢复并入库空帧、按 40 张验收，或保留 7 帧逻辑时由播放器显式空帧占位。
