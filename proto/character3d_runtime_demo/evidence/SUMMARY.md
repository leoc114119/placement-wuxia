# T31-FE-C · runtime smoke 证据汇总（SUMMARY）

> 目录：`proto/character3d_runtime_demo/`　分支：`task/t31-fea`　方案：`2.5D角色运行时接入技术方案 v1.0` §8 卡 C
>
> **本文件的两块内容必须分清**：
> - **A 块 = 浏览器 sim 预检**（已跑，结论一律 `SIM_` 前缀，**不是**微信/安卓能力证据，方案 §9.3）；
> - **B 块 = 真机证据（待 Leo 扫码回填）**——交付时点为空表 + 逐项回填说明；**未回填前不得下 Device-PASS 结论**。

---

## A. 浏览器 sim 预检（已跑：`node proto/character3d_runtime_demo/tests/runtime-demo-browser.mjs --runs=2`）

- 产物：`evidence/sim-result-run{1,2}.json`、`evidence/sim-console-run{1,2}.json`、`evidence/sim-summary.json`、
  每项取景截图 `evidence/sim-run2-shot-*.jpg`（13 张：六向 6 + 全状态 7）、页面截图 `evidence/sim-page-run*.png`。
- 环境：headless Chrome（ANGLE Metal，Apple M4）·viewport 390×844 @2x ⇒ **backbuffer 780×1688** ·
  SDK `3.5.7-sim`（shim）· 同机请求 `antialias:true`，**有效值 false** ⇒ `edgeMode='fxaa'`（与 S0 真机结论一致）。
- 断言：**30/30 PASS**（明细见 `sim-summary.json`）。关键判定：

| 项 | sim 结果 | 说明 |
|---|---|---|
| `verdict.device` | `SIM_DEVICE_INCOMPLETE` | 冷启动 2/3、热缓存 0/3 ⇒ **未完成不是失败**（sim 无法跨页面保留内存缓存，见 A.4） |
| `verdict.sixdir` | `SIM_PASS` | 六向 6 行逐向 `activeClipKey` 对表通过 |
| `verdict.states` | `SIM_PASS` | idle/walk/basic/charge/strike/jump/dead 七态逐项对表通过 |
| `verdict.contextRestore` | `SIM_PASS` | 真 `WEBGL_lose_context` 注入：见 A.3 |
| `verdict.capacity20` | `NON_SPEC_PROFILE_NOT_APPLICABLE` | 非 spec 档（sim-short）⇒ 不得当容量结论；机械判定引擎另记 |

### A.1 资源链（loader 真机链路的可执行部分）

| 项 | 值 |
|---|---|
| 模式 | `local-subpackage`（未配置 CDN base；见 README §5） |
| 首启分段计时 | `subpackageMs 1 · loaderMs 37 · glbParseMs 4 · animParseMs 2 · textureDecodeMs 2 · firstGpuUploadMs 104` |
| 冷链（本次装配） | `downloadAttempts 5 · downloads 5 · cacheHits 0 · failures 0 · shaMismatches 0 · byteLengthMismatches 0 · structureRejects 0` |
| 热链（进程内替换式重装配） | `cacheHits 5 · downloads 0` ⇒ `resource.hotChainObserved=true` |
| 已执行分支 | 清单校验 / cache-by-SHA 判定 / 未命中→取字节→临时落盘 / SHA-256 校验 / byteLength 校验 / GLB 结构门（41 骨·1 primitive）/ 原子登记 LKG（失败回滚）/ LKG 回退分支 / GLB+动作解析 / 贴图解码 / 首传 GPU / 热命中链 |
| **未执行分支** | `wx.downloadFile` HTTP 下载与 statusCode/timeout/abort、**downloadFile 合法域名白名单**、CDN 服务端版本化与回源、真实断网重试间隔（1s/3s）与网络错误分类 |

### A.2 FXAA 分支下的 1/5/10/20 复测（`a2Profile=sim-short`，**非 spec 档**）

`edgeMode=fxaa` · 有效 antialias `false` · backbuffer `780×1688` · `gpuMs` 不可用（该 headless 环境无真 timer ext ⇒ `null`，**未用 performance.now 冒充**）

