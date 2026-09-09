// ═══ T29 · hero 武器层 R2 素材落库+48 行 runtime projection v2 生成器（方案 v2.1 §2/§3）═══
// 输入（候选树=美术分支检出，只读；如 /tmp 下 worktree）：
//   <cand-root>/assets/_trial_20260909/t45_hero_weapon_second_batch_seq241/left_mirror_seq241_v1/manifest_48_rows_seq257_v3.json
//   <cand-root>/assets/_trial_20260909/t45_hero_weapon_sword_model_seq252/manifest_sword_model.json（握点 [23,57]）
//   <repo-root>/assets/characters/hero/weapon45/manifest.runtime.json（T28 第一批 26 行生产台账→mask 映射）
// 输出（正式路径，方案 §2.1）：
//   assets/characters/hero/weapon45/models/hero_sword_model_{right,left}.png（88×80 RGBA 逐字节复制）
//   assets/characters/hero/weapon45/models/manifest.json（WeaponModelMeta：src/sha/canvas/gripPointModelPx/angleDefinition）
//   assets/characters/hero/weapon45/masks/mask_cast_{right,left}_{1,2,3}.png（第二批 6 张灰度→alpha 机械转换，同 T28 ②'）
//   assets/characters/hero/weapon45/manifest.runtime.v2.json（48 行 HeroWeaponRuntimeRow 投影+sourceLedger）
//   assets/characters/hero/weapon45/SHA256SUMS（production 集合；旧预摆 weapon_*.png/manifest.runtime.json 退役出索引——§6）
//   config/hero-weapon-layer.ts（v2：WEAPON_MODELS+WEAPON_LAYER_PROFILES，48 行，禁手改）
// 裁决（实现记录，方案授权域）：
//   · layerOrder 归一：候选自由串按前缀映射二值枚举——'weapon_front*'→weapon_front；
//     'body_front'|'full_body_front'|'weapon_back*'→body_front（第一批 26 行本已二值，原样保留）。
//   · mask 治理沿 T28 先例：maskPolicy∈none/none_by_Leo_direction → 不消费（文件在候选树留审计，
//     candidateMaskSha256 溯源）；消费 mask 前先过 policy 再验候选 SHA。第一批 16 行复用 T28 生产
//     蒙版（candidateMaskSha256 双向核对）；第二批 6 行转换导入。全链零 _trial 引用进 runtime 行。
//   · 旋转 bounds 校验在生成期自检（越出身体矩形行数+preview 画布包络），运行时真值在
//     ui/battle-hex-render.ts 纯函数（weaponLayerRectOf），preflight 独立复算三方可比。
// 任一核验失败即非零退出（禁带病落库）。零依赖：node 内建。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

function argOf(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const REPO = path.resolve(argOf('repo-root', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')));
const CAND = path.resolve(argOf('cand-root', REPO));
const OUT_REL = 'assets/characters/hero/weapon45';
const OUT = path.join(REPO, OUT_REL);

const UNIFIED_REL = 'assets/_trial_20260909/t45_hero_weapon_second_batch_seq241/left_mirror_seq241_v1/manifest_48_rows_seq257_v3.json';
const MODEL_MANIFEST_REL = 'assets/_trial_20260909/t45_hero_weapon_sword_model_seq252/manifest_sword_model.json';
const FIRST_MANIFEST_REL = 'assets/_trial_20260909/t45_hero_weapon_left_derivation_seq232/manifest-26rows-seq232.json';
const SECOND_MANIFEST_REL = 'assets/_trial_20260909/t45_hero_weapon_second_batch_seq241/left_mirror_seq241_v1/manifest_22_rows_v1.json';
const T28_MANIFEST_REL = `${OUT_REL}/manifest.runtime.json`;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const fail = (msg) => {
  console.error(`[gen-v2] FAIL ${msg}`);
  process.exitCode = 1;
};
const fatal = (msg) => {
  fail(msg);
  process.exit(1);
};

// ── 最小 PNG 编解码（同 T28 导入器：ct0 灰度 bd8 解码 → ct6 RGBA bd8 编码+回读校验）──
function decodeGrayPng(buf) {
  let off = 8;
  const idat = [];
  let w = 0;
  let h = 0;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 0) throw new Error(`蒙版非 8bit 灰度（bd${data[8]}/ct${data[9]}）`);
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w;
  const gray = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const row = raw.subarray(p, p + stride);
    p += stride;
    const prev = y > 0 ? gray.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = gray.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 1 ? cur[x - 1] : 0;
      const b = prev[x];
      const c = x >= 1 ? prev[x - 1] : 0;
      let v = row[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
  }
  return { w, h, gray };
}
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function grayToRgbaPng({ w, h, gray }) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x];
      const i = rowStart + 1 + x * 4;
      raw[i] = v;
      raw[i + 1] = v;
      raw[i + 2] = v;
      raw[i + 3] = v;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}
