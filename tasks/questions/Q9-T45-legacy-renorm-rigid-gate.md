# Q9-T45 · 旧批重归一试点的刚体门与 v2 互校冲突

依据 seq=342 与 `tasks/handoff/T45-legacy-renormalization-plan-20260910.md`，已完成右向 10 帧纯确定性试点；runtime 未改，候选包在：

`assets/_trial_20260910/t45_legacy_renorm_right_pilot_seq342/`

## 已确认事实

- 锚帧青玉色掩膜宽 34px、人物 `alpha>32` 高 1102px；公式严格按派单执行。
- 10/10 帧文件/几何/无裁切/主体单连通/帧间 SHA 门通过；10/10 帧加工安全证据为 `subjectDomainDeletedPixels=0`、`rgbChangedPixels=0`。
- 按公式得到输出高：walk `224/205/209`，atk `241/241/241/243`，jump `168/208/218`。
- 现行 v2 同帧高：walk `246/255/248`、atk `246/238/234`、jump `212/225/229`。因此 walk 三帧均超 v2 ±5%，jump_1/2 超 v2 ±5%；QA 的 `v2CrossCheckPass=false`。
- 输出绿色青玉探针实际宽：walk `9/7/7`、atk `8/8/8/8`、jump `8/7/7`。连续理论宽均为 `7.8984px`，但实际像素门的 walk/jump 极差分别为 28.57%/14.29%，所以 QA 未把理论值冒充独立输出实测。

## 请裁定

1. 是否继续严格采用 seq=342 §六的绿色青玉判据与逐帧公式，并接受本试点 v2 互校失败、停止铺量；还是允许为满足 v2 ±5% 互校更换刚体定义/系数？
2. “输出刚体宽极差 ≤5%”应按当前输出绿色探针的离散像素实测，还是按 `sourceCrownWidth × coefficient` 的连续理论值？若采用外轮廓/白三角，请给出精确颜色/连通判据与锚值。

停点：未获裁定前不铺其余旧右向帧、不处理右上/右下、不生成左系、不改 runtime。
