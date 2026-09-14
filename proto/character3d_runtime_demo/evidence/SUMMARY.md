# T31-FE-C · runtime smoke 证据汇总（SUMMARY）

> 目录：`proto/character3d_runtime_demo/`　分支：`task/t31-fea`　方案：`2.5D角色运行时接入技术方案 v1.0` §8 卡 C
>
> **本文件的两块内容必须分清**：
> - **A 块 = 浏览器 sim 预检**（已跑，结论一律 `SIM_` 前缀，**不是**微信/安卓能力证据，方案 §9.3）；
> - **B 块 = 真机证据（已回填：Leo 在 HONOR PTP-AN20 跑完 run10）**——数据源 = 归档件
>   `evidence/device_honor_ptpan20_result_run10.json`（本文件所有 B 块数字都从该文件抄录，未作推断；
>   该文件里没有的项一律留白并标「未取得」）。
>
> A 块数字的出处（本文件所有 A 块数字都逐项对得上这几个文件，不再出现"无出处的数字"）：
> `evidence/sim-result-run2.json`（常规场景末次启动）、`evidence/sim-summary.json`（常规 34/34）、
> `evidence/sim-norestore-summary.json`（37/37）、`evidence/sim-rewritejson-summary.json`（45/45）。

---

## A. 浏览器 sim 预检（已跑：`node proto/character3d_runtime_demo/tests/runtime-demo-browser.mjs --runs=2`）

- 产物：`evidence/sim-result-run{1,2}.json`、`evidence/sim-console-run{1,2}.json`、`evidence/sim-summary.json`、
  每项取景截图 `evidence/sim-run2-shot-*.jpg`（13 张：六向 6 + 全状态 7）、页面截图 `evidence/sim-page-run*.png`。
- 环境：headless Chrome（ANGLE Metal，Apple M4）·viewport 390×844 @2x ⇒ **backbuffer 780×1688** ·
  SDK `3.5.7-sim`（shim）· 同机请求 `antialias:true`，**有效值 false** ⇒ `edgeMode='fxaa'`（与 S0 真机结论一致）。
- 断言（三场景）：常规 **34/34**、`--norestore=1` **37/37**、`--rewritejson=1 --runs=4` **45/45**
  （明细见各自的 `sim-summary.json` / `sim-*-summary.json`）。关键判定（常规场景）：

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
| 首启分段计时 | `subpackageMs 1 · loaderMs 43 · glbParseMs 3 · animParseMs 2 · textureDecodeMs 2 · firstGpuUploadMs 56`<br>（出处：`sim-result-run2.json` → `resource.assetStages`；分段计时**逐次运行都不同**，引用时须带 run 号） |
| 冷链（本次装配） | `downloadAttempts 5 · downloads 5 · cacheHits 0 · failures 0 · shaMismatches 0 · byteLengthMismatches 0 · structureRejects 0`<br>（出处：同上 → `resource.loaderStats`） |
| 热链（进程内替换式重装配） | `cacheHits 5 · downloads 0` ⇒ `resource.hotChainObserved=true` |
| 已执行分支 | 清单校验 / cache-by-SHA 判定 / 未命中→取字节→临时落盘 / SHA-256 校验 / byteLength 校验 / GLB 结构门（41 骨·1 primitive）/ 原子登记 LKG（失败回滚）/ LKG 回退分支 / GLB+动作解析 / 贴图解码 / 首传 GPU / 热命中链 |
| **未执行分支** | `wx.downloadFile` HTTP 下载与 statusCode/timeout/abort、**downloadFile 合法域名白名单**、CDN 服务端版本化与回源、真实断网重试间隔（1s/3s）与网络错误分类 |

### A.2 FXAA 分支下的 1/5/10/20 复测（`a2Profile=sim-short`，**非 spec 档**）

`edgeMode=fxaa` · 有效 antialias `false` · backbuffer `780×1688`。

`gpuMs` 口径（**按 committed JSON 如实写**）：sim 侧 `gpuMs = 0`、`gpuMsSource = EXT_disjoint_timer_query_webgl2`
——即该 headless Chrome **有**真 timer ext，采样值为 0ms（短档 + 负载极小的正常读数）；真机侧（B.3）为
`gpuMs = null / unavailable`（该基础库无该扩展）。两端都不使用 `performance.now` 冒充 GPU 时间。

（出处：`sim-result-run2.json` → `capacity[]`，逐列抄录）