| 档 | fpsMedian | 1% low | frameMsP95 | frameMsP99 | over50ms | passMs(mean) | anim(mean) | submit(mean) | 合成(mean) | draw/palette | 帧数 | 秒 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1u | 59.88 | 59.00 | 16.8 | 16.9 | 0 | 0.0575 | 0.0541 | 0.0033 | 0.0265 | 1/1 | 181 | 3.000 |
| 5u | 59.88 | 56.50 | 17.5 | 17.7 | 0 | 0.1242 | 0.1170 | 0.0071 | 0.0247 | 5/5 | 182 | 3.017 |
| 10u | 59.88 | 56.50 | 17.4 | 17.7 | 0 | 0.1577 | 0.1462 | 0.0115 | 0.0214 | 10/10 | 182 | 3.016 |
| 20u | 59.88 | 56.50 | 17.5 | 17.7 | 0 | 0.2249 | 0.2091 | 0.0157 | 0.0180 | 20/20 | 362 | 6.016 |

- 20u 可见性：`fillRatio=0.2629`，逐单位 `alpha>0` 像素 18.5k~20.5k（`perf-0:18536, perf-1:20495, …`）⇒ 20/20 全可见。
- 采样窗口内 `contextLostCount=0`、`glErrorCount=0`（**差分口径**，不含前面故意注入的两次丢失）。
- §5.3 六条阈值在 sim 环境**全部通过**；唯一驳回理由是「非方案口径采样」⇒ 结论记 `NON_SPEC_PROFILE_NOT_APPLICABLE`。
- 注：sim 里 rAF 被 vsync 锁在 ~60fps ⇒ fps/P95 无法区分负载（S0 README 同口径提醒），**容量数字必须用真机 spec 档**。

### A.3 真实上下文丢失/恢复（真 `WEBGL_lose_context`）

| 检查项 | sim 结果 |
|---|---|
| 注入方式 | `gl-ext`（ext 可用）· 恢复由**宿主事件**触发（`restoreVia='event'`） |
| 短暂 lost | `lostObserved=true`；`sessionContinuedWhileLost=true`（**人物提交暂停、session 继续**，方案 §6.2） |
| 恢复 | `restoreOk=true` · 恢复首帧 `dt=0`（不补算停顿） |
| 显式暂停→恢复 | 暂停期间新增帧 `0` · 恢复首帧 `dt=0` |
| 单 RAF | 全程 outstanding RAF 峰值 `1`（反复 start/resume + 连点重试均未起第二条循环） |
| 二次重建终失败 | `secondRestoreFailed=true` → `pausedOnFinalFailure=true` + `errorPageShown=true` |
| 终失败暂停后 | tick 新增帧 `0`（冻结）· 暂停期间点击真实按钮 `hit≠null` 但 `inputIgnoredWhilePaused=true` |

### A.4 sim 的**能力边界**（为什么 A 块不能替代 B 块）

1. **不是微信/安卓证据**：sim 走的是 Chrome + wx shim，`device` 是 `SimBrowser/Chrome-WXShim`；所有结论均带 `SIM_`。
2. **热缓存「跨启动」系列 sim 无法诚实覆盖**：shim 的文件系统在内存里，页面重载即清空 ⇒ 两次启动都记 `cold`。
   因此 A 块用**进程内替换式重装配**证明热链（`reloadStats.cacheHits=5, downloads=0`），
   跨启动的「热启动 ×3」必须由真机 B 块完成。
3. 20u 为短档采样（`specProfile=false`）⇒ 不给容量结论。
4. 截图来自 `wx.canvasToTempFilePath` 的 shim 等价路径（真机该 API 是否可用需真机确认，见 B.5）。

---

## B. 真机证据（待 Leo 扫码回填 · 交付时点为空白）

> 回填方式：真机跑完后按下面各表把**原始 JSON 值**抄进来（或直接把分享出来的 `char3d_*.json` 归档，
> 由 PM 填表）。**未回填的格子必须保持空**——不许用 sim 数字、不许用估算、不许凭印象。

### B.1 设备与环境（`result.device` / `result.canvas` / `result.rendererInfo`）

