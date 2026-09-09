// ═══ T28 · hero 武器层 runtime 预检（《主角武器层接线实施方案》§2.2 / 任务卡需求表 #2/#6）═══
// 用法：node tools/preflight_hero_weapon_layer.mjs（CI/预览启动前；失败非零退出，禁以空手降级判过）
// 口径（26 行逐行，双阶段：候选数据核验 + runtime 资源核验；候选数据内嵌于 manifest.runtime.json 行内）：
//   ① manifest.runtime.json 严格 14 字段模板 + weaponPath/weaponSha256；26 行 frameId/bodyFrame 无重复
//   ② 身体帧：存在且 SHA-256 == runtimeBodySha256；bodyCorrection=none 行 candidate/runtime SHA 相等
//  （修正行 frame04/06 及左镜像共 4 行 candidate≠runtime 为 Leo 选型既定事实，manifest 字段即记录）
//   ③ 剑层：存在、PNG IHDR 240×320 RGBA8、SHA == weaponSha256 == SHA256SUMS 行
//   ④ 遮罩：maskPolicy≠none 行 mask 文件存在、240×320 RGBA8（候选灰度蒙版已由导入脚本机械转换为
//     alpha=灰度 的 RGBA——运行时纯 destination-out，全链零 getImageData）、SHA == manifest == SUMS；
//     maskPolicy=none 行 config 必须 kind:'none'
//   ⑤ 字段合法性：angleDefinition 非空、angleDeg 有限数、layerOrder ∈ {weapon_front, body_front}、
//     maskPolicy ∈ 已知七值、status 全行=runtime-release
//   ⑥ runtime 索引双向一致：SHA256SUMS ⊆→ 目录实有文件双向覆盖；config/hero-weapon-layer.ts 每行
//     bodySrc/weaponSrc/maskSha256 与 manifest 一致且仅 hero 条目
//   ⑦ runtime 隔离：manifest.runtime.json / config / ui/battle-hex-render.ts / proto/battle_demo/main.ts /
//     bundle.js 零 `_trial/` 路径；渲染与宿主零 `destination-in`（语义相反禁用）、零 `.rotate(`（剑层零运行时旋转）
// 零依赖：node 内建 fs/crypto；不解码像素（RGBA 由 IHDR colorType 判定，与素材门检口径一致）。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'assets/characters/hero/weapon45';
const CFG = 'config/hero-weapon-layer.ts';
const EXPECT_W = 240;
const EXPECT_H = 320;
const POLICIES = new Set([
  'original_body_alpha_tight_fist_roi',
  'original_body_alpha_tight_fist_polygon',
  'original_body_alpha_precise_connected_fist',
  'precise_original_body_alpha_fist_polygon',
  'precise_original_body_alpha_fist',
  'complete_fist_cutout_top_with_grip_window',
  'none',
]);
const ORDERS = new Set(['weapon_front', 'body_front']);
const FIELDS = [
  'frameId',
  'bodyFrame',
  'candidateBodySha256',
  'runtimeBodySha256',
  'bodyCorrection',
  'gripPointPx',
  'fistCenterPx',
  'angleDeg',
  'angleDefinition',
  'layerOrder',
  'maskPolicy',
  'occlusionMaskPath+occlusionMaskSha256',
  'visibleStubs',
  'status',
];

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
function pngHeader(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 33) return { ok: false, why: '文件过短' };
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return { ok: false, why: 'PNG 签名不符' };
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return { ok: false, why: '首 chunk 非 IHDR' };
  return { ok: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25] };
}
function parseSums(text) {
  const m = new Map();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const [hash, ...rest] = t.split(/\s+/);
    m.set(rest.join(' ').replace(/^\*/, ''), hash.toLowerCase());
  }
  return m;
}

const failures = [];
const fail = (msg) => failures.push(msg);
const rows = [];
let passed = 0;
let checked = 0;

// ── manifest 载入与模板核验 ──
const mfPath = path.join(ROOT, DIR, 'manifest.runtime.json');
if (!fs.existsSync(mfPath)) {
  console.error(`[preflight] GATE FAIL：manifest.runtime.json 缺失（${DIR}）`);
  process.exit(1);
}
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
if (mf.frameCount !== 26) fail(`manifest.frameCount=${mf.frameCount}≠26`);
if (!Array.isArray(mf.rows) || mf.rows.length !== 26) fail(`manifest.rows=${mf.rows?.length}≠26`);