| 档 | fpsMedian | 1% low | frameMsP95 | frameMsP99 | over50ms | passMs(mean) | anim(mean) | submit(mean) | 合成(mean) | gpuMs | draw/palette | 帧数 | 秒 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1u | 59.88 | 57.64 | 17.1 | 17.2 | 0 | 0.2110 | 0.1895 | 0.0215 | 0.0950 | 0 | 1/1 | 181 | 3.000 |
| 5u | 59.88 | 46.84 | 16.9 | 18.1 | 0 | 0.3802 | 0.3434 | 0.0368 | 0.1170 | 0 | 5/5 | 182 | 3.009 |
| 10u | 59.88 | 40.90 | 17.6 | 17.7 | 0 | 0.4989 | 0.4665 | 0.0324 | 0.0890 | 0 | 10/10 | 182 | 3.002 |
| 20u | 59.88 | 55.71 | 17.6 | 17.8 | 0 | 0.9119 | 0.8385 | 0.0734 | 0.1108 | 0 | 20/20 | 361 | 6.000 |

- 20u 可见性（出处：`sim-result-run2.json` → `capacity[3].visibilityNote`）：`fillRatio=0.2629`，
  逐单位 `alpha>0` 像素 ≈18.5k（`perf-0:18536, perf-1:20495, …`）⇒ 20/20 全可见（真机侧见 B.3）。
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
2. **跨启动热链要看场景**：
   - 常规场景（`--runs=2`）：shim 的文件系统在内存里，页面重载即清空 ⇒ 两次启动都记 `cold`；A 块用
     **进程内替换式重装配**证明热链（`reloadStats.cacheHits=5, downloads=0`）。
   - `--rewritejson=1 --runs=4` 场景：harness 把上一轮的用户目录缓存文件**转存并注入**下一次启动
     （shim 开关 `__WX_SHIM_PRESEED_FILES`，复刻真机持久盘）⇒ 能跑出跨启动热链
     `#1(dl=5,hits=0) → #2(dl=5,hits=0) → #3(dl=5,hits=0) → #4(dl=0,hits=5)`、运行历史 `#4:hot`。
     **注意**：这里的"盘"是 harness 搬运的，等价性是**语义级**（真机是持久盘）——真机跨启动热链以 B 块 `runs[]` 为准。
3. 20u 为短档采样（`specProfile=false`）⇒ 不给容量结论。
4. 截图来自 `wx.canvasToTempFilePath` 的 shim 等价路径（真机该 API 是否可用需真机确认，见 B.5）。

---

## B. 真机证据（已回填：HONOR PTP-AN20 · run10）

> 数据源 = 归档件 `evidence/device_honor_ptpan20_result_run10.json`（Leo 真机跑完导出，**已入库**）。
> 下表逐项抄录，**未作推断**；该文件里没有的项留白并标「未取得」。
>
> ⚠ **口径标注（必读）**：run10 是 **R2 之前**的构建跑出来的（当时包内还放 `.json`、身份口径为
> `integrityMode=structural`）。R2 起已改为「包内 `.bin` 载荷 + 严格字节身份」，**需要真机复测一轮**才能把
> B 块的资源链/身份数字更新到 R2 口径（六向/全状态/上下文/20u 这些**与包内载荷无关**的结论仍然有效）。
>
> **版本映射**：run10 的 `env.commitSha` 为**空**（当轮产物靠 devtools storage 手设 `char3d-commit-sha`，
> 未设 ⇒ 断链）。R2 起改为 **build.mjs 把 `commitSha/builtAt/payloadSuffix` 编进产物**（`env.build`），
> 并新增 `env.assetManifestVersion`（模型 + 4 条 clip 的清单 SHA 摘要）⇒ 「产物 ↔ 资产清单版本」可对表，
> 不再依赖手工设置。

总判定（`verdict`）：

| 项 | 值 |
|---|---|
| `verdict.device` | **`DEVICE_PASS`**（`runs[]`：冷 3/3 + 热 3/3 全绿） |
| `verdict.sixdir` / `verdict.states` | `PASS` / `PASS` |
| `verdict.contextRestore` | **`ALTERNATE_ONLY_PASS`** —— 该基础库**无** `WEBGL_lose_context`（`extAvailable=false`，`injectionMode='host-api-fallback'`）⇒ 按本卡口径只算**替代验证**，不当作「真机上下文丢失」证据（如实标注，不越级写 PASS） |
| `verdict.capacity20` | **`CAPACITY_PASS`**（引擎判定同为 `CAPACITY_PASS`，`capacity20Reasons=[]`） |

### B.1 设备与环境（`device` / `canvas` / `rendererInfo` / `resource`）

