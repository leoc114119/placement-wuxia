# 类 9 · UI 组件 —— 战斗 topbar 无字重切 1 张（P-5 实证）

> ⚠️ 2026-09-03 v1.3 勘误待同步（以规范 §2.9 为准执行）：①img2img 必传横版 --aspect（24:5 先试，API 拒绝则 21:9，再不行上报）②配方改战斗组件清单版（深木鎏金底板+头像框+气血/内力条+状态图标槽+胶囊留白，不含家场景辰时牌/货币芯片条目）——配方文本待复跑任务书定稿。

> 依据：规范 §2.9 步骤 2 + 配方句式真源 `topbar_v4_base.txt`。

## 前置检查

```bash
ls assets/ui/pixel/battle/components/topbar.png        # 源：1440×300，带 AI 文字
cat assets/ui/pixel/topbar/prompts/topbar_v4_base.txt  # 句式真源（家场景版）
```

## 步骤表

| # | 动作 | 命令/规则 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 生成试产 prompt | 复制 `topbar_v4_base.txt` 全文到 `c09/prompts/topbar_battle_noword.txt`，**只做一处机械替换**：首句引号内的家场景文字清单「小虾米」「辰时」「8岁 1月」和所有「8888」→ 替换为「画面中的所有战斗界面文字与数字（回合/数值/按钮文字等）」；其余条款逐字不动 | prompt 落盘 | diff 确认仅差此一处 |
| 2 | img2img | `python3 scripts/mxai_img2img.py assets/ui/pixel/battle/components/topbar.png assets/_trial_<日期>/c09/topbar_noword_raw.png --prompt-file assets/_trial_<日期>/c09/prompts/topbar_battle_noword.txt`（2 分） | PNG | E-GEN 分支 |
| 3 | 程序化校验 | PIL：尺寸=1440×300；非空（与源图逐像素 diff 像素数 >0） | 两项过 | E-GEN-06 分支 |
| 4 | credits 记账 | 1 条（2 分） | — | — |

## 异常分支（本类特有）

- 去字同时**木件/图标/条体被改动** → 程序化不可靠判定，属 Leo 目验范畴：如实进样张，禁自判合格/不合格。
- 返回图尺寸漂移 → E-GEN-06 重跑 1 次 → 再犯上报。
- 战斗 topbar 文字内容与家场景差异大导致去字不彻底 → 记录现象交 Leo（配方改写是否需要战斗专用版=拍板项，禁自拟新配方）。

## 停点产出

- `c09/topbar_noword_raw.png` + prompt + diff/尺寸校验记录 + credits。
- 验收：去字是否干净、组件是否原样 = **Leo 目验**（AI 视觉判断禁代理代行）。