| 字段 | 待填 |
|---|---|
| brand / model / system / platform / SDKVersion / benchmarkLevel |  |
| pixelRatio / screen / window |  |
| `deviceHash` |  |
| backbuffer（实际物理像素） |  |
| requested vs **effective** contextAttributes（尤其 `antialias`） |  |
| `edgeMode` |  |
| unmasked vendor / renderer |  |
| `resource.mode` + `modelResolvedPath` |  |
| 首启分段计时（subpackage/loader/glbParse/animParse/textureDecode/firstGpuUpload） |  |
| 冷链 `loaderStats`（downloads / cacheHits / shaMismatches / failures） |  |
| 热链 `reloadStats`（cacheHits / downloads） |  |

### B.2 冷启动 ×3 与热缓存 ×3（DoD 硬要求）

| 第 n 次启动 | 类型（杀进程重开 / 后台回前台） | 屏上 `缓存` | `downloads` | `cacheHits` | sixdir | states | context | 结论 |
|---|---|---|---|---|---|---|---|---|
| 1 | 冷（杀进程） |  |  |  |  |  |  |  |
| 2 | 冷（杀进程） |  |  |  |  |  |  |  |
| 3 | 冷（杀进程） |  |  |  |  |  |  |  |
| 4 | 热（杀进程重开即可，缓存落盘） |  |  |  |  |  |  |  |
| 5 | 热 |  |  |  |  |  |  |  |
| 6 | 热（冷 3+热 3 齐 ⇒ 自动跑压测） |  |  |  |  |  |  |  |

- 期望：冷系列 `downloads>0 且 cacheHits=0`；热系列 `cacheHits>0 且 downloads=0`。
- 6 次齐全后 `verdict.device` 应为 `DEVICE_PASS`；不足 3+3 时是 `DEVICE_INCOMPLETE`（**未完成不是失败**）。

### B.3 FXAA（生产分支）下的 20u spec 档四档数字（方案 §5.3）

| 档 | fpsMedian | 1% low | frameMsP95 | frameMsP99 | over50ms | contextLost | glError | draw/palette | 全可见 | 帧数/秒 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1u |  |  |  |  |  |  |  |  |  |  |
| 5u |  |  |  |  |  |  |  |  |  |  |
| 10u |  |  |  |  |  |  |  |  |  |  |
| 20u |  |  |  |  |  |  |  |  |  |  |

- 20u 判定阈值（S0 §5.3，六条）：`fpsMedian≥30`、`frameMsP95≤33.3`、`frameMsP99≤50`、`over50msRatio≤1%`、
  `contextLost=0 且 glError=0`、`draw=20 且 palette=20`，且 20 个角色全部可见。
- 记录项（方案 §9.2）：`renderer/vendor/contextAttributes/edgeMode/backbuffer/cacheHit` —— 见 B.1。
- 真机 20u 结论：`verdict.capacity20` = ______（`CAPACITY_PASS` / `A_COMPATIBLE_CAPACITY_FAIL`）

### B.4 六向 + 全状态 + 轻功三元（真机可观测）

| 项 | 待填 |
|---|---|
| 六向 6 张截图（`char3d-sixdir_*.png`） |  |
| 全状态 7 张截图（`char3d-state_*.png`） |  |
| 六向逐向 `activeClipKey` |  |
| 全状态逐态 `activeClipKey` |  |
| 轻功三元 7 例（`jumpTrios`：snapIsJump / cmdIsJump / activeClipKey） |  |
| `verdict.sixdir` / `verdict.states` |  |

### B.5 其它真机观察项

| 项 | 待填 |
|---|---|
| `wx.canvasToTempFilePath` 是否可用（不可用则手动截屏） |  |
| 上下文注入 `injectionMode`（`gl-ext` / `gl-ext-host-bridge` / `host-api-fallback`） |  |
| `context.extAvailable`（该基础库是否支持 `WEBGL_lose_context`） |  |
| 结果回传通道实际可用项（复制 / 分享 / 分页截图 / console 单行） |  |
| tap 诊断单行样本（`__CHAR3D_TAP__`） |  |

---

