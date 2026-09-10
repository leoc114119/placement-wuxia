# T45 seq=304 · R1 右向组系数钳制候选交接

## 依据

承接 PM2/rd seq=302：seq278 walk+jump 组系数由 `0.8205128205` 钳制为 `min(256/312, 238/299)=0.7959866221`；seq279 atk 仍为 `1.1962616822`。禁止裁切、单帧缩放、重生成。

## 当前结果

- 9/10 帧机械门通过；walk 3、atk 4、jump 1/2 的源裁框×组系数与输出视觉 bbox 在 ±1 内，主体单连通、脚底、质心、边缘和清杂安全均通过。
- `jump_right_3` 的完整缩放内容宽 `238px`。若居中放在 x=6，alpha>32 质心约 `120.001`，但右边界有 alpha；若左移到 x=1，四边透明且内容完整，但质心约 `115.166`，不满足 x=120±1。
- 该帧不存在同时满足“四边透明 + 质心 x=120±1 + 不裁切”的整数放置；不能继续用裁切或单帧缩放修补。

## 非饱和刚性特征复核

- 测法改为手工解剖两点标注：玉冠外轮廓顶点 → 同一可见面的下颌/面颊下缘；不使用与 bbox 高度绑定的扫描 band。
- 保留帧 12 张读数：`85~87px`，中位数 `86px`，波动 `2.33%`；标注图：`calibration/retained_head_manual_annotations.png`。
- seq278 六帧源图逐帧标注：walk=`108/108/107px`，jump=`104/109/109px`；atk 组=`72/72/72/73px`；标注图：`calibration/source_head_manual_annotations.png`。
- 组系数：seq278=`min(86/108, 238/299)=0.7959866221`；seq279 atk=`86/72=1.1944444444`。
- 输出刚性特征回测：10 帧均在基准 `86px ±5%` 内；10 帧 SHA 互异；主体域删除 0、RGB 改动 0。

证据：

- 候选包：`assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq304/`
- QA：`qa/r1_right_seq304.json`
- 对照：`contact/right_r1_seq304_with_benchmark.png`

## 头部视觉反馈

Leo 指出 jump 三帧头视觉偏大。固定头部探针在 12 张保留帧上均为 `87px`，机械上没有单帧头部放大；jump 身体自然变短后头部占比更高。若 Leo 视觉门仍不接受，需要回源图重做/改选，不能在归一阶段单独缩头或缩 jump。

## 停点

问题登记：`tasks/questions/Q6-T45-r1-clamp-placement.md`。在裁定前不启动右上/右下 R1、Phase B、Phase C 或 runtime。