/** PNG chunk 级 CRC 校验（编码器自锁——浏览器按 CRC 拒收坏帧，自研解码器不查 CRC 会漏） */
function verifyPngCrc(buf, label) {
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    const stored = buf.readUInt32BE(off + 8 + len);
    const actual = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    if (stored !== actual) throw new Error(`${label}: chunk ${type} CRC 不符（编码器缺陷）`);
    off += 12 + len;
    if (type === 'IEND') return;
  }
  throw new Error(`${label}: 缺 IEND`);
}
/** 灰度(luma=erase 强度)→RGBA(alpha=luma)；回读逐像素校验后返回（T28 ②' 同式） */
function convertMaskToAlpha(buf, label) {
  const dec = decodeGrayPng(buf);
  if (dec.w !== 240 || dec.h !== 320) throw new Error(`${label}: 蒙版尺寸 ${dec.w}x${dec.h}≠240x320`);
  const out = grayToRgbaPng(dec);
  verifyPngCrc(out, label);
  // 回读校验：RGBA IDAT 重解码，逐像素 alpha==luma
  let off = 8;
  const idat = [];
  let ww = 0;
  let hh = 0;
  while (off < out.length) {
    const len = out.readUInt32BE(off);
    const type = out.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      ww = out.readUInt32BE(off + 8);
      hh = out.readUInt32BE(off + 12);
    } else if (type === 'IDAT') idat.push(out.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = ww * 4;
  const px = Buffer.alloc(hh * stride);
  let p = 0;
  for (let y = 0; y < hh; y++) {
    const f = raw[p++];
    const row = raw.subarray(p, p + stride);
    p += stride;
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let v = row[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
  }
  let mismatches = 0;
  for (let i = 3; i < px.length; i += 4) {
    const luma = px[i - 3];
    if (px[i] !== luma) mismatches++;
  }
  if (mismatches > 0) throw new Error(`${label}: 蒙版转换回读校验失败（${mismatches} 像素 alpha≠luma）`);
  return out;
}

// ── ① 候选 manifest + 模型 manifest 读入与核验 ──
const unifiedBuf = fs.readFileSync(path.join(CAND, UNIFIED_REL));
const unified = JSON.parse(unifiedBuf.toString('utf8'));
if (!Array.isArray(unified.rows) || unified.rows.length !== 48) fatal(`候选行数 ${unified.rows?.length}≠48`);

const modelManifest = JSON.parse(fs.readFileSync(path.join(CAND, MODEL_MANIFEST_REL), 'utf8'));
// 左模握点裁决：art manifest 记载 flipX:true（左模=右模逐像素水平镜像，x→W-1-x，已实测 7040/7040
// 像素一致+握点 alpha 孪生 250/250 核验）→ 左模握点=右模握点镜像映射，随右模标定派生（非独立标定值）。
const RIGHT_GRIP = modelManifest.swordModel.gripPointModelPx;
const LEFT_GRIP = [88 - 1 - RIGHT_GRIP[0], RIGHT_GRIP[1]];
const MODEL_META = {
  'hero-sword-right': {
    src: `${OUT_REL}/models/hero_sword_model_right.png`,
    sha256: modelManifest.swordModel.rightSha256,
    canvasPx: [88, 80],
    gripPointModelPx: RIGHT_GRIP,
    angleDefinition: 'screen-clockwise-positive-y-down',
  },
  'hero-sword-left': {
    src: `${OUT_REL}/models/hero_sword_model_left.png`,
    sha256: modelManifest.swordModel.leftSha256,
    canvasPx: [88, 80],
    gripPointModelPx: LEFT_GRIP,
    angleDefinition: 'screen-clockwise-positive-y-down',
  },
};
for (const [key, meta] of Object.entries(MODEL_META)) {
  const candRel = key === 'hero-sword-right' ? modelManifest.swordModel.rightPath : modelManifest.swordModel.leftPath;
  const buf = fs.readFileSync(path.join(CAND, candRel));
  if (sha256(buf) !== meta.sha256) fatal(`${key}: 模型 SHA≠model manifest`);
  if (buf.readUInt32BE(16) !== 88 || buf.readUInt32BE(20) !== 80) fatal(`${key}: 模型非 88×80`);
  if (buf[25] !== 6) fatal(`${key}: 模型非 RGBA（ct${buf[25]}）`);
  const [gx, gy] = meta.gripPointModelPx;
  if (!(gx >= 0 && gx < 88 && gy >= 0 && gy < 80)) fatal(`${key}: 握点 [${gx},${gy}] 不在画布内`);
}
fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });
const written = [];
written.push({ rel: 'models/hero_sword_model_right.png', buf: fs.readFileSync(path.join(CAND, modelManifest.swordModel.rightPath)) });
written.push({ rel: 'models/hero_sword_model_left.png', buf: fs.readFileSync(path.join(CAND, modelManifest.swordModel.leftPath)) });
const modelsManifestBuf = Buffer.from(JSON.stringify({ schema: 'weapon-model-meta (方案 v2.1 §2.2)', generatedBy: 'tools/generate_hero_weapon_runtime_v2.mjs', models: MODEL_META }, null, 2) + '\n');
written.push({ rel: 'models/manifest.json', buf: modelsManifestBuf });

