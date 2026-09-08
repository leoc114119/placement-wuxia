// ═══ T27 第二段 · 敌型 battle45 六向帧 runtime 预检（《战斗人物六向帧接线方案》§9.2.2① / §9.3 / §9.5）═══
// 用法：node proto/battle_demo/tools/preflight_enemy_sixdir.mjs
// 口径：甲/乙各 31 张（idle 6 + walk 12 + atk 12 + die_common 1）逐张校验——
//   ① 文件在；② PNG IHDR 240×320、8bit、colorType 6（RGBA）；③ SHA-256 = SHA256SUMS 行 = manifest.frames[].sha256；
//   ④ manifest 帧名集合 = 期望 31 名集合（frameCount=31）；⑤ die_common 三处（hero/甲/乙）逐字节一致且 = §9.3 基线；
//   ⑥ runtime 隔离：config/battle-hex.ts 与 bundle.js 的资源路径不得出现 `/cut/`（cut 只作源/QA，禁接线禁 fallback）。
// 任一项 FAIL → 非零退出（CI 报红）；预览侧回滚诊断走 URL ?enemy=legacy 显式指定（禁静默混用两套目录）。
// 零依赖：node 内建 fs/crypto；不解码像素（RGBA 由 IHDR colorType 判定，与素材门检口径一致）。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FACINGS = ['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown'];
const VARIANTS = [
  { key: 'npc-shanzei-a', dir: 'assets/characters/enemy/shanzei_a/battle45', identity: 'shanzei_a' },
  { key: 'npc-shanzei-b', dir: 'assets/characters/enemy/shanzei_b/battle45', identity: 'shanzei_b' },
];
const HERO_DIE = 'assets/characters/hero/battle45/die_common.png';
/** §9.3 死亡白骨基线（资产 commit b938aba8；hero/甲/乙三处同字节） */
const DIE_BASELINE_SHA = 'ae5a6ac7b147531042ec7baf29dd63b3e97f9ed6a0d3d637857562eda1088a24';
const EXPECT_W = 240;
const EXPECT_H = 320;

