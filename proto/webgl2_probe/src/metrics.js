// src/metrics.js —— A2 采样器与指标汇总（口径见《T31 方案》§5.2，README 有同一份表）
//
// 指标定义（写死，禁改口径）：
//   frameWallMs : 完整 rAF 间隔（真实总成本，FPS 的唯一来源）
//   fps         : 1000 / frameWallMs
//   P50/P95/P99 : 帧时**最近秩**百分位（升序后取 ceil(p*n)-1）
//   1% low FPS  : 最差 ceil(n*1%) 帧的**平均帧时**取倒数
//   over33/50   : frameWallMs > 33 / > 50 的帧占比
//   gpuMs       : 仅 EXT_disjoint_timer_query_webgl2 真采样得到；不可用 = null
//                 （**禁用** draw call 前后 performance.now 冒充当 GPU 时间）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./math.js'));
  else { root.PWProbe = root.PWProbe || {}; root.PWProbe.metrics = factory(root.PWProbe.math); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (math) {
  'use strict';

  /** A2 单档采样器。 */
  function createSampler(unitCount, durationSec) {
    const frames = [];                 // {wall, js, submit, composite, gpu}
    let startedAt = null;
    let lastFrameAt = null;
    let rolling = [];                  // 屏上滚动 FPS（最近 30 帧）

    return {
      unitCount: unitCount,
      requiredSec: durationSec,
      requiredMinSamples: 1800,
      start: function (t) { startedAt = t; lastFrameAt = null; frames.length = 0; rolling = []; },
      /** @param {{wall:number, js:number, submit:number, composite:number, gpu:(number|null)}} s */
      push: function (s) {
        frames.push(s);
        rolling.push(1000 / s.wall);
        if (rolling.length > 30) rolling.shift();
      },
      get elapsedSec() { return startedAt === null ? 0 : (lastFrameAt === null ? 0 : (lastFrameAt - startedAt) / 1000); },
      get sampleCount() { return frames.length; },
      /** 两个条件都满足才算采完：达到规定秒数 **且** ≥ 规定帧数（先到的那个要继续等另一个）。 */
      isDone: function () { return frames.length >= this.requiredMinSamples && this.elapsedSec >= durationSec; },
      rollingFps: function () { return rolling.length ? math.mean(rolling) : 0; },
      markFrameTime: function (tAbs) { if (startedAt === null) startedAt = tAbs; lastFrameAt = tAbs; },
      /** 汇总成 A2 单档记录（结构 = 方案 §8 的 a2[] 元素）。 */
      summarize: function (extra) {
        const wall = frames.map(function (f) { return f.wall; });
        const sorted = math.sortAsc(wall);
        const fps = wall.map(function (w) { return 1000 / w; });
        const sortedFps = math.sortAsc(fps);
        const rec = {
          unitCount: unitCount,
          durationSec: +(this.elapsedSec).toFixed(3),
          sampleCount: frames.length,
          fpsMean: +(math.mean(fps)).toFixed(2),
          fpsMedian: +(math.percentile(sortedFps, 0.5)).toFixed(2),
          onePercentLowFps: +(math.onePercentLowFps(sorted)).toFixed(2),
          frameMsMedian: +(math.percentile(sorted, 0.5)).toFixed(3),
          frameMsP95: +(math.percentile(sorted, 0.95)).toFixed(3),
          frameMsP99: +(math.percentile(sorted, 0.99)).toFixed(3),
          over33msRatio: +math.ratioOver(sorted, 33).toFixed(5),
          over50msRatio: +math.ratioOver(sorted, 50).toFixed(5),
          jsAnimMs: +(math.percentile(math.sortAsc(frames.map(function (f) { return f.js; })), 0.5)).toFixed(4),
          glSubmitMs: +(math.percentile(math.sortAsc(frames.map(function (f) { return f.submit; })), 0.5)).toFixed(4),
          compositeCpuMs: +(math.percentile(math.sortAsc(frames.map(function (f) { return f.composite; })), 0.5)).toFixed(4),
          // 均值版：宿主 performance.now 被量化时，中位数会整片落到 0；均值可把量化误差平均掉
          jsAnimMsMean: +math.mean(frames.map(function (f) { return f.js; })).toFixed(4),
          glSubmitMsMean: +math.mean(frames.map(function (f) { return f.submit; })).toFixed(4),
          compositeCpuMsMean: +math.mean(frames.map(function (f) { return f.composite; })).toFixed(4),
          twoDTotalMsMean: +math.mean(frames.map(function (f) { return f.twoDTotal === undefined ? f.composite : f.twoDTotal; })).toFixed(4),
          gpuMs: frames.some(function (f) { return f.gpu !== null && f.gpu !== undefined; })
            ? +(math.percentile(math.sortAsc(frames.filter(function (f) { return f.gpu !== null && f.gpu !== undefined; }).map(function (f) { return f.gpu; })), 0.5)).toFixed(4)
            : null,
          gpuMsSource: extra && extra.gpuMsSource ? extra.gpuMsSource : 'EXT_disjoint_timer_query_webgl2-unavailable',
          glErrorProbeHz: extra && extra.glErrorProbeHz ? extra.glErrorProbeHz : 1,
          truncated: this.truncated === true,
          truncateReason: this.truncateReason || null,
        };
        return rec;
      },
    };
  }

  /**
   * §5.3 的 20 单位判定（纯函数，浏览器/真机同一份逻辑）。
   * @returns {{pass:boolean, reasons:string[], verdict:string}}
   */
  function judgeCapacity20(rec) {
    const reasons = [];
    if (!rec) return { pass: false, reasons: ['无 20 单位档数据'], verdict: 'A_COMPATIBLE_CAPACITY_FAIL' };
    if (rec.truncated === true) reasons.push('采样被防呆截断：' + (rec.truncateReason || '未达规定采样量'));
    if (rec.specProfile === false) reasons.push('非方案口径采样（a2Profile=' + rec.a2Profile + '）⇒ 不得作为容量结论');
    if (!(rec.fpsMedian >= 30)) reasons.push('fpsMedian ' + rec.fpsMedian + ' < 30');
    if (!(rec.frameMsP95 <= 33.3)) reasons.push('frameMsP95 ' + rec.frameMsP95 + ' > 33.3');
    if (!(rec.frameMsP99 <= 50)) reasons.push('frameMsP99 ' + rec.frameMsP99 + ' > 50');
    if (!(rec.over50msRatio <= 0.01)) reasons.push('over50msRatio ' + rec.over50msRatio + ' > 1%');
    if (rec.contextLostCount !== 0) reasons.push('contextLostCount ' + rec.contextLostCount + ' != 0');
    if (rec.glErrorCount !== 0) reasons.push('glErrorCount ' + rec.glErrorCount + ' != 0');
    if (rec.drawCallsPerFrame !== 20) reasons.push('drawCallsPerFrame ' + rec.drawCallsPerFrame + ' != 20');
    if (rec.skinPalettesPerFrame !== 20) reasons.push('skinPalettesPerFrame ' + rec.skinPalettesPerFrame + ' != 20');
    if (rec.allUnitsOnScreen !== true) reasons.push('屏上 20 个角色未全部可见');
    return { pass: reasons.length === 0, reasons: reasons, verdict: reasons.length === 0 ? 'CAPACITY_PASS' : 'A_COMPATIBLE_CAPACITY_FAIL' };
  }

  return { createSampler: createSampler, judgeCapacity20: judgeCapacity20 };
});