## B0'. P0-2 缺陷记录：产物含 ES2020 语法（预览编译拒收，已修）

| 项 | 内容 |
|---|---|
| 现象 | 微信预览：`预览 Error: invalid file: bundle.js, 30:66` + `SyntaxError: Unexpected token ?`（appid wx59d99dc241b7bbe9 · ideVersion 2.02.2608040） |
| 报错行 | `const handle = (0, host_1.startRuntimeDemo)(g.__CHAR3D_DEMO_OPTS ?? {});` |
| 根因 | `build.mjs` 两处 `ts.transpileModule` 的 `target` 为 **ES2020** ⇒ 产物里 `??` 66 处 / `?.` 47 处；微信预览/运行时编译链不接受 ES2020 语法 |
| 对照 | 仓库根 `tsconfig.json` 也是 ES2020，但其产物（`proto/battle_demo`）**从未进过微信运行时**（只作浏览器预览页）；S0 probe 是手写老语法 JS，从不碰 `??`/`?.` |
| 修复 | 发射目标改 **`ts.ScriptTarget.ES2017`**（`build.mjs` 顶部常量 `TRANSPILE_TARGET`，两处共用）：`??`/`?.` 被降级为 `!= null / !== void 0`；async/await 保持原生（无 `__awaiter`/`__generator`）；`for...of` 保持原生（Map/Set 迭代语义不变） |
| 防回退（两道） | ① 静态导入门第 8 条：扫 `bundle.js`/`game.js`，命中 `??`/`?.` 即 **exit 1**（负例自检：注入 `??`/`?.` 各一处 → 门报 `?? × 1 / ?. × 1`、退出码 1，随后还原）；同族（ES2019+ 语法、`Object.fromEntries`、`.at()`、`BigInt` 等）只提示；② 用例锁：bundle 零 ES2020 记号 / 降级形态确在（`!== null && `、`!== void 0 ? `）/ `TRANSPILE_TARGET = ES2017` 且 build.mjs 再无 `ScriptTarget.ES2020` |
| 修复后验证 | ① `??`=0、`?.`=0（`new Function`=0）；② 常规 sim **34/34**；③ 五门全绿（`test:battle` 740 passed/14 skipped）；④ **`cli preview` 编译通过（exit 0 + 生成二维码），IDE 日志 `[uploadFile] parseError 0ms`，无 `invalid file`/`SyntaxError`**（对照：修复前 19:51:31 同一编译器报 `task type:upload exec error Error: invalid file: bundle.js, 30:66`） |

## B0''. P0-3 缺陷记录：上下文自测毒死整轮（已修：真重建 + 阶段重排）

| 项 | 内容 |
|---|---|
| 现象 | 真机/模拟器 console：`[character3d/renderer] context lost` → `WebGL: INVALID_OPERATION: restoreContext: context restoration not allowed` → `[character3d/renderer] 重建失败（已尝试过一次）` ⇒ 整轮停在「暂停 + 错误页」，**后续六向/全状态/轻功三元/20u 全部没跑到**（拿不到任何设备数据） |
| 根因（两条） | ① **恢复机制选错**：实现依赖 `gl.restoreContext()`（只在平台允许时有效），而方案 §6.2 要的是**重建**（新建 canvas/context + 重传缓存资源）；② **自测有毒副作用**：注入丢失排在测量阶段之前 ⇒ 平台不能恢复时整轮数据全废（自测不该阻断被测量的项） |
| 修复①真重建 | 快路径不可用 ⇒ `rebuild3D()`：处置旧 canvas/context（**已丢失 ⇒ 跳过 GL 释放**，不在死上下文上刷 INVALID_OPERATION）→ 新建离屏 canvas + webgl2 context → 经 `net/character-asset-loader` 从缓存重新装配（热命中链，即「重传缓存资源」）→ 重传 GPU → 恢复提交。结果记 `restoreVia: 'event' | 'rebuild' | 'unsupported'` + `fastPathError` + `rebuildOk`；「扩展恢复未执行」写进 `resource.notExecutedBranches` |
| 修复②阶段重排 | 顺序改为 `boot → sixdir → states → jump-trio → perf →【precontext 中间快照落盘】→ context`；结果增 `phases`（逐阶段 status/detail/ms）+ `phasesOrder`，未达 ok 的阶段在 `notes` 点名 |
| 防线 | ① 用例断言「上下文自测失败时六向/全状态/20u 结果仍在」（`phases` 只坏 context、其它 5 个 ok，sixDir/states 长度不变）；② `phases`/`phasesOrder` 可视化；③ 终失败路径（§6.2「重建失败 ⇒ 暂停 + 错误页」）用**故障注入**验证（`failNextRebuild`，注入点在破坏性步骤之前 ⇒ 旧运行时保留，暂停语义可端到端验） |
| 修复后验证 | ① 常规 sim **34/34**（Chrome 允许扩展恢复 ⇒ `restoreVia=event`，未回归）；② **`--norestore=1` 场景 37/37**（shim 复刻微信「restoreContext 被拒」⇒ `restoreVia=rebuild`、`rebuildOk=true`、`fastPathError` 原文入库，且 boot/sixdir/states/jump-trio/perf **全部 ok**）；③ 五门全绿；④ 开发者工具侧见 §B1 |

