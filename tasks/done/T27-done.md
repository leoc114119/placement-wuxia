# T27 交付回执 · 山贼六向身体帧接线（第二段）

> 交付链：frontend-battle 施工（commit `4bc19b81`，分支 `task/shanzei-2b-wiring` 已 push）→ PM 四门+视觉复验 PASS → 待主架构技术验收（projbus seq=209）→ 待 Leo L 环

## 施工回执摘要（frontend-battle）

- 无疑义开工；架构自决：profile 工厂 shanzeiDirectionalProfile（甲/乙同形异目录，clipCounts jump:0/cast:0）、charge/strike→atk 降级为 profile 数据映射（directionalFrameOf 零 actor.side 特判，测试源码扫描锁）、npc-shanzei 第一段默认键保持 legacy 零迁移、legacy 回退=URL ?enemy=legacy+红字宣告
- 预检双通道：预览运行时门（assetGate 红条+占位剪影不崩）+ CI 门 tools/preflight_enemy_sixdir.mjs（62 张逐张 manifest/IHDR 240×320 RGBA8/SHA 三方一致/die 三处基线 ae5a6ac7/cut 隔离）
- 与 hero 段基建复用：facingHex 单点导出/directionalFrameOf/sharedSrc 单次解码，本卡零改 battle-hex-render/systems
- **重要发现**：shot_sixdir.mjs setUnit 双参 evaluate 缺陷（playwright 单 arg 转发→Object.assign 静默 no-op）——修复前 main 上第一段 hero 六向截图为同帧假证据；已修（11 状态哈希互异）。hero 功能本身 Leo 09-06 L 环真人验收过，属脚本证据层缺陷；第一段证据补复验可另卡
- 阵地遗留半成品逐项重验后修复交付（未轻信）

## 四门（代理自检+PM 实测一致）

| 门 | 结果 |
|---|---|
| typecheck/lint/build | 零错（bundle 11 模块 verTag v1788868837895） |
| test:battle | **389 passed / 0 failed**（battle-hex-render +24；fx-player 30、wf-banner 23 零回归） |
| test:behavior | 14/14 |
| SHA | 甲 31/31、乙 31/31；die_common 三处（hero/甲/乙）SHA 唯一=§9.3 基线 |
| 浏览器 | shot.mjs 16 PASS（帧日志 npc-shanzei-a:31/31 b:31/31）；behavior_e2e 11/11；shot_enemy_anchor sixdir exit 0（feet−cell=6.3px，weaponAnchor=reserved_not_implemented） |

## PM 视觉复验（shots 实图）

- enemyA `idle_left`：山贼甲面朝左（朝向主角）方向正确，240×320 新帧系形象精致 ✓
- enemyA `dead`：白骨躺平正确、山贼乙站立敌我同屏 ✓
- 六向截图 114 张留档（3 视口×六向 idle/walk/basic/charge/strike/dead+enemyB+legacy 诊断）

## 禁碰区自查

battle-core/settle/numbers/types/battle-session/battle-hex-render/fx-player/wf-banner/battle-input 零 diff；cut/ 未进运行时路径（preflight 断言）。

## 待办

1. 主架构技术验收（seq=209）
2. Leo L 环（六向走位/攻击/白骨死亡观感）
3. 通过后并 main（PRE-FLIGHT B）；朴刀叠层卡待 Leo 与美术的武器处理落地后另发
4. 挂账：第一段 hero 六向脚本证据补复验（另卡可选项）
