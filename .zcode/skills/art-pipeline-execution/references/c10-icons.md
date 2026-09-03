# 类 10 · 图标 —— 功能图标样板 1 张（背包，P0 族首批）

> 依据：规范 §2.10（样板先行+客观风格门）。族语言真源=`item_dao.txt`。

## 前置检查

```bash
cat assets/ui/pixel/icons/prompts/item_dao.txt    # 族语言基底
python3 scripts/process_item_icons.py 2>&1 | head -3   # 确认可执行（IndexError 属正常用法提示，ImportError 属 E-ENV-03）
```

## 步骤表

| # | 动作 | 命令/规则 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 生成试产 prompt | 复制 `item_dao.txt` 全文到 `c10/prompts/icon_beibao.txt`，**只做一处机械替换**：末句主体描述「主体：一把中国朴刀（腰刀），单刃宽背刀身，刀尖斜上，配木质刀柄与护手。」→「主体：一个中国武侠风背囊（行囊），帆布包体配皮革绑带与竹架，顶部系绳收口。」 | prompt 落盘 | diff 确认仅差此一处 |
| 2 | 生成 | `python3 scripts/mxai_gen.py --prompt "$(cat assets/_trial_<日期>/c10/prompts/icon_beibao.txt)" --out assets/_trial_<日期>/c10/beibao_raw.png`（2 分） | PNG | E-GEN 分支 |
| 3 | 加工过风格门 | `python3 scripts/process_item_icons.py assets/_trial_<日期>/c10/beibao_raw.png assets/_trial_<日期>/c10/beibao.png` | exit=0，产出 128×128 透明底 | exit≠0 → E-GATE-01（金色色距/覆盖率门失败=机械口径可测失败，重跑步骤 2 一次，再犯上报附门输出） |
| 4 | credits 记账 | 1 条（2 分） | — | — |

## 异常分支（本类特有）

- 风格门连续失败但原始图肉眼无问题 → 禁自行调门参数/禁改脚本，附门输出上报。
- 生成的背包**带文字标签/带人物** → E-GEN-03/04。

## 停点产出

- `c10/beibao.png`（128×128 透明）+ prompt + 门输出记录 + credits。
- 验收：门是客观的（过=过）；背包造型好不好 = Leo 目验（样板定视觉后才能量产，规范 §2.10-1）。
