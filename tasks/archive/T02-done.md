# T02 交付回执 · 工程骨架

> 交付：2026-08-21 20:42 · ZCode · 状态：待 CodeBuddy C 环验收

## DoD 逐项勾选

- [x] `npm run typecheck` 0 error，`npm run lint` 0 error（均已实跑通过）
- [ ] 微信开发者工具导入工程 → 打开 → 清屏色显示正常（**需 CodeBuddy/Leo 在开发者工具中实测**，ZCode 无法操作 GUI）
- [x] `git log` ≥ 1 提交（5e819ba 初始提交），`.gitignore` 含 node_modules/dist 生效（`git status` 干净）
- [x] 架构决策说明见下
- [x] 未触碰禁止区（docs/ tasks/ 仅按协议流转文件；assets/ 与 config/assets-p0.json 未动）

## 需求表逐项

| # | 需求点 | 结果 |
|---|--------|------|
| 1 | git init + .gitignore | ✅ 初始提交 5e819ba |
| 2 | 微信小游戏结构 | ✅ project.config.json(compileType:game) + game.json + game.js 入口 |
| 3 | TS strict + 构建链 | ✅ tsconfig strict 全开，tsc 构建到 dist/ |
| 4 | 骨架分层 | ✅ game.ts + types.ts + config/numbers.ts(只读展示参数占位) + ui/render.ts + systems/{battle,growth,map}.ts + net/cloud.ts(mock) |
| 5 | Canvas 清屏 + 主循环 | ✅ 宣纸色 #F8F4EA 清屏 + requestAnimationFrame 循环 + 5s 间隔 FPS 日志 |
| 6 | npm scripts | ✅ typecheck / build / watch / lint（eslint 9 flat config + typescript-eslint recommended） |

## 架构决策说明

1. **构建工具选 tsc 而非 esbuild**：骨架阶段无打包/体积诉求，tsc 一个工具同时承担类型检查与产出 CommonJS（微信小游戏原生支持 CJS require），零额外依赖；后续若有体积/热更需求再评估 esbuild，不影响现有结构。
2. **入口双层**：微信读根目录 `game.js`（JS），内部 `require('./dist/game.js')` 加载 TS 编译产物；TS 源码与运行入口解耦，开发者工具只面向 dist。
3. **wx 全局类型**：`env.d.ts` 最小声明（WxCanvas + requestAnimationFrame），不引第三方 minigame 类型包（避免未批准依赖），随任务逐步补全。
4. **模块占位策略**：systems/ 三模块与 net/cloud.ts 只放类型咬合签名（如 `CloudResult<T>`、`callCloud` mock），不预写任何玩法逻辑——遵守"禁止实现玩法"边界。
5. **数值纪律**：config/numbers.ts 只含 PALETTE 规范色与展示常量（清屏色、FPS 日志间隔），无任何结算公式。

## 文件清单（新增）

```
.gitignore / package.json / tsconfig.json / eslint.config.js
project.config.json / game.json / game.js          # 微信小游戏结构
game.ts / types.ts / env.d.ts                      # 入口 + 类型
config/numbers.ts                                  # 只读展示参数
ui/render.ts                                       # 清屏渲染
systems/battle.ts / growth.ts / map.ts             # 占位
net/cloud.ts                                       # mock
package-lock.json / node_modules(忽略)
```