const seenFrameId = new Set();
const seenBody = new Set();
const sums = fs.existsSync(path.join(ROOT, DIR, 'SHA256SUMS'))
  ? parseSums(fs.readFileSync(path.join(ROOT, DIR, 'SHA256SUMS'), 'utf8'))
  : new Map();
if (sums.size === 0) fail('SHA256SUMS 缺失或为空');
const referenced = new Set(); // runtime 索引：manifest 引用面
referenced.add('manifest.runtime.json');

for (const r of mf.rows ?? []) {
  checked++;
  const row = { id: r.frameId, body: '-', w: '-', rgba: '-', sha: '-', mask: '-', ok: false };
  rows.push(row);
  let ok = true;
  const bad = (msg) => {
    fail(`${r.frameId}: ${msg}`);
    ok = false;
  };
  // ① 14 字段严格
  for (const f of FIELDS) if (r[f] === undefined) bad(`缺字段 ${f}`);
  if (typeof r.weaponPath !== 'string' || !r.weaponPath) bad('缺字段 weaponPath');
  if (typeof r.weaponSha256 !== 'string' || r.weaponSha256.length !== 64) bad('weaponSha256 非法');
  if (seenFrameId.has(r.frameId)) bad(`frameId 重复 ${r.frameId}`);
  if (seenBody.has(r.bodyFrame)) bad(`bodyFrame 重复 ${r.bodyFrame}`);
  seenFrameId.add(r.frameId);
  seenBody.add(r.bodyFrame);
  // ⑤ 字段合法性
  if (r.status !== 'runtime-release') bad(`status=${r.status}≠runtime-release`);
  if (!POLICIES.has(r.maskPolicy)) bad(`maskPolicy=${r.maskPolicy} 非法`);
  if (!ORDERS.has(r.layerOrder)) bad(`layerOrder=${r.layerOrder} 非法`);
  if (typeof r.angleDefinition !== 'string' || !r.angleDefinition.trim()) bad('angleDefinition 空');
  if (typeof r.angleDeg !== 'number' || !Number.isFinite(r.angleDeg)) bad('angleDeg 非有限数');
  if (!Array.isArray(r.gripPointPx) || r.gripPointPx.length !== 2) bad('gripPointPx 非二元组');
  if (!Array.isArray(r.fistCenterPx) || r.fistCenterPx.length !== 2) bad('fistCenterPx 非二元组');
  // ② 身体帧
  const bodyAbs = path.join(ROOT, r.bodyFrame);
  if (!fs.existsSync(bodyAbs)) bad(`身体帧缺失 ${r.bodyFrame}`);
  else {
    row.body = path.basename(r.bodyFrame);
    const bSha = sha256(fs.readFileSync(bodyAbs));
    if (bSha !== r.runtimeBodySha256) bad(`身体 SHA≠runtimeBodySha256（${bSha.slice(0, 12)}≠${String(r.runtimeBodySha256).slice(0, 12)}）`);
    if (r.bodyCorrection === 'none' && r.candidateBodySha256 !== r.runtimeBodySha256) {
      bad('bodyCorrection=none 但 candidate/runtime 身体 SHA 不等');
    }
  }
  // ③ 剑层
  const wRel = `${DIR}/${r.weaponPath}`;
  referenced.add(r.weaponPath);
  const wAbs = path.join(ROOT, wRel);
  if (!fs.existsSync(wAbs)) bad(`剑层缺失 ${wRel}`);
  else {
    const buf = fs.readFileSync(wAbs);
    const hdr = pngHeader(buf);
    if (!hdr.ok) bad(`剑层 ${hdr.why}`);
    else {
      row.w = `${hdr.width}x${hdr.height}`;
      row.rgba = hdr.colorType === 6 && hdr.bitDepth === 8 ? 'RGBA8' : `ct${hdr.colorType}/bd${hdr.bitDepth}`;
      if (hdr.width !== EXPECT_W || hdr.height !== EXPECT_H) bad(`剑层尺寸 ${row.w}≠${EXPECT_W}x${EXPECT_H}`);
      if (hdr.colorType !== 6 || hdr.bitDepth !== 8) bad(`剑层非 RGBA 8bit（ct${hdr.colorType}/bd${hdr.bitDepth}）`);
    }
    const wSha = sha256(buf);
    row.sha = wSha.slice(0, 12);
    if (wSha !== r.weaponSha256) bad(`剑层 SHA≠weaponSha256（${wSha.slice(0, 12)}）`);
    const sumSha = sums.get(r.weaponPath);
    if (sumSha === undefined) bad(`剑层不在 SHA256SUMS：${r.weaponPath}`);
    else if (sumSha !== wSha) bad(`剑层 SHA 与 SHA256SUMS 不符（${wSha.slice(0, 12)}≠${sumSha.slice(0, 12)}）`);
  }
  // ④ 遮罩（凡 manifest 记录了 mask 路径一律核验并计入 runtime 索引；maskPolicy 只决定运行时是否消费：
  //   ≠none 行 loader 离屏挖拳孔；=none 行 config 必须 kind:'none'——frame05/05_left 两张溯源文件落库不消费）
  const occl = r['occlusionMaskPath+occlusionMaskSha256'] ?? {};
  const hasMaskPath = occl && occl.path !== 'none';
  if (r.maskPolicy !== 'none' && !hasMaskPath) bad(`maskPolicy=${r.maskPolicy} 但 mask 路径=none`);
  if (hasMaskPath) {
    const mRel = `${DIR}/${occl.path}`;
    referenced.add(occl.path);
    const mAbs = path.join(ROOT, mRel);
    if (!fs.existsSync(mAbs)) bad(`遮罩缺失 ${mRel}`);
    else {
      const buf = fs.readFileSync(mAbs);
      const hdr = pngHeader(buf);
      if (!hdr.ok) bad(`遮罩 ${hdr.why}`);
      else if (hdr.width !== EXPECT_W || hdr.height !== EXPECT_H) bad(`遮罩尺寸 ${hdr.width}x${hdr.height}≠${EXPECT_W}x${EXPECT_H}`);
      else if (hdr.bitDepth !== 8 || hdr.colorType !== 6) bad(`遮罩非 RGBA 8bit（ct${hdr.colorType}/bd${hdr.bitDepth}；runtime 蒙版=导入期 alpha 转换产物，必须 ct6/bd8）`);
      const mSha = sha256(buf);
      row.mask = mSha.slice(0, 12);
      if (occl.sha256 !== mSha) bad(`遮罩 SHA≠manifest（${mSha.slice(0, 12)}≠${String(occl.sha256).slice(0, 12)}）`);
      const sumSha = sums.get(occl.path);
      if (sumSha === undefined) bad(`遮罩不在 SHA256SUMS：${occl.path}`);
      else if (sumSha !== mSha) bad(`遮罩 SHA 与 SHA256SUMS 不符`);
    }
  }
  row.ok = ok;
  if (ok) passed++;
}

