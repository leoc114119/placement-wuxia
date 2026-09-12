# T45 seq=382 · idle 全套 2D 重绘中途交接

## 当前批次

目标：六向 × 5 帧 = 30 张 2D 手绘整帧候选。每张输入职责固定：同向 `风格_2D_<direction>.png` 锁 2D 描边/平涂/五官衣纹；对应 `姿势_3D_<direction>_<frame>.png` 锁姿势/朝向/比例/站位。输出 raw，PM2 后续统一缩放到 240×320、地面归一化和做 GIF。

任务书：projbus seq=382；成本 0；Codex 原生 image_gen；禁止 3D 渲染质感、resize、alpha restore、detailBlend、runtime 写入。

## 已完成

- `right` 方向 5/5：`idle_right_{1..5}.png`
- 已完成调用数：5；全部原生单次；raw 输出尺寸均 1086×1448 RGB
- 已落盘目录：`assets/_trial_20260912/2D重绘_idle全套/交付/`
- 固定 prompt：同目录 `prompt_used.txt`
- job 状态：已完成 5 张，其余 25 张待续

## 未完成

- `rightdown`、`left`、`leftdown`、`leftup`、`rightup` 各 5 张，共 25 张。
- 每张继续使用同方向 style 参考 + 对应 pose 参考；不使用跨方向参考，不做任何后处理。

## 禁碰区

- 不改 `assets/_trial_20260912/2D重绘_idle全套/输入/`。
- 不改 runtime/正式资产。
- 不处理 T45 敌型帧、贴图回填、3D 重渲或其他动作组。
- 不把 2D 结果缩回 240×320；尺寸配准由 PM2 后续处理。

## 线程交接原因

旧线程收尾健康读数：rollout `268.8 MB`、`37` 轮、压缩 `4` 次；未触 300MB，但剩余 25 次原生图像调用预计会越过线程轮换线。新线程应先读本文件、seq=382 派单、`tasks/LOG.md` 相关条目，然后继续 `rightdown` 第一帧。
