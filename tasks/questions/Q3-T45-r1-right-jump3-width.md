# Q3-T45 · R1 固定缩放下 right_jump_3 宽度超限

R1 30 帧归一已执行 29 帧通过；`right_jump_3` 使用该源批次固定缩放系数后，输出 `240×320` 中人物视觉宽度实测 `238px`，超过 R1 硬约束 `≤236px`，并有 22 个 alpha 边缘像素触边。

按 R1 禁止逐帧缩小、裁切或改动作。请 PM2 裁定该帧处置；在裁定前 Phase B 不启动，runtime 不改。

证据：`assets/_trial_20260910/t45_hero_weapon_recalib_r1_seq290/qa/r1_normalize.json`。