// ── ② T28 生产台账读入（第一批 mask 映射 + body SHA 台账）──
const t28 = JSON.parse(fs.readFileSync(path.join(REPO, T28_MANIFEST_REL), 'utf8'));
const t28ByFrame = new Map(t28.rows.map((r) => [r.frameId, r]));

// ── ③ 48 行投影生成 ──
const MASK_POLICIES = new Set([
  'original_body_alpha_tight_fist_roi',
  'original_body_alpha_tight_fist_polygon',
  'original_body_alpha_precise_connected_fist',
  'precise_original_body_alpha_fist_polygon',
  'precise_original_body_alpha_fist',
  'complete_fist_cutout_top_with_grip_window',
  'original-body-fist-mask_plus_handle-corridor-reveal',
]);
const mapLayerOrder = (lo, frameId) => {
  if (lo === 'weapon_front' || lo === 'body_front') return lo;
  if (typeof lo === 'string' && lo.startsWith('weapon_front')) return 'weapon_front';
  if (typeof lo === 'string' && (lo === 'full_body_front' || lo.startsWith('weapon_back'))) return 'body_front';
  fatal(`${frameId}: layerOrder 候选值 "${lo}" 无法归一二值枚举`);
  return 'weapon_front';
};
const modelKeyOf = (bodyFrame, frameId) => {
  const stem = path.basename(bodyFrame, '.png');
  const m = stem.match(/_(right|rightup|rightdown|left|leftup|leftdown)(_\d+)?$/);
  if (!m) fatal(`${frameId}: 身体帧 ${stem} 无法解析六向 facing`);
  const key = m[1].startsWith('left') ? 'hero-sword-left' : 'hero-sword-right';
  if (frameId.endsWith('_left') !== (key === 'hero-sword-left')) {
    fatal(`${frameId}: frameId 左右后缀与 facing=${m[1]} 矛盾`);
  }
  return key;
};

