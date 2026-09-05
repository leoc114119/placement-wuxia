# TASK-ARCH-01 · 全仓代码体检与优化建议（主架构 Codex 入职首单）

> 派单：Leo 2026-09-05 · 执行：Codex 主架构窗口 · 产出收件人：rd（ZCode PM）
> 性质：**只读分析，零代码改动**。建议的落地由 PM 评估后另卡分发（本卡不施工）。

## 任务

对仓库当前代码做一次全面体检，产出**优化建议清单**。

## 分析范围（按优先序）

1. **战斗核心链**（重点）：`systems/battle-core.ts`、`systems/battle-session.ts`、`systems/hex.ts`
2. **渲染层**：`ui/battle-hex-render.ts`、`ui/battle-input.ts`、`ui/assets.ts`
3. **配置**：`config/` 全部（battle.ts / battle-hex.ts / numbers.ts 等）
4. **宿主与原型**：`proto/battle_demo/`（main.ts / build.mjs / shot.mjs / behavior_e2e.mjs）
5. **工程面**：`package.json` 脚本、tsconfig、测试目录结构（tests/ 全览）、`game.ts` 与旧战斗线（ui/battle-render.ts）现状
6. **类型契约**：`types.ts`（只读分析，本卡禁改）

## 每条建议必须包含（缺一不收）

1. **问题定位**：文件:行 + 现状描述（引用代码证据）
2. **严重度分级**：P0（正确性风险/隐患）/ P1（架构债/可维护性）/ P2（性能）/ P3（风格/小改进）
3. **优化方案**：改法概述 + 涉及文件清单
4. **风险评估**：会不会动已验收行为（是→标注"需 Leo 对齐口径"）；影响哪些既有测试
5. **工作量估计**：小时级

## 分析视角（至少覆盖）

- **正确性**：边界条件、防御缺失（如已知的 faceTargetOf 无空数组守卫——验证并纳入）、状态一致性
- **架构**：职责边界是否被侵蚀（渲染层越权/双计算点复裂）、模块耦合、契约健康度
- **性能**：渲染热路径（drawScene 每帧）、快照构建、测试套件耗时
- **可维护性**：重复代码、magic number 外置情况（ADR-004 口径）、注释与实现漂移
- **微信端适配**：现在 preview-only 的代码里，哪些在真机 wx 环境会踩坑（字体回退/触摸事件/canvas API 兼容）

## 红线（无例外）

- **零代码改动、零文档改动**——唯一产出是分析报告文件
- 报告落盘：`docs/reviews/全仓代码体检-主架构-Codex-v1.md`（新建，含日期署名）
- 结论须与**仓库现状**核对（引用行号证据），禁止凭印象断言
- 已验收行为（规格 v2.3 锁定的 FACE-1/AOE/移动语义等）不在"优化"射程内——发现疑点单列"待 Leo 对齐"节，不并入优化建议
- git：路径级提交该报告文件，push，然后 projbus 发 delivery 给 rd（commit_sha + artifact_paths=报告路径）
- 交付后 rd（PM）复核并评估拆卡，**未经 PM 发卡不得动任何代码**

## 完成标志

报告落盘 + push + projbus delivery 发出 + tasks/LOG.md 记一行。以上四件齐 = 本卡完成。