| 字段 | 值 |
|---|---|
| brand / model / system / platform | HONOR / PTP-AN20 / Android 16 / android |
| SDKVersion / benchmarkLevel | **3.17.3** / 46 |
| pixelRatio / screen / window | 3.5（渲染用 `min(dpr,3)=3`）/ 366×800 / 366×800 |
| `deviceHash` | `xhdq2m` |
| backbuffer（实际物理像素） | **1098×2400**（`renderScale=1`，`dprCappedAt=3`） |
| requested contextAttributes | `alpha:true · antialias:true · depth:true · premultipliedAlpha:true · preserveDrawingBuffer:true` |
| **effective** contextAttributes | `alpha:true · **antialias:false** · depth:true · premultipliedAlpha:true · preserveDrawingBuffer:false · stencil:true` |
| `edgeMode` | **`fxaa`**（有效 antialias=false ⇒ FXAA 是生产分支，与 S0 结论一致） |
| vendor / renderer（掩码） | `WebGL 2.0(OpenGL ES 3.2)` / 同左 |
| **unmasked** vendor / renderer | `Qualcomm` / **`Adreno (TM) 830`** |
| glVersion / glslVersion | `WebGL 2.0(OpenGL ES 3.2)`（该基础库这两字段同串） |
| maxVertexUniformVectors | 256 |
| 41 骨 / 顶点 / 索引 | `jointCount=41` · `vertexCount=29281` · `indexCount=145257` |
| `resource.mode` | `local-subpackage` |
| `modelResolvedPath` | `null` —— 本次启动 5 个资产**全走热命中**，未读分包 ⇒ 无「候选命中路径」可记（正常，不是缺失） |
| 首启分段计时 | `subpackageMs 17 · loaderMs 115 · glbParseMs 16 · animParseMs 58 · textureDecodeMs 207 · firstGpuUploadMs 145`（ms） |
| `loaderStats`（本次启动） | `downloads 0 · cacheHits 5 · failures 0 · shaMismatches 0 · byteLengthMismatches 0 · structureRejects 0 · timeouts 0 · networkErrors 0` ⇒ **热启动** |
| `reloadStats`（重试重装配） | `downloads 0 · cacheHits 5` ⇒ `resource.hotChainObserved=true` |
| `phases` | boot ok **637ms**（edgeMode=fxaa · 缓存=hot · local-subpackage）→ sixdir ok 2931ms → states ok 3497ms → jump-trio ok 3498ms → perf ok **190650ms**（1u/5u/10u/20u fpsMedian 均 62.5）→ context ok 2600ms（`host-api-fallback → rebuild`） |

### B.2 冷启动 ×3 与热缓存 ×3（DoD 硬要求）

出处：`runs[]`（10 条，本机运行历史）。**说明**：`runs[]` 每条只记 `cacheState` 与各阶段 ok/失败数，
**未逐轮留存** downloads/cacheHits（只有"本次启动"的 `loaderStats`，见 B.1）⇒ 这两列逐轮值标「未留存」。

| 第 n 次启动 | 类型（杀进程重开 / 后台回前台） | 屏上 `缓存`（`runs[].cacheState`） | `downloads` | `cacheHits` | sixdir | states | context | 结论 |
|---|---|---|---|---|---|---|---|---|
| 1 | 冷（杀进程） | `cold` | 未留存 | 未留存 | ok | ok | ok | 冷系列 ✓ |
| 2 | 冷（杀进程） | `cold` | 未留存 | 未留存 | ok | ok | ok | 冷系列 ✓ |
| 3 | 冷（杀进程） | `cold` | 未留存 | 未留存 | ok | ok | ok | 冷系列 ✓（**冷 3/3 达成**） |
| 4 | 热（杀进程重开即可，缓存落盘） | `mixed` | 未留存 | 未留存 | ok | ok | ok | 过渡（部分资产命中） |
| 5 | 热 | `mixed` | 未留存 | 未留存 | ok | ok | ok | 过渡 |
| 6 | 热 | `mixed` | 未留存 | 未留存 | ok | ok | ok | 过渡 |
| 7 | 热 | `mixed` | 未留存 | 未留存 | ok | ok | ok | 过渡 |
| 8 | 热 | `hot` | 未留存 | 未留存 | ok | ok | ok | 热系列 ✓ |
| 9 | 热 | `hot` | 未留存 | 未留存 | ok | ok | ok | 热系列 ✓ |
| 10 | 热 | `hot` | **0** | **5** | ok | ok | ok | 热系列 ✓（**热 3/3 达成**；压测在本轮自动跑） |

- 第 10 次（本轮，`loaderStats` 见 B.1）：`downloads=0 · cacheHits=5` ⇒ 热命中链在真机成立（P0-5 的效果）。
- `#4–#7` 的 `mixed` 是**升级前旧索引**（按清单值登记）被逐批摘除并按盘上事实重建的过程（P0-5 自愈），第 8 次起全热。
- 结论：`verdict.device = DEVICE_PASS`（冷 3/3 + 热 3/3 全绿）。