---

## B0. P0 缺陷记录：bundle 动态求值（真机门第一坎，已修）

| 项 | 内容 |
|---|---|
| 现象 | 真机/开发者工具一加载即崩：`TypeError: MiniProgramError → m.fn is not a function at __req (bundle.js:22)`，然后入口 `__req("proto/character3d_runtime_demo/main", "./main")`（bundle.js:84）；栈里**只有入口帧**、无更深帧 |
| 环境 | 微信开发者工具 macOS/mg，基础库 3.17.2（Leo 实测） |
| 根因 | 旧 `build.mjs` 用 `__def(id, new Function("require","module","exports", <源码字符串>))` 注册 20 个模块（bundle 内 20 处 `new Function`）。**微信小游戏运行时禁用动态代码求值** ⇒ 每处注册拿到的不是函数 ⇒ 第一次 `__req` 即抛 `m.fn is not a function`（栈浅 = 所有模块都没注册成函数） |
| 对照（三条互相独立，均指向同一结论） | ① `node -e "require('./bundle.js')"` 旧包在 Node 下加载正常（只报预期的「无 wx 全局」）——Node 允许动态求值；② 浏览器 sim 旧包 30/30 全绿——Chrome 允许 `new Function`；③ S0 probe 真机可跑是因为它走原生多文件 `require`，从不碰 `new Function` |
| 修复 | `build.mjs` 生成器改为**函数字面量内联**：`__def("<id>", function (require, module, exports) { <模块体> });`（webpack/rollup 常规形态）。**只改打包形态**，生产模块与 demo 语义零改动 |
| 防回退（两道） | ① `build.mjs` 静态导入门第 7 条：扫 `bundle.js`/`game.js`，命中 `new Function(`/`Function(`/`eval(` **exit 1**（负例自检：注入一行 `new Function` → 门红、退出码 1）；另扫同族（字符串型定时器、动态 `import()`）只提示；② `tests/character3d-runtime-demo.test.ts` 新增 3 用例锁「bundle 零动态求值 / 注册形态是函数字面量（20 处且含入口与生产模块）/ build.mjs 自带门不许脱钩」 |
| 修复后验证 | ① `node -e require` → 只报 `[host] 无 wx 全局：不是微信小游戏宿主`（不再有 `m.fn`）；② 浏览器 sim **30/30 PASS**；③ 五门 typecheck/lint/build 0 错、`test:battle` **734 passed / 14 skipped**、`test:behavior` 14/14；④ 开发者工具 `cli open` → 日志 `starting compiler` + `project ready` + `BACKEND_READY`，**无** `TypeError` / `m.fn` / `game.json 文件内容错误`（详见 §B1） |
| 复发次数 | 1（本轮） |

### B1. 开发者工具侧证据（P0 修复后复测）

