// ⚠️ 本文件不是代码入口，是**分包的存在性占位**，勿删。
//
// 为什么必须有它：微信开发者工具（实测 mg 2.02.2608040 / lib 3.16.2）在静态校验 game.json 时
// 要求**每个 subpackages[].root 目录里都要有 game.js**，否则直接拦下导入：
//   [game.json 文件内容错误] game.json: 未找到 ["subpackages"][0]["root"] 对应的
//   /subpackages/probe-model/game.js 文件
//
// 本分包只承载**资产**（hero_48k_20260914.glb + idle_v4.json），没有任何逻辑：
//   加载链 = wx.loadSubpackage({name:'probe-model'}) → FileSystemManager.readFile 读 GLB →
//            glb-loader 解析 → 蒙皮渲染。见 README §6「资产账与副本纪律」。
//
// 因此这里刻意留空（纯注释）：万一宿主真的执行了分包入口，也只会执行到一个空文件。
// 不要往这里加代码 —— 分包资产的加载时机由 game.js（主包）控制，写在这里会造成两份入口。
