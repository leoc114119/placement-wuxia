# T26 交付回执 · WF-2 武功名条

> 交付链：frontend-battle 施工（commit `df47d1b`，分支 `task/fx-trial-01` 已 push）→ PM 四门+视觉复验 PASS → 待主架构技术验收（projbus seq=169）→ 待 Leo L 环

## 施工回执摘要（frontend-battle）

- 无疑义开工；自决 1 点：safePx=8（蓝图未给值，窄屏防御位，config 留痕）
- fan-out 收敛：CAST_SKILL_IDS(特+绝) 单 FxCastGate 实例（三拦截语义/去重键零改动）→ startCastPresentation 分流：特技=光影+名条、绝学=仅名条；一个 accepted cast 恰一次 fan-out
- WfBannerPlayer 同构 fx-player（start/update/draw/clearAll，最小展示包 {text,tier,anchorWorld,startedAtSec}，禁 import battle-core）
- 施工中自建接线缺陷 1 个（漏 update(view.time) 相位不推进）已修+e2e 断言
- 截图基建：shot_wf_banner.mjs 页内 16ms 预挂采样器测寿命（规避事件钟/view.time 零点差+playwright 往返时延）

## 四门（代理自检+PM 实测一致）

| 门 | 结果 |
|---|---|
| typecheck/lint/build | 零错/过（bundle 11 模块 rebuild+verTag bump） |
| test:battle | **370 passed / 0 failed**（fx-player 25/25 零回归 + wf-banner 新 23 用例） |
| test:behavior | 14/14 |
| shot | shot.mjs 16 PASS（红线保持）；shot_wf_banner.mjs 24/24 两轮稳定 |

## PM 视觉复验（shots 实图）

- 特金"特"（wf_x1_560x700.png）：金色填充+墨描边清晰，与 T25 聚气光环同屏同刻 ✓
- 绝学金红渐变"绝"（wf_jue_x1_375x667.png）：渐变可辨，与特技纯金区分明显 ✓
- 字号显著大于伤害数字（1.5×定尺单测锁定）✓；描边投影草地上不丢字 ✓

## 禁碰区自查

git diff types.ts systems/ config/numbers.ts config/battle.ts = 0 行；结算/事件契约/40 PNG 素材/音效零改动。

## 待办

1. 主架构技术验收（seq=169）
2. Leo L 环：光影（T25 修复版 c189741）+ 名条（df47d1b）+ L3 月牙观感一起验
3. 通过后任务分支并回 main（PRE-FLIGHT B + main 守卫）
4. 挂账：preview loader 并发竞态（既有）；段1 致胜终局快照缺口的结算域补建（AS-9，另账）