const outRows = [];
for (const row of unified.rows) {
  const stem = path.basename(row.bodyFrame, '.png');
  const occl = row['occlusionMaskPath+occlusionMaskSha256'];
  const candMaskPath = occl && occl.path && occl.path !== 'none' ? occl.path : null;
  const candMaskSha = candMaskPath ? occl.sha256 : null;
  // 身体帧核验（repo 内=交付物）
  const bodyAbs = path.join(REPO, row.bodyFrame);
  if (!fs.existsSync(bodyAbs)) fatal(`${row.frameId}: 身体帧缺失 ${row.bodyFrame}`);
  if (sha256(fs.readFileSync(bodyAbs)) !== row.runtimeBodySha256) fatal(`${row.frameId}: 身体 SHA≠runtimeBodySha256`);
  // 标定字段核验
  if (!Array.isArray(row.gripPointPx) || !Array.isArray(row.fistCenterPx)) fatal(`${row.frameId}: grip/fist 缺失（frame15 补标未到？）`);
  const inCanvas = ([x, y]) => x >= 0 && x <= 240 && y >= 0 && y <= 320;
  if (!inCanvas(row.gripPointPx) || !inCanvas(row.fistCenterPx)) fatal(`${row.frameId}: grip/fist 越出身体 240×320 画布`);
  if (typeof row.angleDeg !== 'number' || row.angleDeg <= -180 || row.angleDeg >= 180) fatal(`${row.frameId}: angleDeg 非法`);
  const weaponModelKey = modelKeyOf(row.bodyFrame, row.frameId);
  const layerOrder = mapLayerOrder(row.layerOrder, row.frameId);
  // mask 治理：policy 先行（T28 先例），再验候选 SHA
  let maskPath = null;
  let maskSha = null;
  if (MASK_POLICIES.has(row.maskPolicy)) {
    if (!candMaskPath) fatal(`${row.frameId}: maskPolicy=${row.maskPolicy} 但候选无 mask 文件`);
    const t28row = t28ByFrame.get(row.frameId);
    if (t28row) {
      // 第一批：复用 T28 生产蒙版，candidateMaskSha256 双向核对
      if (t28row.maskPolicy === 'none') fatal(`${row.frameId}: T28 台账 policy=none 与候选 ${row.maskPolicy} 矛盾`);
      if (t28row.candidateMaskSha256 !== candMaskSha) fatal(`${row.frameId}: 候选 mask SHA≠T28 台账 candidateMaskSha256`);
      const prodRel = t28row['occlusionMaskPath+occlusionMaskSha256'].path;
      const prodAbs = path.join(OUT, prodRel);
      if (!fs.existsSync(prodAbs)) fatal(`${row.frameId}: T28 生产蒙版缺失 ${prodRel}`);
      maskPath = prodRel;
      maskSha = t28row['occlusionMaskPath+occlusionMaskSha256'].sha256;
      if (sha256(fs.readFileSync(prodAbs)) !== maskSha) fatal(`${row.frameId}: 生产蒙版 SHA 自检失败`);
    } else {
      // 第二批：候选转换导入（灰度→alpha，回读校验）
      if (sha256(fs.readFileSync(path.join(CAND, candMaskPath))) !== candMaskSha) fatal(`${row.frameId}: 候选 mask SHA≠manifest`);
      let converted;
      try {
        converted = convertMaskToAlpha(fs.readFileSync(path.join(CAND, candMaskPath)), row.frameId);
      } catch (e) {
        fatal(`${row.frameId}: ${e.message}`);
      }
      maskPath = `masks/mask_${stem}.png`;
      maskSha = sha256(converted);
      written.push({ rel: maskPath, buf: converted });
    }
  } else if (row.maskPolicy !== 'none' && row.maskPolicy !== 'none_by_Leo_direction') {
    fatal(`${row.frameId}: 未知 maskPolicy ${row.maskPolicy}`);
  }
  outRows.push({
    frameId: row.frameId,
    bodyFrame: row.bodyFrame,
    weaponModelKey,
    modelSha256: MODEL_META[weaponModelKey].sha256,
    gripPointPx: row.gripPointPx,
    fistCenterPx: row.fistCenterPx,
    angleDeg: row.angleDeg,
    layerOrder,
    ...(maskPath ? { maskPath, maskSha256: maskSha } : {}),
    ...(candMaskSha ? { candidateMaskSha256: candMaskSha } : {}), // 溯源：候选灰度蒙版 SHA（runtime 不消费面）
    status: 'runtime-release',
  });
}
if (process.exitCode) {
  console.error('[gen-v2] 核验有红，终止落库');
  process.exit(1);
}
// 唯一性
const bodies = new Set(outRows.map((r) => r.bodyFrame));
const ids = new Set(outRows.map((r) => r.frameId));
if (bodies.size !== 48) fatal(`bodyFrame 唯一性破坏 ${bodies.size}/48`);
if (ids.size !== 48) fatal(`frameId 唯一性破坏 ${ids.size}/48`);

