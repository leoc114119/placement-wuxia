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
            !!(rec.pixelCoverage && rec.pixelCoverage.fillRatio >= 0.2 && rec.pixelCoverage.unitsVisibleByPixels === rec.unitCount),
            rec.pixelCoverage ? `fillRatio=${rec.pixelCoverage.fillRatio} 覆盖像素=${rec.pixelCoverage.coveredPixels}` : 'null');
          check(`run${run} A2 ${rec.unitCount}u：gpuMs 口径诚实（null 或真查询值）`, rec.gpuMs === null || typeof rec.gpuMs === 'number',
            `gpuMs=${rec.gpuMs} source=${rec.gpuMsSource}`);
        }
        check(`run${run} A2 四档出数（fps/P95/P99）`, a2.every((x) => typeof x.fpsMedian === 'number' && typeof x.frameMsP95 === 'number' && typeof x.frameMsP99 === 'number'),
          a2.map((x) => `${x.unitCount}u:${x.fpsMedian}fps/${x.frameMsP95}ms`).join(' '));
        check(`run${run} verdict 三档字段齐`, r.verdict && r.verdict.device && r.verdict.architecture && r.verdict.capacity20, JSON.stringify(r.verdict));
      }
      console.log(`  A2 汇总：` + (a2.length ? a2.map((x) => `${x.unitCount}u fps${x.fpsMedian}/p95 ${x.frameMsP95}/p99 ${x.frameMsP99}/js ${x.jsAnimMs}/gl ${x.glSubmitMs}/2d ${x.compositeCpuMs}`).join('\n            ') : '(本档未采样)'));
      runs.push(r);
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
    }
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
