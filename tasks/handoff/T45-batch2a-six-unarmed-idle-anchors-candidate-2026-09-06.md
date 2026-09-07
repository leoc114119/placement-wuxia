# T45 · 批 2a' 山贼甲乙六张空手待机锚交规格门

- Task: T45 / 批 2a'
- 交付状态：候选，Leo 目验已选定；正式运行时目录尚未写入
- 规格门：待研发线 PM（rd）复核
- 范围：`shanzei_a`、`shanzei_b` 各右 / 右上 / 右下 1 张空手待机身体锚，共 6 张

## 候选入口

- 统一 manifest：`assets/_trial_20260906/t45_batch2a_anchor_selection_v2_singleframe/manifest.json`
- 六张对照：`assets/_trial_20260906/t45_batch2a_anchor_selection_v2_singleframe/contact_six_selected.png`
- 甲·右居中修正 QA：`assets/_trial_20260906/t45_batch2a_anchor_selection_v2_singleframe/qa/recenter_canonical_a_right_qa.json`
- 修正说明：canonical 甲·右仅做确定性水平平移 +6px（全像素 alpha>32 质心 `114.2724 → 120.2724`），无重画；原图备份在同目录 `qa/shanzei_a_right_before_recenter_canonical.png`。

所有 PNG 均为 240×320 RGBA；manifest 逐项记录 alpha、可见框、可见高度、脚底基线、中心和 SHA-256。

## 关键生产约束

- 身体帧均为空手闭合握拳；没有刀、刀柄、刀鞘或其他武器。朴刀须以独立层另行验收。
- A 采用 Leo 确认的逐张闭环：右向 → 右上 → 右下。右下首稿朝向错误，第二次使用旧 A 右下成帧**只作姿势/前后层次参考**，新 A 右向锚仍是身份、比例与画风唯一真源。
- B 采用同一逐张闭环。B 右向已由先前双参考身高候选过 Leo 目验；右上与右下依次单帧审看。B 右下为两次尝试后的 Leo 选定稿。
- 个别 ImageGen 原图的浅色棋盘背景仅采用外沿连通、浅中性色的确定性抠除；A 右下另移除了一个脱离主体的棋盘残留连通域。无语义重绘。

## 请求 rd 规格门复核

1. 核对 6 张的尺寸、RGBA、可见高度 256、脚底 y=300、中心和命名候选是否符合 T45。
2. 核对空手身体层政策、三向方向语义和左右镜像前提。
3. PASS 后再指示正式落盘路径 `assets/characters/enemy/shanzei_a|b/battle45/`；当前不得提前写入。
