// T31-FE-C · proto/character3d_runtime_demo/tests/runtime-demo-browser.mjs
// 浏览器 sim 自动化：零依赖静态服务器 + 仓库既有 playwright-core + 系统 Chrome，跑**同一份 bundle.js**
// （= 生产 2.5D 运行时 + 本目录宿主），回收结果 JSON / console 单行 / 截图 / tap 诊断，落 evidence/。
//
// ★ 边界：sim 结果**不是**微信/安卓能力证据（方案 §9.3）。它只证明「同一份 bundle 的代码路径通」，
//   结论一律 SIM_ 前缀 + deviceEvidence=false。真机门由 Leo 扫码在手机上跑。
//
// 用法：node proto/character3d_runtime_demo/tests/runtime-demo-browser.mjs
//        [--runs=2] [--aa=fxaa|native|auto] [--profile=sim|spec] [--vw=390] [--vh=844] [--dsf=2]
//        [--shots=last|all|full]  截图入库范围：last=只存最后一次（默认，缩到 50% JPEG 控体积）；
//                                 all=每次都存（同样压缩）；full=原尺寸 PNG
// 退出码：全绿 0；任一断言 FAIL 1；环境异常 2。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const here = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.resolve(here, '..');
const REPO = path.resolve(here, '../../..');
const OUT = path.join(DEMO, 'evidence');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const arg = (n, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith('--' + n + '='));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const RUNS = +arg('runs', '2');
const AA = arg('aa', 'fxaa');
const PROFILE = arg('profile', 'sim');
const VIEWPORT = { width: +arg('vw', '390'), height: +arg('vh', '844') };
const DSF = +arg('dsf', '2');
const SHOTS = arg('shots', 'last');
/** `--norestore=1`：复刻微信模拟器「restoreContext 被平台拒绝」的场景（压真重建路径）。
 *  产物文件名加 `norestore` 前缀，与常规 sim 结果并存不覆盖。 */
const NO_RESTORE = arg('norestore', '0') === '1';
/** `--rewritejson=1`：复刻真机 P0-4（微信包管线改写包内 `.json`）—— 验证 **`.bin` 载荷不被改写**、
 *  字节身份严格通过（R2 由"结构放行"改为"字节保真"）。shim 的改写钩子只匹配 `.json`，故 `.bin` 应零改写。 */
const REWRITE_JSON = arg('rewritejson', '0') === '1';
/** `--cdn=ok|bad|nodomain`：CDN 模式三态（ok = 走静态服务器上的 CDN 镜像；bad = 404；nodomain = 合法域名未配）。 */
const CDN = arg('cdn', '');
const TAG = CDN ? 'sim-cdn-' + CDN : REWRITE_JSON ? 'sim-rewritejson' : NO_RESTORE ? 'sim-norestore' : 'sim';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8',
};

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(root, url);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function gitHead() {
  try {
    return require('node:child_process').execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim();
  } catch { return 'unknown'; }
}

/** 一轮页面加载 = 一次「启动」。★ 用**同一个 browser context**（localStorage 跨启动保留，
 *  与真机「杀微信重开」等价：storage 与 USER_DATA_PATH 都在，内存里的东西不在）。
 *  返回 {result, consoleLines, screenshots, clipboardLen, shares, fileCount} */
