// ═══ T28 · hero 武器层素材正式落库导入脚本（方案 §2.1：候选源逐字节复制 → runtime 唯一来源）═══
// 用法（候选树=含 assets/_trial_2026090{8,9} 的检出（如美术分支工作区，只读）；输出根=任务分支检出）：
//   node tools/import_hero_weapon_layer.mjs \
//     --repo-root <任务分支检出根，写产物> --cand-root <候选树检出根，只读> \
//     [--out assets/characters/hero/weapon45]
// 输入（候选，已过 PM 审查门 + Leo 目验）：
//   <repo-root>/assets/_trial_20260909/t45_hero_weapon_left_derivation_seq232/manifest-26rows-seq232.json
//   左系剑层/mask 同目录 sword_layers|occlusion_masks（qa.lemma: derivedWeaponPath/weaponSha256 台账）
//   右系剑层路径=左行 qa.derivedFromWeapon（指向 _trial_20260908 revisions normalized/）；
//   右系 mask 路径=各行 occlusionMaskPath（同上 revisions）。
// 行为：
//   ① 逐行 SHA 核验（左剑=台账 weaponSha256；mask=行 occlusionMaskSha256；身体=repo battle45 ==runtimeBodySha256）
//   ② 逐字节复制 26 剑层 → weapon_<身体帧stem>.png；16 张有遮挡 mask → masks/mask_<stem>.png
//     （frame05/05_left 两张 policy=none 的 mask 文件按卡面"masks/ 18 张"一并落库，runtime 不消费）
//   ②' 蒙版格式适配（机械转换，不改几何/数值）：候选蒙版为 8bit 灰度 ct0（luma=erase 强度，pilot
//     subtract_mask 语义：weapon_alpha -= mask_luma）→ runtime 蒙版转 RGBA（rgb=luma，alpha=luma）。
//     理由：运行时 luma→alpha 需 getImageData——file:// 预览页图片污染 canvas 直接抛错、wx 端逐像素
//     开销大（T24「禁运行时 getImageData」同根源）；蓝图 §4.3 蒙版需以 alpha 进 destination-out。
//     转换后回读校验 alpha==luma 逐像素相等，runtime 面全链零 getImageData。
//   ③ 产出 manifest.runtime.json（同 14 字段模板；mask 路径/SHA=runtime 转换后产物，候选 SHA 留
//     candidateMaskSha256 溯源字段；status=runtime-release；增补 weaponPath/weaponSha256）
//     + SHA256SUMS 路径级清单 + config/hero-weapon-layer.ts
//   ④ 任一核验失败即非零退出（禁带病落库）
// 零依赖：node 内建 fs/crypto/path/zlib。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

