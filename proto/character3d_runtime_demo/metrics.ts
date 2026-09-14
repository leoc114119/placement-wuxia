// T31-FE-C · proto/character3d_runtime_demo/metrics.ts —— A2 采样器与 §5.3 判定（**口径口径逐字沿用 S0**）
//
// 为什么要在本卡再写一份：S0 的 metrics 在 `proto/webgl2_probe/src/metrics.js`，而本卡**禁止**
// import probe（方案 §1.2「T31 probe 最新已验实现作为抽取参考，不允许生产代码直接 import
// proto/webgl2_probe/」）。本文件是 S0 口径的**类型化收编**，公式逐条同源（README §4 有同一份表）：
//
//   frameWallMs : 完整 rAF 间隔（真实总成本，FPS 的唯一来源）  fps = 1000 / frameWallMs
//   P50/P95/P99 : 帧时**最近秩**百分位（升序后取 ceil(p·n)-1，再夹到 [0, n-1]）
//   1% low FPS  : 最差 ceil(n·1%) 帧的**平均帧时**取倒数
//   over33/50   : frameWallMs > 33 / > 50 的帧占比
//   gpuMs       : 仅 EXT_disjoint_timer_query_webgl2 真采样；不可用 = null
//                 （**严禁**用 performance.now 冒充 GPU 时间）
//
// 与 S0 的**唯一**差异（如实登记，不藏）：S0 的 renderer 自带 jsAnim/glSubmit 两相插桩；
//   生产 renderer 无插桩（改它就是改生产代码），故本卡改由**时间代理**（host.ts 的
//   createTimingRenderer）在 pass 外测：passMs = pass.render 总时长、animMs = passMs − ΣsubmitMs、
//   submitMs = Σ drawUnit 时长。口径见 README §4.2，字段名保持 *Ms 便于与 S0 对照。
//
// 纯函数、无宿主依赖 —— 可直接被 vitest 单测（tests/character3d-runtime-demo.test.ts）。

/** §5.3 六条阈值的字面值（改了就是改口径）。 */
export const CAPACITY_THRESHOLDS = {
  fpsMedianMin: 30,
  frameMsP95Max: 33.3,
  frameMsP99Max: 50,
  over50RatioMax: 0.01,
  requiredDrawCalls: 20,
  requiredPalettes: 20,
} as const;

/** 每档最少采样帧数（方案 §5.2「每档 ≥1800 帧」，与秒数条件**都要**满足）。 */
export const REQUIRED_MIN_SAMPLES = 1800;

export interface FrameSample {
  /** 完整 rAF 间隔（毫秒）—— FPS 唯一来源 */
  wallMs: number;
  /** pass.render() 总时长（含动作采样、摆放矩阵、GL 提交、FXAA 收尾） */
  passMs: number;
  /** passMs − ΣsubmitMs（动作采样 + 摆放矩阵；钟分辨率不够时会整片为 0，看 *Mean） */
  animMs: number;
  /** Σ renderer.drawUnit()（uniform 上传 + drawElements 的 CPU 提交） */
  submitMs: number;
  /** 2D 世界层 drawImage(人物层) 的调用时长 */
  compositeMs: number;
  /** GPU 时间：仅 EXT_disjoint_timer_query_webgl2 真采样，否则 null（禁 performance.now 冒充） */
  gpuMs: number | null;
}

export interface CapacityRecord {
  unitCount: number;
  durationSec: number;
  sampleCount: number;
  fpsMean: number;
  fpsMedian: number;
  onePercentLowFps: number;
  frameMsMedian: number;
  frameMsP95: number;
  frameMsP99: number;
  over33msRatio: number;
  over50msRatio: number;
  passMsMedian: number;
  passMsMean: number;
  animMsMean: number;
  submitMsMean: number;
  compositeCpuMsMean: number;
  gpuMs: number | null;
  gpuMsSource: string;
  contextLostCount: number;
  glErrorCount: number;
  drawCallsPerFrame: number;
  skinPalettesPerFrame: number;
  allUnitsOnScreen: boolean;
  /** 可见性判据的实测注记（fillRatio/背衬/逐单位像素数；出问题时的远程诊断口） */
  visibilityNote: string;
  /** false = 非方案口径采样（短档/浏览器），判定会被降级标注（不得作为容量结论） */
  specProfile: boolean;
  a2Profile: string;
  truncated: boolean;
  truncateReason: string | null;
}

export interface CapacityVerdict {
  pass: boolean;
  reasons: string[];
  verdict: string;
}

