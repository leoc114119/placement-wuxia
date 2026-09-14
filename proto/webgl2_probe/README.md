# T31 · 2.5D S0 技术前提实测 probe

> 方案真源：《T31 · 2.5D S0 技术前提实测方案 v1.0》
> （`docs/design/01-基础功能/2.5D-S0技术前提实测方案.md`，提交 `f5ac3c7f`）
> 本目录是**独立微信小游戏工程 + 同源浏览器 harness**，不接入游戏工程、不产生任何游戏侧 diff。

## 0. 它只回答两个数

| 数 | 问题 | 判定 |
|---|---|---|
| **数 1（A1）** | 离屏 canvas 取 `webgl2` → 41 骨 uniform 蒙皮 → `drawImage` 合成到 2D 主画布，在安卓真机上是否可用？ | Device-PASS = A1-01..05 全过 + 零 context lost/GL error + **连续 3 次冷启动全绿** |
| **数 2（A2）** | 现役 48k 模型在 1 / 5 / 10 / 20 单位档的帧率与分相耗时，20 单位能否过 §5.3 阈值？ | 20 单位档自身按 §5.3 机械判定 |

**本 probe 不证明正式 2.5D 架构完成。** 浏览器结果只证明核心代码路径通（方案 §7.1），
不作为微信/安卓能力证据；真机数是唯一正式证据源。

## 1. 文件与职责

```
proto/webgl2_probe/
  project.config.json          独立小游戏工程（compileType=game；打包忽略 browser/tests/README）
  game.json                    分包声明：subpackages=[{name:probe-model}]
  game.js                      ★ 编排：双 canvas / A1 断言集 / A2 采样 / 结果导出（微信与浏览器共用）
  src/
    glb-loader.js              GLB v2 最小子集解析（fail-fast）+ 模型账
    anim-loader.js             重定向动作 json 解析 / 采样 / 41 骨 world·IBM palette
    math.js                    最小 mat4 / 四元数 nlerp / 统计 / 语义版本比较
    skinning-renderer.js       raw WebGL2 蒙皮渲染器（GLSL ES 3.00，零引擎依赖）
    metrics.js                 A2 采样器 + §5.3 判定（纯函数）
    result.js                  §8 结果 schema + 判定口径 + 截图命名
    platform-wx.js             宿主适配（唯一直接触 wx.* 的地方之一）
    platform-browser.js        浏览器 wx shim + 宿主适配（两段式预验证第一段用）
  browser/                     index.html + probe-browser.js（classic script，file:// 与 http:// 都可直开）
  subpackages/probe-model/     hero_48k_20260914.glb + idle_v4.json（美术源文件的**副本**）
    game.js                    ★ 分包**入口占位**（纯注释）：微信要求每个分包根必须有 game.js，
                               本分包只承载资产、无逻辑 —— 详见文件头注释，勿删
  tests/
    probe-browser.mjs          浏览器自动化（node:http 静态服务器 + playwright-core + 系统 Chrome）
    artifacts/                 证据：结果 JSON、console 单行、每档截图、汇总
  README.md
```

**零 runtime 依赖**：不使用 three.js 或任何第三方运行时；`npm install` 未新增任何包
（浏览器 harness 复用仓库既有 devDependency `playwright-core`，与 `proto/battle_demo/shot.mjs` 同一路子）。

**模块形态（为什么不是 ESM）**：`src/*.js` 用 UMD —— 微信端 `require('./src/x.js')`（CommonJS，官方原生支持），
浏览器端由 `browser/index.html` 逐条 `<script>` 装载后挂到 `globalThis.PWProbe`。
理由：ESM 在 `file://` 下被 CORS 拦、且小游戏侧 `project.config.json` 关着 `es6`（不转译）；
classic script 让两端**同一份源码**都能跑，且不需要任何打包步骤。

### 1.1 开发者工具静态校验清单（导入/编译被拦时先看这里）

微信开发者工具在**导入**时就会做静态校验，与代码能否运行无关。本工程逐项自查过：

