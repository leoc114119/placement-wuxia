# T45 批 2b 山贼左系确定性镜像（动作帧 _2）

- 来源：已通过 Leo 目验与 PM 规格门的山贼甲/乙右系 `walk_*_2`、`atk_*_2` release 帧。
- 操作：Pillow `ImageOps.mirror`，只做水平翻转；不重绘、不裁切、不缩放、不改 alpha 或色彩。
- 产出：甲乙 × walk/atk × left/leftup/leftdown × `_2`，共 12 张透明 PNG。
- `die_common` 为全角色共用，不重复镜像；`_1` 仍待 Leo 逐张目验后再派生。
- 运行时目录暂不改，先交候选与机械 QA 做第二道规格门复核。
