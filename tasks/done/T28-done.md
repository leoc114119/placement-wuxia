# T28 交付回执 · hero 武器层接线（第一批 26 帧）

> 交付链：frontend-battle 施工（commit `c16ba433`，分支 `task/hero-weapon-layer` 已 push）→ PM 四门+视觉复验 PASS → 待主架构技术验收（projbus seq=247）→ 待 Leo L 环

## 施工回执摘要（frontend-battle）

- 无疑义开工；**两处技术裁决**：
  - **D1 蒙版导入期转换**：候选 18 张蒙版为 8bit 灰度（luma=erase），运行时转换实测 file:// 预览 canvas 污染（getImageData 抛错拖垮启动）→反转为导入脚本零依赖 PNG 编解码转 RGBA+回读逐像素校验；剑层（美术本体）逐字节复制；runtime SHA=转换产物、候选 SHA 留 candidateMaskSha256 溯源。运行时零 getImageData
  - **D2 layerOrder 扩 body_front**：候选 manifest 本体含 10 行 body_front（QA 三联图佐证剑在身体后），以 manifest 为真源扩枚举 weapon_front|body_front（方案草写仅 weapon_front，强锁单值则 26/26 不可满足）——已提请主架构复核
- 过程记录：一次误写只读主目录已当场恢复（PM 复核无残留）
- D3：config/hero-weapon-layer.ts 键=spriteKey→bodySrc（仅 hero；NPC/敌方需授权）；weaponLayerOf 注入式=第二批 cast 扩展缝；绘制 body_front 剑先画→身体→weapon_front 叠画，同 left/top/w/h 零旋转

## 四门（代理自检+PM 实测一致）

| 门 | 结果 |
|---|---|
| typecheck/lint/build | 零错（bundle 重建 verTag v1788946316336） |
| test:battle | **405 passed / 0 failed**（+16 新用例；fx-player 30/wf-banner 23/battle-hex-render 102 零回归） |
| test:behavior | 14/14 |
| preflight | 26/26 PASS+负例复现非零退出；SHA256SUMS 全过；destination-in/.rotate 红线扫描零命中 |

## PM 视觉复验（shots 实图）

- `weapon45_560x700_idle_right.png`：右手持剑自然 ✓
- `weapon45_560x700_atk_right_2.png`：举拳出剑、剑随拳位 ✓
- `weapon45_560x700_idle_rightup_bodyfront.png`：右上向剑在身后（层序生效）✓
- 缺口诊断图：walk_rightdown_2 钉帧显式空手无借帧 ✓

## 禁碰区自查

battle-core/settle/numbers diff=0；敌方 profile/资源零改动；T25/T26/T27 语义零碰；运行时零 _trial 引用。

## 待办

1. 主架构技术验收（seq=247，两处裁决请其复核）
2. Leo L 环（有剑帧 idle/走动/普攻效果亲验）
3. 通过后并 main（PRE-FLIGHT B）
4. 第二批 cast 9 帧到后同接口扩展（weaponLayerOf 缝已留）
