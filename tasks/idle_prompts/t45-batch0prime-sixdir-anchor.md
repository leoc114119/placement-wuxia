# T45 批 0' 任务书 · 六向制三向锚（right / rightup / rightdown）

> 需求依据：`docs/design/01-基础功能/T45战斗帧45度-需求文档-v2.0.md`（六向制）+ c13 手册。
> 目标：右系三向 45° 待机锚各 1 张（Leo 目验定锚后始铺批 1a/1b/1c）。
> 预算：3 张 × 2 分 = **6 分**，零重摇目标；重摇权归 Leo。

## 0. 开工步（强制）

1. 复述 SKILL《art-pipeline-execution》**§1b 五条纪律 + §1c 九条示意图规格**，逐条列出后才开始干活。
2. 核对参照资产存在且目验内容（红线 13）：
   - `assets/characters/hero/walk_q/frames/idle_down.png`（画风锚，家场景标准帧）
   - `assets/characters/hero/battle45/battle_idle_down.png`（45° down 锚：视角/戒备姿势基准）
   - `assets/_trial_20260904/t45_batch0sixdir/refs/ref_right.png | ref_rightup.png | ref_rightdown.png`（白模裁带，已过目验：右=纯侧朝右/右上=背斜侧朝右上/右下=斜正面朝右下）

## 1. 逐锚生成（循环 3 次，向序：right → rightup → rightdown）

```bash
cd /Users/leochen/WorkBuddy/Claw/placement-wuxia
python3 scripts/mxai_img2img.py \
  assets/characters/hero/walk_q/frames/idle_down.png \
  assets/characters/hero/battle45/battle_idle_down.png \
  assets/_trial_20260904/t45_batch0sixdir/refs/ref_<向>.png \
  --out raw/anchor45_<向>_raw.png \
  --prompt-file prompts/anchor45_<向>.txt \
  --aspect 3:4
```
- 参照顺序与 prompt 声明严格一致（1=画风 2=视角姿势 3=朝向白模）。
- 每张 2 分，落 `credits.json`（name/model/cost/ts/note）。

## 2. 抠图+归一（每锚）

1. mxai 统一通道抠图（`scripts/mxai_web_cutout.js`；登录态失效按 E-CUT-01 重试 1 次后停报）。
2. PIL 归一 240×320：**视觉高 256px、脚底 y=300、质心 x=120**；宽高比带 **0.38~0.55**（锚=待机姿势，必须带内；09-04 制备笔误曾写 0.40~0.55，批 0prime 实按文档带判定，特此对齐——需求文档 §5 为准）。
3. 程序门：白角 ≥250 / 通道差 ≤2 / 单连通主体 / 无文字 / 无武器。任一失败按异常表处置（机械失败重跑 1 次；再犯停报）。

## 3. 交付停点

- 产出：`anchor45_right.png / anchor45_rightup.png / anchor45_rightdown.png`（暂存本批目录，**不入 battle45/**——定锚后由主会话落库）+ raw/ + credits.json + contact_sheet_0prime.png（三列，带向名标签）。
- 汇报必须附**每张画面内容逐项描述**（头朝向/可见部位/马尾位置/拳位/站姿，§1b-2）。
- **停点候 Leo 目验定锚**：朝向对白模映射 / 俯视头身 / 铃兰式形象一致 / 空拳无武器。不过不铺量。

## 4. 异常分支

| 情形 | 处置 |
|---|---|
| E-GEN-01 轮询超时 | 同命令重跑 1 次；再犯停报 |
| 生成结果朝向与参照带不符 | 记录 diff 描述停报（禁连改 prompt 赌博） |
| 白模带遗传（灰白配色/无脸） | 重跑 1 次；再犯在 prompt 加「参考图 3 仅为朝向示意，配色服饰按参考图 1」后重试 1 次；仍犯停报 |
| 宽高比出界 | 如实记录，随 contact sheet 交主会话判（禁自行垫白/裁切凑数） |
| 任何歧义 | 停在该步骤写入产出报告，禁自决（AGENTS.md 置顶铁律） |

---
制备：ZCode（PM 美术管线）2026-09-04 晚 · 待 Leo 发令后直派 art-pipeline 执行
