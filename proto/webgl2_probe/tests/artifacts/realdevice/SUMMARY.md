# T31 · 2.5D S0 真机实测汇总表（方案 §10.1）

> 归集人：frontend 栈（ZCode）｜归集日期：2026-09-14
> 判定签字：主架构 seq=410（A1_device=DEVICE_PASS / A2=CAPACITY_PASS / A1 总判=PARTIAL_PASS）
> 本表只归集**已经归档的事实**；缺口如实留白，不用推断补齐。

## 1. 结论（与 arch 签字一致）

| 项 | 结论 | 依据 |
|---|---|---|
| A1 单设备事实（HONOR） | **DEVICE_PASS** | A1-01..05 全过 + 零 context lost / GL error + 连续 3 次冷启动全绿（方案 §4.2） |
| A2 容量（HONOR，20 单位） | **CAPACITY_PASS** | 方案 §5.3 六条阈值逐条满足（见 §4） |
| A1 总判（Architecture） | **PARTIAL_PASS** | 只有一台安卓满足"3 次冷启动全绿"；方案 §4.4 要求 ≥2 台异品牌/异 renderer 安卓，故**不得写 A 方案成立** |

## 2. 设备矩阵

| # | 设备 | 系统 | 基础库 | benchmarkLevel | dpr | 逻辑分辨率 | 背衬分辨率 | deviceHash | 有效上下文 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | HONOR PTP-AN20（安卓） | Android 16 | 3.17.3 | 46 | 3.5 | 366×800 | **1098×2400**（dpr 上限 3） | `xhdq2m` | antialias=**false**（请求 true 被宿主协商为 false）、alpha=true、depth=true、premultipliedAlpha=true、preserveDrawingBuffer=true |
| 2 | iOS 设备（型号待 Leo 补） | iOS（待补） | 3.16.2 | 待补 | 待补 | 待补 | 待补 | 待补 | 待补 |

GPU/驱动串：HONOR 上 `VERSION / VENDOR / RENDERER / SHADING_LANGUAGE_VERSION` 均返回同一串
`WebGL 2.0(OpenGL ES 3.2)`（该引擎未按 WebGL 规范分字段返回，属宿主实现差异，如实记录）。
设备 2 的 GPU 串待补（其原始 JSON 缺，见 §6）。

## 3. A1（冷启动 3 次）

| # | 设备 | 冷启动 1 | 冷启动 2 | 冷启动 3 | 合成证明 | WebGL2 | GL error / ctx lost | 结论 |
|---|---|---|---|---|---|---|---|---|
| 1 | HONOR PTP-AN20 | A1 全过 | A1 全过 | A1 全过（`coldRunsGreen=3/3`） | `compositeProof=readback`（程序化核 RGBA，非 visualProof 假写） | OK（`MAX_VERTEX_UNIFORM_VECTORS` 宿主未返回 → 记 unknown，硬判据转为 41 骨 shader compile/link 成功） | 0 / 0 | **Device-PASS** |
| 2 | iOS 设备 | 有截图（文件名 `device2_sdk3.16.2_run2_oldlabel_DEVICE_FAIL`） | 有截图 | 有截图（`device2_sdk3.16.2_run3_DEVICE_PASS_CAPACITY_PASS_52.08fps`） | 待补（截图可见合成正常） | 待补 | 待补 | **DEVICE_PASS（仅凭屏上标签，原始 JSON 缺 ⇒ 待补证）** |

补充事实（HONOR）：

- `a1.boneUploadCheck`：`located=true` 但 `getUniform` 读回 **null** ⇒ 该引擎不支持回读自证；
  按 §2.6 口径归 `unsupported`（**不是失败**）。归档件生成时分类器尚未含此分支，
  其 `a1.errors` 里留有那一条；**分类器已在 `73f637d1` 之后的收尾补丁修正**，重跑即为空。