### B.3 FXAA（生产分支）下的 20u spec 档四档数字（方案 §5.3）

出处：`capacity[]`（`specProfile=true`、`truncated=false`）。`gpuMs` 四档均 `null`（`EXT_disjoint_timer_query_webgl2` 不可用）。

| 档 | fpsMedian | 1% low | frameMsP95 | frameMsP99 | over33ms | over50ms | contextLost | glError | draw/palette | 全可见 | 帧数 / 秒 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1u | 62.5 | 26.35 | 17 | 32 | 0.775% | 0.111% | 0 | 0 | 1/1 | ✓ | 1807 / 30.013 |
| 5u | 62.5 | 25.85 | 17 | 33 | 0.775% | 0.111% | 0 | 0 | 5/5 | ✓ | 1807 / 30.007 |
| 10u | 62.5 | 24.23 | 17 | 33 | 0.885% | 0.166% | 0 | 0 | 10/10 | ✓ | 1807 / 30.009 |
| 20u | 62.5 | 27.74 | 18 | 33 | 0.859% | **0.055%** | 0 | 0 | **20/20** | ✓ | 3609 / 60.015 |

- 20u 判定（S0 §5.3 六条逐条）：`fpsMedian 62.5 ≥ 30` ✓ · `frameMsP95 18 ≤ 33.3` ✓ · `frameMsP99 33 ≤ 50` ✓ ·
  `over50msRatio 0.055% ≤ 1%` ✓ · `contextLost 0 / glError 0` ✓ · `draw=20 / palette=20` ✓ · `allUnitsOnScreen=true` ✓
  ⇒ **`verdict.capacity20 = CAPACITY_PASS`**。
- 分相（20u，出处同表）：`passMsMean 1.6586 · animMsMean 1.481 · submitMsMean 0.1776 · compositeCpuMsMean 0.0202`。
- 20u 可见性（`visibilityNote`）：`fillRatio=0.2961 · bb=1098x2400 · perf-0:45397, perf-1:54649, …`（逐单位 alpha>0 像素数）。
- 方案 §9.2 要求的记录项：`renderer=WebGL 2.0(OpenGL ES 3.2)`（unmasked `Adreno (TM) 830`）·
  `contextAttributes.antialias=false` · `edgeMode=fxaa` · `backbuffer=1098×2400` · `cacheHit=是（本次启动热命中）`。

### B.4 六向 + 全状态 + 轻功三元（真机可观测）

| 项 | 值 |
|---|---|
| 六向逐向 `activeClipKey` | `right:idle · rightup:walk · leftup:idle · left:walk · leftdown:idle · rightdown:walk`（6/6 `ok=true`） |
| 全状态逐态 `activeClipKey` | `idle:idle · walk:walk · basic:atk · charge:cast · strike:cast · jump:jump · dead:idle`（7/7 `ok=true`） |
| 轻功三元 7 例（snap/cmd/clip） | ①`jump-inside-300ms-window` true/true/jump ②`jump-after-300ms-snapshot-window` true/true/jump ③`walk-normal-no-jump` false/false/walk ④`jump-endpoint-hop0` true/true/jump ⑤`jump-landing-hop0` true/true/jump ⑥`jump-released-after-duration` true/**false**/walk ⑦`jump-died-releases` true/**false**/idle —— 全 7 例与用例表期望一致 |
| `verdict.sixdir` / `verdict.states` | `PASS` / `PASS` |
| 六向 6 张截图 | **未取得**（`sixDir[].screenshot` 全为 `null` ⇒ 自动截图未产出；手动截屏未归档） |
| 全状态 7 张截图 | **未取得**（同上，`states[].screenshot` 全为 `null`） |

### B.5 其它真机观察项

| 项 | 值 |
|---|---|
| `wx.canvasToTempFilePath` 是否可用 | **未取得**（`env.screenshots=[]` 且各项 `screenshot=null` ⇒ 自动截图未产出；是 API 不可用还是未触发**未单独记录**，不推断） |
| 上下文注入 `injectionMode` | `host-api-fallback`（无 ext ⇒ 宿主直接调 renderer 入口补桥） |
| `context.extAvailable` | **false**（该基础库不支持 `WEBGL_lose_context`） |
| 上下文恢复路径 | `lostObserved=true`（短 lost 期间 `sessionContinuedWhileLost=true`，session 继续）→ `restoreVia=**rebuild**`、`rebuildAttempted=true`、`rebuildOk=true` → `firstFrameDtSec=0`（不补算停顿）· `pauseFrozenFrames=0` · `resumeDtSec=0` · `clockResetOk=true` · `pendingFramesMax=1`（单 RAF）<br>终失败路径：`terminalFailureInjected=true` → `secondRestoreFailed=true` → `pausedOnFinalFailure=true` · `errorPageShown=true` · `inputIgnoredWhilePaused=true` · `framesWhilePaused=0` |
| 结果回传通道实际可用项 | **JSON 文件已归档 ⇒ 文件导出/分享通道可用**；「复制 / 分页截图 / console 单行」本次**未单独记录**（不推断） |
| tap 诊断单行样本（`__CHAR3D_TAP__`） | **未取得**（归档件不含 console 输出） |

