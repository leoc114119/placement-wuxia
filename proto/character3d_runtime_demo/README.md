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
6. 红线：宿主源码与 bundle **不含** `proto/webgl2_probe` 引用，bundle **不含** `systems/battle-core|battle-session`。

## 8. 已知缺口与不确定项（交付时如实登记）

1. **CDN 未跑**（见 §5）——需要已备案域名才能补；不影响本卡其它判定。
2. **第二台异品牌安卓未采**（并行补采，不阻塞本卡；A1 升格仍需 ≥2 台 × 各 3 次冷启动）。
3. **真机证据待 Leo 扫码回填**：本目录交付时点，`evidence/` 里只有 **浏览器 sim** 产物（`SIM_*`）与
   `SUMMARY.md` 的待回填表格；真机 JSON/截图需扫码运行后回传（PM 收齐后归档）。
4. `wx.canvasToTempFilePath` 在部分基础库不可用 ⇒ 截图需手动（屏上判定行 + 分页页脚可自证同一轮）。
5. 分相 `animMs/submitMs` 是**时间代理**测的（§4.2），与 S0 自带插桩不完全同源，只用于横向看趋势。
