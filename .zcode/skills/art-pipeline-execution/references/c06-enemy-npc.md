# 类 6 · 敌人/NPC —— 检测门走查（0 生图）

> 依据：规范 §2.6（山贼甲乙两批已交付，本类试产=行使**检测权**，清除不做）。

## 前置检查

```bash
ls assets/characters/enemy/shanzei_a/frames/*.png | head -3   # 帧目录非空
```

## 步骤表

| # | 动作 | 命令 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 暖白残留审计 | `python3 scripts/audit_warmwhite_blocks.py assets/characters/enemy/shanzei_a/frames/*.png` | exit=0 或报警清单 | 逐字记录 exit 码与完整 stdout |
| 2 | 封闭白分诊 | `python3 scripts/triage_enclosed_white.py --dirs assets/characters/enemy/shanzei_a/frames` | 分诊清单（garment/residue 计数） | 逐字记录输出 |
| 3 | 乙批重复 | 对 `shanzei_b/frames/` 重复步骤 1-2 | 同上 | — |

## 异常分支（本类特有）

- audit exit≠0（存在残留报警）→ **正常数据**：记录报警文件与块清单进报告（这正是试产要的实证），**禁清除、禁修复**，停点交 Leo。
- triage 参数不兼容（--dirs 不被识别）→ `python3 scripts/triage_enclosed_white.py --help` 读实际用法后按其用法执行；仍失败 → E-GATE-01。

## 停点产出

- 报告内两批 exit 码 + 报警块清单原文（这就是全部产出，无文件新增）。
- 验收标准：记录完整即合格；有无残留、清不清 → Leo 裁决（R-RESIDUE 流程）。