async function runOnce(context, baseUrl, runIndex, commit, preseed) {
  const page = await context.newPage();
  // 复刻真机持久盘：把上一轮的缓存文件注入本次启动（浏览器内存 FS 不跨页面存活）
  if (preseed && Object.keys(preseed).length > 0) {
    await page.addInitScript((data) => { window.__WX_SHIM_PRESEED_FILES = data; }, preseed);
  }
  const consoleLines = [];
  page.on('console', (msg) => consoleLines.push(msg.text()));
  page.on('pageerror', (e) => consoleLines.push('PAGEERROR ' + e.message));

  const url = `${baseUrl}/proto/character3d_runtime_demo/browser/index.html?aa=${AA}&profile=${PROFILE}&perf=1&commit=${commit}` +
    (NO_RESTORE ? '&norestore=1' : '') + (REWRITE_JSON ? '&rewritejson=1' : '') +
    (CDN === 'ok' ? '&cdn=' + encodeURIComponent(baseUrl + '/proto/battle_demo/cdn') : '') +
    (CDN === 'bad' ? '&cdn=' + encodeURIComponent(baseUrl + '/proto/battle_demo/nonexistent') : '') +
    (CDN === 'nodomain' ? '&cdn=' + encodeURIComponent(baseUrl + '/proto/battle_demo/cdn') + '&downloadfail=nodomain' : '');
  await page.goto(url, { waitUntil: 'load' });

  // 宿主跑完全流程：结果句柄被赋非空值
  await page.waitForFunction(() => {
    const d = window.__CHAR3D_DEMO;
    return !!(d && d.result && d.result.verdict);
  }, null, { timeout: 240000 });

  // 收尾：点「查看结果」→ 翻页 → 复制 → 分享（结果回收四通道的 sim 验证）
  const box = VIEWPORT;
  const rr = await page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const bh = Math.max(64, Math.round(vh * 0.075));
    const y = vh - bh / 2;
    // 底部按钮顺序 = HUD_BUTTON_IDS：copy / share / view / perf / source / retry3d（共 6 个）
    const N = 6;
    const bx = (i) => (vw / N) * (i + 0.5);
    // 逻辑像素（shim 的 tap 与真机 wx.onTouchStart 同口径）
    return { view: [bx(2), y], copy: [bx(0), y], share: [bx(1), y], mid: [vw * 0.75, vh * 0.2] };
  });
  void box;
  await page.evaluate((p) => window.__WX_SHIM.tap(p[0], p[1]), rr.view);
  await page.waitForTimeout(200);
  await page.evaluate((p) => window.__WX_SHIM.tap(p[0], p[1]), rr.mid); // 右半 → 下一页
  await page.waitForTimeout(200);
  await page.evaluate((p) => window.__WX_SHIM.tap(p[0], p[1]), rr.view); // 退出分页
  await page.waitForTimeout(150);
  await page.evaluate((p) => window.__WX_SHIM.tap(p[0], p[1]), rr.copy);
  await page.waitForTimeout(400);
  await page.evaluate((p) => window.__WX_SHIM.tap(p[0], p[1]), rr.share);
  await page.waitForTimeout(400);

  const result = await page.evaluate(() => window.__CHAR3D_DEMO.result);
  const screenshots = await page.evaluate(() => window.__WX_SHIM.dumpScreenshots());
  const clipboardLen = await page.evaluate(() => window.__WX_SHIM.clipboardLength());
  const shares = await page.evaluate(() => window.__WX_SHIM.shares());
  const fileCount = await page.evaluate(() => window.__WX_SHIM.fileCount());
  const fileNames = await page.evaluate(() => window.__WX_SHIM.fileNames());
  const userFiles = await page.evaluate(() => window.__WX_SHIM.dumpUserFiles());
  const preseedCount = await page.evaluate(() => window.__WX_SHIM.preseedCount());
  const rewriteStats = await page.evaluate(() => window.__WX_SHIM.rewriteStats());
  // 页面级截图存 JPEG（控体积；取景证据用上面的逐项截图）
  await page.screenshot({ path: path.join(OUT, `${TAG}-page-run${runIndex}.jpg`), type: 'jpeg', quality: 72 });
  await page.close();
  return { result, consoleLines, screenshots, clipboardLen, shares, fileCount, fileNames, userFiles, preseedCount, rewriteStats };
}

/** 截图压缩：50% 尺寸 + JPEG（默认；`--shots=full` 保留原 PNG）。 */
async function compressShots(context, screenshots) {
  if (SHOTS === 'full') return screenshots;
  const page = await context.newPage();
  try {
    await page.goto('about:blank');
    const out = {};
    for (const [name, dataUrl] of Object.entries(screenshots)) {
      out[name] = await page.evaluate(async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = Math.max(1, img.width >> 1);
        c.height = Math.max(1, img.height >> 1);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.72);
      }, dataUrl);
    }
    return out;
  } finally {
    await page.close();
  }
}

// ===== 主流程 =====

