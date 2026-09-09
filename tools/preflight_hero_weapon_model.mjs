// ═══ T29 · hero 武器模型 preflight（方案 v2.1 §3；production 面零候选引用）═══
// 检查对象（默认正式路径，全仓根相对）：
//   assets/characters/hero/weapon45/models/hero_sword_model_{right,left}.png + models/manifest.json
//   assets/characters/hero/weapon45/manifest.runtime.v2.json（48 行 HeroWeaponRuntimeRow）
//   assets/characters/hero/weapon45/masks/*.png + SHA256SUMS
// 检查项（§3.1-5）：
//   1) 48 行 frameId/bodyFrame 唯一；sourceLedger 来源 SHA 可追溯；左右方向只关联对应模型
//   2) 两 model 88×80 RGBA、SHA 与 models/manifest.json 一致、alpha 不为空、模型握点在画布内（含握点像素不透明）
//   3) 每行 gripPointPx/fistCenterPx/angleDeg/layerOrder/mask 路径与 SHA 合法；angleDefinition 统一
//      screen 坐标（0°=右/+Y 向下/顺时针正）
//   4) mask 存在时校验 RGBA（IHDR）/SHA/对应 bodyFrame（文件 stem==本行身体帧 stem——禁借邻帧）
//   5) 逐行旋转后 bounds（§4.1 几何）：越出身体矩形的行其 layer 必须严格大于身体矩形（越界能力；
//      禁角色矩形 clip 的机器面），且按三档 preview 主画布推演不得越出画布
// 负例（--self-test-negative）：错模型关联/错 SHA/角色矩形 clip 三变异必须全部检出（检出=正常退出 0，
// 有负例漏检=非零退出）；正常运行任一红=非零退出。预检不做 getImageData 级逐像素 SHA（运行时红线）；
// 失败策略=报告全量红项后一次性退出 1。
// 零依赖：node 内建 fs/crypto/path/zlib。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(argOf('repo-root', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')));
function argOf(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const WEAPON45 = 'assets/characters/hero/weapon45';
const PREVIEWS = (argOf('preview', '375x667,560x700,900x560')).split(',').map((s) => {
  const [w, h] = s.split('x').map(Number);
  return { w, h, tag: s };
});
const SELF_NEG = process.argv.includes('--self-test-negative');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const failures = [];
const red = (msg) => failures.push(msg);

// ── 最小 PNG 解码（ct6 RGBA bd8 / ct0 灰度 bd8；含 unfilter——零依赖）──
function parseIhdr(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bd: buf[24], ct: buf[25] };
}
function inflateIdat(buf) {
  let off = 8;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  return zlib.inflateSync(Buffer.concat(idat));
}
/** 通用 unfilter（bpp 字节/像素）；返回逐像素 Buffer（无 filter 字节） */
function unfilter(raw, w, h, bpp) {
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const row = raw.subarray(p, p + stride);
    p += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
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
  return { px: out, stride, bpp };
}
function decodeRgba(buf, label) {
  const ihdr = parseIhdr(buf);
  if (ihdr.bd !== 8 || ihdr.ct !== 6) throw new Error(`${label}: 非 8bit RGBA（bd${ihdr.bd}/ct${ihdr.ct}）`);
  const { px } = unfilter(inflateIdat(buf), ihdr.w, ihdr.h, 4);
  return { ...ihdr, px };
}

// ── §4.1 旋转几何（与 ui/battle-hex-render.ts rotatedSwordBounds 同式，独立复算为交叉校验）──
function rotatedBounds(angleDeg, mw, mh, gx, gy, fx, fy) {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const [cx, cy] of [[0, 0], [mw, 0], [0, mh], [mw, mh]]) {
    const dx = cx - gx;
    const dy = cy - gy;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    x1 = Math.min(x1, rx);
    x2 = Math.max(x2, rx);
    y1 = Math.min(y1, ry);
    y2 = Math.max(y2, ry);
  }
  return { x1: fx + x1, y1: fy + y1, x2: fx + x2, y2: fy + y2 };
}
function layerRectOf(b, bodyW = 240, bodyH = 320, margin = 2) {
  const x = Math.min(0, b.x1) - margin;
  const y = Math.min(0, b.y1) - margin;
  return { x, y, w: Math.max(bodyW, b.x2) - x + margin, h: Math.max(bodyH, b.y2) - y + margin };
}