function argOf(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const REPO = path.resolve(argOf('repo-root', process.cwd())); // 产物输出根（任务分支）
const CAND_ROOT = path.resolve(argOf('cand-root', REPO)); // 候选树根（只读，含 _trial_2026090{8,9}）
const OUT_REL = argOf('out', 'assets/characters/hero/weapon45');
const OUT = path.join(REPO, OUT_REL);
const CAND_REL = 'assets/_trial_20260909/t45_hero_weapon_left_derivation_seq232';
const CAND_DIR = path.join(CAND_ROOT, CAND_REL);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const fail = (msg) => {
  console.error(`[import] FAIL ${msg}`);
  process.exitCode = 1;
};

// ── 最小 PNG 编解码（ct0 灰度 bd8 解码 → ct6 RGBA bd8 编码；零依赖）──
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
/** 解码灰度 ct0 bd8 PNG（含 unfilter）；返回 {w,h,gray:Buffer} */
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
/** 灰度(luma=erase 强度) → RGBA(r=g=b=luma, a=luma)；回读校验逐像素相等后落库 */
function grayToRgbaPng(gray) {
  const { w, h } = gray;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4);
    raw[rowStart] = 0; // filter 0
    for (let x = 0; x < w; x++) {
      const v = gray.gray[y * w + x];
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colorType RGBA
  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
/** 转换 + 回读校验（alpha==luma 逐像素；失败即终止） */
function convertMaskToAlpha(buf, label) {
  const { w, h, gray } = decodeGrayPng(buf);
  const out = grayToRgbaPng({ w, h, gray });
  const back = (() => {
    let off = 8;
    const idat = [];
    let ww = 0;
    let hh = 0;
    while (off < out.length) {
      const len = out.readUInt32BE(off);
      const type = out.toString('ascii', off + 4, off + 8);
      const data = out.subarray(off + 8, off + 8 + len);
      if (type === 'IHDR') {
        ww = data.readUInt32BE(0);
        hh = data.readUInt32BE(4);
      } else if (type === 'IDAT') idat.push(data);
      off += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    return { w: ww, h: hh, raw };
  })();
  let mismatches = 0;
  for (let y = 0; y < back.h; y++) {
    for (let x = 0; x < back.w; x++) {
      const v = gray[y * back.w + x];
      const a = back.raw[y * (1 + back.w * 4) + 1 + x * 4 + 3];
      if (a !== v) mismatches++;
    }
  }
  if (mismatches > 0) throw new Error(`${label}: 蒙版转换回读校验失败（${mismatches} 像素 alpha≠luma）`);
  if (w !== 240 || h !== 320) throw new Error(`${label}: 蒙版尺寸 ${w}x${h}≠240x320`);
  return out;
}

/** 身体帧路径 → runtime 文件 stem（battle_idle_right / walk_right_1 / atk_rightup_2 …） */
const stemOf = (bodyFrame) => path.basename(bodyFrame).replace(/\.png$/, '');

const manifest = JSON.parse(fs.readFileSync(path.join(CAND_DIR, 'manifest-26rows-seq232.json'), 'utf8'));
if (!Array.isArray(manifest.rows) || manifest.rows.length !== 26) fail(`候选行数 ${manifest.rows?.length}≠26`);
const qaById = new Map((manifest.qaSummary ?? []).map((q) => [q.frameId, q]));

// 候选树内路径解析（_trial_20260908/09 均相对候选根）；身体帧以输出根（任务分支）为准=交付物
const repoPath = (p) => path.join(CAND_ROOT, p);
const outRepoPath = (p) => path.join(REPO, p);

const outRows = [];
const copied = [];
for (const row of manifest.rows) {
  const stem = stemOf(row.bodyFrame);
  const isLeft = row.frameId.endsWith('_left');
  const rightId = isLeft ? row.frameId.slice(0, -'_left'.length) : row.frameId;
  const qa = qaById.get(row.frameId);
  if (!qa) { fail(`${row.frameId}: qaSummary 缺行`); continue; }
  // 剑层源：左=台账 derivedWeaponPath；右=左行 derivedFromWeapon（同一次定位的右源成品）
  const weaponSrcRel = isLeft ? qa.derivedWeaponPath : qaById.get(`${rightId}_left`)?.derivedFromWeapon;
  if (!weaponSrcRel) { fail(`${row.frameId}: 剑层源路径缺失`); continue; }
  const occl = row['occlusionMaskPath+occlusionMaskSha256'];
  const hasMaskFile = occl && occl.path !== 'none';
  // ① SHA 核验
  const wBuf = fs.readFileSync(repoPath(weaponSrcRel));
  const wSha = sha256(wBuf);
  if (isLeft && qa.weaponSha256 && qa.weaponSha256 !== wSha) {
    fail(`${row.frameId}: 左剑 SHA≠台账（${wSha.slice(0, 12)}≠${qa.weaponSha256.slice(0, 12)}）`);
  }
  let mSha = null;
  let maskBuf = null;
  let candidateMaskSha = null;
  if (hasMaskFile) {
    candidateMaskSha = occl.sha256; // 候选灰度蒙版 SHA（溯源）
    mSha = sha256(fs.readFileSync(repoPath(occl.path)));
    if (occl.sha256 !== mSha) fail(`${row.frameId}: mask SHA≠manifest（${mSha.slice(0, 12)}≠${occl.sha256.slice(0, 12)}）`);
    // 灰度→alpha 机械转换（回读校验后落库；runtime 面零 getImageData——见文件头②'）
    try {
      maskBuf = convertMaskToAlpha(fs.readFileSync(repoPath(occl.path)), row.frameId);
    } catch (e) {
      fail(`${row.frameId}: 蒙版转换失败（${e.message}）`);
    }
  }
  const bodyAbs = outRepoPath(row.bodyFrame);
  if (!fs.existsSync(bodyAbs)) { fail(`${row.frameId}: 身体帧缺失 ${row.bodyFrame}`); continue; }
  const bSha = sha256(fs.readFileSync(bodyAbs));
  if (bSha !== row.runtimeBodySha256) fail(`${row.frameId}: runtime 身体 SHA≠manifest`);
  if (row.bodyCorrection === 'none' && row.candidateBodySha256 !== row.runtimeBodySha256) {
    fail(`${row.frameId}: bodyCorrection=none 但 candidate/runtime 身体 SHA 不等`);
  }
  // ② runtime 文件名（剑层与身体帧 stem 一一对应；mask 同 stem 归 masks/）
  const weaponName = `weapon_${stem}.png`;
  const maskName = `masks/mask_${stem}.png`;
  outRows.push({
    ...row,
    'occlusionMaskPath+occlusionMaskSha256': {
      path: hasMaskFile ? maskName : 'none',
      sha256: hasMaskFile ? sha256(maskBuf) : 'none', // runtime 蒙版（alpha 转换后）SHA
    },
    candidateMaskSha256: candidateMaskSha ?? 'none', // 候选灰度蒙版 SHA（溯源；runtime 消费面不用）
    weaponPath: weaponName,
    weaponSha256: wSha,
    status: 'runtime-release',
  });
  copied.push({ from: weaponSrcRel, to: weaponName, buf: wBuf });
  if (hasMaskFile && maskBuf) copied.push({ from: occl.path, to: maskName, buf: maskBuf });
}
if (process.exitCode) { console.error('[import] 核验有红，终止落库'); process.exit(1); }
if (outRows.length !== 26) { console.error(`[import] 行数 ${outRows.length}≠26，终止`); process.exit(1); }

// ③ 落库（写 buffer：剑层=候选逐字节；蒙版=转换后 alpha 蒙版；manifest.runtime.json/SHA256SUMS 同步产出）
fs.mkdirSync(path.join(OUT, 'masks'), { recursive: true });
for (const c of copied) fs.writeFileSync(path.join(OUT, c.to), c.buf);

const runtimeManifest = {
  schema: 'hero-weapon45-runtime (14 字段模板同候选 seq=231+232；mask 路径=runtime 相对；增补 weaponPath/weaponSha256/weaponCandidatePath)',
  generatedBy: 'tools/import_hero_weapon_layer.mjs from 候选 manifest-26rows-seq232.json（seq=231+seq=232；候选溯源只在导入回执，runtime 消费面零候选路径）',
  frameCount: 26,
  canvas: { w: 240, h: 320 },
  fields: manifest.fields,
  maskPolicyAlgorithms: {
    // 灰度蒙版语义（pilot subtract_mask：weapon_alpha -= mask_luma）→ runtime destination-out（alpha=luma）。
    // 差异只在 maskSrc 文件本体，运行时算法唯一：body-alpha-tight-fist-roi（none=不合成）。
    'original_body_alpha_tight_fist_roi': 'body-alpha-tight-fist-roi',
    'original_body_alpha_tight_fist_polygon': 'body-alpha-tight-fist-roi',
    'original_body_alpha_precise_connected_fist': 'body-alpha-tight-fist-roi',
    'precise_original_body_alpha_fist_polygon': 'body-alpha-tight-fist-roi',
    'precise_original_body_alpha_fist': 'body-alpha-tight-fist-roi',
    'complete_fist_cutout_top_with_grip_window': 'body-alpha-tight-fist-roi',
    none: 'none',
  },
  rows: outRows,
};
const manifestOut = path.join(OUT, 'manifest.runtime.json');
fs.writeFileSync(manifestOut, JSON.stringify(runtimeManifest, null, 2) + '\n');

const sumsLines = [...copied].sort((a, b) => a.to.localeCompare(b.to)).map((c) => `${sha256(c.buf)}  ${c.to}`);
sumsLines.push(`${sha256(fs.readFileSync(manifestOut))}  manifest.runtime.json`);
fs.writeFileSync(path.join(OUT, 'SHA256SUMS'), sumsLines.join('\n') + '\n');

// ④ config/hero-weapon-layer.ts（生成；预检/单测锁与 manifest 双向一致）
const tsRow = (r) => {
  const occl = r['occlusionMaskPath+occlusionMaskSha256'];
  const consumed = r.maskPolicy !== 'none';
  const occlusion = consumed
    ? `{ kind: 'body-alpha-tight-fist-roi', maskSrc: '${OUT_REL}/${occl.path}', maskSha256: '${occl.sha256}' }`
    : `{ kind: 'none' }`;
  const g = r.gripPointPx;
  const f = r.fistCenterPx;
  return `  [
    '${r.bodyFrame}',
    {
      bodySrc: '${r.bodyFrame}',
      weaponSrc: '${OUT_REL}/${r.weaponPath}',
      weaponSha256: '${r.weaponSha256}',
      gripPointPx: [${g[0]}, ${g[1]}],
      fistCenterPx: [${f[0]}, ${f[1]}],
      angleDeg: ${r.angleDeg},
      layerOrder: '${r.layerOrder}',
      occlusion: ${occlusion},
    },
  ],`;
};
const ts = `// T28 · hero 武器层配置（由 tools/import_hero_weapon_layer.mjs 生成——勿手改；源=候选 manifest-26rows-seq232，
// 运行时契约=assets/characters/hero/weapon45/manifest.runtime.json，预检 tools/preflight_hero_weapon_layer.mjs 双向锁）。
// 铁律（《主角武器层接线实施方案》§1/§3）：剑层 PNG 已在 240×320 画布内完成定位/角度——与身体帧同 left/top/w/h
// 叠画，零运行时旋转；gripPointPx/fistCenterPx/angleDeg 是预检与回归的契约数据，非运行时变换参数。
// 键=spriteKey → bodySrc（身体帧完整路径为稳定键，非 actor.id/facing/帧序猜测）；本卡仅 hero 有条目，
// NPC/敌方条目须后续需求卡授权。layerOrder：weapon_front=剑层绘于身体之上（有遮挡时先离屏挖拳孔）、
// body_front=剑层绘于身体之下（候选 manifest 既有值，帧数据如 frame05 idle_rightup）。jump/die 显式无武器。

export type WeaponLayerOrder = 'weapon_front' | 'body_front';

/** maskPolicy 枚举化（方案 §3 裁决）：资源契约非逐帧脚本——候选 manifest 六种拳区蒙版策略
 * （tight_fist_roi/tight_fist_polygon/precise_connected_fist/fist_polygon/fist/complete_fist_cutout）
 * 运行时算法同构：destination-out 按 alpha 挖拳孔（蒙版已由导入脚本机械转换为 alpha=候选灰度 luma，
 * 运行时全链零 getImageData）；每帧差异只由 maskSrc 表示；禁字符串自由发挥，新遮挡算法先扩枚举和预检再由新需求卡启用。 */
export type WeaponOcclusion =
  | { kind: 'none' }
  | { kind: 'body-alpha-tight-fist-roi'; maskSrc: string; maskSha256: string };

export interface WeaponLayerFrame {
  bodySrc: string; // 以 body frame 完整路径作稳定键
  weaponSrc: string; // 正式 assets/characters/hero/weapon45 路径
  weaponSha256: string;
  gripPointPx: readonly [number, number];
  fistCenterPx: readonly [number, number];
  angleDeg: number; // 预检/回归元数据，本批不作运行时旋转
  layerOrder: WeaponLayerOrder;
  occlusion: WeaponOcclusion;
}

export type WeaponLayerProfile = Readonly<Record<string, ReadonlyMap<string, WeaponLayerFrame>>>;

const HERO_WEAPON_FRAMES: ReadonlyMap<string, WeaponLayerFrame> = new Map<string, WeaponLayerFrame>([
${outRows.map(tsRow).join('\n')}
]);

export const WEAPON_LAYER_PROFILES: WeaponLayerProfile = {
  hero: HERO_WEAPON_FRAMES,
};
`;
const cfgRel = 'config/hero-weapon-layer.ts';
fs.writeFileSync(path.join(REPO, cfgRel), ts);

// ⑤ 输出 26 行导入表
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad('frameId', 14)} ${pad('bodyFrame', 44)} ${pad('weapon', 34)} ${pad('mask', 6)} ok`);
for (const r of outRows) {
  const m = r['occlusionMaskPath+occlusionMaskSha256'];
  console.log(
    `${pad(r.frameId, 14)} ${pad(path.basename(r.bodyFrame), 44)} ${pad(r.weaponPath, 34)} ${pad(r.maskPolicy === 'none' ? '-' : 'Y', 6)} ${r.maskPolicy === 'none' || m.path !== 'none' ? 'PASS' : 'FAIL'}`,
  );
}
console.log(`\n[import] 26 剑层 + ${copied.filter((c) => c.to.startsWith('masks/')).length} masks + manifest.runtime.json + SHA256SUMS → ${OUT_REL}`);
console.log(`[import] config 生成 → ${cfgRel}（WEAPON_LAYER_PROFILES 仅 hero 条目）`);