| # | 校验项 | 本工程现状 |
|---|---|---|
| 1 | 根目录有 `game.js`（主包入口） | ✓ |
| 2 | 根目录有 `game.json`、可解析 | ✓ |
| 3 | **每个 `subpackages[].root` 目录里必须有 `game.js`** | ✓ 已补 `subpackages/probe-model/game.js`（**纯注释占位**，本分包只放资产）；<br>缺失时报错原文：`[game.json 文件内容错误] game.json: 未找到 ["subpackages"][0]["root"] 对应的 /subpackages/probe-model/game.js 文件`（实测 mg 2.02.2608040 / lib 3.16.2） |
| 4 | `subpackages[].name` 非空且唯一、root 为相对路径 | ✓ `probe-model` / `subpackages/probe-model` |
| 5 | 主包 ≤ 4MB、全部主包+分包 ≤ 30MB | ✓ 主包 ≈ 172KB、分包 ≈ 4.66MB、总计 ≈ 4.8MB |
| 6 | `packOptions.ignore` 覆盖不入包目录（否则 `tests/artifacts` 的截图会把主包顶爆 ≠） | ✓ 忽略 `browser/`、`tests/`、`README.md` |
| 7 | `project.config.json`：`compileType=game`、appid、`libVersion` | ✓ 与**已在工具里跑通的主工程** `project.config.json` 逐字段一致，仅 `projectname` 与 `packOptions.ignore` 不同（已 diff 核对） |
| 8 | 入包文件命名（禁中文/空格/非 ASCII）与杂项文件（`.DS_Store` 等） | ✓ 全部 ASCII、无杂项 |
| 9 | 入包 `.js` 语法合法 | ✓ 逐个 `node --check` 通过 |

> 本清单是**本地可核**的部分。工具内的编译与预览仍可能因 appid 权限等环境因素报错；
> 若提示 appid 无权限，把 `project.config.json` 的 `appid` 换成你自己的小游戏 AppID 即可（本 probe 不依赖任何 appid 接口）。
> 官方 `game.json` 字段页当前在线取不到（404），故**未使用的字段一律不写**：`game.json` 只留
> `deviceOrientation` / `showStatusBar` / `subpackages`（原先多写的 `networkTimeout` 已移除）。

## 2. 真机操作步骤（Leo）

### 2.1 导入与预览

1. 打开**微信开发者工具** → `导入项目` → 目录选到本目录（`proto/webgl2_probe`）→ 项目类型 `小游戏`。
   （AppID 若与你的账号不匹配，改成你自己的小游戏 AppID 即可；本 probe 不调用任何需要 appid 的接口。）
2. 工具内 `编译` 应无报错。**直接点 `预览` 生成二维码**。
3. 用**安卓手机**扫码（本卡需至少 2 台安卓、品牌或 GPU 不同；见 §5.2）。

> **分包入口已就位**：`subpackages/probe-model/game.js` 是**必需的占位文件**（纯注释）。
> 微信要求每个分包根目录都有 `game.js`，缺了会在导入时报 `[game.json 文件内容错误] … 未找到
> ["subpackages"][0]["root"] 对应的 /subpackages/probe-model/game.js 文件`。
> 本分包只承载资产（GLB + 动作 JSON），**不要往这个文件里加代码**，也不要删除它。
> 全部静态校验项见 §1.1。

### 2.2 屏上会显示什么

大字面板（每帧刷新）：

```
T31 S0 · WX android · <brand>/<model>
SDK 3.5.7 · dpr 3 · bb 1080x2400        ← 实际 backbuffer 像素尺寸
A1 5/5 · webgl2 OK · UV 4096 · 冷启动 1/3
档位 20 · 实时FPS 41.2 · GLerr 0 · ctxLost 0
nonce 2f0k1a · a2:20                    ← nonce 用于人眼确认合成（见 §2.4）
A2 4/4 档 · 末档 FPS 41.2
20u CAPACITY_PASS · device DEVICE_PASS
```

底部两个按钮：**「复制结果」** 与 **「切正控模式」**。

### 2.3 冷启动 3 次（A1-06 硬要求）

1. 第 1 次运行：A1 自动跑完，面板 `冷启动 1/3`。**此时不会跑 A2**（方案 §5：A2 只在该设备 A1 Device-PASS 后运行）。
2. **完全杀掉微信**（任务切换器上划掉，不是退到后台）→ 重新扫码 → `冷启动 2/3`。
3. 再一次完全杀掉 → 重新扫码 → `冷启动 3/3`；三次全绿 ⇒ Device-PASS 成立，
   **这一次会自动接着跑 A2**（预热 10s + 1/5/10 各 30s + 20 单位 60s，约 3.5 分钟，全程别熄屏/别切走）。
4. 面板出现 `verdict ...` 与 `A2 4/4 档` 即完成。

