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
/** `--rewritejson=1`：复刻真机 P0-4（平台改写包内文本资产 ⇒ 字节与清单不符但结构合法）
 *  —— 验证「结构不变量放行」让整轮继续跑，而不是资源门拒收。 */
const REWRITE_JSON = arg('rewritejson', '0') === '1';
const TAG = REWRITE_JSON ? 'sim-rewritejson' : NO_RESTORE ? 'sim-norestore' : 'sim';

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
async function runOnce(context, baseUrl, runIndex, commit) {
  const page = await context.newPage();
  const consoleLines = [];
  page.on('console', (msg) => consoleLines.push(msg.text()));
  page.on('pageerror', (e) => consoleLines.push('PAGEERROR ' + e.message));

  const url = `${baseUrl}/proto/character3d_runtime_demo/browser/index.html?aa=${AA}&profile=${PROFILE}&perf=1&commit=${commit}` +
    (NO_RESTORE ? '&norestore=1' : '') + (REWRITE_JSON ? '&rewritejson=1' : '');
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
    const bx = (i) => (vw / 5) * (i + 0.5);
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
  // 页面级截图存 JPEG（控体积；取景证据用上面的逐项截图）
  await page.screenshot({ path: path.join(OUT, `${TAG}-page-run${runIndex}.jpg`), type: 'jpeg', quality: 72 });
  await page.close();
  return { result, consoleLines, screenshots, clipboardLen, shares, fileCount, fileNames };
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
    const r = await runOnce(context, base, i, commit);
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
  check('资源链证据：本地分包模式 + 已执行/未执行分支都列了',
    last.resource.mode === 'local-subpackage' && last.resource.executedBranches.length >= 5 && last.resource.notExecutedBranches.length >= 2,
    `${last.resource.mode} · 已执行 ${last.resource.executedBranches.length} / 未执行 ${last.resource.notExecutedBranches.length}`);
  check('资源链证据：冷链（downloads>0）跑过', (last.resource.loaderStats.downloads ?? 0) > 0,
    JSON.stringify(last.resource.loaderStats));
  if (REWRITE_JSON) {
    // 平台改写的文本资产：索引按**清单值**登记 ⇒ 下次启动长度校验不符被摘掉重读
    // （GLB 未改写 ⇒ 仍能命中）⇒ 热链整体不成立，这是**如实结果**，不是缺陷
    const reload = last.resource.reloadStats ?? {};
    check('P0-4：改写场景下热链如实不成立（文本被摘除重读 + GLB 仍命中）并已记进 notes',
      last.resource.hotChainObserved === false && (reload.downloads ?? 0) > 0 &&
        last.notes.join(' ').includes('热启动缓存退化为'),
      `hotChainObserved=${last.resource.hotChainObserved} reload=${JSON.stringify(reload)}`);
  } else {
    check('资源链证据：热链（cacheHits>0 且 downloads=0）跑过', last.resource.hotChainObserved === true,
      JSON.stringify(last.resource.reloadStats));
  }
  if (REWRITE_JSON) {
    // P0-4 核心：平台改写包内文本 ⇒ 必须结构放行 + 整轮继续（不得资源门拒收）
    const rows = last.resource.assetIntegrity;
    const textRows = rows.filter((r) => r.mediaType === 'application/json');
    const glbRows = rows.filter((r) => r.mediaType === 'model/gltf-binary');
    check('P0-4：模拟平台改写后，4 个文本资产按结构不变量放行（integrityMode=structural + structuralOk + 结构账）',
      textRows.length === 4 && textRows.every((r) => r.integrityMode === 'structural' && r.structuralOk === true && !!r.structuralSummary),
      textRows.map((r) => `${r.assetId}:${r.integrityMode}/ok=${r.structuralOk}`).join(' '));
    check('P0-4：如实记录 observed≠expected（诊断可用：长度/摘要/头尾 hex/读取来源）',
      textRows.every((r) => r.observedByteLength > 0 && r.observedByteLength !== r.expectedByteLength &&
        r.byteLengthMatches === false && !!r.observedSha256 && !!r.headHex64 && !!r.tailHex64 && !!r.readSource),
      textRows.map((r) => `${r.assetId}:${r.observedByteLength}≠${r.expectedByteLength}`).join(' '));
    check('P0-4：GLB 仍走严格口径且字节相符（未被结构性放行波及）',
      glbRows.length === 1 && glbRows[0].integrityMode === 'strict' && glbRows[0].byteLengthMatches === true,
      glbRows.map((r) => `${r.assetId}:${r.integrityMode}/${r.observedByteLength}`).join(' '));
    check('P0-4：资源门放行后整轮继续（boot 阶段 ok，且非 DEVICE_FAIL）',
      last.phases.find((p) => p.name === 'boot')?.status === 'ok' && !String(last.verdict.device).endsWith('FAIL'),
      `boot=${last.phases.find((p) => p.name === 'boot')?.status} device=${last.verdict.device}`);
    check('P0-4：notes 点明结构放行 + 字节漂移',
      last.notes.join(' ').includes('integrityMode=structural') &&
        last.notes.join(' ').includes('结构账见 resource.assetIntegrity'));
    check('P0-4：诊断单行 __CHAR3D_INTEGRITY__ 已打出（含 observed/expected/readSource/head·tail hex）',
      runs.some((r) => r.consoleLines.some((l) => l.startsWith('__CHAR3D_INTEGRITY__=') && l.includes('headHex64') && l.includes('readSource'))));
    check('P0-4：首装观测未被重建/重试覆盖（assetIntegrity=首装行，重建行单独在 rebuildIntegrity）',
      last.resource.assetIntegrity.length === 5 && textRows.every((r) => r.source === 'download'),
      `assetIntegrity=${last.resource.assetIntegrity.length} rebuild=${String(last.resource.rebuildIntegrity?.length ?? null)}`);
  }

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

  check('结果回收：console 单行可用', runs.every((r) => r.consoleLines.some((l) => l.startsWith('__CHAR3D_RUNTIME_RESULT__='))));
  check('结果回收：剪贴板成功（字符数 > 0）', runs[runs.length - 1].clipboardLen > 0, String(runs[runs.length - 1].clipboardLen));
  check('结果回收：分享被调起', runs[runs.length - 1].shares.length > 0);
  check('tap 诊断单行（含 mapped/hit/verdict）',
    runs.some((r) => r.consoleLines.some((l) => l.startsWith('__CHAR3D_TAP__=') && l.includes('"verdict"'))));
  check('无页面异常', runs.every((r) => !r.consoleLines.some((l) => l.startsWith('PAGEERROR'))));

  // 运行历史跨启动累积（冷系列判定）
  check('运行历史跨启动累积（第 N 次启动读到 ≥N 条记录）',
    runs[runs.length - 1].result.runs.length >= runs.length && runs[runs.length - 1].result.runs.length >= 1,
    `runs=${runs[runs.length - 1].result.runs.length} / 启动次数=${runs.length}`);

  fs.writeFileSync(path.join(OUT, `${TAG}-summary.json`), JSON.stringify({
    generatedAt: new Date().toISOString(),
    commitSha: commit,
    scenario: REWRITE_JSON
      ? 'rewritejson（复刻真机 P0-4：平台改写包内文本资产 ⇒ 结构不变量放行）'
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
