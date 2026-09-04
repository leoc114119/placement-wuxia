# T23 交付回执 · 战斗 UI 实装（frontend 单卡）

> 交付 commit `907f639`（12 文件 +622/−96）· 已 push（76b521c..40bb721）
> PM 四门独立复验：**全过** · 状态：**待 Leo L 环验收**

## 一、DoD 逐项对表（PM 复跑值）

| DoD 项 | 回执值 | PM 复跑 | 结果 |
|---|---|---|---|
| ① 主套件全绿+新基线登记 | 199 绿 14 跳（+5） | 199 passed / 14 skipped | ✅ |
| ② 行为面 14/14 保持 0 红 | 14 passed | 14 passed | ✅ |
| ③ shot 16/16 | 16 PASS | 16 PASS / 0 FAIL（资源日志：topbar/三脸/三图标全 ok） | ✅ |
| ③ e2e 9 项保持+V1/V4 | 11 MATCH | 11 MATCH / 0 异常（V1 实录 hpFrac 1.000→0.940、neiliFrac 0.600→0.590；V4 托管↔自动镜像双写一致） | ✅ |
| ④ DBG=0 | 0 | 0 | ✅ |
| ④ verTag bump | v1788484485658 | index.html diff 确认；t23v1 在库、t16v2 零残留 | ✅ |
| 三零 | 0/0/0 | typecheck/lint/build 全净 | ✅ |
| §一.1 零改动清单 diff=0 | 自查过 | `git diff 907f639^ 907f639 -- types.ts systems/battle-session.ts systems/battle-core ui/battle-input.ts systems/hex.ts config/battle.ts net cloudfunctions` = 空 | ✅ |

## 二、红线专项

- **绿 rim 段删除**：`rgba(160, 240, 160, 0.9)` 仅存于负向锁用例字符串（render 测 :1000-1002）；`config/battle-hex.ts:101 moveEdge 0.8` 为行走格绿边既有常量，非激活 rim，不属残留。
- **main.ts 仅授权段**：onPlaque 唯一残留=移除说明注释；speedOn/uiState/evCursor/`__demo` 零改动（R4 形状锁绿）。
- **e2e 既有 9 项零改动**：diff +129 行全为尾部追加 T23-V1/V4 段。
- **input 层零 diff**：battle-input.ts 在红线清单，确认 0 行。
- **休眠 hit 钩子字节存活**：R10 用例绿。

## 三、架构决策（frontend 报告摘录，PM 认可）

1. 状态图标映射表落 `BATTLE_HEX_RES.statusIcons`（路径唯一出处=素材路径表）；渲染层经 `assets.statusIcons: Map` 消费。
2. 图标绘制尺寸用已加载 PNG 实际宽高 ×k，不落第二份尺寸常量。
3. ctrl 文字中心按 `(132,66)/216×btnW` 双轴同用钮宽比例（meta 最新值 132）。
4. 缺图降级逐钮独立判空（部分缺图不整体降级）；激活态金框/叠亮与有脸解耦。
5. 代码字阴影按 meta shadow_offset 3 以深色错位垫底实现。
6. 柔光 `glowAlpha 0.22` + 叠亮 0.2 lighter 暖色，均 config 外置待 L 环手感微调。
7. V3「点击无反应」由等效链覆盖：input 零 diff（git 证）+ plaque 热区单测零回归 + main.ts 无 onPlaque；V2 空槽观测并入 V1 段（statusN=0）。
8. 防除零锚=`Math.max(1, max)`（现行 :875 同防），断言锁不产生 NaN/Infinity+满宽 100%。

## 四、文件清单（12 文件）

代码：`config/battle-hex.ts`、`ui/battle-hex-render.ts`、`proto/battle_demo/main.ts`、`proto/battle_demo/bundle.js`、`proto/battle_demo/index.html`
测试：`tests/battle-hex-render.test.ts`、`tests/battle-hit-feedback.test.ts`、`proto/battle_demo/behavior_e2e.mjs`
留档：`proto/battle_demo/shots/t23_topbar_full.png`、`t23_topbar_damaged.png`、`t23_ctrl_normal.png`、`t23_ctrl_active.png`

## 五、L 环验收清单（给 Leo）

打开 `proto/battle_demo/index.html`（或 preview），开局后看四件事：

1. **顶栏真实数据**：名字「小虾米」+ 血/内力双条实时刻度——被打掉血、放特技扣内力，条与百分比跟着动
2. **ctrl 三钮实装脸**：右下三钮为切图实装+代码字
3. **激活态**：托管钮点击→变「自动」金框点亮；加速点击→变「两倍」金框点亮；再点回「托管/加速」熄灭；**无绿点绿框**
4. **plaque 木牌**：左上已设计 UI 上板，点击无反应（占位）
5. 手感参数（柔光强度/叠亮度/字位）均可 config 微调，目验不顺眼即报
