/* character3d_runtime_demo bundle —— 由 proto/character3d_runtime_demo/build.mjs 生成，勿手改 */
(function () {
  var __mods = Object.create(null);
  function __def(id, fn) { __mods[id] = { fn: fn, exp: null }; }
  function __resolve(from, spec) {
    var dir = from.split("/").slice(0, -1);
    var parts = spec.split("/");
    var stack = dir.slice();
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === "." || p === "") continue;
      if (p === "..") stack.pop();
      else stack.push(p);
    }
    return stack.join("/");
  }
  function __req(from, spec) {
    var id = __resolve(from, spec);
    var m = __mods[id];
    if (!m) throw new Error("module not found: " + spec + " (from " + from + ")");
    if (m.exp === null) { m.exp = { exports: {} }; m.fn(function (s) { return __req(id, s); }, m.exp, m.exp.exports); }
    return m.exp.exports;
  }
  // ---- proto/character3d_runtime_demo/main ----
  __def("proto/character3d_runtime_demo/main", function (require, module, exports) {
"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const host_1 = require("./host");
const g = globalThis;
const handle = (0, host_1.startRuntimeDemo)((_a = g.__CHAR3D_DEMO_OPTS) !== null && _a !== void 0 ? _a : {});
g.__CHAR3D_DEMO = handle;

  });
  // ---- proto/character3d_runtime_demo/host ----
  __def("proto/character3d_runtime_demo/host", function (require, module, exports) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRuntimeDemo = startRuntimeDemo;
const character_3d_1 = require("../../config/character-3d");
const character_asset_loader_1 = require("../../net/character-asset-loader");
const renderer_1 = require("../../ui/character3d/renderer");
const pass_1 = require("../../ui/character3d/pass");
const glb_1 = require("../../ui/character3d/glb");
const animation_1 = require("../../ui/character3d/animation");
const host_runtime_1 = require("../battle_demo/host-runtime");
const E = __importStar(require("./evidence"));
const M = __importStar(require("./metrics"));
const S = __importStar(require("./scenarios"));
const adapter_local_1 = require("./adapter-local");
const hud_1 = require("./hud");
function resolveWx() {
    const g = globalThis.wx;
    if (g && g.env && typeof g.createCanvas === 'function')
        return g;
    if (typeof wx !== 'undefined')
        return wx;
    throw new Error('[host] 无 wx 全局：不是微信小游戏宿主');
}
const STORAGE_RUNS = 'char3d-runtime-runs-v1';
const STORAGE_PERF_ALWAYS = 'char3d-runtime-perf-mode';
const STORAGE_CDN_BASE = 'char3d-cdn-base';
const COLD_SERIES = E.RUNS_REQUIRED;
const PAGED_CHARS = 1200;
const CLOCK_PAUSE_MS = 300;
let clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
function nowMs() { return clock(); }
function requestFrame(cb) {
    if (typeof requestAnimationFrame === 'function')
        return requestAnimationFrame(cb);
    return setTimeout(() => cb(nowMs()), 16);
}
function cancelFrame(id) {
    if (typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(id);
    else
        clearTimeout(id);
}
function createTimingRenderer(real, sink) {
    return {
        get canvas() { return real.canvas; },
        get status() { return real.status; },
        get edgeMode() { return real.edgeMode; },
        get jointCount() { return real.jointCount; },
        get vertexCount() { return real.vertexCount; },
        get indexCount() { return real.indexCount; },
        get backbuffer() { return real.backbuffer; },
        get contextAttributes() { return real.contextAttributes; },
        get maxVertexUniformVectors() { return real.maxVertexUniformVectors; },
        get counters() { return real.counters; },
        get diagnostics() { return real.diagnostics; },
        beginFrame() { real.beginFrame(); },
        drawUnit(palette, modelMatrix, alpha, yawDeg) {
            const t0 = nowMs();
            real.drawUnit(palette, modelMatrix, alpha, yawDeg);
            sink.submitMs += nowMs() - t0;
        },
        endFrame() { real.endFrame(); },
        resize(cssWidth, cssHeight, dpr) { real.resize(cssWidth, cssHeight, dpr); },
        notifyContextLost() { real.notifyContextLost(); },
        handleContextRestored() { return real.handleContextRestored(); },
        dispose() { real.dispose(); },
    };
}
function startRuntimeDemo(options = {}) {
    var _a, _b, _c;
    if (options.now)
        clock = options.now;
    const host = resolveWx();
    const sys = (_a = options.systemInfoOverride) !== null && _a !== void 0 ? _a : safeCall(() => host.getSystemInfoSync(), {});
    const dpr = sys.pixelRatio && sys.pixelRatio > 0 ? sys.pixelRatio : 1;
    const dprUsed = Math.min(dpr, 3);
    const winW = (_b = sys.windowWidth) !== null && _b !== void 0 ? _b : 375;
    const winH = (_c = sys.windowHeight) !== null && _c !== void 0 ? _c : 667;
    const mainCanvas = host.createCanvas();
    const mainCtx = mainCanvas.getContext('2d');
    if (!mainCtx)
        throw new Error('[host] 主画布取不到 2d 上下文');
    mainCanvas.width = Math.max(1, Math.round(winW * dprUsed));
    mainCanvas.height = Math.max(1, Math.round(winH * dprUsed));
    const bbW = mainCanvas.width;
    const bbH = mainCanvas.height;
    const layout = (0, hud_1.computeLayout)(bbW, bbH, ['copy', 'share', 'view', 'perf', 'retry3d']);
    const view = { lines: [], footer: '', page: null };
    const state = {
        phase: 'boot',
        nowMs: nowMs(),
        lastFrameMs: nowMs(),
        lastDtSec: 0,
        frames: 0,
        buttonActions: 0,
        commands: [],
        passResult: null,
        footer: '启动中…',
        pageIndex: 0,
        pageText: null,
        perf: null,
        perfResults: [],
        units: 1,
        cacheState: 'unknown',
        contextLostEvents: 0,
        glErrors: 0,
        maxOutstandingRafs: 0,
        sim: options.sim === true,
    };
    let frameTimes = { passMs: 0, animMs: 0, submitMs: 0, compositeMs: 0 };
    const submitSink = { submitMs: 0 };
    let gl = null;
    let runtime3d = null;
    let host3d = null;
    let booting = false;
    let disposed = false;
    const outstandingRafs = new Set();
    const phaseRecords = new Map();
    function beginPhase(name) {
        phaseRecords.set(name, { name, status: 'running', detail: '', ms: 0, startedAt: nowMs() });
    }
    function endPhase(name, status, detail = '') {
        const rec = phaseRecords.get(name);
        if (!rec)
            return;
        rec.status = status;
        rec.detail = detail;
        rec.ms = Math.round(nowMs() - rec.startedAt);
    }
    let failNextRebuild = null;
    const waiters = { frames: [], ms: [], until: [] };
    let touchListenerAttached = false;
    function waitFrames(n) {
        return new Promise((resolve) => waiters.frames.push({ need: n, resolve }));
    }
    function waitMs(ms) {
        return new Promise((resolve) => waiters.ms.push({ untilMs: state.nowMs + ms, resolve }));
    }
    function waitUntil(fn, timeoutMs) {
        return new Promise((resolve) => {
            waiters.until.push({ fn, resolve, deadlineMs: state.nowMs + timeoutMs });
        });
    }
    function ensureMainLoop() {
        if (disposed)
            return;
        if (host3d && host3d.status !== 'disposed') {
            host3d.resume();
            return;
        }
        host3d = (0, host_runtime_1.createHostRuntime)({
            step: (dtSec) => stepFrame(dtSec),
            raf: (cb) => {
                let id = 0;
                id = requestFrame(() => { outstandingRafs.delete(id); cb(nowMs()); });
                outstandingRafs.add(id);
                state.maxOutstandingRafs = Math.max(state.maxOutstandingRafs, outstandingRafs.size);
                return id;
            },
            cancelRaf: (id) => { outstandingRafs.delete(id); cancelFrame(id); },
        });
        host3d.start();
    }
    function stepFrame(dtSec) {
        state.frames++;
        state.lastDtSec = dtSec;
        if (probeDtNextFrame) {
            probeDtNextFrame = false;
            probedDtSec = dtSec;
        }
        state.nowMs = nowMs();
        const wallMs = Math.max(0, state.nowMs - state.lastFrameMs);
        state.lastFrameMs = state.nowMs;
        if (runtime3d) {
            submitSink.submitMs = 0;
            const t0 = nowMs();
            const res = runtime3d.pass.render(state.commands, dtSec);
            const passMs = nowMs() - t0;
            const submitMs = submitSink.submitMs;
            state.passResult = res;
            let compositeMs = 0;
            if (res.status === 'ready') {
                const tc = nowMs();
                try {
                    mainCtx.drawImage(runtime3d.pass.canvas, 0, 0);
                }
                catch (_a) { }
                compositeMs = nowMs() - tc;
            }
            frameTimes = { passMs, animMs: Math.max(0, passMs - submitMs), submitMs, compositeMs };
            if (state.perf) {
                state.perf.sampler.markFrameTime(state.nowMs);
                state.perf.sampler.push({
                    wallMs, passMs, animMs: frameTimes.animMs, submitMs, compositeMs, gpuMs: readGpuMs(),
                });
            }
            if (state.frames % 60 === 0)
                sampleGlError();
        }
        drawHudFrame();
        for (let i = waiters.until.length - 1; i >= 0; i--) {
            const w = waiters.until[i];
            if (w.fn()) {
                w.resolve('ok');
                waiters.until.splice(i, 1);
            }
            else if (state.nowMs >= w.deadlineMs) {
                w.resolve('timeout');
                waiters.until.splice(i, 1);
            }
        }
        for (let i = waiters.frames.length - 1; i >= 0; i--) {
            waiters.frames[i].need--;
            if (waiters.frames[i].need <= 0) {
                waiters.frames[i].resolve();
                waiters.frames.splice(i, 1);
            }
        }
        for (let i = waiters.ms.length - 1; i >= 0; i--) {
            if (state.nowMs >= waiters.ms[i].untilMs) {
                waiters.ms[i].resolve();
                waiters.ms.splice(i, 1);
            }
        }
    }
    let probeDtNextFrame = false;
    let probedDtSec = null;
    function armDtProbe() { probeDtNextFrame = true; probedDtSec = null; }
    function assertProbeArmed() {
        if (probedDtSec === null)
            armDtProbe();
    }
    let timerExt = null;
    const timerQueries = [];
    function initTimerExt() {
        if (!gl)
            return;
        try {
            const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
            timerExt = ext ? { TIME_ELAPSED_EXT: ext.TIME_ELAPSED_EXT, GPU_DISJOINT_EXT: ext.GPU_DISJOINT_EXT } : null;
        }
        catch (_a) {
            timerExt = null;
        }
    }
    function readGpuMs() {
        if (!gl || !timerExt)
            return null;
        try {
            const q = gl.createQuery();
            if (!q)
                return null;
            gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q);
            gl.endQuery(timerExt.TIME_ELAPSED_EXT);
            timerQueries.push(q);
            while (timerQueries.length > 4) {
                const old = timerQueries.shift();
                if (old)
                    gl.deleteQuery(old);
            }
            let last = null;
            while (timerQueries.length) {
                const head = timerQueries[0];
                if (!gl.getQueryParameter(head, gl.QUERY_RESULT_AVAILABLE))
                    break;
                const disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT);
                if (!disjoint)
                    last = gl.getQueryParameter(head, gl.QUERY_RESULT) / 1e6;
                gl.deleteQuery(head);
                timerQueries.shift();
            }
            return last;
        }
        catch (_a) {
            timerExt = null;
            return null;
        }
    }
    function sampleGlError() {
        if (!gl)
            return;
        try {
            if (gl.getError() !== gl.NO_ERROR)
                state.glErrors++;
        }
        catch (_a) { }
    }
    function buildLines() {
        var _a, _b, _c, _d, _e, _f, _g;
        const r = runtime3d;
        const progress = E.runProgress(readRuns());
        const bb = r ? r.renderer.backbuffer : { width: bbW, height: bbH };
        return [
            'T31-FE-C · ' + (state.sim ? 'BROWSER SIM（非真机证据）' : 'WX 真机') + ' · ' + ((_a = sys.brand) !== null && _a !== void 0 ? _a : '?') + '/' + ((_b = sys.model) !== null && _b !== void 0 ? _b : '?'),
            'SDK ' + String((_c = sys.SDKVersion) !== null && _c !== void 0 ? _c : '?') + ' · dpr ' + dpr + '(用 ' + dprUsed + ') · bb ' + bb.width + 'x' + bb.height,
            'edgeMode ' + String((_d = r === null || r === void 0 ? void 0 : r.edgeMode) !== null && _d !== void 0 ? _d : '—') + ' · aa有效 ' + String((_f = (_e = r === null || r === void 0 ? void 0 : r.renderer.contextAttributes) === null || _e === void 0 ? void 0 : _e.antialias) !== null && _f !== void 0 ? _f : '—') +
                ' · 资源 ' + ((_g = resourcePlanCached === null || resourcePlanCached === void 0 ? void 0 : resourcePlanCached.mode) !== null && _g !== void 0 ? _g : '—') + ' · 缓存 ' + state.cacheState,
            '冷启动 ' + progress.cold + '/' + progress.required + ' · 热缓存 ' + progress.hot + '/' + progress.required +
                ' · 本轮 #' + runIndexCached + ' · 阶段 ' + state.phase,
            '命令 ' + state.commands.length + 'u · pass ' + frameTimes.passMs.toFixed(1) + 'ms（anim ' + frameTimes.animMs.toFixed(1) +
                ' / submit ' + frameTimes.submitMs.toFixed(1) + '）· 合成 ' + frameTimes.compositeMs.toFixed(1) + 'ms',
            'RAF 峰值 ' + state.maxOutstandingRafs + ' · ctxLost ' + state.contextLostEvents + ' · GLerr ' + state.glErrors +
                ' · 帧 ' + state.frames + (r ? ' · draw/palette ' + r.renderer.counters.drawCalls + '/' + r.renderer.counters.paletteUploads : ''),
            footerVerdictLine(),
        ];
    }
    function footerVerdictLine() {
        const res = resolvedResult;
        if (!res)
            return '判定：运行中…（' + state.footer + '）';
        const v = res.verdict;
        return '判定 device=' + v.device + ' · sixdir=' + v.sixdir + ' · states=' + v.states +
            ' · ctx=' + v.contextRestore + ' · 20u=' + v.capacity20 + ' | ' + state.footer;
    }
    function drawHudFrame() {
        view.lines = buildLines();
        view.footer = state.footer;
        if (state.pageText !== null) {
            const pages = (0, hud_1.paginate)(state.pageText, PAGED_CHARS);
            state.pageIndex = Math.max(0, Math.min(state.pageIndex, pages.length - 1));
            view.page = { index: state.pageIndex, total: pages.length, text: pages[state.pageIndex] };
        }
        else {
            view.page = null;
        }
        (0, hud_1.drawHud)(mainCtx, layout, view);
    }
    let resourcePlanCached = null;
    let runIndexCached = 1;
    function plan() {
        const cdn = safeCall(() => host.getStorageSync(STORAGE_CDN_BASE), null);
        return (0, adapter_local_1.resolveResourceChainPlan)({ cdnBaseUrl: cdn });
    }
    function loadSubpackage(resourcePlan) {
        if (resourcePlan.mode !== 'local-subpackage' || typeof host.loadSubpackage !== 'function')
            return Promise.resolve(0);
        const t0 = nowMs();
        return new Promise((resolve) => {
            try {
                host.loadSubpackage({
                    name: adapter_local_1.SUBPACKAGE_NAME,
                    success: () => resolve(Math.round(nowMs() - t0)),
                    fail: () => resolve(Math.round(nowMs() - t0)),
                });
            }
            catch (_a) {
                resolve(Math.round(nowMs() - t0));
            }
        });
    }
    async function bootstrap3D(resourcePlan, coldSeries, opts = {}) {
        var _a, _b, _c;
        if (booting)
            return;
        booting = true;
        try {
            if (failNextRebuild !== null) {
                const why = failNextRebuild;
                failNextRebuild = null;
                throw new Error(why);
            }
            disposeRuntime({ contextLost: opts.contextLost === true });
            const stages = {};
            stages.subpackageMs = await loadSubpackage(resourcePlan);
            const platform = (0, adapter_local_1.createResourcePlatform)(resourcePlan);
            if (coldSeries) {
                for (const ref of [character_3d_1.HERO_3D_MODEL_REF, ...profileClipRefs()]) {
                    try {
                        await platform.cacheRemove(ref.id);
                    }
                    catch (_d) { }
                }
            }
            const loader = (0, character_asset_loader_1.createCharacterAssetLoader)({
                platform,
                cdnBaseUrl: resourcePlan.cdnBaseUrl,
                structureValidator: (bytes, ref) => {
                    if (ref.mediaType === 'model/gltf-binary')
                        (0, glb_1.createModelStructureValidator)(character_3d_1.HERO_3D_MODEL_ACCOUNT)(bytes, ref);
                },
            });
            const tLoad = nowMs();
            const profileLoad = await loader.loadProfile(character_3d_1.HERO_3D_PROFILE);
            stages.loaderMs = Math.round(nowMs() - tLoad);
            const stats = loader.stats();
            if (profileLoad.status === 'failed' || !((_a = profileLoad.model) === null || _a === void 0 ? void 0 : _a.bytes)) {
                throw new Error('资源门失败：' + (profileLoad.diagnostics.slice(0, 4).join(' | ') || '未知'));
            }
            const tParse = nowMs();
            const model = (0, glb_1.loadCharacter3DModel)(profileLoad.model.bytes);
            stages.glbParseMs = Math.round(nowMs() - tParse);
            const rawByKey = {};
            const tAnim = nowMs();
            for (const key of ['idle', 'atk', 'cast', 'jump']) {
                const res = profileLoad.clips[key];
                if (!(res === null || res === void 0 ? void 0 : res.bytes))
                    throw new Error('动作资产缺失/失败：' + key);
                rawByKey[key] = JSON.parse((0, glb_1.decodeUtf8)(res.bytes));
            }
            stages.animParseMs = Math.round(nowMs() - tAnim);
            const baseColor = model.textureRoles.baseColor;
            if (!baseColor)
                throw new Error('模型缺 baseColor 贴图（§6.2 结构门）');
            const tTex = nowMs();
            const decoded = await platform.decodeImage(baseColor.bytes, baseColor.mimeType, baseColor.name);
            stages.textureDecodeMs = Math.round(nowMs() - tTex);
            const renderScale = character_3d_1.CHARACTER_3D_RENDER_SCALE > 0 ? character_3d_1.CHARACTER_3D_RENDER_SCALE : 1;
            const canvas3d = platform.createOffscreenCanvas(Math.max(1, Math.round(bbW * renderScale)), Math.max(1, Math.round(bbH * renderScale)));
            const tGpu = nowMs();
            const realRenderer = (0, renderer_1.createCharacter3DRenderer)({
                canvas: canvas3d,
                model,
                baseColor: decoded,
                platform,
                light: character_3d_1.CHARACTER_3D_LIGHT,
                orthoZHalf: character_3d_1.CHARACTER_3D_ORTHO_Z_HALF,
                renderScale: character_3d_1.CHARACTER_3D_RENDER_SCALE,
                fxaa: character_3d_1.CHARACTER_3D_FXAA,
                forceEdgeMode: options.forceEdgeMode,
            });
            stages.firstGpuUploadMs = Math.round(nowMs() - tGpu);
            if (realRenderer.status !== 'ready') {
                realRenderer.dispose();
                throw new Error('renderer 初始化失败：' + (realRenderer.diagnostics.join(' | ') || realRenderer.status));
            }
            gl = canvas3d.getContext('webgl2');
            initTimerExt();
            const evtCanvas = canvas3d;
            const onLost = (e) => {
                var _a;
                (_a = e === null || e === void 0 ? void 0 : e.preventDefault) === null || _a === void 0 ? void 0 : _a.call(e);
                if (realRenderer.status !== 'ready')
                    return;
                state.contextLostEvents++;
                realRenderer.notifyContextLost();
            };
            const onRestored = () => {
                if (realRenderer.status !== 'context-lost')
                    return;
                const ok = realRenderer.handleContextRestored();
                if (ok) {
                    armDtProbe();
                    host3d === null || host3d === void 0 ? void 0 : host3d.resume();
                }
            };
            (_b = evtCanvas.addEventListener) === null || _b === void 0 ? void 0 : _b.call(evtCanvas, 'webglcontextlost', onLost);
            (_c = evtCanvas.addEventListener) === null || _c === void 0 ? void 0 : _c.call(evtCanvas, 'webglcontextrestored', onRestored);
            const anim = {
                actionMap: character_3d_1.HERO_3D_ACTION_MAP,
                crossFadeSec: character_3d_1.CHARACTER_3D_CROSS_FADE_SEC,
                jumpToIdleBlendSec: character_3d_1.CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
                clips: buildClipRegistry(model, rawByKey),
            };
            const renderer = createTimingRenderer(realRenderer, submitSink);
            const pass = (0, pass_1.createCharacter3DPass)({
                renderer,
                viewport: { width: Math.max(1, Math.round(bbW * renderScale)), height: Math.max(1, Math.round(bbH * renderScale)) },
                runtimes: {
                    [character_3d_1.HERO_3D_PROFILE_ID]: {
                        profile: Object.assign(Object.assign({}, character_3d_1.HERO_3D_PROFILE), { screenHeightPxAtReference: character_3d_1.HERO_3D_PROFILE.screenHeightPxAtReference * dprUsed }),
                        model,
                        anim,
                    },
                },
                loadState: 'ready',
            });
            runtime3d = {
                platform, loaderStats: stats, model, renderer, pass,
                edgeMode: renderer.edgeMode,
                loadStatus: profileLoad.status === 'stale-3d-cache' ? 'stale-3d-cache' : 'ready',
                stages,
                diagnostics: [...profileLoad.diagnostics, ...renderer.diagnostics],
                modelResolvedPath: resolvedCodePathOf(platform),
                teardown: (teardownOpts) => {
                    var _a, _b;
                    (_a = evtCanvas.removeEventListener) === null || _a === void 0 ? void 0 : _a.call(evtCanvas, 'webglcontextlost', onLost);
                    (_b = evtCanvas.removeEventListener) === null || _b === void 0 ? void 0 : _b.call(evtCanvas, 'webglcontextrestored', onRestored);
                    if ((teardownOpts === null || teardownOpts === void 0 ? void 0 : teardownOpts.contextLost) !== true)
                        renderer.dispose();
                },
            };
            state.cacheState = classifyCache(stats);
            ensureMainLoop();
            await waitFrames(2);
        }
        finally {
            booting = false;
        }
    }
    function disposeRuntime(opts = {}) {
        host3d === null || host3d === void 0 ? void 0 : host3d.dispose();
        host3d = null;
        if (runtime3d) {
            try {
                runtime3d.teardown({ contextLost: opts.contextLost === true });
            }
            catch (_a) { }
        }
        runtime3d = null;
        gl = null;
    }
    async function rebuild3D(reason) {
        state.footer = '上下文真重建（' + reason + '）…';
        await bootstrap3D(plan(), false, { contextLost: true });
        state.commands = [singleIdleCommand()];
        state.units = 1;
        armDtProbe();
        host3d === null || host3d === void 0 ? void 0 : host3d.resume();
        await waitFrames(2);
    }
    async function phaseBoot() {
        state.phase = 'boot';
        beginPhase('boot');
        const resourcePlan = plan();
        resourcePlanCached = resourcePlan;
        const runs = readRuns();
        runIndexCached = runs.length + 1;
        const coldSeries = runIndexCached <= COLD_SERIES;
        state.footer = coldSeries ? '冷启动系列：清缓存后装配（资源门）…' : '热缓存系列：直接装配（资源门）…';
        await bootstrap3D(resourcePlan, coldSeries);
        const r = runtime3d;
        if (!r)
            throw new Error('装配后运行时为空');
        resource = {
            mode: resourcePlan.mode,
            executedBranches: resourcePlan.executedBranches,
            notExecutedBranches: resourcePlan.notExecutedBranches,
            modelResolvedPath: r.modelResolvedPath,
            assetStages: Object.assign({}, r.stages),
            loaderStats: flattenStats(r.loaderStats),
            reloadStats: null,
            hotChainObserved: false,
            loadStatus: r.loadStatus,
            diagnostics: r.diagnostics.slice(0, 20),
        };
        state.footer = '装配完成 · ' + r.edgeMode + ' · 缓存 ' + state.cacheState;
        runs.push({
            runIndex: runIndexCached, cacheState: state.cacheState, at: Math.round(state.nowMs),
            sixdirOk: false, statesOk: false, contextOk: false, failures: 0,
        });
        writeRuns(runs);
        endPhase('boot', 'ok', 'edgeMode=' + r.edgeMode + ' · 缓存=' + state.cacheState + ' · ' + resourcePlan.mode);
    }
    async function phaseScenarios() {
        var _a, _b, _c, _d, _e;
        state.phase = 'sixdir';
        beginPhase('sixdir');
        const sixDir = [];
        for (const sample of S.FACING_SAMPLES) {
            const footX = sample.u * bbW;
            const footY = sample.v * bbH;
            const cmd = {
                actorId: 'dir-' + sample.facing, profileKey: character_3d_1.HERO_3D_PROFILE_ID,
                footX, footY, depthKey: 0, facing: sample.facing,
                state: sample.state, isJump: false,
                stateElapsedSec: sample.state === 'walk' ? 0.4 : 0.2,
                moveProgress: sample.state === 'walk' ? 0.4 : null,
                hopPx: 0, alpha: 1, squashY: 1,
            };
            state.commands = [cmd];
            state.footer = '六向 · ' + sample.facing + ' / ' + sample.state;
            await waitFrames(30);
            const controller = (_a = runtime3d === null || runtime3d === void 0 ? void 0 : runtime3d.pass.controllers.get(cmd.actorId)) !== null && _a !== void 0 ? _a : null;
            const activeClipKey = controller ? controller.activeClipKey : null;
            const placed = (_c = (_b = state.passResult) === null || _b === void 0 ? void 0 : _b.placed.get(cmd.actorId)) !== null && _c !== void 0 ? _c : null;
            sixDir.push({
                facing: sample.facing, state: sample.state, footX, footY,
                expectedClipKey: sample.expectedClipKey, activeClipKey, placed,
                screenshot: await captureScreenshot('sixdir_' + sample.facing),
                ok: activeClipKey === sample.expectedClipKey,
            });
        }
        endPhase('sixdir', sixDir.every((row) => row.ok) ? 'ok' : 'failed', sixDir.map((row) => row.facing + ':' + String(row.activeClipKey)).join(' '));
        state.phase = 'states';
        beginPhase('states');
        const states = [];
        for (const sample of S.STATE_SAMPLES) {
            const actorId = 'state-' + sample.label;
            state.commands = [{
                    actorId, profileKey: character_3d_1.HERO_3D_PROFILE_ID,
                    footX: bbW * 0.5, footY: bbH * 0.72, depthKey: 0, facing: 'right',
                    state: sample.cmdState, isJump: sample.isJump,
                    stateElapsedSec: sample.stateElapsedSec, moveProgress: sample.moveProgress,
                    hopPx: sample.hopPx, alpha: sample.alpha, squashY: sample.squashY,
                }];
            state.footer = '全状态 · ' + sample.label;
            await waitFrames(sample.warmupFrames);
            const controller = (_d = runtime3d === null || runtime3d === void 0 ? void 0 : runtime3d.pass.controllers.get(actorId)) !== null && _d !== void 0 ? _d : null;
            const activeClipKey = controller ? controller.activeClipKey : null;
            states.push({
                state: sample.label, expectedClipKey: sample.expectedClipKey, activeClipKey, trio: null,
                screenshot: await captureScreenshot('state_' + sample.label),
                ok: activeClipKey === sample.expectedClipKey,
            });
        }
        endPhase('states', states.every((row) => row.ok) ? 'ok' : 'failed', states.map((row) => row.state + ':' + String(row.activeClipKey)).join(' '));
        state.phase = 'jump-trio';
        beginPhase('jump-trio');
        const trios = [];
        for (const c of S.MOVE_LOCK_CASES) {
            const actorId = 'trio-' + c.caseId;
            const cmdIsJump = S.lockedIsJump(c.intent, c.dead);
            state.commands = [{
                    actorId, profileKey: character_3d_1.HERO_3D_PROFILE_ID,
                    footX: c.footX, footY: c.footY, depthKey: 0, facing: 'right',
                    state: c.state, isJump: cmdIsJump,
                    stateElapsedSec: 0.4, moveProgress: c.moveProgress,
                    hopPx: c.hopPx, alpha: c.dead ? 0.35 : 1, squashY: c.dead ? 0.45 : 1,
                }];
            state.footer = '轻功三元 · ' + c.caseId;
            await waitFrames(30);
            const controller = (_e = runtime3d === null || runtime3d === void 0 ? void 0 : runtime3d.pass.controllers.get(actorId)) !== null && _e !== void 0 ? _e : null;
            const activeClipKey = controller ? controller.activeClipKey : null;
            if (activeClipKey !== c.expectedClipKey || cmdIsJump !== c.expectedCmdIsJump) {
                state.footer = '✗ ' + c.caseId + '：期望 clip=' + c.expectedClipKey + '/cmd=' + String(c.expectedCmdIsJump) +
                    '，实得 clip=' + String(activeClipKey) + '/cmd=' + String(cmdIsJump);
            }
            trios.push({ caseId: c.caseId, snapIsJump: c.syntheticSnapshotIsJump, cmdIsJump, activeClipKey, note: c.note });
        }
        const trioOk = trios.every((t) => { var _a; return ((_a = S.MOVE_LOCK_CASES.find((c) => c.caseId === t.caseId)) === null || _a === void 0 ? void 0 : _a.expectedClipKey) === t.activeClipKey; });
        endPhase('jump-trio', trioOk ? 'ok' : 'failed', trios.map((t) => t.caseId + ':' + String(t.activeClipKey)).join(' '));
        return { sixDir, states, trios };
    }
    function loseExt() {
        if (!gl)
            return null;
        try {
            const raw = gl.getExtension('WEBGL_lose_context');
            return raw && typeof raw.loseContext === 'function' && typeof raw.restoreContext === 'function' ? raw : null;
        }
        catch (_a) {
            return null;
        }
    }
    async function phaseContext() {
        var _a, _b, _c;
        state.phase = 'context';
        beginPhase('context');
        const ev = E.emptyContextEvidence();
        const r = runtime3d;
        if (!r) {
            ev.error = '无运行时';
            endPhase('context', 'failed', '无运行时');
            return ev;
        }
        const real = r.renderer;
        state.commands = [singleIdleCommand()];
        state.units = 1;
        await waitFrames(5);
        const ext = loseExt();
        ev.extAvailable = ext !== null;
        ev.injectionMode = ext ? 'gl-ext' : 'host-api-fallback';
        if (ext) {
            try {
                ext.loseContext();
            }
            catch (_d) { }
            await waitFrames(2);
        }
        if (real.status !== 'context-lost') {
            real.notifyContextLost();
            ev.injectionMode = ext ? 'gl-ext-host-bridge' : 'host-api-fallback';
            await waitFrames(2);
        }
        ev.lostObserved = real.status === 'context-lost';
        const framesAtLoss = state.frames;
        await waitFrames(12);
        ev.sessionContinuedWhileLost = state.frames > framesAtLoss;
        if (ext) {
            try {
                ext.restoreContext();
            }
            catch (error) {
                ev.fastPathError = messageOf(error);
            }
            await waitFrames(3);
            if (real.status === 'context-lost' && real.handleContextRestored()) {
                ev.restoreOk = true;
                ev.restoreVia = 'event';
                armDtProbe();
                host3d === null || host3d === void 0 ? void 0 : host3d.resume();
            }
            else if (real.status === 'ready') {
                ev.restoreOk = true;
                ev.restoreVia = 'event';
            }
        }
        if (!ev.restoreOk) {
            ev.rebuildAttempted = true;
            try {
                await rebuild3D('fast-path-unavailable');
                ev.rebuildOk = true;
                ev.restoreOk = true;
                ev.restoreVia = 'rebuild';
            }
            catch (error) {
                ev.rebuildOk = false;
                ev.rebuildError = messageOf(error);
                ev.restoreOk = false;
                ev.restoreVia = 'unsupported';
                ev.error = '重建失败：' + messageOf(error);
            }
        }
        if (ev.restoreOk) {
            if (probedDtSec === null) {
                armDtProbe();
                host3d === null || host3d === void 0 ? void 0 : host3d.resume();
            }
            await waitFrames(2);
            ev.firstFrameDtSec = probedDtSec;
        }
        host3d === null || host3d === void 0 ? void 0 : host3d.start();
        host3d === null || host3d === void 0 ? void 0 : host3d.start();
        host3d === null || host3d === void 0 ? void 0 : host3d.resume();
        await waitFrames(8);
        ev.pendingFramesMax = Math.max(state.maxOutstandingRafs, (_a = host3d === null || host3d === void 0 ? void 0 : host3d.pendingFrames) !== null && _a !== void 0 ? _a : 0);
        host3d === null || host3d === void 0 ? void 0 : host3d.pause('clock-reset-test');
        const framesAtPause = state.frames;
        await sleepWall(CLOCK_PAUSE_MS);
        ev.pauseFrozenFrames = state.frames - framesAtPause;
        armDtProbe();
        host3d === null || host3d === void 0 ? void 0 : host3d.resume();
        await waitFrames(2);
        ev.resumeDtSec = probedDtSec;
        ev.clockResetOk = ev.pauseFrozenFrames === 0 && ev.resumeDtSec === 0;
        const rNow = runtime3d;
        if (rNow) {
            const ext2 = loseExt();
            if (ext2) {
                try {
                    ext2.loseContext();
                }
                catch (_e) { }
            }
            if (rNow.renderer.status !== 'context-lost')
                rNow.renderer.notifyContextLost();
        }
        ev.secondRestoreAttempted = true;
        ev.terminalFailureInjected = true;
        failNextRebuild = '注入故障：验证 §6.2 重建失败路径';
        let terminalRebuildOk = false;
        try {
            await rebuild3D('injected-terminal-failure');
            terminalRebuildOk = true;
        }
        catch (_f) {
            terminalRebuildOk = false;
        }
        ev.secondRestoreFailed = terminalRebuildOk === false;
        if (terminalRebuildOk) {
            ev.error = '注入故障未生效（重建竟然成功）';
        }
        else {
            host3d === null || host3d === void 0 ? void 0 : host3d.notifyContextRestored(false, () => {
                ev.errorPageShown = true;
                state.footer = '✗ WebGL2 上下文重建失败（§6.2）→ 已暂停对局';
            });
        }
        ev.pausedOnFinalFailure = (host3d === null || host3d === void 0 ? void 0 : host3d.status) === 'paused';
        const framesAtFinalPause = state.frames;
        await sleepWall(300);
        ev.framesWhilePaused = state.frames - framesAtFinalPause;
        const actionsBefore = state.buttonActions;
        const tap = handleTap(layout.buttons[3].rect.x0 + 8, layout.buttons[3].rect.y0 + 8, true);
        ev.inputIgnoredWhilePaused = (host3d === null || host3d === void 0 ? void 0 : host3d.status) === 'paused' && tap.hit !== null && state.buttonActions === actionsBefore;
        for (let i = 0; i < 3; i++)
            handleButton('retry3d');
        await waitUntil(() => runtime3d !== null && (host3d === null || host3d === void 0 ? void 0 : host3d.status) === 'running', 15000);
        await waitFrames(8);
        ev.pendingFramesMax = Math.max(ev.pendingFramesMax, state.maxOutstandingRafs);
        if (resource && runtime3d) {
            const hot = flattenStats(runtime3d.loaderStats);
            resource.reloadStats = hot;
            resource.hotChainObserved = ((_b = hot.cacheHits) !== null && _b !== void 0 ? _b : 0) > 0 && ((_c = hot.downloads) !== null && _c !== void 0 ? _c : 0) === 0;
        }
        endPhase('context', E.contextEvidenceOk(ev) ? 'ok' : 'failed', ev.injectionMode + ' → ' + ev.restoreVia + (ev.fastPathError ? '（快路径不可用）' : ''));
        state.footer = '上下文注入完成 · ' + ev.injectionMode + ' → ' + ev.restoreVia;
        return ev;
    }
    function singleIdleCommand() {
        return {
            actorId: 'ctx-hero', profileKey: character_3d_1.HERO_3D_PROFILE_ID,
            footX: bbW * 0.5, footY: bbH * 0.7, depthKey: 0, facing: 'right',
            state: 'idle', isJump: false, stateElapsedSec: 0.2, moveProgress: null,
            hopPx: 0, alpha: 1, squashY: 1,
        };
    }
    async function phasePerf() {
        state.phase = 'perf';
        beginPhase('perf');
        const profile = options.shortProfile === true ? S.SIM_PROFILE : S.SPEC_PROFILE;
        const minSamples = profile.name === 'spec' ? M.REQUIRED_MIN_SAMPLES : 120;
        for (const stage of profile.stages) {
            state.units = stage.units;
            setupUnits(stage.units, 0, false);
            await waitFrames(3);
            const inset = measureHorizontalInset(stage.units);
            setupUnits(stage.units, inset, true);
            state.footer = '压测预热 ' + profile.warmupSec + 's · ' + stage.units + 'u（别熄屏/别切走）';
            await waitMs(profile.warmupSec * 1000);
            const visibility = checkUnitsVisible(stage.units);
            const before = snapshotCounters();
            const sampler = M.createSampler(stage.units, stage.sampleSec, minSamples);
            state.perf = { sampler, units: stage.units };
            state.footer = '采样 ' + stage.units + 'u / ' + stage.sampleSec + 's …';
            await waitUntil(() => sampler.isDone() || sampler.sampleCount >= 60 * 120, (stage.sampleSec + 30) * 1000);
            if (!sampler.isDone())
                sampler.markTruncated('采样未达规定帧数/秒数（' + stage.sampleSec + 's）');
            const after = snapshotCounters();
            const dFrames = after.frames - before.frames;
            const rec = sampler.summarize({
                contextLostCount: after.contextLostEvents - before.contextLostEvents,
                glErrorCount: after.glErrors - before.glErrors,
                drawCallsPerFrame: dFrames > 0 ? Math.round((after.drawCalls - before.drawCalls) / dFrames) : 0,
                skinPalettesPerFrame: dFrames > 0 ? Math.round((after.paletteUploads - before.paletteUploads) / dFrames) : 0,
                allUnitsOnScreen: visibility.ok,
                visibilityNote: visibility.note,
                specProfile: profile.name === 'spec',
                a2Profile: profile.name,
            });
            state.perfResults.push(rec);
            state.perf = null;
            state.footer = stage.units + 'u 完成 · fpsMedian=' + rec.fpsMedian + ' · P95=' + rec.frameMsP95;
        }
        endPhase('perf', 'ok', state.perfResults.map((r) => r.unitCount + 'u:' + r.fpsMedian).join(' '));
    }
    function snapshotCounters() {
        var _a, _b, _c;
        const c = runtime3d === null || runtime3d === void 0 ? void 0 : runtime3d.renderer.counters;
        return {
            frames: (_a = c === null || c === void 0 ? void 0 : c.frames) !== null && _a !== void 0 ? _a : 0, drawCalls: (_b = c === null || c === void 0 ? void 0 : c.drawCalls) !== null && _b !== void 0 ? _b : 0, paletteUploads: (_c = c === null || c === void 0 ? void 0 : c.paletteUploads) !== null && _c !== void 0 ? _c : 0,
            contextLostEvents: state.contextLostEvents, glErrors: state.glErrors,
        };
    }
    function setupUnits(count, insetPx, prime) {
        const innerW = Math.max(1, bbW - insetPx * 2);
        const cellLayout = M.layoutUnitCells(count, innerW, bbH);
        state.commands = cellLayout.cells.map((cell, i) => ({
            actorId: 'perf-' + i, profileKey: character_3d_1.HERO_3D_PROFILE_ID,
            footX: cell.cx + insetPx, footY: cell.feetY, depthKey: i,
            facing: 'right', state: 'idle', isJump: false,
            stateElapsedSec: 0.3, moveProgress: null, hopPx: 0, alpha: 1, squashY: 1,
        }));
        if (!prime)
            return;
        const controllers = runtime3d === null || runtime3d === void 0 ? void 0 : runtime3d.pass.controllers;
        if (!controllers)
            return;
        const idleSec = character_3d_1.HERO_3D_CLIP_SOURCE_SEC.idle;
        for (let i = 0; i < count; i++) {
            const c = controllers.get('perf-' + i);
            if (!c)
                continue;
            c.update((i * S.UNIT_PHASE_STEP_SEC) % idleSec, {
                state: 'idle', isJump: false, stateElapsedSec: 0, moveProgress: null,
            });
        }
    }
    function measureHorizontalInset(count) {
        var _a;
        const placed = (_a = state.passResult) === null || _a === void 0 ? void 0 : _a.placed;
        if (!placed || placed.size !== count)
            return 0;
        let maxW = 0;
        for (const [, box] of placed)
            maxW = Math.max(maxW, box.w);
        return Math.ceil(maxW / 2) + 2;
    }
    function checkUnitsVisible(count) {
        var _a;
        if (!gl || !runtime3d)
            return { ok: false, note: '无 gl/运行时' };
        const placed = (_a = state.passResult) === null || _a === void 0 ? void 0 : _a.placed;
        if (!placed)
            return { ok: false, note: '无 placed（pass 未 ready）' };
        if (placed.size !== count)
            return { ok: false, note: 'placed 数量 ' + placed.size + ' != ' + count };
        const W = runtime3d.renderer.backbuffer.width;
        const H = runtime3d.renderer.backbuffer.height;
        const buf = new Uint8Array(W * H * 4);
        try {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        }
        catch (error) {
            return { ok: false, note: 'readPixels 抛错：' + messageOf(error) };
        }
        let globalOpaque = 0;
        for (let i = 3; i < buf.length; i += 4)
            if (buf[i] > 0)
                globalOpaque++;
        const counts = [];
        let ok = true;
        let noteReason = '';
        for (const [id, box] of placed) {
            const x0 = Math.max(0, Math.floor(box.cx - box.w / 2));
            const x1 = Math.min(W - 1, Math.ceil(box.cx + box.w / 2));
            const y1 = Math.min(H - 1, Math.ceil(H - box.top));
            const y0 = Math.max(0, Math.floor(H - (box.top + box.h)));
            let opaque = 0;
            for (let y = y0; y <= y1; y++) {
                const row = y * W * 4;
                for (let x = x0; x <= x1; x++)
                    if (buf[row + x * 4 + 3] > 0)
                        opaque++;
            }
            counts.push(id + ':' + opaque);
            if (!M.isPlacedInsideViewport(box, W, H)) {
                ok = false;
                noteReason = noteReason || (id + ' placed 出屏/面积无效');
            }
            if (opaque < 64) {
                ok = false;
                noteReason = noteReason || (id + ' 像素数 ' + opaque + ' < 64');
            }
        }
        return {
            ok,
            note: 'fillRatio=' + (globalOpaque / (W * H)).toFixed(4) + ' bb=' + W + 'x' + H +
                (ok ? '' : ' · ' + noteReason) + ' · ' + counts.slice(0, 6).join(',') + (counts.length > 6 ? ',…' : ''),
        };
    }
    function captureScreenshot(tag) {
        if (typeof host.canvasToTempFilePath !== 'function')
            return Promise.resolve(null);
        return new Promise((resolve) => {
            try {
                host.canvasToTempFilePath({
                    canvas: mainCanvas, fileType: 'png', quality: 1,
                    success: (r) => {
                        const name = 'char3d-' + tag + '.png';
                        try {
                            const fs = host.getFileSystemManager();
                            fs.writeFileSync(host.env.USER_DATA_PATH + '/' + name, fs.readFileSync(r.tempFilePath));
                            resolve(name);
                        }
                        catch (_a) {
                            resolve(r.tempFilePath);
                        }
                    },
                    fail: () => resolve(null),
                });
            }
            catch (_a) {
                resolve(null);
            }
        });
    }
    let resource = null;
    let resolvedResult = null;
    let preContextSnapshot = null;
    function deviceSnapshot() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const device = {
            brand: (_a = sys.brand) !== null && _a !== void 0 ? _a : 'unknown', model: (_b = sys.model) !== null && _b !== void 0 ? _b : 'unknown', system: (_c = sys.system) !== null && _c !== void 0 ? _c : 'unknown',
            platform: (_d = sys.platform) !== null && _d !== void 0 ? _d : 'unknown',
            SDKVersion: (_e = sys.SDKVersion) !== null && _e !== void 0 ? _e : null,
            benchmarkLevel: (_f = sys.benchmarkLevel) !== null && _f !== void 0 ? _f : null,
            pixelRatio: dpr,
            screenWidth: (_g = sys.screenWidth) !== null && _g !== void 0 ? _g : 0, screenHeight: (_h = sys.screenHeight) !== null && _h !== void 0 ? _h : 0,
            windowWidth: winW, windowHeight: winH,
            vendor: null, renderer: null, unmaskedVendor: null, unmaskedRenderer: null,
            glVersion: null, glslVersion: null,
            maxVertexUniformVectors: (_j = runtime3d === null || runtime3d === void 0 ? void 0 : runtime3d.renderer.maxVertexUniformVectors) !== null && _j !== void 0 ? _j : null,
            deviceHash: '',
        };
        if (gl) {
            try {
                device.glVersion = String(gl.getParameter(gl.VERSION));
                device.glslVersion = String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
                device.vendor = String(gl.getParameter(gl.VENDOR));
                device.renderer = String(gl.getParameter(gl.RENDERER));
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                if (dbg) {
                    device.unmaskedVendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL));
                    device.unmaskedRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
                }
            }
            catch (_k) { }
        }
        device.deviceHash = E.deviceHashOf(device);
        return device;
    }
    function buildResultNow(parts) {
        var _a, _b, _c, _d, _e, _f, _g;
        const r = runtime3d;
        const eff = (_a = r === null || r === void 0 ? void 0 : r.renderer.contextAttributes) !== null && _a !== void 0 ? _a : null;
        const ctx = {
            device: deviceSnapshot(),
            canvas: {
                backbuffer: r ? { width: r.renderer.backbuffer.width, height: r.renderer.backbuffer.height } : null,
                requestedAttributes: { alpha: true, antialias: true, depth: true, premultipliedAlpha: true, preserveDrawingBuffer: true },
                effectiveAttributes: eff ? Object.assign({}, eff) : null,
                dpr, renderScale: character_3d_1.CHARACTER_3D_RENDER_SCALE, dprCappedAt: 3,
            },
            rendererInfo: {
                edgeMode: (_b = r === null || r === void 0 ? void 0 : r.edgeMode) !== null && _b !== void 0 ? _b : null,
                effectiveAntialias: eff ? eff.antialias === true : null,
                jointCount: (_c = r === null || r === void 0 ? void 0 : r.renderer.jointCount) !== null && _c !== void 0 ? _c : null,
                vertexCount: (_d = r === null || r === void 0 ? void 0 : r.renderer.vertexCount) !== null && _d !== void 0 ? _d : null,
                indexCount: (_e = r === null || r === void 0 ? void 0 : r.renderer.indexCount) !== null && _e !== void 0 ? _e : null,
                counters: r ? Object.assign({}, r.renderer.counters) : null,
            },
            resource: resource !== null && resource !== void 0 ? resource : {
                mode: 'local-subpackage', executedBranches: [], notExecutedBranches: [],
                modelResolvedPath: null, assetStages: {}, loaderStats: {}, reloadStats: null,
                hotChainObserved: false, loadStatus: 'failed', diagnostics: ['未装配'],
            },
            sixDir: parts.sixDir,
            states: parts.states,
            jumpTrios: parts.trios,
            context: parts.context,
            capacity: state.perfResults.slice(),
            phases: Array.from(phaseRecords.values()).map((p) => ({
                name: p.name, status: p.status, detail: p.detail, ms: p.ms,
            })),
            runs: readRuns(),
            env: {
                sim: state.sim,
                commitSha: (_g = (_f = options.commitShaOverride) !== null && _f !== void 0 ? _f : safeCall(() => host.getStorageSync('char3d-commit-sha'), '')) !== null && _g !== void 0 ? _g : '',
                profile: options.shortProfile === true ? 'sim-short' : 'spec',
                screenshots: parts.screenshots.slice(),
                notes: [
                    '三元并列（arch seq=421）：snapIsJump = 原始快照意图（合成输入）/ cmdIsJump = 命令上的 isJump' +
                        '（= 该次移动演出创建时锁定的值）/ activeClipKey = 生产 CharacterAnimController 实际消费的资产槽位。' +
                        'smoke 宿主不引 battle-core/session ⇒ snapIsJump 是合成快照意图，真实 session→view→command 链在 ' +
                        'tests/battle-character3d-wiring.test.ts 已闭合，本卡不重证。',
                    'assetStages：读取含在 loaderMs 内（loader 状态机是一次调用；S0 的 readFileMs 不可再分）',
                    'passMs/animMs/submitMs：animMs = passMs − ΣdrawUnit（时间代理，不改生产代码）',
                    '阶段顺序（phasesOrder）：' + E.PHASES_ORDER.join(' → ') +
                        ' —— 测量项（六向/全状态/轻功三元/压测）**在上下文自测之前**跑完并落盘，自测失败不毒死测量结果' +
                        (preContextSnapshot ? '；压测后已先落中间快照 ' + preContextSnapshot : ''),
                ],
            },
        };
        return E.buildResult(ctx);
    }
    function writeResultFile(result, suffix = '') {
        const name = suffix
            ? E.shareFileName(result).replace(/\.json$/, '') + '_' + suffix + '.json'
            : E.shareFileName(result);
        try {
            host.getFileSystemManager().writeFileSync(host.env.USER_DATA_PATH + '/' + name, JSON.stringify(result), 'utf8');
        }
        catch (_a) { }
        return name;
    }
    function exportResult() {
        if (!resolvedResult)
            return;
        writeResultFile(resolvedResult);
    }
    function handleButton(id) {
        var _a;
        state.buttonActions++;
        if (!runtime3d && id !== 'retry3d') {
            state.footer = '▶ ' + ((_a = hud_1.BUTTON_LABELS[id]) !== null && _a !== void 0 ? _a : id) + '：运行时未就绪';
            return;
        }
        if (id === 'retry3d') {
            state.footer = '▶ 重新装配 3D（替换式，单循环）…';
            void (async () => {
                try {
                    await bootstrap3D(plan(), false);
                    state.footer = '▶ 重试完成';
                }
                catch (error) {
                    state.footer = '▶ 重试失败：' + messageOf(error);
                }
            })();
            return;
        }
        if (id === 'view') {
            state.pageText = state.pageText === null ? JSON.stringify(resolvedResult !== null && resolvedResult !== void 0 ? resolvedResult : { pending: true }) : null;
            state.pageIndex = 0;
            state.footer = state.pageText === null ? '▶ 返回摘要' : '▶ 分页查看（点右半下一页）';
            return;
        }
        if (id === 'copy') {
            void copyResult();
            return;
        }
        if (id === 'share') {
            void shareResult();
            return;
        }
        if (id === 'perf') {
            const on = safeCall(() => host.getStorageSync(STORAGE_PERF_ALWAYS), 0) !== 1;
            safeCall(() => host.setStorageSync(STORAGE_PERF_ALWAYS, on ? 1 : 0), undefined);
            state.footer = '▶ 压测常开=' + (on ? '开' : '关') + '（改后重扫生效）';
        }
    }
    async function copyResult() {
        if (!resolvedResult) {
            state.footer = '▶ 复制：结果还没产出（阶段：' + state.phase + '）';
            return;
        }
        const text = JSON.stringify(resolvedResult);
        const res = await withTimeout(new Promise((resolve) => {
            if (typeof host.setClipboardData !== 'function') {
                resolve({ ok: false, errMsg: 'wx.setClipboardData 不存在' });
                return;
            }
            try {
                host.setClipboardData({
                    data: text,
                    success: () => resolve({ ok: true, errMsg: null }),
                    fail: (e) => { var _a; return resolve({ ok: false, errMsg: (_a = e.errMsg) !== null && _a !== void 0 ? _a : 'fail' }); },
                });
            }
            catch (e) {
                resolve({ ok: false, errMsg: messageOf(e) });
            }
        }), 3000, { ok: false, errMsg: '3s 无回调（宿主无响应）' });
        state.footer = res.ok ? '▶ 复制：成功（' + text.length + ' 字符）' : '▶ 复制：失败 · ' + String(res.errMsg);
        logLine('__CHAR3D_CLIPBOARD__=' + JSON.stringify({ ok: res.ok, chars: text.length, errMsg: res.errMsg }));
    }
    async function shareResult() {
        if (!resolvedResult) {
            state.footer = '▶ 分享：结果还没产出（阶段：' + state.phase + '）';
            return;
        }
        const fileName = E.shareFileName(resolvedResult);
        const res = await withTimeout(new Promise((resolve) => {
            if (typeof host.shareFileMessage !== 'function') {
                resolve({ ok: false, errMsg: 'wx.shareFileMessage 不存在（基础库不支持）' });
                return;
            }
            try {
                host.shareFileMessage({
                    filePath: host.env.USER_DATA_PATH + '/' + fileName, fileName,
                    success: () => resolve({ ok: true, errMsg: null }),
                    fail: (e) => { var _a; return resolve({ ok: false, errMsg: (_a = e.errMsg) !== null && _a !== void 0 ? _a : 'fail' }); },
                });
            }
            catch (e) {
                resolve({ ok: false, errMsg: messageOf(e) });
            }
        }), 5000, { ok: false, errMsg: '5s 无回调' });
        state.footer = res.ok ? '▶ 分享：已调起（' + fileName + '）' : '▶ 分享：失败 · ' + String(res.errMsg);
        logLine('__CHAR3D_SHARE__=' + JSON.stringify({ ok: res.ok, errMsg: res.errMsg }));
    }
    function toBackbuffer(x, y) {
        return { x: x * (winW > 0 ? bbW / winW : 1), y: y * (winH > 0 ? bbH / winH : 1) };
    }
    function handleTap(x, y, preMapped = false) {
        const mapped = preMapped ? { x, y } : toBackbuffer(x, y);
        const paused = (host3d === null || host3d === void 0 ? void 0 : host3d.status) === 'paused';
        if (state.pageText !== null && mapped.y < layout.footerY) {
            state.pageIndex += mapped.x >= bbW / 2 ? 1 : -1;
            state.footer = '▶ 翻页';
            return { hit: 'page', acted: true };
        }
        const { hit, nearest } = (0, hud_1.hitTest)(layout, mapped.x, mapped.y);
        logLine(E.toTapDiagLine({
            mapped: [Math.round(mapped.x), Math.round(mapped.y)],
            canvasSpace: [bbW, bbH],
            windowSpace: [winW, winH],
            hit, nearest, listenerAttached: touchListenerAttached, paused,
        }));
        if (hit === null)
            return { hit: null, acted: false };
        if (paused) {
            state.footer = '▶ 已暂停：输入被忽略（' + hit + '）';
            return { hit, acted: false };
        }
        handleButton(hit);
        return { hit, acted: true };
    }
    function attachTouch() {
        if (typeof host.onTouchStart !== 'function')
            return;
        try {
            host.onTouchStart((e) => {
                const t = e.touches && e.touches[0];
                if (!t)
                    return;
                handleTap(t.clientX, t.clientY);
            });
            touchListenerAttached = true;
        }
        catch (_a) {
            touchListenerAttached = false;
        }
    }
    function readRuns() {
        try {
            const raw = host.getStorageSync(STORAGE_RUNS);
            if (!Array.isArray(raw))
                return [];
            return raw.filter((r) => !!r && typeof r.runIndex === 'number');
        }
        catch (_a) {
            return [];
        }
    }
    function writeRuns(runs) {
        safeCall(() => host.setStorageSync(STORAGE_RUNS, runs.slice(-12)), undefined);
    }
    function updateRun(patch) {
        var _a;
        const runs = readRuns();
        const last = runs[runs.length - 1];
        if (!last)
            return;
        if (patch.sixdirOk !== undefined)
            last.sixdirOk = patch.sixdirOk;
        if (patch.statesOk !== undefined)
            last.statesOk = patch.statesOk;
        if (patch.contextOk !== undefined)
            last.contextOk = patch.contextOk;
        if (patch.failures !== undefined)
            last.failures = ((_a = last.failures) !== null && _a !== void 0 ? _a : 0) + patch.failures;
        writeRuns(runs);
    }
    async function runAll() {
        const sixDir = [];
        const states = [];
        const trios = [];
        const screenshots = [];
        let contextEv = E.emptyContextEvidence();
        try {
            await phaseBoot();
            const scen = await phaseScenarios();
            sixDir.push(...scen.sixDir);
            states.push(...scen.states);
            trios.push(...scen.trios);
            for (const row of scen.sixDir)
                if (row.screenshot)
                    screenshots.push(row.screenshot);
            for (const row of scen.states)
                if (row.screenshot)
                    screenshots.push(row.screenshot);
            updateRun({ sixdirOk: scen.sixDir.every((r) => r.ok), statesOk: scen.states.every((r) => r.ok) });
            const runs = readRuns();
            const progress = E.runProgress(runs);
            const forcePerf = safeCall(() => host.getStorageSync(STORAGE_PERF_ALWAYS), 0) === 1;
            if (forcePerf || (progress.cold >= E.RUNS_REQUIRED && progress.hot >= E.RUNS_REQUIRED)) {
                await phasePerf();
            }
            else {
                beginPhase('perf');
                endPhase('perf', 'skipped', '冷/热未满 ' + E.RUNS_REQUIRED + ' 次且未开「压测常开」');
                state.footer = '本轮不跑压测（冷/热各满 ' + E.RUNS_REQUIRED + ' 次后自动跑；点「重跑压测」可改常开）';
            }
            state.phase = 'measured';
            const snapshot = buildResultNow({ sixDir, states, trios, context: contextEv, screenshots });
            preContextSnapshot = writeResultFile(snapshot, 'precontext');
            contextEv = await phaseContext();
            updateRun({ contextOk: E.contextEvidenceOk(contextEv) });
            if (resource && contextEv.fastPathError) {
                resource.notExecutedBranches = resource.notExecutedBranches.concat([
                    'WEBGL_lose_context.restoreContext 扩展恢复（本平台不可用：' + contextEv.fastPathError +
                        '）—— 已改走真重建（新建 canvas/context + 缓存重装配）',
                ]);
            }
            state.phase = 'done';
            resolvedResult = buildResultNow({ sixDir, states, trios, context: contextEv, screenshots });
            exportResult();
            logLine(E.toConsoleLine(resolvedResult));
            updateRun({ failures: countFailures(resolvedResult) });
            resolvedResult.runs = readRuns();
            state.footer = '完成 · ' + resolvedResult.verdict.device + ' · 20u=' + resolvedResult.verdict.capacity20;
            drawHudFrame();
            return resolvedResult;
        }
        catch (error) {
            state.phase = 'failed';
            state.footer = '✗ 流程失败：' + messageOf(error);
            resolvedResult = buildResultNow({ sixDir, states, trios, context: contextEv, screenshots });
            exportResult();
            logLine(E.toConsoleLine(resolvedResult));
            updateRun({ failures: 1 });
            drawHudFrame();
            return resolvedResult;
        }
    }
    function countFailures(result) {
        let n = 0;
        if (!result.sixDir.every((r) => r.ok))
            n++;
        if (!result.states.every((r) => r.ok))
            n++;
        if (!E.contextEvidenceOk(result.context))
            n++;
        return n;
    }
    const runPromise = (async () => {
        attachTouch();
        return runAll();
    })();
    return {
        get result() { return resolvedResult; },
        run: () => runPromise,
        dispose: () => { disposed = true; disposeRuntime(); },
    };
}
function profileClipRefs() {
    const refs = [];
    for (const key of ['idle', 'atk', 'cast', 'jump']) {
        const entry = character_3d_1.HERO_3D_CLIP_REFS[key];
        if (entry && !('embedded' in entry))
            refs.push(entry);
    }
    return refs;
}
function buildClipRegistry(model, rawByKey) {
    const registry = {};
    for (const key of ['idle', 'walk', 'atk', 'cast', 'jump']) {
        const entry = character_3d_1.HERO_3D_PROFILE.clips[key];
        registry[key] = (0, animation_1.resolveClipSource)(key, entry, model, 'embedded' in entry ? undefined : rawByKey[key]);
    }
    return registry;
}
function resolvedCodePathOf(platform) {
    const p = platform;
    if (!p.resolvedCodePaths)
        return null;
    const keys = Object.keys(p.resolvedCodePaths);
    return keys.length ? p.resolvedCodePaths[keys[0]] : null;
}
function classifyCache(stats) {
    if (stats.downloads > 0 && stats.cacheHits === 0)
        return 'cold';
    if (stats.cacheHits > 0 && stats.downloads === 0)
        return 'hot';
    if (stats.downloads > 0 || stats.cacheHits > 0)
        return 'mixed';
    return 'unknown';
}
function flattenStats(stats) {
    const out = {};
    for (const [k, v] of Object.entries(stats))
        if (typeof v === 'number')
            out[k] = v;
    return out;
}
function safeCall(fn, fallback) {
    try {
        return fn();
    }
    catch (_a) {
        return fallback;
    }
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
function logLine(line) {
    try {
        console.log(line);
    }
    catch (_a) { }
}
function withTimeout(promise, ms, fallback) {
    return new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => { if (!done) {
            done = true;
            resolve(fallback);
        } }, ms);
        promise.then((v) => { if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(v);
        } }, () => { if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(fallback);
        } });
    });
}
function sleepWall(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

  });
  // ---- config/character-3d ----
  __def("config/character-3d", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HERO_3D_PROFILE_ERRORS = exports.CHARACTER_3D_VERTEX_FLOATS = exports.CHARACTER_3D_RENDER_SCALE = exports.CHARACTER_3D_FXAA = exports.CHARACTER_3D_ORTHO_Z_HALF = exports.CHARACTER_3D_LIGHT = exports.CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC = exports.CHARACTER_3D_CROSS_FADE_SEC = exports.HERO_3D_ACTION_MAP = exports.HERO_3D_STRIKE_WINDOW_SEC = exports.HERO_3D_STRIKE_START_RATIO = exports.HERO_3D_CAST_CYCLE_SEC = exports.HERO_3D_PROFILE = exports.HERO_3D_ATTACHMENTS = exports.HERO_3D_SOURCE_VIEW_YAW_DEG = exports.HERO_3D_CLIP_REFS = exports.HERO_3D_MODEL_REF = exports.HERO_3D_CLIP_SOURCE_SEC = exports.HERO_3D_EMBEDDED_CLIPS = exports.HERO_3D_MODEL_ACCOUNT = exports.CHARACTER_3D_PROFILE_BY_SPRITE_KEY = exports.HERO_3D_PROFILE_ID = void 0;
exports.yawDegForFacing = yawDegForFacing;
exports.normalizeSignedDeg = normalizeSignedDeg;
exports.isRelativeAssetPath = isRelativeAssetPath;
exports.validateCharacter3DProfile = validateCharacter3DProfile;
const battle_hex_1 = require("./battle-hex");
exports.HERO_3D_PROFILE_ID = 'hero-3d';
exports.CHARACTER_3D_PROFILE_BY_SPRITE_KEY = {
    hero: exports.HERO_3D_PROFILE_ID,
};
exports.HERO_3D_MODEL_ACCOUNT = {
    triangleCount: 48419,
    vertexCount: 29281,
    jointCount: 41,
    primitiveCount: 1,
    meshCount: 1,
    materialCount: 1,
    textureCount: 3,
    bufferBytes: 3974376,
};
exports.HERO_3D_EMBEDDED_CLIPS = {
    walk: { name: 'preset:biped:walk', keyCount: 57, firstKeyTimeSec: 1 / 24, lastKeyTimeSec: 2.375 },
    run: { name: 'preset:biped:run', keyCount: 31, firstKeyTimeSec: 1 / 24, lastKeyTimeSec: 1.2916666666666667 },
};
exports.HERO_3D_CLIP_SOURCE_SEC = {
    idle: 6.666666666666667,
    atk: 1.5,
    cast: 4.533333333333333,
    jump: 1.5,
};
function assetRef(id, sha256, byteLength, fileName, mediaType) {
    return {
        id,
        urlPath: `characters/hero/${sha256.slice(0, 12)}/${fileName}`,
        sha256,
        byteLength,
        mediaType,
    };
}
exports.HERO_3D_MODEL_REF = assetRef('hero-model-48k-20260914', 'ff9202b48470c92ccdad0333108e77e193a4135f873ce68e7e3498e979f816f0', 4040728, 'hero_48k_20260914.glb', 'model/gltf-binary');
exports.HERO_3D_CLIP_REFS = {
    idle: assetRef('hero-clip-idle-v4', '0d3262385d45febcb2930318baf74346340d3e9ccac9c8c607ac59a819171766', 726299, 'idle_v4.json', 'application/json'),
    walk: { embedded: exports.HERO_3D_EMBEDDED_CLIPS.walk.name },
    atk: assetRef('hero-clip-atk-v4', '546ec94f99065cc2779cf479dbb8821a101beca1851e6aeb1028b741dbfb5bd1', 162924, 'atk_v4.json', 'application/json'),
    cast: assetRef('hero-clip-cast-v4', '3bca2412358226236a19f908952502adc50c799d7bbc499d34341b4ddc446448', 490227, 'cast_v4.json', 'application/json'),
    jump: assetRef('hero-clip-jump-v6-1p5s', '2895612562c2a2b8bad8858e08bfbc2d90985a15a10c41172b50d538ef6222e5', 166799, 'jump_v6_1p5s.json', 'application/json'),
};
exports.HERO_3D_SOURCE_VIEW_YAW_DEG = {
    right: 270,
    rightdown: 225,
    rightup: 315,
    left: 90,
    leftdown: 135,
    leftup: 45,
};
function yawDegForFacing(facing) {
    return normalizeSignedDeg(270 - exports.HERO_3D_SOURCE_VIEW_YAW_DEG[facing]);
}
function normalizeSignedDeg(deg) {
    let v = deg % 360;
    if (v > 180)
        v -= 360;
    else if (v <= -180)
        v += 360;
    return v;
}
exports.HERO_3D_ATTACHMENTS = {
    'right-hand-blade': {
        bone: 'R_Hand',
        assetId: '',
        enabled: false,
        localMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
};
exports.HERO_3D_PROFILE = {
    mode: 'webgl2-skinned',
    model: exports.HERO_3D_MODEL_REF,
    clips: exports.HERO_3D_CLIP_REFS,
    jointCount: 41,
    primitiveCount: 1,
    modelHeight: 0.98107916326262057,
    screenHeightPxAtReference: battle_hex_1.TILE_H * battle_hex_1.PIECE.heightPerTile,
    sourceViewYawDeg: exports.HERO_3D_SOURCE_VIEW_YAW_DEG,
    attachments: exports.HERO_3D_ATTACHMENTS,
};
exports.HERO_3D_CAST_CYCLE_SEC = (3 * battle_hex_1.CAST_FRAME_PERIOD_MS) / 1000;
exports.HERO_3D_STRIKE_START_RATIO = 2 / 3;
exports.HERO_3D_STRIKE_WINDOW_SEC = battle_hex_1.CAST_FRAME_PERIOD_MS / 1000;
exports.HERO_3D_ACTION_MAP = {
    idle: {
        clip: 'idle',
        progressSource: 'viewClock',
        loop: true,
        playWindowSec: null,
        startRatio: 0,
        rootMotion: 'track',
        crossFadeOnEnter: true,
    },
    walk: {
        clip: 'walk',
        progressSource: 'viewClock',
        loop: true,
        playWindowSec: null,
        startRatio: 0,
        rootMotion: 'track',
        crossFadeOnEnter: true,
    },
    basic: {
        clip: 'atk',
        progressSource: 'stateElapsed',
        loop: false,
        playWindowSec: battle_hex_1.CHOREO.basicSec,
        startRatio: 0,
        rootMotion: 'track',
        crossFadeOnEnter: true,
    },
    charge: {
        clip: 'cast',
        progressSource: 'stateElapsed',
        loop: true,
        playWindowSec: exports.HERO_3D_CAST_CYCLE_SEC,
        startRatio: 0,
        rootMotion: 'track',
        crossFadeOnEnter: true,
    },
    strike: {
        clip: 'cast',
        progressSource: 'stateElapsed',
        loop: false,
        playWindowSec: exports.HERO_3D_STRIKE_WINDOW_SEC,
        startRatio: exports.HERO_3D_STRIKE_START_RATIO,
        rootMotion: 'track',
        crossFadeOnEnter: true,
    },
    hit: {
        clip: null,
        progressSource: 'viewClock',
        loop: true,
        playWindowSec: null,
        startRatio: 0,
        rootMotion: 'track',
        crossFadeOnEnter: false,
    },
    dead: {
        clip: 'idle',
        progressSource: 'hold',
        loop: false,
        playWindowSec: null,
        startRatio: 0,
        rootMotion: 'track',
        crossFadeOnEnter: false,
    },
    jump: {
        clip: 'jump',
        progressSource: 'moveProgress',
        loop: false,
        playWindowSec: exports.HERO_3D_CLIP_SOURCE_SEC.jump,
        startRatio: 0,
        rootMotion: 'zero',
        crossFadeOnEnter: true,
    },
};
exports.CHARACTER_3D_CROSS_FADE_SEC = 0.1;
exports.CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC = 0.18;
exports.CHARACTER_3D_LIGHT = {
    ambientIntensity: 2.15,
    directionalIntensity: 1.15,
    direction: [-0.4, 0.85, 1],
    diffuseNormalization: 1 / Math.PI,
};
exports.CHARACTER_3D_ORTHO_Z_HALF = 4;
exports.CHARACTER_3D_FXAA = {
    edgeThreshold: 0.166,
    edgeThresholdMin: 0.0833,
    searchSteps: 8,
    subpixelQuality: 0.75,
    subpixelTrim: 1 / 8,
    alphaThreshold: 0.05,
};
exports.CHARACTER_3D_RENDER_SCALE = 1;
exports.CHARACTER_3D_VERTEX_FLOATS = 16;
const HEX64 = /^[0-9a-f]{64}$/;
const CLIP_KEYS = ['idle', 'walk', 'atk', 'cast', 'jump'];
const FACING_KEYS = ['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown'];
function isRelativeAssetPath(urlPath) {
    if (!urlPath || urlPath.trim() !== urlPath)
        return false;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlPath))
        return false;
    if (urlPath.startsWith('//') || urlPath.startsWith('/'))
        return false;
    return urlPath.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}