> 冷启动计数存在本机 storage（键 `pw-probe-cold-runs`），满 3 次后自动开新一组。
> 看不到 `3/3` 就不要下 Device-PASS 结论 —— 证据不足不许写 PASS。

### 2.4 结果回传（三选一或全给）

1. **复制结果**：点「复制结果」→ 结果 JSON 进剪贴板 → 粘贴到「文件传输助手」发回。
2. **结果文件**：同时写入 `wx.env.USER_DATA_PATH/probe-result.json`（devtools 的 Storage 面板可查看）。
3. **截图**：每档结束探针会尝试自动存 PNG（`wx.canvasToTempFilePath`，文件名见 §3.3）；
   若该基础库不提供该 API，则**手动截屏**并按下节命名。

**人眼确认合成（A1-05）**：若主画布回读不可用，A1-05 记 `compositeProof="visualProof"`，
此时必须用截图确认两件事 —— ① 人物**可见且贴合背景**（不是全透明、不是倒过来）② 屏上 `nonce`
与你截图里的一致（nonce 每次运行随机，防"拿旧图冒充本次"）。

### 2.5 若离屏链失败：跑一次主画布正控

点 **「切正控模式」** → 探针写入 storage 并尽力自动重启；若宿主不支持自动重启，
**手动杀掉微信重新扫码**即可（模式已生效）。正控模式只画一个三角形并自报 `mainCanvasWebgl2Control`，
它用来区分：

- 主画布 WebGL2 **PASS**、离屏 FAIL ⇒ **双 canvas A 路线确定失败**（转 B 的最小 spike，方案 §9.1）
- 主画布**也 FAIL** ⇒ 该设备/SDK 无 WebGL2，A、B 都不成立（方案 §4.3）

再点一次同一按钮可切回离屏模式。

## 3. 结果字段（`probe-result.json` / console 单行）

console 会输出**单行** `__WEBGL2_PROBE_RESULT__=<JSON>`（devtools 的 Console 面板可直接复制）。

### 3.1 顶层

| 字段 | 说明 |
|---|---|
| `schemaVersion` | `t31-s0-1.0` |
| `commitSha` | probe 工程基线提交（harness 会从 git 取真实 HEAD 注入；**PM 用分支 tip 交叉核对**） |
| `modelSha256` | 模型 SHA-256（真机走 `getFileInfo(digestAlgorithm:'sha256')`；不可用则回落到已核常量，`env.modelSha256Source` 标注来源） |
| `device` | brand/model/system/platform/SDKVersion/benchmarkLevel/pixelRatio/屏幕与窗口尺寸 + GL VERSION/VENDOR/RENDERER + **未掩码** vendor/renderer + 限制值 + `deviceHash` |
| `canvas` | 实际 backbuffer 尺寸、`requestedBackbuffer`、`renderScale:1`、`dprCappedAt:3`、请求与实际 context attributes |
| `a1` | §4.2 断言集 + 各子项 detail + `coldRunIndex/coldRunsGreen/coldRunsTotal` + 资产装载各段耗时 |
| `a2[]` | 每档记录（§5.2 全指标 + 次数 + 可见性 + 覆盖率） |
| `coldRuns` | 本机冷启动历史（含每次的断言通过数与时间戳） |
| `verdict` | `device` / `architecture` / `capacity20`（+ 机械判定 `capacity20Engine`、`capacity20Reasons`） |
| `notes` | 判定口径与升级路径的原文提示 |
| `env` | 环境与证据：`browser`、`a2Profile`、`a2Trigger`、`screenshots`、`asset`（各段耗时）、模型账基线 |

### 3.2 verdict 语义（谁签字）

- `verdict.device ∈ {DEVICE_PASS, DEVICE_FAIL, UNSUPPORTED, BROWSER_SHIM_PASS/FAIL, NOT_APPLICABLE}`
  —— 单设备事实。
- `verdict.architecture` —— **单机最多给 `PARTIAL_PASS`**；Architecture-PASS 需「≥2 台异品牌/异 renderer 安卓 ×
  各 3 次冷启动」，由**主架构签字**，本 probe 不越级判。
- `verdict.capacity20` —— 真机 spec 档按 §5.3 自动生成：
  `CAPACITY_PASS` / `A_COMPATIBLE_CAPACITY_FAIL`。浏览器运行会写成 `BROWSER_SHIM_*`（并附
  `capacity20Engine` 的机械判定），明确标注**非容量结论**。
