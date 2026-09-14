// 微信小游戏主包入口（T31-FE-C · 2.5D 角色 runtime smoke 宿主）
//
// 只做一件事：加载构建产物 bundle.js。bundle.js 由 `node proto/character3d_runtime_demo/build.mjs`
// 生成（把生产 TS 模块 + 本目录宿主 TS 转成单文件经典脚本，零运行时依赖）。
//
// 为什么不是 ESM：微信小游戏的 `project.config.json` 关着 es6 转译（与已跑通的 S0 probe 同设置），
// 单文件经典脚本是两端（微信 / 浏览器 sim）都能直接跑的最小形态。
require('./bundle.js');