function validateCharacter3DProfile(profile) {
    const errors = [];
    if (profile.mode !== 'webgl2-skinned')
        errors.push(`mode 非法: ${String(profile.mode)}`);
    if (profile.jointCount !== exports.HERO_3D_MODEL_ACCOUNT.jointCount) {
        errors.push(`jointCount=${profile.jointCount} 应为 ${exports.HERO_3D_MODEL_ACCOUNT.jointCount}`);
    }
    if (profile.primitiveCount !== exports.HERO_3D_MODEL_ACCOUNT.primitiveCount) {
        errors.push(`primitiveCount=${profile.primitiveCount} 应为 ${exports.HERO_3D_MODEL_ACCOUNT.primitiveCount}`);
    }
    if (!(profile.modelHeight > 0))
        errors.push(`modelHeight 非正: ${profile.modelHeight}`);
    if (!(profile.screenHeightPxAtReference > 0)) {
        errors.push(`screenHeightPxAtReference 非正: ${profile.screenHeightPxAtReference}`);
    }
    errors.push(...validateAssetRef('model', profile.model));
    for (const key of CLIP_KEYS) {
        const entry = profile.clips[key];
        if (!entry) {
            errors.push(`缺动作槽位 ${key}`);
            continue;
        }
        if ('embedded' in entry) {
            if (!entry.embedded.trim())
                errors.push(`槽位 ${key} 的 embedded 名为空`);
            continue;
        }
        errors.push(...validateAssetRef(`clips.${key}`, entry));
    }
    for (const facing of FACING_KEYS) {
        const yaw = profile.sourceViewYawDeg[facing];
        if (typeof yaw !== 'number' || !Number.isFinite(yaw))
            errors.push(`六向 ${facing} 缺 sourceViewYawDeg`);
    }
    for (const [name, att] of Object.entries(profile.attachments)) {
        if (!att.bone)
            errors.push(`挂点 ${name} 缺 bone`);
        if (att.enabled)
            errors.push(`挂点 ${name} 已启用——素材未过双门不得启用（方案 §11）`);
        if (att.localMatrix.length !== 16) {
            errors.push(`挂点 ${name} localMatrix 长度 ${att.localMatrix.length} 应为 16`);
        }
    }
    return errors;
}
function validateAssetRef(label, ref) {
    const errors = [];
    if (!ref.id)
        errors.push(`${label} 缺 id`);
    if (!HEX64.test(ref.sha256))
        errors.push(`${label} sha256 非 64 位小写十六进制: ${ref.sha256}`);
    if (!Number.isInteger(ref.byteLength) || ref.byteLength <= 0) {
        errors.push(`${label} byteLength 非正整数: ${ref.byteLength}`);
    }
    if (!isRelativeAssetPath(ref.urlPath)) {
        errors.push(`${label} urlPath 必须是相对 CDN base 的路径（禁完整 URL/前导斜杠/上跳）: ${ref.urlPath}`);
    }
    if (ref.mediaType !== 'model/gltf-binary' && ref.mediaType !== 'application/json') {
        errors.push(`${label} mediaType 未识别: ${String(ref.mediaType)}`);
    }
    return errors;
}
exports.HERO_3D_PROFILE_ERRORS = validateCharacter3DProfile(exports.HERO_3D_PROFILE);

  });
  // ---- config/battle-hex ----
  __def("config/battle-hex", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WF_BANNER = exports.TRIAL_FX_FALLBACK_DURATION_MS = exports.TRIAL_FX_01 = exports.BATTLE_HEX_RES = exports.SPRITE_PROFILES = exports.FACINGS = exports.PLAQUE_BUTTONS = exports.ATK_BTN = exports.CTRL_ACTIVE = exports.CTRL_TEXT = exports.CTRL_BUTTONS = exports.HIT_TOL = exports.PLAQUE_ART = exports.CTRL_ART = exports.COMPONENT_LAYOUT = exports.TOPBAR = exports.FONT_STACK = exports.DMG = exports.FX = exports.REJECT_HINTS = exports.ARC_BTNS = exports.HUD = exports.CHOREO = exports.CAST_FRAME_PERIOD_MS = exports.ANIM_LOOP_GROUPS = exports.ANIM_FRAMES = exports.PIECE = exports.HIGHLIGHT = exports.TILE_NOISE = exports.SHADOW = exports.BOARD_SHAPE = exports.ENV_WORLD = exports.TILE = exports.JUMP = exports.CAMERA = exports.FIELD = exports.BOARD = exports.TILE_SPRITES = exports.SIDE_DEPTH = exports.ROW_H = exports.TILE_H = exports.TILE_W = exports.TILE_SPEC = void 0;
exports.hexToWorld = hexToWorld;
exports.jumpParamsFor = jumpParamsFor;
exports.hexDist = hexDist;
const battle_1 = require("./battle");
exports.TILE_SPEC = {
    w: 88,
    hRatio: 0.7,
    rowRatio: 0.75,
    sideRatio: 0.12,
};
exports.TILE_W = exports.TILE_SPEC.w;
exports.TILE_H = exports.TILE_W * exports.TILE_SPEC.hRatio;
exports.ROW_H = exports.TILE_H * exports.TILE_SPEC.rowRatio;
exports.SIDE_DEPTH = exports.TILE_H * exports.TILE_SPEC.sideRatio;
exports.TILE_SPRITES = {
    grass: '',
    dirt: '',
};
function hexToWorld(q, r) {
    const col = q + Math.floor(r / 2);
    return { x: (col + (Math.abs(r) % 2 === 1 ? 0.5 : 0)) * exports.TILE_W, y: r * exports.ROW_H };
}
exports.BOARD = {
    cols: 16,
    rows: 16,
};
exports.FIELD = {
    colMin: 4,
    colMax: 11,
    rowMin: 2,
    rowMax: 13,
};
exports.CAMERA = {
    viewportCells: 7,
    dragThresholdPx: 8,
    worldPad: 40,
    followPad: 96,
    smoothingSec: 0.22,
};
exports.JUMP = {
    baseDuration: 0.6,
    baseHeight: 88,
    baseCells: 2,
    durationPerTile: 0.15,
    heightPerTileRatio: 0.25,
    maxDuration: 1.2,
    maxHeight: 176,
};
function jumpParamsFor(cells) {
    const extra = Math.max(0, cells - exports.JUMP.baseCells);
    const duration = Math.min(exports.JUMP.maxDuration, exports.JUMP.baseDuration + exports.JUMP.durationPerTile * extra);
    const height = Math.min(exports.JUMP.maxHeight, exports.JUMP.baseHeight * (1 + exports.JUMP.heightPerTileRatio * extra));
    return { duration, height };
}
function hexDist(a, b) {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
exports.TILE = {
    topGrass: '#7d9b4a',
    topDirtInner: '#8b703d',
    topDirtOuter: '#514623',
    dirtInnerRings: 1,
    side: '#57432a',
    sideShade: '#3e2f1c',
    sideLit: '#6b543a',
    sideDepth: exports.SIDE_DEPTH,
    edgeLight: '#d9c98f',
    edgeDark: '#2e2418',
    strokeWidth: 1.5,
};
exports.ENV_WORLD = { margin: 80 };
exports.BOARD_SHAPE = { rings: 2, notchPerMille: 200 };
exports.SHADOW = { offsetPx: 6, alpha: 0.22, alphaDeep: 0.1, bottomMul: 1.6, rgb: '20, 12, 4' };
exports.TILE_NOISE = { amp: 0.03, density: 0.18, step: 11, dotPx: 2 };
exports.HIGHLIGHT = {
    move: 'rgba(110, 220, 110, 0.38)',
    moveEdge: 'rgba(160, 240, 160, 0.8)',
    jump: 'rgba(245, 205, 70, 0.45)',
    jumpEdge: 'rgba(255, 230, 130, 0.95)',
    attack: 'rgba(225, 70, 55, 0.42)',
    attackEdge: 'rgba(255, 120, 100, 0.85)',
    selected: 'rgba(245, 205, 70, 0.5)',
    selectedEdge: 'rgba(255, 230, 130, 0.95)',
    cellHover: 'rgba(228, 52, 32, 0.72)',
    cellHoverEdge: 'rgba(255, 96, 72, 0.95)',
};
exports.PIECE = {
    heightPerTile: 2.0,
    bossScale: 1.25,
    feetBaselineRatio: 300 / 320,
    legacyFeetBaselineRatio: 240 / 256,
    walkFrameMs: 140,
    feetOffsetPx: 6,
    moveLerpSec: 0.3,
    jumpHeightPx: 88,
    deadAlpha: 0.45,
    hitFlashSec: 0.15,
};
exports.ANIM_FRAMES = {
    idle: [battle_1.BATTLE_FRAME.idle],
    walk: [battle_1.BATTLE_FRAME.walkStart, battle_1.BATTLE_FRAME.walkStart + 1, battle_1.BATTLE_FRAME.walkEnd],
    charge: [battle_1.BATTLE_FRAME.charge],
    strike: [battle_1.BATTLE_FRAME.strike],
    basic: [battle_1.BATTLE_FRAME.basic],
    hit: [0],
    dead: [0],
};
exports.ANIM_LOOP_GROUPS = ['walk', 'charge'];
exports.CAST_FRAME_PERIOD_MS = 280;
exports.CHOREO = {
    chargeSec: 0.1,
    strikeSec: battle_1.FINISH_WINDOW_MS / 1000,
    basicSec: battle_1.BASIC_DURATION_MS / 1000,
    hitSec: 0.18,
};
exports.HUD = {
    nameFontPx: 9,
    nameAlly: '#a8d8a8',
    nameEnemy: '#e89a9a',
    barW: 46,
    barH: 4,
    barGap: 2,
    aboveHead: 4,
    actionBarColor: '#5fd35f',
    hpBarColor: '#e04540',
    barBg: 'rgba(10, 10, 10, 0.6)',
    nameBg: 'rgba(10, 10, 10, 0.45)',
};
exports.ARC_BTNS = {
    ids: ['te', 'jue', 'qing', 'du'],
    labels: ['特', '绝', '轻', '毒'],
    headWidthRatio: 0.32,
    diameterPerHead: 2.4,
    arcRadiusPerHead: 3.6,
    angleFromDeg: 195,
    angleToDeg: 345,
    popSec: 0.18,
    colorBg: '#241a10',
    colorRim: '#d4af37',
    colorText: '#ffd870',
    colorTextDisabled: '#8a7a58',
    rimWidth: 2,
    rimWidthSelected: 3.5,
    rimColorSelected: '#fff0b0',
    disabledAlpha: 0.45,
};
exports.REJECT_HINTS = {
    bar: '行动条未就绪',
    range: '目标超出射程',
    invalid: '无法执行',
};
exports.FX = {
    slashSec: 0.28,
    hitSec: 0.25,
    slashColor: 'rgba(255, 235, 160, 0.9)',
    hitColor: 'rgba(230, 80, 60, 0.85)',
    maxRadius: 34,
};
exports.DMG = {
    sec: 0.6,
    risePx: 24,
    fontPerH: 0.026,
    fillColor: '#ffffff',
    strokeColor: '#1c1c1c',
    strokeWidth: 3,
    shakeSec: 0.2,
    shakePx: 3,
    shakeFreq: 55,
    staggerPx: 6,
    staggerWindowMs: 600,
    flushDeadlineSec: 1.5,
    missText: '闪避',
};
exports.FONT_STACK = '"Songti SC","STSong","SimSun",serif';
exports.TOPBAR = {
    artW: 1440,
    artH: 300,
    dimAlpha: 0.25,
    redFill: { x: 321, y: 94, w: 437, h: 43 },
    blueFill: { x: 322, y: 153, w: 315, h: 42 },
    nameBox: { x: 322, y: 23, w: 149, h: 47 },
    statusSlots: [
        { x: 321, y: 206, w: 84, h: 78 },
        { x: 420, y: 206, w: 83, h: 78 },
        { x: 517, y: 206, w: 78, h: 78 },
        { x: 625, y: 206, w: 82, h: 78 },
    ],
    hpGradient: ['#e22a23', '#931a15'],
    neiliGradient: ['#1a94f4', '#064faf'],
    nameFontPx: 44,
    pctFontPx: 34,
    pctPadRight: 6,
    textFill: 'rgb(242, 228, 192)',
    textStroke: 'rgb(42, 29, 18)',
    textStrokeWidth: 5,
    fontStack: '"Songti SC","STSong","SimSun",serif',
};
exports.COMPONENT_LAYOUT = {
    plaque: { leftRatio: 0.012, topRatio: 0.075, wRatio: 0.17, maxHRatio: 0.42 },
    ctrl: { rightRatio: 0.02, bottomRatio: 0.025, wRatio: 0.183, maxHRatio: 0.42 },
};
exports.CTRL_ART = { w: 223, h: 448 };
exports.PLAQUE_ART = { w: 310, h: 680 };
exports.HIT_TOL = { ctrl: 0, plaque: 0.15 };
exports.CTRL_BUTTONS = [
    { x: 5, y: 2, w: 216, h: 128, action: 'mode' },
    { x: 5, y: 163, w: 213, h: 126, action: 'speed' },
    { x: 5, y: 319, w: 213, h: 127, action: 'flee' },
];
exports.CTRL_TEXT = {
    fontStack: '"Songti SC","STSong","SimSun",serif',
    sizeRatio: 50 / 216,
    fill: 'rgb(242, 228, 192)',
    stroke: 'rgb(42, 29, 18)',
    strokeWidthRatio: 5 / 216,
    shadowOffsetRatio: 3 / 216,
    centerRatio: { x: 132 / 216, y: 66 / 216 },
    normal: { mode: '托管', speed: '加速' },
    active: { mode: '自动', speed: '两倍' },
};
exports.CTRL_ACTIVE = {
    goldFrame: 'rgba(255, 205, 95, 0.95)',
    frameWidthRatio: 4 / 216,
};
exports.ATK_BTN = {
    label: '攻',
    angleDeg: 90,
    fontRatio: 0.52,
};
exports.PLAQUE_BUTTONS = [
    { xRatio: 26 / 310, yRatio: 0.26, wRatio: 273 / 310, hRatio: 0.21, label: '装备' },
    { xRatio: 26 / 310, yRatio: 0.55, wRatio: 273 / 310, hRatio: 0.21, label: '武功' },
];
exports.FACINGS = [
    'right',
    'rightup',
    'leftup',
    'left',
    'leftdown',
    'rightdown',
];
const HERO_BATTLE45 = 'assets/characters/hero/battle45';
const SHANZEI_A_BATTLE45 = 'assets/characters/enemy/shanzei_a/battle45';
const SHANZEI_B_BATTLE45 = 'assets/characters/enemy/shanzei_b/battle45';
function shanzeiDirectionalProfile(dir) {
    return {
        mode: 'directional',
        clipCounts: { idle: 1, walk: 2, jump: 0, atk: 2, cast: 0, die: 1 },
        frameSrc: (clip, facing, ordinal) => clip === 'idle' ? `${dir}/battle_idle_${facing}.png` : `${dir}/${clip}_${facing}_${ordinal}.png`,
        sharedSrc: { die: `${dir}/die_common.png` },
        stateMap: {
            idle: { clip: 'idle', from: 1, to: 1 },
            walk: { clip: 'walk', from: 1, to: 2 },
            charge: { clip: 'atk', from: 1, to: 2 },
            strike: { clip: 'atk', from: 1, to: 2 },
            basic: { clip: 'atk', from: 1, to: 2 },
            hit: { clip: 'idle', from: 1, to: 1 },
            dead: { clip: 'die', from: 1, to: 1 },
        },
        loopStates: ['strike'],
    };
}
const SHANZEI_LEGACY_PROFILE = {
    mode: 'legacy',
    frameCount: 8,
    frameSrc: (i) => `assets/ui/frames/battle/spr_shanzei/spr_shanzei_0${i}_transparent.png`,
};
exports.SPRITE_PROFILES = {
    hero: {
        mode: 'directional',
        clipCounts: { idle: 1, walk: 2, jump: 1, atk: 2, cast: 3, die: 1 },
        frameSrc: (clip, facing, ordinal) => clip === 'idle'
            ? `${HERO_BATTLE45}/battle_idle_${facing}.png`
            : clip === 'jump'
                ? `${HERO_BATTLE45}/jump_${facing}_2.png`
                : `${HERO_BATTLE45}/${clip}_${facing}_${ordinal}.png`,
        sharedSrc: { die: `${HERO_BATTLE45}/die_common.png` },
        stateMap: {
            idle: { clip: 'idle', from: 1, to: 1 },
            walk: { clip: 'walk', from: 1, to: 2 },
            charge: { clip: 'cast', from: 1, to: 3 },
            strike: { clip: 'cast', from: 2, to: 3 },
            basic: { clip: 'atk', from: 1, to: 2 },
            hit: { clip: 'idle', from: 1, to: 1 },
            dead: { clip: 'die', from: 1, to: 1 },
        },
    },
    'npc-shanzei': SHANZEI_LEGACY_PROFILE,
    'npc-shanzei-a': shanzeiDirectionalProfile(SHANZEI_A_BATTLE45),
    'npc-shanzei-b': shanzeiDirectionalProfile(SHANZEI_B_BATTLE45),
    'npc-shanzei-legacy': SHANZEI_LEGACY_PROFILE,
};
exports.BATTLE_HEX_RES = {
    ver: 't45v2',
    env: 'assets/ui/pixel/battle/raw/battle_env_pure.png',
    topbar: 'assets/ui/pixel/battle/components/topbar_base.png',
    plaque: 'assets/ui/pixel/battle/components/plaque_l_alpha.png',
    ctrlFaces: {
        tuoguan: 'assets/ui/pixel/battle/components/ctrl_tuoguan_face.png',
        jiasu: 'assets/ui/pixel/battle/components/ctrl_jiasu_face.png',
        flee: 'assets/ui/pixel/battle/components/ctrl_flee.png',
    },
    statusIcons: {
        poison: 'assets/ui/pixel/battle/components/icon_status_poison.png',
        blood: 'assets/ui/pixel/battle/components/icon_status_blood.png',
        skull: 'assets/ui/pixel/battle/components/icon_status_skull.png',
    },
    profiles: exports.SPRITE_PROFILES,
};
exports.TRIAL_FX_01 = {
    id: 'trial_fx_01',
    durationSource: 'cast',
    anchor: 'casterCellCenter',
    layers: [
        {
            id: 'L1',
            frameDir: 'assets/ui/fx/trial_fx_01/L1',
            frames: Array.from({ length: 12 }, (_, i) => `15-1_f${String(i + 1).padStart(2, '0')}.png`),
            windowStart: 0,
            windowEnd: 0.45,
            scale: 0.5,
            anchorOffsetPx: { x: 0, y: 0 },
            blendMode: 'lighter',
        },
        {
            id: 'L2',
            frameDir: 'assets/ui/fx/trial_fx_01/L2',
            frames: Array.from({ length: 22 }, (_, i) => `14-1_f${String(i + 1).padStart(2, '0')}.png`),
            windowStart: 0.35,
            windowEnd: 0.9,
            scale: 1.4,
            anchorOffsetPx: { x: 0, y: 0 },
            blendMode: 'lighter',
        },
        {
            id: 'L3',
            frameDir: 'assets/ui/fx/trial_fx_01/L3',
            frames: Array.from({ length: 6 }, (_, i) => `125-1_f${String(i + 1).padStart(2, '0')}.png`),
            windowStart: 0.78,
            windowEnd: 1,
            scale: 1.2,
            anchorOffsetPx: { x: 0, y: 0 },
            blendMode: 'lighter',
        },
    ],
};
exports.TRIAL_FX_FALLBACK_DURATION_MS = 3000;
exports.WF_BANNER = {
    durationSec: 1.0,
    fontMul: 1.5,
    specialColor: '#D4AF37',
    ultimateGradTop: '#FFD66B',
    ultimateGradBottom: '#E2574C',
    strokeColor: '#2B2B2B',
    strokeWidthRatio: 0.12,
    strokeMinPx: 2,
    shadowColor: 'rgba(43, 43, 43, 0.45)',
    shadowOffsetY: 2,
    shadowBlurPx: 4,
    risePx: 24,
    fadeInEnd: 0.1,
    fadeOutStart: 0.65,
    maxWidthRatio: 0.82,
    safePx: 8,
    headOffsetPx: Math.round(exports.TILE_H * exports.PIECE.heightPerTile * exports.PIECE.feetBaselineRatio - exports.PIECE.feetOffsetPx) + 29,
};

  });
  // ---- config/battle ----
  __def("config/battle", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEBUG_ENTRY = exports.RESULT_OVERLAY = exports.BASIC_DURATION_MS = exports.FINISH_WINDOW_MS = exports.SPEED_FACTOR = exports.SKILL_BTN = exports.ROUND_BTN = exports.TOP_PANEL = exports.BAR = exports.BATTLE_FRAME = exports.FX = exports.MOVE = exports.BODY_ANCHOR = exports.FOOT_DROP = exports.BODY_CALIB = exports.BOSS_SCALE = exports.SPRITE_HEIGHT_PER_TILE = exports.PLATFORM = exports.CAMERA = exports.TILE_HALF_H = exports.TILE_HALF_W = exports.TILE_SIZE = exports.ENEMY_ROW_Y = exports.PLAYER_ROW_Y = exports.BOARD_ROWS = exports.BOARD_COLS = void 0;
exports.battleFrameSrc = battleFrameSrc;
exports.BOARD_COLS = 8;
exports.BOARD_ROWS = 12;
exports.PLAYER_ROW_Y = 10;
exports.ENEMY_ROW_Y = 1;
exports.TILE_SIZE = 54;
exports.TILE_HALF_W = exports.TILE_SIZE * 0.866;
exports.TILE_HALF_H = exports.TILE_SIZE * 0.5;
exports.CAMERA = {
    worldPad: 40,
    dragThresholdPx: 8,
};
exports.PLATFORM = {
    fill: 'rgba(163, 177, 138, 0.92)',
    edge: 'rgba(43, 43, 43, 0.75)',
    edgeWidth: 3,
    side: 'rgba(74, 90, 62, 0.7)',
    sideDepth: 10,
    grid: 'rgba(43, 43, 43, 0.20)',
    gridWidth: 1,
};
exports.SPRITE_HEIGHT_PER_TILE = {
    humanoid: 1.6,
    wolf: 0.8,
};
exports.BOSS_SCALE = 1.3;
exports.BODY_CALIB = {
    hero: {
        ground: { cx: 0.533, bottom: 0.988, ratio: 0.983 },
        attack: { cx: 0.521, bottom: 0.951, ratio: 0.929 },
    },
    humanoid: {
        ground: { cx: 0.554, bottom: 0.966, ratio: 0.955 },
        attack: { cx: 0.505, bottom: 0.94, ratio: 0.87 },
    },
    wolf: {
        ground: { cx: 0.505, bottom: 0.961, ratio: 0.512 },
        attack: { cx: 0.505, bottom: 0.593, ratio: 0.489 },
    },
    boss: {
        ground: { cx: 0.481, bottom: 0.861, ratio: 0.638 },
        attack: { cx: 0.572, bottom: 0.782, ratio: 0.613 },
    },
};
exports.FOOT_DROP = 0.2;
exports.BODY_ANCHOR = {
    hero: { cx: 0.527, bottom: 0.986 },
    humanoid: { cx: 0.546, bottom: 0.963 },
    wolf: { cx: 0.506, bottom: 0.961 },
    boss: { cx: 0.447, bottom: 0.977 },
};
exports.MOVE = {
    lerpSec: 0.3,
    qinggongArcTiles: 0.6,
    baseRange: 2,
    qinggongRangeFactor: 2,
    qinggongMpCost: 10,
};
exports.FX = {
    chargeSec: 0.1,
    mainSecMin: 0.3,
    mainSecMax: 0.5,
    hitFlashSec: 0.15,
    fadeSec: 0.12,
    shakeSec: 0.15,
    shakeAmpPx: 5,
    basicLungeSec: 0.16,
    strikeSec: 0.3,
    basicTotalSec: 0.32,
};
exports.BATTLE_FRAME = {
    idle: 7,
    walkStart: 1,
    walkEnd: 3,
    charge: 4,
    strike: 5,
    basic: 6,
    walkFrameMs: 140,
};
exports.BAR = {
    max: 100,
    nameColorAlly: '#4A7A6B',
    nameColorEnemy: '#E2574C',
    actionBarColor: '#D4AF37',
    hpBarColor: '#E2574C',
    mpBarColor: '#4A7A9B',
};
exports.TOP_PANEL = {
    padRatio: 0.03,
    heightRatio: 0.11,
    avatarRatio: 0.075,
};
exports.ROUND_BTN = {
    radiusRatio: 0.07,
    gapRatio: 0.025,
    bottomInsetRatio: 0.03,
    iconFontR: 0.62,
    labelFontR: 0.3,
};
exports.SKILL_BTN = {
    gapRatio: 0.02,
    aboveActorPx: 90,
};
exports.SPEED_FACTOR = { normal: 1, fast: 2 };
exports.FINISH_WINDOW_MS = 300;
exports.BASIC_DURATION_MS = 700;
exports.RESULT_OVERLAY = {
    fadeInSec: 0.3,
};
function battleFrameSrc(kind, i) {
    const dir = kind === 'hero' ? 'hero' : 'spr_' + kind.replace('npc-', '').replace(/-/g, '_');
    return `assets/ui/frames/battle/${dir}/${dir}_0${i}_transparent.png`;
}
exports.DEBUG_ENTRY = {
    queryFlag: '__BATTLE_DEBUG__',
};

  });
  // ---- types ----
  __def("types", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_SCENE_ASSETS = void 0;
exports.EMPTY_SCENE_ASSETS = { bg: null, heroFrames: [], buttonIcons: [] };

  });
  // ---- net/character-asset-loader ----
  __def("net/character-asset-loader", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CharacterAssetRefError = void 0;
exports.isRelativeAssetPath = isRelativeAssetPath;
exports.joinCdnUrl = joinCdnUrl;
exports.assertValidAssetRef = assertValidAssetRef;
exports.createCharacterAssetLoader = createCharacterAssetLoader;
class CharacterAssetRefError extends Error {
    constructor(assetId, message) {
        super('[character-asset-loader] ' + message);
        this.name = 'CharacterAssetRefError';
        this.assetId = assetId;
    }
}
exports.CharacterAssetRefError = CharacterAssetRefError;
const SHA256_HEX = /^[0-9a-f]{64}$/;
function isRelativeAssetPath(urlPath) {
    if (!urlPath || urlPath.trim() !== urlPath)
        return false;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlPath))
        return false;
    if (urlPath.startsWith('//') || urlPath.startsWith('/'))
        return false;
    return urlPath.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}
