#!/usr/bin/env node
// 重定向件「逐骨朝向残差」门检（09-12 新增，抓 BUG-13 那类缺陷的唯一硬判据）
//
// 原理：对每根映射骨，量「重定向件的世界 Y 轴」与「源动作同帧的世界 Y 轴」的夹角。
//       骨骼的 Y 轴是其真正的朝向（蒙皮跟着它走），两侧同口径 ⇒ 正确重定向下应恒为 0°。
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
    const T = j.anim.times;
    let i = 0; while (i < T.length - 1 && T[i+1] <= t) i++;
    i = Math.min(i, j.anim.matrices.length - 1);
    L = j.anim.matrices[i];
  }
  const pw = j.parent ? srcWorldAt(j.parent, t, cache) : new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const w = mul(pw, L); cache.set(j.id, w); return w;
}

const yax = m => [m[4], m[5], m[6]];
const ang = (a, b) => { const d = (a[0]*b[0]+a[1]*b[1]+a[2]*b[2]) / ((Math.hypot(...a)||1) * (Math.hypot(...b)||1));
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI; };

const fps = RT.fps || 30;
const frames = frameArgs.length ? frameArgs.map(Number) : [0, Math.floor(RT.nFrames/2), Math.max(0, RT.nFrames-1)];

let worst = 0; const bad = [];
for (const f of frames) {
  const W = modelWorld(f);
  if (!W) continue;
  for (const [sm, tm] of Object.entries(MIXAMO_TO_MODEL)) {
    const mi = nameIdx[tm], sj = byName[sm];
    if (mi === undefined || !sj) continue;
    const d = ang(yax(W[mi]), yax(srcWorldAt(sj, f / fps, new Map())));
    if (d > worst) worst = d;
    if (d > TOL) bad.push({ f, bone: `${sm}->${tm}`, deg: d });
  }
}
console.log(`模型: ${glbPath}`);
console.log(`源  : ${daePath}`);
console.log(`重定向: ${rtPath}  (fps=${fps}, nFrames=${RT.nFrames})`);
console.log(`检查帧: ${frames.join(', ')}   映射骨: ${Object.keys(MIXAMO_TO_MODEL).length} 根   容差: ${TOL}°`);
if (bad.length) {
  console.log(`\n❌ 未过门：${bad.length} 项超容差（最大 ${worst.toFixed(2)}°）`);
  for (const b of bad.sort((x, y) => y.deg - x.deg).slice(0, 20))
    console.log(`   f=${b.f}  ${b.bone.padEnd(26)} ${b.deg.toFixed(2)}°`);
  process.exit(1);
} else {
  console.log(`\n✅ 过门：全部骨骼朝向残差 ≤ ${TOL}°（实测最大 ${worst.toFixed(3)}°）`);
  process.exit(0);
}