// ⑥-1 SHA256SUMS ↔ 目录双向覆盖（无多余行/无未列文件）
{
  const absDir = path.join(ROOT, DIR);
  const actual = new Set();
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(absDir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else actual.add(child);
    }
  };
  walk('');
  for (const f of actual) if (!referenced.has(f) && f !== 'SHA256SUMS') fail(`SHA256SUMS/runtime 索引外多余文件：${f}`);
  for (const f of referenced) if (!actual.has(f)) fail(`manifest 引用文件不存在：${f}`);
  for (const f of sums.keys()) if (!actual.has(f)) fail(`SHA256SUMS 行指向不存在文件：${f}`);
}

// ⑥-2 config ↔ manifest 双向一致（逐行 bodySrc/weaponSrc/maskSrc SHA；仅 hero 条目）
{
  const cfgPath = path.join(ROOT, CFG);
  if (!fs.existsSync(cfgPath)) fail(`config 缺失 ${CFG}`);
  else {
    const ts = fs.readFileSync(cfgPath, 'utf8');
    for (const r of mf.rows ?? []) {
      if (!ts.includes(`bodySrc: '${r.bodyFrame}'`)) fail(`config 缺 bodySrc ${r.bodyFrame}`);
      if (!ts.includes(`weaponSrc: '${DIR}/${r.weaponPath}'`)) fail(`config 缺 weaponSrc ${r.weaponPath}`);
      if (!ts.includes(`weaponSha256: '${r.weaponSha256}'`)) fail(`config weaponSha256 与 manifest 不一致：${r.frameId}`);
      if (r.maskPolicy !== 'none' && !ts.includes(`maskSha256: '${r['occlusionMaskPath+occlusionMaskSha256']?.sha256}'`)) {
        fail(`config maskSha256 与 manifest 不一致：${r.frameId}`);
      }
    }
    const heroBlocks = ts.split(/(?=bodySrc: ')/).slice(1);
    if (heroBlocks.length !== 26) fail(`config 行块=${heroBlocks.length}≠26`);
    // config 遮罩枚举：maskPolicy=none 行必须 kind:'none'（块以 bodySrc 行起点锚定——元组键行属上一块，
    // includes 会错位，故用 startsWith 精确锚定）
    for (const r of mf.rows ?? []) {
      const block = heroBlocks.find((b) => b.startsWith(`bodySrc: '${r.bodyFrame}'`));
      if (!block) {
        fail(`config 缺行块：${r.frameId}`);
        continue;
      }
      const kindNone = /occlusion: \{ kind: 'none' \}/.test(block);
      if (r.maskPolicy === 'none' && !kindNone) fail(`config occlusion 应为 none：${r.frameId}`);
      if (r.maskPolicy !== 'none' && kindNone) fail(`config occlusion 缺 body-alpha-tight-fist-roi：${r.frameId}`);
    }
    if (!/WEAPON_LAYER_PROFILES[^=]*= ?\{\s*hero:/.test(ts)) fail('config WEAPON_LAYER_PROFILES 仅允许 hero 条目（NPC/敌方须后续需求卡授权）');
  }
}

// ⑦ runtime 隔离与红线扫描
{
  const scan = [`${DIR}/manifest.runtime.json`, CFG, 'ui/battle-hex-render.ts', 'proto/battle_demo/main.ts', 'proto/battle_demo/bundle.js'];
  for (const rel of scan) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      if (rel !== 'proto/battle_demo/bundle.js') fail(`runtime 隔离扫描：文件缺失 ${rel}`);
      continue;
    }
    const hits = fs.readFileSync(p, 'utf8').match(/assets\/[^'"`\s)]*\/_trial\//g) ?? [];
    if (hits.length) fail(`runtime 隔离：${rel} 出现候选树路径 ${[...new Set(hits)].join(', ')}`);
  }
  for (const rel of ['ui/battle-hex-render.ts', 'proto/battle_demo/main.ts']) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    // 精确匹配赋值语句（注释提及"禁 destination-in"不算命中）
    if (/globalCompositeOperation\s*=\s*['"]destination-in['"]/.test(src)) fail(`红线：${rel} 出现 destination-in 赋值（语义相反，禁用）`);
    if (/\.rotate\s*\(/.test(src)) fail(`红线：${rel} 出现 .rotate(（剑层零运行时旋转）`);
  }
}

// 输出
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad('frameId', 14)} ${pad('bodyFrame', 28)} ${pad('size', 9)} ${pad('mode', 7)} ${pad('sha12', 13)} ${pad('mask12', 13)} ok`);
for (const r of rows) {
  console.log(`${pad(r.id, 14)} ${pad(r.body, 28)} ${pad(r.w, 9)} ${pad(r.rgba, 7)} ${pad(r.sha, 13)} ${pad(r.mask, 13)} ${r.ok ? 'PASS' : 'FAIL'}`);
}
console.log(`\n[preflight] 逐行：${passed}/${checked} PASS（期望 26）`);
if (failures.length) {
  console.error(`[preflight] GATE FAIL ×${failures.length}：`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[preflight] GATE PASS：26 行身体/剑层/遮罩 SHA+尺寸+字段全过；SHA256SUMS 与 config 双向一致；runtime 无候选路径、无 destination-in、无 rotate');
