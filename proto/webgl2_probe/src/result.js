// src/result.js —— 结果汇总 / 判定 / 导出（结构 = 《T31 方案》§8 的最小 schema）
//
// 判定口径（方案 §4.4 / §5.3 逐条落地，纯函数，浏览器与真机共用一份逻辑）：
//   · 单设备事实 = Device-PASS：A1-01..05 全过 + 零 context lost/GL error + 连续 3 次冷启动全绿。
//   · Architecture-PASS 需要 ≥2 台异品牌/异 renderer 安卓各 3 次冷启动 —— 单机结果**只出 PARTIAL_PASS**，
//     最终签字权在主架构（本文件不越级判 Architecture-PASS）。
//   · 20 单位 Capacity 判定见 metrics.judgeCapacity20。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./math.js'), require('./metrics.js'));
  else { root.PWProbe = root.PWProbe || {}; root.PWProbe.result = factory(root.PWProbe.math, root.PWProbe.metrics); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (math, metrics) {
  'use strict';

  const SCHEMA_VERSION = 't31-s0-1.0';

  function deviceHashOf(d) {
    // 未掩码 renderer 是"品牌/GPU 不同"的唯一可比字段（掩码后各家都叫 WebKit WebGL）⇒ 入哈希
    return math.hash32([d.brand, d.model, d.system, d.platform, d.SDKVersion,
      d.renderer, d.vendor, d.unmaskedRenderer, d.pixelRatio].join('|')).toString(36);
  }

  /**
   * @param {object} ctx {device, canvas, a1, a2, coldRuns, env:{browser:boolean}, commitSha, modelSha256}
   */
  function build(ctx) {
    const d = ctx.device || {};
    const base = {
      schemaVersion: SCHEMA_VERSION,
      commitSha: ctx.commitSha,
      probeBaselineNote: 'commitSha = probe 工程基线提交；PM 用分支 tip 交叉核对（见 README「结果字段」）',
      modelSha256: ctx.modelSha256,
      device: {
        brand: d.brand, model: d.model, system: d.system, platform: d.platform,
        SDKVersion: d.SDKVersion === undefined ? null : d.SDKVersion,
        benchmarkLevel: d.benchmarkLevel === undefined ? null : d.benchmarkLevel,
        pixelRatio: d.pixelRatio,
        screenWidth: d.screenWidth, screenHeight: d.screenHeight,
        windowWidth: d.windowWidth, windowHeight: d.windowHeight,
        renderer: d.renderer, vendor: d.vendor,
        glVersion: d.glVersion, glslVersion: d.glslVersion,
        maxTextureSize: d.maxTextureSize, maxVertexAttribs: d.maxVertexAttribs,
        deviceHash: deviceHashOf(d),
      },
      canvas: ctx.canvas,
      a1: ctx.a1,
      a2: ctx.a2 || [],
      coldRuns: ctx.coldRuns || null,
      env: ctx.env || {},
      verdict: null,
      notes: [],
    };
    const v = verdicts(ctx);
    base.verdict = v.verdict;
    base.notes = v.notes;
    return base;
  }

  function verdicts(ctx) {
    const notes = [];
    const a1 = ctx.a1 || {};
    const env = ctx.env || {};
    const sdkApplicable = a1.sdkVersionApplicable !== false;
    const sdkOk = a1.sdkVersionOk;

    let device = 'DEVICE_FAIL';
    let architecture = 'PENDING';
    let capacity20 = 'NOT_RUN';
    let capacityEngine = null;
    let capacityReasons = null;

    if (a1.mode === 'maincontrol') {
      // 正控模式自身不出判定：它只是一次定位实验，判定要等离屏模式的同设备结果一起看（方案 §4.3）
      device = 'NOT_APPLICABLE';
      architecture = a1.mainCanvasWebgl2Control === 'PASS' ? 'SEE_OFFSCREEN_RESULT' : 'MAIN_CANVAS_WEBGL2_FAIL';
      capacity20 = 'NOT_RUN';
      notes.push(a1.mainCanvasWebgl2Control === 'PASS'
        ? '主画布 WebGL2 正控 PASS：若同设备离屏链 FAIL ⇒ 判"双 canvas A 路线失败"（方案 §4.3/§9.1）'
        : '主画布 WebGL2 也 FAIL ⇒ 该设备/SDK 无 WebGL2，A、B 都不能直接成立（方案 §4.3）');
      return { verdict: { device: device, architecture: architecture, capacity20: capacity20, capacity20Engine: null, capacity20Reasons: null }, notes: notes };
    }
    if (sdkApplicable && sdkOk === false) {
      device = 'UNSUPPORTED';
      architecture = 'UNSUPPORTED';
      notes.push('SDKVersion ' + (ctx.device && ctx.device.SDKVersion) + ' < 2.24.0 ⇒ 不支持 webgl2，不参与 A 路线 PASS（方案 §4.1）');
    } else if (env.browser) {
      // 浏览器 + wx shim：只证明核心代码通，**不构成微信/安卓能力证据**（方案 §7.1）
      // 注意 Device-PASS 本身是"连续 3 次冷启动全绿"的事实：前两次冷启动不算 FAIL，只是这一系列还没跑完
      if (a1.devicePassCandidate) device = 'BROWSER_SHIM_PASS';
      else if (a1.allAssertionsPass) device = 'BROWSER_SHIM_A1_PASS_COLD_INCOMPLETE';
      else device = 'BROWSER_SHIM_FAIL';
      architecture = 'BROWSER_ONLY_NOT_DEVICE_EVIDENCE';
      notes.push('浏览器 + wx shim 结果只证明核心代码路径通，不证明微信/安卓能力；不得据此写 A 方案成立（方案 §7.1）');
      if (device === 'BROWSER_SHIM_A1_PASS_COLD_INCOMPLETE') {
        notes.push('本次 A1 断言全过，但冷启动系列仅 ' + (a1.coldRunsTotal || 0) + '/' + (a1.coldRunsRequired || 3) + ' 次 ⇒ 尚未构成 Device-PASS（不是失败）');
      }
    } else if (a1.devicePassCandidate) {
      device = 'DEVICE_PASS';
      architecture = 'PARTIAL_PASS';
      notes.push('单台设备 Device-PASS ⇒ 记 PARTIAL_PASS；Architecture-PASS 需 ≥2 台异品牌/异 renderer 安卓各 3 次冷启动（方案 §4.4），由主架构签字');
    } else if (a1.allAssertionsPass) {
      // ★ 中间态：本次 A1 全过、但冷启动系列还没满 3 次 ⇒ 是"未完成"，**不是失败**
      //   （真机实测踩过：冷启动 2/3 时屏幕打出 DEVICE_FAIL，与同屏 A1 5/5 自相矛盾）
      //   与浏览器档 BROWSER_SHIM_A1_PASS_COLD_INCOMPLETE 同族命名。
      device = 'DEVICE_A1_PASS_COLD_INCOMPLETE';
      architecture = 'PENDING';
      notes.push('本次 A1 断言全过（A1-01..05 绿、零 context lost / GL error），但冷启动仅 '
        + (a1.coldRunsTotal || 0) + '/' + (a1.coldRunsRequired || 3)
        + ' 次，**未构成 Device-PASS —— 这不是失败**（方案 §4.4：Device-PASS = 连续 3 次冷启动全绿）；'
        + '继续「完全杀微信 → 重新扫码」凑满 3 次即可，第 3 次会自动接着跑 A2');
      notes.push('A2 按方案 §5 只在 Device-PASS 后运行，故本次 capacity20 记 NOT_RUN');
    } else {
      device = 'DEVICE_FAIL';
      if (a1.offscreenFailed && a1.mainCanvasWebgl2Control === 'PASS') {
        architecture = 'ARCHITECTURE_FAIL';
        notes.push('主画布 WebGL2 正控 PASS 而离屏链 FAIL ⇒ 双 canvas A 路线判死，转 B 的主画布整体 WebGL spike（方案 §9.1）；需排除 demo 编码错误后连续 2 次复现再由主架构签字');
      } else if (a1.offscreenFailed && a1.mainCanvasWebgl2Control === 'FAIL') {
        architecture = 'A_BOTH_PRECONDITIONS_FAIL';
        notes.push('主画布与离屏均 FAIL ⇒ 该设备/SDK 无 WebGL2，A、B 都不能直接成立（方案 §4.3）');
      } else {
        architecture = 'PENDING';
        notes.push('A1 未过但失败层未定位；先跑主画布 WebGL2 正控模式（方案 §4.3/§9.1）');
      }
    }

    const rec20 = (ctx.a2 || []).filter(function (r) { return r.unitCount === 20; })[0];
    if (rec20) {
      const j = metrics.judgeCapacity20(rec20);
      // 机械判定（§5.3）保留在 capacity20Engine；capacity20 是本探针**是否可作为该结论证据**的口径
      capacityEngine = j.verdict;
      capacityReasons = j.reasons;
      if (rec20.specProfile === false) {
        capacity20 = 'BROWSER_PROFILE_NOT_APPLICABLE';
        notes.push('20 单位档为浏览器短采样（a2Profile=' + rec20.a2Profile + '）⇒ 只证明判定逻辑能出结论，不作为容量判定；容量结论必须用真机 spec 档数字');
      } else if (env.browser) {
        capacity20 = 'BROWSER_SHIM_' + j.verdict;
        notes.push('20 单位数字来自浏览器 + wx shim（renderer=' + ((ctx.device && (ctx.device.unmaskedRenderer || ctx.device.renderer)) || '?') + '，非微信/安卓）⇒ §5.3 机械判定为 ' + j.verdict + '，但不构成容量结论；真机 spec 档数字是唯一证据源（方案 §7）');
      } else {
        capacity20 = j.verdict;
        if (!j.pass) notes.push('20 单位未过（' + j.reasons.join('；') + '）。按方案 §9.2：A1 仍成立则不判 A 死，下一步用 20k 低模同口径复测 S0-R1');
      }
    }
    return { verdict: { device: device, architecture: architecture, capacity20: capacity20, capacity20Engine: capacityEngine, capacity20Reasons: capacityReasons }, notes: notes };
  }

  /** §8 要求的 console 单行格式。 */
  function toConsoleLine(obj) {
    return '__WEBGL2_PROBE_RESULT__=' + JSON.stringify(obj);
  }

  /** 截图文件名（方案 §8：含 deviceHash / SDKVersion / unitCount / runIndex）。 */
  function screenshotName(obj, unitCount, tag) {
    const d = obj.device;
    const sdk = d.SDKVersion === null || d.SDKVersion === undefined ? 'nosdk' : String(d.SDKVersion).replace(/[^\w.]/g, '');
    const run = obj.a1 && obj.a1.coldRunIndex ? obj.a1.coldRunIndex : 0;
    return 'probe_' + d.deviceHash + '_' + sdk + '_' + (tag || 'u' + unitCount) + '_run' + run + '.png';
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    build: build,
    verdicts: verdicts,
    toConsoleLine: toConsoleLine,
    screenshotName: screenshotName,
    deviceHashOf: deviceHashOf,
  };
});