/** 期望 31 名（§9.1.1 runtime 目标目录） */
function expectedNames() {
  const names = [];
  for (const f of FACINGS) names.push(`battle_idle_${f}.png`);
  for (const f of FACINGS) for (const o of [1, 2]) names.push(`walk_${f}_${o}.png`);
  for (const f of FACINGS) for (const o of [1, 2]) names.push(`atk_${f}_${o}.png`);
  names.push('die_common.png');
  return names;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** 最小 PNG 头解析：签名 + IHDR（width/height/bitDepth/colorType） */
function pngHeader(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 33) return { ok: false, why: '文件过短' };
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return { ok: false, why: 'PNG 签名不符' };
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return { ok: false, why: '首 chunk 非 IHDR' };
  return {
    ok: true,
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
  };
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
let checked = 0;
let passed = 0;
const rows = [];

for (const v of VARIANTS) {
  const dirAbs = path.join(ROOT, v.dir);
  const manifestPath = path.join(dirAbs, 'manifest.json');
  const sumsPath = path.join(dirAbs, 'SHA256SUMS');
  if (!fs.existsSync(manifestPath)) {
    fail(`${v.key}: manifest.json 缺失（${v.dir}）`);
    continue;
  }
  if (!fs.existsSync(sumsPath)) fail(`${v.key}: SHA256SUMS 缺失（${v.dir}）`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sums = fs.existsSync(sumsPath) ? parseSums(fs.readFileSync(sumsPath, 'utf8')) : new Map();
  const expected = expectedNames();
  // ④ manifest 集合
  if (manifest.identity !== v.identity) fail(`${v.key}: manifest.identity=${manifest.identity}≠${v.identity}`);
  if (manifest.frameCount !== expected.length) fail(`${v.key}: manifest.frameCount=${manifest.frameCount}≠${expected.length}`);
  const manifestByName = new Map();
  for (const f of manifest.frames ?? []) manifestByName.set(f.name, f);
  if (manifest.sharedDieCommon && !manifestByName.has(manifest.sharedDieCommon.name)) {
    manifestByName.set(manifest.sharedDieCommon.name, manifest.sharedDieCommon);
  }
  const manifestNames = new Set(manifestByName.keys());
  for (const n of expected) if (!manifestNames.has(n)) fail(`${v.key}: manifest 缺帧名 ${n}`);
  for (const n of manifestNames) if (!expected.includes(n) && n !== 'die_common.png') fail(`${v.key}: manifest 多出非 runtime 帧名 ${n}`);
  if (sums.size !== expected.length) fail(`${v.key}: SHA256SUMS 行数=${sums.size}≠${expected.length}`);
  // 逐张 ①②③
  for (const n of expected) {
    checked++;
    const p = path.join(dirAbs, n);
    const row = { variant: v.key, name: n, size: '-', rgba: '-', sha: '-', ok: false };
    rows.push(row);
    if (!fs.existsSync(p)) {
      fail(`${v.key}: 文件缺失 ${v.dir}/${n}`);
      row.sha = 'MISSING';
      continue;
    }
    const buf = fs.readFileSync(p);
    const hdr = pngHeader(buf);
    let rowOk = true;
    if (!hdr.ok) {
      fail(`${v.key}: ${n} ${hdr.why}`);
      rowOk = false;
    } else {
      row.size = `${hdr.width}x${hdr.height}`;
      row.rgba = hdr.colorType === 6 && hdr.bitDepth === 8 ? 'RGBA8' : `ct${hdr.colorType}/bd${hdr.bitDepth}`;
      if (hdr.width !== EXPECT_W || hdr.height !== EXPECT_H) {
        fail(`${v.key}: ${n} 尺寸 ${row.size}≠${EXPECT_W}x${EXPECT_H}`);
        rowOk = false;
      }
      if (hdr.colorType !== 6 || hdr.bitDepth !== 8) {
        fail(`${v.key}: ${n} 非 RGBA 8bit（colorType=${hdr.colorType} bitDepth=${hdr.bitDepth}）`);
        rowOk = false;
      }
    }
    const h = sha256(buf);
    row.sha = h.slice(0, 12);
    const sumH = sums.get(n);
    if (sumH === undefined) {
      fail(`${v.key}: ${n} 不在 SHA256SUMS`);
      rowOk = false;
    } else if (sumH !== h) {
      fail(`${v.key}: ${n} SHA 与 SHA256SUMS 不符（文件 ${h.slice(0, 12)} / 表 ${sumH.slice(0, 12)}）`);
      rowOk = false;
    }
    const mf = manifestByName.get(n);
    if (mf && typeof mf.sha256 === 'string' && mf.sha256.toLowerCase() !== h) {
      fail(`${v.key}: ${n} SHA 与 manifest.sha256 不符（文件 ${h.slice(0, 12)} / manifest ${mf.sha256.slice(0, 12)}）`);
      rowOk = false;
    }
    if (mf && Array.isArray(mf.size) && (mf.size[0] !== EXPECT_W || mf.size[1] !== EXPECT_H)) {
      fail(`${v.key}: ${n} manifest.size=${mf.size.join('x')}≠${EXPECT_W}x${EXPECT_H}`);
      rowOk = false;
    }
    row.ok = rowOk;
    if (rowOk) passed++;
  }
}

// ⑤ die_common 三处一致 + 基线
{
  const paths = [HERO_DIE, ...VARIANTS.map((v) => `${v.dir}/die_common.png`)];
  const shas = [];
  for (const rel of paths) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      fail(`die_common 缺失：${rel}`);
      shas.push(null);
      continue;
    }
    shas.push(sha256(fs.readFileSync(p)));
  }
  const uniq = new Set(shas.filter(Boolean));
  if (uniq.size !== 1) fail(`die_common 三处 SHA 不一致：${paths.map((p, i) => `${p}=${(shas[i] ?? 'MISSING').slice(0, 12)}`).join(' | ')}`);
  if (shas.some((s) => s !== DIE_BASELINE_SHA)) fail(`die_common 与 §9.3 基线 ${DIE_BASELINE_SHA.slice(0, 12)}… 不符`);
  console.log(`[preflight] die_common 三处：${paths.map((p, i) => `${p.split('/')[2]}=${(shas[i] ?? 'MISSING').slice(0, 12)}`).join(' / ')} 基线=${DIE_BASELINE_SHA.slice(0, 12)}…`);
}

// ⑥ runtime 隔离：资源路径字面量不得含 /cut/
{
  const scan = ['config/battle-hex.ts', 'proto/battle_demo/bundle.js'];
  const re = /assets\/[^'"`\s)]*\/cut\//g;
  for (const rel of scan) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      fail(`runtime 隔离扫描：文件缺失 ${rel}`);
      continue;
    }
    const hits = fs.readFileSync(p, 'utf8').match(re) ?? [];
    if (hits.length) fail(`runtime 隔离：${rel} 出现 cut 路径 ${[...new Set(hits)].join(', ')}`);
  }
}

// 输出表
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad('variant', 15)} ${pad('frame', 26)} ${pad('size', 9)} ${pad('mode', 7)} ${pad('sha12', 13)} ok`);
for (const r of rows) console.log(`${pad(r.variant, 15)} ${pad(r.name, 26)} ${pad(r.size, 9)} ${pad(r.rgba, 7)} ${pad(r.sha, 13)} ${r.ok ? 'PASS' : 'FAIL'}`);
console.log(`\n[preflight] 逐张：${passed}/${checked} PASS（期望 ${VARIANTS.length * expectedNames().length}）`);
if (failures.length) {
  console.error(`[preflight] GATE FAIL ×${failures.length}：`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('[preflight] 预览回滚诊断：URL ?enemy=legacy 显式指 npc-shanzei-legacy（非正式通过；禁静默混用 battle45/cut/legacy）');
  process.exit(1);
}
console.log('[preflight] GATE PASS：62/62 逐张 + die_common 三处一致 + runtime 无 cut 路径');