- 命令：`"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" open --project /tmp/pw-t31-fea/proto/character3d_runtime_demo` → `✔ open`
- 主日志 `~/Library/Application Support/微信开发者工具/<hash>/WeappLog/logs/2026-09-14-19-32-41-716.log`：
  - `19:38:45.529 [BackendInitEnv] [rt:2,win:s2] isMiniAppProject=false, isEvalProject=false, starting compiler`
  - 同刻 `[BackendInitEnv] project ready, projectpath=/tmp/pw-t31-fea/proto/character3d_runtime_demo`
  - `19:38:46.304 [backendManager] received BACKEND_READY for /tmp/pw-t31-fea/proto/character3d_runtime_demo, port=0`
- 该会话日志（`2026-09-14-19-38-46-246.log`）与主日志：**无** `TypeError`、**无** `m.fn is not a function`、
  **无** `game.json 文件内容错误`、无编译错误条目。
- **未取得（如实登记）**：IDE 控制台/模拟器的运行期输出。该会话有 2 条 `routeTo appLaunch timeout`（CLI `open`
  的临时工程窗口路由超时；同一形态在修复前的 19:05 会话里同样出现 2 条 ⇒ 与本次修复无关，也不是本项目代码特征；
  用 GUI 打开的 probe 会话为 0 条）。⇒ 结论强度记为「编译器已启动 + 后端就绪 + 日志无错误条目」，
  **不等于**「已在开发者工具里跑起来」。运行期实证请以 Leo 在导入目录里重编译/预览为准。

---

## C. 已知缺口与不确定项（交付时如实登记）

1. **CDN 未跑**：真机侧无已备案域名 ⇒ 走分包/本地路径 adapter（同一条 loader 代码路径）。
   已执行/未执行分支逐条见 A.1 与结果 JSON 的 `resource.executedBranches/notExecutedBranches`。
2. **第二台异品牌安卓未采**（Leo 借测并行补采，不阻塞本卡；A1 升格仍需 ≥2 台 × 各 3 次冷启动）。
3. **开发者工具导入：CLI 实测已过（编译器启动 + 后端就绪 + 无编译错误条目）**
   - 本机 `cli islogin` = `{"login":true}` ⇒ 未触发任务卡说的「需登录即停」。
   - `"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" open --project <本目录>` → `✔ open`（退出码 0）。
   - 工具日志（`~/Library/Application Support/微信开发者工具/<hash>/WeappLog/logs/2026-09-14-12-44-17-203.log`，
     19:05:18~19:05:21）逐条为证：
     `[CLI-OPEN] openProjectWindow … { appid: 'wx59d99dc241b7bbe9', compileType: 'game', alreadyImported: false, isTemp: true }`
     → `[BackendInitEnv] isMiniAppProject=false, isEvalProject=false, **starting compiler**`
     → `[BackendInitEnv] project ready, projectpath=…/proto/character3d_runtime_demo`
     → `[backendManager] received BACKEND_READY … port=0`
     全程**没有** `[game.json 文件内容错误]` 一类导入拦截（S0 probe 踩过的那条），也没有编译错误条目。
   - **未取得**：IDE 控制台的「编译成功」原文；同一日志 19:05:35 另有两条 `routeTo appLaunch timeout`
     （CLI 开窗路由超时，晚于 `project ready`，判断与项目代码无关但**未排除**）。
     ⇒ 证据强度记为「编译器已启动 + 后端就绪 + 无错误条目」，不是「IDE 显示编译通过」。请 Leo 在工具里目验一次。
   - **未执行** `cli preview`（会以 Leo 的 AppID 向微信服务器上传预览包）——真机扫码按分工由 Leo 在工具里点「预览」。
   - 另：`build.mjs --check` 提供不依赖工具链的静态导入门逐项核对（game.js/game.json/分包 game.js/命名/语法/资产 SHA/红线）。
4. sim 的 `animMs/submitMs` 为**时间代理**测值（生产 renderer 无插桩），与 S0 自带插桩不完全同源，只看趋势。
5. 真机 `gpuMs` 是否可得取决于 `EXT_disjoint_timer_query_webgl2`；不可用则为 `null`（**不用 performance.now 冒充**）。
6. 本卡不覆盖：敌方 3D、换装/挂点、根 `game.ts` 新战斗宿主迁移（方案 §1.3 明列）。
