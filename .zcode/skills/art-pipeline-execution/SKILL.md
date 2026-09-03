---
name: art-pipeline-execution
description: 放置武侠美术管线执行手册（12 类试产/生产通用）——每类前置检查、逐步命令、预期输出、校验点、异常分支表；执行美术生成任务的代理开工必读，与《美术素材生成流程规范》配套使用
metadata:
  type: reference
---

# 美术管线执行手册（art-pipeline-execution）

**定位**：本 skill 是《美术素材生成流程规范》（`docs/design/01-基础功能/美术素材生成流程规范.md`，下称"规范"）的**步骤级执行细则**。规范=口径真源（成本路由/红线/可靠度）；本 skill=每一步的确切命令、预期输出、校验点、异常处置。两者冲突时**以规范为准并停上报登记**，禁自行调和。

**加载方式**：执行任何美术生成任务前，通读本 SKILL.md + `references/common-pitfalls.md` + 本次要执行的类别文件（`references/cNN-*.md`）。引用到的其他类别文件按需读。

## §1 全局前置（每个任务开工前逐条执行，任一失败停上报）

```bash
cd <仓库根>            # Bash cwd 跨调用残留，必须先回仓库根
source ~/.zshrc && echo ${MX_AI_API_KEY:+OK}   # 预期输出 OK，否则上报 E-ENV-01
python3 -c "import PIL; print('PIL OK')"       # 预期 PIL OK，否则上报 E-ENV-03
ls assets/_trial_<日期>/ 2>/dev/null || mkdir -p assets/_trial_<日期>   # 试产根目录
```

- 禁 `pip install`、禁改环境变量配置、禁装依赖——环境缺什么报什么（E-ENV-03）。

## §2 重跑权限界定（本 skill 最重要的一节，先读再干活）

| 失败性质 | 判定标准 | 处置 |
|---|---|---|
| **机械性失败** | 网络/超时/API 报错、返回图损坏打不开、尺寸不符、画面出现文字/水印、主体缺失或画错（要单体却画了手）、**锚定表左格被改动**、脚本崩溃 | **同命令同参数重跑至多 1 次**；重跑仍失败 → 停上报。每次重跑记入报告 |
| **审美性判读** | 好不好看、像不像、风格对不对、构图舒不舒服、比例观感 | **无权判、无权重跑**：产出即停，样张交 Leo。判读依据只能是程序化校验项 |
| **无法判定** | 说不清是机械还是审美 | 一律按审美处理：停上报 |

- 重跑 = 完全相同命令+完全相同 prompt 文件；**改一个词再跑 = 重摇 = 越权**。
- 已废止工具（`clean_white_residue.py`、`surgical_clear.py`、seedream 档）在任何异常下都**不得启用**。

## §3 异常上报格式

`E-XX-NN｜类别NN｜步骤号｜现象原文（stderr 或实测值）｜已做处置｜需要 Leo 什么`

- 写进报告该类「卡点」小节；**单类阻塞不弃任务**，登记后继续下一类；`E-ENV-*` 全局环境异常除外（全停）。
- 异常码总表见 `references/common-pitfalls.md`。

## §4 产出与落盘纪律

- 一切产出落试产隔离目录 `assets/_trial_<日期>/cNN/`；prompt 文件随产出存 `cNN/prompts/`；**禁碰定稿/在库资产**（只读引用可以）。
- 目标文件重名已存在 → **停上报 E-ENV-05**，禁覆盖、禁加后缀绕过。
- 坐标/尺寸/对齐/像素校验一律 PIL 程序化实测，禁看图目测（规范红线 3）。
- 每次生图落 `credits.json`（name/model/cost/ts/note）。

## §5 0 自由发挥自检（每类完成后逐类作答，写进报告）

1. 实跑命令与本 skill/任务书是否逐字一致？任何偏差及原因。
2. 所用 prompt 全文；是否仅含冻结客观条款 + 任务书/规范已拍板主观条款？有无自拟新表述？
3. 流程中出现过的每一个「要不要 X」自决念头（哪怕未执行）。
4. 每道门结果；失败是否停上报而未自决重摇/换工具/回退废止脚本？
5. 产出物路径+尺寸+成本；credits 是否完整。

## §6 类别索引

| 文件 | 类别 |
|---|---|
| `references/c01-walk-frames.md` | 类1 行走帧（无武器锚试产） |
| `references/c02-breath-frames.md` | 类2 呼吸帧（程序化） |
| `references/c03-battle-idle.md` | 类3 战斗待机（锚定表法） |
| `references/c04-action-frames.md` | 类4 动作帧（锚定表法） |
| `references/c05-weapon-layers.md` | 类5 武器独立贴图 |
| `references/c06-enemy-npc.md` | 类6 敌人/NPC 检测走查 |
| `references/c07-scene-bg.md` | 类7 场景底图压缩实证 |
| `references/c08-hex-tiles.md` | 类8 六边形瓦片双样张 |
| `references/c09-ui-components.md` | 类9 UI 组件无字重切 |
| `references/c10-icons.md` | 类10 图标样板 |
| `references/c11-avatars.md` | 类11 头像双路线对照 |
| `references/c12-vfx.md` | 类12 特效（N/A） |
| `references/common-pitfalls.md` | 通用异常处置表（先读） |