### B.6 平台改写结论（P0-4 结案：微信打包/预览管线对包内 `.json` **重跑 JS `JSON.stringify`**）

真机诊断（run10 的 `resource.assetIntegrity[]`：逐资产给出设备读回的 `observedByteLength` / `observedSha256` /
`headHex64` / `tailHex64`）与仓库文件逐字节对照 —— **三处独立的格式化指纹同时出现**，且二进制不动：

| 资产 | 仓库字节 | 设备读回 | Δ | 首部指纹（仓库 → 设备） | 尾部指纹（仓库 → 设备） | 设备 `observedSha256`（前 12） |
|---|---|---|---|---|---|---|
| `hero-clip-idle-v4`（idle_v4.json） | 726299 | **685411** | −40888 | `{"source": "assets/…` → `{"source":"assets/…` | `1.2074321069956486e-05, 0], [0, 8.818787402599554e-07, 0]]}` → `,0.000012074321069956487,0],[0,8.818787402599554e-7,0]]}` | `f2f3efb67700` |
| `hero-clip-atk-v4` | 162924 | **153664** | −9260 | `{"source": "assets/…` → `{"source":"assets/…` | `-0.00363404892068477, 0], [0, -0.0019323465766734559, 0]]}` → `[0,-0.00363404892068477,0],[0,-0.001932346576673456,0]]}` | `337708f748ee` |
| `hero-clip-cast-v4` | 490227 | **462266** | −27961 | `{"source": "assets/…` → `{"source":"assets/…` | `0.0006347978525245388, 0], [0, 0.00035231276133091376, 0]]}` → `,0.0006347978525245388,0],[0,0.00035231276133091376,0]]}` | `1b2643f17737` |
| `hero-clip-jump-v6-1p5s` | 166799 | **156861** | −9938 | `{"source": "/tmp/jumpzip/Jump.dae` + U+FF08 + U+88C1 … → 同样内容但转义还原为原字符 | `-0.16920790351992107, 0.0]]}` → `,-0.16920790351992108,0.0]]}` | `b7471e717bd3` |
| `hero-model-48k-20260914`（GLB） | 4040728 | **4040728** | **0** | （字节相同） | （字节相同） | `ff9202b48470`（**与清单 SHA 逐字一致**） |

三类指纹（都能在 Node/浏览器用 `JSON.parse` + `JSON.stringify` 精确复现）：

1. **空白压缩**：`{"source": "…` → `{"source":"…`；`, 0], [0, ` → `,0],[0,` —— 即 `JSON.stringify(obj)`（不带 space 参数）的输出形态；
2. **JS 数字格式化**（`Number.prototype.toString` 规则）：
   - 十进制/指数形态切换：`1.2074321069956486e-05` → `0.000012074321069956487`；
   - 指数去前导零：`8.818787402599554e-07` → `8.818787402599554e-7`；
   - 最短往返表示微差：`-0.16920790351992107` → `-0.16920790351992108`、`-0.0019323465766734559` → `-0.001932346576673456`；
3. **`\uXXXX` 转义还原为原字符**：源文件里的 U+FF08/U+88C1 转义序列在设备读回时变成原字符（`JSON.stringify` 默认不转义非 ASCII）。

⇒ **能证的部分（形态）**：设备读回的不是「损坏/截断」的字节，而是**语义等价、逐项符合 JS `JSON.stringify`
输出形态**的字节（三类指纹同时在 4 个文件上复现；结构校验全过，`fps/nFrames/duration/骨轨道/rootTrack/值有限` 全对）。
二进制（GLB）**未被触碰**（字节与 SHA 与清单逐字一致）⇒ 被改写的只有 `.json` 类文件。

⇒ **不能证的部分（机制）**：**"微信打包/预览管线重跑 `JSON.stringify`"只是最贴合现象的假设，未获证明**。
反证摆在这里：本机用 `JSON.parse`+`JSON.stringify` 复现改写只有 **685959 字节**（sim `--rewritejson=1` 口径），
而设备读回的是 **685411 字节**；两者不等 ⇒ 设备侧还有其他因素（压缩级别/序列化实现差异等）**未知**，
本卡**不下机制结论、不再拿它当依据**（arch seq=424 同一判断）。

