// T31-FE-C · 宿主 bundle 入口（构建产物入口模块）
//
// 选项由宿主环境注入（浏览器 sim 写在 index.html 的 `window.__CHAR3D_DEMO_OPTS`；微信真机不设 = 缺省）：
//   sim             true = 浏览器 sim（结论加 SIM_ 前缀，且明确标注非真机证据）
//   forceEdgeMode   'fxaa' | 'native-msaa' —— **仅 sim** 用于强制分支；真机不传（能力分支，易错点 7）
//   shortProfile    true = 短档采样（sim 用，结果标 specProfile=false）
//   systemInfoOverride / commitShaOverride / now  —— sim 注入
//
// `globalThis.__CHAR3D_DEMO` 暴露句柄（sim harness 用它拿 result / dispose）。

import { startRuntimeDemo, type RuntimeDemoOptions } from './host';

interface DemoGlobal {
  __CHAR3D_DEMO_OPTS?: RuntimeDemoOptions;
  __CHAR3D_DEMO?: unknown;
}

const g = globalThis as unknown as DemoGlobal;
const handle = startRuntimeDemo(g.__CHAR3D_DEMO_OPTS ?? {});
g.__CHAR3D_DEMO = handle;
