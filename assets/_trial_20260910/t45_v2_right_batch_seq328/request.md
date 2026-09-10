# T45 seq=328/330/333 · V2 三锁十帧批次

依据：rd→art projbus seq=328 / 美术素材生成稳定流程 v2。

## 当前阶段

四帧样本门已按 seq=333 裁定通过；本批已生成完整 10 帧：`idle_right`、`walk_right_1/2/3`、`atk_right_1/2/3`、`jump_right_1/2/3`。

## 三锁

1. 唯一比例/身份锚：`assets/characters/hero/battle45/battle_idle_right.png`。保持人物身份、头身比例、服装、画风和总体尺度；禁止缩放、拉伸、改头身比。
2. 一族一表：后续 10 帧在同一任务组生成，使用同一源表/同一比例设定；马尾落点保持在站立锚的稳定范围，禁止大幅甩动造成头部视觉漂移。
3. 输出规格锁：无文字/水印/武器，透明 RGBA 240×320，脚底 y=300，alpha>32 加权质心 x=120±1，四边零 alpha，alpha>32 单连通；样张阶段保留原生 raw 与确定性处理证据。

系数只在四样本源图到达后按 `idle_right` 人物 alpha>32 bbox 高统一计算，禁止头/脸/五官/马尾/投影 span 定系数，禁止逐帧缩放。直立 `idle/atk` 输出人物 bbox 高须为 `256±1`；walk/jump 高度如实记录。

当前结果：四样本门按 seq=333 收窄为 PASS；完整 10 帧固定系数归一与机械门 10/10 PASS。状态：candidate-only，待 PM2 终门；生成额度与输出 SHA 记入 QA；runtime 未改。