// ── ④ manifest.runtime.v2.json ──
const runtimeV2 = {
  schema: 'hero-weapon45-runtime-v2 (方案 v2.1 §2.2 HeroWeaponRuntimeRow；独立剑模+48 行标定运行时合成，零预摆剑层)',
  generatedBy: 'tools/generate_hero_weapon_runtime_v2.mjs（候选 manifest_48_rows_seq257_v3 统一投影；runtime 行零候选路径）',
  frameCount: 48,
  canvas: { w: 240, h: 320 },
  angleDefinition: 'screen-clockwise-positive-y-down', // 纯 token（机器比对面；口径说明见 §4.1 与 models/manifest.json）
  sourceLedger: {
    unifiedManifest: { path: UNIFIED_REL, sha256: sha256(unifiedBuf) },
    firstBatch26: { path: FIRST_MANIFEST_REL, sha256: sha256(fs.readFileSync(path.join(CAND, FIRST_MANIFEST_REL))) },
    secondBatch22: { path: SECOND_MANIFEST_REL, sha256: sha256(fs.readFileSync(path.join(CAND, SECOND_MANIFEST_REL))) },
    modelManifest: { path: MODEL_MANIFEST_REL, sha256: sha256(fs.readFileSync(path.join(CAND, MODEL_MANIFEST_REL))) },
    frame15GripRepair: 'unified manifest @7cfabe63（gripPointSource=frame15 v4 calibration；gripPointPx [210,198]/[29,198]）',
    t28ProductionMasks: `${T28_MANIFEST_REL}（第一批 16 行蒙版复用，candidateMaskSha256 双向核对）`,
  },
  rows: outRows,
};
const runtimeBuf = Buffer.from(JSON.stringify(runtimeV2, null, 2) + '\n');
written.push({ rel: 'manifest.runtime.v2.json', buf: runtimeBuf });

// ── ⑤ 落库 ──
for (const w of written) fs.writeFileSync(path.join(OUT, w.rel), w.buf);

// ── ⑥ SHA256SUMS（production 集合：models/ + masks/ 全部 + manifest.runtime.v2.json；
//      旧预摆 weapon_*.png 与 manifest.runtime.json 退役出索引（§6），文件留审计不删）──
const prodFiles = [
  ...fs.readdirSync(path.join(OUT, 'models')).sort().map((f) => `models/${f}`),
  ...fs.readdirSync(path.join(OUT, 'masks')).sort().map((f) => `masks/${f}`),
  'manifest.runtime.v2.json',
];
const sums = prodFiles
  .map((rel) => `${sha256(fs.readFileSync(path.join(OUT, rel)))}  ${rel}`)
  .join('\n');
fs.writeFileSync(path.join(OUT, 'SHA256SUMS'), sums + '\n');

