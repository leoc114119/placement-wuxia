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