// ── preview 定尺参数机械解析（config/battle-hex.ts 唯一真值；找不到=红，禁硬编码兜底）──
function parsePreviewScale() {
  const src = fs.readFileSync(path.join(REPO, 'config/battle-hex.ts'), 'utf8');
  const grab = (re, name) => {
    const m = src.match(re);
    if (!m) red(`preview 定尺解析失败：config/battle-hex.ts 缺 ${name}（preflight 需与渲染同源）`);
    return m ? m[1] : null;
  };
  const tileW = Number(grab(/TILE_SPEC = \{[^}]*w:\s*([0-9.]+)/, 'TILE_SPEC.w'));
  const hRatio = Number(grab(/TILE_SPEC = \{[^}]*hRatio:\s*([0-9.]+)/, 'TILE_SPEC.hRatio'));
  const perTile = Number(grab(/heightPerTile:\s*([0-9.]+)/, 'PIECE.heightPerTile'));
  const baselineRaw = grab(/feetBaselineRatio:\s*([0-9]+\s*\/\s*[0-9]+)/, 'PIECE.feetBaselineRatio');
  if (baselineRaw === null) return { pieceH: NaN, baseline: NaN };
  const [bn, bd] = baselineRaw.split('/').map((s) => Number(s.trim()));
  const pieceH = tileW * hRatio * perTile; // 渲染高=压扁格高×系数（PIECE 定尺接口）
  return { pieceH, baseline: bn / bd };
}