**R2 的处置（不再依赖机制解释）**：不猜机制，改为**让字节本身保真** —— 包内载荷一律以
`urlPath + '.bin'` 落地（`build.mjs` 落盘 + `adapter-local` 优先命中），生产 CDN 清单里的 `.json` 路径不变；
身份校验回到**严格 byteLength + SHA-256**（`integrityMode` 恒 `'strict'`），结构校验降级为**纯诊断**
（`structuralDiagnostic`），另加**动作存活硬门**（`motionStatic` ⇒ 判失败）。R2 的 sim 证据见 A.1/A.5。

**对契约的含义（只记录与提候选，契约改动由主架构裁）**：

- 现行契约把 `.json` 资产的 `sha256` + `byteLength` 当作**字节级**清单真值（方案 §6.1「URL 内容版本化 / SHA 校验」）。
  在"包内路径"上这条**不成立**：微信打包/预览管线会重跑 `JSON.stringify` ⇒ 包内 `.json` 的字节与清单不可比。
- 因此：**需要字节级 SHA 校验的资产，不宜以 `.json` 扩展名走包内路径**。候选（未采纳，待裁）：
  1. 换非 `.json` 扩展名（如 `.bin` / `.anim`）随包走 —— 需实测该管线是否只按扩展名判定（**未验证**）；
  2. 走 CDN（线上路径本就是严格 SHA；本卡 `notExecutedBranches` 已列明该链路未跑）；
  3. 维持现状：包内 `.json` 用结构不变量校验（`integrityMode='structural'`）+ 缓存索引按盘上事实登记（P0-5），
     字节清单降级为「结构契约」—— **已在真机跑通**（B.1/B.2）。
- 另注：GLB（二进制）不受影响；若将来有非 json 的文本资产（`.gltf`/`.mtl` 等）走包内，需**先实测**是否同样被改写。

---

## B0''''. P0-5 缺陷记录：热缓存恒 0/3（索引基准错，已修）

| 项 | 内容 |
|---|---|
| 现象 | 真机：冷启动 3/3 达成（P0-4 后程序能跑完），但之后每次重开**热缓存恒 0/3**、屏上一直"不加载"（`cacheHits` 永远 0） |
| 根因 | P0-4 的结构性放行资产把**清单值**写进缓存索引 ⇒ 下次启动「盘上文件长度 ≠ 索引长度」⇒ 判定为 cache-length-mismatch ⇒ 摘除索引并重读 ⇒ 热缓存序列**永远无法推进**（就是上一轮报告里如实登记的"代价"，本轮收口） |
| 修法（口径写死） | **索引的自洽基准 = 盘上真实文件，不是清单**：structural 资产的 `cachePut` 记 **observedByteLength / observedSha256**；`cacheHit` 判定 = 索引命中且**盘上文件与索引一致**（长度相等）+ 过文本结构校验——**不以"与清单相等"为条件**；清单值只用于结构校验与资产身份判断。strict（GLB / CDN）路径**逐字不变** |
| 附带的健壮性 | ① structural 命中前先过文本结构校验（盘上内容坏了不许当热命中，摘掉重读）；② LKG 回退也过文本结构校验（坏内容不回流）；③ 旧索引（按清单值写）**自愈**：下次启动摘一次、随后按盘上事实重建 |
| 防回退（用例 +4） | 「改写场景第二次启动 = cacheHit 且 downloads=0、索引记 observed」/「旧索引自愈：摘一次后即热命中」/「structural 命中前结构校验不过则不命中」/「**GLB 严格模式热命中原口径不变**（索引=清单值、清单变了即不命中，走 §6.2 LKG）」；sim 侧 `--rewritejson=1 --runs=4` 加断言：冷 3 全 cold + 第 4 次 `downloads=0 / cacheHits=5` + 运行历史出现 `cacheState=hot` |
| 修复后验证 | ① sim 三场景：常规 **34/34**、`--norestore=1` **37/37**、`--rewritejson=1 --runs=4` **45/45**；② 五门全绿（`test:battle` **752 passed/14 skipped**）；③ 三道产物门绿；④ `cli preview` 退出码 0 + IDE 日志无 invalid file/SyntaxError |
| **真机确认（run10）** | `runs[]` = `#1–#3 cold → #4–#7 mixed → #8–#10 hot`，第 10 次启动 `downloads=0 · cacheHits=5`（见 **B.2**）⇒ 热缓存计数在真机可推进、冷 3/3 + 热 3/3 达成；`#4–#7` 的 `mixed` 正是旧索引被逐批摘除重建的自愈过程 |

### 热缓存推进的 sim 证据（逐次启动）

