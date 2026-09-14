// proto/webgl2_probe/tests/probe-browser.mjs
// T31 浏览器层自动化：起一个零依赖静态服务器 → 复用仓库既有 playwright-core + 系统 Chrome（同
// proto/battle_demo/shot.mjs 的路子）→ 连续 3 次"冷启动"加载等价模拟 + A1 断言核对 + A2 四档出数
// → 截图与结果 JSON 落 tests/artifacts/。
//
// 为什么起 HTTP 服务器而不是 file://：GLB 是二进制资产，file:// 下 fetch/XHR 被 CORS 拦（浏览器层
// 必须真读 4.04MB GLB）。服务器用 node:http 内置模块，**零新依赖**。
//
// 用法：node proto/webgl2_probe/tests/probe-browser.mjs [--runs=3] [--profile=browser-short|spec]
//        [--a2=auto|run|skip] [--maincontrol=1] [--vw=390] [--vh=844] [--dsf=2]
//        [--shots=last|all]   截图入库范围：last=只存最后一次冷启动的（控体积）；all=三次全存
// 退出码：全绿 0；任一断言失败 1；环境异常 2。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const here = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.resolve(here, '..');
const REPO = path.resolve(here, '../../..');
const OUT = path.join(here, 'artifacts');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MODEL = path.join(PROBE, 'subpackages/probe-model/hero_48k_20260914.glb');
const MODEL_SHA_BASELINE = 'ff9202b48470c92ccdad0333108e77e193a4135f873ce68e7e3498e979f816f0';

const arg = (n, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith('--' + n + '='));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const RUNS = +arg('runs', '3');
const PROFILE = arg('profile', 'browser-short');
const A2MODE = arg('a2', 'auto');
const MAINCONTROL = arg('maincontrol', '1') !== '0';
const SHOTS = arg('shots', 'last');
const VIEWPORT = { width: +arg('vw', '390'), height: +arg('vh', '844') };
const DSF = +arg('dsf', '2');

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };

