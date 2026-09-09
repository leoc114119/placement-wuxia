# T29 交付回执 · hero 武器层 R2（独立剑模运行时合成）

> 交付链：frontend-battle 施工（7 commit 链 `c16ba433..3aa004dd`，分支 `task/hero-weapon-layer` 已 push）→ PM 四门+视觉复验 PASS → 待主架构技术验收（projbus seq=267）→ 待 Leo L 环（出招长剑完整显示终验）

## 施工回执摘要（frontend-battle）

- 无疑义开工；7 commit 分阶段（方案引入→素材落库→合成管线→preflight→测试重写→截图/CRC 修复→标准截图刷新）
- **越界 layer**：loader 期每行一次合成——单离屏 layer（weaponLayerRectOf = body 240×320 ∪ 旋转 bounds + 2px margin）内完成旋转剑模+挖拳+身体入层；weapon_front 用 destination-over 身体垫挖孔剑下（与 §4.3"先身体后叠挖孔剑"逐像素同构）；drawPieces 仅一次 source-over 贴回；wx 端逐帧零开销
- **profile v2**：WEAPON_MODELS 两件全局元数据 + 48 行 HeroWeaponRuntimeRow（行持模型键不复制路径）+ sourceLedger 五源 SHA；layerOrder 前缀映射二值枚举；mask 治理沿 T28 先例（22 行消费：16 复用+6 第二批转换导入；34 行候选 SHA 溯源）
- **左模握点修正**：[64,57] 派生（左模=右模 flipX 逐像素镜像 7040/7040 一致）；误用右值会左系 24 行绕错点旋转横移 41px——已修正+preflight 锁
- **截获两缺陷**：生成器 crc32 笔误（>>>0 应 >>>8）致 6 张 cast mask CRC 错浏览器拒载（自研解码器不查 CRC 故 v1 预检未拦——已补 chunk 级 CRC 编码自锁）；loader modelImgOf 键值错配致全 48 行空手（已修）
- 越界实证：14 行越出身体矩形（frame04 右越 29.7px/frame22 左越 33.3px，layer 上限 275.3×324 源空间）

## 四门（代理自检+PM 实测一致）

| 门 | 结果 |
|---|---|
| typecheck/lint/build | 零错（bundle 重建 verTag v1788875921…） |
| test:battle | **415 passed / 0 failed**（weapon-layer 26 新用例；fx-player 30/wf-banner 23/battle-hex-render 102 零回归） |
| test:behavior | 14/14 |
| preflight | exit 0：48 行/双模型/蒙版/SHA256SUMS 28 项/越界与 preview 画布推演全绿；负例 3/3（错模型/错 SHA/角色矩形 clip） |
| 浏览器 | shot.mjs 16 PASS；behavior_e2e 11/11；weapon 截图 GATE PASS（assetGate 48 行全载+缺口诊断恒空） |

## PM 视觉复验

- `weapon45_560x700_atk_right_2.png`：出招长剑完整显示，越出身体矩形向右上伸展（Leo 验收点达成）✓
- 禁碰区 diff=0（battle-core/settle/numbers/types/T25/T27/NPC 层）

## 待办

1. 主架构技术验收（seq=267）
2. Leo L 环（出招长剑完整显示终验）
3. 通过后并 main（PRE-FLIGHT B）；第二批 cast 帧已随 48 行一并接入（施法剑帧同步生效）