export interface Sampler {
  readonly unitCount: number;
  readonly requiredSec: number;
  readonly requiredMinSamples: number;
  /** 是否已采足（帧数 ≥ requiredMinSamples **且** 秒数 ≥ requiredSec） */
  isDone(): boolean;
  /** 预热期结束、正式计时开始 */
  markFrameTime(tAbsMs: number): void;
  push(sample: FrameSample): void;
  readonly sampleCount: number;
  readonly elapsedSec: number;
  rollingFps(): number;
  /** 防呆截断（超时/异常）：如实登记，判定会把它当不通过理由 —— 沿用 S0 的 truncated 语义 */
  markTruncated(reason: string): void;
  summarize(extra: Partial<CapacityRecord>): CapacityRecord;
}

// ===== 统计原语（口径与 S0 逐字一致）=====

export function sortAsc(values: readonly number[]): number[] {
  return values.slice().sort((a, b) => a - b);
}

/** 最近秩百分位：升序取 ceil(p·n)-1（p=0.5 时即下中位）。 */
export function percentile(sortedAsc: readonly number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  return sortedAsc[idx];
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** 最差 ceil(n·1%) 帧的平均帧时取倒数（1% low FPS）。 */
export function onePercentLowFps(sortedAsc: readonly number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const k = Math.max(1, Math.ceil(n * 0.01));
  const worst = sortedAsc.slice(n - k);
  const avg = mean(worst);
  return avg > 0 ? 1000 / avg : 0;
}

export function ratioOver(sortedAsc: readonly number[], thresholdMs: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  let over = 0;
  for (const v of sortedAsc) if (v > thresholdMs) over++;
  return over / n;
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function createSampler(unitCount: number, durationSec: number, requiredMinSamples = REQUIRED_MIN_SAMPLES): Sampler {
  const frames: FrameSample[] = [];
  let startedAt: number | null = null;
  let lastFrameAt: number | null = null;
  const rolling: number[] = [];
  let truncated = false;
  let truncateReason: string | null = null;

  return {
    unitCount,
    requiredSec: durationSec,
    requiredMinSamples,
    isDone(): boolean {
      return frames.length >= requiredMinSamples && this.elapsedSec >= durationSec;
    },
    markFrameTime(tAbsMs: number): void {
      if (startedAt === null) startedAt = tAbsMs;
      lastFrameAt = tAbsMs;
    },
    push(sample: FrameSample): void {
      frames.push(sample);
      rolling.push(sample.wallMs > 0 ? 1000 / sample.wallMs : 0);
      if (rolling.length > 30) rolling.shift();
    },
    get sampleCount(): number {
      return frames.length;
    },
    get elapsedSec(): number {
      return startedAt === null || lastFrameAt === null ? 0 : (lastFrameAt - startedAt) / 1000;
    },
    rollingFps(): number {
      return rolling.length ? mean(rolling) : 0;
    },
    markTruncated(reason: string): void {
      truncated = true;
      truncateReason = reason;
    },
    summarize(extra: Partial<CapacityRecord>): CapacityRecord {
      const wall = sortAsc(frames.map((f) => f.wallMs));
      const fps = sortAsc(frames.map((f) => (f.wallMs > 0 ? 1000 / f.wallMs : 0)));
      const gpus = frames.map((f) => f.gpuMs).filter((v): v is number => v !== null && v !== undefined);
      const rec: CapacityRecord = {
        unitCount,
        durationSec: round(this.elapsedSec, 3),
        sampleCount: frames.length,
        fpsMean: round(mean(fps), 2),
        fpsMedian: round(percentile(fps, 0.5), 2),
        onePercentLowFps: round(onePercentLowFps(wall), 2),
        frameMsMedian: round(percentile(wall, 0.5), 3),
        frameMsP95: round(percentile(wall, 0.95), 3),
        frameMsP99: round(percentile(wall, 0.99), 3),
        over33msRatio: round(ratioOver(wall, 33), 5),
        over50msRatio: round(ratioOver(wall, 50), 5),
        passMsMedian: round(percentile(sortAsc(frames.map((f) => f.passMs)), 0.5), 4),
        passMsMean: round(mean(frames.map((f) => f.passMs)), 4),
        animMsMean: round(mean(frames.map((f) => f.animMs)), 4),
        submitMsMean: round(mean(frames.map((f) => f.submitMs)), 4),
        compositeCpuMsMean: round(mean(frames.map((f) => f.compositeMs)), 4),
        gpuMs: gpus.length ? round(percentile(sortAsc(gpus), 0.5), 4) : null,
        gpuMsSource: gpus.length ? 'EXT_disjoint_timer_query_webgl2' : 'unavailable',
        contextLostCount: 0,
        glErrorCount: 0,
        drawCallsPerFrame: 0,
        skinPalettesPerFrame: 0,
        allUnitsOnScreen: false,
        visibilityNote: '',
        specProfile: true,
        a2Profile: 'spec',
        truncated,
        truncateReason,
        ...extra,
      };
      return rec;
    },
  };
}

/** §5.3 的 20 单位机械判定（与 S0 同一份判据，逐条可对表）。 */
export function judgeCapacity20(rec: CapacityRecord | null | undefined): CapacityVerdict {
  const reasons: string[] = [];
  if (!rec) return { pass: false, reasons: ['无 20 单位档数据'], verdict: 'A_COMPATIBLE_CAPACITY_FAIL' };
  if (rec.truncated) reasons.push('采样被防呆截断：' + (rec.truncateReason || '未达规定采样量'));
  if (rec.specProfile === false) reasons.push('非方案口径采样（a2Profile=' + rec.a2Profile + '）⇒ 不得作为容量结论');
  if (!(rec.fpsMedian >= CAPACITY_THRESHOLDS.fpsMedianMin)) reasons.push('fpsMedian ' + rec.fpsMedian + ' < ' + CAPACITY_THRESHOLDS.fpsMedianMin);
  if (!(rec.frameMsP95 <= CAPACITY_THRESHOLDS.frameMsP95Max)) reasons.push('frameMsP95 ' + rec.frameMsP95 + ' > ' + CAPACITY_THRESHOLDS.frameMsP95Max);
  if (!(rec.frameMsP99 <= CAPACITY_THRESHOLDS.frameMsP99Max)) reasons.push('frameMsP99 ' + rec.frameMsP99 + ' > ' + CAPACITY_THRESHOLDS.frameMsP99Max);
  if (!(rec.over50msRatio <= CAPACITY_THRESHOLDS.over50RatioMax)) reasons.push('over50msRatio ' + rec.over50msRatio + ' > 1%');
  if (rec.contextLostCount !== 0) reasons.push('contextLostCount ' + rec.contextLostCount + ' != 0');
  if (rec.glErrorCount !== 0) reasons.push('glErrorCount ' + rec.glErrorCount + ' != 0');
  if (rec.drawCallsPerFrame !== CAPACITY_THRESHOLDS.requiredDrawCalls) reasons.push('drawCallsPerFrame ' + rec.drawCallsPerFrame + ' != 20');
  if (rec.skinPalettesPerFrame !== CAPACITY_THRESHOLDS.requiredPalettes) reasons.push('skinPalettesPerFrame ' + rec.skinPalettesPerFrame + ' != 20');
  if (rec.allUnitsOnScreen !== true) reasons.push('屏上 20 个角色未全部可见');
  return {
    pass: reasons.length === 0,
    reasons,
    verdict: reasons.length === 0 ? 'CAPACITY_PASS' : 'A_COMPATIBLE_CAPACITY_FAIL',
  };
}

/** 20 单位网格摆放（沿 S0：cols=ceil(sqrt(n))，按格子适配，禁出屏）。
 * ★ 只产出**脚底格位**（cx/feetY）：人物缩放由生产 pass 从 profile 参考高决定（方案 §4.1
 *   「禁按模型 bbox 每帧自适应缩放」）。可见性判据也从生产 pass 返回的 `placed` 取（单一真源），
 *   本函数不另算一套缩放，避免「两个 scale 源」（S0 易错点 10 的同类风险）。 */
export interface UnitCell {
  cx: number;
  feetY: number;
}

export interface UnitLayout {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  cells: UnitCell[];
}

export function layoutUnitCells(n: number, widthPx: number, heightPx: number): UnitLayout {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = widthPx / cols;
  const cellH = heightPx / rows;
  const cells: UnitCell[] = [];
  for (let i = 0; i < n; i++) {
    // 0.92 = 格子内的脚底基线（上方留头高）；与 S0 layoutUnits 同式
    cells.push({ cx: cellW * ((i % cols) + 0.5), feetY: cellH * (Math.floor(i / cols) + 0.92) });
  }
  return { cols, rows, cellW, cellH, cells };
}

/** 摆放 bbox（= 生产 pass 的 placed 项）是否完整落在背衬内且面积有效。 */
export function isPlacedInsideViewport(
  box: { cx: number; top: number; w: number; h: number },
  widthPx: number,
  heightPx: number,
): boolean {
  const x0 = box.cx - box.w / 2;
  const x1 = box.cx + box.w / 2;
  return x0 >= 0 && box.top >= 0 && x1 <= widthPx && box.top + box.h <= heightPx && box.w > 2 && box.h > 2;
}

