---
name: art-pipeline-execution
description: 放置武侠 Codex 原生美术管线。用于角色、动作帧、换装、武器、UI、场景的原生生图或编辑、条件扣图、规格化、门检与交接；新任务禁止调用 mxai。
---

# Codex 原生美术管线执行手册 v1.0

> 历史审查副本（2026-09-08 标注）：下文保留旧版，不再作为当前执行入口。现行规则见 [项目 skill](../../.codex/skills/art-pipeline-execution/SKILL.md)，批次交付细则见 [收尾参考](../../.codex/skills/art-pipeline-execution/references/batch-closeout.md)。

> 状态：已安装为项目级 Codex skill；本文件是便于 C 环审查的同源副本。
> 适用：角色、动作帧、换装、武器、UI、场景的原生生图/编辑、条件扣图、规格化、门检与交接。
> 决策：新任务禁止调用 mxai；历史脚本暂不删除。

## 1. 开工真源

每次先读 `AGENTS.md`、`docs/PROJECT-MEMORY.md`、`tasks/LOG.md`、本次需求文档，以及《美术管线动作帧生产与复用体系研究报告》§九/§十。人物、动作、构图、方向和规格有两种解释时停问 Leo。

## 2. 工具路由

- 新生成、参考图编辑、局部修正和语义扣图只用 Codex 原生 ImageGen。
- 新任务禁止调用 `scripts/mxai_gen.py`、`scripts/mxai_img2img.py`、`scripts/mxai_web_cutout.js` 或任何外部生图 API。
- 本地工具只承担确定性工序：复制、切帧、镜像、纯色背景连通域扣图、尺寸归一、对齐、压缩、门检、contact sheet。任务书明确禁止脚本加工时，以任务书为准。
- 原生输出先进入 `raw/`，禁止直接写入或覆盖正式资产。

## 3. 参考图纪律

调用 ImageGen 前逐张打开并确认内容。参考职责按需组合：

1. 目标原帧或动作母版：只管姿势与构图；
2. 角色身份锚：只管五官、发型、服饰、色板与比例；
3. 目标朝向锚：只管前后层次和可见面；
4. Leo 标注图：只管唯一允许改动的部位或方向。

提示词逐图声明职责和冲突优先级，只挂解决本次问题所需的图。

## 4. 动作帧主路线

```text
Leo 确认三拍动作设计
→ right 三帧序列表母版
→ rightup/rightdown 整表转面
→ 左系确定性镜像
→ 分帧规格化
→ 三帧连播、六向总览、机械门
→ Leo 目验
```

单帧原生编辑只处理 Leo 已指出的局部问题；一次只改一个可观察目标。左右/方向问题优先用 Leo 标注图，不连续改写方位词猜测。

当前口径为：五官、人物比例和规格大小不得变化；动作语义、三拍相位和朝向仍须一致。任务书更严格时，以任务书为准。

## 5. 每帧最多两次

- 一次生成、图像编辑或原生语义扣图各计一次尝试。
- 本地确定性切帧、镜像、扣纯色底、归一、检测和拼对照不计生成尝试。
- 第 1 次给完整候选；第 2 次只修一个明确缺陷。
- 第 2 次仍不过视觉门，登记失败并停手。Leo 明确批准追加时记录为一次性豁免。

## 6. 固定提示词骨架

```text
【任务】编辑图1中的既有游戏角色素材。
【参考职责】图1=动作与构图真源；图2=人物身份和画风真源；图3=目标朝向真源；图4=唯一允许改动区/方向标注。
【必须保持】五官、脸型、发型发饰、服装结构与配色、头身比例、相机视角、全身尺度、脚位和动作相位。
【本次唯一改动】<一个可观察改动>。
【生产背景】优先真实透明；若透明不可控，使用皮肤包指定的单一纯色隔离底，无渐变、纹理、棋盘格或阴影。
【禁止】武器、文字、水印、地面、投影、粒子、新配饰、额外肢体、重设计动作、改变脸和比例。
```

动作修帧禁用“更自然、更有力量、更精致”等开放词。画质要求写成可核对的断线、描边、噪点和边缘问题。

## 7. 条件扣图

先读取真实尺寸、模式、alpha 极值和四角颜色：

1. 有可用 alpha，外围透明且边缘干净：跳过扣图。
2. 无 alpha，但背景为与角色色板分离的单一纯色：走本地边缘连通域扣图，再做去染与多底衬检查。
3. 白衣、发丝或复杂背景无法确定性分离：最多用一次原生语义扣图；它计一次生成尝试，仍须复查五官、轮廓和动作。
4. 语义扣图重绘主体、仍无 alpha 或超过尝试上限：规格 FAIL，如实报告。

主角大面积青绿且有白衣白裤，隔离底默认候选为 `#FF00FF`；正式使用前对角色色板做距离检查并写入 skin manifest。严禁用全图亮度阈值抠除白衣。

## 8. 四道门

| 门 | 必检项 |
|---|---|
| 身份门 | 五官、脸型、发型发饰、服装结构/配色、头身比 |
| 动作门 | 相位、出手臂、伸屈、出招轴、脚位/重心、跨向同招 |
| 连播门 | 身高、体宽、腰线、衣饰和前后层次无跳变 |
| 文件门 | 任务书尺寸、真实 alpha、主体高度、中心、脚底基线、命名、无背景/影子/武器/文字 |

视觉通过与规格通过分开记录。预览像透明但实际 alpha 全 255 或 `hasAlpha=no` 的文件不过文件门。

## 9. 作业包与状态

```text
assets-pipeline/characters/{role}/{skin}/{action}/{job_id}/
├── request.md
├── refs.json
├── prompts/
├── raw/
├── normalized/
├── qa/
├── contact/
└── job.json
```

状态用正交字段：

- `artifactStage`: `request | raw | normalized | candidate | release`
- `visualReview`: `unreviewed | selected | rejected`
- `specGate`: `pending | pass | fail`
- `integrationGate`: `not_handed_off | accepted_by_zcode | runtime_verified`

运行时目录只放 release 文件和 `manifest.json`。左系独立 PNG 的 manifest 必须记录 `derivedFrom` 与 `flipX`；左右不对称时按 `mirrorPolicy` 停止裸镜像。

## 10. Codex → ZCode

1. 详细正文落 `tasks/handoff/`、`tasks/questions/` 或 `tasks/answers/`；
2. 对应 thread 写摘要；`tasks/LOG.md` 写事件索引和文件路径；
3. Leo 转达交接路径；ZCode 回复须回显 Task ID、基线 commit、manifest 版本；
4. 未收到基线 ACK 前，不把 ZCode 侧实现视为已开始或已接受。

LOG 不承载长正文。状态变化使用 `scripts/task.py`；禁止手改 `tasks/box.db`。

## 11. 当前金丝雀

`assets/_trial_20260905/t45_native_opt/candidates/atk_rightup_2_attempt4.png` 的状态是：

```text
artifactStage=raw
visualReview=selected
specGate=fail
integrationGate=not_handed_off
```

它用于验证“条件扣图 → 240×320/主体高256/x120/脚y300 归一 → 多底衬边缘门 → 与 rightup_1/3 连播 → 三联对照”的首个闭环。任何机械门失败都停报，不覆盖正式帧。
