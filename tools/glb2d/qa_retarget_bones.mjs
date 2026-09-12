#!/usr/bin/env node
// 重定向件「逐骨朝向残差」门检（09-12 新增，抓 BUG-13 那类缺陷的唯一硬判据）
//
// 原理：对每根映射骨，量「重定向件的骨骼方向」与「源动作同帧的骨骼方向」的夹角。
//       方向的定义（与 collada2anim 的 aim4 同口径）：
//         · 骨骼有子骨骼且子骨骼位移非零 → 用「子骨骼位置 − 自身位置」（＝骨骼真正的段，
//           关节位置才落得对；源 Mixamo 的 Neck 骨轴与这段差 16.92°，若改用 Y 轴会多偏 16.9°）
//         · 否则（叶子骨 / 子骨骼与自身同位置）→ 用「骨骼自身世界 Y 轴」（＝骨骼朝向）
//       两侧必须用**同一个**定义 ⇒ 正确重定向下应恒为 0°。
//
// 为什么必须有这条：帧 0 校验只比「源自己 rest vs 源自己帧 0」（永远相等，与跨骨架映射无关）；
// 火柴人对比图看得是整体形状，头被拧 25° 在图上会被躯干四肢的大位移掩盖。
// BUG-13（aim2 两侧参照不同口径 → Head 恒定多拧 25.78°）两条旧门检都全过。
//
// 用法：
//   node tools/glb2d/qa_retarget_bones.mjs <模型.glb> <源动作.dae> <重定向.json> [帧号...]
// 退出码：全过 = 0；任一骨 > 容差 = 1（可直接当门调用）
import fs from 'fs';
import { parseGLB } from './glb.mjs';
import { parseCollada, MIXAMO_TO_MODEL } from './collada2anim.mjs';

const TOL = 0.5;    // 度（真实缺陷量级 16~72°；0.06° 是四元数往返噪声，不该当失败）
const [glbPath, daePath, rtPath, ...frameArgs] = process.argv.slice(2);
if (!glbPath || !daePath || !rtPath) {
  console.error('用法: node qa_retarget_bones.mjs <模型.glb> <源动作.dae> <重定向.json> [帧号...]');
  process.exit(2);
}
const RT = JSON.parse(fs.readFileSync(rtPath, 'utf8'));

