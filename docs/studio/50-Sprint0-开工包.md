# 放置武侠 · Sprint 0 开工包（T01~T02）

> 状态：**待执行（Leo 确认环境后交 ZCode/Codex 开工）**
> 日期：2026-08-19
> 依据：`docs/studio/22-冲刺计划-Sprint0.md`（任务清单）、`21-ADR-基础层.md`（已采纳）、`20-主架构文档.md`、`AGENTS.md`（施工守则）
> 用途：把 Sprint 0 前两环任务装配成可直接执行的开工指令。

---

## 0. 三环分工（Sprint 0 全程）

| 环 | 执行者 | 职责 |
|---|---|---|
| Z（开发） | Codex/ZCode | 按任务卡实现，一次一个任务 |
| C（测试） | CodeBuddy/夜间任务 | 六项检查：编译/类型/静态/单测/模拟运行/设计一致性 |
| L（验收） | Leo | 微信开发者工具 + 真机预览，三关签字（效果/可维护/稳定） |

**铁律：任一环失败 → 打回 Z 修改；上一步未验收，不进下一步（02 §4）。**

---

## 1. T01 环境就绪（Leo 动作 + Z 验证）

**Leo 前置确认**（今天上午）：
- [ ] 微信开发者工具已安装（01 文档 I-02 待确认项）
- [ ] 云开发环境可后置（Sprint 0 只要本地画面，Sprint 1 前开通即可）

**Z 验证**：开发者工具可新建/打开小游戏工程，`node -v` 正常（需 ≥18）。

---

## 2. T02 工程骨架（给 Codex 的开工指令）

> **指令模板（复制给 Codex）：**
> 在 /Users/leochen/WorkBuddy/Claw/placement-wuxia 执行 T02 工程骨架：
> 1. 先读 `AGENTS.md`、`docs/studio/20-主架构文档.md` §6 目录、`docs/studio/21-ADR-基础层.md` ADR-001/ADR-004
> 2. `git init`（项目尚未建版本库，G-04）
> 3. TypeScript 初始化：`tsconfig.json` strict 模式
> 4. 目录结构：`src/{scenes,systems,ui,net,config}` + `cloudfunctions/{settle,save,load}` 骨架
> 5. `package.json` scripts：`typecheck` / `lint` / `test`
> 6. eslint 配置（禁硬编码数值规则，对应用 ADR-004）

**T02 验收标准**：
- [ ] `npm run typecheck` 对空骨架 0 error（strict 模式）
- [ ] 目录与主架构 §6 一致
- [ ] `git init` 完成，首次提交记录（含 docs/ + AGENTS.md）
- [ ] C 环确认：无硬编码数值（静态扫描）

**T02 涉及的 ADR 约束**：
- ADR-001：`src/scenes/` 预留 Scene 接口（onEnter/onExit/update/draw），T04 落地
- ADR-004：`types.ts` 纯类型零运行时；`config/numbers.ts` 只读展示配置（不含结算公式）

---

## 3. T03 最小画面（T02 验收后启动）

> **给 Codex：** `game.ts` 入口 + rAF 主循环（LOGIC_TICK=50ms）+ Main 场景绘制墨色背景 + 标题「放置武侠」。微信开发者工具显示画面。
> 验收：C 编译/静态通过；L 微信预览看到画面（墨 `#2B2B2B` 系背景，色值引用 `04-UI风格规范`）。

---

## 4. 三环流转记录（T 完成后回填）

| 任务 | Z 产出时间 | C 检查结果 | L 验收 | 状态 |
|---|---|---|---|---|
| T01 环境 | | | | ⬜ |
| T02 骨架 | | | | ⬜ |
| T03 最小画面 | | | | ⬜ |
| T04 场景管理 | | | | ⬜ |
| T05 类型/数值 | | | | ⬜ |
| T06 检查全绿 | | | | ⬜ |
| T07 微信预览 | | | | ⬜ |
| T08 三关验收 | | | | ⬜ |
| T09 复盘 | | | | ⬜ |
| T10 素材（可选） | | | | ⬜ |

---

## 5. 变更记录

| 日期 | 版本 | 变更 | 签字 |
|---|---|---|---|
| 2026-08-19 | v1 | 创建：Sprint 0 开工包（T01~T03 任务卡 + 三环流转表） | 待执行 |
