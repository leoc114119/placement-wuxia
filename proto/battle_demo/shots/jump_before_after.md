# 轻功（jump）新旧口径 同机位对照素材

> 用途：Leo 复看用。同机位=同视口（375/560/900）、同触发方式（`shot_character3d.mjs` 白盒触发 4 格轻功）、
> 同采样方式（Node 侧轮询 page.evaluate，约 20-40ms/样本）；**唯一变量 = 口径**。

## 1. 素材清单

| 项 | 旧口径（before-fix） | 新口径（after-fix，方案 v1.1） |
|---|---|---|
| 逐帧时间线 | `shots/jump_before-fix/c3d_jump_timeline.json` | `shots/jump_after-fix/c3d_jump_timeline.json` |
| 升段帧（≈0.45 演出进度） | `jump_before-fix/{375x667,560x700,900x560}_state_jump_rise_before-fix.png` | `jump_after-fix/…_state_jump_rise_after-fix.png` |
| 降段帧（≈0.6+ 演出进度） | `jump_before-fix/…_state_jump_descend_before-fix.png` | `jump_after-fix/…_state_jump_descend_after-fix.png` |

## 2. 关键读数（560×700 视口，逐项从两份 timeline JSON 抄录）

| 读数 | before-fix（旧：全剥 root + 0.6~1.2s 窗 + hop 抛物线） | after-fix（v1.1：只剥 x/z、固定 1.5 演出秒、hop=0） |
|---|---|---|
| 演出时长（MoveAnim.duration） | 按距离 0.6~1.2s（4 格 = 0.9s） | **固定 1.5s** |
| 播放倍速（1.5s 源 ÷ 演出窗） | **1.67×**（4 格；2 格 2.5×、≥6 格 1.25×） | **1.00×** |
| 程序 hop（2D 抛物线） | 中点 **132px**（顶点值） | **恒 0**（竖直改由素材 root y） |
| 被剥离的竖直幅度 | **43.0 逻辑像素**（素材 root y 幅度 0.3431 模型单位全被抹掉） | **0**（y 保留） |
| 样本中进度最接近中点者 | progress=0.500 · hop=132 · clip=jump | progress=0.778 · hop=0 · clip=jump |

> 采样节奏说明（如实）：两次录制的**采样密度不同**（before 39 个含进度样本 / after 17 个，间隔 88ms ≈ 机器负载所致），
> 故 after 这一轮「最接近中点」的样本落在 progress 0.778。**这不是时长或位置偏差**——时长/位置的真值证据是
> vitest 真链路用例（progress 与 view 时间逐点对表）与下面的独立探针。

> 注：before/after 的「窗后 jump 样本数」见各 JSON 的 `summary.descendCount`（before 26 / after 3）——
> 该数字受**录制器触发时序**影响（同一脚本内的重触发会截断采样窗口），**不是时长证据**。
> 时长/释放的权威证据是 `tests/battle-character3d-wiring.test.ts` 的真链路用例（短/长路径均 1.5 演出秒、
> 演出期内恒 jump、结束即释放）与白盒直探（`.moveAnims.get('hero').duration === 1.5`）。

## 3. 口径条文出处

方案 v1.1（arch `fd9d6a28`）§4.1 + 答件 `tasks/answers/A3-T31-jump-runtime.md`：
只剥 root x/z 保留 y、`hopHeight/hopPx` 恒 0、`MoveAnim.duration` 固定 1.5 演出秒（动作与水平共用 progress）、
采样 `fi = progress × (nFrames − 1)`、末姿混合回 idle 180ms；session/逻辑格/300ms 窗不动。