// ═══ 主检查 ═══
function runChecks(mutate) {
  // mutate：负例注入点（'model'=左行关联翻右模 / 'sha'=模型 SHA 篡改 / 'clip'=越界行压回身体矩形）
  const f = [];
  const read = (rel) => fs.readFileSync(path.join(REPO, rel));
  const exists = (rel) => fs.existsSync(path.join(REPO, rel));
  const mut = mutate ? { kind: mutate } : null;

  // ② 模型（models/manifest.json 为模型元数据唯一出处）
  const modelsManifest = JSON.parse(read(`${WEAPON45}/models/manifest.json`).toString('utf8'));
  const modelMetaOf = modelsManifest.models;
  for (const key of ['hero-sword-right', 'hero-sword-left']) {
    const meta = modelMetaOf[key];
    if (!meta) {
      f.push(`models/manifest.json 缺 ${key}`);
      continue;
    }
    if (meta.angleDefinition !== 'screen-clockwise-positive-y-down') {
      f.push(`${key}: angleDefinition 非屏幕顺时针口径（§3.3）`);
    }
    const rel = meta.src;
    if (!exists(rel)) {
      f.push(`${key}: 模型缺失 ${rel}`);
      continue;
    }
    const buf = read(rel);
    if (sha256(buf) !== meta.sha256) f.push(`${key}: 模型 SHA≠models/manifest.json`);
    const ihdr = parseIhdr(buf);
    if (ihdr.w !== 88 || ihdr.h !== 80) f.push(`${key}: 尺寸 ${ihdr.w}x${ihdr.h}≠88x80`);
    if (ihdr.ct !== 6) f.push(`${key}: 非 RGBA（ct${ihdr.ct}）`);
    try {
      const img = decodeRgba(buf, key);
      let transparent = 0;
      let opaque = 0;
      for (let i = 3; i < img.px.length; i += 4) {
        if (img.px[i] === 0) transparent++;
        else opaque++;
      }
      if (opaque === 0) f.push(`${key}: alpha 全空（无可见像素）`);
      if (transparent === 0) f.push(`${key}: alpha 全不透明（非带透明底剑模）`);
      const [gx, gy] = meta.gripPointModelPx;
      if (!(gx >= 0 && gx < ihdr.w && gy >= 0 && gy < ihdr.h)) {
        f.push(`${key}: 握点 [${gx},${gy}] 不在画布内`);
      } else if (img.px[(gy * ihdr.w + gx) * 4 + 3] === 0) {
        f.push(`${key}: 握点像素全透明（旋转锚无实体）`);
      }
    } catch (e) {
      f.push(e.message);
    }
  }

  // ①/③ 标定行
  const manifest = JSON.parse(read(`${WEAPON45}/manifest.runtime.v2.json`).toString('utf8'));
  if (mut?.kind === 'sha') {
    // 负例：模型 SHA 篡改（元数据层，等价于文件被换而台账未更新）
    modelMetaOf['hero-sword-right'] = { ...modelMetaOf['hero-sword-right'], sha256: '0'.repeat(64) };
  }
  if (mut?.kind === 'model') {
    // 负例：左向行关联右模（方向-模型关联校验的对象）
    const firstLeft = manifest.rows.find((x) => x.weaponModelKey === 'hero-sword-left');
    if (firstLeft) firstLeft.weaponModelKey = 'hero-sword-right';
  }
  if (manifest.frameCount !== 48 || manifest.rows.length !== 48) f.push(`行数 ${manifest.rows?.length}≠48`);
  if (manifest.angleDefinition !== 'screen-clockwise-positive-y-down') f.push('manifest.angleDefinition 非屏幕顺时针口径');
  const ledger = manifest.sourceLedger ?? {};
  for (const k of ['unifiedManifest', 'firstBatch26', 'secondBatch22', 'modelManifest']) {
    if (!ledger[k] || !/^[0-9a-f]{64}$/.test(ledger[k]?.sha256 ?? '')) f.push(`sourceLedger.${k} 缺失或 SHA 非法（来源不可追溯 §3.1）`);
  }
  const ids = new Set();
  const bodies = new Set();
  const exceedRows = [];
  const boundsTable = [];
  for (const r of manifest.rows) {
    const id = r.frameId;
    if (ids.has(id)) f.push(`frameId 重复 ${id}`);
    if (bodies.has(r.bodyFrame)) f.push(`bodyFrame 重复 ${r.bodyFrame}`);
    ids.add(id);
    bodies.add(r.bodyFrame);
    if (r.status !== 'runtime-release') f.push(`${id}: status≠runtime-release`);
    // 左右模型关联（§3.1：左右方向只能关联对应模型）
    const stem = path.basename(r.bodyFrame, '.png');
    const m = stem.match(/_(right|rightup|rightdown|left|leftup|leftdown)(_\d+)?$/);
    if (!m) {
      f.push(`${id}: 身体帧 ${stem} 无法解析六向 facing`);
      continue;
    }
    const wantKey = m[1].startsWith('left') ? 'hero-sword-left' : 'hero-sword-right';
    if (r.weaponModelKey !== wantKey) f.push(`${id}: 模型关联错（${r.weaponModelKey}≠${wantKey}，facing=${m[1]}）`);
    if (r.frameId.endsWith('_left') !== (wantKey === 'hero-sword-left')) f.push(`${id}: frameId 左右后缀与 facing 矛盾`);
    if (r.modelSha256 !== modelMetaOf[wantKey]?.sha256) f.push(`${id}: modelSha256≠models/manifest.json[${wantKey}]`);
    // ③ 标定合法性
    const [gpx, gpy] = r.gripPointPx ?? [];
    const [fpx, fpy] = r.fistCenterPx ?? [];
    if (![gpx, gpy, fpx, fpy].every((v) => typeof v === 'number' && v >= 0 && v <= 320)) {
      // 320 上限覆盖两轴最大画布维（y 轴 320；x 轴实限 240，越界另行红）
      f.push(`${id}: grip/fist 缺失或非数值`);
    } else if (gpx > 240 || fpx > 240) {
      f.push(`${id}: grip/fist 越出身体 240 宽画布`);
    }
    if (typeof r.angleDeg !== 'number' || r.angleDeg <= -180 || r.angleDeg >= 180) f.push(`${id}: angleDeg 非法`);
    if (r.layerOrder !== 'weapon_front' && r.layerOrder !== 'body_front') f.push(`${id}: layerOrder 非二值枚举`);
    // ④ mask
    if (r.maskPath) {
      if (!r.maskPath.startsWith('masks/') || r.maskPath.includes('_trial')) f.push(`${id}: maskPath 非正式 masks/ 路径`);
      const stemMask = `masks/mask_${stem}.png`;
      if (r.maskPath !== stemMask) f.push(`${id}: mask ${r.maskPath} 与本行 bodyFrame 不对应（禁借邻帧 §3.4）`);
      if (!exists(`${WEAPON45}/${r.maskPath}`)) f.push(`${id}: mask 文件缺失 ${r.maskPath}`);
      else {
        const mb = read(`${WEAPON45}/${r.maskPath}`);
        if (sha256(mb) !== r.maskSha256) f.push(`${id}: mask SHA≠行声明`);
        const mihdr = parseIhdr(mb);
        if (mihdr.w !== 240 || mihdr.h !== 320) f.push(`${id}: mask 尺寸 ${mihdr.w}x${mihdr.h}≠240x320`);
        if (mihdr.ct !== 6) f.push(`${id}: mask 非 RGBA（导入期灰度→alpha 转换产物应为 ct6）`);
      }
    } else if (r.maskSha256) {
      f.push(`${id}: 无 maskPath 却带 maskSha256`);
    }
    // ⑤ 旋转 bounds + 越界/画布推演
    const meta = modelMetaOf[r.weaponModelKey];
    const b = rotatedBounds(r.angleDeg, meta.canvasPx[0], meta.canvasPx[1], meta.gripPointModelPx[0], meta.gripPointModelPx[1], r.fistCenterPx[0], r.fistCenterPx[1]);
    const exceeds = b.x1 < 0 || b.y1 < 0 || b.x2 > 240 || b.y2 > 320;
    let rect = layerRectOf(b);
    if (mut?.kind === 'clip' && exceeds) rect = { x: 0, y: 0, w: 240, h: 320 }; // 负例：角色矩形 clip（越界行被压回身体矩形）
    if (exceeds) {
      exceedRows.push(id);
      const bigger = rect.w > 240 + 2 || rect.h > 320 + 2 || rect.x < 0 || rect.y < 0;
      if (!bigger) f.push(`${id}: 旋转 bounds 越出身体矩形但 layer 未扩展（越界能力被 clip，§3.5）`);
    }
    boundsTable.push({ id, body: stem, exceeds, rect });
  }
  if (exceedRows.length === 0) f.push('无任何行越出身体矩形——出招长剑越界能力未生效（§3.5/Leo 验收点）');

  // ⑤' preview 主画布推演（hero 居中=相机目标；定尺参数机械解析自 config/battle-hex.ts）
  const scale = parsePreviewScale();
  if (!Number.isNaN(scale.pieceH)) {
    const s = scale.pieceH / 320;
    for (const pv of PREVIEWS) {
      const bodyW = scale.pieceH * 0.75;
      const cx = pv.w / 2;
      const top = pv.h * 0.62 - scale.pieceH * scale.baseline;
      const left = cx - bodyW / 2;
      for (const bt of boundsTable) {
        const x1 = left + bt.rect.x * s;
        const y1 = top + bt.rect.y * s;
        const x2 = x1 + bt.rect.w * s;
        const y2 = y1 + bt.rect.h * s;
        if (x1 < 0 || y1 < 0 || x2 > pv.w || y2 > pv.h) {
          f.push(`${bt.id}: preview ${pv.tag} 主画布越界（层矩形 [${x1.toFixed(1)},${y1.toFixed(1)},${x2.toFixed(1)},${y2.toFixed(1)}]）`);
        }
      }
    }
  }

  // SHA256SUMS 全过
  const sumsRel = `${WEAPON45}/SHA256SUMS`;
  if (!exists(sumsRel)) f.push('SHA256SUMS 缺失');
  else {
    for (const line of read(sumsRel).toString('utf8').split('\n').filter(Boolean)) {
      const [hash, rel] = line.split(/\s+/);
      const abs = path.join(WEAPON45, rel);
      if (!exists(abs)) f.push(`SHA256SUMS 指向缺失文件 ${rel}`);
      else if (sha256(read(abs)) !== hash) f.push(`SHA256SUMS 不符 ${rel}`);
    }
  }
  return { f, exceedRows, boundsTable };
}