- WebGL1 诊断：未执行（webgl2 可用 ⇒ 按方案 §4.3 不需要）。
- 资产装载各段（方案 §6 要求分列）：分包 28ms · readFile 6ms · GLB parse 66ms ·
  动作 parse 20ms · 纹理解码 677ms · 首传 GPU 416ms（其中贴图 399ms、网格 14ms）。
  均为**一次性成本**，未计入稳态 A2。

## 4. A2（1 / 5 / 10 / 20 单位；预热 10s、1/5/10 各 30s、20 采 60s 且每档 ≥1800 帧）

设备 1（HONOR PTP-AN20，背衬 1098×2400）：

| 档 | fpsMedian | 1% low | frameMs P95 | frameMs P99 | over33ms | over50ms | 采样数 | 时长 | draw/palette 每帧 | 可见单位 | 像素覆盖率 | gpuMs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1u | 62.5 | 24.93 | 17 | 39 | 1.664% | 0 | 1803 | 30.01s | 1 / 1 | 1/1 | 0.642 | null（宿主无 `EXT_disjoint_timer_query_webgl2`） |
| 5u | 62.5 | 24.30 | 17 | 39 | 1.608% | 0.055% | 1803 | 30.01s | 5 / 5 | 5/5 | 0.642 | null |
| 10u | 62.5 | 24.36 | 17 | 39 | 1.608% | 0.055% | 1803 | 30.01s | 10 / 10 | 10/10 | 0.643 | null |
| **20u** | **62.5** | **24.62** | **17** | **39** | 1.665% | **0.028%** | **3604** | **60.01s** | **20 / 20** | **20/20** | **0.643** | null |

分相中位数（`jsAnimMs / glSubmitMs / compositeCpuMs`）：1u `0/0/1` · 5u `0/0/1` · 10u `0/0/1` · 20u `1/0/1`（ms）。
**读法**：该宿主 `performance.now` 分辨率粗（分相中位数整片为 0），故同表另有 mean 值在 JSON 里；A2 的硬指标是 FPS/帧时，分相仅作定性参考。

**20 单位逐条对照方案 §5.3（六条全过 ⇒ CAPACITY_PASS）**：

| # | 阈值 | 实测 | 判定 |
|---|---|---|---|
| 1 | `fpsMedian ≥ 30` | 62.5 | PASS |
| 2 | `frameMsP95 ≤ 33.3ms` | 17 | PASS |
| 3 | `frameMsP99 ≤ 50ms` | 39 | PASS |
| 4 | `over50msRatio ≤ 1%` | 0.028% | PASS |
| 5 | `contextLostCount = 0`、`glErrorCount = 0` | 0 / 0 | PASS |
| 6 | `drawCallsPerFrame = 20`、`skinPalettesPerFrame = 20`、屏上 20 个角色全部可见 | 20 / 20、像素级 20/20 可见（覆盖率 0.643） | PASS |

**观察项（不影响判定，供正式方案参考）**：20u 档 `over33msRatio≈1.67%`、`P99=39ms`、`1% low≈24.6fps`
—— 即存在**间歇长帧**（方案 §5.3 对 over33 与 1% low 未设阈值，故不构成阻塞）；正式方案可评估这 39ms 长帧的来源
（候选：宿主合成/GC/纹理采样）。

设备 2（iOS，SDK 3.16.2）：屏上标签记 `CAPACITY_PASS`、末档 **52.08 FPS**；四档原始数据待补（见 §6）。

## 5. verdict（归档件原值）

| # | 设备 | `verdict.device` | `verdict.architecture` | `verdict.capacity20` | `capacity20Engine` |
|---|---|---|---|---|---|
| 1 | HONOR PTP-AN20 | `DEVICE_PASS` | `PARTIAL_PASS` | `CAPACITY_PASS` | `CAPACITY_PASS` |
| 2 | iOS 设备 | `DEVICE_PASS`（屏上标签） | 待主架构按补证材料判 | `CAPACITY_PASS`（屏上标签） | 待补 |

## 6. 证据文件清单

设备 1（HONOR，**含完整原始 JSON**）：