- `SDKVersion < 2.24.0` ⇒ `UNSUPPORTED`（**整数分段语义版本比较**，禁字符串字典序），不参与 A 路线 PASS。

### 3.3 截图命名（方案 §8）

`probe_<deviceHash>_<SDKVersion|nosdk>_<tag>_run<冷启动序号>.png`，tag ∈
`a1-03-triangle` / `a1-04-model` / `a1-05-composite` / `u1` / `u5` / `u10` / `u20` / `maincontrol`。

## 4. 指标口径（禁改）

- `frameWallMs`：完整 rAF 间隔，**FPS 的唯一来源**（`fps = 1000/frameWallMs`）。
- P50/P95/P99：帧时**最近秩**百分位（升序取 `ceil(p·n)-1`）。
- `onePercentLowFps`：最差 `ceil(n·1%)` 帧的**平均帧时**取倒数。
- `over33msRatio` / `over50msRatio`：`frameWallMs > 33 / > 50` 的帧占比。
- 分相：`jsAnimMs`（动作采样 + 41 骨 world/skin 矩阵）、`glSubmitMs`（uniform 上传 + drawElements 的 CPU 提交）、
  `compositeCpuMs`（`drawImage` 调用）、`gpuMs`（**仅** `EXT_disjoint_timer_query_webgl2` 真采样；
  不可用 = `null`，**严禁**用 `performance.now` 冒充）；同时给三个分相的 `*Mean` 值。
- `timerResolutionMs`：宿主 `performance.now` 的分辨率。**分相中位数整片为 0 时先看这个字段**
  （Chrome 未开跨源隔离时被量化到 100µs），均值可把量化误差平均掉。
- A2 采样：每档**预热 10s**（不记录）、1/5/10 各 30s、20 单位 60s，且每档 ≥1800 帧（两者都要满足）。
- **`readPixels` 绝不进 A2 循环**（会强制同步污染帧率）；A1 的 readPixels 只在 A1 阶段做。
- GL error 在 A2 期间以 **1Hz** 采样（每帧 `getError` 会强制同步）；`context lost` 另由事件与
  `isContextLost()` 跟踪。为什么文字每帧都画：屏上指标属方案 §8 要求的输出，不做"每 N 帧才更新"的取巧。

## 5. 运行方式

### 5.1 浏览器 + wx shim（自动化，含证据落库）

```bash
node proto/webgl2_probe/tests/probe-browser.mjs --runs=3 --profile=spec
# 可选：--a2=auto|run|skip   --maincontrol=0   --vw=390 --vh=844 --dsf=2
```

- 起零依赖静态服务器（`node:http`）→ 系统 Chrome（headless，复用 `playwright-core`）→
  连续 3 次加载 = 冷启动 3 次的等价模拟（localStorage 在同一个 context 内跨加载保留，与真机"杀进程重开"等价）。
- 第 1/2 次不跑 A2（触发口径 `spec-device-pass`），第 3 次自动跑；`--a2=run` 可强制（记 `a2Trigger=forced`）。
- 收尾追加一次 `mode=maincontrol` 的正控模式核对。
- 产物：`tests/artifacts/`（`probe-result-run*.json`、`console-result-run*.json`、每档 PNG、
  `probe-browser-summary.json`、`browser-run*.png`）。退出码：全绿 0。

```bash
# 本地手动看（同一份 harness 的服务器逻辑可省，直接起个静态服务器即可）
python3 -m http.server 8231 --directory .   # 然后开 http://127.0.0.1:8231/proto/webgl2_probe/browser/
```

### 5.2 真机

见 §2。设备矩阵要求：**≥2 台安卓、品牌或未掩码 GPU renderer 不同、至少一台为当前可取得的较低
`benchmarkLevel` 档**，每台各 3 次冷启动全绿（方案 §4.4）。只有一台通过 ⇒ 记 `PARTIAL_PASS`。

## 6. 资产账与副本纪律

| 项 | 值 |
|---|---|
| 模型 | `subpackages/probe-model/hero_48k_20260914.glb` |
| 字节数 | `4,040,728`（真机结果里 `env.modelByteLength` 应与之一致） |
| SHA-256 | `ff9202b48470c92ccdad0333108e77e193a4135f873ce68e7e3498e979f816f0`（与美术源文件逐字节一致） |
| 三角形 | `48,419`（`triangleCount`，不一致直接 FAIL） |
| 骨数 | `41`（`jointCount`，不一致直接 FAIL） |
| 其余模型账 | `vertexCount=29,281` · `primitiveCount=1` · `textureCount=3`（4096² JPEG） · `bufferBytes=3,974,376` |
| 动作 | `idle_v4.json`：`fps=30` · `nFrames=200` · `duration≈6.667s` · `rootMode='y'` · 40 条骨轨道 + 1 条 `rootTrack`（`Root` 位移增量） |