// ═══ 负例自检（§3.5：错模型/错 SHA/角色矩形 clip 必须非零检出）═══
function selfTestNegative() {
  const cases = [
    {
      name: 'neg-wrong-model（左行关联右模）',
      run: () => {
        const { f } = runChecks('model');
        return { detected: f.some((x) => x.includes('模型关联错')), detail: '全管线复检' };
      },
    },
    {
      name: 'neg-wrong-sha（模型 SHA 篡改）',
      run: () => {
        const { f } = runChecks('sha');
        return { detected: f.some((x) => x.includes('模型 SHA≠') || x.includes('modelSha256≠')), detail: '全管线复检' };
      },
    },
    {
      name: 'neg-body-clip（越界行被角色矩形 clip）',
      run: () => {
        const { f, exceedRows } = runChecks('clip');
        return { detected: f.some((x) => x.includes('越界能力被 clip')), detail: `越界行 ${exceedRows.length} 个全被压回 240×320` };
      },
    },
  ];
  let miss = 0;
  for (const c of cases) {
    const { detected, detail } = c.run();
    console.log(`${detected ? 'PASS' : 'FAIL'} ${c.name} · ${detail}`);
    if (!detected) miss++;
  }
  if (miss > 0) {
    console.error(`\n[preflight] 负例自检 FAIL ×${miss}（负例漏检=门失效）`);
    process.exit(1);
  }
  console.log(`\n[preflight] 负例自检 3/3 全部正确检出（错模型/错 SHA/角色矩形 clip 均判红）`);
  process.exit(0);
}