function serve(repoRoot) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(repoRoot, url);
      if (!file.startsWith(repoRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function gitHead() {
  try {
    return require('node:child_process').execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim();
  } catch (e) { return 'unknown'; }
}

/** 从 vfs 里取 dataURL 截图并落盘（文件名已由 probe 按方案 §8 命名规则生成）。 */
function dumpScreenshots(vfs, runTag, keep) {
  const written = [];
  const skipped = [];
  for (const [key, val] of vfs.entries()) {
    if (!key.startsWith('dataurl:')) continue;
    const name = key.slice('dataurl:'.length);
    if (keep && !keep(name)) { skipped.push(name); continue; }
    const base64 = String(val).replace(/^data:image\/png;base64,/, '');
    const file = path.join(OUT, name);
    fs.writeFileSync(file, Buffer.from(base64, 'base64'));
    written.push(name);
  }
  if (skipped.length) console.log(`  （按 --shots=last 略过 ${skipped.length} 张重复截图：${skipped.join(', ')}）`);
  return written;
}

async function main() {
  if (!fs.existsSync(CHROME)) { console.error('缺系统 Chrome: ' + CHROME); process.exit(2); }
  if (!fs.existsSync(MODEL)) { console.error('缺模型副本: ' + MODEL); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });

  const modelSha = sha256(MODEL);
  const head = gitHead();
  console.log(`[probe-browser] repo=${REPO}\n[probe-browser] HEAD=${head} profile=${PROFILE} runs=${RUNS} viewport=${VIEWPORT.width}x${VIEWPORT.height}@${DSF}x`);
  check('模型副本 SHA-256 == 基线', modelSha === MODEL_SHA_BASELINE, modelSha);

  const { server, port } = await serve(REPO);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DSF });
  const page = await context.newPage();
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

  const runs = [];
  try {
    for (let run = 1; run <= RUNS; run++) {
      consoleLines.length = 0;
      const pageUrl = `http://127.0.0.1:${port}/proto/webgl2_probe/browser/index.html?profile=${PROFILE}&a2=${A2MODE}&commit=${head}&sha=${modelSha}`;
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__probeDone === true, null, { timeout: 20 * 60 * 1000 });
      const info = await page.evaluate(() => ({
        result: window.__probeResult, error: window.__probeError,
        elapsedMs: window.__probeElapsedMs,
        vfs: Array.from((window.__probeVfs && window.__probeVfs.files) ? window.__probeVfs.files.entries() : []),
      }));
      const consoleResultLine = consoleLines.find((l) => l.includes('__WEBGL2_PROBE_RESULT__='));
      const parsedFromConsole = consoleResultLine ? JSON.parse(consoleResultLine.slice(consoleResultLine.indexOf('__WEBGL2_PROBE_RESULT__=') + '__WEBGL2_PROBE_RESULT__='.length)) : null;

      console.log(`\n=== 冷启动 run ${run}/${RUNS} ===`);
      if (info.error) { check(`run${run} 无致命错误`, false, info.error); }
      else check(`run${run} 无致命错误`, true, `${(info.elapsedMs / 1000).toFixed(1)}s`);

      const r = info.result;
      if (!r) { check(`run${run} 产出结果 JSON`, false, info.error || 'null'); runs.push(null); continue; }

      fs.writeFileSync(path.join(OUT, `probe-result-run${run}.json`), JSON.stringify(r, null, 1));
      if (parsedFromConsole) fs.writeFileSync(path.join(OUT, `console-result-run${run}.json`), JSON.stringify(parsedFromConsole, null, 1));
      if (SHOTS === 'all' || run === RUNS) await page.screenshot({ path: path.join(OUT, `browser-run${run}.png`) });

      const a1 = r.a1 || {};
      const a1Assertions = a1.assertions || [];
      check(`run${run} console 单行 __WEBGL2_PROBE_RESULT__ 可解析`, !!parsedFromConsole && parsedFromConsole.schemaVersion === r.schemaVersion,
        parsedFromConsole ? 'schemaVersion=' + parsedFromConsole.schemaVersion : '缺失');
      check(`run${run} A1-01..05 全过`, a1Assertions.length >= 5 && a1Assertions.every((x) => x.pass === true),
        a1Assertions.map((x) => x.id + ':' + (x.pass ? 'OK' : 'NG')).join(' '));
      check(`run${run} 模型账 48419/41 对上`, a1.modelAccountOk === true,
        a1.modelAccount ? `tri=${a1.modelAccount.triangleCount} joints=${a1.modelAccount.jointCount} verts=${a1.modelAccount.vertexCount} tex=${a1.modelAccount.textureCount}` : 'null');
      check(`run${run} 模型字节数 == 4,040,728`, r.env.modelByteLength === 4040728, String(r.env.modelByteLength));
      check(`run${run} 模型 SHA-256 实测 == 基线`, r.modelSha256 === MODEL_SHA_BASELINE, `${r.modelSha256} (${r.env.modelSha256Source})`);
      check(`run${run} A1-03 最小 shader 41 骨一次上传可读回`, a1.assertions.find((x) => x.id === 'A1-03') && a1.assertions.find((x) => x.id === 'A1-03').pass === true,
        JSON.stringify(a1.triangleReadback));
      check(`run${run} A1-04 蒙皮在动（连续两帧摘要不同）`, !!(a1.modelReadback && a1.modelReadback.framesDiffer),
        a1.modelReadback ? `px=${a1.modelReadback.nonTransparentPixels} bbox=${a1.modelReadback.bboxW}x${a1.modelReadback.bboxH} A=${a1.modelReadback.digestFrameA} B=${a1.modelReadback.digestFrameB}` : 'null');
      check(`run${run} 41 骨整块 palette 上传自证（getUniform 回读）`, !!(a1.boneUploadCheck && a1.boneUploadCheck.ok),
        JSON.stringify(a1.boneUploadCheck && a1.boneUploadCheck.samples));
      check(`run${run} A1-05 合成走程序化 readback（非 visualProof 假写）`, a1.compositeProof === 'readback', 'proof=' + a1.compositeProof);
      check(`run${run} 冷启动计数 runIndex=${run}`, a1.coldRunIndex === run, `green=${a1.coldRunsGreen}/${a1.coldRunsTotal}`);
      check(`run${run} 无 GL error / 无 context lost`, (a1.errors || []).filter((e) => /GL error|context lost/i.test(e)).length === 0,
        `errors=${(a1.errors || []).length}`);

      // 截图入库范围：last（默认）= 只存最后一次冷启动的（控体积；三次冷启动的 A1 截图除 runIndex/nonce 外同内容）
      const keepShot = SHOTS === 'all' ? null : (n) => run === RUNS && n.indexOf('_run' + run + '.png') >= 0;
      const shots = dumpScreenshots(new Map(info.vfs), `run${run}`, keepShot);
      const wantShots = (run === RUNS && (r.a2 || []).length) ? 3 + 4 : 3;   // A1 三张 + 每档一张
      const recordedShots = (r.env.screenshots || []).length;
      check(`run${run} 截图按方案 §8 命名产出`, recordedShots >= wantShots, `probe 记录 ${recordedShots} 张（期望 ≥${wantShots}）`);
      if (SHOTS === 'all' || run === RUNS) {
        check(`run${run} 截图落库`, shots.length >= wantShots, `${shots.length} 张（期望 ≥${wantShots}）`);
      }

      // A2
      const a2 = r.a2 || [];
      if (run < RUNS) {
        check(`run${run} 未满足 Device-PASS 时不跑 A2（方案 §5 触发口径）`, a2.length === 0 && !!r.env.a2Skipped,
          r.env.a2Trigger + ' / ' + r.env.a2Skipped);
      } else {
        check(`run${run} 第 3 次冷启动后自动跑 A2（trigger=${r.env.a2Trigger}）`,
          A2MODE === 'run' ? r.env.a2Trigger === 'forced' : r.env.a2Trigger === 'spec-device-pass',
          `a2 档数=${a2.length} trigger=${r.env.a2Trigger}`);
        const want = [1, 5, 10, 20];
        check(`run${run} A2 四档齐全 1/5/10/20`, want.every((u) => a2.some((x) => x.unitCount === u)), a2.map((x) => x.unitCount).join(','));
        for (const rec of a2) {
          check(`run${run} A2 ${rec.unitCount}u：每帧 draw/palette 次数 == 单位数`, rec.drawCallsPerFrame === rec.unitCount && rec.skinPalettesPerFrame === rec.unitCount,
            `draw=${rec.drawCallsPerFrame} palette=${rec.skinPalettesPerFrame}`);
          check(`run${run} A2 ${rec.unitCount}u：采样量达标（≥${rec.specProfile ? 1800 : 300} 帧且达秒数）`,
            rec.sampleCount >= (rec.specProfile ? 1800 : 300) && !rec.truncated, `samples=${rec.sampleCount} dur=${rec.durationSec}s truncated=${rec.truncated}`);
          check(`run${run} A2 ${rec.unitCount}u：角色全部在屏且不重叠`, rec.allUnitsOnScreen === true,
            `解析=${JSON.stringify(rec.visibility)} 像素=${JSON.stringify(rec.pixelCoverage && { per: rec.pixelCoverage.unitsVisibleByPixels, fill: rec.pixelCoverage.fillRatio })}`);
          check(`run${run} A2 ${rec.unitCount}u：像素覆盖率合理（非"丝带式"塌缩）`,
            !!(rec.pixelCoverage && (rec.pixelCoverage.unsupported === true
              || (rec.pixelCoverage.fillRatio >= 0.2 && rec.pixelCoverage.unitsVisibleByPixels === rec.unitCount))),
            rec.pixelCoverage ? `fillRatio=${rec.pixelCoverage.fillRatio} 覆盖像素=${rec.pixelCoverage.coveredPixels} unsupported=${!!rec.pixelCoverage.unsupported}` : 'null');
          check(`run${run} A2 ${rec.unitCount}u：gpuMs 口径诚实（null 或真查询值）`, rec.gpuMs === null || typeof rec.gpuMs === 'number',
            `gpuMs=${rec.gpuMs} source=${rec.gpuMsSource}`);
        }
        check(`run${run} A2 四档出数（fps/P95/P99）`, a2.every((x) => typeof x.fpsMedian === 'number' && typeof x.frameMsP95 === 'number' && typeof x.frameMsP99 === 'number'),
          a2.map((x) => `${x.unitCount}u:${x.fpsMedian}fps/${x.frameMsP95}ms`).join(' '));
        check(`run${run} verdict 三档字段齐`, r.verdict && r.verdict.device && r.verdict.architecture && r.verdict.capacity20, JSON.stringify(r.verdict));
      }
      console.log(`  A2 汇总：` + (a2.length ? a2.map((x) => `${x.unitCount}u fps${x.fpsMedian}/p95 ${x.frameMsP95}/p99 ${x.frameMsP99}/js ${x.jsAnimMs}/gl ${x.glSubmitMs}/2d ${x.compositeCpuMs}`).join('\n            ') : '(本档未采样)'));
      runs.push(r);

      // ── 结果回收四路兜底（复制/分享/查看/重跑）—— 只在最后一次冷启动（结果含 A2 四档）上核 ──
      if (run === RUNS) {
        const btnList = await page.evaluate(() => (window.__probe.hud.buttons || []).map((b) => ({ id: b.id, label: b.label })));
        check(`run${run} 结果回收按钮齐（复制/分享/查看/重跑/切正控）`,
          ['copy', 'share', 'view', 'rerun', 'mode'].every((id) => btnList.some((b) => b.id === id)),
          JSON.stringify(btnList.map((b) => b.id + ':' + b.label)));

        // 把按钮中心（backbuffer 像素）换算成 CSS 坐标再点（canvas 铺满视口，dpr=2）
        const tapBtn = async (id) => {
          const pos = await page.evaluate((bid) => {
            const b = (window.__probe.hud.buttons || []).find((x) => x.id === bid);
            const cv = document.getElementById('probe-screen-canvas');
            const rect = cv.getBoundingClientRect();
            return b ? { x: rect.left + (b.x + b.w / 2) * rect.width / cv.width, y: rect.top + (b.y + b.h / 2) * rect.height / cv.height } : null;
          }, id);
          if (!pos) return false;
          await page.mouse.click(pos.x, pos.y);
          await page.waitForTimeout(160);
          return true;
        };
        const tapCanvasFrac = async (fx) => {
          const rect = await page.evaluate(() => document.getElementById('probe-screen-canvas').getBoundingClientRect());
          await page.mouse.click(rect.left + rect.width * fx, rect.top + rect.height * 0.5);
          await page.waitForTimeout(160);
        };

        // ── 触摸坐标空间回归门（真机按钮全灭的那类 bug）──────────────────────────────
        // 真机：wx 的 touch clientX/Y 是**逻辑像素**（366×800），按钮命中框按**背衬像素**记录
        // （1098×2400）⇒ 直接比永远不命中。这里用假 wx 环境把"逻辑坐标 → 平台换算 → 命中按钮"
        // 整条链钉住（按当帧实际尺寸换算，禁写死 dpr）。
        const tapGate = await page.evaluate(() => {
          const s = window.__probe;
          const b = (s.hud.buttons || []).find((x) => x.id === 'copy');
          if (!b) return { err: 'no-button' };
          const ratio = 3;                                  // 模拟 dpr=3 的真机
          const win = { w: Math.round(s.W / ratio), h: Math.round(s.H / ratio) };
          const canvas = document.createElement('canvas');
          canvas.width = s.W; canvas.height = s.H;           // 背衬像素（与按钮同空间）
          const savedWx = window.wx;
          let touchCb = null;
          window.wx = {
            env: { USER_DATA_PATH: 'wxfile://test' },
            createCanvas: () => canvas,
            getSystemInfoSync: () => ({ brand: 'T', model: 'M', system: 'A', platform: 'android', pixelRatio: ratio, windowWidth: win.w, windowHeight: win.h, screenWidth: win.w, screenHeight: win.h }),
            onTouchStart: (cb) => { touchCb = cb; },
            getFileSystemManager: () => ({ readFile() {}, readFileSync() { return ''; }, writeFileSync() {}, getFileInfo() {} }),
            setStorageSync() {}, getStorageSync() { return ''; }, setClipboardData() {}, loadSubpackage() {},
          };
          let out = null, err = null;
          try {
            const P = window.PWProbe.platformWx.createWxPlatform();
            P.createCanvas();                            // 真机启动时先拿屏幕画布（换算要用它的实际尺寸）
            P.onTouchStart((x, y) => { out = [x, y]; });
            // 用户真机上点到的是**逻辑坐标**（按钮中心的背衬坐标 / 3）
            const logical = { x: (b.x + b.w / 2) / ratio, y: (b.y + b.h / 2) / ratio };
            touchCb({ touches: [{ clientX: logical.x, clientY: logical.y }] });
            const hit = !!out && out[0] >= b.x && out[0] <= b.x + b.w && out[1] >= b.y && out[1] <= b.y + b.h;
            var result = { logical: logical, mapped: out, rect: { x: b.x, y: b.y, w: b.w, h: b.h }, win: win, hit: hit, diag: P.touchDiag };
          } catch (e) { err = e.message; }
          window.wx = savedWx;
          return result || { err: err };
        });
        check(`run${run} 逻辑像素触摸 → 平台换算 → 命中按钮（真机 366×800 / 背衬 1098×2400 场景）`,
          tapGate.hit === true,
          JSON.stringify({ err: tapGate.err || null, logical: tapGate.logical, mapped: tapGate.mapped, rect: tapGate.rect, scale: tapGate.diag && tapGate.diag.scale }));
        // 比例必须是"背衬 ÷ 逻辑"现算出来的（允许逻辑尺寸取整带来的 <1% 误差），而不是写死 dpr
        check(`run${run} 触摸换算比例按当帧实际尺寸现算（≈3，非写死）`,
          !!(tapGate.diag && tapGate.diag.scale && tapGate.diag.canvasSpace && tapGate.diag.windowSpace
            && Math.abs(tapGate.diag.scale[0] - tapGate.diag.canvasSpace[0] / tapGate.diag.windowSpace[0]) < 1e-9
            && Math.abs(tapGate.diag.scale[1] - tapGate.diag.canvasSpace[1] / tapGate.diag.windowSpace[1]) < 1e-9
            && Math.abs(tapGate.diag.scale[0] - 3) < 0.05 && Math.abs(tapGate.diag.scale[1] - 3) < 0.05),
          JSON.stringify(tapGate.diag && { scale: tapGate.diag.scale, canvasSpace: tapGate.diag.canvasSpace, windowSpace: tapGate.diag.windowSpace }));

        // 自动复制（A2 跑完后触发一次）：回归门 —— 必须发生在 finalize 之后（result 已装配），
        // 且不得再打出"无结果可复制/等 A1 跑完"这种误导文案（HONOR 真机实测踩过）。
        const autoInfo = await page.evaluate(() => ({
          auto: window.__probe.autoCopy || null,
          expected: JSON.stringify(window.__probe.result).length,
          toast: (window.__probe.toast && window.__probe.toast.text) || null,
          phase: window.__probe.phase,
        }));
        const autoLine = consoleLines.map((l) => l.slice(l.indexOf('__PROBE_CLIPBOARD__='))).find((l) => l.indexOf('__PROBE_CLIPBOARD__=') >= 0 && l.indexOf('"auto":true') >= 0);
        check(`run${run} 自动复制发生在 finalize 之后（字符数=已装配结果长度，非"无结果"）`,
          !!autoInfo.auto && autoInfo.auto.chars === autoInfo.expected && autoInfo.expected > 1000,
          JSON.stringify({ chars: autoInfo.auto && autoInfo.auto.chars, expected: autoInfo.expected, phase: autoInfo.phase, ok: autoInfo.auto && autoInfo.auto.ok }));
        check(`run${run} 自动复制不再打误导文案（无"等 A1 跑完/还没产出"）`,
          !(autoInfo.toast && /等 A1 跑完|还没产出/.test(autoInfo.toast)), String(autoInfo.toast));
        check(`run${run} 自动复制留 console 单行（auto:true，含成败与原因）`,
          !!autoLine, autoLine || '(缺)');

        consoleLines.length = 0;
        await tapBtn('copy');
        // 复制在宿主里可能"永不 settle" ⇒ 平台侧 2s 超时兜底；这里等 toast 出现再断言
        await page.waitForFunction(() => window.__probe.toast && /^复制：/.test(window.__probe.toast.text), null, { timeout: 8000 }).catch(() => {});
        const clipLine = consoleLines.map((l) => l.slice(l.indexOf('__PROBE_CLIPBOARD__='))).find((l) => l.startsWith('__PROBE_CLIPBOARD__='));
        const clip = clipLine ? JSON.parse(clipLine.slice('__PROBE_CLIPBOARD__='.length)) : null;
        const toastCopy = await page.evaluate(() => (window.__probe.toast && window.__probe.toast.text) || null);
        check(`run${run} 复制结果：成功/失败都留痕（console 单行 + 屏上文案）`,
          !!clip && typeof clip.ok === 'boolean' && clip.chars > 0 && /^复制：/.test(String(toastCopy)),
          `console=${clipLine} toast=${toastCopy}`);
        check(`run${run} 复制失败时带原因（不吃掉错误）`,
          !!clip && (clip.ok === true || !!clip.errMsg), clip && clip.errMsg);

        consoleLines.length = 0;
        await tapBtn('share');
        const shareLine = consoleLines.map((l) => l.slice(l.indexOf('__PROBE_SHARE__='))).find((l) => l.startsWith('__PROBE_SHARE__='));
        const share = shareLine ? JSON.parse(shareLine.slice('__PROBE_SHARE__='.length)) : null;
        check(`run${run} 分享结果文件：fail 分支屏上可见且带原因（浏览器如实报不支持）`,
          !!share && share.ok === false && !!share.errMsg && !!share.fileName,
          shareLine);

        await tapBtn('view');
        const vs = await page.evaluate(() => {
          const v = window.__probe.viewer;
          return v ? { pages: v.pages.length, page: v.page, first: v.pages[0] } : null;
        });
        const nonce = r.a1 && r.a1.nonce;
        check(`run${run} 查看结果：第 1 页是人读摘要（含 nonce/verdict），后续页为 JSON 分片`,
          !!vs && vs.pages >= 2 && vs.first.indexOf('结果摘要') >= 0 && vs.first.indexOf(nonce) >= 0
            && vs.first.indexOf('capacity20') >= 0 && vs.first.indexOf('device ') >= 0,
          vs ? `pages=${vs.pages} head=${vs.first.slice(0, 120)}` : 'null');
        await page.screenshot({ path: path.join(OUT, 'browser-viewer-run3.png') });
        await tapCanvasFrac(0.85);
        const p2 = await page.evaluate(() => window.__probe.viewer && window.__probe.viewer.page);
        await tapCanvasFrac(0.15);
        const p1 = await page.evaluate(() => window.__probe.viewer && window.__probe.viewer.page);
        check(`run${run} 查看结果：点右半下一页 / 左半上一页`, p2 === 1 && p1 === 0, `next→${p2} prev→${p1}`);
        const back = await page.evaluate(() => {
          const cv = document.getElementById('probe-screen-canvas');
          const s = window.__probe, fs = Math.max(10, Math.round(s.W * 0.030)), pad = Math.round(s.W * 0.03);
          return { x: s.W - pad - Math.round(s.W * 0.3) / 2, y: s.H - Math.round(fs * 2.1) - fs * 0.6 + Math.round(fs * 2.1) / 2, rect: cv.getBoundingClientRect(), cw: cv.width, ch: cv.height };
        });
        await page.mouse.click(back.rect.left + back.x * back.rect.width / back.cw, back.rect.top + back.y * back.rect.height / back.ch);
        await page.waitForTimeout(200);
        const closed = await page.evaluate(() => window.__probe.viewer === null);
        check(`run${run} 查看结果：点「返回」退回正常渲染`, closed === true, String(closed));

        // 重跑压测：写 storage 并重启（重启会刷新页面，故核完立刻离开，不进新的一轮采样）
        await tapBtn('rerun');
        await page.waitForTimeout(600);
        const a2Store = await page.evaluate(() => {
          const hit = Object.keys(window.localStorage).filter((k) => k.indexOf('pw-probe-a2-mode') >= 0);
          return hit.map((k) => k + '=' + window.localStorage.getItem(k));
        });
        check(`run${run} 重跑压测：写入强制 a2=run 开关（重启后按 storage 生效）`,
          a2Store.some((s) => s.indexOf('run') >= 0), JSON.stringify(a2Store));
      }
    }

    // ── 附加：主画布 WebGL2 正控模式（方案 §4.3 的定位实验，独立于 A1/A2 判定） ──
    if (MAINCONTROL) {
      console.log('\n=== 主画布 WebGL2 正控模式 ===');
      consoleLines.length = 0;
      await page.goto(`http://127.0.0.1:${port}/proto/webgl2_probe/browser/index.html?mode=maincontrol&commit=${head}&sha=${modelSha}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__probeDone === true, null, { timeout: 5 * 60 * 1000 });
      const mc = await page.evaluate(() => ({
        result: window.__probeResult, error: window.__probeError,
        vfs: Array.from((window.__probeVfs && window.__probeVfs.files) ? window.__probeVfs.files.entries() : []),
      }));
      if (mc.result) {
        fs.writeFileSync(path.join(OUT, 'probe-result-maincontrol.json'), JSON.stringify(mc.result, null, 1));
        await page.screenshot({ path: path.join(OUT, 'browser-maincontrol.png') });
        dumpScreenshots(new Map(mc.vfs), 'maincontrol', null);
      }
      check('正控模式：主画布能取 webgl2 并画出可读回三角形（= PASS）',
        !!(mc.result && mc.result.a1 && mc.result.a1.mainCanvasWebgl2Control === 'PASS'),
        JSON.stringify(mc.result && mc.result.a1 && mc.result.a1.mainCanvasControlDetail));
      check('正控模式不出 A1/A2 判定（device=NOT_APPLICABLE）',
        !!(mc.result && mc.result.verdict.device === 'NOT_APPLICABLE' && (mc.result.a2 || []).length === 0),
        JSON.stringify(mc.result && mc.result.verdict));

      // ── 真机判定矩阵回归门 ──────────────────────────────────────────────
      // 为什么要有这段：真机"冷启动 2/3"时曾误判 DEVICE_FAIL（与同屏 A1 5/5 自相矛盾）——
      // 而浏览器套件跑不到真机分支。这里在页面里直接调 result.verdicts，把真机分支的四种
      // 关键状态钉成回归门，避免同类"未完成 vs 失败"混淆再复发。
      const dv = await page.evaluate(() => {
        const R = window.PWProbe.result;
        const dev = { brand: 'TestBrand', model: 'TestModel', system: 'Android 13', platform: 'android', SDKVersion: '3.16.2', pixelRatio: 3, renderer: 'WebKit WebGL' };
        const base = { assertions: [{ pass: true }], allAssertionsPass: true, sdkVersionApplicable: true, sdkVersionOk: true, offscreenFailed: false, webgl2Context: true };
        const f = (a1) => { const v = R.verdicts({ device: dev, a1: a1, a2: [], env: { browser: false } }).verdict; return v.device + '|' + v.architecture; };
        return {
          cold13: f(Object.assign({}, base, { devicePassCandidate: false, coldRunsTotal: 1, coldRunsRequired: 3 })),
          cold23: f(Object.assign({}, base, { devicePassCandidate: false, coldRunsTotal: 2, coldRunsRequired: 3 })),
          cold33: f(Object.assign({}, base, { devicePassCandidate: true, coldRunsTotal: 3, coldRunsRequired: 3 })),
          realFail: f(Object.assign({}, base, { assertions: [{ pass: false }], allAssertionsPass: false, offscreenFailed: true, mainCanvasWebgl2Control: 'PASS' })),
          // 语义版本判定：2.9.1 < 2.24.0（字符串字典序会错判成"更新"）
          sdkLow: (function () {
            const v = R.verdicts({ device: Object.assign({}, dev, { SDKVersion: '2.9.1' }), a1: Object.assign({}, base, { sdkVersionOk: false }), a2: [], env: { browser: false } }).verdict;
            return v.device;
          })(),
        };
      });
      check('真机冷启动 1/3（A1 全过）→ 未完成，不是 FAIL', dv.cold13 === 'DEVICE_A1_PASS_COLD_INCOMPLETE|PENDING', dv.cold13);
      check('真机冷启动 2/3（A1 全过）→ 未完成，不是 FAIL', dv.cold23 === 'DEVICE_A1_PASS_COLD_INCOMPLETE|PENDING', dv.cold23);
      check('真机冷启动 3/3 全绿 → DEVICE_PASS / PARTIAL_PASS', dv.cold33 === 'DEVICE_PASS|PARTIAL_PASS', dv.cold33);
      check('真机 A1 真失败仍判红（DEVICE_FAIL / ARCHITECTURE_FAIL）', dv.realFail === 'DEVICE_FAIL|ARCHITECTURE_FAIL', dv.realFail);
      check('SDK 2.9.1 < 2.24.0 → UNSUPPORTED（语义版本，非字典序）', dv.sdkLow === 'UNSUPPORTED', dv.sdkLow);
      check('浏览器冷启动未满 → BROWSER_SHIM_A1_PASS_COLD_INCOMPLETE（路径行为未变）',
        !!(runs[0] && runs[0].verdict.device === 'BROWSER_SHIM_A1_PASS_COLD_INCOMPLETE'),
        runs[0] && runs[0].verdict.device);
    }

    // ── 补丁四回归门：模拟安卓 magicbrush「getUniform not support」+ 宿主不返回 MAX_VERTEX_UNIFORM_VECTORS ──
    // 真机实测：该引擎 getUniform 抛错，若不自证降级会**中断整个 A1**（Leo console 里没有任何结果行可回收）。
    // 这里把这两个宿主差异钉成回归门：回读自证降级、像素硬判据不受影响、判定不得误报 FAIL。
    console.log('\n=== 补丁四回归：模拟 getUniform 不支持 + MAX_VERTEX_UNIFORM_VECTORS 缺失 ===');
    await context.addInitScript(() => {
      const proto = WebGL2RenderingContext.prototype;
      const origGetParameter = proto.getParameter;
      proto.getUniform = function () { throw new Error('getUniform not support'); };
      proto.getParameter = function (pname) {
        if (pname === WebGL2RenderingContext.prototype.MAX_VERTEX_UNIFORM_VECTORS) return null;
        return origGetParameter.call(this, pname);
      };
    });
    consoleLines.length = 0;
    await page.goto(`http://127.0.0.1:${port}/proto/webgl2_probe/browser/index.html?a2=skip&commit=${head}&sha=${modelSha}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__probeDone === true, null, { timeout: 5 * 60 * 1000 });
    const deg = await page.evaluate(() => ({ error: window.__probeError, r: window.__probeResult }));
    fs.writeFileSync(path.join(OUT, 'probe-result-degraded.json'), JSON.stringify(deg.r || { error: deg.error }, null, 1));
    await page.screenshot({ path: path.join(OUT, 'browser-degraded.png') });
    check('降级模拟：run 不中断、仍产出结果 JSON（真机"无结果行"缺陷已修）',
      !deg.error && !!deg.r, deg.error || (deg.r ? 'ok' : 'null'));
    check('降级模拟：boneUploadCheck 标 unsupported 且不计入 errors',
      !!(deg.r && deg.r.a1.boneUploadCheck && deg.r.a1.boneUploadCheck.unsupported === true
        && (deg.r.a1.errors || []).filter((e) => /palette 上传自证/.test(e)).length === 0),
      JSON.stringify(deg.r && deg.r.a1.boneUploadCheck && { ok: deg.r.a1.boneUploadCheck.ok, unsupported: deg.r.a1.boneUploadCheck.unsupported, err: deg.r.a1.boneUploadCheck.error }));
    check('降级模拟：像素硬判据不受影响（A1-01..05 全过）',
      !!(deg.r && deg.r.a1.assertions.length >= 5 && deg.r.a1.assertions.every((x) => x.pass === true)),
      deg.r ? deg.r.a1.assertions.map((x) => x.id + ':' + (x.pass ? 'OK' : 'NG')).join(' ') : 'null');
    check('降级模拟：MAX_VERTEX_UNIFORM_VECTORS 取不到时记 unknown、不判死',
      !!(deg.r && deg.r.a1.assertions.find((x) => x.id === 'A1-02' && x.detail && String(x.detail.capabilityCheck).indexOf('unknown') >= 0)),
      JSON.stringify(deg.r && deg.r.a1.assertions.find((x) => x.id === 'A1-02')));
    check('降级模拟：判定不误报 FAIL（冷启动未满 → 未完成态）',
      !!(deg.r && deg.r.verdict.device === 'BROWSER_SHIM_A1_PASS_COLD_INCOMPLETE'),
      deg.r && deg.r.verdict.device);
    check('降级模拟：带原因的 console 单行仍在（可远程诊断）',
      consoleLines.some((l) => l.indexOf('__WEBGL2_PROBE_RESULT__=') >= 0),
      `console 行数=${consoleLines.length}`);
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }

  // 汇总
  const last = runs[runs.length - 1];
  const summary = {
    at: new Date().toISOString(), repo: REPO, head, profile: PROFILE, runs: runs.length,
    viewport: VIEWPORT, deviceScaleFactor: DSF, shotsPolicy: SHOTS,
    checks: results,
    verdicts: runs.map((r, i) => ({ run: i + 1, verdict: r && r.verdict, a1: r && r.a1 && { coldRunIndex: r.a1.coldRunIndex, allAssertionsPass: r.a1.allAssertionsPass, compositeProof: r.a1.compositeProof }, a2: r && r.a2 && r.a2.length })),
    renderer: last && last.device ? { renderer: last.device.renderer, unmaskedRenderer: last.device.unmaskedRenderer, vendor: last.device.vendor, maxVertexUniformVectors: last.a1.maxVertexUniformVectors } : null,
    a2: last ? last.a2 : [],
  };
  fs.writeFileSync(path.join(OUT, 'probe-browser-summary.json'), JSON.stringify(summary, null, 1));

  const failed = results.filter((x) => !x.ok);
  console.log(`\n[probe-browser] ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) {
    console.log('[probe-browser] FAIL 明细：');
    failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? ' · ' + f.detail : '')));
  }
  console.log('[probe-browser] 产物目录：' + path.relative(REPO, OUT));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('[probe-browser] 异常：', e); process.exit(2); });