```
--rewritejson=1 --runs=4（平台改写包内 4 个文本资产）
#1(dl=5, hits=0) → #2(dl=5, hits=0) → #3(dl=5, hits=0) → #4(dl=0, hits=5)
运行历史：#1:cold #2:cold #3:cold #4:hot
第 4 次启动逐资产来源：4 个文本资产 cache-hit（integrityMode=structural，observed 685959/153780/462699/156804 ≠ 清单）
                      GLB strict/cache-hit（索引=清单值，未被改动波及）
```
> 前 3 次是冷系列（每轮启动前按 assetId 清 LKG，保证「冷」是真冷）；第 4 次进入热系列 ⇒ 修复前恒为 cold，修复后为 hot。

---

## B0'''. P0-4 缺陷记录：真机资源门拒收（设备读回字节与清单不符；已加诊断 + 让运行继续）

| 项 | 内容 |
|---|---|
| 现象 | 真机 HONOR PTP-AN20 / SDK 3.17.3 / bb 1098×2400（UI 与按钮正常渲染，挂在资源门）：`✗ 流程失败：资源门失败：idle:byteLength-mismatch:685411!=726299 \| idle:attempt-fa…`；`device=DEVICE_FAIL · ctx=NOT_RUN · 20u=NOT_RUN` |
| 已排除（PM 本地实测） | 仓库/分支/Claw 导入目录/CDN 镜像里 idle_v4.json 均 **726299** 字节（无 685411 的旧版本）；纯压缩 **693640**、compact+sort_keys 亦 693640；文件**纯 ASCII**（非 ASCII 0）⇒ 不是 UTF-8/UTF-16 口径错；sim 走同一 loader 全绿 ⇒ 差异只在微信侧读取路径 |
| 结论（如实） | **设备读回的内容确实与仓库不同**（平台改写或读取/落盘截断），**具体机制未知** —— 本轮不猜、不臆改，改为「一次运行带够诊断 + 让流程继续」 |
| 修复①诊断 | 逐资产 `resource.assetIntegrity[]`（+ console 单行 `__CHAR3D_INTEGRITY__`）：`integrityMode` / `observedByteLength` / `observedSha256` / `expectedByteLength` / `expectedSha256` / `byteLengthMatches` / `sha256Matches` / `readSource`（分包 readFile 候选命中·缓存 readFileBytes·downloadFile）/ `headHex64` / `tailHex64` / `structuralOk` / `structuralSummary` / `source` / `loadStatus`；另有 `resource.readSourceTrail[]`（readFile 候选 / writeTempFile / getFileInfo digest / cachePut 逐条轨迹）。**失败路径同样产出**（资源门拒收时证据先固化，早于任何 throw） |
| 修复②让运行继续 | **包内文本资产**（`application/json` + local-subpackage）改走**结构不变量**放行（`integrityMode=structural`）：JSON 可解析 → 生产解析器 `parseCharacter3DClipJson` 全过 → 时长与 `config/character-3d` 清单真值一致（≤0.05s）→ `nFrames`/时长自洽 → 轨道值全有限 → coveredJoints 非空 → rootTrack 帧数自洽；**失败关闭**（任一条不成立即拒收、不覆盖 LKG） |
| 边界（未放宽） | **GLB 恒严格 byteLength+SHA**；**CDN 下载路径恒严格**（`textIntegrityMode` 只对包内文本生效，缺省 = strict ⇒ 既有调用方与线上路径行为不变） |
| 如实记录的代价 | 被改写的文本资产，缓存索引仍按**清单值**登记 ⇒ 下次启动长度校验不符被摘掉重读（该资产热启动退化为「摘除+重读」；GLB 不受影响）——已写进结果 `notes` |
| 防回退 | 用例 +8：结构放行即 `integrityMode=structural` 且 observed≠expected 如实记录 / 同内容 strict 口径被拒（CDN 未放宽）/ **GLB 开 structural 也不放宽（byteLengthMismatches=3）** / 截断内容结构校验不过即失败关闭 / 校验器本身对「时长与清单不符」「NaN 轨道」报错 / 读取来源可追溯 / 结果层 notes / loader 默认口径 strict + 宿主模式分层 |
| 修复后验证 | ① sim 三场景：常规 **34/34**、`--norestore=1` **37/37**、`--rewritejson=1` **41/41**（复刻平台改写 ⇒ 4 个文本资产 `structural/ok=true`，observed 685959/153780/462699/156804 ≠ 清单，GLB 仍 strict 且字节相符，boot ok 且非 DEVICE_FAIL）；② 五门全绿（`test:battle` **748 passed/14 skipped**）；③ 三道产物门绿（`new Function`/`??`/`?.` 全 0）；④ `cli preview` 编译通过（exit 0，`[uploadFile] parseError 0ms`，无 invalid file/SyntaxError） |

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
- 日志分布（**先前"同一日志"的写法不精确，此处按文件逐条列清**）：
  - 每个 CLI `open`/`preview` 会**另起一个会话日志文件**（名字 = 该次会话时间戳），进程的
    `[BackendInitEnv] starting compiler / project ready / BACKEND_READY` 等环境初始化行则记在**长驻主日志**里；
  - 本次 19:38 会话：主日志 `…19-32-41-716.log` 有 `starting compiler / project ready / BACKEND_READY`；
    会话日志 `…19-38-46-246.log` 只有 4 行（文件监听 + 2 条 `routeTo appLaunch timeout`）；
  - 三个文件（主日志 + 本次会话日志 + 更早的 19:05 会话日志）全查：**无** `TypeError`、**无** `m.fn is not a function`、
    **无** `game.json 文件内容错误`、无编译错误条目。