function joinCdnUrl(cdnBaseUrl, urlPath) {
    const base = cdnBaseUrl.replace(/\/+$/, '');
    return base + '/' + urlPath;
}
function assertValidAssetRef(ref) {
    if (!ref.id)
        throw new CharacterAssetRefError(String(ref.id), '缺 assetId');
    if (!SHA256_HEX.test(ref.sha256)) {
        throw new CharacterAssetRefError(ref.id, 'sha256 非 64 位小写十六进制: ' + ref.sha256);
    }
    if (!Number.isInteger(ref.byteLength) || ref.byteLength <= 0) {
        throw new CharacterAssetRefError(ref.id, 'byteLength 非正整数: ' + ref.byteLength);
    }
    if (!isRelativeAssetPath(ref.urlPath)) {
        throw new CharacterAssetRefError(ref.id, 'urlPath 必须是相对 CDN base 的路径（禁完整 URL/协议/前导斜杠/上跳）: ' + ref.urlPath);
    }
}
function createCharacterAssetLoader(options) {
    var _a, _b, _c;
    const platform = options.platform;
    const retryDelays = (_a = options.retryDelaysMs) !== null && _a !== void 0 ? _a : [1000, 3000];
    const downloadTimeoutMs = (_b = options.downloadTimeoutMs) !== null && _b !== void 0 ? _b : 15000;
    const sleep = (_c = options.sleep) !== null && _c !== void 0 ? _c : ((ms) => new Promise((resolve) => { setTimeout(resolve, ms); }));
    const stats = {
        downloadAttempts: 0, downloads: 0, cacheHits: 0, staleFallbacks: 0, failures: 0, cacheWriteFailures: 0,
        structureRejects: 0, shaMismatches: 0, byteLengthMismatches: 0, timeouts: 0, networkErrors: 0,
        tempFilesRemoved: 0,
    };
    const inflight = new Map();
    function load(ref) {
        assertValidAssetRef(ref);
        const existing = inflight.get(ref.id);
        if (existing)
            return existing;
        const task = loadOnce(ref).then((r) => { inflight.delete(ref.id); return r; }, (e) => { inflight.delete(ref.id); throw e; });
        inflight.set(ref.id, task);
        return task;
    }
    async function loadOnce(ref) {
        const diags = [];
        const cached = await safeCacheGet(ref.id, diags);
        if (cached && cached.sha256 === ref.sha256 && cached.byteLength === ref.byteLength) {
            try {
                const bytes = await platform.readFileBytes(cached.savedPath);
                if (bytes.byteLength === ref.byteLength) {
                    stats.cacheHits++;
                    return result(ref, 'cache-hit', bytes, cached.savedPath, 0, diags, null);
                }
                diags.push('cache-length-mismatch:' + bytes.byteLength);
            }
            catch (error) {
                diags.push('cache-read-failed:' + messageOf(error));
            }
            await safeCacheRemove(ref.id, diags);
        }
        const maxAttempts = 1 + retryDelays.length;
        let attempts = 0;
        let lastError = null;
        for (let i = 0; i < maxAttempts; i++) {
            attempts++;
            if (i > 0)
                await sleep(retryDelays[i - 1]);
            const outcome = await attemptDownload(ref, diags);
            if (outcome.ok) {
                stats.downloads++;
                return result(ref, 'downloaded', outcome.bytes, outcome.savedPath, attempts, diags, null);
            }
            lastError = outcome.error;
        }
        const lkg = cached;
        if (lkg && lkg.sha256 !== ref.sha256) {
            try {
                const bytes = await platform.readFileBytes(lkg.savedPath);
                if (bytes.byteLength === lkg.byteLength && structureOk(bytes, ref, diags)) {
                    stats.staleFallbacks++;
                    diags.push('stale-3d-cache');
                    return result(ref, 'stale-3d-cache', bytes, lkg.savedPath, attempts, diags, null);
                }
                diags.push('stale-lkg-rejected');
            }
            catch (error) {
                diags.push('stale-lkg-read-failed:' + messageOf(error));
            }
        }
        stats.failures++;
        return result(ref, 'failed', null, null, attempts, diags, lastError);
    }
    async function attemptDownload(ref, diags) {
        const url = joinCdnUrl(options.cdnBaseUrl, ref.urlPath);
        const tempName = ref.id + '.tmp';
        let tempPath = null;
        stats.downloadAttempts++;
        try {
            const bytes = await withTimeout(platform.downloadArrayBuffer(url, { timeoutMs: downloadTimeoutMs }), downloadTimeoutMs, () => { stats.timeouts++; });
            if (bytes.byteLength !== ref.byteLength) {
                stats.byteLengthMismatches++;
                diags.push('byteLength-mismatch:' + bytes.byteLength + '!=' + ref.byteLength);
                throw new Error('byteLength ' + bytes.byteLength + ' != ' + ref.byteLength);
            }
            tempPath = await platform.writeTempFile(tempName, bytes);
            const digest = await platform.sha256File(tempPath);
            const sha = digest !== null && digest !== void 0 ? digest : (await platform.sha256Bytes(bytes));
            if (sha !== ref.sha256) {
                stats.shaMismatches++;
                diags.push('sha256-mismatch');
                throw new Error('sha256 ' + sha + ' != ' + ref.sha256);
            }
            if (!structureOk(bytes, ref, diags)) {
                throw new Error('结构不符（' + ref.id + '）');
            }
            let savedPath = null;
            try {
                const entry = await platform.cachePut({
                    assetId: ref.id,
                    sha256: ref.sha256,
                    byteLength: ref.byteLength,
                    tempPath,
                });
                savedPath = entry.savedPath;
                tempPath = null;
            }
            catch (error) {
                stats.cacheWriteFailures++;
                diags.push('cache-write-failed:' + messageOf(error));
                if (tempPath) {
                    await removeTemp(tempPath, diags);
                    tempPath = null;
                }
            }
            return { ok: true, bytes, savedPath };
        }
        catch (error) {
            if (tempPath)
                await removeTemp(tempPath, diags);
            else
                await platform.removeFile(tempName).catch(() => undefined);
            const msg = messageOf(error);
            const integrity = /^sha256 |^byteLength |结构不符|timeout/i.test(msg);
            if (!integrity)
                stats.networkErrors++;
            diags.push('attempt-failed:' + msg);
            return { ok: false, error: msg };
        }
    }
    async function removeTemp(path, diags) {
        try {
            await platform.removeFile(path);
            stats.tempFilesRemoved++;
        }
        catch (error) {
            diags.push('temp-remove-failed:' + messageOf(error));
        }
    }
    function structureOk(bytes, ref, diags) {
        if (!options.structureValidator)
            return true;
        try {
            options.structureValidator(bytes, ref);
            return true;
        }
        catch (error) {
            stats.structureRejects++;
            diags.push('structure-reject:' + messageOf(error));
            return false;
        }
    }
    async function safeCacheGet(assetId, diags) {
        try {
            return await platform.cacheGet(assetId);
        }
        catch (error) {
            diags.push('cache-get-failed:' + messageOf(error));
            return null;
        }
    }
    async function safeCacheRemove(assetId, diags) {
        try {
            await platform.cacheRemove(assetId);
        }
        catch (error) {
            diags.push('cache-remove-failed:' + messageOf(error));
        }
    }
    return {
        load,
        async loadMany(refs) {
            const out = [];
            for (const ref of refs)
                out.push(await load(ref));
            return out;
        },
        async loadProfile(profile) {
            const clipResults = {};
            const diagnostics = [];
            const model = await load(profile.model);
            diagnostics.push(...model.diagnostics.map((d) => 'model:' + d));
            const keys = Object.keys(profile.clips);
            for (const key of keys) {
                const entry = profile.clips[key];
                if ('embedded' in entry)
                    continue;
                const res = await load(entry);
                clipResults[key] = res;
                diagnostics.push(...res.diagnostics.map((d) => key + ':' + d));
            }
            const all = [model, ...Object.values(clipResults)];
            const anyFailed = all.some((r) => r && r.status === 'failed');
            const anyStale = all.some((r) => r && r.status === 'stale-3d-cache');
            return {
                status: anyFailed ? 'failed' : anyStale ? 'stale-3d-cache' : 'ready',
                model,
                clips: clipResults,
                diagnostics,
            };
        },
        stats() {
            return Object.assign({}, stats);
        },
    };
}
function result(ref, status, bytes, savedPath, attempts, diagnostics, error) {
    return {
        assetId: ref.id,
        ref,
        status,
        bytes,
        savedPath,
        attempts,
        diagnostics: diagnostics.slice(),
        error,
    };
}
function withTimeout(promise, timeoutMs, onTimeout) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            onTimeout();
            reject(new Error('download timeout ' + timeoutMs + 'ms'));
        }, timeoutMs);
        promise.then((value) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        }, (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}

  });
  // ---- ui/character3d/platform ----
  __def("ui/character3d/platform", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

  });
  // ---- ui/character3d/renderer ----
  __def("ui/character3d/renderer", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHARACTER3D_SHADER_SOURCES = void 0;
exports.createCharacter3DRenderer = createCharacter3DRenderer;
const glb_1 = require("./glb");
const math_1 = require("./math");
const FLOATS_PER_VERTEX = 16;
const STRIDE = FLOATS_PER_VERTEX * 4;
const LOC = { pos: 0, normal: 1, uv: 2, joints: 3, weights: 4 };
const COLOR_SPACE_GLSL = [
    'vec3 srgbToLinear(vec3 c) {',
    '  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));',
    '}',
    'vec3 linearToSrgb(vec3 c) {',
    '  vec3 lo = c * 12.92;',
    '  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;',
    '  return mix(lo, hi, step(vec3(0.0031308), c));',
    '}',
].join('\n');
function skinVertexSrc(jointCount) {
    return [
        '#version 300 es',
        'precision highp float;',
        'layout(location = 0) in vec3 aPos;',
        'layout(location = 1) in vec3 aNormal;',
        'layout(location = 2) in vec2 aUv;',
        'layout(location = 3) in vec4 aJoints;',
        'layout(location = 4) in vec4 aWeights;',
        'uniform mat4 uProjection;',
        'uniform mat4 uModel;',
        `uniform mat4 uBones[${jointCount}];`,
        'out vec2 vUv;',
        'out vec3 vNormal;',
        'void main() {',
        '  int j0 = int(aJoints.x + 0.5);',
        '  int j1 = int(aJoints.y + 0.5);',
        '  int j2 = int(aJoints.z + 0.5);',
        '  int j3 = int(aJoints.w + 0.5);',
        '  mat4 skin = uBones[j0] * aWeights.x + uBones[j1] * aWeights.y',
        '            + uBones[j2] * aWeights.z + uBones[j3] * aWeights.w;',
        '  vec3 deformed = (skin * vec4(aPos, 1.0)).xyz;',
        '  vNormal = mat3(skin) * aNormal;',
        '  vUv = aUv;',
        '  gl_Position = uProjection * uModel * vec4(deformed, 1.0);',
        '}',
    ].join('\n');
}
const SKIN_FRAGMENT_SRC = [
    '#version 300 es',
    'precision mediump float;',
    'in vec2 vUv;',
    'in vec3 vNormal;',
    'uniform sampler2D uBaseColor;',
    'uniform vec3 uLightDir;',
    'uniform float uAmbient;',
    'uniform float uDirIntensity;',
    'uniform float uDiffuseNorm;',
    'uniform float uAlpha;',
    'uniform float uUseTexture;',
    'out vec4 fragColor;',
    COLOR_SPACE_GLSL,
    'void main() {',
    '  vec3 base = uUseTexture > 0.5 ? srgbToLinear(texture(uBaseColor, vUv).rgb) : vec3(0.82, 0.78, 0.72);',
    '  vec3 n = normalize(vNormal);',
    '  float ndl = max(dot(n, normalize(uLightDir)), 0.0);',
    '  vec3 lit = base * (uAmbient + uDirIntensity * ndl) * uDiffuseNorm;',
    '  fragColor = vec4(linearToSrgb(lit) * uAlpha, uAlpha);',
    '}',
].join('\n');
const FULLSCREEN_VERTEX_SRC = [
    '#version 300 es',
    'precision highp float;',
    'out vec2 vUv;',
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  vUv = p;',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}',
].join('\n');
const FXAA_FRAGMENT_SRC = [
    '#version 300 es',
    'precision mediump float;',
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTexel;',
    'uniform float uEdgeThreshold;',
    'uniform float uEdgeThresholdMin;',
    'uniform float uSubpixelQuality;',
    'uniform float uSubpixelTrim;',
    'uniform float uAlphaThreshold;',
    'out vec4 fragColor;',
    'const int MAX_SEARCH_STEPS = 16;',
    'const float MAX_SPAN = 8.0;',
    'uniform int uSearchSteps;',
    'float luma(vec4 c) { return dot(c.rgb, vec3(0.299, 0.587, 0.114)) / max(c.a, 1e-4); }',
    'bool inside(vec4 c) { return c.a > uAlphaThreshold; }',
    'void main() {',
    '  vec2 t = uTexel;',
    '  vec4 cM = texture(uTex, vUv);',
    '  if (!inside(cM)) {',
    '    vec4 acc = vec4(0.0);',
    '    for (int i = -1; i <= 1; i++) {',
    '      for (int j = -1; j <= 1; j++) {',
    '        acc += texture(uTex, vUv + vec2(float(i), float(j)) * t);',
    '      }',
    '    }',
    '    fragColor = acc / 9.0;',
    '    return;',
    '  }',
    '  vec4 nNW = texture(uTex, vUv + vec2(-1.0, -1.0) * t);',
    '  vec4 nNE = texture(uTex, vUv + vec2( 1.0, -1.0) * t);',
    '  vec4 nSW = texture(uTex, vUv + vec2(-1.0,  1.0) * t);',
    '  vec4 nSE = texture(uTex, vUv + vec2( 1.0,  1.0) * t);',
    '  float lM = luma(cM);',
    '  float lNW = inside(nNW) ? luma(nNW) : lM;',
    '  float lNE = inside(nNE) ? luma(nNE) : lM;',
    '  float lSW = inside(nSW) ? luma(nSW) : lM;',
    '  float lSE = inside(nSE) ? luma(nSE) : lM;',
    '  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));',
    '  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));',
    '  float contrast = lMax - lMin;',
    '  if (contrast < max(uEdgeThresholdMin, lMax * uEdgeThreshold)) { fragColor = cM; return; }',
    '  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));',
    '  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * uSubpixelTrim, 1.0 / 128.0);',
    '  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);',
    '  dir = clamp(dir * rcpDirMin, -MAX_SPAN, MAX_SPAN) * t;',
    '  float band = max(uEdgeThresholdMin, lMax * uEdgeThreshold);',
    '  float dNeg = 1.0;',
    '  float dPos = 1.0;',
    '  vec2 posNeg = vUv - dir;',
    '  vec2 posPos = vUv + dir;',
    '  for (int i = 0; i < MAX_SEARCH_STEPS; i++) {',
    '    if (i >= uSearchSteps) { break; }',
    '    vec4 sNeg = texture(uTex, posNeg);',
    '    vec4 sPos = texture(uTex, posPos);',
    '    bool outNeg = !inside(sNeg) || abs(luma(sNeg) - lM) > band;',
    '    bool outPos = !inside(sPos) || abs(luma(sPos) - lM) > band;',
    '    if (outNeg && outPos) { break; }',
    '    if (!outNeg) { posNeg -= dir; dNeg += 1.0; }',
    '    if (!outPos) { posPos += dir; dPos += 1.0; }',
    '  }',
    '  float blend = clamp(0.5 - min(dNeg, dPos) / (dNeg + dPos), 0.0, 1.0);',
    '  vec4 avg = 0.5 * (texture(uTex, vUv + dir * 0.5) + texture(uTex, vUv - dir * 0.5));',
    '  float subpixel = clamp(abs(lMin - lMax) / max(lMax, 1e-4) * uSubpixelTrim * 4.0, 0.0, 1.0);',
    '  float w = blend * mix(1.0, uSubpixelQuality, subpixel);',
    '  fragColor = mix(cM, avg, w);',
    '  fragColor.a = max(fragColor.a, cM.a * (1.0 - w));',
    '}',
].join('\n');
function createCharacter3DRenderer(options) {
    var _a;
    const { canvas, model, baseColor, platform, light, fxaa } = options;
    const jointCount = model.jointNodes.length;
    const diags = [];
    const counters = { drawCalls: 0, paletteUploads: 0, frames: 0 };
    const vertexData = (0, glb_1.buildVertexInterleave)(model);
    const projection = new Float32Array(16);
    const lightDirWorld = new Float32Array(3);
    const lightDirModel = new Float32Array(3);
    const lightDirNorm = Math.hypot(light.direction[0], light.direction[1], light.direction[2]) || 1;
    lightDirWorld[0] = light.direction[0] / lightDirNorm;
    lightDirWorld[1] = light.direction[1] / lightDirNorm;
    lightDirWorld[2] = light.direction[2] / lightDirNorm;
    let status = 'ready';
    let restoreAttempted = false;
    let backbufferW = canvas.width;
    let backbufferH = canvas.height;
    let edgeMode = (_a = options.forceEdgeMode) !== null && _a !== void 0 ? _a : 'fxaa';
    let contextAttributes = null;
    let maxVertexUniformVectors = null;
    let skin = null;
    let fxaaProgram = null;
    let fbo = null;
    let fboTexture = null;
    let depthBuffer = null;
    const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        depth: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'default',
    });
    if (!gl) {
        status = 'failed';
        diags.push('webgl2-context-unavailable');
    }
    function note(msg) {
        if (diags.indexOf(msg) < 0)
            diags.push(msg);
    }
    function fail(msg) {
        throw new Error('[character3d/renderer] ' + msg);
    }
    function compile(type, src, label) {
        const g = gl;
        const sh = g.createShader(type);
        if (!sh)
            fail(label + ': createShader 返回空');
        g.shaderSource(sh, src);
        g.compileShader(sh);
        if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) {
            const log = g.getShaderInfoLog(sh) || '';
            g.deleteShader(sh);
            fail(label + ' 着色器编译失败: ' + log);
        }
        return sh;
    }
    function link(vsSrc, fsSrc, label) {
        const g = gl;
        const vs = compile(g.VERTEX_SHADER, vsSrc, label + '.vs');
        const fs = compile(g.FRAGMENT_SHADER, fsSrc, label + '.fs');
        const p = g.createProgram();
        if (!p)
            fail(label + ': createProgram 返回空');
        g.attachShader(p, vs);
        g.attachShader(p, fs);
        g.linkProgram(p);
        g.deleteShader(vs);
        g.deleteShader(fs);
        if (!g.getProgramParameter(p, g.LINK_STATUS)) {
            const log = g.getProgramInfoLog(p) || '';
            g.deleteProgram(p);
            fail(label + ' link 失败: ' + log);
        }
        return p;
    }
    function buildSkinProgram() {
        const g = gl;
        const program = link(skinVertexSrc(jointCount), SKIN_FRAGMENT_SRC, 'skin');
        const u = {
            projection: g.getUniformLocation(program, 'uProjection'),
            model: g.getUniformLocation(program, 'uModel'),
            bones: g.getUniformLocation(program, 'uBones[0]'),
            baseColor: g.getUniformLocation(program, 'uBaseColor'),
            lightDir: g.getUniformLocation(program, 'uLightDir'),
            ambient: g.getUniformLocation(program, 'uAmbient'),
            dirIntensity: g.getUniformLocation(program, 'uDirIntensity'),
            diffuseNorm: g.getUniformLocation(program, 'uDiffuseNorm'),
            alpha: g.getUniformLocation(program, 'uAlpha'),
            useTexture: g.getUniformLocation(program, 'uUseTexture'),
        };
        if (!u.bones)
            fail('uBones[0] uniform 定位失败（被优化掉 ⇒ 整条蒙皮通路无效）');
        const vao = g.createVertexArray();
        if (!vao)
            fail('createVertexArray 返回空');
        g.bindVertexArray(vao);
        const vbo = g.createBuffer();
        if (!vbo)
            fail('createBuffer 返回空');
        g.bindBuffer(g.ARRAY_BUFFER, vbo);
        g.bufferData(g.ARRAY_BUFFER, vertexData, g.STATIC_DRAW);
        g.enableVertexAttribArray(LOC.pos);
        g.vertexAttribPointer(LOC.pos, 3, g.FLOAT, false, STRIDE, 0);
        g.enableVertexAttribArray(LOC.normal);
        g.vertexAttribPointer(LOC.normal, 3, g.FLOAT, false, STRIDE, 12);
        g.enableVertexAttribArray(LOC.uv);
        g.vertexAttribPointer(LOC.uv, 2, g.FLOAT, false, STRIDE, 24);
        g.enableVertexAttribArray(LOC.joints);
        g.vertexAttribPointer(LOC.joints, 4, g.FLOAT, false, STRIDE, 32);
        g.enableVertexAttribArray(LOC.weights);
        g.vertexAttribPointer(LOC.weights, 4, g.FLOAT, false, STRIDE, 48);
        const ibo = g.createBuffer();
        if (!ibo)
            fail('createBuffer(ibo) 返回空');
        g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, ibo);
        g.bufferData(g.ELEMENT_ARRAY_BUFFER, model.mesh.indices, g.STATIC_DRAW);
        g.bindVertexArray(null);
        const texture = g.createTexture();
        if (!texture)
            fail('createTexture 返回空');
        g.bindTexture(g.TEXTURE_2D, texture);
        g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, baseColor.image);
        g.generateMipmap(g.TEXTURE_2D);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
        g.bindTexture(g.TEXTURE_2D, null);
        return { program, u, vao, vbo, ibo, texture };
    }
    function buildFxaaProgram() {
        const g = gl;
        const program = link(FULLSCREEN_VERTEX_SRC, FXAA_FRAGMENT_SRC, 'fxaa');
        const vao = g.createVertexArray();
        if (!vao)
            fail('createVertexArray(fxaa) 返回空');
        return {
            program,
            vao,
            u: {
                tex: g.getUniformLocation(program, 'uTex'),
                texel: g.getUniformLocation(program, 'uTexel'),
                edgeThreshold: g.getUniformLocation(program, 'uEdgeThreshold'),
                edgeThresholdMin: g.getUniformLocation(program, 'uEdgeThresholdMin'),
                searchSteps: g.getUniformLocation(program, 'uSearchSteps'),
                subpixelQuality: g.getUniformLocation(program, 'uSubpixelQuality'),
                subpixelTrim: g.getUniformLocation(program, 'uSubpixelTrim'),
                alphaThreshold: g.getUniformLocation(program, 'uAlphaThreshold'),
            },
        };
    }
    function buildTargets() {
        const g = gl;
        if (edgeMode !== 'fxaa')
            return;
        fboTexture = g.createTexture();
        if (!fboTexture)
            fail('createTexture(fbo) 返回空');
        g.bindTexture(g.TEXTURE_2D, fboTexture);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, backbufferW, backbufferH, 0, g.RGBA, g.UNSIGNED_BYTE, null);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
        depthBuffer = g.createRenderbuffer();
        g.bindRenderbuffer(g.RENDERBUFFER, depthBuffer);
        g.renderbufferStorage(g.RENDERBUFFER, g.DEPTH_COMPONENT16, backbufferW, backbufferH);
        fbo = g.createFramebuffer();
        if (!fbo)
            fail('createFramebuffer 返回空');
        g.bindFramebuffer(g.FRAMEBUFFER, fbo);
        g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, fboTexture, 0);
        g.framebufferRenderbuffer(g.FRAMEBUFFER, g.DEPTH_ATTACHMENT, g.RENDERBUFFER, depthBuffer);
        const fbStatus = g.checkFramebufferStatus(g.FRAMEBUFFER);
        if (fbStatus !== g.FRAMEBUFFER_COMPLETE) {
            g.bindFramebuffer(g.FRAMEBUFFER, null);
            fail('framebuffer incomplete: 0x' + fbStatus.toString(16));
        }
        g.bindFramebuffer(g.FRAMEBUFFER, null);
        g.bindTexture(g.TEXTURE_2D, null);
        g.bindRenderbuffer(g.RENDERBUFFER, null);
    }
    function disposeTargets() {
        const g = gl;
        if (fbo)
            g.deleteFramebuffer(fbo);
        if (fboTexture)
            g.deleteTexture(fboTexture);
        if (depthBuffer)
            g.deleteRenderbuffer(depthBuffer);
        fbo = null;
        fboTexture = null;
        depthBuffer = null;
    }
    function buildAll() {
        var _a;
        const g = gl;
        contextAttributes = g.getContextAttributes();
        const requestedMsaa = contextAttributes ? contextAttributes.antialias === true : false;
        edgeMode = (_a = options.forceEdgeMode) !== null && _a !== void 0 ? _a : (requestedMsaa ? 'native-msaa' : 'fxaa');
        const raw = g.getParameter(g.MAX_VERTEX_UNIFORM_VECTORS);
        maxVertexUniformVectors = typeof raw === 'number' && raw > 0 ? raw : null;
        if (maxVertexUniformVectors !== null && jointCount * 4 + 8 > maxVertexUniformVectors) {
            fail('MAX_VERTEX_UNIFORM_VECTORS=' + maxVertexUniformVectors + ' 装不下 ' + jointCount + ' 骨');
        }
        skin = buildSkinProgram();
        if (edgeMode === 'fxaa') {
            fxaaProgram = buildFxaaProgram();
            buildTargets();
        }
        g.enable(g.DEPTH_TEST);
        g.depthFunc(g.LEQUAL);
        g.disable(g.CULL_FACE);
        g.disable(g.BLEND);
        g.viewport(0, 0, backbufferW, backbufferH);
        note('edgeMode=' + edgeMode);
        if (contextAttributes && contextAttributes.antialias === false)
            note('antialias=false（实机有效值）');
    }
    function disposeAll() {
        const g = gl;
        if (skin) {
            g.deleteProgram(skin.program);
            g.deleteBuffer(skin.vbo);
            g.deleteBuffer(skin.ibo);
            g.deleteVertexArray(skin.vao);
            g.deleteTexture(skin.texture);
            skin = null;
        }
        if (fxaaProgram) {
            g.deleteProgram(fxaaProgram.program);
            g.deleteVertexArray(fxaaProgram.vao);
            fxaaProgram = null;
        }
        disposeTargets();
    }
    if (status === 'ready') {
        try {
            buildAll();
        }
        catch (error) {
            status = 'failed';
            note('init-failed:' + (error instanceof Error ? error.message : String(error)));
            platform.log('error', '[character3d/renderer] 初始化失败', { message: String(error) });
        }
    }
    const indexGlType = model.mesh.indexComponentType === 5125
        ? 0x1405
        : model.mesh.indexComponentType === 5123
            ? 0x1403
            : (() => fail('未识别 index componentType=' + model.mesh.indexComponentType))();
    return {
        canvas: canvas,
        get status() { return status; },
        get edgeMode() { return edgeMode; },
        jointCount,
        vertexCount: model.mesh.vertexCount,
        indexCount: model.mesh.indexCount,
        get backbuffer() { return { width: backbufferW, height: backbufferH }; },
        get contextAttributes() { return contextAttributes; },
        get maxVertexUniformVectors() { return maxVertexUniformVectors; },
        counters,
        diagnostics: diags,
        beginFrame() {
            if (status !== 'ready')
                return;
            const g = gl;
            g.bindFramebuffer(g.FRAMEBUFFER, edgeMode === 'fxaa' ? fbo : null);
            g.viewport(0, 0, backbufferW, backbufferH);
            g.clearColor(0, 0, 0, 0);
            g.clearDepth(1);
            g.enable(g.DEPTH_TEST);
            g.depthFunc(g.LEQUAL);
            g.disable(g.CULL_FACE);
            g.disable(g.BLEND);
            g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
            (0, math_1.orthoPixel)(projection, backbufferW, backbufferH, options.orthoZHalf);
            const s = skin;
            if (!s)
                return;
            g.useProgram(s.program);
            g.bindVertexArray(s.vao);
            g.uniformMatrix4fv(s.u.projection, false, projection);
            g.uniform1f(s.u.ambient, light.ambientIntensity);
            g.uniform1f(s.u.dirIntensity, light.directionalIntensity);
            g.uniform1f(s.u.diffuseNorm, light.diffuseNormalization);
            g.activeTexture(g.TEXTURE0);
            g.bindTexture(g.TEXTURE_2D, s.texture);
            g.uniform1i(s.u.baseColor, 0);
            g.uniform1f(s.u.useTexture, 1);
        },
        drawUnit(palette, modelMatrix, alpha, yawDeg) {
            if (status !== 'ready')
                return;
            const g = gl;
            const s = skin;
            if (!s)
                return;
            rotateYInto(lightDirModel, lightDirWorld, -yawDeg);
            g.uniform3fv(s.u.lightDir, lightDirModel);
            g.uniformMatrix4fv(s.u.bones, false, palette);
            counters.paletteUploads++;
            g.uniformMatrix4fv(s.u.model, false, modelMatrix);
            g.uniform1f(s.u.alpha, alpha);
            g.drawElements(g.TRIANGLES, model.mesh.indexCount, indexGlType, 0);
            counters.drawCalls++;
        },
        endFrame() {
            if (status !== 'ready')
                return;
            const g = gl;
            if (edgeMode === 'fxaa') {
                const f = fxaaProgram;
                if (!f || !fboTexture)
                    return;
                g.bindFramebuffer(g.FRAMEBUFFER, null);
                g.viewport(0, 0, backbufferW, backbufferH);
                g.disable(g.DEPTH_TEST);
                g.disable(g.BLEND);
                g.useProgram(f.program);
                g.bindVertexArray(f.vao);
                g.activeTexture(g.TEXTURE0);
                g.bindTexture(g.TEXTURE_2D, fboTexture);
                g.uniform1i(f.u.tex, 0);
                g.uniform2f(f.u.texel, 1 / backbufferW, 1 / backbufferH);
                g.uniform1f(f.u.edgeThreshold, fxaa.edgeThreshold);
                g.uniform1f(f.u.edgeThresholdMin, fxaa.edgeThresholdMin);
                g.uniform1i(f.u.searchSteps, Math.max(1, Math.min(16, Math.round(fxaa.searchSteps))));
                g.uniform1f(f.u.subpixelQuality, fxaa.subpixelQuality);
                g.uniform1f(f.u.subpixelTrim, fxaa.subpixelTrim);
                g.uniform1f(f.u.alphaThreshold, fxaa.alphaThreshold);
                g.drawArrays(g.TRIANGLES, 0, 3);
                g.bindVertexArray(null);
            }
            counters.frames++;
        },
        resize(cssWidth, cssHeight, dpr) {
            if (status === 'disposed')
                return;
            const scale = options.renderScale > 0 ? options.renderScale : 1;
            const ratio = dpr > 0 ? dpr : 1;
            const w = Math.max(1, Math.round(cssWidth * ratio * scale));
            const h = Math.max(1, Math.round(cssHeight * ratio * scale));
            if (w === backbufferW && h === backbufferH)
                return;
            backbufferW = w;
            backbufferH = h;
            canvas.width = w;
            canvas.height = h;
            if (status !== 'ready')
                return;
            const g = gl;
            g.viewport(0, 0, w, h);
            if (edgeMode === 'fxaa') {
                disposeTargets();
                buildTargets();
            }
            (0, math_1.orthoPixel)(projection, w, h, options.orthoZHalf);
        },
        notifyContextLost() {
            if (status === 'disposed')
                return;
            status = 'context-lost';
            skin = null;
            fxaaProgram = null;
            fbo = null;
            fboTexture = null;
            depthBuffer = null;
            note('context-lost');
            platform.log('warn', '[character3d/renderer] context lost（暂停人物提交，session 继续）');
        },
        handleContextRestored() {
            if (status === 'disposed')
                return false;
            if (restoreAttempted) {
                status = 'failed';
                note('restore-failed');
                platform.log('error', '[character3d/renderer] 重建失败（已尝试过一次）');
                return false;
            }
            restoreAttempted = true;
            try {
                disposeAll();
                buildAll();
                status = 'ready';
                note('context-restored');
                return true;
            }
            catch (error) {
                status = 'failed';
                note('restore-threw:' + (error instanceof Error ? error.message : String(error)));
                return false;
            }
        },
        dispose() {
            if (status === 'disposed')
                return;
            disposeAll();
            status = 'disposed';
        },
    };
}
function rotateYInto(out, v, deg) {
    const h = (deg * Math.PI) / 180;
    const c = Math.cos(h);
    const sn = Math.sin(h);
    out[0] = v[0] * c + v[2] * sn;
    out[1] = v[1];
    out[2] = -v[0] * sn + v[2] * c;
}
exports.CHARACTER3D_SHADER_SOURCES = {
    skinVertex: skinVertexSrc,
    skinFragment: SKIN_FRAGMENT_SRC,
    fxaaFragment: FXAA_FRAGMENT_SRC,
    fullscreenVertex: FULLSCREEN_VERTEX_SRC,
};

  });
  // ---- ui/character3d/glb ----
  __def("ui/character3d/glb", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeUtf8 = decodeUtf8;
exports.parseGlb = parseGlb;
exports.readAccessor = readAccessor;
exports.readIndices = readIndices;
exports.loadCharacter3DModel = loadCharacter3DModel;
exports.buildEmbeddedClips = buildEmbeddedClips;
exports.validateModelAccount = validateModelAccount;
exports.createModelStructureValidator = createModelStructureValidator;
exports.buildVertexInterleave = buildVertexInterleave;
exports.digest32 = digest32;
exports.digestFloats = digestFloats;
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENTS = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const REQUIRED_ATTRS = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'];
function fail(msg) {
    throw new Error('[character3d/glb] ' + msg);
}
function decodeUtf8(bytes) {
    if (typeof TextDecoder === 'function')
        return new TextDecoder().decode(bytes);
    let out = '';
    for (let i = 0; i < bytes.length;) {
        const b0 = bytes[i++];
        if (b0 < 0x80) {
            out += String.fromCharCode(b0);
            continue;
        }
        let cp;
        let extra;
        if ((b0 & 0xe0) === 0xc0) {
            cp = b0 & 0x1f;
            extra = 1;
        }
        else if ((b0 & 0xf0) === 0xe0) {
            cp = b0 & 0x0f;
            extra = 2;
        }
        else if ((b0 & 0xf8) === 0xf0) {
            cp = b0 & 0x07;
            extra = 3;
        }
        else {
            out += '\uFFFD';
            continue;
        }
        for (let k = 0; k < extra; k++)
            cp = (cp << 6) | (bytes[i++] & 0x3f);
        if (cp > 0xffff) {
            cp -= 0x10000;
            out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
        else
            out += String.fromCharCode(cp);
    }
    return out;
}
function parseGlb(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (u8.byteLength < 12)
        fail('文件不足 12 字节，不是 GLB');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== GLB_MAGIC)
        fail('magic 不符，不是 GLB（禁按 glTF 文本猜）');
    const version = dv.getUint32(4, true);
    if (version !== 2)
        fail('只支持 GLB v2，实得 v' + version);
    const total = dv.getUint32(8, true);
    if (total > u8.byteLength)
        fail('GLB 声明长度 ' + total + ' > 实际 ' + u8.byteLength);
    let off = 12;
    let json = null;
    let bin = null;
    while (off < total) {
        const len = dv.getUint32(off, true);
        const type = dv.getUint32(off + 4, true);
        const start = off + 8;
        if (start + len > total)
            fail('chunk 越界');
        if (type === CHUNK_JSON)
            json = JSON.parse(decodeUtf8(u8.subarray(start, start + len)));
        else if (type === CHUNK_BIN)
            bin = u8.subarray(start, start + len);
        off = start + len + ((4 - (len % 4)) % 4);
    }
    if (!json)
        fail('缺 JSON chunk');
    return { json, bin, version, byteLength: total };
}
function accessorLayout(json, index) {
    const accessors = json.accessors;
    const a = accessors ? accessors[index] : undefined;
    if (!a)
        fail('accessor[' + index + '] 不存在');
    if (a.sparse)
        fail('accessor[' + index + '] 是稀疏 accessor（不支持，禁猜）');
    const comps = NCOMP[a.type];
    if (!comps)
        fail('accessor[' + index + '] type=' + a.type + ' 未识别');
    const bpe = COMPONENTS[a.componentType];
    if (!bpe)
        fail('accessor[' + index + '] componentType=' + a.componentType + ' 未识别');
    return { accessor: a, comps, bpe, naturalStride: comps * bpe };
}
function viewOf(json, a, naturalStride) {
    if (a.bufferView === undefined)
        fail('accessor 无 bufferView（不支持零填充 accessor）');
    const bvs = json.bufferViews;
    const bv = bvs ? bvs[a.bufferView] : undefined;
    if (!bv)
        fail('bufferView[' + a.bufferView + '] 不存在');
    const stride = bv.byteStride === undefined ? naturalStride : bv.byteStride;
    if (stride !== naturalStride) {
        fail('bufferView[' + a.bufferView + '] byteStride=' + stride + ' 非紧凑（不支持交错，禁猜）');
    }
    return { stride, base: (bv.byteOffset || 0) + (a.byteOffset || 0) };
}
function readAccessor(json, bin, index) {
    const lay = accessorLayout(json, index);
    const a = lay.accessor;
    const v = viewOf(json, a, lay.naturalStride);
    if (!bin)
        fail('缺 BIN chunk 但 accessor 指向 buffer');
    if (v.base + (a.count - 1) * v.stride + lay.naturalStride > bin.byteLength)
        fail('accessor[' + index + '] 越界');
    const out = new Float64Array(a.count * lay.comps);
    const dv = new DataView(bin.buffer, bin.byteOffset + v.base);
    for (let i = 0; i < a.count; i++) {
        const row = i * v.stride;
        for (let c = 0; c < lay.comps; c++) {
            const o = row + c * lay.bpe;
            let val;
            switch (a.componentType) {
                case 5120:
                    val = dv.getInt8(o);
                    break;
                case 5121:
                    val = dv.getUint8(o);
                    break;
                case 5122:
                    val = dv.getInt16(o, true);
                    break;
                case 5123:
                    val = dv.getUint16(o, true);
                    break;
                case 5125:
                    val = dv.getUint32(o, true);
                    break;
                default: val = dv.getFloat32(o, true);
            }
            if (a.normalized) {
                if (a.componentType === 5121)
                    val /= 255;
                else if (a.componentType === 5120)
                    val = Math.max(val / 127, -1);
                else if (a.componentType === 5123)
                    val /= 65535;
                else if (a.componentType === 5122)
                    val = Math.max(val / 32767, -1);
            }
            out[i * lay.comps + c] = val;
        }
    }
    return out;
}
function readIndices(json, bin, index) {
    const accessors = json.accessors;
    const a = accessors ? accessors[index] : undefined;
    if (!a)
        fail('indices accessor[' + index + '] 不存在');
    if (a.type !== 'SCALAR')
        fail('indices accessor type=' + a.type + '（应 SCALAR）');
    const vals = readAccessor(json, bin, index);
    const out = a.componentType === 5125 ? new Uint32Array(vals.length) : new Uint16Array(vals.length);
    for (let i = 0; i < vals.length; i++)
        out[i] = vals[i];
    return out;
}
function buildNodes(json) {
    const src = json.nodes;
    if (!Array.isArray(src) || !src.length)
        fail('无 nodes');
    const n = src.length;
    const parents = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
        const kids = src[i].children || [];
        for (let k = 0; k < kids.length; k++) {
            if (kids[k] < 0 || kids[k] >= n)
                fail('node[' + i + '] 子节点越界');
            if (parents[kids[k]] !== -1)
                fail('node[' + kids[k] + '] 有多个父节点（非法树）');
            parents[kids[k]] = i;
        }
    }
    const order = new Int32Array(n);
    const seen = new Uint8Array(n);
    let w = 0;
    const visit = (i) => {
        if (seen[i])
            return;
        seen[i] = 1;
        if (parents[i] >= 0)
            visit(parents[i]);
        order[w++] = i;
    };
    for (let i = 0; i < n; i++)
        visit(i);
    if (w !== n)
        fail('节点树存在环（拓扑排序只覆盖 ' + w + '/' + n + '）');
    const trs = src.map((nd) => ({
        name: nd.name || '',
        t: (nd.translation || [0, 0, 0]).slice(),
        q: (nd.rotation || [0, 0, 0, 1]).slice(),
        s: (nd.scale || [1, 1, 1]).slice(),
    }));
    return { count: n, parents, order, trs };
}
function boundsOf(json, positionAccessorIndex, positions, vertexCount) {
    const accessors = json.accessors;
    const a = accessors ? accessors[positionAccessorIndex] : undefined;
    if (a && a.min && a.max)
        return { min: a.min.slice(), max: a.max.slice(), source: 'accessor.minmax' };
    const mn = [Infinity, Infinity, Infinity];
    const mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertexCount; i++) {
        for (let c = 0; c < 3; c++) {
            const v = positions[i * 3 + c];
            if (v < mn[c])
                mn[c] = v;
            if (v > mx[c])
                mx[c] = v;
        }
    }
    return { min: mn, max: mx, source: 'computed' };
}
function loadCharacter3DModel(buffer) {
    const glb = parseGlb(buffer);
    const json = glb.json;
    const bin = glb.bin;
    if (json.extensionsRequired && json.extensionsRequired.length) {
        fail('extensionsRequired=' + json.extensionsRequired.join(',') + '（DRACO 等一律不支持）');
    }
    const meshes = json.meshes;
    if (!Array.isArray(meshes) || meshes.length !== 1)
        fail('mesh 数=' + (meshes ? meshes.length : 0) + '（只支持单 mesh）');
    const mesh = meshes[0];
    if (!mesh.primitives || mesh.primitives.length !== 1) {
        fail('primitive 数=' + (mesh.primitives ? mesh.primitives.length : 0) + '（只支持单 primitive）');
    }
    const prim = mesh.primitives[0];
    if (prim.mode !== undefined && prim.mode !== 4)
        fail('primitive.mode=' + prim.mode + '（只支持 TRIANGLES=4）');
    const attrs = Object.keys(prim.attributes || {});
    for (const required of REQUIRED_ATTRS) {
        if (attrs.indexOf(required) < 0)
            fail('缺必需属性 ' + required);
    }
    for (const attr of attrs) {
        if (REQUIRED_ATTRS.indexOf(attr) < 0) {
            fail('出现未支持属性 ' + attr + '（禁猜语义）');
        }
    }
    if (prim.indices === undefined)
        fail('primitive 无 indices');
    const materials = json.materials;
    if (!Array.isArray(materials) || materials.length !== 1) {
        fail('material 数=' + (materials ? materials.length : 0) + '（只支持单材质）');
    }
    const skins = json.skins;
    if (!Array.isArray(skins) || skins.length !== 1)
        fail('skin 数=' + (skins ? skins.length : 0) + '（只支持单 skin）');
    const positions = readAccessor(json, bin, prim.attributes.POSITION);
    const normals = readAccessor(json, bin, prim.attributes.NORMAL);
    const uvs = readAccessor(json, bin, prim.attributes.TEXCOORD_0);
    const jointIndices = readAccessor(json, bin, prim.attributes.JOINTS_0);
    const weights = readAccessor(json, bin, prim.attributes.WEIGHTS_0);
    const indices = readIndices(json, bin, prim.indices);
    const accessors = json.accessors;
    const vertexCount = accessors[prim.attributes.POSITION].count;
    for (const key of REQUIRED_ATTRS) {
        if (accessors[prim.attributes[key]].count !== vertexCount) {
            fail(key + ' 顶点数与 POSITION 不一致（禁按最小数截断）');
        }
    }
    const nodes = buildNodes(json);
    const skin = skins[0];
    if (!Array.isArray(skin.joints) || !skin.joints.length)
        fail('skin.joints 为空');
    if (skin.inverseBindMatrices === undefined)
        fail('skin 无 inverseBindMatrices');
    if (skin.skeleton !== undefined && skin.skeleton !== null) {
        fail('skin.skeleton 非空（不接受，避免根骨歧义）');
    }
    const ibm = readAccessor(json, bin, skin.inverseBindMatrices);
    if (ibm.length !== skin.joints.length * 16) {
        fail('IBM 矩阵数 ' + ibm.length / 16 + ' != joints ' + skin.joints.length);
    }
    for (let i = 0; i < vertexCount; i++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
            const w = weights[i * 4 + k];
            if (w < 0 || w > 1.0001)
                fail('vertex ' + i + ' 权重越界 ' + w);
            const ji = jointIndices[i * 4 + k];
            if (ji >= skin.joints.length)
                fail('vertex ' + i + ' 骨索引 ' + ji + ' 越界（joints=' + skin.joints.length + '）');
            sum += w;
        }
        if (Math.abs(sum - 1) > 1e-3)
            fail('vertex ' + i + ' 权重和 ' + sum.toFixed(5) + ' 未归一');
    }
    const images = [];
    const textures = json.textures || [];
    const imageDefs = json.images || [];
    const bufferViews = json.bufferViews || [];
    for (let i = 0; i < textures.length; i++) {
        const src = textures[i].source;
        if (src === undefined)
            fail('texture[' + i + '] 无 source（不支持扩展纹理）');
        const img = imageDefs[src];
        if (!img)
            fail('image[' + src + '] 不存在');
        if (img.bufferView === undefined)
            fail('image[' + src + '] 非内嵌（不支持外部 URI，禁猜路径）');
        const bv = bufferViews[img.bufferView];
        const start = bv.byteOffset || 0;
        if (!bin)
            fail('缺 BIN chunk 但 image[' + src + '] 指向 buffer');
        images.push({
            index: i,
            name: img.name || 'image' + src,
            mimeType: img.mimeType || '',
            bytes: bin.subarray(start, start + bv.byteLength),
        });
    }
    const mat = materials[0];
    const roleOf = (texRef) => {
        if (!texRef)
            return null;
        const found = images[texRef.index];
        return found === undefined ? null : found;
    };
    const textureRoles = {
        baseColor: roleOf(mat.pbrMetallicRoughness ? mat.pbrMetallicRoughness.baseColorTexture : undefined),
        metallicRoughness: roleOf(mat.pbrMetallicRoughness ? mat.pbrMetallicRoughness.metallicRoughnessTexture : undefined),
        normal: roleOf(mat.normalTexture),
    };
    if (!textureRoles.baseColor)
        fail('材质缺 baseColorTexture（无底色贴图的模型不进 S1）');
    const account = {
        triangleCount: indices.length / 3,
        vertexCount,
        jointCount: skin.joints.length,
        primitiveCount: mesh.primitives.length,
        meshCount: meshes.length,
        materialCount: materials.length,
        textureCount: images.length,
        bufferBytes: (json.buffers && json.buffers[0] && json.buffers[0].byteLength) || (bin ? bin.byteLength : 0),
        nodeCount: nodes.count,
        generator: (json.asset && json.asset.generator) || '',
    };
    return {
        account,
        mesh: {
            positions,
            normals,
            uvs,
            jointIndices,
            weights,
            indices,
            indexComponentType: accessors[prim.indices].componentType,
            vertexCount,
            indexCount: indices.length,
        },
        nodes,
        jointNodes: skin.joints.slice(),
        jointNames: skin.joints.map((j) => nodes.trs[j].name),
        ibm,
        images,
        textureRoles,
        bounds: boundsOf(json, prim.attributes.POSITION, positions, vertexCount),
        clips: buildEmbeddedClips(json, bin, nodes),
    };
}
function buildEmbeddedClips(json, bin, nodes) {
    const anims = json.animations;
    if (!Array.isArray(anims) || !anims.length)
        return [];
    const out = [];
    for (let ai = 0; ai < anims.length; ai++) {
        const anim = anims[ai];
        let minT = Infinity;
        let maxT = -Infinity;
        let keyCount = 0;
        const tracks = [];
        for (const ch of anim.channels) {
            const nodeIndex = ch.target.node;
            if (nodeIndex === undefined)
                fail('animation[' + ai + '] channel 无 target.node（不支持无节点通道）');
            const path = ch.target.path;
            if (path !== 'rotation' && path !== 'translation' && path !== 'scale') {
                fail('animation[' + ai + '] target.path=' + String(path) + ' 未支持');
            }
            const sampler = anim.samplers[ch.sampler];
            if (!sampler)
                fail('animation[' + ai + '] sampler[' + ch.sampler + '] 不存在');
            const ip = sampler.interpolation || 'LINEAR';
            if (ip !== 'STEP' && ip !== 'LINEAR')
                fail('animation[' + ai + '] interpolation=' + ip + ' 未支持（禁 CUBICSPLINE）');
            const ncomp = path === 'rotation' ? 4 : 3;
            const times64 = readAccessor(json, bin, sampler.input);
            const values64 = readAccessor(json, bin, sampler.output);
            if (values64.length !== times64.length * ncomp) {
                fail('animation[' + ai + '] 轨道 ' + nodes.trs[nodeIndex].name + '.' + path + ' 输出长度不符');
            }
            const times = new Float32Array(times64.length);
            for (let i = 0; i < times64.length; i++)
                times[i] = times64[i];
            const values = new Float32Array(values64.length);
            for (let i = 0; i < values64.length; i++)
                values[i] = values64[i];
            for (let i = 0; i < times.length; i++) {
                if (times[i] < minT)
                    minT = times[i];
                if (times[i] > maxT)
                    maxT = times[i];
            }
            keyCount = Math.max(keyCount, times.length);
            tracks.push({ nodeIndex, path, times, values, interpolation: ip });
        }
        if (!tracks.length)
            fail('animation[' + ai + '] 无可用轨道');
        out.push({
            name: anim.name || 'anim' + ai,
            keyCount,
            startTimeSec: minT,
            endTimeSec: maxT,
            durationSec: maxT - minT,
            tracks,
        });
    }
    return out;
}
function validateModelAccount(model, expected) {
    const errors = [];
    const a = model.account;
    const check = (label, actual, want) => {
        if (actual !== want)
            errors.push(`${label}=${actual} 应为 ${want}`);
    };
    check('triangleCount', a.triangleCount, expected.triangleCount);
    check('vertexCount', a.vertexCount, expected.vertexCount);
    check('jointCount', a.jointCount, expected.jointCount);
    check('primitiveCount', a.primitiveCount, expected.primitiveCount);
    check('meshCount', a.meshCount, expected.meshCount);
    check('materialCount', a.materialCount, expected.materialCount);
    check('textureCount', a.textureCount, expected.textureCount);
    check('bufferBytes', a.bufferBytes, expected.bufferBytes);
    return errors;
}
function createModelStructureValidator(expected, ref) {
    void ref;
    return (bytes) => {
        const model = loadCharacter3DModel(bytes);
        const errors = validateModelAccount(model, expected);
        if (errors.length)
            throw new Error('[character3d/glb] 结构不符: ' + errors.join('; '));
    };
}
function buildVertexInterleave(model) {
    const vcount = model.mesh.vertexCount;
    const m = model.mesh;
    const inter = new Float32Array(vcount * 16);
    for (let v = 0; v < vcount; v++) {
        const o = v * 16;
        inter[o] = m.positions[v * 3];
        inter[o + 1] = m.positions[v * 3 + 1];
        inter[o + 2] = m.positions[v * 3 + 2];
        inter[o + 3] = m.normals[v * 3];
        inter[o + 4] = m.normals[v * 3 + 1];
        inter[o + 5] = m.normals[v * 3 + 2];
        inter[o + 6] = m.uvs[v * 2];
        inter[o + 7] = m.uvs[v * 2 + 1];
        inter[o + 8] = m.jointIndices[v * 4];
        inter[o + 9] = m.jointIndices[v * 4 + 1];
        inter[o + 10] = m.jointIndices[v * 4 + 2];
        inter[o + 11] = m.jointIndices[v * 4 + 3];
        inter[o + 12] = m.weights[v * 4];
        inter[o + 13] = m.weights[v * 4 + 1];
        inter[o + 14] = m.weights[v * 4 + 2];
        inter[o + 15] = m.weights[v * 4 + 3];
    }
    return inter;
}
function digest32(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i] & 0xff;
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
}
function digestFloats(values, quantum = 1e-4) {
    let h = 0x811c9dc5;
    for (let i = 0; i < values.length; i++) {
        const q = Math.round(values[i] / quantum) | 0;
        h ^= q & 0xff;
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        h ^= (q >>> 8) & 0xff;
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        h ^= (q >>> 16) & 0xff;
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
}

  });
  // ---- ui/character3d/math ----
  __def("ui/character3d/math", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECIPROCAL_PI = void 0;
exports.mat4 = mat4;
exports.quat = quat;
exports.vec3 = vec3;
exports.identity = identity;
exports.mul = mul;
exports.fromTRS = fromTRS;
exports.orthoPixel = orthoPixel;
exports.placement = placement;
exports.nlerp = nlerp;
exports.nlerpQ = nlerpQ;
exports.xformPoint = xformPoint;
exports.quatFromYawDeg = quatFromYawDeg;
exports.placementYaw = placementYaw;
exports.placementYawSquash = placementYawSquash;
exports.srgbToLinear = srgbToLinear;
exports.linearToSrgb = linearToSrgb;
exports.srgbToLinearRgb = srgbToLinearRgb;
exports.linearToSrgbRgb = linearToSrgbRgb;
exports.normalize3 = normalize3;
exports.diffuseLightFactor = diffuseLightFactor;
exports.RECIPROCAL_PI = 0.3183098861837907;
function mat4() {
    return new Float32Array(16);
}
function quat() {
    return new Float32Array(4);
}
function vec3() {
    return new Float32Array(3);
}
function identity(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
}
function mul(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let c = 0; c < 4; c++) {
        const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
        out[c * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
        out[c * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
        out[c * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
        out[c * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    }
    return out;
}
function fromTRS(out, t, q, s) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = s[0], sy = s[1], sz = s[2];
    out[0] = (1 - (yy + zz)) * sx;
    out[1] = (xy + wz) * sx;
    out[2] = (xz - wy) * sx;
    out[3] = 0;
    out[4] = (xy - wz) * sy;
    out[5] = (1 - (xx + zz)) * sy;
    out[6] = (yz + wx) * sy;
    out[7] = 0;
    out[8] = (xz + wy) * sz;
    out[9] = (yz - wx) * sz;
    out[10] = (1 - (xx + yy)) * sz;
    out[11] = 0;
    out[12] = t[0];
    out[13] = t[1];
    out[14] = t[2];
    out[15] = 1;
    return out;
}
function orthoPixel(out, w, h, zHalf) {
    const zh = zHalf > 0 ? zHalf : 4;
    out[0] = 2 / w;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 / h;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = -1 / zh;
    out[11] = 0;
    out[12] = -1;
    out[13] = 1;
    out[14] = 0;
    out[15] = 1;
    return out;
}
function placement(out, centerX, feetY, scale) {
    out[0] = scale;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -scale;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = centerX;
    out[13] = feetY;
    out[14] = 0;
    out[15] = 1;
    return out;
}
function nlerp(out, qa, oa, qb, ob, k) {
    const d = qa[oa] * qb[ob] + qa[oa + 1] * qb[ob + 1] + qa[oa + 2] * qb[ob + 2] + qa[oa + 3] * qb[ob + 3];
    const s = d < 0 ? -1 : 1;
    const x = qa[oa] * k + qb[ob] * (1 - k) * s;
    const y = qa[oa + 1] * k + qb[ob + 1] * (1 - k) * s;
    const z = qa[oa + 2] * k + qb[ob + 2] * (1 - k) * s;
    const w = qa[oa + 3] * k + qb[ob + 3] * (1 - k) * s;
    const L = Math.hypot(x, y, z, w) || 1;
    out[0] = x / L;
    out[1] = y / L;
    out[2] = z / L;
    out[3] = w / L;
    return out;
}
function nlerpQ(out, a, aOff, b, bOff, k) {
    return nlerp(out, a, aOff, b, bOff, k);
}
function xformPoint(out3, m, x, y, z) {
    out3[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out3[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out3[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return out3;
}
function quatFromYawDeg(out, deg) {
    const half = (deg * Math.PI) / 360;
    out[0] = 0;
    out[1] = Math.sin(half);
    out[2] = 0;
    out[3] = Math.cos(half);
    return out;
}
function placementYaw(out, centerX, feetY, scale, yawDeg) {
    const rot = scratchRot;
    quatFromYawDeg(scratchQuat, yawDeg);
    scratchT[0] = 0;
    scratchT[1] = 0;
    scratchT[2] = 0;
    scratchS[0] = 1;
    scratchS[1] = 1;
    scratchS[2] = 1;
    fromTRS(rot, scratchT, scratchQuat, scratchS);
    placement(out, centerX, feetY, scale);
    return mul(out, out, rot);
}
function placementYawSquash(out, centerX, feetY, scale, yawDeg, squashY) {
    const rot = scratchRot2;
    quatFromYawDeg(scratchQuat2, yawDeg);
    scratchT2[0] = 0;
    scratchT2[1] = 0;
    scratchT2[2] = 0;
    scratchS2[0] = 1;
    scratchS2[1] = squashY;
    scratchS2[2] = 1;
    fromTRS(rot, scratchT2, scratchQuat2, scratchS2);
    placement(out, centerX, feetY, scale);
    return mul(out, out, rot);
}
const scratchRot = mat4();
const scratchRot2 = mat4();
const scratchQuat = quat();
const scratchQuat2 = quat();
const scratchT = new Float32Array(3);
const scratchT2 = new Float32Array(3);
const scratchS = new Float32Array(3);
const scratchS2 = new Float32Array(3);
function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
    return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
function srgbToLinearRgb(out, rgb) {
    out[0] = srgbToLinear(rgb[0]);
    out[1] = srgbToLinear(rgb[1]);
    out[2] = srgbToLinear(rgb[2]);
    return out;
}
function linearToSrgbRgb(out, rgb) {
    out[0] = linearToSrgb(rgb[0]);
    out[1] = linearToSrgb(rgb[1]);
    out[2] = linearToSrgb(rgb[2]);
    return out;
}
function normalize3(out, x, y, z) {
    const L = Math.hypot(x, y, z);
    if (L < 1e-12) {
        out[0] = 0;
        out[1] = 0;
        out[2] = 1;
        return out;
    }
    out[0] = x / L;
    out[1] = y / L;
    out[2] = z / L;
    return out;
}
function diffuseLightFactor(nx, ny, nz, lx, ly, lz, ambient, directional) {
    const nL = Math.hypot(nx, ny, nz) || 1;
    const lL = Math.hypot(lx, ly, lz) || 1;
    const ndl = Math.max((nx / nL) * (lx / lL) + (ny / nL) * (ly / lL) + (nz / nL) * (lz / lL), 0);
    return (ambient + directional * ndl) * exports.RECIPROCAL_PI;
}

  });
  // ---- ui/character3d/pass ----
  __def("ui/character3d/pass", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCharacter3DPass = createCharacter3DPass;
const character_3d_1 = require("../../config/character-3d");
const animation_1 = require("./animation");
const math_1 = require("./math");
function createCharacter3DPass(options) {
    const { renderer, viewport, runtimes } = options;
    const actors = new Map();
    const diags = [];
    const matrix = (0, math_1.mat4)();
    function note(msg) {
        if (diags.indexOf(msg) < 0)
            diags.push(msg);
    }
    function statusOf() {
        if (options.loadState === 'failed')
            return 'failed';
        if (renderer.status === 'context-lost')
            return 'context-lost';
        if (renderer.status === 'failed' || renderer.status === 'disposed')
            return 'failed';
        if (options.loadState !== 'ready')
            return 'loading';
        return 'ready';
    }
    function actorViewFor(actorId, runtime) {
        const existing = actors.get(actorId);
        if (existing)
            return existing;
        const created = {
            controller: new animation_1.CharacterAnimController(Object.assign({}, runtime.anim)),
            pose: (0, animation_1.createPose)(runtime.model),
            scratchPose: (0, animation_1.createPose)(runtime.model),
        };
        actors.set(actorId, created);
        return created;
    }
    function render(commands, dtSec) {
        const placed = new Map();
        const status = statusOf();
        if (status !== 'ready') {
            return {
                status,
                canvas: null,
                placed,
                diagnostics: combineDiagnostics(diags, renderer.diagnostics),
            };
        }
        const seen = new Set();
        renderer.beginFrame();
        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];
            const runtime = runtimes[cmd.profileKey];
            if (!runtime) {
                note('unknown-profile:' + cmd.profileKey);
                continue;
            }
            seen.add(cmd.actorId);
            const view = actorViewFor(cmd.actorId, runtime);
            view.controller.update(dtSec, {
                state: cmd.state,
                isJump: cmd.isJump,
                stateElapsedSec: cmd.stateElapsedSec,
                moveProgress: cmd.moveProgress,
            });
            const palette = view.controller.sample(runtime.model, view.pose, view.scratchPose);
            const yawDeg = (0, character_3d_1.yawDegForFacing)(cmd.facing);
            const box = buildPlacement(matrix, cmd, runtime, yawDeg);
            renderer.drawUnit(palette, matrix, clampAlpha(cmd.alpha), yawDeg);
            placed.set(cmd.actorId, box);
            for (const d of view.controller.diagnostics)
                note(cmd.actorId + ':' + d);
        }
        renderer.endFrame();
        for (const id of Array.from(actors.keys())) {
            if (!seen.has(id))
                actors.delete(id);
        }
        return {
            status,
            canvas: { width: viewport.width, height: viewport.height },
            placed,
            diagnostics: combineDiagnostics(diags, renderer.diagnostics),
        };
    }
    function buildPlacement(out, cmd, runtime, yawDeg) {
        const { profile, model } = runtime;
        const scale = profile.screenHeightPxAtReference / profile.modelHeight;
        const feetY = cmd.footY - cmd.hopPx;
        const squashY = cmd.squashY > 0 ? cmd.squashY : 1;
        (0, math_1.placementYawSquash)(out, cmd.footX, feetY, scale, yawDeg, squashY);
        const h = profile.screenHeightPxAtReference * squashY;
        const xSpan = model.bounds.max[0] - model.bounds.min[0];
        const zSpan = model.bounds.max[2] - model.bounds.min[2];
        const w = Math.max(xSpan, zSpan) * scale;
        return { cx: cmd.footX, top: feetY - h, w, h };
    }
    return {
        render,
        composite(target, dx, dy) {
            if (statusOf() !== 'ready')
                return false;
            target.drawImage(renderer.canvas, dx, dy);
            return true;
        },
        get canvas() {
            return renderer.canvas;
        },
        get controllers() {
            const map = new Map();
            for (const [id, view] of actors)
                map.set(id, view.controller);
            return map;
        },
    };
}
function combineDiagnostics(a, b) {
    const out = [];
    for (const x of a)
        if (out.indexOf(x) < 0)
            out.push(x);
    for (const x of b)
        if (out.indexOf(x) < 0)
            out.push(x);
    return out;
}
function clampAlpha(v) {
    if (!Number.isFinite(v))
        return 1;
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

  });
  // ---- ui/character3d/animation ----
  __def("ui/character3d/animation", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CharacterAnimController = void 0;
exports.createPose = createPose;
exports.resetPose = resetPose;
exports.resolvePose = resolvePose;
exports.blendPoses = blendPoses;
exports.parseCharacter3DClipJson = parseCharacter3DClipJson;
exports.bindRetargetedClip = bindRetargetedClip;
exports.applyRetargetedClip = applyRetargetedClip;
exports.applyEmbeddedClip = applyEmbeddedClip;
exports.clipDurationSec = clipDurationSec;
exports.resolveClipSource = resolveClipSource;
const math_1 = require("./math");
function createPose(model) {
    const n = model.nodes.count;
    const nj = model.jointNodes.length;
    const pose = {
        nodeCount: n,
        jointCount: nj,
        t: new Float32Array(n * 3),
        q: new Float32Array(n * 4),
        s: new Float32Array(n * 3),
        localM: new Float32Array(n * 16),
        worldM: new Float32Array(n * 16),
        palette: new Float32Array(nj * 16),
        tV: [], qV: [], sV: [], localV: [], worldV: [], paletteV: [],
    };
    for (let i = 0; i < n; i++) {
        pose.tV.push(pose.t.subarray(i * 3, i * 3 + 3));
        pose.qV.push(pose.q.subarray(i * 4, i * 4 + 4));
        pose.sV.push(pose.s.subarray(i * 3, i * 3 + 3));
        pose.localV.push(pose.localM.subarray(i * 16, i * 16 + 16));
        pose.worldV.push(pose.worldM.subarray(i * 16, i * 16 + 16));
    }
    for (let j = 0; j < nj; j++)
        pose.paletteV.push(pose.palette.subarray(j * 16, j * 16 + 16));
    return pose;
}
function resetPose(pose, model) {
    const trs = model.nodes.trs;
    for (let i = 0; i < pose.nodeCount; i++) {
        const x = trs[i], t = pose.tV[i], q = pose.qV[i], s = pose.sV[i];
        t[0] = x.t[0];
        t[1] = x.t[1];
        t[2] = x.t[2];
        q[0] = x.q[0];
        q[1] = x.q[1];
        q[2] = x.q[2];
        q[3] = x.q[3];
        s[0] = x.s[0];
        s[1] = x.s[1];
        s[2] = x.s[2];
    }
}
function resolvePose(model, pose) {
    for (let i = 0; i < pose.nodeCount; i++) {
        (0, math_1.fromTRS)(pose.localV[i], pose.tV[i], pose.qV[i], pose.sV[i]);
    }
    const order = model.nodes.order;
    const parents = model.nodes.parents;
    for (let k = 0; k < order.length; k++) {
        const i = order[k];
        if (parents[i] < 0)
            pose.worldV[i].set(pose.localV[i]);
        else
            (0, math_1.mul)(pose.worldV[i], pose.worldV[parents[i]], pose.localV[i]);
    }
    const joints = model.jointNodes;
    for (let ji = 0; ji < joints.length; ji++) {
        (0, math_1.mul)(pose.paletteV[ji], pose.worldV[joints[ji]], model.ibm.subarray(ji * 16, ji * 16 + 16));
    }
    return pose.palette;
}
function blendPoses(out, from, to, w) {
    const k = 1 - w;
    for (let i = 0; i < out.nodeCount; i++) {
        (0, math_1.nlerp)(out.qV[i], from.qV[i], 0, to.qV[i], 0, k);
        const ot = out.tV[i], at = from.tV[i], bt = to.tV[i];
        ot[0] = at[0] * k + bt[0] * (1 - k);
        ot[1] = at[1] * k + bt[1] * (1 - k);
        ot[2] = at[2] * k + bt[2] * (1 - k);
        const os = out.sV[i], as = from.sV[i], bs = to.sV[i];
        os[0] = as[0] * k + bs[0] * (1 - k);
        os[1] = as[1] * k + bs[1] * (1 - k);
        os[2] = as[2] * k + bs[2] * (1 - k);
    }
}
function fail(msg) {
    throw new Error('[character3d/animation] ' + msg);
}
function asRecord(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
}
function asFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function parseCharacter3DClipJson(raw, name) {
    var _a, _b, _c;
    const obj = asRecord(raw);
    if (!obj)
        fail('动作 json 不是对象: ' + name);
    const fps = asFiniteNumber(obj.fps);
    const nFrames = asFiniteNumber(obj.nFrames);
    const duration = asFiniteNumber(obj.duration);
    if (fps === null || !(fps > 0))
        fail('fps 非法: ' + String(obj.fps));
    if (nFrames === null || !(nFrames > 1) || !Number.isInteger(nFrames))
        fail('nFrames 非法: ' + String(obj.nFrames));
    if (duration === null || !(duration > 0))
        fail('duration 非法: ' + String(obj.duration));
    if (Math.abs(duration - nFrames / fps) > 0.05) {
        fail('duration ' + duration + ' 与 nFrames/fps=' + nFrames / fps + ' 不符');
    }
    const rootModeRaw = obj.rootMode === undefined ? 'y' : obj.rootMode;
    if (rootModeRaw !== 'y' && rootModeRaw !== 'none' && rootModeRaw !== 'xyz') {
        fail('rootMode 未识别: ' + String(rootModeRaw));
    }
    const btRaw = asRecord(obj.boneTracks);
    if (!btRaw)
        fail('缺 boneTracks: ' + name);
    const names = Object.keys(btRaw);
    if (!names.length)
        fail('boneTracks 为空: ' + name);
    const boneTracks = {};
    for (const bn of names) {
        const tr = btRaw[bn];
        if (!Array.isArray(tr) || tr.length !== nFrames) {
            fail('轨道 ' + bn + ' 帧数 ' + (Array.isArray(tr) ? tr.length : 'N/A') + ' != nFrames ' + nFrames);
        }
        for (let f = 0; f < nFrames; f++) {
            const row = tr[f];
            if (!Array.isArray(row) || row.length !== 4)
                fail('轨道 ' + bn + ' 第 ' + f + ' 帧不是四元数');
        }
        boneTracks[bn] = tr;
    }
    const rootTrack = obj.rootTrack;
    if (!Array.isArray(rootTrack) || rootTrack.length !== nFrames)
        fail('rootTrack 帧数不符: ' + name);
    for (let f = 0; f < nFrames; f++) {
        const row = rootTrack[f];
        if (!Array.isArray(row) || row.length !== 3)
            fail('rootTrack 第 ' + f + ' 帧不是 vec3');
    }
    return {
        name,
        fps,
        nFrames,
        declaredDurationSec: duration,
        samplerDurationSec: nFrames / fps,
        rootMode: rootModeRaw,
        rootScale: (_a = asFiniteNumber(obj.rootScale)) !== null && _a !== void 0 ? _a : 1,
        unitScale: (_b = asFiniteNumber(obj.unitScale)) !== null && _b !== void 0 ? _b : 1,
        mappedCount: (_c = asFiniteNumber(obj.mappedCount)) !== null && _c !== void 0 ? _c : names.length,
        source: typeof obj.source === 'string' ? obj.source : '',
        boneTracks,
        rootTrack: rootTrack,
    };
}
function bindRetargetedClip(clip, model) {
    const nameIdx = {};
    for (let i = 0; i < model.nodes.trs.length; i++) {
        const nm = model.nodes.trs[i].name;
        if (nm && nameIdx[nm] === undefined)
            nameIdx[nm] = i;
    }
    const jointName = {};
    for (let j = 0; j < model.jointNodes.length; j++)
        jointName[model.nodes.trs[model.jointNodes[j]].name] = j;
    const tracks = Object.keys(clip.boneTracks).map((nm) => {
        const node = nameIdx[nm];
        if (node === undefined)
            fail('动作含模型里不存在的骨: ' + nm);
        if (jointName[nm] === undefined)
            fail('轨道 ' + nm + ' 对应节点不是 skin.joints 成员');
        return { node, name: nm, track: clip.boneTracks[nm] };
    });
    const rootIdx = nameIdx['Root'];
    if (rootIdx === undefined)
        fail('模型无名为 Root 的节点，无法施加 rootTrack');
    return { tracks, rootNode: rootIdx, rootRest: model.nodes.trs[rootIdx].t.slice(), coveredJoints: tracks.length };
}
const q4 = new Float32Array(4);
function applyRetargetedClip(clip, bound, model, pose, phaseRatio, rootDisplacement, loop = true) {
    resetPose(pose, model);
    const nF = clip.nFrames;
    const fps = clip.fps;
    let fi = phaseRatio * clip.samplerDurationSec * fps;
    if (loop)
        fi = fi - Math.floor(fi / nF) * nF;
    else
        fi = Math.min(nF - 1, Math.max(0, fi));
    const i0 = Math.min(nF - 1, Math.max(0, Math.floor(fi)));
    const i1 = loop ? (i0 + 1) % nF : Math.min(nF - 1, i0 + 1);
    const a = fi - Math.floor(fi);
    for (let i = 0; i < bound.tracks.length; i++) {
        const tr = bound.tracks[i].track;
        (0, math_1.nlerp)(q4, tr[i0], 0, tr[i1], 0, 1 - a);
        const q = pose.qV[bound.tracks[i].node];
        q[0] = q4[0];
        q[1] = q4[1];
        q[2] = q4[2];
        q[3] = q4[3];
    }
    if (rootDisplacement === 'zero')
        return;
    const r0 = clip.rootTrack[i0];
    const r1 = clip.rootTrack[i1];
    const rt = pose.tV[bound.rootNode];
    const rr = bound.rootRest;
    rt[0] = rr[0] + (r0[0] * (1 - a) + r1[0] * a);
    rt[1] = rr[1] + (r0[1] * (1 - a) + r1[1] * a);
    rt[2] = rr[2] + (r0[2] * (1 - a) + r1[2] * a);
}
function segmentOf(times, t) {
    let lo = 0;
    let hi = times.length - 1;
    if (t <= times[0])
        return 0;
    if (t >= times[hi])
        return Math.max(0, hi - 1);
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t)
            lo = mid;
        else
            hi = mid;
    }
    return lo;
}
function applyTrack(pose, track, t) {
    const times = track.times;
    const n = times.length;
    const i0 = segmentOf(times, t);
    const i1 = Math.min(n - 1, i0 + 1);
    const span = times[i1] - times[i0];
    const raw = span > 1e-9 ? (t - times[i0]) / span : 0;
    const a = Math.min(1, Math.max(0, raw));
    const ncomp = track.path === 'rotation' ? 4 : 3;
    const values = track.values;
    const o0 = i0 * ncomp;
    if (track.path === 'rotation') {
        const q = pose.qV[track.nodeIndex];
        if (track.interpolation === 'STEP') {
            q[0] = values[o0];
            q[1] = values[o0 + 1];
            q[2] = values[o0 + 2];
            q[3] = values[o0 + 3];
            return;
        }
        (0, math_1.nlerp)(q, values, o0, values, i1 * ncomp, 1 - a);
        return;
    }
    const dst = track.path === 'translation' ? pose.tV[track.nodeIndex] : pose.sV[track.nodeIndex];
    const o1 = i1 * ncomp;
    if (track.interpolation === 'STEP') {
        for (let c = 0; c < ncomp; c++)
            dst[c] = values[o0 + c];
        return;
    }
    for (let c = 0; c < ncomp; c++)
        dst[c] = values[o0 + c] * (1 - a) + values[o1 + c] * a;
}
function applyEmbeddedClip(clip, model, pose, phaseRatio, rootDisplacement, loop = true) {
    resetPose(pose, model);
    const r = loop ? phaseRatio - Math.floor(phaseRatio) : Math.min(1, Math.max(0, phaseRatio));
    const t = clip.startTimeSec + r * clip.durationSec;
    const rootNode = rootDisplacement === 'zero' ? findRootNode(model) : -1;
    for (let i = 0; i < clip.tracks.length; i++) {
        const track = clip.tracks[i];
        if (track.path === 'translation' && track.nodeIndex === rootNode)
            continue;
        applyTrack(pose, track, t);
    }
}
function findRootNode(model) {
    for (let i = 0; i < model.nodes.trs.length; i++) {
        if (model.nodes.trs[i].name === 'Root')
            return i;
    }
    return -1;
}
function clipDurationSec(source) {
    return source.kind === 'retargeted' ? source.clip.samplerDurationSec : source.clip.durationSec;
}
function resolveClipSource(key, entry, model, jsonRaw) {
    if ('embedded' in entry) {
        const found = model.clips.find((c) => c.name === entry.embedded);
        if (!found) {
            fail('模型内没有内嵌动画 ' + entry.embedded + '（profile 槽位 ' + key + '）');
        }
        return { kind: 'embedded', name: entry.embedded, clip: found };
    }
    const clip = parseCharacter3DClipJson(jsonRaw, entry.id);
    return { kind: 'retargeted', ref: entry, clip, bound: bindRetargetedClip(clip, model) };
}
class CharacterAnimController {
    constructor(opts) {
        this.diags = [];
        this.viewClockSec = 0;
        this.fadeElapsedSec = 0;
        this.fade = null;
        this.currentClipKey = null;
        this.currentActionKey = 'idle';
        this.lastRatio = 0;
        this.lastLoop = true;
        this.inherited = null;
        this.opts = opts;
    }
    get activeClipKey() {
        return this.currentClipKey;
    }
    get actionKey() {
        return this.currentActionKey;
    }
    get diagnostics() {
        return this.diags;
    }
    get fadeWeight() {
        if (!this.fade)
            return 1;
        return Math.min(1, this.fadeElapsedSec / this.fade.durationSec);
    }
    update(dtSec, input) {
        this.viewClockSec += dtSec;
        if (this.fade)
            this.fadeElapsedSec += dtSec;
        const actionKey = this.resolveActionKey(input);
        const spec = this.opts.actionMap[actionKey];
        const inheritedFrom = actionKey === 'hit' && spec.clip === null;
        const target = this.resolveTarget(actionKey, spec, input, inheritedFrom);
        if (this.currentClipKey !== null && target.clipKey !== this.currentClipKey) {
            const snap = !spec.crossFadeOnEnter || this.currentActionKey === 'dead';
            if (snap)
                this.fade = null;
            else {
                const fromClip = this.currentClipKey;
                const dur = fromClip === 'jump' && target.clipKey === 'idle'
                    ? this.opts.jumpToIdleBlendSec
                    : this.opts.crossFadeSec;
                this.fade = {
                    clipKey: fromClip,
                    phaseRatio: this.lastRatio,
                    loop: this.opts.actionMap[this.currentActionKey].loop,
                    rootDisplacement: this.opts.actionMap[this.currentActionKey].rootMotion,
                    durationSec: dur > 0 ? dur : 1e-6,
                };
                this.fadeElapsedSec = 0;
            }
        }
        if (this.fade && this.fade.clipKey === target.clipKey) {
            this.fade = null;
        }
        this.currentActionKey = actionKey;
        this.currentClipKey = target.clipKey;
        this.lastRatio = target.phaseRatio;
        this.lastLoop = target.loop;
        if (inheritedFrom) {
            if (!this.inherited) {
                this.inherited = {
                    clipKey: target.clipKey,
                    phaseRatio: target.phaseRatio,
                    clockSec: this.viewClockSec,
                    loop: target.loop,
                    rootDisplacement: target.rootDisplacement,
                };
            }
        }
        else {
            this.inherited = null;
        }
        const fade = this.fade;
        if (fade) {
            const src = this.opts.clips[fade.clipKey];
            const dur = src ? clipDurationSec(src) : 1;
            let next = fade.phaseRatio + dtSec / (dur > 0 ? dur : 1);
            if (fade.loop)
                next -= Math.floor(next);
            else
                next = Math.min(1, next);
            fade.phaseRatio = next;
            if (this.fadeElapsedSec >= fade.durationSec)
                this.fade = null;
        }
    }
    sample(model, pose, scratch) {
        var _a, _b;
        const key = (_b = (_a = this.currentClipKey) !== null && _a !== void 0 ? _a : this.opts.fallbackClip) !== null && _b !== void 0 ? _b : 'idle';
        const source = this.opts.clips[key];
        const scratchPose = scratch !== null && scratch !== void 0 ? scratch : pose;
        const fade = this.fade;
        if (!source) {
            this.note('missing-clip:' + key);
            resetPose(pose, model);
            return resolvePose(model, pose);
        }
        if (fade) {
            const fadeSource = this.opts.clips[fade.clipKey];
            if (fadeSource) {
                this.sampleOne(fadeSource, fade.phaseRatio, fade.rootDisplacement, fade.loop, model, scratchPose);
                this.sampleOne(source, this.lastRatio, this.currentRootDisplacement(), this.lastLoop, model, pose);
                blendPoses(pose, scratchPose, pose, this.fadeWeight);
                return resolvePose(model, pose);
            }
        }
        this.sampleOne(source, this.lastRatio, this.currentRootDisplacement(), this.lastLoop, model, pose);
        return resolvePose(model, pose);
    }
    currentRootDisplacement() {
        return this.inherited ? this.inherited.rootDisplacement : this.opts.actionMap[this.currentActionKey].rootMotion;
    }
    sampleOne(source, phaseRatio, rootDisplacement, loop, model, pose) {
        if (source.kind === 'retargeted') {
            applyRetargetedClip(source.clip, source.bound, model, pose, phaseRatio, rootDisplacement, loop);
        }
        else {
            applyEmbeddedClip(source.clip, model, pose, phaseRatio, rootDisplacement, loop);
        }
    }
    note(msg) {
        if (this.diags.indexOf(msg) < 0)
            this.diags.push(msg);
    }
    resolveActionKey(input) {
        if (input.state === 'hit')
            return this.currentActionKey === 'hit' ? 'hit' : this.currentActionKey;
        if (input.state === 'dead')
            return 'dead';
        if (input.state === 'walk' && input.isJump)
            return 'jump';
        return input.state;
    }
    resolveTarget(actionKey, spec, input, inheritedFrom) {
        var _a, _b, _c;
        if (inheritedFrom || spec.clip === null) {
            const base = this.inherited;
            const clipKey = base ? base.clipKey : (_b = (_a = this.currentClipKey) !== null && _a !== void 0 ? _a : this.opts.fallbackClip) !== null && _b !== void 0 ? _b : 'idle';
            const src = this.opts.clips[clipKey];
            const dur = src ? clipDurationSec(src) : 1;
            const phase = base
                ? (base.loop
                    ? wrap01(base.phaseRatio + (this.viewClockSec - base.clockSec) / (dur > 0 ? dur : 1))
                    : Math.min(1, base.phaseRatio + (this.viewClockSec - base.clockSec) / (dur > 0 ? dur : 1)))
                : this.lastRatio;
            return {
                actionKey,
                clipKey,
                phaseRatio: phase,
                loop: base ? base.loop : spec.loop,
                rootDisplacement: base ? base.rootDisplacement : spec.rootMotion,
                derived: false,
            };
        }
        const clipKey = spec.clip;
        const src = this.opts.clips[clipKey];
        const durationSec = src ? clipDurationSec(src) : ((_c = spec.playWindowSec) !== null && _c !== void 0 ? _c : 1);
        const phase = this.phaseFor(spec.progressSource, spec, input, durationSec);
        return { actionKey, clipKey, phaseRatio: phase, loop: spec.loop, rootDisplacement: spec.rootMotion, derived: true };
    }
    phaseFor(source, spec, input, durationSec) {
        var _a, _b;
        const start = spec.startRatio;
        const span = 1 - start;
        switch (source) {
            case 'hold':
                return start;
            case 'moveProgress': {
                const window = (_a = spec.playWindowSec) !== null && _a !== void 0 ? _a : durationSec;
                const p = input.moveProgress !== null
                    ? clamp01(input.moveProgress)
                    : clamp01(input.stateElapsedSec / (window > 0 ? window : 1));
                return foldPhase(start + p * span, spec.loop);
            }
            case 'stateElapsed': {
                const window = (_b = spec.playWindowSec) !== null && _b !== void 0 ? _b : durationSec;
                if (spec.loop) {
                    return foldPhase(start + viewWindow(input.stateElapsedSec, window) * span, true);
                }
                return foldPhase(start + clamp01(input.stateElapsedSec / (window > 0 ? window : 1)) * span, false);
            }
            default: {
                const d = durationSec > 0 ? durationSec : 1;
                if (spec.loop)
                    return foldPhase(start + ((this.viewClockSec % d) / d) * span, true);
                return foldPhase(start + clamp01(this.viewClockSec / d) * span, false);
            }
        }
    }
}
exports.CharacterAnimController = CharacterAnimController;
function clamp01(v) {
    if (!Number.isFinite(v))
        return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
function wrap01(v) {
    const r = v - Math.floor(v);
    return r === 1 ? 0 : r;
}
function foldPhase(v, loop) {
    if (!Number.isFinite(v))
        return 0;
    return loop ? wrap01(v) : v < 0 ? 0 : v > 1 ? 1 : v;
}
function viewWindow(elapsed, window) {
    if (!(window > 0))
        return 0;
    const m = elapsed % window;
    return (m < 0 ? m + window : m) / window;
}

  });
  // ---- proto/battle_demo/host-runtime ----
  __def("proto/battle_demo/host-runtime", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHostRuntime = createHostRuntime;
const MAX_FRAME_SEC = 0.05;
function createHostRuntime(options) {
    let status = 'idle';
    let rafId = null;
    let lastMs = null;
    let frames = 0;
    let pauseReason = null;
    const disposers = [];
    function schedule() {
        if (status !== 'running' || rafId !== null)
            return;
        rafId = options.raf(onFrame);
    }
    function onFrame(tMs) {
        rafId = null;
        if (status !== 'running')
            return;
        const dtSec = lastMs === null ? 0 : Math.min(MAX_FRAME_SEC, Math.max(0, (tMs - lastMs) / 1000));
        lastMs = tMs;
        frames++;
        options.step(dtSec);
        schedule();
    }
    function start() {
        if (status === 'disposed' || status === 'running')
            return;
        status = 'running';
        pauseReason = null;
        lastMs = null;
        schedule();
    }
    function pause(reason) {
        if (status === 'disposed' || status === 'paused')
            return;
        status = 'paused';
        pauseReason = reason;
        if (rafId !== null) {
            options.cancelRaf(rafId);
            rafId = null;
        }
        lastMs = null;
    }
    return {
        get status() {
            return status;
        },
        get pendingFrames() {
            return rafId === null ? 0 : 1;
        },
        get frames() {
            return frames;
        },
        get pauseReason() {
            return pauseReason;
        },
        start,
        pause: (reason = 'paused') => pause(reason),
        resume() {
            if (status === 'disposed')
                return;
            lastMs = null;
            if (status === 'running')
                return;
            start();
        },
        notifyContextRestored(ok, onFinalFailure) {
            if (ok)
                return;
            pause('context-restore-failed');
            onFinalFailure === null || onFinalFailure === void 0 ? void 0 : onFinalFailure();
        },
        addDisposer(fn) {
            if (status === 'disposed')
                return;
            disposers.push(fn);
        },
        dispose() {
            if (status === 'disposed')
                return;
            status = 'disposed';
            if (rafId !== null) {
                options.cancelRaf(rafId);
                rafId = null;
            }
            lastMs = null;
            while (disposers.length > 0) {
                const fn = disposers.pop();
                try {
                    fn === null || fn === void 0 ? void 0 : fn();
                }
                catch (_a) {
                }
            }
        },
    };
}

  });
  // ---- proto/character3d_runtime_demo/evidence ----
  __def("proto/character3d_runtime_demo/evidence", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHASES_ORDER = exports.ALL_STATES = exports.ALL_FACINGS = exports.RUNS_REQUIRED = exports.TAP_DIAG_PREFIX = exports.CONSOLE_RESULT_PREFIX = exports.RUNTIME_SCHEMA_VERSION = void 0;
exports.emptyContextEvidence = emptyContextEvidence;
exports.contextEvidenceOk = contextEvidenceOk;
exports.deviceHashOf = deviceHashOf;
exports.assertScenarioRows = assertScenarioRows;
exports.runtimeVerdicts = runtimeVerdicts;
exports.buildResult = buildResult;
exports.toConsoleLine = toConsoleLine;
exports.shareFileName = shareFileName;
exports.screenshotName = screenshotName;
exports.runProgress = runProgress;
exports.classifyTap = classifyTap;
exports.toTapDiagLine = toTapDiagLine;
const metrics_1 = require("./metrics");
exports.RUNTIME_SCHEMA_VERSION = 't31-fe-c-1.0';
exports.CONSOLE_RESULT_PREFIX = '__CHAR3D_RUNTIME_RESULT__=';
exports.TAP_DIAG_PREFIX = '__CHAR3D_TAP__=';
exports.RUNS_REQUIRED = 3;
exports.ALL_FACINGS = [
    'right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown',
];
exports.ALL_STATES = ['idle', 'walk', 'basic', 'charge', 'strike', 'jump', 'dead'];
function emptyContextEvidence() {
    return {
        injectionMode: 'none', extAvailable: false, lostObserved: false, sessionContinuedWhileLost: false,
        restoreOk: false, restoreVia: 'none', fastPathError: null,
        rebuildAttempted: false, rebuildOk: false, rebuildError: null,
        rebuildPolicy: 'per-loss-single-attempt', terminalFailureInjected: false,
        firstFrameDtSec: null, pauseFrozenFrames: -1, resumeDtSec: null, clockResetOk: false,
        pendingFramesMax: 0, framesWhilePaused: -1,
        secondRestoreAttempted: false, secondRestoreFailed: false,
        pausedOnFinalFailure: false, errorPageShown: false, inputIgnoredWhilePaused: false,
        error: null,
    };
}
function contextEvidenceOk(c) {
    const recovered = c.restoreOk && (c.restoreVia === 'event' || (c.restoreVia === 'rebuild' && c.rebuildOk));
    return (c.lostObserved &&
        c.sessionContinuedWhileLost &&
        recovered &&
        c.clockResetOk &&
        c.pendingFramesMax <= 1 &&
        c.framesWhilePaused === 0 &&
        c.secondRestoreAttempted &&
        c.secondRestoreFailed &&
        c.pausedOnFinalFailure &&
        c.errorPageShown &&
        c.inputIgnoredWhilePaused);
}
exports.PHASES_ORDER = ['boot', 'sixdir', 'states', 'jump-trio', 'perf', 'context'];
function deviceHashOf(d) {
    const parts = [d.brand, d.model, d.system, d.platform, d.SDKVersion, d.renderer, d.vendor, d.unmaskedRenderer, d.pixelRatio].join('|');
    let h = 2166136261;
    for (let i = 0; i < parts.length; i++) {
        h ^= parts.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}
function countByCacheState(runs, state) {
    return runs.filter((r) => r.cacheState === state).length;
}
function assertScenarioRows(rows) {
    return rows.length > 0 && rows.every((r) => r.activeClipKey === r.expectedClipKey);
}
function runtimeVerdicts(ctx) {
    const notes = [];
    const sim = ctx.env.sim;
    const prefix = sim ? 'SIM_' : '';
    const coldRuns = countByCacheState(ctx.runs, 'cold');
    const hotRuns = countByCacheState(ctx.runs, 'hot');
    const serializeFailures = ctx.runs.reduce((n, r) => n + r.failures, 0);
    const sixdirOk = ctx.sixDir.length === exports.ALL_FACINGS.length && ctx.sixDir.every((r) => r.ok);
    const statesOk = ctx.states.length === exports.ALL_STATES.length && ctx.states.every((r) => r.ok);
    const context = ctx.context;
    const contextOk = contextEvidenceOk(context);
    let device;
    if (ctx.resource.loadStatus === 'failed') {
        device = prefix + 'DEVICE_FAIL';
        notes.push('资源门失败：' + (ctx.resource.diagnostics.slice(0, 3).join(' | ') || '未知'));
    }
    else if (serializeFailures > 0 && sixdirOk === false && statesOk === false) {
        device = prefix + 'DEVICE_FAIL';
        notes.push('六向与全状态均未过 ⇒ 不构成 Device-PASS');
    }
    else if (coldRuns >= exports.RUNS_REQUIRED && hotRuns >= exports.RUNS_REQUIRED) {
        device = prefix + 'DEVICE_PASS';
        notes.push('冷启动 ' + coldRuns + '/' + exports.RUNS_REQUIRED + ' + 热缓存 ' + hotRuns + '/' + exports.RUNS_REQUIRED +
            ' 全绿（loader 冷/热两条状态机链均在真机跑过）');
    }
    else {
        device = prefix + 'DEVICE_INCOMPLETE';
        notes.push('冷启动 ' + coldRuns + '/' + exports.RUNS_REQUIRED + '、热缓存 ' + hotRuns + '/' + exports.RUNS_REQUIRED +
            ' ⇒ **未完成，不是失败**：继续「完全杀微信 → 重新扫码」凑满冷 3 次，再热启动 3 次（不杀进程，退后台再进）');
    }
    const sixdir = sim ? 'SIM_' + (sixdirOk ? 'PASS' : 'FAIL') : sixdirOk ? 'PASS' : 'FAIL';
    const states = sim ? 'SIM_' + (statesOk ? 'PASS' : 'FAIL') : statesOk ? 'PASS' : 'FAIL';
    const contextRestore = context.injectionMode === 'none'
        ? 'NOT_RUN'
        : context.injectionMode === 'host-api-fallback'
            ? (contextOk ? 'ALTERNATE_ONLY_PASS' : 'ALTERNATE_ONLY_FAIL')
            : (sim ? 'SIM_' : '') + (contextOk ? 'PASS' : 'FAIL');
    const rec20 = ctx.capacity.filter((r) => r.unitCount === 20)[0];
    let capacity20 = 'NOT_RUN';
    let capacityEngine = null;
    let capacityReasons = null;
    if (rec20) {
        const j = (0, metrics_1.judgeCapacity20)(rec20);
        capacityEngine = j.verdict;
        capacityReasons = j.reasons;
        if (rec20.specProfile === false) {
            capacity20 = 'NON_SPEC_PROFILE_NOT_APPLICABLE';
            notes.push('20 单位档为非方案口径采样（a2Profile=' + rec20.a2Profile + '）⇒ 只证明判定逻辑能出结论，不作为容量结论');
        }
        else {
            capacity20 = (sim ? 'SIM_' : '') + j.verdict;
        }
    }
    else {
        notes.push('20 单位档未跑（capacity20 = NOT_RUN）');
    }
    if (!context.extAvailable) {
        notes.push('宿主不支持 WEBGL_lose_context（ext）⇒ 未见真注入；若走了 host-api 直接调 renderer 入口，只算替代验证，不当作真机上下文丢失证据');
    }
    if (sim) {
        notes.push('本次为浏览器 sim：只证明同一份 bundle 的代码路径通，**不是**微信/安卓能力证据（方案 §9.3）');
    }
    const notOk = ctx.phases.filter((p) => p.status !== 'ok');
    if (notOk.length > 0) {
        notes.push('未完成的阶段（phasesOrder=' + exports.PHASES_ORDER.join(' → ') + '）：' +
            notOk.map((p) => p.name + '(' + p.status + (p.detail ? '：' + p.detail : '') + ')').join(' / ') +
            ' —— 已产出的阶段结果照常导出，不影响其余判定');
    }
    if (ctx.context.restoreVia === 'rebuild') {
        notes.push('上下文恢复走**真重建**（平台不允许扩展恢复' +
            (ctx.context.fastPathError ? '：' + ctx.context.fastPathError : '') +
            '）：新建离屏 canvas/context + 经 loader 从缓存重新装配并重传资源；该平台**未执行**扩展恢复路径');
    }
    if (ctx.resource.mode === 'local-subpackage') {
        notes.push('资源链走分包/本地路径 adapter ⇒ 已执行：清单校验/缓存命中/临时落盘/SHA-256 校验/结构门/原子登记/LKG/解析；未执行：wx.downloadFile HTTP 链路与合法域名白名单');
    }
    return {
        verdict: { device, sixdir, states, contextRestore, capacity20, capacity20Engine: capacityEngine, capacity20Reasons: capacityReasons },
        notes,
    };
}
function buildResult(ctx) {
    const { verdict, notes } = runtimeVerdicts(ctx);
    return Object.assign(Object.assign({ schemaVersion: exports.RUNTIME_SCHEMA_VERSION }, ctx), { device: Object.assign(Object.assign({}, ctx.device), { deviceHash: ctx.device.deviceHash || deviceHashOf(ctx.device) }), verdict,
        notes });
}
function toConsoleLine(result) {
    return exports.CONSOLE_RESULT_PREFIX + JSON.stringify(result);
}
function shareFileName(result, kind = 'result') {
    const run = result.runs.length ? result.runs[result.runs.length - 1].runIndex : 0;
    return 'char3d_' + result.device.deviceHash + '_' + kind + '_run' + run + '.json';
}
function screenshotName(result, tag) {
    const run = result.runs.length ? result.runs[result.runs.length - 1].runIndex : 0;
    return 'c3d_' + result.device.deviceHash + '_' + tag + '_run' + run + '.png';
}
function runProgress(runs) {
    return { cold: countByCacheState(runs, 'cold'), hot: countByCacheState(runs, 'hot'), required: exports.RUNS_REQUIRED };
}
function classifyTap(t) {
    if (!t.listenerAttached)
        return 'not-connected';
    if (t.hit === null)
        return 'miss';
    if (t.paused)
        return 'paused';
    return 'hit';
}
function toTapDiagLine(t) {
    return exports.TAP_DIAG_PREFIX + JSON.stringify({
        mapped: t.mapped,
        canvasSpace: t.canvasSpace,
        windowSpace: t.windowSpace,
        hit: t.hit,
        nearest: t.nearest,
        listenerAttached: t.listenerAttached,
        paused: t.paused,
        verdict: classifyTap(t),
    });
}

  });
  // ---- proto/character3d_runtime_demo/metrics ----
  __def("proto/character3d_runtime_demo/metrics", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REQUIRED_MIN_SAMPLES = exports.CAPACITY_THRESHOLDS = void 0;
exports.sortAsc = sortAsc;
exports.percentile = percentile;
exports.mean = mean;
exports.onePercentLowFps = onePercentLowFps;
exports.ratioOver = ratioOver;
exports.createSampler = createSampler;
exports.judgeCapacity20 = judgeCapacity20;
exports.layoutUnitCells = layoutUnitCells;
exports.isPlacedInsideViewport = isPlacedInsideViewport;
exports.CAPACITY_THRESHOLDS = {
    fpsMedianMin: 30,
    frameMsP95Max: 33.3,
    frameMsP99Max: 50,
    over50RatioMax: 0.01,
    requiredDrawCalls: 20,
    requiredPalettes: 20,
};
exports.REQUIRED_MIN_SAMPLES = 1800;
function sortAsc(values) {
    return values.slice().sort((a, b) => a - b);
}
function percentile(sortedAsc, p) {
    const n = sortedAsc.length;
    if (n === 0)
        return 0;
    const idx = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
    return sortedAsc[idx];
}
function mean(values) {
    if (values.length === 0)
        return 0;
    let sum = 0;
    for (const v of values)
        sum += v;
    return sum / values.length;
}
function onePercentLowFps(sortedAsc) {
    const n = sortedAsc.length;
    if (n === 0)
        return 0;
    const k = Math.max(1, Math.ceil(n * 0.01));
    const worst = sortedAsc.slice(n - k);
    const avg = mean(worst);
    return avg > 0 ? 1000 / avg : 0;
}
function ratioOver(sortedAsc, thresholdMs) {
    const n = sortedAsc.length;
    if (n === 0)
        return 0;
    let over = 0;
    for (const v of sortedAsc)
        if (v > thresholdMs)
            over++;
    return over / n;
}
function round(v, digits) {
    const f = 10 ** digits;
    return Math.round(v * f) / f;
}
function createSampler(unitCount, durationSec, requiredMinSamples = exports.REQUIRED_MIN_SAMPLES) {
    const frames = [];
    let startedAt = null;
    let lastFrameAt = null;
    const rolling = [];
    let truncated = false;
    let truncateReason = null;
    return {
        unitCount,
        requiredSec: durationSec,
        requiredMinSamples,
        isDone() {
            return frames.length >= requiredMinSamples && this.elapsedSec >= durationSec;
        },
        markFrameTime(tAbsMs) {
            if (startedAt === null)
                startedAt = tAbsMs;
            lastFrameAt = tAbsMs;
        },
        push(sample) {
            frames.push(sample);
            rolling.push(sample.wallMs > 0 ? 1000 / sample.wallMs : 0);
            if (rolling.length > 30)
                rolling.shift();
        },
        get sampleCount() {
            return frames.length;
        },
        get elapsedSec() {
            return startedAt === null || lastFrameAt === null ? 0 : (lastFrameAt - startedAt) / 1000;
        },
        rollingFps() {
            return rolling.length ? mean(rolling) : 0;
        },
        markTruncated(reason) {
            truncated = true;
            truncateReason = reason;
        },
        summarize(extra) {
            const wall = sortAsc(frames.map((f) => f.wallMs));
            const fps = sortAsc(frames.map((f) => (f.wallMs > 0 ? 1000 / f.wallMs : 0)));
            const gpus = frames.map((f) => f.gpuMs).filter((v) => v !== null && v !== undefined);
            const rec = Object.assign({ unitCount, durationSec: round(this.elapsedSec, 3), sampleCount: frames.length, fpsMean: round(mean(fps), 2), fpsMedian: round(percentile(fps, 0.5), 2), onePercentLowFps: round(onePercentLowFps(wall), 2), frameMsMedian: round(percentile(wall, 0.5), 3), frameMsP95: round(percentile(wall, 0.95), 3), frameMsP99: round(percentile(wall, 0.99), 3), over33msRatio: round(ratioOver(wall, 33), 5), over50msRatio: round(ratioOver(wall, 50), 5), passMsMedian: round(percentile(sortAsc(frames.map((f) => f.passMs)), 0.5), 4), passMsMean: round(mean(frames.map((f) => f.passMs)), 4), animMsMean: round(mean(frames.map((f) => f.animMs)), 4), submitMsMean: round(mean(frames.map((f) => f.submitMs)), 4), compositeCpuMsMean: round(mean(frames.map((f) => f.compositeMs)), 4), gpuMs: gpus.length ? round(percentile(sortAsc(gpus), 0.5), 4) : null, gpuMsSource: gpus.length ? 'EXT_disjoint_timer_query_webgl2' : 'unavailable', contextLostCount: 0, glErrorCount: 0, drawCallsPerFrame: 0, skinPalettesPerFrame: 0, allUnitsOnScreen: false, visibilityNote: '', specProfile: true, a2Profile: 'spec', truncated,
                truncateReason }, extra);
            return rec;
        },
    };
}
function judgeCapacity20(rec) {
    const reasons = [];
    if (!rec)
        return { pass: false, reasons: ['无 20 单位档数据'], verdict: 'A_COMPATIBLE_CAPACITY_FAIL' };
    if (rec.truncated)
        reasons.push('采样被防呆截断：' + (rec.truncateReason || '未达规定采样量'));
    if (rec.specProfile === false)
        reasons.push('非方案口径采样（a2Profile=' + rec.a2Profile + '）⇒ 不得作为容量结论');
    if (!(rec.fpsMedian >= exports.CAPACITY_THRESHOLDS.fpsMedianMin))
        reasons.push('fpsMedian ' + rec.fpsMedian + ' < ' + exports.CAPACITY_THRESHOLDS.fpsMedianMin);
    if (!(rec.frameMsP95 <= exports.CAPACITY_THRESHOLDS.frameMsP95Max))
        reasons.push('frameMsP95 ' + rec.frameMsP95 + ' > ' + exports.CAPACITY_THRESHOLDS.frameMsP95Max);
    if (!(rec.frameMsP99 <= exports.CAPACITY_THRESHOLDS.frameMsP99Max))
        reasons.push('frameMsP99 ' + rec.frameMsP99 + ' > ' + exports.CAPACITY_THRESHOLDS.frameMsP99Max);
    if (!(rec.over50msRatio <= exports.CAPACITY_THRESHOLDS.over50RatioMax))
        reasons.push('over50msRatio ' + rec.over50msRatio + ' > 1%');
    if (rec.contextLostCount !== 0)
        reasons.push('contextLostCount ' + rec.contextLostCount + ' != 0');
    if (rec.glErrorCount !== 0)
        reasons.push('glErrorCount ' + rec.glErrorCount + ' != 0');
    if (rec.drawCallsPerFrame !== exports.CAPACITY_THRESHOLDS.requiredDrawCalls)
        reasons.push('drawCallsPerFrame ' + rec.drawCallsPerFrame + ' != 20');
    if (rec.skinPalettesPerFrame !== exports.CAPACITY_THRESHOLDS.requiredPalettes)
        reasons.push('skinPalettesPerFrame ' + rec.skinPalettesPerFrame + ' != 20');
    if (rec.allUnitsOnScreen !== true)
        reasons.push('屏上 20 个角色未全部可见');
    return {
        pass: reasons.length === 0,
        reasons,
        verdict: reasons.length === 0 ? 'CAPACITY_PASS' : 'A_COMPATIBLE_CAPACITY_FAIL',
    };
}
function layoutUnitCells(n, widthPx, heightPx) {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cellW = widthPx / cols;
    const cellH = heightPx / rows;
    const cells = [];
    for (let i = 0; i < n; i++) {
        cells.push({ cx: cellW * ((i % cols) + 0.5), feetY: cellH * (Math.floor(i / cols) + 0.92) });
    }
    return { cols, rows, cellW, cellH, cells };
}
function isPlacedInsideViewport(box, widthPx, heightPx) {
    const x0 = box.cx - box.w / 2;
    const x1 = box.cx + box.w / 2;
    return x0 >= 0 && box.top >= 0 && x1 <= widthPx && box.top + box.h <= heightPx && box.w > 2 && box.h > 2;
}

  });
  // ---- proto/character3d_runtime_demo/scenarios ----
  __def("proto/character3d_runtime_demo/scenarios", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNIT_PHASE_STEP_SEC = exports.SIM_PROFILE = exports.SPEC_PROFILE = exports.STATE_SAMPLES = exports.FACING_SAMPLES = exports.MOVE_LOCK_CASES = exports.SIX_FACINGS = exports.EXPECTED_CLIP_BY_STATE = void 0;
exports.lockedIsJump = lockedIsJump;
const evidence_1 = require("./evidence");
exports.EXPECTED_CLIP_BY_STATE = {
    idle: 'idle',
    walk: 'walk',
    basic: 'atk',
    charge: 'cast',
    strike: 'cast',
    jump: 'jump',
    dead: 'idle',
};
exports.SIX_FACINGS = evidence_1.ALL_FACINGS;
function lockedIsJump(anim, dead) {
    return anim !== null && anim.t < anim.durationSec && !dead ? anim.isJumpMove : false;
}
exports.MOVE_LOCK_CASES = [
    {
        caseId: 'jump-inside-300ms-window',
        note: '快照窗内（t=0.10s）：快照 isJump=true，命令消费锁定值 true',
        syntheticSnapshotIsJump: true,
        snapshotIsJumpAtSample: true,
        intent: { isJumpMove: true, t: 0.1, durationSec: 1.2 },
        dead: false,
        footX: 300, footY: 900, hopPx: 120, state: 'walk', moveProgress: 0.083,
        expectedClipKey: 'jump', expectedCmdIsJump: true,
    },
    {
        caseId: 'jump-after-300ms-snapshot-window',
        note: '★ seq=418 关键例：快照窗已过（本帧快照 isJump=false），但演出仍有效 ⇒ 命令仍 true、clip 仍 jump',
        syntheticSnapshotIsJump: true,
        snapshotIsJumpAtSample: false,
        intent: { isJumpMove: true, t: 0.45, durationSec: 1.2 },
        dead: false,
        footX: 420, footY: 900, hopPx: 240, state: 'walk', moveProgress: 0.375,
        expectedClipKey: 'jump', expectedCmdIsJump: true,
    },
    {
        caseId: 'walk-normal-no-jump',
        note: '普通移动：快照与命令均 false ⇒ clip=walk（不许被误判成轻功）',
        syntheticSnapshotIsJump: false,
        snapshotIsJumpAtSample: false,
        intent: { isJumpMove: false, t: 0.3, durationSec: 0.6 },
        dead: false,
        footX: 540, footY: 900, hopPx: 0, state: 'walk', moveProgress: 0.5,
        expectedClipKey: 'walk', expectedCmdIsJump: false,
    },
    {
        caseId: 'jump-endpoint-hop0',
        note: '★ 抛物线端点 hop=0（起跳瞬间 t=0.01）：不得按 hop 反推 ⇒ 命令仍 true、clip 仍 jump',
        syntheticSnapshotIsJump: true,
        snapshotIsJumpAtSample: true,
        intent: { isJumpMove: true, t: 0.01, durationSec: 1.2 },
        dead: false,
        footX: 660, footY: 900, hopPx: 0, state: 'walk', moveProgress: 0.008,
        expectedClipKey: 'jump', expectedCmdIsJump: true,
    },
    {
        caseId: 'jump-landing-hop0',
        note: '★ 抛物线端点 hop=0（落地下压前 t=1.19/1.2）：命令仍 true、clip 仍 jump',
        syntheticSnapshotIsJump: true,
        snapshotIsJumpAtSample: false,
        intent: { isJumpMove: true, t: 1.19, durationSec: 1.2 },
        dead: false,
        footX: 780, footY: 900, hopPx: 0, state: 'walk', moveProgress: 0.991,
        expectedClipKey: 'jump', expectedCmdIsJump: true,
    },
    {
        caseId: 'jump-released-after-duration',
        note: '演出走满 ⇒ 锁定值释放（cmdIsJump=false），后续普通移动回 walk（不串状态）',
        syntheticSnapshotIsJump: true,
        snapshotIsJumpAtSample: false,
        intent: { isJumpMove: true, t: 1.2, durationSec: 1.2 },
        dead: false,
        footX: 900, footY: 900, hopPx: 0, state: 'walk', moveProgress: 1,
        expectedClipKey: 'walk', expectedCmdIsJump: false,
    },
    {
        caseId: 'jump-died-releases',
        note: '★ 阵亡释放锁：即使演出未走满也不得再判轻功（死亡优先）',
        syntheticSnapshotIsJump: true,
        snapshotIsJumpAtSample: false,
        intent: { isJumpMove: true, t: 0.5, durationSec: 1.2 },
        dead: true,
        footX: 240, footY: 1200, hopPx: 0, state: 'dead', moveProgress: null,
        expectedClipKey: 'idle', expectedCmdIsJump: false,
    },
];
exports.FACING_SAMPLES = exports.SIX_FACINGS.map((facing, i) => ({
    facing,
    state: (i % 2 === 0 ? 'idle' : 'walk'),
    expectedClipKey: i % 2 === 0 ? 'idle' : 'walk',
    u: ((i % 3) + 0.5) / 3,
    v: i < 3 ? 0.3 : 0.62,
}));
const STATE_WARMUP_FRAMES = 30;
exports.STATE_SAMPLES = [
    { label: 'idle', cmdState: 'idle', isJump: false, expectedClipKey: 'idle', stateElapsedSec: 0.4, moveProgress: null, hopPx: 0, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
    { label: 'walk', cmdState: 'walk', isJump: false, expectedClipKey: 'walk', stateElapsedSec: 0.4, moveProgress: 0.4, hopPx: 0, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
    { label: 'basic', cmdState: 'basic', isJump: false, expectedClipKey: 'atk', stateElapsedSec: 0.6, moveProgress: null, hopPx: 0, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
    { label: 'charge', cmdState: 'charge', isJump: false, expectedClipKey: 'cast', stateElapsedSec: 0.7, moveProgress: null, hopPx: 0, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
    { label: 'strike', cmdState: 'strike', isJump: false, expectedClipKey: 'cast', stateElapsedSec: 0.25, moveProgress: null, hopPx: 0, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
    { label: 'jump', cmdState: 'walk', isJump: true, expectedClipKey: 'jump', stateElapsedSec: 0.6, moveProgress: 0.5, hopPx: 150, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
    { label: 'dead', cmdState: 'dead', isJump: false, expectedClipKey: 'idle', stateElapsedSec: 0, moveProgress: null, hopPx: 0, squashY: 0.45, alpha: 0.35, warmupFrames: STATE_WARMUP_FRAMES },
];
exports.SPEC_PROFILE = {
    name: 'spec',
    warmupSec: 10,
    stages: [
        { units: 1, sampleSec: 30 },
        { units: 5, sampleSec: 30 },
        { units: 10, sampleSec: 30 },
        { units: 20, sampleSec: 60 },
    ],
};
exports.SIM_PROFILE = {
    name: 'sim-short',
    warmupSec: 2,
    stages: [
        { units: 1, sampleSec: 3 },
        { units: 5, sampleSec: 3 },
        { units: 10, sampleSec: 3 },
        { units: 20, sampleSec: 6 },
    ],
};
exports.UNIT_PHASE_STEP_SEC = 0.137;

  });
  // ---- proto/character3d_runtime_demo/adapter-local ----
  __def("proto/character3d_runtime_demo/adapter-local", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBPACKAGE_ROOT = exports.SUBPACKAGE_NAME = exports.LOCAL_BASE_URL = void 0;
exports.resolveResourceChainPlan = resolveResourceChainPlan;
exports.codePackageCandidates = codePackageCandidates;
exports.stripLocalBase = stripLocalBase;
exports.createLocalSubpackagePlatform = createLocalSubpackagePlatform;
exports.createResourcePlatform = createResourcePlatform;
const platform_wx_1 = require("../../ui/character3d/platform-wx");
exports.LOCAL_BASE_URL = 'code-package://char3d-assets';
exports.SUBPACKAGE_NAME = 'char3d-assets';
exports.SUBPACKAGE_ROOT = 'subpackages/char3d-assets';
const LOCAL_EXECUTED = [
    '清单/profile 校验（assertValidAssetRef + validateCharacter3DProfile 口径）',
    'cache by SHA 命中判定（wx storage 索引 + USER_DATA_PATH 文件存在性）',
    '未命中 → 读分包资产 → 写临时文件（USER_DATA_PATH/character3d/tmp-*）',
    'SHA-256 校验（FileSystemManager.getFileInfo digestAlgorithm=sha256）',
    'byteLength 校验 + GLB 结构门（41 骨 / 1 primitive / 贴图数）',
    '原子登记 LKG（rename/copy + storage 索引落盘，失败回滚）',
    'LKG 回退分支（stale-3d-cache，SHA 不符时不覆盖 LKG）',
    'GLB/动作 json 解析 + 贴图解码（wx.createImage）+ 首传 GPU',
    '热启动 cache-hit 链（第二次运行走索引命中，不重读分包资产）',
];
const LOCAL_NOT_EXECUTED = [
    'wx.downloadFile HTTP 下载（含 statusCode 处理与 timeoutMs 取消）',
    '微信 downloadFile 合法域名白名单校验',
    'CDN 内容版本化目录在服务端的真实 404/回源行为',
    '真实网络失败/断网/超时下的重试间隔（1s/3s）与网络错误分类',
];
const CDN_EXECUTED = [
    'wx.downloadFile HTTP 下载（statusCode / timeout / abort）',
    '清单校验 + cache by SHA + 临时文件 + SHA-256 + 结构门 + 原子登记 + LKG',
    '重试恰 2 次（1s/3s）与网络错误分类',
];
const CDN_NOT_EXECUTED = [
    '合法域名白名单是否已备案（需宿主侧配置，代码不可见）',
    'CDN 服务端内容版本化与回源策略（部署侧）',
];
function resolveResourceChainPlan(input) {
    var _a;
    const raw = ((_a = input.cdnBaseUrl) !== null && _a !== void 0 ? _a : '').trim();
    const isHttp = /^https?:\/\/[^\s]+$/.test(raw);
    if (isHttp) {
        return {
            mode: 'cdn',
            cdnBaseUrl: raw.replace(/\/+$/, ''),
            executedBranches: CDN_EXECUTED.slice(),
            notExecutedBranches: CDN_NOT_EXECUTED.slice(),
            note: 'CDN 模式：走生产 wx adapter 的 wx.downloadFile 链路（需该域名已在微信后台配置 downloadFile 合法域名）',
        };
    }
    return {
        mode: 'local-subpackage',
        cdnBaseUrl: exports.LOCAL_BASE_URL,
        executedBranches: LOCAL_EXECUTED.slice(),
        notExecutedBranches: LOCAL_NOT_EXECUTED.slice(),
        note: raw.length > 0
            ? '提供的 cdnBaseUrl 不是 http(s) 绝对地址 ⇒ 拒用并退回分包本地路径模式（不伪造下载）'
            : '未配置 cdnBaseUrl ⇒ 分包本地路径模式：同一条 loader 状态机，但「下载」一步读的是分包资产',
    };
}
function codePackageCandidates(relativePath, root = exports.SUBPACKAGE_ROOT) {
    return [root + '/' + relativePath, '/' + root + '/' + relativePath];
}
function stripLocalBase(url) {
    const prefix = exports.LOCAL_BASE_URL + '/';
    if (!url.startsWith(prefix))
        return null;
    const rel = url.slice(prefix.length);
    return rel.length > 0 ? rel : null;
}
function createLocalSubpackagePlatform(options = {}) {
    var _a, _b;
    const inner = (0, platform_wx_1.createWxCharacter3DPlatform)({ runtime: options.runtime, logSink: options.logSink });
    const host = (_a = options.runtime) !== null && _a !== void 0 ? _a : resolveRuntime();
    const root = (_b = options.root) !== null && _b !== void 0 ? _b : exports.SUBPACKAGE_ROOT;
    const resolvedCodePaths = {};
    function readCodeFile(relativePath, downloadOptions) {
        return new Promise((resolve, reject) => {
            var _a;
            if ((_a = downloadOptions === null || downloadOptions === void 0 ? void 0 : downloadOptions.signal) === null || _a === void 0 ? void 0 : _a.aborted) {
                reject(new Error('[local-subpackage] 读取被取消: ' + relativePath));
                return;
            }
            const fs = host.getFileSystemManager();
            const candidates = codePackageCandidates(relativePath, root);
            let i = 0;
            const tryNext = () => {
                if (i >= candidates.length) {
                    reject(new Error('[local-subpackage] 分包资产不存在（候选全失败）: ' + candidates.join(' | ')));
                    return;
                }
                const path = candidates[i++];
                try {
                    fs.readFile({
                        filePath: path,
                        success: (res) => {
                            const data = res.data;
                            if (!(data instanceof ArrayBuffer)) {
                                reject(new Error('[local-subpackage] 读分包文件未返回二进制: ' + path));
                                return;
                            }
                            resolvedCodePaths[relativePath] = path;
                            resolve(new Uint8Array(data));
                        },
                        fail: () => tryNext(),
                    });
                }
                catch (error) {
                    reject(new Error('[local-subpackage] readFile 抛错 ' + path + ': ' + String(error)));
                }
            };
            tryNext();
        });
    }
    return {
        kind: 'wx-local-subpackage',
        resolvedCodePaths,
        createOffscreenCanvas(width, height) {
            return inner.createOffscreenCanvas(width, height);
        },
        downloadArrayBuffer(url, downloadOptions) {
            const rel = stripLocalBase(url);
            if (rel === null) {
                return Promise.reject(new Error('[local-subpackage] 非本地资产 URL，本地 adapter 拒绝: ' + url));
            }
            return readCodeFile(rel, downloadOptions);
        },
        sha256File(path) {
            return inner.sha256File(path);
        },
        sha256Bytes(bytes) {
            return inner.sha256Bytes(bytes);
        },
        cacheGet(assetId) {
            return inner.cacheGet(assetId);
        },
        cachePut(input) {
            return inner.cachePut(input);
        },
        cacheRemove(assetId) {
            return inner.cacheRemove(assetId);
        },
        writeTempFile(name, bytes) {
            return inner.writeTempFile(name, bytes);
        },
        readFileBytes(path) {
            return inner.readFileBytes(path);
        },
        removeFile(path) {
            return inner.removeFile(path);
        },
        decodeImage(bytes, mimeType, name) {
            return inner.decodeImage(bytes, mimeType, name);
        },
        now() {
            return inner.now();
        },
        log(level, message, data) {
            inner.log(level, message, data);
        },
    };
}
function resolveRuntime() {
    const fromGlobal = globalThis.wx;
    if (fromGlobal && fromGlobal.env && typeof fromGlobal.downloadFile === 'function')
        return fromGlobal;
    if (typeof wx !== 'undefined') {
        const declared = wx;
        if (declared && typeof declared.downloadFile === 'function')
            return declared;
    }
    throw new Error('[adapter-local] 无 wx 全局：不是微信小游戏宿主');
}
function createResourcePlatform(plan, options = {}) {
    if (plan.mode === 'cdn') {
        return (0, platform_wx_1.createWxCharacter3DPlatform)({ runtime: options.runtime, logSink: options.logSink });
    }
    return createLocalSubpackagePlatform(options);
}

  });
  // ---- ui/character3d/platform-wx ----
  __def("ui/character3d/platform-wx", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveWxRuntime = resolveWxRuntime;
exports.createWxCharacter3DPlatform = createWxCharacter3DPlatform;
function resolveWxRuntime() {
    const fromGlobal = globalThis.wx;
    if (fromGlobal && fromGlobal.env && typeof fromGlobal.downloadFile === 'function')
        return fromGlobal;
    if (typeof wx !== 'undefined') {
        const declared = wx;
        if (declared && typeof declared.downloadFile === 'function')
            return declared;
    }
    throw new Error('[platform-wx] 无 wx 全局：不是微信小游戏宿主');
}
const CACHE_DIR_NAME = 'character3d';
const CACHE_INDEX_KEY = 'character3d-cache-index-v1';
function createWxCharacter3DPlatform(options = {}) {
    var _a, _b;
    const host = (_a = options.runtime) !== null && _a !== void 0 ? _a : resolveWxRuntime();
    const fs = host.getFileSystemManager();
    const cacheDir = host.env.USER_DATA_PATH + '/' + CACHE_DIR_NAME;
    const logSink = (_b = options.logSink) !== null && _b !== void 0 ? _b : ((level, message, data) => {
        const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        fn(message, data !== null && data !== void 0 ? data : '');
    });
    try {
        fs.mkdirSync(cacheDir, true);
    }
    catch (_c) {
    }
    const cacheIndex = new Map(readIndex());
    let indexDirty = false;
    function readIndex() {
        try {
            const raw = host.getStorageSync(CACHE_INDEX_KEY);
            if (!raw || typeof raw !== 'object')
                return [];
            const entries = Object.entries(raw);
            return entries.filter(([, v]) => v && typeof v.savedPath === 'string' && typeof v.sha256 === 'string');
        }
        catch (_a) {
            return [];
        }
    }
    function persistIndex(strict) {
        if (!indexDirty)
            return;
        try {
            const obj = {};
            for (const [k, v] of cacheIndex)
                obj[k] = v;
            host.setStorageSync(CACHE_INDEX_KEY, obj);
            indexDirty = false;
        }
        catch (error) {
            logSink('warn', '[platform-wx] 缓存索引落盘失败', { message: String(error), strict });
            if (strict)
                throw new Error('[platform-wx] 缓存索引落盘失败: ' + String(error));
        }
    }
    function fileExists(path) {
        try {
            fs.accessSync(path);
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    function sha256OfFile(path) {
        return new Promise((resolve) => {
            try {
                fs.getFileInfo({
                    filePath: path,
                    digestAlgorithm: 'sha256',
                    success: (res) => resolve(res.digest ? String(res.digest).toLowerCase() : null),
                    fail: () => resolve(null),
                });
            }
            catch (_a) {
                resolve(null);
            }
        });
    }
    return {
        kind: 'wx',
        createOffscreenCanvas(width, height) {
            const canvas = host.createCanvas();
            canvas.width = width;
            canvas.height = height;
            return canvas;
        },
        downloadArrayBuffer(url, downloadOptions) {
            return new Promise((resolve, reject) => {
                let settled = false;
                const finish = (fn) => { if (!settled) {
                    settled = true;
                    fn();
                } };
                const task = host.downloadFile({
                    url,
                    timeout: downloadOptions.timeoutMs,
                    success: (res) => {
                        if (res.statusCode !== 200) {
                            finish(() => reject(new Error('[platform-wx] downloadFile HTTP ' + res.statusCode + ' ' + url)));
                            return;
                        }
                        fs.readFile({
                            filePath: res.tempFilePath,
                            success: (file) => {
                                const data = file.data;
                                if (!(data instanceof ArrayBuffer)) {
                                    finish(() => reject(new Error('[platform-wx] 下载结果不是二进制: ' + url)));
                                    return;
                                }
                                finish(() => resolve(new Uint8Array(data)));
                            },
                            fail: (err) => finish(() => reject(new Error('[platform-wx] 读下载临时文件失败: ' + (err.errMsg || url)))),
                        });
                    },
                    fail: (err) => finish(() => reject(new Error('[platform-wx] downloadFile 失败: ' + (err.errMsg || url)))),
                });
                if (downloadOptions.signal) {
                    downloadOptions.signal.onAbort(() => {
                        try {
                            task.abort();
                        }
                        catch (_a) { }
                        finish(() => reject(new Error('[platform-wx] 下载被取消: ' + url)));
                    });
                }
            });
        },
        sha256File(path) {
            return sha256OfFile(path);
        },
        async sha256Bytes(bytes) {
            const path = cacheDir + '/sha-probe.bin';
            const copy = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(copy).set(bytes);
            try {
                fs.writeFileSync(path, copy);
            }
            catch (error) {
                throw new Error('[platform-wx] 写 sha 探针文件失败: ' + String(error));
            }
            const digest = await sha256OfFile(path);
            try {
                fs.unlinkSync(path);
            }
            catch (_a) { }
            if (!digest) {
                throw new Error('[platform-wx] 该基础库不支持 getFileInfo(digestAlgorithm) ⇒ 无法校验 SHA-256，拒绝放行');
            }
            return digest;
        },
        async cacheGet(assetId) {
            const entry = cacheIndex.get(assetId);
            if (!entry)
                return null;
            if (!fileExists(entry.savedPath)) {
                cacheIndex.delete(assetId);
                indexDirty = true;
                persistIndex(false);
                return null;
            }
            return Object.assign({}, entry);
        },
        async cachePut(input) {
            if (!fileExists(input.tempPath)) {
                throw new Error('[platform-wx] 临时文件不存在: ' + input.tempPath);
            }
            const dest = cacheDir + '/' + input.assetId + '-' + input.sha256.slice(0, 12) + '.bin';
            if (!fileExists(dest)) {
                try {
                    fs.renameSync(input.tempPath, dest);
                }
                catch (_a) {
                    fs.copyFileSync(input.tempPath, dest);
                    try {
                        fs.unlinkSync(input.tempPath);
                    }
                    catch (_b) { }
                }
            }
            else {
                try {
                    fs.unlinkSync(input.tempPath);
                }
                catch (_c) { }
            }
            const entry = {
                assetId: input.assetId,
                sha256: input.sha256,
                savedPath: dest,
                byteLength: input.byteLength,
                lastUsedAt: Date.now(),
            };
            cacheIndex.set(input.assetId, entry);
            indexDirty = true;
            try {
                persistIndex(true);
            }
            catch (error) {
                cacheIndex.delete(input.assetId);
                indexDirty = true;
                try {
                    fs.unlinkSync(dest);
                }
                catch (_d) { }
                persistIndex(false);
                throw error;
            }
            return Object.assign({}, entry);
        },
        async cacheRemove(assetId) {
            const entry = cacheIndex.get(assetId);
            if (entry) {
                try {
                    fs.unlinkSync(entry.savedPath);
                }
                catch (_a) { }
            }
            cacheIndex.delete(assetId);
            indexDirty = true;
            persistIndex(false);
        },
        async writeTempFile(name, bytes) {
            const path = cacheDir + '/tmp-' + sanitize(name);
            const copy = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(copy).set(bytes);
            fs.writeFileSync(path, copy);
            return path;
        },
        async readFileBytes(path) {
            return await new Promise((resolve, reject) => {
                fs.readFile({
                    filePath: path,
                    success: (res) => {
                        if (res.data instanceof ArrayBuffer)
                            resolve(new Uint8Array(res.data));
                        else
                            reject(new Error('[platform-wx] 读文件未返回二进制: ' + path));
                    },
                    fail: (err) => reject(new Error('[platform-wx] 读文件失败 ' + path + ': ' + (err.errMsg || ''))),
                });
            });
        },
        async removeFile(path) {
            try {
                fs.unlinkSync(path);
            }
            catch (_a) {
            }
        },
        async decodeImage(bytes, mimeType, name) {
            const ext = mimeType.indexOf('png') >= 0 ? 'png' : 'jpg';
            const path = cacheDir + '/tex-' + sanitize(name) + '.' + ext;
            const copy = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(copy).set(bytes);
            fs.writeFileSync(path, copy);
            return await new Promise((resolve, reject) => {
                const img = host.createImage();
                img.onload = () => resolve({ image: img, width: img.width, height: img.height, mimeType });
                img.onerror = (err) => reject(new Error('[platform-wx] 贴图解码失败 ' + path + ' ' + String(err)));
                img.src = path;
            });
        },
        now() {
            return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        },
        log(level, message, data) {
            logSink(level, message, data);
        },
    };
}
function sanitize(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

  });
  // ---- proto/character3d_runtime_demo/hud ----
  __def("proto/character3d_runtime_demo/hud", function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUTTON_LABELS = exports.HUD_BUTTON_IDS = void 0;
exports.computeLayout = computeLayout;
exports.hitTest = hitTest;
exports.paginate = paginate;
exports.drawHud = drawHud;
exports.HUD_BUTTON_IDS = ['copy', 'share', 'view', 'perf', 'retry3d'];
function computeLayout(width, height, buttonIds) {
    const buttonsH = Math.max(64, Math.round(height * 0.075));
    const buttons = [];
    const n = buttonIds.length;
    const w = width / n;
    for (let i = 0; i < n; i++) {
        buttons.push({
            id: buttonIds[i],
            label: buttonIds[i],
            rect: { x0: w * i, y0: height - buttonsH, x1: w * (i + 1), y1: height },
        });
    }
    return { width, height, buttonsH, buttons, footerY: height - buttonsH - 8 };
}
function hitTest(layout, x, y) {
    let nearest = null;
    for (const b of layout.buttons) {
        const inside = x >= b.rect.x0 && x < b.rect.x1 && y >= b.rect.y0 && y < b.rect.y1;
        const cx = Math.max(b.rect.x0, Math.min(x, b.rect.x1));
        const cy = Math.max(b.rect.y0, Math.min(y, b.rect.y1));
        const d = inside ? 0 : Math.round(Math.hypot(x - cx, y - cy));
        if (nearest === null || d < nearest.d)
            nearest = { id: b.id, d };
        if (inside)
            return { hit: b.id, nearest: { id: b.id, d: 0 } };
    }
    return { hit: null, nearest };
}
function paginate(text, charsPerPage) {
    if (charsPerPage <= 0)
        return [text];
    const pages = [];
    for (let i = 0; i < text.length; i += charsPerPage)
        pages.push(text.slice(i, i + charsPerPage));
    return pages.length ? pages : [''];
}
exports.BUTTON_LABELS = {
    copy: '复制结果',
    share: '分享结果',
    view: '查看结果',
    perf: '重跑压测',
    retry3d: '重试3D',
};
const FONT = '"PingFang SC","Microsoft YaHei",monospace';
function drawHud(ctx, layout, view) {
    var _a;
    const w = layout.width;
    const fs = Math.max(12, Math.round(w / 46));
    const panelH = view.page
        ? Math.max(fs * 6, layout.footerY - fs * 2)
        : view.lines.length * fs * 1.45 + fs * 1.6;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, w, panelH);
    ctx.font = fs + 'px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (view.page) {
        drawPaged(ctx, layout, view.page, fs);
    }
    else {
        ctx.fillStyle = '#ffe9b8';
        let y = fs * 0.6;
        for (const line of view.lines) {
            ctx.fillText(line, fs * 0.6, y);
            y += fs * 1.45;
        }
    }
    ctx.fillStyle = '#8fe3a0';
    ctx.fillText(view.footer, fs * 0.6, layout.footerY - fs * 1.2);
    const bfont = Math.max(11, Math.round(w / 52));
    for (const b of layout.buttons) {
        ctx.fillStyle = 'rgba(40,32,22,0.92)';
        ctx.fillRect(b.rect.x0 + 3, b.rect.y0 + 3, b.rect.x1 - b.rect.x0 - 6, b.rect.y1 - b.rect.y0 - 6);
        ctx.strokeStyle = '#c9a25e';
        ctx.lineWidth = Math.max(1, Math.round(w / 720));
        ctx.strokeRect(b.rect.x0 + 3, b.rect.y0 + 3, b.rect.x1 - b.rect.x0 - 6, b.rect.y1 - b.rect.y0 - 6);
        ctx.fillStyle = '#ffe9b8';
        ctx.font = bfont + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((_a = exports.BUTTON_LABELS[b.id]) !== null && _a !== void 0 ? _a : b.id, (b.rect.x0 + b.rect.x1) / 2, (b.rect.y0 + b.rect.y1) / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = fs + 'px ' + FONT;
    }
    return layout.buttons;
}
function drawPaged(ctx, layout, page, fs) {
    const w = layout.width;
    const perLine = Math.max(8, Math.floor(w / (fs * 0.62)));
    ctx.fillStyle = '#d8e6f2';
    let y = fs * 0.6;
    for (let i = 0; i < page.text.length; i += perLine) {
        ctx.fillText(page.text.slice(i, i + perLine), fs * 0.6, y);
        y += fs * 1.25;
        if (y > layout.footerY - fs * 2)
            break;
    }
    ctx.fillStyle = '#9ec8f0';
    ctx.fillText('第 ' + (page.index + 1) + '/' + page.total + ' 页 · 点右半下一页 / 左半上一页 / 底部按钮返回', fs * 0.6, layout.footerY - fs * 2.2);
}

  });
  __req("proto/character3d_runtime_demo/main", "./main"); // 入口
})();