- 模型与动作在 probe 内是**副本**；源文件由美术侧继续维护，本目录不反向修改任何美术资产。
- 分包不剥贴图（4.04MB 原样测，变量唯一）；加载/读取/解析/纹理解码/首传 GPU **分别计时**，
  `env.asset.stages` 记录，**不并入**稳态 A2 FPS（方案 §6）。
- 贴图 UV 朝向：glTF 的 UV 原点在图片左上 ⇒ 上传时 **`UNPACK_FLIP_Y_WEBGL = false`**
  （`skinning-renderer.js` 有注释与实测对照结论；翻转会把人物碎成色块）。

## 7. S0 的已知简化（不是缺陷，是范围）

- 光照只有 baseColor × 单向 Lambert（无法线贴图/MR/环境光遮蔽）——S0 只验通路与性能，观感不在本卡范围。
- 20 个单位是**同一 mesh 的 20 次 draw**（不是实例化）；每单位 1 次整块 palette 上传 + 1 次 `drawElements`。
- 单位按网格摆放（cols=ceil(√n)），**不做跨单位深度排序**；摆放的 z 不乘 scale（见 `math.js` 注释）。
- 视锥裁剪与单位休眠关闭（方案 §5：确保每帧 draw call 等于档位数）。
- UBO / 骨骼纹理 / 实例化**不进 S0 基线**。

## 8. 施工期缺陷（已修，附防线）

| # | 现象 | 根因 | 防线 |
|---|---|---|---|
| 1 | 模型渲染成"丝带"：包围盒对、填充率仅 ~2% | `placement` 把 z 也乘了像素级 scale（±150），远超正交裁剪体 ±1 ⇒ 三角形被近/远平面裁掉，只剩中间一薄片 | `orthoPixel(…, zHalf)` + z 不缩放；新增**像素覆盖率检查**（`pixelCoverage.fillRatio`，远低于 ~0.2 判 FAIL）与**逐单位像素可见性**（解析式包围盒在塌缩时照样报"全可见"，只有像素计数能抓） |
| 2 | 人物贴图碎成色块 | 贴图上传误开 `UNPACK_FLIP_Y_WEBGL`（glTF 本就不需要翻转） | 关闭翻转 + `skinning-renderer.js` 注释写明实测对照 |
| 3 | `getUniform` 读回全 0 | WebGL 的 `getUniform` 只接受 `WebGLUniformLocation`；且 ANGLE 需要先 `useProgram` | 自证断言 `a1.boneUploadCheck`（上传带标记的 41 个矩阵再逐点回读） |
| 4 | A2 首帧渲染全透明（覆盖率 0） | `createPose` 出来的 palette 是**全零**，未采样直接画会把网格塌到原点 | 覆盖率检查前先采样；A2 主循环本就是"先采样后画" |
| 5 | 阈值/采样量口径 | `isDone` 曾写死 1800 帧，忽略 `requiredMinSamples` | 改为读 `requiredMinSamples`；`a2Profile`/`specProfile` 一并写入结果，短采样档的结论会被降级标注 |
| 6 | **微信开发者工具导入被拦**：`[game.json 文件内容错误] … 未找到 ["subpackages"][0]["root"] 对应的 /subpackages/probe-model/game.js 文件` | 方案与首版实现都漏了"每个分包根目录必须有 `game.js` 入口"这条微信硬要求（本分包只放资产、没有逻辑，所以当时没建这个文件） | 补 `subpackages/probe-model/game.js`（**纯注释占位**，文件头写明缘由与"勿删/勿加代码"）；README §1.1 建静态校验清单，§2.1 与文件树同步标注 |
| 7 | 未使用的 `game.json` 字段可能引发工具告警 | 首版多写了 `networkTimeout`（本 probe 不发 `wx.request`，纯冗余） | 移除；`game.json` 只留确定支持的 `deviceOrientation`/`showStatusBar`/`subpackages`（官方字段页在线 404，无法核的字段不写） |

## 9. 本仓库当前的浏览器层证据（最近一次全跑）