- **未取得（如实登记）**：IDE 控制台/模拟器的运行期输出。`routeTo appLaunch timeout` 只出现在**CLI 会话日志**
  里（19:05 与 19:38 两次 CLI `open` 各 2 条；长驻主日志 0 条；GUI 打开的 probe 会话 0 条）⇒ 判断为 CLI
  临时工程窗口的路由超时，与本次修复无关，但**未完全排除**。
- 后续 `cli preview`（P0-2/P0-4/P0-5 各一次）均 **退出码 0**、IDE 日志 `[uploadFile] parseError 0ms`，
  无 `invalid file` / `SyntaxError` —— 这是「编译」环节的实证；**运行期**仍以 Leo 的真机 run10 为准（B 块）。

---

## C. 已知缺口与不确定项（交付时如实登记）

1. **CDN 未跑（2026-09-15 验）**：真机侧此前无已备案 HTTPS 源 ⇒ 一直走分包/本地路径 adapter（同一条 loader
   状态机）。CDN 验收已排到 **09-15**：demo 已支持**可注入 base URL + 屏上一键切换**（见 README §9），
   上传清单与「域名未配时的预期表现」也写在 README §9；`resource.downloadStats` 会把 cdn 模式的
   下载次数/字节/耗时/命中与失败原因逐条记进结果。
   已执行/未执行分支逐条见 A.1 与结果 JSON 的 `resource.executedBranches/notExecutedBranches`。
2. **第二台异品牌安卓未采**（Leo 借测并行补采，不阻塞本卡；A1 升格仍需 ≥2 台 × 各 3 次冷启动）。
3. **开发者工具导入与编译：CLI 实测已过**（详见 §B1）
   - `cli islogin` = `{"login":true}` ⇒ 未触发「需登录即停」；`cli open --project` → `✔ open`（退出码 0），
     主日志有 `starting compiler / project ready / BACKEND_READY`，三个日志文件均无 `[game.json 文件内容错误]` /
     `TypeError` / 编译错误条目。
   - `cli preview`（P0-2/P0-4/P0-5 各一次）均**退出码 0**、`[uploadFile] parseError 0ms`、无 `invalid file`/`SyntaxError`。
   - **未取得**：IDE 控制台的「编译成功」原文；`routeTo appLaunch timeout`（只在 CLI 会话日志里出现）未完全排除；
     IDE 控制台/模拟器的**运行期**输出没有归档（运行期结论以真机 run10 为准）。
   - 另：`build.mjs --check` 提供不依赖工具链的静态导入门逐项核对（game.js/game.json/分包 game.js/命名/语法/资产 SHA/红线）。
4. **真机未取项**（B 块留白处，不许用别的数据顶替）：六向/全状态**截图**（`screenshot=null`）、
   `wx.canvasToTempFilePath` 可用性、结果回传各通道的可用性、`__CHAR3D_TAP__` 样本；`runs[]` 未逐轮留存
   downloads/cacheHits。
5. **契约待裁（平台改写，P0-4 结案后新增）**：包内 `.json` 会被微信打包/预览管线重跑 `JSON.stringify`
   （证据见 §B.6）⇒「需字节级 SHA 校验的资产不宜以 `.json` 走包内路径」。候选三条已列在 §B.6，
   **本卡不自行改契约**，等主架构裁。
6. sim 的 `animMs/submitMs` 为**时间代理**测值（生产 renderer 无插桩），与 S0 自带插桩不完全同源，只看趋势。
7. 真机 `gpuMs` 是否可得取决于 `EXT_disjoint_timer_query_webgl2`；不可用则为 `null`（**不用 performance.now 冒充**）
   —— 真机 run10 四档均 `null`，sim 侧为 `0`（有 ext、负载极小），两端都不冒充。
8. 本卡不覆盖：敌方 3D、换装/挂点、根 `game.ts` 新战斗宿主迁移（方案 §1.3 明列）。