fs.mkdirSync(OUT, { recursive: true });
const commit = gitHead();
const { server, port } = await serve(REPO);
const base = `http://127.0.0.1:${port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
} catch (e) {
  console.error('[sim] 无法启动 Chrome（' + CHROME + '）：' + e.message);
  server.close();
  process.exit(2);
}

const runs = [];
let context;
try {
  context = await browser.newContext({
    viewport: VIEWPORT, deviceScaleFactor: DSF, hasTouch: true, isMobile: false,
  });
  for (let i = 1; i <= RUNS; i++) {
    console.log(`\n===== sim 第 ${i}/${RUNS} 次启动（commit ${commit.slice(0, 8)} · aa=${AA} · profile=${PROFILE}）=====`);
    // rewritejson 场景：第 1 次启动后把缓存文件搬到第 2 次启动（复刻真机持久盘 ⇒ 验证热缓存推进）
    const carryOver = REWRITE_JSON && i > 1 ? runs[runs.length - 1].userFiles : null;
    const r = await runOnce(context, base, i, commit, carryOver);
    runs.push(r);

    // 结果 JSON 落库（含 console 单行原文）
    fs.writeFileSync(path.join(OUT, `${TAG}-result-run${i}.json`), JSON.stringify(r.result, null, 1));
    const consoleResult = r.consoleLines.find((l) => l.startsWith('__CHAR3D_RUNTIME_RESULT__='));
    fs.writeFileSync(path.join(OUT, `${TAG}-console-run${i}.json`), JSON.stringify({
      consoleLine: consoleResult ?? null,
      tapLines: r.consoleLines.filter((l) => l.startsWith('__CHAR3D_TAP__=')),
      clipboardLines: r.consoleLines.filter((l) => l.startsWith('__CHAR3D_CLIPBOARD__=')),
      shareLines: r.consoleLines.filter((l) => l.startsWith('__CHAR3D_SHARE__=')),
      pageErrors: r.consoleLines.filter((l) => l.startsWith('PAGEERROR')),
    }, null, 1));
    // 截图入库：last = 只存最后一次启动的（控体积）；full = 原尺寸 PNG；缺省缩到 50% + JPEG
    const keepShots = SHOTS === 'all' || i === RUNS;
    if (keepShots) {
      const dumps = await compressShots(context, r.screenshots);
      for (const [name, dataUrl] of Object.entries(dumps)) {
        const [meta, b64] = String(dataUrl).split(',');
        const ext = SHOTS === 'full' ? 'png' : 'jpg';
        const out = name.replace(/\.png$/, '.' + ext);
        fs.writeFileSync(path.join(OUT, `${TAG}-run${i}-${out}`), Buffer.from(b64, 'base64'));
        void meta;
      }
    }
    console.log(`  截图 ${Object.keys(r.screenshots).length} 张 · 剪贴板 ${r.clipboardLen} 字符 · 分享 ${r.shares.length} 次 · 虚拟文件 ${r.fileCount}`);
  }

  // ===== 断言（sim 口径：只证代码路径通）=====
  const last = runs[runs.length - 1].result;
  check('结果 schema 版本', last.schemaVersion === 't31-fe-c-1.0', last.schemaVersion);
  check('sim 标记（非真机证据）', last.env.sim === true && last.notes.some((n) => n.includes('不是') && n.includes('证据')));
  check('device 判定为 SIM_ 前缀', String(last.verdict.device).startsWith('SIM_'), last.verdict.device);
  if (!CDN) {
    check('资源链证据：本地分包模式 + 已执行/未执行分支都列了',
      last.resource.mode === 'local-subpackage' && last.resource.executedBranches.length >= 5 && last.resource.notExecutedBranches.length >= 2,
      `${last.resource.mode} · 已执行 ${last.resource.executedBranches.length} / 未执行 ${last.resource.notExecutedBranches.length}`);
  }
  if (CDN === 'ok') {
    const ds = last.resource.downloadStats;
    check('CDN：资源源切到 cdn（结果里 mode + downloadStats.sourceMode 都是 cdn）',
      last.resource.mode === 'cdn' && ds.sourceMode === 'cdn' && ds.baseUrlSource === 'storage',
      `mode=${last.resource.mode} base=${ds.baseUrl} from=${ds.baseUrlSource}`);
    check('CDN：走真实下载链（downloads=5 + 字节/耗时都记了）',
      ds.downloads === 5 && ds.cacheHits === 0 && ds.bytes === 5 * 0 + 4040728 + 726299 + 162924 + 490227 + 166799 && ds.ms >= 0,
      `downloads=${ds.downloads} bytes=${ds.bytes} ms=${ds.ms} attempts=${ds.downloadAttempts}`);
    check('CDN：下载后字节与清单**逐字节一致**（严格身份通过）',
      last.resource.assetIntegrity.length === 5 &&
        last.resource.assetIntegrity.every((r) => r.byteLengthMatches && r.sha256Matches && r.integrityMode === 'strict'),
      last.resource.assetIntegrity.map((r) => `${r.assetId}:${r.observedByteLength}`).join(' '));
    check('CDN：读来源轨迹显示 downloadFile 链路（非分包读包）',
      last.resource.assetIntegrity.every((r) => !r.readSource.includes('local-subpackage.readCodeFile')),
      last.resource.readSourceTrail.slice(0, 2).join(' | '));
    check('CDN：boot ok + 无失败', last.resource.loadStatus === 'ready' && ds.failures === 0);
  }
  if (CDN === 'bad' || CDN === 'nodomain') {
    const ds = last.resource.downloadStats;
    check('CDN 失败路径：资源门失败被如实记录（failures/attempts + 重试 2 次）',
      last.resource.loadStatus === 'failed' && ds.failures >= 1 && ds.downloadAttempts >= 3,
      `loadStatus=${last.resource.loadStatus} failures=${ds.failures} attempts=${ds.downloadAttempts}`);
    check('CDN 失败路径：失败原因进结果（可直接看出是哪一层错）',
      ds.failureReasons.length > 0 && ds.failureReasons.some((r) => /HTTP 404|domain list/.test(r)),
      ds.failureReasons.slice(0, 2).join(' | '));
    check('CDN 失败路径：域名白名单判定与事实一致（' + (CDN === 'nodomain' ? '应为 true' : '应为 false') + '）',
      ds.domainBlocked === (CDN === 'nodomain'),
      `domainBlocked=${ds.domainBlocked}`);
    check('CDN 失败路径：屏上单行 + 结论行可读（DEVICE_FAIL 而非静默）',
      String(last.verdict.device).endsWith('FAIL') && last.notes.length > 0,
      String(last.verdict.device));
  }

  if (!REWRITE_JSON && !CDN) {
    // 常规/真重建场景：末次启动即冷启动 ⇒ 冷链必然跑过；
    // 改写场景末次是**首个热启动**（downloads=0 才是期望），其冷链由「冷系列」断言覆盖。
    check('资源链证据：冷链（downloads>0）跑过', (last.resource.loaderStats.downloads ?? 0) > 0,
      JSON.stringify(last.resource.loaderStats));
  }
  if (CDN) {
    // CDN 场景单独断言（上面已覆盖）；不套用本地模式的冷/热链断言
  } else if (REWRITE_JSON) {
    // 冷系列（runIndex ≤ 3）每轮启动前按 assetId 清缓存 ⇒ 必须如实「冷」
    const coldRuns = runs.slice(0, Math.min(3, runs.length));
    check('P0-5：冷系列（前 3 次启动）cacheState 全 cold + downloads>0（清缓存是按设计的）',
      coldRuns.every((r) => r.result.runs[r.result.runs.length - 1].cacheState === 'cold' &&
        (r.result.resource.loaderStats.downloads ?? 0) > 0),
      coldRuns.map((r) => `#${r.result.runs[r.result.runs.length - 1].runIndex}:${r.result.runs[r.result.runs.length - 1].cacheState}/dl=${r.result.resource.loaderStats.downloads}`).join(' '));
  } else {
    check('资源链证据：热链（cacheHits>0 且 downloads=0）跑过', last.resource.hotChainObserved === true,
      JSON.stringify(last.resource.reloadStats));
  }
  if (REWRITE_JSON) {
    // R2 核心：`.bin` 载荷绕过包管线 ⇒ 字节与清单**逐字节一致** + 零改写
    const launch1 = runs[0].result;
    const rows = launch1.resource.assetIntegrity;
    const textRows = rows.filter((r) => r.mediaType === 'application/json');
    const glbRows = rows.filter((r) => r.mediaType === 'model/gltf-binary');
    check('R2：分包里已无 `.json` 载荷（全部 .bin 落地）',
      rows.every((r) => r.readSource.includes('.bin')),
      rows.map((r) => `${r.assetId}:${r.readSource.includes('.bin') ? '.bin' : '?'}`).join(' '));
    check('R2：shim 的"平台改写"钩子零命中（`.bin` 不被管线改写）',
      runs.every((r) => r.rewriteStats.length === 0),
      `rewriteStats=${JSON.stringify(runs.map((r) => r.rewriteStats.length))}`);
    check('R2：4 个文本资产字节与清单**逐字节一致**（byteLengthMatches + sha256Matches + observed 实测）',
      textRows.length === 4 && textRows.every((r) => r.byteLengthMatches && r.sha256Matches &&
        r.observedByteLength === r.expectedByteLength && r.observedSha256 === r.expectedSha256),
      textRows.map((r) => `${r.assetId}:${r.observedByteLength}/${r.observedSha256.slice(0, 8)}`).join(' '));
    check('R2：身份口径恒 strict（无结构性旁路）',
      rows.every((r) => r.integrityMode === 'strict' && r.mode === 'strict'),
      [...new Set(rows.map((r) => r.integrityMode))].join(','));
    check('R2：结构校验为**纯诊断**（structuralDiagnostic 有账、motionStatic=false）',
      textRows.every((r) => r.structuralDiagnostic !== null && r.structuralDiagnostic.motionStatic === false &&
        r.structuralDiagnostic.summary.includes('fps=')),
      textRows.map((r) => r.structuralDiagnostic?.summary.slice(0, 34)).join(' | '));
    check('R2：GLB 同样严格且字节相符',
      glbRows.length === 1 && glbRows[0].byteLengthMatches && glbRows[0].sha256Matches,
      glbRows.map((r) => `${r.assetId}:${r.observedByteLength}`).join(' '));
    check('R2：结果带构建标识 + 资产清单版本（版本映射）',
      !!launch1.env.build && !!launch1.env.build.commitSha && launch1.env.build.payloadSuffix === '.bin' &&
        String(launch1.env.assetManifestVersion).startsWith('manifest-'),
      `commit=${String(launch1.env.build?.commitSha).slice(0, 12)} manifest=${launch1.env.assetManifestVersion}`);
    check('R2：资源门放行后整轮继续（boot 阶段 ok，且非 DEVICE_FAIL）',
      runs.every((r) => r.result.phases.find((p) => p.name === 'boot')?.status === 'ok') &&
        !String(launch1.verdict.device).endsWith('FAIL'),
      runs.map((r) => `#${r.result.runs.length}:boot=${r.result.phases.find((p) => p.name === 'boot')?.status}`).join(' '));
    check('R2：诊断单行 __CHAR3D_INTEGRITY__ 已打出（含 structuralDiagnostic/readSource/head·tail hex）',
      runs.some((r) => r.consoleLines.some((l) => l.startsWith('__CHAR3D_INTEGRITY__=') && l.includes('structuralDiagnostic') && l.includes('headHex64'))));
    check('R2：首装观测未被重建/重试覆盖（assetIntegrity=首装行，重建行单独在 rebuildIntegrity）',
      rows.length === 5 && textRows.every((r) => r.source === 'download'),
      `assetIntegrity=${rows.length} rebuild=${String(launch1.resource.rebuildIntegrity?.length ?? null)}`);

    // ---- P0-5：热缓存必须能推进（索引以「盘上事实」为基准）----
    //     前 3 次是冷系列（每轮清缓存）；第 4 次进入热系列 ⇒ 必须热命中、且热缓存计数推进
    if (RUNS >= 4) {
      const launch2 = last.resource;
      const text2 = launch2.assetIntegrity.filter((r) => r.mediaType === 'application/json');
      check('P0-5/R2：第二次启动判为 cacheHit（4 个文本资产 source=cache-hit 且摘要为实测值）',
        text2.length === 4 && text2.every((r) => r.source === 'cache-hit' && !!r.observedSha256 &&
          r.observedSha256 === r.expectedSha256),
        text2.map((r) => `${r.assetId}:${r.source}/${String(r.observedSha256).slice(0, 8)}`).join(' '));
      check('P0-5：第二次启动 downloads 归零（热命中不再重读）',
        (launch2.loaderStats.downloads ?? -1) === 0 && (launch2.loaderStats.cacheHits ?? 0) >= 4,
        runs.map((r, idx) => `#${idx + 1}(dl=${r.result.resource.loaderStats.downloads},hits=${r.result.resource.loaderStats.cacheHits})`).join(' → '));
      check('P0-5/R2：命中口径为 strict 且字节与清单一致（observed == expected）',
        text2.every((r) => r.integrityMode === 'strict' && r.byteLengthMatches === true && r.sha256Matches === true),
        text2.map((r) => `${r.observedByteLength}==${r.expectedByteLength}`).join(' '));
      check('P0-5：热缓存计数能推进（运行历史出现 cacheState=hot）',
        last.runs.filter((r) => r.cacheState === 'hot').length >= 1,
        last.runs.map((r) => `#${r.runIndex}:${r.cacheState}`).join(' '));
      check('P0-5：GLB 仍走严格口径热命中（索引=清单值）',
        launch2.assetIntegrity.filter((r) => r.mediaType === 'model/gltf-binary')
          .every((r) => r.integrityMode === 'strict' && r.byteLengthMatches === true),
        launch2.assetIntegrity.filter((r) => r.mediaType === 'model/gltf-binary').map((r) => `${r.integrityMode}/${r.source}`).join(' '));
    }
  }

  // 资源门失败场景（cdn-bad / cdn-nodomain）没有可测量的运行时 ⇒ 这批断言只在 boot 成功时跑
  const measurementsAvailable = last.resource.loadStatus === 'ready';
  if (measurementsAvailable) {
  check('首启分段计时齐全（loader/解析/纹理解码/首传 GPU）',
    ['subpackageMs', 'loaderMs', 'glbParseMs', 'animParseMs', 'textureDecodeMs', 'firstGpuUploadMs']
      .every((k) => typeof last.resource.assetStages[k] === 'number'),
    JSON.stringify(last.resource.assetStages));

  check('六向 6 行且逐向 expected==activeClipKey',
    last.sixDir.length === 6 && last.sixDir.every((r) => r.ok),
    last.sixDir.map((r) => `${r.facing}:${r.activeClipKey}`).join(' '));
  check('全状态 7 行（idle/walk/basic/charge/strike/jump/dead）且逐态一致',
    last.states.length === 7 && last.states.every((r) => r.ok),
    last.states.map((r) => `${r.state}:${r.activeClipKey}`).join(' '));
  check('轻功三元 7 例：cmdIsJump 与 activeClipKey 全对（含 300ms 窗后 / 起落 hop=0 / 死亡释放）',
    last.jumpTrios.length === 7 && last.jumpTrios.every((t) => t.activeClipKey === expectedClipOfTrio(t.caseId)),
    last.jumpTrios.map((t) => `${t.caseId}:snap=${t.snapIsJump},cmd=${t.cmdIsJump},clip=${t.activeClipKey}`).join(' | '));
  check('三元文案含 snapIsJump/cmdIsJump/activeClipKey 三者且有口径声明',
    last.env.notes.some((n) => n.includes('snapIsJump') && n.includes('cmdIsJump') && n.includes('activeClipKey')));

  const c = last.context;
  check('上下文注入：真 WEBGL_lose_context 可用', c.extAvailable === true && c.injectionMode.startsWith('gl-ext'),
    `${c.injectionMode} · restoreVia=${c.restoreVia}`);
  check('上下文注入：lost 被观测 + 短暂 lost 期间 session 继续', c.lostObserved && c.sessionContinuedWhileLost);
  check('上下文注入：恢复成功 + 恢复首帧 dt=0（不补算停顿）', c.restoreOk && c.firstFrameDtSec === 0, `dt=${c.firstFrameDtSec}`);
  if (NO_RESTORE) {
    // P0-3 核心：平台拒绝扩展恢复时，**必须落真重建**，且不得因此判失败/丢测量结果
    check('上下文注入：快路径抛错被如实记录（复刻微信模拟器原文）',
      typeof c.fastPathError === 'string' && c.fastPathError.includes('restoration not allowed'), String(c.fastPathError));
    check('上下文注入：快路径不可用 ⇒ 走**真重建**（新建 canvas/context + 缓存重装配）',
      c.restoreVia === 'rebuild' && c.rebuildAttempted === true && c.rebuildOk === true,
      `restoreVia=${c.restoreVia} rebuildOk=${c.rebuildOk}`);
    check('上下文注入：真重建后恢复成功（不因平台拒绝扩展恢复而判失败）',
      c.restoreOk === true && !String(last.verdict.contextRestore).endsWith('FAIL'), last.verdict.contextRestore);
    check('结果如实标注「扩展恢复未执行」',
      last.resource.notExecutedBranches.some((b) => b.includes('restoreContext')), last.resource.notExecutedBranches.join(' | '));
  } else {
    check('上下文注入：sim 走 event 快路径（平台允许扩展恢复；真重建路径不得在 sim 触发回归）',
      c.restoreVia === 'event' && c.rebuildAttempted === false, `restoreVia=${c.restoreVia} rebuild=${c.rebuildAttempted}`);
  }
  check('上下文注入：暂停期间帧冻结 + 恢复 dt=0', c.pauseFrozenFrames === 0 && c.resumeDtSec === 0,
    `frozen=${c.pauseFrozenFrames} resumeDt=${c.resumeDtSec}`);
  check('上下文注入：单 RAF（峰值 ≤1）', c.pendingFramesMax <= 1, 'raf 峰值=' + c.pendingFramesMax);
  check('上下文注入：二次重建终失败 → 暂停对局 + 错误页 + 输入被忽略',
    c.secondRestoreAttempted && c.secondRestoreFailed && c.pausedOnFinalFailure && c.errorPageShown && c.inputIgnoredWhilePaused,
    `failed=${c.secondRestoreFailed} paused=${c.pausedOnFinalFailure} page=${c.errorPageShown} inputIgnored=${c.inputIgnoredWhilePaused}`);
  check('上下文注入：终失败暂停后 tick 冻结', c.framesWhilePaused === 0, 'frames=' + c.framesWhilePaused);
  check('上下文 verdict 非 FAIL', !String(last.verdict.contextRestore).endsWith('FAIL'), last.verdict.contextRestore);

  // P0-3：阶段重排（自测在最后）+ 中间快照（自测失败不丢测量结果）
  check('阶段顺序：context 恒在最后（测量项在前）',
    last.phases.map((p) => p.name).join(',') === 'boot,sixdir,states,jump-trio,perf,context',
    last.phases.map((p) => `${p.name}:${p.status}`).join(' '));
  check('测量项阶段全部 ok（六向/全状态/轻功三元/压测）',
    ['boot', 'sixdir', 'states', 'jump-trio', 'perf'].every((n) => last.phases.find((p) => p.name === n)?.status === 'ok'),
    last.phases.map((p) => `${p.name}:${p.status}`).join(' '));
  check('压测后先落 precontext 中间快照（自测失败也不丢测量结果）',
    runs.every((r) => r.fileNames.some((n) => n.includes('precontext'))),
    runs[runs.length - 1].fileNames.filter((n) => n.includes('char3d_')).join(' '));

  check('FXAA 分支是生产分支（有效 antialias=false）', last.rendererInfo.edgeMode === 'fxaa' && last.rendererInfo.effectiveAntialias === false,
    `edgeMode=${last.rendererInfo.edgeMode} aa=${last.rendererInfo.effectiveAntialias}`);
  check('20u 档：每帧 drawCall=20 / palette=20（计数器差分）',
    last.capacity.some((r) => r.unitCount === 20 && r.drawCallsPerFrame === 20 && r.skinPalettesPerFrame === 20),
    last.capacity.map((r) => `${r.unitCount}u:${r.drawCallsPerFrame}/${r.skinPalettesPerFrame}`).join(' '));
  const rec20 = last.capacity.filter((r) => r.unitCount === 20)[0];
  check('20u 档：屏上 20 个角色全部可见', !!rec20 && rec20.allUnitsOnScreen === true,
    rec20 ? rec20.visibilityNote : '无 20u 记录');
  check('20u 档：判定引擎跑过（NON_SPEC 已被标注，不得当容量结论）',
    last.verdict.capacity20Engine === 'CAPACITY_PASS' || last.verdict.capacity20Engine === 'A_COMPATIBLE_CAPACITY_FAIL',
    `${last.verdict.capacity20Engine} → capacity20=${last.verdict.capacity20}`);
  check('20u 档：记录 edgeMode/backbuffer/cacheHit', last.canvas.backbuffer !== null && last.rendererInfo.edgeMode === 'fxaa' && !!last.resource.loaderStats,
    `bb=${JSON.stringify(last.canvas.backbuffer)}`);

  }

  check('结果回收：console 单行可用', runs.every((r) => r.consoleLines.some((l) => l.startsWith('__CHAR3D_RUNTIME_RESULT__='))));
  check('结果回收：剪贴板成功（字符数 > 0）', runs[runs.length - 1].clipboardLen > 0, String(runs[runs.length - 1].clipboardLen));
  check('结果回收：分享被调起', runs[runs.length - 1].shares.length > 0);
  check('tap 诊断单行（含 mapped/hit/verdict）',
    runs.some((r) => r.consoleLines.some((l) => l.startsWith('__CHAR3D_TAP__=') && l.includes('"verdict"'))));
  check('无页面异常', runs.every((r) => !r.consoleLines.some((l) => l.startsWith('PAGEERROR'))));

  // 运行历史跨启动累积（冷系列判定）
  if (measurementsAvailable) {
    check('运行历史跨启动累积（第 N 次启动读到 ≥N 条记录）',
      runs[runs.length - 1].result.runs.length >= runs.length && runs[runs.length - 1].result.runs.length >= 1,
      `runs=${runs[runs.length - 1].result.runs.length} / 启动次数=${runs.length}`);
  } else {
    check('资源门失败场景：运行历史不推进是**预期**（失败启动不计入冷/热系列）',
      last.runs.length === 0, `runs=${last.runs.length}`);
  }

  fs.writeFileSync(path.join(OUT, `${TAG}-summary.json`), JSON.stringify({
    generatedAt: new Date().toISOString(),
    commitSha: commit,
    scenario: CDN
      ? 'cdn-' + CDN + '（CDN 模式：' + (CDN === 'ok' ? '静态服务器 CDN 镜像，走真实 downloadFile 链' : CDN === 'bad' ? '404 失败路径' : '合法域名未配置失败路径') + '）'
      : REWRITE_JSON
      ? 'rewritejson（复刻真机 P0-4：`.bin` 载荷未被包管线改写 ⇒ 严格字节身份通过）'
      : NO_RESTORE ? 'norestore（复刻微信模拟器：restoreContext 被拒 ⇒ 真重建路径）' : 'standard（事件快路径）',
    aa: AA, profile: PROFILE, viewport: VIEWPORT, deviceScaleFactor: DSF,
    deviceEvidence: false,
    note: 'sim（浏览器 + wx shim）只证明同一份 bundle 的代码路径通；真机能力证据必须来自 HONOR 扫码运行（方案 §9.3）',
    assertions: results,
    passCount: results.filter((r) => r.ok).length,
    total: results.length,
  }, null, 1));
} finally {
  if (context) await context.close().catch(() => undefined);
  if (browser) await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n===== sim 汇总：${results.length - failed.length}/${results.length} PASS =====`);
if (failed.length) {
  for (const f of failed) console.log('FAIL  ' + f.name + (f.detail ? ' · ' + f.detail : ''));
  process.exit(1);
}
process.exit(0);

function expectedClipOfTrio(caseId) {
  return {
    'jump-inside-300ms-window': 'jump',
    'jump-after-300ms-snapshot-window': 'jump',
    'walk-normal-no-jump': 'walk',
    'jump-endpoint-hop0': 'jump',
    'jump-landing-hop0': 'jump',
    'jump-released-after-duration': 'walk',
    'jump-died-releases': 'idle',
  }[caseId] ?? '?';
}