| 文件 | 说明 |
|---|---|
| `probe_xhdq2m_honor_ptpan20_full_a1a2.json` | **完整 A1+A2 原始 JSON**；SHA-256 = `52699ed53e330705df59f0cb6bc015d82d34b0e59d2c2653db3843bb329e9d9d`（= arch 验证件同一 SHA） |
| `android_honor_ptpan20_run1_cold1of3.jpg` | 冷启动 1/3 屏上画面 |
| `android_honor_ptpan20_run2_cold2of3.jpg` | 冷启动 2/3 屏上画面 |
| `android_honor_ptpan20_run3_cold3of3_DEVICE_PASS_CAPACITY_PASS_62.5fps.jpg` | 冷启动 3/3 + A2 完成（含 DEVICE_PASS / CAPACITY_PASS / 62.5fps 标签） |

设备 2（iOS，**只有屏幕截图**）：

| 文件 | 说明 |
|---|---|
| `device2_sdk3.16.2_run2_oldlabel_DEVICE_FAIL.png` | 冷启动 2/3；屏上 `DEVICE_FAIL` 是**补丁二之前**的旧标签（当时把"冷启动未满"误报为失败），非真实失败 |
| `device2_sdk3.16.2_run3_DEVICE_PASS_CAPACITY_PASS_52.08fps.png` | 冷启动 3/3 + A2 完成（DEVICE_PASS / CAPACITY_PASS / 52.08fps） |

浏览器层交叉证据（不构成设备证据，仅供代码路径核对）：同目录上级 `tests/artifacts/` 的
`probe-result-run{1,2,3}.json`、`browser-*.png`、`probe-browser-summary.json`（97 项断言）。

## 7. 已知缺口（如实留白，不用推断补齐）

1. **第二台"异品牌/异 renderer 安卓"缺** ⇒ 方案 §4.4 的 Architecture-PASS 条件未满足，故 A1 总判只能 `PARTIAL_PASS`。
2. **iPhone 的原始 JSON 缺**（只有截图）⇒ 设备 2 的 A1 细节、A2 四档数字、设备矩阵字段（型号/dpr/benchmarkLevel/GPU 串）待 Leo 补跑一次并回传结果（任选 §2.4 的四种回收方式之一）。
3. **`antialias` 实测为 false**（调用侧请求 true、宿主协商为 false）⇒ 见 §8，正式方案须按实机有效上下文设计边缘锯齿对策。
4. HONOR 上 `getUniform` 回读不可用 ⇒ `boneUploadCheck` 只能记 `unsupported`；"41 骨一次上传确实落地"在该设备上由 **A1-03/04/05 像素三件套**间接背书（方案 §4.2 的硬判据）。
5. HONOR 上无 `EXT_disjoint_timer_query_webgl2` ⇒ `gpuMs` 全为 `null`（禁用 `performance.now` 冒充，方案 §5.2）。
6. 归档件 `probe_xhdq2m_...json` 的 `a1.errors` 含一条 `palette 上传自证失败`（分类器旧版把"读回 null"当失败）；**分类器已修**（`73f637d1` 之后的收尾补丁 + 回归门），重跑即为空，**不影响任何判定**（A1-01..05 与 verdict 与 arch 签字一致）。

## 8. 给正式方案的输入（arch 已记录，此处留档）

- **实机 `contextAttributes.antialias = false`**：调用侧请求 `antialias:true`，宿主协商为 `false`
  ⇒ 正式方案不能假设有 MSAA，边缘锯齿须另有对策（后处理/描边/超采样等）。
- 宿主对 `requestedContextAttributes` 的回显不可尽信：HONOR 归档件里请求侧只回了
  `{alpha, premultipliedAlpha, preserveDrawingBuffer, __webgl2__}`（没有 `antialias` 字段，另加了 `__webgl2__`）
  ⇒ **只认 `canvas.contextAttributes` 的实测值**。
- 该引擎 GL 信息接口未按规范分字段返回（四个串同值）；设备矩阵的"品牌/GPU 不同"判据在有该引擎的设备上
  需退化为 **brand + model** 比较。
