// game.js —— T31 · 2.5D S0 技术前提实测 probe（微信小游戏入口；浏览器跑同一份）
//
// 只做两件事（《T31 方案》§1.1）：
//   数 1  A1：离屏 canvas 取 webgl2 → 41 骨 uniform 蒙皮 → drawImage 合成到 2D 主画布，是否可用；
//   数 2  A2：现役 48k 模型在 1/5/10/20 单位档的帧率与分相耗时（主判 20）。
//
// 与宿主无关的部分全在 src/*；这里只做编排、断言、采样、导出。
// 模块形态：UMD —— 微信端由 game.js 自己 require('./src/...')；浏览器端 index.html 逐条 <script>
// 装载后由 browser/probe-browser.js 调 PWProbe.run({platform})。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./src/math.js'), require('./src/glb-loader.js'), require('./src/anim-loader.js'),
      require('./src/skinning-renderer.js'), require('./src/metrics.js'), require('./src/result.js'),
      require('./src/platform-wx.js'), require('./src/platform-browser.js').createBrowserPlatform);
  } else {
    root.PWProbe = root.PWProbe || {};
    root.PWProbe.run = factory(
      root.PWProbe.math, root.PWProbe.glbLoader, root.PWProbe.animLoader,
      root.PWProbe.skinningRenderer, root.PWProbe.metrics, root.PWProbe.result,
      root.PWProbe.platformWx, root.PWProbe.platformBrowser && root.PWProbe.platformBrowser.createBrowserPlatform);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (math, glbLoader, animLoader, skinningRenderer, metrics, result, platformWx, createBrowserPlatform) {
  'use strict';

  // ── 方案写死的常量（改了就是改口径） ───────────────────────────────────
  const SPEC_COMMIT = 'f5ac3c7f';                    // 《2.5D-S0技术前提实测方案》提交
  const MODEL_REL = 'subpackages/probe-model/hero_48k_20260914.glb';
  const ANIM_REL = 'subpackages/probe-model/idle_v4.json';
  const SUBPACKAGE = 'probe-model';
  const MODEL_SHA256 = 'ff9202b48470c92ccdad0333108e77e193a4135f873ce68e7e3498e979f816f0';
  const MODEL_ACCOUNT = glbLoader.MODEL_ACCOUNT_BASELINE;
  const MODEL_BYTES = 4040728;
  const MIN_SDK = '2.24.0';
  const MIN_MAX_VERTEX_UNIFORM_VECTORS = 180;
  const PHASE_STEP_SEC = 0.137;                       // 单位 i 相位 = i×0.137s 取模 idle 时长
  const ATTRS = { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true };
  const COLD_RUNS_REQUIRED = 3;
  const STORAGE_COLD = 'pw-probe-cold-runs';
  const STORAGE_MODE = 'pw-probe-mode';
  const STORAGE_A2_MODE = 'pw-probe-a2-mode';          // 'run' = 每轮都跑 A2（「重跑压测」按钮写）
  const HUD_FONT = '"PingFang SC","Microsoft YaHei",monospace';
  const GL_ERROR_PROBE_HZ = 1;
  // 采样档（spec = 方案 §5.1 原文；browser-short 只用于浏览器层"代码通不通"的证据，
  // 结果 JSON 会写明 profile 与 specProfile=false，判定也会被降级标注）
  const A2_PROFILES = {
    spec: { warmupSec: 10, minSamples: 1800, plan: [{ u: 1, sec: 30 }, { u: 5, sec: 30 }, { u: 10, sec: 30 }, { u: 20, sec: 60 }] },
    'browser-short': { warmupSec: 3, minSamples: 300, plan: [{ u: 1, sec: 6 }, { u: 5, sec: 6 }, { u: 10, sec: 6 }, { u: 20, sec: 10 }] },
  };

  function str(v) { return v === null || v === undefined ? '' : String(v); }
  function trunc(s, n) { s = str(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function roundRect(r) { return { x0: +r.x0.toFixed(1), y0: +r.y0.toFixed(1), x1: +r.x1.toFixed(1), y1: +r.y1.toFixed(1) }; }

  // ══ 编排 ══════════════════════════════════════════════════════════════

  /**
   * @param {{platform?:object, mode?:'offscreen'|'maincontrol', a2?:'run'|'skip',
   *          a2Profile?:'spec'|'browser-short', commitSha?:string, modelSha256?:string}} [opts]
   * @returns {Promise<object>} 结果 JSON（结构 = 方案 §8）
   */
  async function run(opts) {
    opts = opts || {};
    const platform = opts.platform || (platformWx && platformWx.createWxPlatform ? platformWx.createWxPlatform() : null);
    if (!platform) throw new Error('probe: 无可用宿主平台');
    const profile = A2_PROFILES[opts.a2Profile || 'spec'];
    const state = {
      platform: platform, isBrowser: platform.kind === 'browser', phase: 'boot', profileName: opts.a2Profile || 'spec', profile: profile,
      info: null, screenCanvas: null, glCanvas: null, ctx2d: null, gl: null, renderer: null,
      units: [], unitCount: 0, hud: { lines: [], button: null }, a1: null, a2: [], result: null,
      screenshots: [], error: null, contextLostCount: 0, glErrorCount: 0, W: 0, H: 0,
      modelByteLength: null, modelSha256: opts.modelSha256 || MODEL_SHA256,
      modelSha256Source: opts.modelSha256 ? 'injected' : 'constant',
      commitSha: opts.commitSha || (typeof globalThis !== 'undefined' && globalThis.__PW_PROBE_COMMIT__) || SPEC_COMMIT,
      coldRuns: null,
    };
    publish(state);
    try {
      const info = platform.getSystemInfo();
      state.info = info;
      const dpr = Math.min(info.pixelRatio || 1, 3);
      const W = Math.round((info.windowWidth || 0) * dpr);
      const H = Math.round((info.windowHeight || 0) * dpr);
      if (!(W > 0) || !(H > 0)) throw new Error('probe: windowWidth/Height 异常 ' + info.windowWidth + 'x' + info.windowHeight);
      state.W = W; state.H = H;

      // Canvas 1 = 屏幕画布（首次 wx.createCanvas = 屏幕，官方语义）
      const screenCanvas = platform.createCanvas();
      state.screenCanvas = screenCanvas;
      screenCanvas.width = W; screenCanvas.height = H;

      const mode = opts.mode || (platform.getStorage(STORAGE_MODE) === 'maincontrol' ? 'maincontrol' : 'offscreen');
      // A2 触发模式：显式入参 > storage（「重跑压测」按钮写 'run'，解决"冷启动满 3 次后 A2 不再自动跑"）
      const a2Mode = opts.a2 || (platform.getStorage(STORAGE_A2_MODE) === 'run' ? 'run' : 'auto');
      state.a2Forced = a2Mode === 'run';
      if (mode === 'maincontrol') {
        const control = await runMainCanvasControl(state, info);
        return finalize(state, control);
      }

      const ctx2d = screenCanvas.getContext('2d');
      if (!ctx2d) throw new Error('probe: 屏幕画布取 2d 失败');
      state.ctx2d = ctx2d;

      const a1 = { assertions: [], errors: [], mode: 'offscreen', nonce: newNonce() };
      state.a1 = a1;

      // ── A1-01 Canvas 身份 ────────────────────────────────────────────
      const offscreen = platform.createCanvas();          // Canvas 2 = 离屏 webgl2
      state.glCanvas = offscreen;
      offscreen.width = W; offscreen.height = H;
      const indep = checkIndependentSize(screenCanvas, offscreen, W, H);
      record(a1, 'A1-01', 'Canvas 身份：第 1 张能取 2d / 第 2 张是不同对象 / 宽高可独立设置',
        !!ctx2d && offscreen !== screenCanvas && indep.ok, {
          screenCtx2d: !!ctx2d, sameObject: offscreen === screenCanvas,
          offscreenResizable: indep.offscreenResizable, screenUntouched: indep.screenUntouched,
          screenSize: [screenCanvas.width, screenCanvas.height], offscreenSize: [offscreen.width, offscreen.height],
        });

      // ── A1-02 WebGL2 context ─────────────────────────────────────────
      let gl = null;
      try { gl = offscreen.getContext('webgl2', ATTRS); } catch (e) { a1.errors.push('getContext(webgl2) 抛错: ' + e.message); }
      state.gl = gl;
      let a1_02 = false;
      if (gl) {
        const gpu = queryGpuInfo(gl);
        const lost = gl.isContextLost();
        const err0 = gl.getError();
        // MAX_VERTEX_UNIFORM_VECTORS：宿主不返回（null）时**不判死** —— 方案 §4.2 原文
        // "最终以 shader compile/link 成功为硬判据"，故能力项记 unknown，由 A1-03 的 link 结果兜底。
        const capOk = gpu.maxVertexUniformVectors === null || gpu.maxVertexUniformVectors === undefined
          ? null : gpu.maxVertexUniformVectors >= MIN_MAX_VERTEX_UNIFORM_VECTORS;
        a1_02 = !lost && err0 === gl.NO_ERROR && capOk !== false;
        record(a1, 'A1-02', 'WebGL2 context：非 null / 未丢上下文 / 初始无 GL error / MAX_VERTEX_UNIFORM_VECTORS ≥ ' + MIN_MAX_VERTEX_UNIFORM_VECTORS,
          a1_02, {
            contextLost: lost, initialGlError: err0, maxVertexUniformVectors: gpu.maxVertexUniformVectors,
            capabilityCheck: capOk === null ? 'unknown（宿主不返回该常量 ⇒ 硬判据转为 shader link 成功，方案 §4.2）' : capOk,
            renderer: gpu.renderer,
          });
        if (capOk === null) (a1.notes = a1.notes || []).push('MAX_VERTEX_UNIFORM_VECTORS 取不到（宿主不返回）⇒ 记 unknown，不判死；41 骨 shader 的 compile/link 结果即硬判据');
        trackContextLoss(state, offscreen, gl);
      } else {
        record(a1, 'A1-02', 'WebGL2 context', false, { reason: 'getContext("webgl2") 返回 null' });
      }
      a1.webgl2Context = !!gl;
      a1.maxVertexUniformVectors = gl ? queryGpuInfo(gl).maxVertexUniformVectors : null;
      // WebGL1 诊断：第三张**全新** canvas，只定位不 fallback（§4.3）
      a1.webgl1Diagnostic = gl ? null : diagnoseWebgl1(platform, W, H);
      a1.timerResolutionMs = measureTimerResolution(platform);
      const coldPeek = peekColdRun(platform, coldRunKey(state, info));
      a1.coldRunIndex = coldPeek.runIndex;                 // 先取号：截图命名要用 runIndex

      if (!gl) {
        a1.offscreenFailed = true;
        a1.devicePassCandidate = false;
        a1.compositeProof = 'not-run';
        a1.allAssertionsPass = false;
        commitColdRun(state, platform, info, a1, coldPeek, false);
        renderScreen(state, null);
        return finalize(state, a1);
      }

      // ── A1-03 最小 shader（含 uBones[41]） ───────────────────────────
      let triangle = null, a1_03 = false;
      try {
        triangle = skinningRenderer.createMinimalTriangleProgram(gl);
        a1.shaderLink = true;
        gl.viewport(0, 0, offscreen.width, offscreen.height);
        gl.clearColor(0, 0, 0, 0);
        gl.disable(gl.DEPTH_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT);
        skinningRenderer.drawMinimalTriangle(gl, triangle);
        const rb = readPixelsRegion(gl, Math.floor(offscreen.width / 2) - 2, Math.floor(offscreen.height / 2) - 2, 4, 4);
        const err = gl.getError();
        a1_03 = rb.nonClearPixels > 0 && rb.alphaMax > 0 && err === gl.NO_ERROR;
        a1.triangleReadback = { nonClearPixels: rb.nonClearPixels, alphaMax: rb.alphaMax, glError: err };
        record(a1, 'A1-03', '最小 shader：uBones[41] 编译/link + 41 个 identity **一次** uniformMatrix4fv 上传 + 红绿三角形 readPixels 中心 4×4',
          a1_03, a1.triangleReadback);
      } catch (e) {
        a1.shaderLink = false;
        a1.errors.push('A1-03: ' + e.message);
        record(a1, 'A1-03', '最小 shader', false, { reason: e.message });
      }
      a1.shaderLink = a1.shaderLink === true;
      await capture(state, 'a1-03-triangle');

      // ── 资产装载（分包 → readFile → GLB parse → 纹理解码 → 首传 GPU）──
      const asset = { stages: {}, resolved: {}, errors: [] };
      a1.asset = asset;
      let posed = null;
      try {
        posed = await loadAssets(state, platform, gl, asset);
        state.renderer = posed.renderer;
      } catch (e) {
        asset.errors.push(e.message);
        a1.errors.push('资产装载: ' + e.message);
        a1.assetFailed = true;
      }
      a1.modelAccount = posed ? posed.model.account : null;
      a1.modelAccountOk = !!(posed && posed.model.account.triangleCount === MODEL_ACCOUNT.triangleCount
        && posed.model.account.jointCount === MODEL_ACCOUNT.jointCount);
      if (posed && !a1.modelAccountOk) {
        a1.errors.push('模型账不符：triangleCount=' + posed.model.account.triangleCount + '（基线 ' + MODEL_ACCOUNT.triangleCount
          + '）/ jointCount=' + posed.model.account.jointCount + '（基线 ' + MODEL_ACCOUNT.jointCount + '）');
      }
      if (posed) {
        // 回读自证：平台不支持（如安卓 magicbrush 的 getUniform）⇒ 如实标注、**不算失败、不计入 errors**
        a1.boneUploadCheck = posed.renderer.verifyBoneUpload();
        if (a1.boneUploadCheck.unsupported) {
          a1.notes = a1.notes || [];
          a1.notes.push('41 骨 palette 回读自证在本平台不可用（' + (a1.boneUploadCheck.error || a1.boneUploadCheck.platform)
            + '）⇒ 不计入错误；蒙皮正确性的硬判据 = A1-03/04/05 像素三件套（方案 §4.2）');
        } else if (!a1.boneUploadCheck.ok) {
          a1.errors.push('41 骨整块 palette 上传自证失败（回读可用但值不符）: ' + JSON.stringify(a1.boneUploadCheck));
        }
      }

      // ── A1-04 真实模型 ───────────────────────────────────────────────
      let a1_04 = false;
      if (posed) {
        const r = modelReadbackCheck(state, gl, posed, offscreen);
        a1_04 = r.pass;
        a1.modelReadback = r;
        if (!r.pass) a1.errors.push('A1-04 未过: ' + JSON.stringify(r.passDetail || r));
        record(a1, 'A1-04', '真实模型：非透明像素 > 100 / bbox 宽高均 > 10 / 连续两帧像素摘要不同',
          r.pass, {
            nonTransparentPixels: r.nonTransparentPixels, bboxW: r.bboxW, bboxH: r.bboxH,
            digestFrameA: r.digestFrameA, digestFrameB: r.digestFrameB, framesDiffer: r.framesDiffer,
            touchesReadRegionEdge: r.touchesReadRegionEdge, glError: r.glError, region: r.region,
          });
        await capture(state, 'a1-04-model');
      } else {
        record(a1, 'A1-04', '真实模型', false, { reason: '模型/动作未装载成功' });
      }

      // ── A1-05 合成 ──────────────────────────────────────────────────
      const comp = await compositeCheck(state, gl, offscreen, ctx2d, posed, W, H, a1.nonce);
      a1.composite = comp;
      a1.compositeProof = comp.proof;
      if (comp.proof === 'visualProof') {
        a1.errors.push('主画布回读不可用 ⇒ A1-05 记 visualProof=true，需截图 + 屏上 nonce 人眼确认（不得假写 readback PASS）');
      }
      record(a1, 'A1-05', '合成：WebGL 离屏 drawImage 到 2D 主画布 + 固定区域颜色校验（两块上下分置 ⇒ 顺带验没有上下颠倒）',
        comp.pass, {
          proof: comp.proof, reason: comp.reason || null, glError: comp.glError, drawImageError: comp.drawImageError,
          expectedTop: comp.expectedTop, expectedBottom: comp.expectedBottom,
          readbackTop: comp.readback ? comp.readback.top.mean.map(function (v) { return +v.toFixed(1); }) : null,
          readbackBottom: comp.readback ? comp.readback.bottom.mean.map(function (v) { return +v.toFixed(1); }) : null,
          nonce: a1.nonce,
        });
      await capture(state, 'a1-05-composite');

      // ── A1-06 冷启动 ────────────────────────────────────────────────
      const coldOk = commitColdRun(state, platform, info, a1, coldPeek, a1_03 && a1_04 && comp.pass === true);
      const allPass = a1.assertions.every(function (x) { return x.pass === true; });
      a1.allAssertionsPass = allPass;
      a1.offscreenFailed = !(a1_02 && a1_03 && a1_04 && comp.pass === true);
      a1.devicePassCandidate = allPass && coldOk && a1.sdkVersionOk !== false;
      a1.webgl1FallbackUsed = false;

      // ── A2 ──────────────────────────────────────────────────────────
      // 触发口径（方案 §5 原文「A2 只在该设备 A1 Device-PASS 后运行」）：
      //   auto → 仅当本机"连续 3 次冷启动全绿"这一 Device-PASS 成立时才跑（**真机默认**）；
      //   run  → 强制：本次 A1 全过即可（工程师复测用；JSON 记 a2Trigger=forced，PM 可据此区分）；
      //   skip → 不跑。
      // 两种模式都**不会**在 A1 未全过时跑 A2。
      const a2Trigger = a2Mode === 'skip' ? 'skipped-by-option'
        : (a2Mode === 'run' ? (a1.allAssertionsPass ? 'forced' : 'skipped-a1-not-pass')
          : (a1.devicePassCandidate ? 'spec-device-pass' : 'skipped-not-device-pass'));
      state.a2Trigger = a2Trigger;
      if ((a2Trigger === 'spec-device-pass' || a2Trigger === 'forced') && posed) {
        state.phase = 'a2';
        publish(state);
        for (let i = 0; i < profile.plan.length; i++) {
          const rec = await sampleLevel(state, posed, profile.plan[i], profile, a1);
          state.a2.push(rec);
          renderScreen(state, rec);
          await capture(state, 'u' + profile.plan[i].u);
        }
        await copyResultQuiet(state);
      } else {
        a1.a2Skipped = !posed ? '资产装载失败'
          : a2Trigger === 'skipped-by-option' ? 'a2=skip'
            : a2Trigger === 'skipped-a1-not-pass' ? '本次 A1 未全过（方案 §5：A2 只在 A1 Device-PASS 后运行）'
              : '本机 A1 尚未 Device-PASS（连续 ' + COLD_RUNS_REQUIRED + ' 次冷启动全绿）—— 方案 §5：A2 只在 Device-PASS 后运行；冷启动进度 ' + (a1.coldRunsTotal || 0) + '/' + COLD_RUNS_REQUIRED
                + '；工程师复测可显式 a2=run';
      }
      renderScreen(state, null);
      return finalize(state, a1);
    } catch (e) {
      state.error = (e && e.message) || String(e);
      state.phase = 'error';
      publish(state);
      try { if (typeof console !== 'undefined' && console.error) console.error('__WEBGL2_PROBE_FATAL__=' + state.error); } catch (x) { /* ignore */ }
      throw e;
    }
  }

  function publish(state) { if (typeof globalThis !== 'undefined') globalThis.__probe = state; }
  function record(a1, id, name, pass, detail) { a1.assertions.push({ id: id, name: name, pass: pass === true, detail: detail }); }
  function glNow(p) { return p.now(); }

  function checkIndependentSize(screenCanvas, offscreen, w, h) {
    const sw = screenCanvas.width, sh = screenCanvas.height;
    offscreen.width = w + 8; offscreen.height = h + 8;
    const resizable = offscreen.width === w + 8 && offscreen.height === h + 8;
    const screenUntouched = screenCanvas.width === sw && screenCanvas.height === sh;
    offscreen.width = w; offscreen.height = h;
    return { ok: resizable && screenUntouched, resizable: resizable, screenUntouched: screenUntouched };
  }

  /** getParameter 的安全包装：宿主不认识的常量如实返回 null，不抛（同"回读不可用"= fail-open 口径）。 */
  function safeParam(gl, pname) {
    try { return gl.getParameter(pname); } catch (e) { return null; }
  }

  function queryGpuInfo(gl) {
    let attrs = null;
    try { attrs = gl.getContextAttributes ? gl.getContextAttributes() : null; } catch (e) { attrs = null; }
    let unmasked = null;
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      // 真机判 A1 设备矩阵（≥2 台、品牌或 GPU renderer 不同）要用**未掩码**串
      if (dbg) unmasked = { vendor: str(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)), renderer: str(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) };
    } catch (e) { unmasked = null; }
    return {
      version: str(safeParam(gl, gl.VERSION)),
      shadingLanguageVersion: str(safeParam(gl, gl.SHADING_LANGUAGE_VERSION)),
      vendor: str(safeParam(gl, gl.VENDOR)),
      renderer: str(safeParam(gl, gl.RENDERER)),
      unmaskedVendor: unmasked ? unmasked.vendor : null,
      unmaskedRenderer: unmasked ? unmasked.renderer : null,
      maxVertexUniformVectors: safeParam(gl, gl.MAX_VERTEX_UNIFORM_VECTORS),
      maxTextureSize: safeParam(gl, gl.MAX_TEXTURE_SIZE),
      maxVertexAttribs: safeParam(gl, gl.MAX_VERTEX_ATTRIBS),
      contextAttributes: attrs,
    };
  }

  /**
   * 宿主计时器分辨率（性能分相指标的读数下限）。Chrome 未开跨源隔离时 performance.now 被
   * 量化到 ~100µs，分相中位数会整片落到 0 —— 因此结果里同时给 mean（均值可把量化误差平均掉）
   * 并记下本字段，让 PM 一眼看出"0 是分辨率下限，不是真的没耗时"。
   */
  function measureTimerResolution(p) {
    let minDelta = Infinity;
    let prev = p.now();
    for (let i = 0; i < 20000; i++) {
      const t = p.now();
      const d = t - prev;
      if (d > 0 && d < minDelta) minDelta = d;
      prev = t;
    }
    return minDelta === Infinity ? null : +minDelta.toFixed(6);
  }

  function trackContextLoss(state, canvas, gl) {
    try {
      if (canvas.addEventListener) {
        canvas.addEventListener('webglcontextlost', function () { state.contextLostCount++; }, false);
      }
    } catch (e) { /* 平台不支持事件即跳过；A2 另有 isContextLost 采样 */ }
  }

  function diagnoseWebgl1(platform, w, h) {
    try {
      const c = platform.createCanvas();     // 第三张全新 canvas
      c.width = w; c.height = h;
      const gl1 = c.getContext('webgl');
      if (!gl1) return { available: false, note: '仅用于定位；不构成 runtime fallback，不允许据此继续 A2 或把 A 路线判 PASS（方案 §4.3）' };
      return {
        available: true, note: '仅用于定位；不构成 runtime fallback，不允许据此继续 A2 或把 A 路线判 PASS（方案 §4.3）',
        version: str(gl1.getParameter(gl1.VERSION)), renderer: str(gl1.getParameter(gl1.RENDERER)),
        maxVertexUniformVectors: gl1.getParameter(gl1.MAX_VERTEX_UNIFORM_VECTORS),
      };
    } catch (e) { return { available: false, error: e.message }; }
  }

  // ── 像素回读 ──────────────────────────────────────────────────────────

  function readPixelsRegion(gl, x, y, w, h) {
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let nonClear = 0, nonTransparent = 0, alphaMax = 0;
    for (let i = 0; i < w * h; i++) {
      const r = buf[i * 4], g = buf[i * 4 + 1], b = buf[i * 4 + 2], a = buf[i * 4 + 3];
      if (r || g || b || a) nonClear++;
      if (a > 0) nonTransparent++;
      if (a > alphaMax) alphaMax = a;
    }
    return { x: x, y: y, w: w, h: h, buf: buf, nonClearPixels: nonClear, nonTransparentPixels: nonTransparent, alphaMax: alphaMax, digest: glbLoader.digest32(buf) };
  }

  function pixelBBox(buf, w, h) {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (buf[(y * w + x) * 4 + 3] > 0) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX >= 0 ? maxX - minX + 1 : 0, h: maxY >= 0 ? maxY - minY + 1 : 0 };
  }

  /** 屏幕空间矩形 → WebGL readPixels 区间（GL 原点在左下，需要翻 y）。 */
  function padRegion(rect, W, H, pad) {
    const x = Math.max(0, Math.floor(rect.x0 - pad));
    const y = Math.max(0, Math.floor(H - rect.y1 - pad));
    const w = Math.min(W - x, Math.ceil(rect.x1 - rect.x0 + pad * 2));
    const h = Math.min(H - y, Math.ceil(rect.y1 - rect.y0 + pad * 2));
    return { x: x, y: y, w: Math.max(1, w), h: Math.max(1, h) };
  }

  // ── 资产装载 ──────────────────────────────────────────────────────────

  async function loadAssets(state, platform, gl, asset) {
    const p = platform;
    let t = glNow(p);
    asset.resolved.subpackage = await platform.loadSubpackage(SUBPACKAGE);
    asset.stages.subpackageMs = +(glNow(p) - t).toFixed(1);

    t = glNow(p);
    const glbBuf = await readWithCandidates(platform, MODEL_REL, asset, 'modelPath');
    asset.stages.readFileMs = +(glNow(p) - t).toFixed(1);
    state.modelByteLength = glbBuf.byteLength;
    asset.modelByteLength = glbBuf.byteLength;
    asset.modelByteLengthOk = glbBuf.byteLength === MODEL_BYTES;

    t = glNow(p);
    const model = glbLoader.load(glbBuf);
    asset.stages.glbParseMs = +(glNow(p) - t).toFixed(1);

    t = glNow(p);
    const animText = await readTextWithCandidates(platform, ANIM_REL, asset);
    const anim = animLoader.parseAnim(JSON.parse(animText));
    const bound = animLoader.bindToModel(anim, model);
    asset.stages.animParseMs = +(glNow(p) - t).toFixed(1);
    asset.anim = { fps: anim.fps, nFrames: anim.nFrames, duration: anim.duration, rootMode: anim.rootMode, tracks: bound.tracks.length, coveredJoints: bound.coveredJoints, jointCount: model.jointNodes.length };

    t = glNow(p);
    const decoded = [];
    for (let i = 0; i < model.images.length; i++) {
      const img = model.images[i];
      decoded.push(await platform.decodeImage(img.bytes, String(i), img.mimeType));
    }
    asset.stages.textureDecodeMs = +(glNow(p) - t).toFixed(1);
    asset.textures = decoded.map(function (d) { return { width: d.width, height: d.height, mimeType: d.mimeType }; });

    t = glNow(p);
    const renderer = skinningRenderer.createSkinningRenderer(gl, model, decoded, {});
    asset.stages.firstGpuUploadMs = +(glNow(p) - t).toFixed(1);
    asset.stages.meshUploadMs = +renderer.meshUploadMs.toFixed(1);
    asset.stages.textureUploadMs = +renderer.textureUploadMs.toFixed(1);
    asset.gpu = { maxVertexUniformVectors: renderer.maxVertexUniformVectors, jointCount: renderer.jointCount, vertexCount: renderer.vertexCount, indexCount: renderer.indexCount };
    asset.stagesNote = '以上各段（分包/读取/解析/解码/首传 GPU）分别计时，**不计入**稳态 A2 FPS（方案 §6）';

    if (platform.sha256Hex) {
      const hex = await platform.sha256Hex(MODEL_REL);
      if (hex) { state.modelSha256 = hex; state.modelSha256Source = 'computed'; }
    }
    asset.modelSha256 = state.modelSha256;
    asset.modelSha256Source = state.modelSha256Source;

    const pose = animLoader.createPose(model);
    const bounds = measureAnimatedBounds(model, anim, bound, pose);
    asset.animatedBounds = { min: bounds.min.map(function (v) { return +v.toFixed(4); }), max: bounds.max.map(function (v) { return +v.toFixed(4); }), height: +bounds.height.toFixed(4), width: +bounds.width.toFixed(4) };
    return { model: model, anim: anim, bound: bound, renderer: renderer, pose: pose, bounds: bounds };
  }

  async function readWithCandidates(platform, rel, asset, key) {
    const cands = platform.candidatePaths(rel);
    const errs = [];
    for (let i = 0; i < cands.length; i++) {
      try {
        const buf = await platform.readFileArrayBuffer(cands[i]);
        asset.resolved[key] = cands[i];
        return buf;
      } catch (e) { errs.push(cands[i] + ' → ' + e.message); }
    }
    throw new Error('readFile 全部候选路径失败: ' + errs.join(' | '));
  }

  async function readTextWithCandidates(platform, rel, asset) {
    const cands = platform.candidatePaths(rel);
    const errs = [];
    for (let i = 0; i < cands.length; i++) {
      try {
        let text;
        if (platform.readTextFile) {
          text = await platform.readTextFile(cands[i]);          // 两端都提供（wx: readFile encoding=utf8）
        } else {
          const buf = await platform.readFileArrayBuffer(cands[i]);
          text = glbLoader.decodeUtf8(new Uint8Array(buf));      // 兜底：自带 UTF-8 解码，不依赖宿主 Web API
        }
        asset.resolved.animPath = cands[i];
        return text;
      } catch (e) { errs.push(cands[i] + ' → ' + e.message); }
    }
    throw new Error('动作 json 读取失败: ' + errs.join(' | '));
  }

  /** 固定机位包围盒：取 4 个相位的并集（render.mjs 的"固定机位"同口径，避免某帧伸出被裁）。 */
  function measureAnimatedBounds(model, anim, bound, pose) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const times = [0, anim.duration * 0.25, anim.duration * 0.5, anim.duration * 0.75];
    const vcount = model.account.vertexCount;
    for (let ti = 0; ti < times.length; ti++) {
      animLoader.sampleToPalette(anim, bound, model, pose, times[ti]);
      for (let v = 0; v < vcount; v++) {
        let x = 0, y = 0, z = 0;
        for (let k = 0; k < 4; k++) {
          const w = model.weights[v * 4 + k];
          if (!w) continue;
          const m = pose.paletteV[model.jointIndices[v * 4 + k]];
          const px = model.positions[v * 3], py = model.positions[v * 3 + 1], pz = model.positions[v * 3 + 2];
          x += w * (m[0] * px + m[4] * py + m[8] * pz + m[12]);
          y += w * (m[1] * px + m[5] * py + m[9] * pz + m[13]);
          z += w * (m[2] * px + m[6] * py + m[10] * pz + m[14]);
        }
        if (x < mn[0]) mn[0] = x; if (x > mx[0]) mx[0] = x;
        if (y < mn[1]) mn[1] = y; if (y > mx[1]) mx[1] = y;
        if (z < mn[2]) mn[2] = z; if (z > mx[2]) mx[2] = z;
      }
    }
    return { min: mn, max: mx, height: mx[1] - mn[1], width: mx[0] - mn[0], depth: mx[2] - mn[2], source: 'animated-union-4-phases' };
  }

  // ── A1-04 / A1-05 ─────────────────────────────────────────────────────

  function modelReadbackCheck(state, gl, posed, offscreen) {
    const W = offscreen.width, H = offscreen.height;
    const scale = Math.min(H * 0.55 / posed.bounds.height, W * 0.5 / Math.max(posed.bounds.width, 1e-3));
    const unit = makeUnit(posed, 0, W / 2, H * 0.92, scale);
    const region = padRegion(unit.screenRect, W, H, 24);
    posed.renderer.resetCounters();
    const digests = [];
    let last = null;
    for (let f = 0; f < 2; f++) {                       // 连续两帧（A1 允许 readPixels；A2 循环严禁）
      animLoader.sampleToPalette(posed.anim, posed.bound, posed.model, unit.pose, 0.25 + f * (1 / 60));
      posed.renderer.beginFrame();
      posed.renderer.drawUnit(unit.pose.palette, unit.placement);
      posed.renderer.endFrame();
      last = readPixelsRegion(gl, region.x, region.y, region.w, region.h);
      digests.push(last.digest);
    }
    const glError = gl.getError();
    const bbox = pixelBBox(last.buf, region.w, region.h);
    const touchesEdge = bbox.w > 0 && (bbox.minX <= 0 || bbox.minY <= 0 || bbox.maxX >= region.w - 1 || bbox.maxY >= region.h - 1);
    const pass = last.nonTransparentPixels > 100 && bbox.w > 10 && bbox.h > 10 && digests[0] !== digests[1] && glError === gl.NO_ERROR;
    return {
      region: region, nonTransparentPixels: last.nonTransparentPixels, alphaMax: last.alphaMax,
      bboxW: bbox.w, bboxH: bbox.h, bbox: bbox, touchesReadRegionEdge: touchesEdge,
      digestFrameA: digests[0], digestFrameB: digests[1], framesDiffer: digests[0] !== digests[1],
      glError: glError, drawCalls: posed.renderer.counters.drawCalls, pass: pass,
      passDetail: { nonTransparentPixels: last.nonTransparentPixels, bboxW: bbox.w, bboxH: bbox.h, framesDiffer: digests[0] !== digests[1], glError: glError },
    };
  }

  /**
   * A1-05 合成校验。两块上下分置的校验色块（颜色由本次 nonce 派生）：
   * 既验"合成过去了"，也验没有上下颠倒；主画布回读不可用时记 visualProof=true，**不假写 PASS**。
   */
  async function compositeCheck(state, gl, offscreen, ctx2d, posed, W, H, nonce) {
    const block = skinningRenderer.createSolidBlockRenderer(gl);
    const h = math.hash32(nonce);
    const topColor = channels(h, 0), bottomColor = channels(h, 8);
    // 校验块位置要避开 HUD 文字面板与「复制结果」按钮 —— visualProof 兜底时人要能看见这两块
    const topY = Math.min(Math.round(H * 0.75), hudPanelHeight(state) + 16);
    const rectTop = [16, topY, 48, 48];
    const rectBottom = [W - 72, H - 72, 48, 48];

    gl.viewport(0, 0, offscreen.width, offscreen.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (posed) {
      const scale = Math.min(H * 0.5 / posed.bounds.height, W * 0.45 / Math.max(posed.bounds.width, 1e-3));
      const unit = makeUnit(posed, 0, W / 2, H * 0.9, scale);
      animLoader.sampleToPalette(posed.anim, posed.bound, posed.model, unit.pose, 1.0);
      posed.renderer.beginFrame();
      posed.renderer.drawUnit(unit.pose.palette, unit.placement);
      posed.renderer.endFrame();
    }
    skinningRenderer.drawSolidBlock(gl, block, rectTop, topColor, offscreen.width, offscreen.height);
    skinningRenderer.drawSolidBlock(gl, block, rectBottom, bottomColor, offscreen.width, offscreen.height);
    const glError = gl.getError();

    let drawImageError = null;
    try { ctx2d.drawImage(offscreen, 0, 0); } catch (e) { drawImageError = e.message; }
    const out = {
      proof: null, glError: glError, drawImageError: drawImageError, nonce: nonce,
      expectedTop: topColor.map(function (v) { return +(v * 255).toFixed(0); }),
      expectedBottom: bottomColor.map(function (v) { return +(v * 255).toFixed(0); }),
      topRect: rectTop, bottomRect: rectBottom, readback: null, visualProof: false, pass: null,
      note: '两块色块上下分置：既验"合成过去了"，也验没有上下颠倒；色值由本次 nonce 派生',
    };
    if (drawImageError) { out.proof = 'fail'; out.reason = 'drawImage 抛错: ' + drawImageError; return out; }
    try {
      const a = read2dBlock(ctx2d, rectTop), b = read2dBlock(ctx2d, rectBottom);
      out.readback = { top: a, bottom: b };
      const okTop = colorClose(a.mean, topColor, 6), okBottom = colorClose(b.mean, bottomColor, 6);
      const opaque = a.mean[3] > 200 && b.mean[3] > 200;
      out.pass = okTop && okBottom && opaque;
      out.proof = 'readback';
      if (!out.pass) out.reason = '主画布回读颜色不符（合成失败或上下颠倒）：okTop=' + okTop + ' okBottom=' + okBottom + ' opaque=' + opaque;
      return out;
    } catch (e) {
      out.visualProof = true; out.proof = 'visualProof'; out.pass = null;
      out.reason = '主画布 getImageData 不可用: ' + e.message + ' ⇒ 需截图 + 屏上 nonce 人眼确认';
      return out;
    }
  }

  function read2dBlock(ctx2d, rect) {
    const d = ctx2d.getImageData(rect[0] + rect[2] / 2 - 2, rect[1] + rect[3] / 2 - 2, 4, 4);
    let r = 0, g = 0, b = 0, a = 0;
    const n = d.data.length / 4;
    for (let i = 0; i < n; i++) { r += d.data[i * 4]; g += d.data[i * 4 + 1]; b += d.data[i * 4 + 2]; a += d.data[i * 4 + 3]; }
    return { mean: [r / n, g / n, b / n, a / n], n: n };
  }

  function colorClose(got, want, tol) {
    return Math.abs(got[0] - want[0] * 255) <= tol && Math.abs(got[1] - want[1] * 255) <= tol && Math.abs(got[2] - want[2] * 255) <= tol;
  }

  function channels(h, shift) {
    return [64 + ((h >>> shift) & 63), 64 + ((h >>> (shift + 6)) & 63), 64 + ((h >>> (shift + 12)) & 63)].map(function (v) { return v / 255; });
  }

  function newNonce() {
    return (Date.now() % 1679616).toString(36) + Math.floor(Math.random() * 1679616).toString(36);
  }

  // ── 主画布 WebGL2 正控模式（§4.3） ──────────────────────────────────────

  async function runMainCanvasControl(state, info) {
    const a1 = { assertions: [], errors: [], mode: 'maincontrol', nonce: newNonce() };
    state.a1 = a1;
    state.ctx2d = null;
    const screenCanvas = state.screenCanvas;
    let gl = null;
    try { gl = screenCanvas.getContext('webgl2', ATTRS); } catch (e) { a1.errors.push(String(e.message)); }
    let control = 'FAIL';
    const detail = {};
    if (gl) {
      state.gl = gl;
      const gpu = queryGpuInfo(gl);
      detail.maxVertexUniformVectors = gpu.maxVertexUniformVectors;
      detail.renderer = gpu.renderer;
      detail.contextLost = gl.isContextLost();
      try {
        const tri = skinningRenderer.createMinimalTriangleProgram(gl);
        gl.viewport(0, 0, screenCanvas.width, screenCanvas.height);
        gl.clearColor(0.05, 0.06, 0.09, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        skinningRenderer.drawMinimalTriangle(gl, tri);
        const rb = readPixelsRegion(gl, Math.floor(screenCanvas.width / 2) - 2, Math.floor(screenCanvas.height / 2) - 2, 4, 4);
        const err = gl.getError();
        control = (rb.nonClearPixels > 0 && err === gl.NO_ERROR) ? 'PASS' : 'FAIL';
        detail.readback = { nonClearPixels: rb.nonClearPixels, glError: err };
      } catch (e) { detail.error = e.message; }
    } else {
      detail.reason = '屏幕画布 getContext("webgl2") 返回 null';
    }
    a1.mainCanvasWebgl2Control = control;
    a1.mainCanvasControlDetail = detail;
    a1.webgl2Context = !!gl;
    a1.maxVertexUniformVectors = detail.maxVertexUniformVectors === undefined ? null : detail.maxVertexUniformVectors;
    a1.offscreenFailed = null;
    a1.devicePassCandidate = false;
    a1.allAssertionsPass = null;
    a1.sdkVersionApplicable = !state.isBrowser;
    a1.sdkVersionOk = !state.isBrowser;
    a1.compositeProof = 'not-run';
    a1.note = '主画布正控模式：用于区分"离屏专属失败"与"设备无 WebGL2"，本模式自身不出 A1/A2 判定（方案 §4.3）';
    a1.webgl1Diagnostic = gl ? null : diagnoseWebgl1(state.platform, state.W, state.H);
    await capture(state, 'maincontrol');
    return a1;
  }

  // ── A1-06 冷启动历史 ──────────────────────────────────────────────────

  function buildDeviceInfo(state, info) {
    const gpu = state.gl ? queryGpuInfo(state.gl) : null;
    return {
      brand: info.brand, model: info.model, system: info.system,
      platform: state.isBrowser ? 'browser' : info.platform,
      SDKVersion: info.SDKVersion === undefined ? null : info.SDKVersion,
      benchmarkLevel: info.benchmarkLevel === undefined ? null : info.benchmarkLevel,
      pixelRatio: info.pixelRatio,
      screenWidth: info.screenWidth, screenHeight: info.screenHeight,
      windowWidth: info.windowWidth, windowHeight: info.windowHeight,
      renderer: gpu ? gpu.renderer : '', vendor: gpu ? gpu.vendor : '',
      unmaskedRenderer: gpu ? gpu.unmaskedRenderer : null, unmaskedVendor: gpu ? gpu.unmaskedVendor : null,
      glVersion: gpu ? gpu.version : '', glslVersion: gpu ? gpu.shadingLanguageVersion : '',
      maxTextureSize: gpu ? gpu.maxTextureSize : null, maxVertexAttribs: gpu ? gpu.maxVertexAttribs : null,
    };
  }

  /** A1-06 冷启动历史：peek 取本次 runIndex（供截图命名用），commit 在 A1 全跑完后落库。 */
  function coldRunKey(state, info) { return result.deviceHashOf(buildDeviceInfo(state, info)); }

  function peekColdRun(platform, hash) {
    let hist = platform.getStorage(STORAGE_COLD);
    if (!Array.isArray(hist)) hist = [];
    hist = hist.filter(function (x) { return x && x.deviceHash === hash; }).slice(-COLD_RUNS_REQUIRED);
    if (hist.length >= COLD_RUNS_REQUIRED) hist = [];                 // 满 3 次 ⇒ 开新一组
    return { hist: hist, runIndex: hist.length + 1, hash: hash };
  }

  function commitColdRun(state, platform, info, a1, peek, thisRunOk) {
    const hist = peek.hist.concat([{
      index: peek.runIndex, ts: Date.now(), deviceHash: peek.hash, a1Ok: thisRunOk === true,
      sdkVersion: info.SDKVersion === undefined ? null : info.SDKVersion,
      assertionsPass: a1.assertions.filter(function (x) { return x.pass; }).length,
      assertionsTotal: a1.assertions.length,
    }]);
    platform.setStorage(STORAGE_COLD, hist);
    state.coldRuns = hist;
    a1.coldRunIndex = peek.runIndex;
    a1.coldRunsTotal = hist.length;
    a1.coldRunsGreen = hist.filter(function (x) { return x.a1Ok; }).length;
    a1.coldRunsRequired = COLD_RUNS_REQUIRED;
    a1.coldRunDetail = hist.map(function (x) { return { index: x.index, a1Ok: x.a1Ok, ts: x.ts, assertionsPass: x.assertionsPass, assertionsTotal: x.assertionsTotal }; });
    a1.coldRunNote = 'Device-PASS 需"完全杀微信/重新扫码"连续 ' + COLD_RUNS_REQUIRED + ' 次全绿（方案 §4.2 A1-06）；浏览器端由测试 harness 连续 ' + COLD_RUNS_REQUIRED + ' 次加载等价模拟';
    return hist.length >= COLD_RUNS_REQUIRED && a1.coldRunsGreen === COLD_RUNS_REQUIRED;
  }

  // ── A2 采样 ───────────────────────────────────────────────────────────

  async function sampleLevel(state, posed, plan, profile, a1) {
    const W = state.W, H = state.H;
    const units = buildUnits(posed, plan.u, W, H);
    state.units = units;
    state.unitCount = plan.u;
    const sampler = metrics.createSampler(plan.u, plan.sec);
    sampler.requiredMinSamples = profile.minSamples;
    const ctx = {
      state: state, platform: state.platform, posed: posed, units: units, ctx2d: state.ctx2d,
      gl: state.gl, glCanvas: state.glCanvas, W: W, H: H, sampler: sampler, unitCount: plan.u,
      nonce: a1.nonce, hud: buildHudBase(state, plan.u, null),
    };
    const gpuTimer = createGpuTimer(state.gl);

    // 像素级可见性/覆盖率校验（在采样窗口**之外**跑一次；它是"丝带 bug"的唯一有效防线 ——
    // 解析式包围盒在整块网格被深度裁剪成薄片时照样报 allUnitsOnScreen=true）
    const coverage = pixelCoverageCheck(state, posed, units, plan.u);
    const vis = visibility(units, W, H);

    state.phase = 'a2:' + plan.u + ':warmup';
    publish(state);
    await runFrames(ctx, profile.warmupSec, false, gpuTimer);

    // 记录阶段：清资源计数，但**复用** GPU buffer/texture（禁重新解码模型污染稳态）
    posed.renderer.resetCounters();
    sampler.start(state.platform.now());
    state.phase = 'a2:' + plan.u;
    publish(state);
    await runFrames(ctx, plan.sec, true, gpuTimer);

    const rec = sampler.summarize({ gpuMsSource: gpuTimer.available ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query_webgl2-unavailable' });
    const frames = Math.max(1, posed.renderer.counters.frames);
    rec.drawCallsPerFrame = +(posed.renderer.counters.drawCalls / frames).toFixed(3);
    rec.skinPalettesPerFrame = +(posed.renderer.counters.paletteUploads / frames).toFixed(3);
    rec.contextLostCount = state.contextLostCount || 0;
    rec.glErrorCount = state.glErrorCount || 0;
    rec.glErrorProbeHz = GL_ERROR_PROBE_HZ;
    rec.timerResolutionMs = a1.timerResolutionMs === undefined ? null : a1.timerResolutionMs;
    rec.visibleUnitCount = vis.visible;
    rec.unitsVisibleByPixels = coverage.unitsVisibleByPixels;
    rec.allUnitsOnScreen = vis.allInside && vis.noOverlap
      && (coverage.unsupported ? true : coverage.unitsVisibleByPixels === plan.u);
    if (coverage.unsupported) {
      rec.visibilityNote = '像素级可见性不可用（' + (coverage.error || 'readPixels unsupported') + '）⇒ 该档"全部可见"依据解析式包围盒 + A1 像素证据';
    }
    rec.visibility = vis;
    rec.pixelCoverage = coverage;
    rec.canvasPixels = [W, H];
    rec.unitScreenRects = units.map(function (u) { return roundRect(u.screenRect); });
    rec.a2Profile = state.profileName;
    rec.specProfile = state.profileName === 'spec';
    rec.profileNote = rec.specProfile
      ? '按方案 §5.1 原文口径：预热 ' + profile.warmupSec + 's、本档 ' + plan.sec + 's 且 ≥' + profile.minSamples + ' 帧'
      : '非方案口径的短采样（浏览器层"代码通不通"证据）：预热 ' + profile.warmupSec + 's、本档 ' + plan.sec + 's、≥' + profile.minSamples + ' 帧；此档数字**不作为容量结论**';
    rec.note = 'readPixels 不进 A2 循环（A1 专用）；GL error 以 ' + GL_ERROR_PROBE_HZ + 'Hz 采样以避免每帧强制同步';
    if (plan.u === 20) rec.capacity20 = metrics.judgeCapacity20(rec);
    return rec;
  }

  /** 一段连续 rAF 帧（warmup 与 record 走**同一条**代码路径，避免"预热与实测不同构"）。 */
  function runFrames(ctx, seconds, recording, gpuTimer) {
    return new Promise(function (resolve) {
      const p = ctx.platform, state = ctx.state, sampler = ctx.sampler;
      const t0 = p.now();
      let lastStart = t0;
      let lastErrProbeAt = -1e9;
      let lastHudAt = -1e9;
      const maxWallSec = recording ? seconds * 4 + 30 : seconds + 10;   // 防呆：慢到离谱时如实截断并记录

      function frame() {
        const tStart = p.now();
        const elapsed = (tStart - t0) / 1000;
        if (recording) sampler.markFrameTime(tStart);

        // ① 动作采样 + 41 骨 world/skin 矩阵
        const js0 = p.now();
        for (let i = 0; i < ctx.units.length; i++) {
          const u = ctx.units[i];
          animLoader.sampleToPalette(ctx.posed.anim, ctx.posed.bound, ctx.posed.model, u.pose,
            (elapsed + u.phaseOffset) % ctx.posed.anim.duration);
        }
        const jsMs = p.now() - js0;

        // ② GL 提交：每单位 1 次整块 palette 上传 + 1 次 drawElements
        let glMs = 0;
        if (gpuTimer.available) gpuTimer.begin();
        const gl0 = p.now();
        ctx.posed.renderer.beginFrame();
        for (let i = 0; i < ctx.units.length; i++) ctx.posed.renderer.drawUnit(ctx.units[i].pose.palette, ctx.units[i].placement);
        ctx.posed.renderer.endFrame();
        glMs = p.now() - gl0;
        if (gpuTimer.available) gpuTimer.end();

        // ③ 2D：背景 → drawImage 合成 → 文字
        const d0 = p.now();
        drawBackground(ctx.ctx2d, ctx.W, ctx.H);
        ctx.ctx2d.drawImage(ctx.glCanvas, 0, 0);
        const compositeMs = p.now() - d0;
        const d1 = p.now();
        drawHud(ctx.ctx2d, ctx.W, ctx.H, ctx.hud);
        const hudMs = p.now() - d1;

        const wall = tStart - lastStart;
        lastStart = tStart;

        if (tStart - lastErrProbeAt >= 1000 / GL_ERROR_PROBE_HZ) {
          lastErrProbeAt = tStart;
          try { if (ctx.gl.getError() !== ctx.gl.NO_ERROR) state.glErrorCount++; } catch (e) { /* ignore */ }
        }
        if (tStart - lastHudAt >= 500) {
          lastHudAt = tStart;
          const rolling = sampler.rollingFps();
          ctx.hud = buildHudBase(state, ctx.unitCount, rolling);
          state.hud = ctx.hud;                       // 触摸命中用同一份几何
        }

        if (recording) {
          sampler.push({ wall: wall, js: jsMs, submit: glMs, composite: compositeMs, twoDTotal: compositeMs + hudMs, gpu: gpuTimer.latest() });
          if (gpuTimer.available) gpuTimer.poll();
          if (sampler.isDone()) { resolve(); return; }
          if (sampler.elapsedSec > maxWallSec) {
            sampler.truncated = true;
            sampler.truncateReason = '采样墙钟超 ' + maxWallSec.toFixed(0) + 's（规定 ' + seconds + 's / ≥' + sampler.requiredMinSamples + ' 帧）仍未同时满足 ⇒ 如实截断，该档判 FAIL 原因之一';
            resolve(); return;
          }
        } else if (elapsed >= seconds) { resolve(); return; }
        p.requestAnimationFrame(frame);
      }
      p.requestAnimationFrame(frame);
    });
  }

  /** GPU 时间：只有 EXT_disjoint_timer_query_webgl2 真可用才填；否则 null（禁 performance.now 冒充）。 */
  function createGpuTimer(gl) {
    const off = { available: false, begin: function () {}, end: function () {}, poll: function () {}, latest: function () { return null; } };
    let ext = null;
    try { ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch (e) { ext = null; }
    // 该扩展在小游戏侧可能只"看起来存在"而缺常量/查询入口 —— 任何一步不成立就如实退回 unavailable
    if (!ext || typeof gl.createQuery !== 'function' || typeof gl.beginQuery !== 'function'
      || gl.QUERY_RESULT_AVAILABLE === undefined || gl.QUERY_RESULT === undefined) return off;
    const TIME_ELAPSED = gl.TIME_ELAPSED_EXT === undefined ? ext.TIME_ELAPSED_EXT : gl.TIME_ELAPSED_EXT;
    if (TIME_ELAPSED === undefined) return off;
    const pending = [];
    let last = null, current = null;
    return {
      available: true,
      begin: function () {
        try { current = gl.createQuery(); gl.beginQuery(TIME_ELAPSED, current); } catch (e) { current = null; }
      },
      end: function () {
        try {
          if (!current) return;
          gl.endQuery(TIME_ELAPSED);
          pending.push(current);
          current = null;
          this.poll();
        } catch (e) { current = null; }
      },
      poll: function () {
        try {
          while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
            const q = pending.shift();
            const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
            if (!disjoint) last = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
            gl.deleteQuery(q);
          }
          while (pending.length > 4) gl.deleteQuery(pending.shift());
        } catch (e) { /* 查询失败即放弃本轮 GPU 时间，不写假值 */ }
      },
      latest: function () { return last; },
    };
  }

  function buildUnits(posed, n, W, H) {
    const layout = layoutUnits(n, W, H, posed.bounds);
    const units = [];
    for (let i = 0; i < n; i++) units.push(makeUnit(posed, i, layout.cells[i].cx, layout.cells[i].feetY, layout.scale, layout));
    return units;
  }

  function makeUnit(posed, i, cx, feetY, scale) {
    const placement = math.mat4();
    math.placement(placement, cx, feetY, scale);
    const b = posed.bounds;
    return {
      index: i, pose: animLoader.createPose(posed.model), placement: placement,
      phaseOffset: i * PHASE_STEP_SEC,
      screenRect: { x0: cx + scale * b.min[0], x1: cx + scale * b.max[0], y0: feetY - scale * b.max[1], y1: feetY - scale * b.min[1] },
    };
  }

  /** 网格摆放：cols = ceil(sqrt(n))；按格子高度适配（禁重叠、禁出屏）。 */
  function layoutUnits(n, W, H, bounds) {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cellW = W / cols, cellH = H / rows;
    const scale = Math.min(cellH * 0.82 / bounds.height, cellW * 0.9 / Math.max(bounds.width, 1e-3));
    const cells = [];
    for (let i = 0; i < n; i++) {
      cells.push({ cx: cellW * ((i % cols) + 0.5), feetY: cellH * (Math.floor(i / cols) + 0.92) });
    }
    return { cols: cols, rows: rows, cellW: cellW, cellH: cellH, scale: scale, cells: cells };
  }

  /** 程序化可见性：全部落在画布内 + 两两不重叠（替代人眼"看起来都在"）。 */
  function visibility(units, W, H) {    const rects = units.map(function (u) { return u.screenRect; });
    let visible = 0;
    rects.forEach(function (r) {
      if (r.x0 >= 0 && r.y0 >= 0 && r.x1 <= W && r.y1 <= H && (r.x1 - r.x0) > 2 && (r.y1 - r.y0) > 2) visible++;
    });
    let overlap = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) overlap++;
      }
    }
    return { visible: visible, total: units.length, allInside: visible === units.length, overlapPairs: overlap, noOverlap: overlap === 0 };
  }

  // ── 屏幕绘制 ──────────────────────────────────────────────────────────

  /**
   * 像素级覆盖率/逐单位可见性：画一帧 → 整幅 readPixels → 数 alpha>0。
   * 只做一次、且在采样窗口之外（readPixels 会强制同步，严禁进 A2 循环）。
   */
  function pixelCoverageCheck(state, posed, units, unitCount) {
    try {
      return pixelCoverageCheckInner(state, posed, units, unitCount);
    } catch (e) {
      // 自证项：引擎不支持整幅 readPixels 时**不中断 A2**，如实标注并回落到解析式可见性
      return {
        unitCount: unitCount, unsupported: true, error: (e && e.message) || String(e),
        unitsVisibleByPixels: null, fillRatio: null, coveredPixels: null,
        note: '整幅 readPixels 在本平台不可用 ⇒ 覆盖率/逐单位像素可见性记 unsupported，回落解析式包围盒（方案 §5.3 的像素证据仍以 A1-03/04/05 为准）',
      };
    }
  }

  function pixelCoverageCheckInner(state, posed, units, unitCount) {
    const gl = state.gl, canvas = state.glCanvas, W = canvas.width, H = canvas.height;
    posed.renderer.resetCounters();
    // ★ 必须先采样：createPose 出来的 palette 是**全零**，直接画会把整块网格塌到原点
    for (let i = 0; i < units.length; i++) {
      animLoader.sampleToPalette(posed.anim, posed.bound, posed.model, units[i].pose, units[i].phaseOffset % posed.anim.duration);
    }
    posed.renderer.beginFrame();
    for (let i = 0; i < units.length; i++) posed.renderer.drawUnit(units[i].pose.palette, units[i].placement);
    posed.renderer.endFrame();
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const glError = gl.getError();
    let covered = 0;
    for (let i = 0; i < W * H; i++) if (buf[i * 4 + 3] > 0) covered++;
    // 逐单位：在各自的屏幕矩形内数非透明像素（GL 原点左下，需要翻 y）
    let unitsVisible = 0;
    const perUnit = [];
    for (let i = 0; i < units.length; i++) {
      const r = units[i].screenRect;
      const x0 = Math.max(0, Math.floor(r.x0)), x1 = Math.min(W, Math.ceil(r.x1));
      const gy0 = Math.max(0, Math.floor(H - r.y1)), gy1 = Math.min(H, Math.ceil(H - r.y0));
      let n = 0;
      for (let y = gy0; y < gy1; y++) {
        for (let x = x0; x < x1; x++) if (buf[(y * W + x) * 4 + 3] > 0) n++;
      }
      const area = Math.max(1, (x1 - x0) * (gy1 - gy0));
      perUnit.push({ index: i, pixels: n, area: area, fill: +(n / area).toFixed(4) });
      if (n >= 50) unitsVisible++;
    }
    let analyticArea = 0;
    for (let i = 0; i < units.length; i++) {
      const r = units[i].screenRect;
      analyticArea += Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
    }
    return {
      unitCount: unitCount, canvasPixels: [W, H],
      coveredPixels: covered,
      analyticAreaPixels: Math.round(analyticArea),
      fillRatio: +(covered / Math.max(1, analyticArea)).toFixed(4),
      unitsVisibleByPixels: unitsVisible,
      minUnitFill: perUnit.reduce(function (m, p) { return Math.min(m, p.fill); }, 1),
      perUnit: perUnit.length <= 25 ? perUnit : perUnit.slice(0, 25),
      glError: glError,
      note: '整幅 readPixels 只在采样窗口外做一次；fillRatio 远低于 ~0.2 说明网格被裁剪/塌缩（"丝带"缺陷的特征）',
    };
  }

  function drawBackground(ctx2d, W, H) {
    const cell = 24;
    ctx2d.fillStyle = '#0d1016';
    ctx2d.fillRect(0, 0, W, H);
    ctx2d.fillStyle = '#131822';
    for (let y = 0; y < H; y += cell) {
      for (let x = 0; x < W; x += cell) {
        if (((x / cell) + (y / cell)) % 2 === 0) ctx2d.fillRect(x, y, cell, cell);
      }
    }
    ctx2d.fillStyle = '#1c2431';
    ctx2d.fillRect(0, H * 0.62, W, H * 0.38);
  }

  function hudFontSize(W) { return Math.max(11, Math.round(W * 0.036)); }

  /**
   * HUD 上的 device 判定短名（JSON 里仍写完整枚举 —— 屏上是给人一眼读的：
   * 真机 1080px 宽的 backbuffer 上，完整枚举 DEVICE_A1_PASS_COLD_INCOMPLETE 会超出屏宽被截）。
   */
  function shortDeviceVerdict(r) {
    const d = r.verdict.device;
    const a1 = r.a1 || {};
    if (d === 'DEVICE_A1_PASS_COLD_INCOMPLETE' || d === 'BROWSER_SHIM_A1_PASS_COLD_INCOMPLETE') {
      return 'A1 全过·冷启动 ' + (a1.coldRunsTotal || 0) + '/' + (a1.coldRunsRequired || COLD_RUNS_REQUIRED) + ' 未满（非失败，继续冷启动）';
    }
    if (d === 'DEVICE_PASS') return 'Device-PASS（单机事实，Architecture 待主架构）';
    if (d === 'DEVICE_FAIL') return 'DEVICE_FAIL';
    if (d === 'UNSUPPORTED') return 'UNSUPPORTED（SDK < ' + MIN_SDK + '）';
    if (d === 'BROWSER_SHIM_PASS') return '浏览器层 PASS（非设备证据）';
    if (d === 'BROWSER_SHIM_FAIL') return '浏览器层 FAIL';
    if (d === 'NOT_APPLICABLE') return 'N/A（正控模式不出判定）';
    return String(d);
  }

  /** HUD 文字面板高度（7 行口径）—— A1-05 校验块要避开它。 */
  function hudPanelHeight(state) {
    const fs = hudFontSize(state.W || 360);
    return Math.round(fs * 1.45 * 7 + (state.W || 360) * 0.03);
  }

  function buildHudBase(state, unitCount, rollingFps) {
    const info = state.info || {};
    const a1 = state.a1 || { assertions: [] };
    const lines = [];
    lines.push('T31 S0 · ' + (state.isBrowser ? 'BROWSER(shim)' : 'WX ' + info.platform) + ' · ' + trunc(info.brand + '/' + info.model, 20));
    lines.push('SDK ' + (info.SDKVersion === undefined ? '(无)' : info.SDKVersion) + ' · dpr ' + info.pixelRatio + ' · bb ' + state.W + 'x' + state.H);
    lines.push('A1 ' + (a1.assertions.length ? a1.assertions.filter(function (x) { return x.pass; }).length + '/' + a1.assertions.length : '-')
      + ' · webgl2 ' + (a1.webgl2Context ? 'OK' : 'NO') + ' · UV ' + (a1.maxVertexUniformVectors === null ? '-' : a1.maxVertexUniformVectors)
      + ' · 冷启动 ' + (a1.coldRunIndex ? a1.coldRunIndex + '/' + COLD_RUNS_REQUIRED : '-'));
    lines.push('档位 ' + unitCount + ' · 实时FPS ' + (rollingFps === null || rollingFps === undefined ? '-' : rollingFps.toFixed(1)) + ' · GLerr ' + state.glErrorCount + ' · ctxLost ' + state.contextLostCount);
    lines.push('nonce ' + ((state.a1 && state.a1.nonce) || '-') + ' · ' + state.phase);
    const done = state.a2.length;
    lines.push('A2 ' + done + '/' + state.profile.plan.length + ' 档' + (state.a2.length ? ' · 末档 FPS ' + state.a2[state.a2.length - 1].fpsMedian : ''));
    if (state.result) lines.push('20u ' + state.result.verdict.capacity20 + ' · ' + shortDeviceVerdict(state.result));
    else lines.push('verdict 待出' + (state.error ? ' · ERROR ' + trunc(state.error, 30) : ''));
    // toast（结果回收按钮的成败反馈）跟随 HUD 一起画：20s 内可见
    if (state.toast && Date.now() - state.toast.at < 20000) lines.push('▶ ' + state.toast.text);
    const fs = hudFontSize(state.W), lh = fs * 1.45, pad = Math.round(state.W * 0.03);
    const boxH = lh * lines.length + pad;
    // 结果回收四路兜底：只在**结果已产出**后出现（真机实测踩过"点复制没反应、也不知道为什么"）
    const buttons = [];
    if (state.result) {
      buttons.push({ id: 'copy', label: '复制结果' });
      buttons.push({ id: 'share', label: '分享结果' });
      buttons.push({ id: 'view', label: '查看结果' });
      buttons.push({ id: 'rerun', label: state.a2Forced ? '压测常开·点关' : '重跑压测' });
      buttons.push({ id: 'mode', label: state.pendingMode === 'maincontrol' ? '已设正控·重启' : '切正控模式' });
    }
    // 每行 3 个
    const perRow = 3, gap = Math.round(state.W * 0.02), bh = Math.round(fs * 2.3);
    const bw = Math.floor((state.W - pad * 2 - gap * (perRow - 1)) / perRow);
    const rows = Math.ceil(buttons.length / perRow);
    const rowTop = Math.max(boxH + 6, state.H - (bh + gap) * rows - pad);
    for (let i = 0; i < buttons.length; i++) {
      const r = Math.floor(i / perRow), c = i % perRow;
      buttons[i].x = pad + c * (bw + gap);
      buttons[i].y = rowTop + r * (bh + gap);
      buttons[i].w = bw;
      buttons[i].h = bh;
      buttons[i].fs = fs;
    }
    return { lines: lines.map(function (t) { return { text: t }; }), buttons: buttons, fs: fs, lh: lh, pad: pad, boxH: boxH, rows: rows, rowTop: rowTop };
  }

  function drawHud(ctx2d, W, H, hud) {
    if (!hud || !hud.lines || !hud.lines.length) return;
    const fs = hud.fs || hudFontSize(W), lh = hud.lh || fs * 1.45, pad = hud.pad || Math.round(W * 0.03);
    ctx2d.font = 'bold ' + fs + 'px ' + HUD_FONT;
    ctx2d.textBaseline = 'top';
    ctx2d.fillStyle = 'rgba(4,6,10,0.74)';
    ctx2d.fillRect(0, 0, W, hud.boxH);
    ctx2d.fillStyle = '#e8eef8';
    for (let i = 0; i < hud.lines.length; i++) ctx2d.fillText(hud.lines[i].text, pad, pad * 0.5 + i * lh);
    const buttons = hud.buttons || [];
    for (let k = 0; k < buttons.length; k++) {
      const b = buttons[k];
      const bfs = b.fs || fs;
      ctx2d.font = 'bold ' + bfs + 'px ' + HUD_FONT;
      ctx2d.fillStyle = b.active ? '#2f6f4f' : '#22303f';
      ctx2d.fillRect(b.x, b.y, b.w, b.h);
      ctx2d.strokeStyle = '#5c7fa3'; ctx2d.lineWidth = 2;
      ctx2d.strokeRect(b.x, b.y, b.w, b.h);
      ctx2d.fillStyle = '#dbe7f5';
      const tw = ctx2d.measureText(b.label).width;
      ctx2d.fillText(b.label, b.x + Math.max(6, (b.w - tw) / 2), b.y + (b.h - bfs) / 2);
      b.active = false;
    }
    if (hud.buttons && hud.buttons.length) ctx2d.font = 'bold ' + fs + 'px ' + HUD_FONT;
  }

  // ══ 结果回收四路兜底（真机实测：A2 全绿但「复制结果」拿不到内容）══════════════
  //   ① 复制按钮可观测（成功/失败+原因，屏上 + console 单行）
  //   ② 分享结果文件（wx.shareFileMessage → 直接发到聊天/文件传输助手）
  //   ③ 屏上分页查看（逐页截图回收；第 1 页 = 人读摘要，后续页 = 原始 JSON 分片）
  //   ④ 重跑压测（强制 a2=run 并重启，绕开"冷启动满 3 次后 A2 不再自动跑"）

  const VIEWER_CHARS_PER_PAGE = 1200;

  function setToast(state, text, channel) {
    state.toast = { text: text, at: Date.now() };
    if (channel) {
      const line = channel.key + '=' + JSON.stringify(channel.payload);
      try { if (typeof console !== 'undefined' && console.log) console.log(line); } catch (e) { /* ignore */ }
    }
    renderScreen(state, null);
  }

  async function copyResultQuiet(state) {
    if (!state.result) { setToast(state, '复制：无结果可复制（等 A1 跑完）'); return false; }
    const text = JSON.stringify(state.result);
    let ok = false, errMsg = null;
    try {
      // setClipboard 返回 {ok, errMsg}：**必须带原因**，否则真机"点了没反应"没法远程诊断
      const r = await state.platform.setClipboard(text);
      ok = !!(r && r.ok);
      errMsg = (r && r.errMsg) || (ok ? null : 'setClipboardData 返回失败（无原因）');
    } catch (e) { errMsg = (e && e.message) || String(e); }
    state.lastCopyOk = ok;
    setToast(state, '复制：' + (ok ? '成功（' + text.length + ' 字符）' : '失败 · ' + errMsg), {
      key: '__PROBE_CLIPBOARD__',
      payload: { ok: ok, chars: text.length, errMsg: errMsg, at: Date.now(), platform: state.platform.kind },
    });
    return ok;
  }

  /** 兜底 A：把 probe-result.json 当**文件**分享出去（不依赖剪贴板）。 */
  async function shareResult(state) {
    const p = state.platform;
    if (!state.result) { setToast(state, '分享：无结果可分享'); return false; }
    if (typeof p.shareFile !== 'function') {
      setToast(state, '分享：该宿主不支持（无 wx.shareFileMessage）', { key: '__PROBE_SHARE__', payload: { ok: false, errMsg: 'shareFileMessage-unsupported' } });
      return false;
    }
    // 文件名按方案 §8 口径：probe_<deviceHash>_run<n>.json
    const d = state.result.device || {};
    const run = (state.result.a1 && state.result.a1.coldRunIndex) || 0;
    const fileName = 'probe_' + (d.deviceHash || 'nodev') + '_run' + run + '.json';
    const text = JSON.stringify(state.result);
    const path = p.writeUserFile('probe-result.json', JSON.stringify(state.result, null, 1)) || p.writeUserFile(fileName, text);
    let ok = false, errMsg = null;
    try {
      const r = await p.shareFile(path, fileName);
      ok = !!(r && r.ok); errMsg = (r && r.errMsg) || null;
    } catch (e) { errMsg = (e && e.message) || String(e); }
    setToast(state, '分享：' + (ok ? '已调起（' + fileName + '）' : '失败 · ' + errMsg), {
      key: '__PROBE_SHARE__',
      payload: { ok: ok, fileName: fileName, filePath: path, errMsg: errMsg, at: Date.now() },
    });
    return ok;
  }

  /** 兜底 B：屏上分页查看结果（点右半下一页 / 左半上一页 / 点「返回」退出）。 */
  function openViewer(state) {
    if (!state.result) { setToast(state, '查看：无结果'); return; }
    state.viewer = { pages: buildViewerPages(state.result, state.a1 && state.a1.nonce), page: 0 };
    renderScreen(state, null);
  }

  function buildViewerPages(r, nonce) {
    const pages = [];
    // 第 1 页：人读摘要（Leo 逐页截图时，这一页就够回传关键结论）
    const a1 = r.a1 || {};
    const d = r.device || {};
    const digits = function (v) { return v === null || v === undefined ? 'n/a' : v; };
    const L = [];
    L.push('T31 S0 结果摘要（第 1 页＝人读版，后续页＝原始 JSON 分片）');
    L.push('nonce ' + (nonce || '-') + ' · runIndex ' + (a1.coldRunIndex || 0) + '/' + (a1.coldRunsRequired || 3)
      + ' · 冷启动绿 ' + digits(a1.coldRunsGreen) + '/' + digits(a1.coldRunsTotal));
    L.push('device ' + d.brand + '/' + d.model + ' · ' + d.platform + ' · SDK ' + digits(d.SDKVersion) + ' · dpr ' + d.pixelRatio);
    L.push('backbuffer ' + digits(r.canvas && (r.canvas.backbufferWidth + 'x' + r.canvas.backbufferHeight)) + ' · renderScale ' + digits(r.canvas && r.canvas.renderScale));
    L.push('renderer ' + (d.unmaskedRenderer || d.renderer || '-'));
    L.push('deviceHash ' + digits(d.deviceHash) + ' · modelSHA ' + String(r.modelSha256 || '').slice(0, 16) + '…');
    L.push('A1 ' + (a1.assertions || []).filter(function (x) { return x.pass; }).length + '/' + (a1.assertions || []).length
      + ' · webgl2 ' + (a1.webgl2Context ? 'OK' : 'NO') + ' · UV ' + digits(a1.maxVertexUniformVectors)
      + ' · composite ' + digits(a1.compositeProof) + ' · GLerr ' + digits((a1.assertions || []).length ? state0(a1) : '-'));
    (r.a2 || []).forEach(function (x) {
      L.push(x.unitCount + 'u fps ' + x.fpsMedian + ' p95 ' + x.frameMsP95 + ' p99 ' + x.frameMsP99
        + ' js ' + x.jsAnimMsMean + ' gl ' + x.glSubmitMsMean + ' 2d ' + x.compositeCpuMsMean
        + ' gpu ' + digits(x.gpuMs) + ' draw ' + x.drawCallsPerFrame + ' n ' + x.sampleCount);
    });
    if (!(r.a2 || []).length) L.push('A2 未跑：' + (r.env && r.env.a2Skipped ? r.env.a2Skipped : '-'));
    L.push('capacity20 ' + (r.verdict && r.verdict.capacity20) + ' (engine ' + digits(r.verdict && r.verdict.capacity20Engine) + ')');
    L.push('device ' + (r.verdict && r.verdict.device) + ' · architecture ' + (r.verdict && r.verdict.architecture));
    (r.notes || []).slice(0, 2).forEach(function (n) { L.push('note: ' + n); });
    pages.push(L.join('\n'));

    // 后续页：原始 JSON 分片（便于 PM 取完整证据）
    const json = JSON.stringify(r);
    for (let i = 0; i < json.length; i += VIEWER_CHARS_PER_PAGE) pages.push(json.slice(i, i + VIEWER_CHARS_PER_PAGE));
    return pages;
  }

  function state0(a1) {
    const gl = a1.assertions.filter(function (x) { return x.detail && x.detail.glError !== undefined; });
    return gl.length ? gl[0].detail.glError : 0;
  }

  function drawViewer(ctx2d, state) {
    const W = state.W, H = state.H, v = state.viewer;
    const pad = Math.round(W * 0.03), fs = Math.max(10, Math.round(W * 0.030));
    ctx2d.fillStyle = '#070a10';
    ctx2d.fillRect(0, 0, W, H);
    ctx2d.font = 'bold ' + fs + 'px ' + HUD_FONT;
    ctx2d.textBaseline = 'top';
    ctx2d.fillStyle = '#dfe8f5';
    const lines = wrapText(ctx2d, v.pages[v.page] || '', W - pad * 2);
    const lh = fs * 1.35;
    const maxLines = Math.floor((H - pad * 2 - fs * 4) / lh);
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) ctx2d.fillText(lines[i], pad, pad + i * lh);
    if (lines.length > maxLines) ctx2d.fillText('…（本页还有 ' + (lines.length - maxLines) + ' 行，见下一页）', pad, pad + maxLines * lh);
    // 页脚
    const footY = H - fs * 3;
    ctx2d.fillStyle = 'rgba(4,6,10,0.85)';
    ctx2d.fillRect(0, footY - fs * 0.4, W, H - footY + fs * 0.4);
    ctx2d.fillStyle = '#ffe9b8';
    ctx2d.fillText('第 ' + (v.page + 1) + '/' + v.pages.length + ' 页 · nonce ' + ((state.a1 && state.a1.nonce) || '-')
      + ' · 点右半下一页 / 左半上一页', pad, footY);
    const b = viewerBackButton(state);
    ctx2d.fillStyle = '#22303f'; ctx2d.fillRect(b.x, b.y, b.w, b.h);
    ctx2d.strokeStyle = '#5c7fa3'; ctx2d.lineWidth = 2; ctx2d.strokeRect(b.x, b.y, b.w, b.h);
    ctx2d.fillStyle = '#dbe7f5';
    ctx2d.fillText('返回', b.x + (b.w - ctx2d.measureText('返回').width) / 2, b.y + (b.h - fs * 1.35) / 2);
  }

  function viewerBackButton(state) {
    const fs = Math.max(10, Math.round(state.W * 0.030)), pad = Math.round(state.W * 0.03);
    const w = Math.round(state.W * 0.3), h = Math.round(fs * 2.1);
    return { x: state.W - pad - w, y: state.H - h - fs * 0.6, w: w, h: h };
  }

  /** 简单按测量宽度折行（含长 token 硬切）。 */
  function wrapText(ctx2d, text, maxWidth) {
    const out = [];
    const paras = String(text).split('\n');
    for (let p = 0; p < paras.length; p++) {
      let cur = '';
      const chars = paras[p];
      for (let i = 0; i < chars.length; i++) {
        const next = cur + chars[i];
        if (ctx2d.measureText(next).width > maxWidth && cur.length) { out.push(cur); cur = chars[i]; }
        else cur = next;
      }
      out.push(cur);
    }
    return out;
  }

  /** 兜底 C：强制 a2=run（压测常开）并重启 —— 解决"冷启动满 3 次后 A2 不再自动跑"。 */
  async function rerunA2(state) {
    const p = state.platform;
    const next = state.a2Forced ? 'auto' : 'run';
    p.setStorage(STORAGE_A2_MODE, next);
    state.a2Forced = next === 'run';
    state.pendingA2 = next;
    const restarted = p.restartApp();
    setToast(state, next === 'run'
      ? '重跑压测：已设「A2 每轮都跑」' + (restarted ? '，正在重启…' : '；请手动杀掉微信后重新扫码')
      : '已关「A2 每轮都跑」' + (restarted ? '，正在重启…' : '；请手动杀掉微信后重新扫码'));
  }

  /** 画整屏（背景 → 合成 → 文字）。A2 采样结束后调用，不在采样循环内。 */
  function renderScreen(state, currentRec) {
    const ctx2d = state.ctx2d;
    if (!ctx2d) return;
    if (state.viewer) { drawViewer(ctx2d, state); state.lastRenderAt = Date.now(); return; }   // 分页查看态
    if (state.a1) {
      const a1 = state.a1;
      a1.hudSnapshot = {
        at: Date.now(), phase: state.phase,
        lines: state.hud.lines ? state.hud.lines.map(function (l) { return l.text; }) : [],
        currentRecord: currentRec ? currentRec.unitCount : null,
      };
    }
    state.hud = buildHudBase(state, state.unitCount || 0, null);
    drawBackground(ctx2d, state.W, state.H);
    if (state.glCanvas && state.gl) {
      try { ctx2d.drawImage(state.glCanvas, 0, 0); } catch (e) { /* 合成失败已由 A1-05 记录 */ }
    }
    drawHud(ctx2d, state.W, state.H, state.hud);
    state.lastRenderAt = Date.now();
    if (!state.touchBound) {
      state.touchBound = true;
      state.platform.onTouchStart(function (x, y) {
        // ① 分页查看模式：右半下一页 / 左半上一页 / 「返回」退出
        if (state.viewer) {
          const b = viewerBackButton(state);
          if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { state.viewer = null; renderScreen(state, null); return; }
          const n = state.viewer.pages.length;
          state.viewer.page = (x > state.W / 2) ? Math.min(n - 1, state.viewer.page + 1) : Math.max(0, state.viewer.page - 1);
          renderScreen(state, null);
          return;
        }
        // ② 正常模式：按钮命中
        const bs = (state.hud && state.hud.buttons) || [];
        for (let k = 0; k < bs.length; k++) {
          const b = bs[k];
          if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
            if (b.id === 'copy') copyResultQuiet(state);
            else if (b.id === 'share') shareResult(state);
            else if (b.id === 'view') openViewer(state);
            else if (b.id === 'rerun') rerunA2(state);
            else if (b.id === 'mode') switchToControlMode(state);
            return;
          }
        }
      });
    }
  }

  /** 切到方案 §4.3 的主画布正控模式（写 storage + 尽力重启；重启不可用则提示手动杀进程重扫）。 */
  async function switchToControlMode(state) {
    const p = state.platform;
    const next = p.getStorage(STORAGE_MODE) === 'maincontrol' ? '' : 'maincontrol';
    p.setStorage(STORAGE_MODE, next);
    state.pendingMode = next;
    const restarted = p.restartApp();
    setToast(state, '已切换模式为 ' + (next || '离屏（默认）') + (restarted ? '，正在重启…' : '；请手动杀掉微信后重新扫码'));
    if (state.a1) {
      state.a1.modeSwitch = {
        requested: next || 'offscreen', restarted: !!restarted,
        note: restarted ? '已请求重启' : '该宿主不支持自动重启 ⇒ 请手动杀掉微信后重新扫码（模式已存 storage，下次启动生效）',
      };
    }
  }

  /**
   * 截图（方案 §8 命名）。截之前先把当前 GL 结果合成到主画布 —— 否则 A1 阶段的截图只有背景，
   * 等于交了一张没内容的图。合成这一步在采样窗口之外，不影响 A2 数字。
   */
  async function capture(state, tag) {
    const platform = state.platform;
    if (!state.screenCanvas || !platform.canvasToTempFilePath) return null;
    if (state.ctx2d && state.glCanvas && state.gl) {
      try { renderScreen(state, null); } catch (e) { /* 截图失败不阻断断言链 */ }
    }
    const name = screenshotName(state, tag);
    let path = null;
    try { path = await platform.canvasToTempFilePath(state.screenCanvas, name); } catch (e) { path = null; }
    const rec = { tag: tag, name: name, path: path, ok: !!path };
    state.screenshots.push(rec);
    return rec;
  }

  function screenshotName(state, tag) {
    const info = state.info || {};
    const d = buildDeviceInfo(state, info);
    const obj = { device: Object.assign({ deviceHash: result.deviceHashOf(d) }, d), a1: { coldRunIndex: (state.a1 && state.a1.coldRunIndex) || 0 } };
    return result.screenshotName(obj, 0, tag);
  }

  // ── 收尾：组装 + 导出 ─────────────────────────────────────────────────

  function finalize(state, a1) {
    const info = state.info || {};
    const device = buildDeviceInfo(state, info);
    device.deviceHash = result.deviceHashOf(device);
    const sdkCmp = math.compareSemver(device.SDKVersion, MIN_SDK);
    a1.sdkVersionApplicable = state.isBrowser ? false : (sdkCmp !== null);
    a1.sdkVersionOk = sdkCmp === null ? null : sdkCmp >= 0;
    a1.sdkVersionMin = MIN_SDK;
    a1.sdkVersionCompare = sdkCmp;
    a1.sdkVersionMethod = '整数分段语义版本比较（禁字符串字典序）；< ' + MIN_SDK + ' 直接 UNSUPPORTED，不参与 A 路线 PASS';
    a1.screenshots = state.screenshots;
    if (a1.sdkVersionApplicable && a1.sdkVersionOk === false) { a1.devicePassCandidate = false; }

    const gpu = state.gl ? queryGpuInfo(state.gl) : null;
    const obj = result.build({
      commitSha: state.commitSha,
      modelSha256: state.modelSha256,
      device: device,
      canvas: {
        backbufferWidth: state.glCanvas ? state.glCanvas.width : (state.screenCanvas ? state.screenCanvas.width : null),
        backbufferHeight: state.glCanvas ? state.glCanvas.height : (state.screenCanvas ? state.screenCanvas.height : null),
        screenCanvasWidth: state.screenCanvas ? state.screenCanvas.width : null,
        screenCanvasHeight: state.screenCanvas ? state.screenCanvas.height : null,
        requestedBackbuffer: [state.W, state.H],
        renderScale: 1,
        dprCappedAt: 3,
        contextAttributes: gpu ? gpu.contextAttributes : null,
        requestedContextAttributes: ATTRS,
      },
      a1: a1,
      a2: state.a2,
      coldRuns: state.coldRuns,
      env: {
        browser: state.isBrowser,
        a2Profile: state.profileName,
        a2SpecProfile: state.profileName === 'spec',
        a2Trigger: state.a2Trigger || null,
        a2Skipped: a1.a2Skipped || null,
        screenshots: state.screenshots,
        asset: a1.asset || null,
        modelByteLength: state.modelByteLength,
        modelSha256Source: state.modelSha256Source,
        modelAccountBaseline: MODEL_ACCOUNT,
        probe: 'proto/webgl2_probe',
        specCommit: SPEC_COMMIT,
        profileNote: state.profileName === 'spec'
          ? 'A2 按方案 §5.1 原文口径采样'
          : 'A2 为浏览器层短采样（仅证明代码路径通，四档出数）；容量结论必须用真机 spec 档数字',
      },
    });
    state.result = obj;
    state.phase = 'done';

    // ① console 单行 ② USER_DATA_PATH/probe-result.json
    const line = result.toConsoleLine(obj);
    try { if (typeof console !== 'undefined' && console.log) console.log(line); } catch (e) { /* ignore */ }
    state.resultPath = state.platform.writeUserFile('probe-result.json', JSON.stringify(obj, null, 1));
    renderScreen(state, null);
    publish(state);
    return obj;
  }

  // ── 微信端自动启动 ────────────────────────────────────────────────────
  // 浏览器里 wx 是 platform-browser 装的 shim（带 __pwProbeShim 标记）⇒ 不自动跑，
  // 由 browser/probe-browser.js 显式调 run()（这样浏览器端能注入平台/参数）。
  if (typeof wx !== 'undefined' && typeof wx.createCanvas === 'function' && !wx.__pwProbeShim
    && typeof module === 'object' && module.exports) {
    setTimeout(function () {
      run({}).catch(function (e) {
        try { if (console && console.error) console.error('__WEBGL2_PROBE_FATAL__=' + (e && e.message)); } catch (x) { /* ignore */ }
      });
    }, 0);
  }

  return run;
});
