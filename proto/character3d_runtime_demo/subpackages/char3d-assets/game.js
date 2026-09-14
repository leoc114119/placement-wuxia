// ⚠️ 本文件不是代码入口，是**分包的存在性占位**，勿删。
//
// 为什么必须有它：微信开发者工具在静态校验 game.json 时要求**每个 subpackages[].root 目录里
// 都要有 game.js**，否则直接拦下导入（S0 probe 实测报错原文）：
//   [game.json 文件内容错误] game.json: 未找到 ["subpackages"][0]["root"] 对应的
//   /subpackages/char3d-assets/game.js 文件
//
// 本分包只承载**资产副本**（hero_48k_20260914.glb + idle/atk/cast/jump 四份动作 json），没有逻辑：
//   加载链 = wx.loadSubpackage({name:'char3d-assets'}) → FileSystemManager.readFile 分包路径 →
//            net/character-asset-loader 的完整状态机（清单校验/缓存/临时落盘/SHA-256/结构门/登记/解析）。
//
// 因此这里刻意留空（纯注释）。不要往这里加代码 —— 资产装载时机由 bundle.js 控制，写在这里会造成两份入口。