命令：`node proto/webgl2_probe/tests/probe-browser.mjs --runs=3 --profile=spec` → **69/69 PASS**（约 3.5 分钟）。
环境：headless Chrome 153 · ANGLE Metal（Apple M4）· viewport 390×844 @2x ⇒ backbuffer **780×1688**（`dprCappedAt:3`，未降 renderScale）。

| 档 | fpsMedian | 1% low | P95 | P99 | over50ms | jsAnimMs(mean) | glSubmitMs(mean) | compositeCpuMs(mean) | gpuMs | draw/palette 每帧 | 采样帧数 | 像素覆盖率 | 可见单位 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1u | 59.88 | 56.30 | 17.5 | 17.7 | 0 | 0.059 | 0.044 | 0.214 | 1.07 | 1 / 1 | 1801 | 0.644 | 1/1 |
| 5u | 59.88 | 57.14 | 16.8 | 17.1 | 0 | 0.123 | 0.053 | 0.189 | 2.01 | 5 / 5 | 1801 | 0.647 | 5/5 |
| 10u | 59.88 | 56.53 | 17.2 | 17.6 | 0 | 0.319 | 0.071 | 0.308 | 3.21 | 10 / 10 | 1801 | 0.650 | 10/10 |
| 20u | 59.88 | 56.40 | 17.5 | 17.7 | 0 | 0.689 | 0.103 | 0.428 | 5.38 | 20 / 20 | 3601 | 0.652 | 20/20 |

读法（**别把它当容量结论**）：
- 浏览器里 rAF 被 vsync 锁在 ~60fps ⇒ fps/P95 无法区分负载；**真容量要等真机 spec 档数字**。
- 可参考的是分相与 GPU 时间随单位数的线性增长（20u ≈ 20 × jsAnim, ≈ 5 × gpu vs 1u），以及每次 draw 的调用数恒等于单位数。
- `timerResolutionMs = 0.1`：宿主 `performance.now` 量化到 100µs ⇒ **分相中位数会整片为 0**，看 `*Mean` 列。
- 第 1/2 次冷启动 `verdict.device = BROWSER_SHIM_A1_PASS_COLD_INCOMPLETE`（A1 全过、冷启动系列未满 3 次，**不是失败**）；
  第 3 次才是 `BROWSER_SHIM_PASS` 并自动跑 A2。`capacity20` 在浏览器里恒加 `BROWSER_SHIM_` 前缀。

证据文件（`tests/artifacts/`，默认只入库最后一次冷启动的截图以控体积，`--shots=all` 可全存）：

```
probe-result-run{1,2,3}.json      三次冷启动的结果 JSON（run3 含 A2 四档）
console-result-run{1,2,3}.json    取自 console 的 __WEBGL2_PROBE_RESULT__ 单行（证明单行导出可用）
probe-result-maincontrol.json     主画布正控模式结果
probe-browser-summary.json        69 项断言逐条 + A2 汇总 + renderer 信息
probe_<hash>_nosdk_{a1-03-triangle,a1-04-model,a1-05-composite,u1,u5,u10,u20}_run3.png
browser-run3.png / browser-maincontrol.png   页面级截图
```

## 10. 命令速查

```bash
# 语法自检（零依赖）
for f in proto/webgl2_probe/game.js proto/webgl2_probe/src/*.js proto/webgl2_probe/browser/probe-browser.js; do node --check "$f"; done

# 浏览器层全量证据（约 3.5 分钟：3 次冷启动 + A2 spec 档 + 正控模式）
node proto/webgl2_probe/tests/probe-browser.mjs --runs=3 --profile=spec

# 快速冒烟（1 次加载 + 强制 A2 短采样，约 40 秒）
node proto/webgl2_probe/tests/probe-browser.mjs --runs=1 --a2=run --profile=browser-short

# 全存截图 / 换视口
node proto/webgl2_probe/tests/probe-browser.mjs --runs=3 --profile=spec --shots=all --vw=390 --vh=844 --dsf=3
```

## 11. 验收分工（方案 §10.2）

| 角色 | 负责 |
|---|---|
| frontend 栈 | 实现 probe、跑浏览器/开发者工具、产出可扫码版本与结果导出 |
| Leo | 提供/扫码安卓真机，确认屏上合成可见；不负责算技术 verdict |
| 研发 PM | 核设备信息、原始 JSON、截图、重复运行与文件边界 |
| 主架构 | 依固定阈值签 A1 Architecture-PASS/FAIL 与 A2 Capacity-PASS/FAIL |
