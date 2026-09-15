# T31-FE-C · 微信 runtime smoke 宿主（2.5D 角色运行时真机门）

> 真源：《2.5D角色运行时接入技术方案 v1.0》§8 卡 C（`docs/design/01-基础功能/2.5D角色运行时接入技术方案.md`）
> 本目录是**独立微信小游戏工程 + 同源浏览器 sim**，消费**与卡 B 同一份生产模块**，不复制 renderer，
> 不接入根 `game.ts`（新战斗宿主提升是后续独立卡）。

## 0. 它回答什么

| 问题 | 判定 |
|---|---|
| ① 微信真机上，**生产 2.5D 运行时**（config/character-3d + net/character-asset-loader + ui/character3d/**）能否装配起来？ | 资源门 + 首启分段计时 |
| ② 六向 + 全状态（idle/walk/basic/charge/strike/jump/dead）在真机是否逐项可见？ | 逐项 `activeClipKey` 对表 + 每项一张截图 |
| ③ 轻功意图（isJump）在「快照窗结束 / 抛物线端点 hop=0 / 演出走满 / 死亡」四类边界上是否仍正确？ | 三元并列证据（snapIsJump / cmdIsJump / activeClipKey） |
| ④ 真实上下文丢失/恢复注入下，宿主行为是否守方案 §6.2？ | 暂停/恢复、单 RAF、时钟不补算、终失败暂停 + 错误页 |
| ⑤ **FXAA 分支**（实机 `antialias=false`）下 20 单位是否仍满足 S0 §5.3 六条阈值？ | 1/5/10/20 四档数字 + 机械判定 |
| ⑥ 冷启动 ×3 与热缓存 ×3 两条 loader 状态机链是否都在真机跑过？ | 运行历史 + loader 统计（downloads / cacheHits） |

**本目录不证明的事**：不证明 CDN 域名已备案（见 §5）、不证明跨安卓（需第二台机）、不证明 L 环观感（Leo 目验）。

## 1. 目录与职责

```text
proto/character3d_runtime_demo/
  project.config.json          独立小游戏工程（compileType=game；packOptions.ignore 排掉下方非入包目录）
  game.json                    分包声明 subpackages=[char3d-assets]
  game.js                      主包入口（require('./bundle.js')）
  bundle.js                    ★ 构建产物（由 build.mjs 生成；与微信包内跑的是同一份）
  main.ts                      产物入口：读宿主注入选项 → startRuntimeDemo
  host.ts                      ★ 宿主编排：装配 / 六向全状态 / 上下文注入 / 20u 压测 / 结果回收 / tap 诊断
  evidence.ts                  结果 schema + 判定矩阵 + 导出命名（纯函数）
  metrics.ts                   采样器 + S0 §5.3 判定（纯函数，口径逐字沿用 S0）
  scenarios.ts                 六向·全状态·轻功三元用例表（纯数据 + 纯函数）
  adapter-local.ts             资源链方案选择 + 分包/本地路径 platform adapter
  hud.ts                       屏上面板 / 按钮命中框 / 分页查看（纯 Canvas 2D）
  build.mjs                    构建 + 资产落地 + 静态导入门（零新依赖）
  browser/                     浏览器 sim：wx shim + index.html（**不进微信包**）
  tests/runtime-demo-browser.mjs  sim 自动化（playwright-core + 系统 Chrome）
  evidence/                    结果 JSON / console 单行 / 截图 / 汇总（**不进微信包**）
  subpackages/char3d-assets/   资产副本（hero_48k_20260914.glb + idle/atk/cast/jump json）
    game.js                    ★ 分包存在性占位（纯注释，微信硬要求，勿删勿加代码）
  README.md
```

零第三方运行时：不引 three/Cocos；`npm install` 未新增任何包（sim 复用仓库既有 devDependency `playwright-core`）。

## 2. 给 Leo 的操作步骤

### 2.1 导入与预览

1. 打开**微信开发者工具** → `导入项目` → 目录选到**本目录**（`proto/character3d_runtime_demo`）→ 项目类型 `小游戏`。
   （AppID 若与账号不匹配，改成你自己的小游戏 AppID；本工程不调用需要 appid 权限的接口。）
2. 工具内点 `编译`，应无报错。**点 `预览` 生成二维码**。
3. **安卓手机**扫码运行（本卡 DoD 以 HONOR / 当前可得安卓为准；第二台异品牌为并行补采，不阻塞）。

> 若工具报 `[game.json 文件内容错误] … 未找到 subpackages/char3d-assets/game.js`：说明分包占位文件被删了，
> 跑一次 `node proto/character3d_runtime_demo/build.mjs` 即可恢复（它也会顺带核对资产 SHA）。
> 其它导入被拦的情况，先看 §7 的静态自查清单（build.mjs 逐项自动核对）。

### 2.2 屏上会显示什么

大字面板（每帧刷新，7 行）+ 底部 5 个按钮：

```
T31-FE-C · WX 真机 · HONOR/PTP-AN20
SDK 3.17.3 · dpr 3(用 3) · bb 1098x2400
edgeMode fxaa · aa有效 false · 资源 local-subpackage · 缓存 cold
冷启动 1/3 · 热缓存 0/3 · 本轮 #1 · 阶段 sixdir
命令 1u · pass 1.2ms（anim 0.6 / submit 0.5）· 合成 0.3ms
RAF 峰值 1 · ctxLost 0 · GLerr 0 · 帧 512 · draw/palette 1/1
判定 device=SIM_… · sixdir=… · states=… · ctx=… · 20u=… | 当前动作
```

底部按钮：**复制结果** / **分享结果** / **查看结果**（分页）/ **重跑压测** / **重试3D**。

### 2.3 一次运行的顺序（全自动，不用操作）

1. 装配 3D 人物层（资源门：清单校验 → 缓存 → 取字节 → SHA-256 → 结构门 → 原子登记 → 解析 → 首传 GPU）；
2. 六向 6 张 + 全状态 7 张取景（每项截图 + `activeClipKey` 对表）；
3. 轻功三元 7 例；
4. 上下文丢失/恢复注入（含二次终失败 → 暂停 + 错误页 → 自动重试装配）；
5. 压测（**满足「冷 3 + 热 3」后才自动跑**；否则点「重跑压测」可改成每轮都跑）；
6. 出结果：屏上判定行 + console 单行 + 文件 + 分页查看。

### 2.4 冷启动 ×3 与热缓存 ×3（DoD 要求）

| 系列 | 怎么做 | 期望屏上 |
|---|---|---|
| 冷启动 ×3 | **完全杀掉微信**（任务切换器上划掉）→ 重新扫码，共 3 次 | `冷启动 n/3` 递增；面板 `缓存 cold`；结束后 `资源 loaderStats.downloads>0` |
| 热缓存 ×3 | 再启动 3 次（杀进程重开即可；缓存是落盘的） | `热缓存 n/3` 递增；面板 `缓存 hot`；`cacheHits>0 且 downloads=0` |

- 前 3 次运行**先按 assetId 清 LKG**（走生产 `cacheRemove`），保证「冷」是真冷；第 4 次起不清，走 cache-hit 链。
- **热命中的口径**（§7.3）：索引命中且盘上文件与索引一致即算命中；**包内文本资产即使被平台改写**（observed ≠ 清单）
  也照样热命中 ⇒ 面板 `缓存 hot`、`热缓存 n/3` 能推进（`loaderStats.cacheHits>0 且 downloads=0`）。
- 第 6 次（冷 3 + 热 3 齐）会**自动跑压测**：预热 10s + 1/5/10 各 30s + 20 单位 60s ≈ **3.5 分钟，全程别熄屏/别切走**。
- 看不到 `3/3` 就不要下 Device-PASS 结论 —— 证据不足不许写 PASS（屏上会写 `DEVICE_INCOMPLETE`，那是**未完成不是失败**）。

### 2.5 结果回传（四种方式，任一种通就够）

| 按钮 | 做法 | 屏上反馈 / console 单行 |
|---|---|---|
| **复制结果** | `wx.setClipboardData` 整份 JSON（带 3s 超时兜底，成败都给原因） | `▶ 复制：成功（N 字符）` / `▶ 复制：失败 · <原因>`；`__CHAR3D_CLIPBOARD__={…}` |
| **分享结果** | `wx.shareFileMessage` 把 `char3d_<deviceHash>_result_run<n>.json` 当**文件**发到聊天/文件传输助手 | `▶ 分享：已调起（文件名）`；`__CHAR3D_SHARE__={…}` |
| **查看结果** | 屏上**分页**：点右半下一页 / 左半上一页 / 点按钮返回。逐页截图即可回收 | 页脚页号 |
| console 单行 | `__CHAR3D_RUNTIME_RESULT__=<JSON>`（devtools Console 直接复制） | — |

另外：结果同时写入 `wx.env.USER_DATA_PATH/char3d_<deviceHash>_result_run<n>.json`；每项取景会尝试
`wx.canvasToTempFilePath` 自动存 PNG（该 API 不可用时**手动截屏**，命名见 `env.screenshots`）。

**tap 诊断单行**（每次点击都有）：`__CHAR3D_TAP__={"mapped":[…],"hit":…,"nearest":{…},"listenerAttached":…,"paused":…,"verdict":"…"}`
——`verdict` 三态区分 **`not-connected`（触摸事件根本没到）/ `miss`（没命中）/ `paused`（被暂停，输入被忽略）**。
下次再遇「点了没反应」，把这一行发回来即可定位。

### 2.6 上下文丢失注入怎么触发

- 注入方式：真 `WEBGL_lose_context`（ext，方案 §6.2 要求）。demo 自动注入两次：
  第一次 → 短暂 lost（**人物提交暂停、session 继续**）→ 恢复成功；第二次 → 重建**终失败**（renderer 只试一次）
  → 暂停对局 + 显式错误页，然后自动「重试3D」验证替换式重装配只起一条循环。
- 若该基础库不支持该 ext：结果里 `context.extAvailable=false`、`injectionMode='host-api-fallback'`，
  判定写 `ALTERNATE_ONLY_*`（**只算替代验证，不当作真机上下文丢失证据**）。

## 3. 结果字段（`evidence/sim-result-run*.json` 或真机分享文件）

顶层：`schemaVersion` / `device`(含 deviceHash) / `canvas`(requested vs **effective** attributes、backbuffer、
dpr、renderScale) / `rendererInfo`(edgeMode、有效 antialias、骨数、计数器) / `resource` /
`sixDir[]` / `states[]` / `jumpTrios[]` / `context` / `capacity[]`(四档) / `runs[]` / `env` / `verdict` / `notes`。

关键口径：

- **`verdict.device`**：`DEVICE_PASS`（冷 3 + 热 3 全绿）/ `DEVICE_INCOMPLETE`（**未完成，不是失败**）/ `DEVICE_FAIL`；
  sim 一律加 `SIM_` 前缀。
- **`verdict.contextRestore`**：`PASS` / `FAIL` / `NOT_RUN` / `ALTERNATE_ONLY_*`（无 ext 时）。
- **`verdict.capacity20`**：`CAPACITY_PASS` / `A_COMPATIBLE_CAPACITY_FAIL`（S0 §5.3 六条阈值）/
  `NOT_RUN` / `NON_SPEC_PROFILE_NOT_APPLICABLE`（非 spec 档采样，只证明判定逻辑通）。
- **`resource.executedBranches` / `notExecutedBranches`**：真机**实际跑过**与**没跑过**的分支逐条如实列。
- **`jumpTrios[]`**：`snapIsJump`（原始快照意图，合成本宿主输入）/ `cmdIsJump`（命令值）/ `activeClipKey`（真代码输出）。

## 4. 口径说明（读数字前先看这段）

### 4.1 采样与判定

沿用 S0 方案 §5.2/§5.3：`frameWallMs` = 完整 rAF 间隔（FPS 唯一来源）；P50/P95/P99 = 最近秩百分位
（升序 `ceil(p·n)-1`）；1% low = 最差 `ceil(n·1%)` 帧的平均帧时取倒数；每档 **≥1800 帧且达规定秒数**
（预热 10s / 1-5-10 各 30s / 20 单位 60s）；`readPixels` **只在采样窗口之外**做（强制同步，禁进循环）；
`gpuMs` 仅 `EXT_disjoint_timer_query_webgl2` 真采样，不可用 = `null`（**不用 performance.now 冒充**）。

### 4.2 与 S0 的两处**如实差异**（不是口径偷改）

| 项 | S0 | 本卡 | 原因 |
|---|---|---|---|
| 分相 | 其自带 renderer 插桩 `jsAnimMs` / `glSubmitMs` | 时间代理：`animMs = passMs − Σ drawUnit`、`submitMs = Σ drawUnit` | 生产 renderer **没有**插桩，改它就是改生产代码；代理只计时不改行为 |
| 分段计时 | `loadSubpackage/readFile/parse/decode/firstUpload` 各段独立 | `subpackageMs / loaderMs / glbParseMs / animParseMs / textureDecodeMs / firstGpuUploadMs` | loader 状态机是**一次调用**（下载+校验+登记在内部），`readFile` 不可再分 ⇒ 合进 `loaderMs` |

### 4.3 20u 摆放与相位

网格 `cols=ceil(sqrt(n))`，按格子铺开；横向按**实测最大 `placed.w` 内缩**（生产 placed.w 取
`max(x/z 跨度)` 是 HUD 宽锚口径，比实际投影宽 —— 不内缩会让人物 bbox 压出画布边）。
相位错开 `i×0.137s`（S0 口径，防同相把 JS 骨架开销测低）：用 `pass.controllers` 暴露的**控制器实例**
预推进 viewClock，生产代码零改动。

## 5. 资源链：CDN 还是分包本地路径（**必读，别把没跑过的当跑过**）

方案 §6.1 要求 payload 走 CDN。**本卡开单时真机侧没有可用的已备案 CDN 域名**（§1.3 已把「CDN 服务商选择、
域名采购、发布部署」划出 S1），因此按任务卡授权使用**分包/本地路径 adapter**跑通**同一条 loader 代码路径**：

| 模式 | 何时用 | 走的是什么 |
|---|---|---|
| `local-subpackage`（**缺省**） | 未配置 CDN base | `adapter-local` **只覆盖 `downloadArrayBuffer`**（读分包代码包文件）；临时文件 / SHA-256 / 缓存读写 / 贴图解码**全部委托生产 wx adapter** |
| `cdn` | storage 键 `char3d-cdn-base` 配了 `https://…` | 生产 `createWxCharacter3DPlatform` 的 `wx.downloadFile` 链路（**需该域名已在微信后台配 downloadFile 合法域名**） |

真机**已跑过**：清单/profile 校验、cache by SHA 命中判定、未命中→读分包→写临时文件、SHA-256 校验
（`getFileInfo(digestAlgorithm)`）、byteLength 校验、GLB 结构门（41 骨/1 primitive）、原子登记 LKG（含失败回滚）、
LKG 回退分支、GLB/动作解析、贴图解码（`wx.createImage`）、首传 GPU、**热启动 cache-hit 链**。

真机**没跑过**（结果 JSON 的 `notExecutedBranches` 会逐条列出，**禁止**把未跑写成已验）：
`wx.downloadFile` HTTP 下载与 statusCode/timeout/abort、**downloadFile 合法域名白名单**、
CDN 服务端内容版本化与回源/404、真实断网下的重试间隔（1s/3s）与网络错误分类。

切 CDN 模式（域名备案后）：devtools 控制台执行一次 `wx.setStorageSync('char3d-cdn-base', 'https://<你的域名>/<路径>')`
再重扫；`verdict`/`resource.mode` 会变成 `cdn`，`executedBranches` 随之更新。

## 6. 浏览器 sim（导进微信之前的自检，**不是真机证据**）

```bash
node proto/character3d_runtime_demo/build.mjs                   # 构建 bundle + 落地资产 + 静态导入门
node proto/character3d_runtime_demo/tests/runtime-demo-browser.mjs --runs=2
# 可选：--aa=fxaa|native|auto  --profile=sim|spec  --vw=390 --vh=844 --dsf=2
```

- 起零依赖静态服务器（`node:http`）→ 系统 Chrome（headless，复用仓库既有 `playwright-core`）→ 加载**同一份
  `bundle.js`**，靠 `browser/wx-shim.js` 提供 `wx` 全局（内存 FS + fetch 取代码包文件 + `crypto.subtle` 真摘要 +
  Blob URL 贴图 + `WEBGL_lose_context` 真注入）。
- 产物落 `evidence/`：`sim-result-run*.json`、`sim-console-run*.json`（含 `__CHAR3D_RUNTIME_RESULT__` 原文与 tap 单行）、
  每项取景 PNG、`sim-page-run*.png`、`sim-summary.json`。
- 退出码：全绿 0 / 有断言 FAIL 1 / 环境异常 2。
- **sim 结论一律 `SIM_` 前缀**：它只证明代码路径通。真机能力证据（A1 类结论）必须来自 HONOR 扫码运行。

## 7. 静态导入门（`build.mjs` 每次都会跑，也可单独 `--check`）

逐项核对（微信开发者工具本地可核的部分 + 本卡红线）：

1. 主包有 `game.js`；`game.json` 可解析且 `deviceOrientation=portrait`；
2. **每个 `subpackages[].root` 下有 `game.js`**（S0 真机踩过的导入拦截原因）；
3. `project.config.json`：`compileType=game` + 非空 appid；
4. 分包资产副本与 `config/character-3d.ts` 的清单**逐字节核对**（byteLength + SHA-256），缺失即复制；
5. 入包文件名 ASCII + `game.js`/`bundle.js` 语法合法；
6. 红线：宿主源码与 bundle **不含** `proto/webgl2_probe` 引用，bundle **不含** `systems/battle-core|battle-session`；
7. **入包 JS 零动态代码求值**：`bundle.js` / `game.js` 命中 `new Function(` / `Function(` / `eval(` 即**失败退出**
   （微信小游戏运行时禁用动态求值 —— T31-FE-C P0：旧包用 `new Function(源码)` 注册模块，真机一加载即
   `TypeError: m.fn is not a function`）。同族限制（字符串型 `setTimeout/setInterval`、动态 `import()`）
   一并扫描并**提示**（不阻断）；模块体自身带动态求值会在构建期直接抛错。

8. **入包 JS 零 ES2020 语法记号**：`bundle.js` / `game.js` 命中 `??` / `?.` 即**失败退出**
   （微信预览编译链不接受 ES2020 语法 —— T31-FE-C P0-2：`invalid file: bundle.js, 30:66` +
   `SyntaxError: Unexpected token ?`）。发射目标固定 **`ts.ScriptTarget.ES2017`**（`build.mjs` 顶部常量）：
   TS 会把 `??`/`?.` 降级成 `!= null / !== void 0` 判断，async/await 与 `for...of` 保持原生。
   其它「运行时接受度」类记号（ES2019+ 语法、`Object.fromEntries`、`.at()`、`BigInt` 等）一并扫描并**提示**。

9. **完整性观测齐备**（P0-4）：`resource.assetIntegrity[]` 逐资产给出 `integrityMode` / `observedByteLength` /
   `observedSha256` / `expected*` / `readSource` / `headHex64` / `tailHex64` / 结构账；缺字段即视为门失败
   （诊断是资源门失败时的唯一线索，不能在失败路径上丢）。

> 模块注册形态 = **函数字面量内联**（`__def("<id>", function (require, module, exports) { <模块体> });`），
> 与 webpack/rollup 同形态；禁用「源码字符串 + 构造」两段式（Node/Chrome 能跑、真机必崩）。

### 7.1 阶段顺序（自测不得毒死测量）

```
boot（资源门装配）→ sixdir（六向）→ states（全状态）→ jump-trio（轻功三元）→ perf（1/5/10/20 压测）
→ 【中间快照落盘 char3d_<hash>_result_run<n>_precontext.json】→ context（上下文丢失/恢复自测）
```

- **上下文自测排在整轮最后**：平台不支持恢复时，前面的测量结果照常产出与导出（结果 JSON 的
  `phases` 逐阶段状态 + `phasesOrder` 一眼可见「哪一步没跑」）。
- 恢复路径二选一，**快路径不可用必须落真重建（不得判失败）**：
  `restoreVia='event'`（平台允许扩展恢复）或 `restoreVia='rebuild'`（新建离屏 canvas + webgl2 context，
  经 loader 从缓存重新装配并重传资源 —— 方案 §6.2 原文）；两条都不成才是 `unsupported`（走暂停 + 错误页）。
- 三个 sim 场景（产物各自带前缀，互不覆盖）：
  · **常规** `--runs=2` → `evidence/sim-*`（事件快路径）
  · **`--norestore=1`** → `evidence/sim-norestore-*`（复刻微信模拟器「restoreContext 被拒」⇒ 真重建路径）
  · **`--rewritejson=1 --runs=4`** → `evidence/sim-rewritejson-*`（复刻真机 P0-4 + P0-5：平台改写包内文本资产
    ⇒ 结构不变量放行；且**冷 3 次后第 4 次必须热命中**——断言 `#4(downloads=0, cacheHits=5)` 且运行历史出现 `cacheState=hot`）

### 7.2 资源完整性口径（P0-4：包内文本 vs 二进制 vs CDN）

**R2 定版口径（改 `.bin` 之后，一律严格身份）**：

| 资产 | 身份口径 | 说明 |
|---|---|---|
| **包内载荷（全部，含 clip 与 GLB）** | **严格 byteLength + SHA-256**（`integrityMode` 恒 `'strict'`） | 包内以 `urlPath + '.bin'` 落盘（绕过微信包管线对 `.json` 的处理；见 §7.2.1），字节与清单**逐字节可比** ⇒ 恢复严格身份。**无任何结构性旁路** |
| **结构校验** | **纯诊断**（`structuralDiagnostic`） | JSON 可解析 → 生产解析器 `parseCharacter3DClipJson` 全过 → 时长与 `config/character-3d` 清单真值一致 → nFrames/时长自洽 → 轨道值有限 → coveredJoints 非空；结果只**记录**，**不作为 Device-PASS 依据** |
| **动作存活门** | **硬门** | `motionStatic=true`（四元数恒单位 + root 恒零 ⇒ 动作是死的）⇒ **判失败**（arch seq=424 反例）；`fatalReason` 非空（不是合法 JSON / 不符合生产解析器契约）也判失败 |
| **CDN 下载路径** | **严格** byteLength + SHA-256 | 线上路径口径不变（CDN 侧文件名仍是 `.json`） |

诊断字段怎么读（一次真机运行即可判定平台改写 vs 读取截断）：

```
__CHAR3D_INTEGRITY__={...}     ← console 单行（真机把这一行抄回来即可定位）
resource.assetIntegrity[]      ← 结果 JSON 里的完整版
  integrityMode      strict | structural     本次该资产适用的完整性口径
  observedByteLength / observedSha256        设备实际读回的长度与摘要
  expectedByteLength / expectedSha256        清单期望（config/character-3d 真值）
  readSource                                 读回来的字节走哪条路（分包 readFile 候选命中 / 缓存 readFileBytes / downloadFile）
  headHex64 / tailHex64                      首尾各 64 字节 hex：与仓库对照可判「前缀截断 / 中段丢失 / 整体重排」
  structuralOk / structuralSummary / structuralDetail   结构账（fps/nFrames/时长/骨轨道/rootTrack/值有限）
  source / loadStatus                        download | cache-hit | stale-lkg
resource.readSourceTrail[]     ← 适配器读取轨迹（readFile 候选 / writeTempFile / getFileInfo digest / cachePut 逐条）
```

### 7.2.1 平台改写结案（P0-4 · 真机 run10 证据）

**能证的**：真机（run10）读回的 4 个 clip **不是损坏/截断**，而是语义等价、逐项符合 JS `JSON.stringify` 输出形态
的字节（三类指纹同时在 4 个文件复现）；同轮 GLB 字节与 SHA **与清单逐字一致** ⇒ 被改写的只有 `.json` 类文件。
**不能证的**：「包管线重跑 `JSON.stringify`」是**假设**——本机复现只有 685959B，设备读回 685411B，**两者不等**
⇒ 机制未证（arch seq=424）。**本卡不拿机制当依据**，改为让字节保真（下方 R2 处置）。

三类指纹（真机 `headHex64/tailHex64` 与仓库文件对照得出，均可在 Node/Chrome 用 `JSON.parse`+`JSON.stringify` 复现）：

1. 空白压缩：`{"source": "…` → `{"source":"…`、`, 0], [0, ` → `,0],[0,`；
2. JS 数字格式化：`1.2074321069956486e-05` → `0.000012074321069956487`、`8.818787402599554e-07` → `8.818787402599554e-7`、
   `-0.16920790351992107` → `-0.16920790351992108`；
3. `\uXXXX` 转义还原为原字符（`JSON.stringify` 默认不转义非 ASCII）。

字节账（仓库 → 设备）：idle `726299 → 685411`、atk `162924 → 153664`、cast `490227 → 462266`、jump `166799 → 156861`、
GLB `4040728 → 4040728`（0 变化）。逐资产证据见 `evidence/SUMMARY.md` §B.6。

**R2 处置（已落地）**：包内载荷一律 `urlPath + '.bin'`（`build.mjs` 落盘 + `adapter-local` 候选优先），
CDN 侧文件名不变（仍 `.json`）⇒ 身份校验回到**严格 byteLength+SHA**，结构校验降为纯诊断，另加动作存活硬门。
静态门同时禁止分包里再出现 `.json` 载荷（`build.mjs` 会 exit 1）。

**对契约的含义（只记录与提候选，契约改动由主架构裁；本卡不改契约）**：现行契约把 `.json` 的 `sha256`+`byteLength`
当字节级真值（方案 §6.1），这条在**包内路径**上不成立 ⇒ **需要字节级 SHA 校验的资产不宜以 `.json` 走包内路径**。候选：

1. 换非 `.json` 扩展名（`.bin`）随包走 —— **本卡已采用**（sim 侧已证 `.bin` 零改写 + 逐字节一致；真机复测进行中）；
2. 走 CDN（线上路径本就是严格 SHA）—— **09-15 真机验**（见 §9）；
3. 其余（`.dat` 等）等价方案，如需更换扩展名在此登记。

### 7.3 缓存索引的自洽基准 = 「盘上事实」（P0-5）

> 病灶：结构性放行的资产曾按**清单值**登记索引 ⇒ 下次启动「盘上文件长度 ≠ 索引长度」⇒ 索引被摘除重读
> ⇒ `cacheHits` 永远 0、**热缓存序列无法推进**（真机实测「冷 3/3 后热缓存恒 0/3」）。

修法（口径写死，别再漂）：

| 项 | R2 口径（一律 strict） |
|---|---|
| `cachePut` 登记值 | **清单值**（`sha256` + `byteLength`）= **内容版本**；版本不符**不得**当热命中 |
| **cacheHit 判定** | 索引命中 **且 索引 = 清单**（版本绑定）**且** 盘上文件长度一致 **且** **实测摘要** = 清单 |
| `observedSha256` | **只在真的算过时才写**；两条摘要路径都不可用 ⇒ `null` + note `not-measured`，且**不当热命中**（失败关闭） |
| 读盘完整性 | 缓存文件被**截断**（长度不符）或**篡改**（长度相同、内容变了）⇒ 一律检出、摘掉条目并重读（`cache-length-mismatch` / `cache-digest-mismatch`） |
| LKG 回退 | 同样「长度 + 实测摘要」双校验；坏 LKG 不回流（拒绝后摘掉条目）。修法：版本不符时**先不摘**条目，留给 LKG 兜底（历史 bug：早摘会导致 LKG 读不到文件） |

- **`cacheHit` 的定义**：索引命中且**盘上文件与索引记录一致**（长度 + 实测摘要）；**不以"看起来像"为条件**。
- 旧索引（上一版口径写的）在下一次启动会被摘掉一次并按新口径重建（自愈，仅多读一次）。

### 7.4 朝向映射口径（T31 FE 整改定版）

- **公式**：`yawDegForFacing = normalizeSigned(源视角yaw − 180)`。六向值：
  `right=+90 · rightdown=+45 · rightup=+135 · left=−90 · leftdown=−45 · leftup=−135`。
- **推导（实测基准 + 代数，非调参）**：① 运行时正交相机固定在 **+Z 看 −Z**（`orthoPixel` 的 z 越大越靠相机）；
  ② 实拍 θ=0 看到人物**正面** ⇒ 模型自身前向 = **+Z**；③ 美术参照帧语义（目验 + 判据）：`battle_idle_leftup`
  是背面 ⇒ 帧名 up/down 为标准 RPG 语义；④ 逐向要求解出上表 ⇒ ⑤ 与源视角表对上 `θ = 源视角yaw − 180`。
  旧口径 `270 − 源视角yaw` 是**反射**（不是常数偏置）⇒ 整体错位、左右不成镜像、上下互换。
- **回归门（两道）**：
  · 离线（vitest）：`tests/character3d-math.test.ts` 的「六向语义锁」——把 yaw 转成前向向量，断言
    left* 屏幕左/right* 屏幕右、down 朝观众/up 背向，并显式拒绝旧口径；
  · 运行期（浏览器实拍）：`node proto/battle_demo/tools/measure_facing_runtime.mjs --gate=1`
    （判据 = 头部「肤重心 x − 发重心 x」，left* < −2 / right* > 2），以及 `shot_character3d.mjs` 末尾
    自动跑的同一门（`shots/c3d_facing_gate.json`）。

### 7.5 移动态改播 run（T31 FE · P0-B）

- 快照 `animState='walk'` 的槽位键不变，但**资产**改取 GLB 内嵌 `preset:biped:run`（按名字解析，禁按序号）：
  见 `config/character-3d.ts` 的 `HERO_3D_CLIP_REFS.walk` 与 `HERO_3D_EMBEDDED_CLIPS.run`。
- 依据：Leo 明确口径「战斗内移动改用 run 素材」（与 09-11 口径一致）；方案 §5 原表写 walk，以 Leo 口径为准。
- 连带的播放节奏：嵌入 clip 的循环周期取该 clip 自身时长（run ≈ 1.25s，walk ≈ 2.33s）⇒ 跑动步频更快。

## 8. 已知缺口与不确定项（交付时如实登记）

1. **CDN 未跑**（见 §5）——需要已备案域名才能补；不影响本卡其它判定。
2. **第二台异品牌安卓未采**（并行补采，不阻塞本卡；A1 升格仍需 ≥2 台 × 各 3 次冷启动）。
3. **真机证据已回填**：`evidence/device_honor_ptpan20_result_run10.json`（Leo 真机 run10）+
   `SUMMARY.md` 的 B 块。**未取项**（如实留白，不许拿别的数据顶替）：六向/全状态截图（`screenshot=null`）、
   `wx.canvasToTempFilePath` 可用性、结果回传各通道可用性、`__CHAR3D_TAP__` 样本、逐轮 downloads/cacheHits。
4. **契约待裁（平台改写，P0-4 结案）**：包内 `.json` 会被微信打包/预览管线重跑 `JSON.stringify`（证据见 §7.2.1），
   现行"字节级 SHA 清单"在包内路径上不成立；三条候选已列，**本卡不改契约**，等主架构裁。
5. `wx.canvasToTempFilePath` 在部分基础库不可用 ⇒ 截图可能需手动（真机 run10 该项未取得）。
6. 分相 `animMs/submitMs` 是**时间代理**测的（§4.2），与 S0 自带插桩不完全同源，只用于横向看趋势。
7. `runs[]` 未逐轮留存 downloads/cacheHits（只存"本次启动"的 `loaderStats`）⇒ B.2 表的这两列只能留白。

## 9. CDN 模式（2026-09-15 真机验收用）

> 目标：把资源来源从「分包本地路径」切到**真实 CDN**（`wx.downloadFile` + 校验 + 落盘登记 + LKG），
> 与线上路径同口径。CDN 侧文件名**保持 `.json`**（包内才是 `.bin`；包管线不影响 CDN）。

### 9.1 上传清单（5 个文件 · 与 `config/character-3d.ts` 逐字一致）

放到 CDN 的 **`<你的 base>/`** 下，保持如下相对路径与文件名（`<sha12>` = 该文件 SHA-256 前 12 位，已算好）：

| # | urlPath（相对 base） | 文件名 | 字节数 | SHA-256（前 12） |
|---|---|---|---|---|
| 1 | `characters/hero/ff9202b48470/hero_48k_20260914.glb` | `hero_48k_20260914.glb` | 4,040,728 | `ff9202b48470` |
| 2 | `characters/hero/0d3262385d45/idle_v4.json` | `idle_v4.json` | 726,299 | `0d3262385d45` |
| 3 | `characters/hero/546ec94f9906/atk_v4.json` | `atk_v4.json` | 162,924 | `546ec94f9906` |
| 4 | `characters/hero/3bca24123582/cast_v4.json` | `cast_v4.json` | 490,227 | `3bca24123582` |
| 5 | `characters/hero/2895612562c2/jump_v6_1p5s.json` | `jump_v6_1p5s.json` | 166,799 | `2895612562c2` |

- **必须逐字节原样上传**（CDN 走严格 `byteLength + SHA-256`；任何压缩/重排版都会被判为字节不符而拒用）。
  源文件 = `assets/characters/hero/model/hero_48k_20260914.glb` + `assets/characters/hero/anim/*.json`
  （与 `proto/battle_demo/cdn/` 里的镜像逐字节一致，可直接用后者上传）。
- 全量 SHA-256 见 `config/character-3d.ts`（`HERO_3D_MODEL_REF` / `HERO_3D_CLIP_REFS`）。

### 9.2 微信后台配置（Leo）

1. **服务器域名** → `downloadFile 合法域名` 加入你的 CDN 域名（必须 **HTTPS**）。
2. 该域名的证书要有效（自签/过期会被 `downloadFile` 直接拒）。

### 9.3 注入 base URL（三种方式，任选；优先级从上到下）

| 方式 | 怎么做 | 适用 |
|---|---|---|
| ① devtools 一行命令（**最快**） | 开发者工具 Console：`wx.setStorageSync('char3d-cdn-base','https://<你的域名>/<路径>')` → 重扫 | 模拟器 |
| ② 包内文件（**真机推荐**） | 把 base URL（一行，无引号）写进导入目录里的 `cdn-base.txt` → 工具重新**预览** | 真机扫码 |
| ③ 不配置 | `cdn-base.txt` 为空且 storage 无值 ⇒ **自动走分包本地路径**（现状行为） | 默认 |

- base 里**不要**带 `characters/...`（base 只到目录，例如 `https://cdn.example.com/char3d`）。
- 屏上第 3 行会显示当前资源源与 base（`资源 cdn · base cdn.example.com/char3d`），一眼可确认切换是否生效。
- **屏上「切资源源」按钮**：有 base 时在 `CDN ↔ 分包本地路径` 之间来回切（写 storage 并**立即重装配**，不用重扫）；
  无 base 时按键只给提示（"把 HTTPS 地址写进包内 cdn-base.txt"）。

### 9.4 跑到什么程度算过（本轮验收看这几项）

1. 面板第 3 行：`资源 cdn · base <你的域名>`；`缓存` 列随冷/热链变化；
2. 结果 JSON 里（`resource.downloadStats`）：
   - `sourceMode='cdn'`、`baseUrl`、`baseUrlSource`（`storage` / `package-file`）
   - `downloads=5`、`bytes=5,586,977`（= 上表 5 个文件之和）、`ms>0`、`cacheHits=0`（首启）
   - 每个资产 `byteLengthMatches=true`、`sha256Matches=true`、`integrityMode='strict'`
3. **热链**：第二次启动 `cacheHits=5`、`downloads=0`（CDN 下载的内容同样会落盘登记，走 P0-5 的版本绑定命中）；
4. console 单行 `__CHAR3D_INTEGRITY__={"downloadStats":{...}}` 可直接抄回来。

### 9.5 域名/网络没配好时的预期表现（**先照这个对，别猜**）

| 现象 | 屏上 | 结果 JSON | 判定 |
|---|---|---|---|
| 合法域名未配置 | 第 7 行 `判定 … device=DEVICE_FAIL` + 末行 `✗ 流程失败：资源门失败：…downloadFile:fail url not in domain list` | `downloadStats.domainBlocked=true`、`failureReasons[0]` 含 `url not in domain list` | **就是白名单没生效**（不是代码问题） |
| base 路径写错 / 404 | 同上，原因含 `HTTP 404` | `domainBlocked=false`、`failureReasons[0]` 含 `HTTP 404` | URL/路径写错 |
| 断网 / 超时 | 同上，原因含 `downloadFile 失败` / `download timeout` | `timeouts>0` 或 `networkErrors>0` | 网络问题；loader 会**重试恰 2 次**（1s、3s）后失败 |
| 上传内容与清单不符（压缩/改排版） | 同上，原因含 `byteLength-mismatch` 或 `sha256-mismatch` | 该资产 `byteLengthMatches=false` / `sha256Matches=false` + `observedByteLength/observedSha256` | **上传件不是原样字节**（按 §9.1 重传） |

- 失败时**不会**静默：一律 DEVICE_FAIL + 显式原因（资源门失败页语义见 §6.2），且**不切 2D 帧、不进入战斗**。
- `resource.loadStatus='failed'` + `assetIntegrity[]` 里逐资产都能看到 `observedByteLength/observedSha256/headHex64/tailHex64`。

### 9.6 联调自测（不用真机也能先跑一遍）

```bash
# 用仓库内的 CDN 镜像当"CDN 空间"，端到端跑真实下载链（sim）
node proto/character3d_runtime_demo/tests/runtime-demo-browser.mjs --runs=2 --cdn=ok   # 期望全绿 + downloads=5/bytes=5586977
node proto/character3d_runtime_demo/tests/runtime-demo-browser.mjs --runs=1 --cdn=bad  # 404 失败路径（domainBlocked=false）
node proto/character3d_runtime_demo/tests/runtime-demo-browser.mjs --runs=1 --cdn=nodomain  # 白名单失败路径（domainBlocked=true）
```