// ---- 模型侧 ----
const { json } = parseGLB(glbPath);
const nodes = json.nodes;
const nameIdx = {}; nodes.forEach((n, i) => { if (n.name) nameIdx[n.name] = i; });
const parent = new Array(nodes.length).fill(-1);
nodes.forEach((n, i) => (n.children || []).forEach(c => parent[c] = i));
function mul(a, b) { const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k]; o[c*4+r] = s; } return o; }
function fromTRS(t, q, s) { const [x,y,z,w] = q; const x2=x+x,y2=y+y,z2=z+z;
  const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return new Float64Array([(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,
    (xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,
    (xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0, t[0],t[1],t[2],1]); }
const restTRS = nodes.map(n => ({ t: n.translation || [0,0,0], q: n.rotation || [0,0,0,1], s: n.scale || [1,1,1] }));
const order = []; const seen = new Array(nodes.length).fill(false);
(function () { const go = i => { if (seen[i]) return; if (parent[i] >= 0) go(parent[i]); seen[i] = true; order.push(i); };
  for (let i = 0; i < nodes.length; i++) go(i); })();
function modelWorld(f) {
  const s = restTRS.map(x => ({ t: [...x.t], q: [...x.q], s: [...x.s] }));
  for (const [bn, tr] of Object.entries(RT.boneTracks || {})) {
    const ni = nameIdx[bn]; if (ni === undefined || !tr[f]) continue; s[ni].q = [...tr[f]];
  }
  if (RT.rootTrack && RT.rootTrack[f]) { const ri = nameIdx['Root'];
    if (ri !== undefined) { const rb = restTRS[ri].t, d = RT.rootTrack[f]; s[ri].t = [rb[0]+d[0], rb[1]+d[1], rb[2]+d[2]]; } }
  const W = new Array(nodes.length);
  for (const i of order) { const L = fromTRS(s[i].t, s[i].q, s[i].s); W[i] = parent[i] < 0 ? L : mul(W[parent[i]], L); }
  return W;
}

// ---- 源侧（与 collada2anim 的 sampleMat 同口径：nearest 索引 + 边界钳制）----
const C = parseCollada(daePath);
const byName = {}; for (const j of C.joints) byName[j.clean] = j;
function srcWorldAt(j, t, cache) {
  if (cache.has(j.id)) return cache.get(j.id);
  let L = j.rest;
  if (j.anim) {
    // ★ 索引映射必须与 collada2anim 的 sampleMat 完全一致（nearest + 归一化），
    //   否则边界帧会落到相邻采样上 → 假报 1° 级残差（实测踩过：DAE 时间数组有
    //   0.033333/0.033334 的舍入差，floor 查找会少取一帧）
    const T = j.anim.times;
    const idx = Math.round(t * (T.length - 1) / (T[T.length - 1] || 1));
    L = j.anim.matrices[Math.min(T.length - 1, Math.max(0, idx))];
  }
  const pw = j.parent ? srcWorldAt(j.parent, t, cache) : new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  let w = mul(pw, L);
  // ★ 源朝向对齐 Q（与 collada2anim 同口径）：**只作用在根节点**
  //   （我们的模型朝 −Z、Mixamo 角色朝 +Z；不转 180° 则源的右手会落到角色左手）
  if (!j.parent && !process.argv.includes('--no-src-yaw')) {
    const o = new Float64Array(w);
    for (let c = 0; c < 4; c++) { o[c*4+0] = -w[c*4+0]; o[c*4+2] = -w[c*4+2]; }
    w = o;
  }
  cache.set(j.id, w); return w;
}

const yax = m => [m[4], m[5], m[6]];
const off = (m1, m2) => [m2[12]-m1[12], m2[13]-m1[13], m2[14]-m1[14]];
const len = v => Math.hypot(v[0], v[1], v[2]);
// 与 aim4 同口径：有非退化子骨骼位移就用位移方向，否则用自身 Y 轴
function dirOf(W, i, childOf) {
  const c = childOf[i];
  if (c !== undefined) { const d = off(W[i], W[c]); if (len(d) > 1e-6) return d; }
  return yax(W[i]);
}
const ang = (a, b) => { const d = (a[0]*b[0]+a[1]*b[1]+a[2]*b[2]) / ((Math.hypot(...a)||1) * (Math.hypot(...b)||1));
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI; };

const fps = RT.fps || 30;
const frames = frameArgs.length ? frameArgs.map(Number) : [0, Math.floor(RT.nFrames/2), Math.max(0, RT.nFrames-1)];

// 模型侧 / 源侧的「子骨骼」表
const TGT_CHILD = { Hip:'Waist', Waist:'Spine01', Spine01:'Spine02', Spine02:'NeckTwist01', NeckTwist01:'Head',
  L_Clavicle:'L_Upperarm', L_Upperarm:'L_Forearm', L_Forearm:'L_Hand',
  R_Clavicle:'R_Upperarm', R_Upperarm:'R_Forearm', R_Forearm:'R_Hand',
  L_Thigh:'L_Calf', L_Calf:'L_Foot', L_Foot:'L_ToeBase',
  R_Thigh:'R_Calf', R_Calf:'R_Foot', R_Foot:'R_ToeBase' };
const tgtChildIdx = {};
for (const [k, v] of Object.entries(TGT_CHILD)) { const i = nameIdx[k], c = nameIdx[v]; if (i !== undefined && c !== undefined) tgtChildIdx[i] = c; }
const srcChildOf = {};
for (const j of C.joints) if (j.children && j.children.length) srcChildOf[j.clean] = j.children[0].clean;

let worst = 0; const bad = [];
for (const f of frames) {
  const W = modelWorld(f);
  if (!W) continue;
  for (const [sm, tm] of Object.entries(MIXAMO_TO_MODEL)) {
    const mi = nameIdx[tm], sj = byName[sm];
    if (mi === undefined || !sj) continue;

    // 两侧各自算「子骨骼位移」；只有**两侧都非退化**才用它（与 aim4 同口径）
    const tgtC = tgtChildIdx[mi];
    const dTgtOff = tgtC !== undefined ? off(W[mi], W[tgtC]) : null;
    const cName = srcChildOf[sm];
    const dSrcOff = cName && byName[cName] ? off(srcWorldAt(sj, f/fps, new Map()), srcWorldAt(byName[cName], f/fps, new Map())) : null;

    const tgtOk = dTgtOff && len(dTgtOff) > 1e-6;
    const srcOk = dSrcOff && len(dSrcOff) > 1e-6;
    const useChild = tgtOk && srcOk;

    const dTgt = useChild ? dTgtOff : yax(W[mi]);
    const dSrc = useChild ? dSrcOff : yax(srcWorldAt(sj, f/fps, new Map()));

    const d = ang(dTgt, dSrc);
    if (d > worst) worst = d;
    if (d > TOL) bad.push({ f, bone: `${sm}->${tm}`, deg: d, via: useChild ? '子骨骼位移' : 'Y轴' });
  }
}
console.log(`模型: ${glbPath}`);
console.log(`源  : ${daePath}`);
console.log(`重定向: ${rtPath}  (fps=${fps}, nFrames=${RT.nFrames})`);
console.log(`检查帧: ${frames.join(', ')}   映射骨: ${Object.keys(MIXAMO_TO_MODEL).length} 根   容差: ${TOL}°`);
if (bad.length) {
  console.log(`\n❌ 未过门：${bad.length} 项超容差（最大 ${worst.toFixed(2)}°）`);
  for (const b of bad.sort((x, y) => y.deg - x.deg).slice(0, 20))
    console.log(`   f=${b.f}  ${b.bone.padEnd(26)} ${b.deg.toFixed(2).padStart(7)}°  [口径: ${b.via}]`);
  process.exit(1);
} else {
  console.log(`\n✅ 过门：全部骨骼朝向残差 ≤ ${TOL}°（实测最大 ${worst.toFixed(3)}°）`);
  process.exit(0);
}