// ── ⑦ config/hero-weapon-layer.ts（v2 生成）──
const num = (n) => String(n);
const px = (p) => `[${num(p[0])}, ${num(p[1])}]`;
const tsRow = (r) => {
  const mask = r.maskPath
    ? `\n      maskPath: '${OUT_REL}/${r.maskPath}',\n      maskSha256: '${r.maskSha256}',`
    : '';
  return `  [
    '${r.bodyFrame}',
    {
      frameId: '${r.frameId}',
      bodyFrame: '${r.bodyFrame}',
      weaponModelKey: '${r.weaponModelKey}',
      modelSha256: '${r.modelSha256}',
      gripPointPx: ${px(r.gripPointPx)},
      fistCenterPx: ${px(r.fistCenterPx)},
      angleDeg: ${num(r.angleDeg)},
      layerOrder: '${r.layerOrder}',${mask}
      status: 'runtime-release',
    },
  ],`;
};
const metaTs = (key) => {
  const m = MODEL_META[key];
  return `  '${key}': {
    src: '${m.src}',
    sha256: '${m.sha256}',
    canvasPx: [${m.canvasPx[0]}, ${m.canvasPx[1]}],
    gripPointModelPx: [${m.gripPointModelPx[0]}, ${m.gripPointModelPx[1]}],
    angleDefinition: '${m.angleDefinition}',
  },`;
};
const ts = `// T29 · hero 武器层 R2 配置（由 tools/generate_hero_weapon_runtime_v2.mjs 生成——勿手改；源=统一 48 行
// manifest_48_rows_seq257_v3（含 frame15 握点补标），运行时契约=assets/characters/hero/weapon45/manifest.runtime.v2.json，
// 预检 tools/preflight_hero_weapon_model.mjs 三方锁）。铁律（《主角武器层接线实施方案》v2.1 §4.1）：
// 运行时绕模型握点旋转合成——translate(fist)→rotate(angleDeg)→drawImage(model,-grip×s,88s,80s)；
// 屏幕角 0°=右/+Y 向下/顺时针正，禁 atan2 数学口径；左右剑模独立加载零运行时 mirror；
// s=h/320 与身体同 scale（§4.1）。键=spriteKey → bodyFrame（身体帧完整路径为稳定键）；本卡仅 hero 有条目，
// NPC/敌方条目须后续需求卡授权。layerOrder：weapon_front=身体→weapon；body_front=weapon→身体（§4.3，
// 合成次序细节在离屏 layer 内完成，见 ui/battle-hex-render composeWeaponModelLayer）。jump/die 显式无武器（§5）。

export type WeaponLayerOrder = 'weapon_front' | 'body_front';

/** 剑模键（§2.2）：right/rightup/rightdown→右模，left/leftup/leftdown→左模；零运行时镜像。 */
export type WeaponModelKey = 'hero-sword-right' | 'hero-sword-left';

/** 全局剑模元数据（§2.2 WeaponModelMeta；旋转中心=模型握点，非 bbox 中心）。 */
export interface WeaponModelMeta {
  src: string; // 正式 assets/characters/hero/weapon45/models 路径
  sha256: string;
  canvasPx: readonly [number, number]; // [88, 80]
  gripPointModelPx: readonly [number, number]; // [23, 57]（seq252 标定）
  angleDefinition: 'screen-clockwise-positive-y-down';
}

/** 48 行运行时标定行（§2.2 HeroWeaponRuntimeRow；gripPointPx/fistCenterPx=身体源 240×320 坐标，
 * 与模型握点是两回事，禁混用）。 */
export interface HeroWeaponRuntimeRow {
  frameId: string;
  bodyFrame: string; // 以身体帧完整路径作稳定键
  weaponModelKey: WeaponModelKey;
  modelSha256: string;
  gripPointPx: readonly [number, number];
  fistCenterPx: readonly [number, number];
  angleDeg: number; // screen angle：0°=right/+Y down/顺时针正
  layerOrder: WeaponLayerOrder;
  maskPath?: string; // 正式 assets/characters/hero/weapon45/masks 路径（可选；destination-out 挖拳用）
  maskSha256?: string;
  status: 'runtime-release';
}

/** 两张全局剑模（§2.2：不把模型路径复制 48 次——行只持 weaponModelKey）。 */
export const WEAPON_MODELS: Readonly<Record<WeaponModelKey, WeaponModelMeta>> = {
${metaTs('hero-sword-right')}
${metaTs('hero-sword-left')}
};

const HERO_WEAPON_ROWS: ReadonlyMap<string, HeroWeaponRuntimeRow> = new Map<string, HeroWeaponRuntimeRow>([
${outRows.map(tsRow).join('\n')}
]);

export type WeaponLayerProfile = Readonly<Record<string, ReadonlyMap<string, HeroWeaponRuntimeRow>>>;

export const WEAPON_LAYER_PROFILES: WeaponLayerProfile = {
  hero: HERO_WEAPON_ROWS,
};
`;
const cfgRel = 'config/hero-weapon-layer.ts';
fs.writeFileSync(path.join(REPO, cfgRel), ts);

// ── ⑧ 汇总输出 ──
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad('frameId', 34)} ${pad('bodyFrame', 30)} ${pad('model', 17)} ${pad('ang', 6)} ${pad('order', 13)} ${pad('mask', 5)} ok`);
for (const r of outRows) {
  console.log(
    `${pad(r.frameId, 34)} ${pad(path.basename(r.bodyFrame), 30)} ${pad(r.weaponModelKey.replace('hero-sword-', ''), 17)} ${pad(r.angleDeg, 6)} ${pad(r.layerOrder, 13)} ${pad(r.maskPath ? 'Y' : '-', 5)} PASS`,
  );
}
const newMasks = written.filter((w) => w.rel.startsWith('masks/')).map((w) => w.rel);
console.log(`\n[gen-v2] 48 行投影 + models×2 + models/manifest.json + 新转换蒙版 ${newMasks.length} 张（${newMasks.map((m) => path.basename(m)).join(', ')}）→ ${OUT_REL}`);
console.log(`[gen-v2] SHA256SUMS（production ${prodFiles.length} 项；旧预摆 26 png+manifest.runtime.json 退役出索引）`);
console.log(`[gen-v2] config v2 生成 → ${cfgRel}`);
