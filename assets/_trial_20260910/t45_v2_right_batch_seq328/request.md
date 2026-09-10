# T45 seq=328/330 · V2 三锁四样本门

依据：rd→art projbus seq=328 / 美术素材生成稳定流程 v2。

## 当前阶段

先检 4 帧样本：`idle_right`、`walk_right_1`、`atk_right_1`、`jump_right_1`。四帧门通过后，才生成剩余 6 帧：`walk_right_2/3`、`atk_right_2/3`、`jump_right_2/3`。

## 三锁

1. 唯一比例/身份锚：`assets/characters/hero/battle45/battle_idle_right.png`。保持人物身份、头身比例、服装、画风和总体尺度；禁止缩放、拉伸、改头身比。
2. 一族一表：后续 10 帧在同一任务组生成，使用同一源表/同一比例设定；马尾落点保持在站立锚的稳定范围，禁止大幅甩动造成头部视觉漂移。
3. 输出规格锁：无文字/水印/武器，透明 RGBA 240×320，脚底 y=300，alpha>32 加权质心 x=120±1，四边零 alpha，alpha>32 单连通；样张阶段保留原生 raw 与确定性处理证据。

系数只在四样本源图到达后按 `idle_right` 人物 alpha>32 bbox 高统一计算，禁止头/脸/五官/马尾/投影 span 定系数，禁止逐帧缩放。直立 `idle/atk` 输出人物 bbox 高须为 `256±1`；walk/jump 高度如实记录。

当前结果：`atk_right_1` 两次原生候选均未达 `256±1`，四样本门 FAIL；已达到普通原生两次上限，停在裁定点，不生成剩余 6 帧。状态：candidate-only；生成额度与输出 SHA 记入 QA；runtime 未改。
