# 类 1 · 角色行走帧 —— 试产：无武器锚 1 张

> ⚠️ 2026-09-03 勘误：步骤 1 替换规则按试产成功口径执行——「腰间挂剑」→「手持空/无武器，腰间无挂物」（替换式，非删除式），该口径样张已过 Leo 目验。

> 依据：规范 §2.1 + 任务书动作表。目的：产出 b 案（武器剥离）口径的锚帧样张，走通逐姿势 img2img 前置段。

## 前置检查

```bash
ls assets/characters/hero/walk_v2/raw/q_anchor_v5_clean.png      # 参照锚，必须存在（E-ENV-04）
cat assets/characters/hero/walk_v2/prompts/q_anchor_v5_front.txt # 基础配方，必须存在（E-ENV-04）
```

## 步骤表

| # | 动作 | 命令/规则（原文） | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 生成试产 prompt | 复制 `q_anchor_v5_front.txt` 全文到 `assets/_trial_<日期>/c01/prompts/anchor_noweapon.txt`，**只做两处机械替换**：① 删除其中「腰间挂剑、」5 个字；② 把「脚下地面完全干净」整条保留不动 | prompt 文件落盘 | `diff` 确认与原配方仅差上述 5 字（程序化比对） |
| 2 | img2img 生成 | `python3 scripts/mxai_img2img.py assets/characters/hero/walk_v2/raw/q_anchor_v5_clean.png assets/_trial_<日期>/c01/anchor_noweapon_raw.png --prompt-file assets/_trial_<日期>/c01/prompts/anchor_noweapon.txt` | 返回 PNG | E-GEN-01/02 分支 |
| 3 | 程序化校验 | PIL：`verify()` 通过；记录实际尺寸进报告 | 图可开 | E-GEN-02/06 |
| 4 | 内容缺陷筛查 | PIL 不做内容判断；按 E-GEN-03/04/05 描述性比对（文字/手或人物/底色角部实测） | — | 命中即走对应分支 |
| 5 | credits 记账 | `credits.json` 追加一条（name=anchor_noweapon, model=gpt-image-2, cost=2, ts, note=c01 试产） | 文件更新 | — |

## 异常分支（本类特有）

- 生成图**仍带武器/腰间挂物** → 机械性失败（prompt 条款未生效），同命令重跑 1 次 → 再犯停上报附图。
- 生成图**发色/服装/发型与参照漂移** → 审美性 → 不判，进入停点交 Leo（记录"存在漂移可能"一句话即可，禁展开发挥）。

## 停点产出

- `c01/anchor_noweapon_raw.png` + `c01/prompts/anchor_noweapon.txt` + credits 行。
- 验收标准：PIL 可开、无文字、单人、纯白底角部实测达标；**美观与否 Leo 目验**。