if (SELF_NEG) selfTestNegative();

const { f, exceedRows, boundsTable } = runChecks(null);

// ── 报告 ──
console.log(`[preflight] hero 武器模型（production 面零候选引用）`);
console.log(`  models: 2 · rows: ${boundsTable.length} · masks: ${fs.readdirSync(path.join(REPO, WEAPON45, 'masks')).length}`);
console.log(`  越出身体矩形的行（旋转 bounds 实测，Leo 验收点=出招长剑完整显示）: ${exceedRows.length}`);
for (const bt of boundsTable.filter((b) => b.exceeds)) {
  console.log(`    ${bt.id.padEnd(34)} layer=[${bt.rect.x},${bt.rect.y},${bt.rect.w},${bt.rect.h}]`);
}
const maxW = Math.max(...boundsTable.map((b) => b.rect.w));
const maxH = Math.max(...boundsTable.map((b) => b.rect.h));
console.log(`  layer 上限 ${maxW}×${maxH}（源空间）· preview 定尺 pieceH=${parsePreviewScale().pieceH.toFixed(1)}px`);
if (f.length > 0) {
  console.error(`\n[preflight] FAIL ×${f.length}`);
  for (const x of f) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`\n[preflight] PASS：48 行/双模型/蒙版/SHA256SUMS/越界与 preview 画布推演全绿`);
