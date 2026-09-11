#!/usr/bin/env node
// 源动作站姿量化（09-12 立，配套产线手册 §1.3「选源动作必须量源自己的数」）
//
// 目的：下单 Mixamo 动作前，用数（而不是名字/感觉）判断这个源的站姿是否合用。
// 实测教训：名字最像的 `Standing Idle` 其实是屈膝错步站姿（膝弯 48°/57°，左右差 9.2°），
//           名字最不像的 `Orc Idle` 才是直立站姿（膝弯 31.9°/30.5°，左右差 1.4°）。
//
// 用法：node tools/glb2d/qa_source_stance.mjs <动作.dae>
// 判据（直立站立应满足）：
//   ① 膝弯 ≤ ~35°（Tripo 模型 rest 本身有弯度，30~35° 渲出来已接近 rest）
//   ② 左右膝弯差 ≤ ~3°
//   ③ 源髋高不异常低（越低＝蹲得越深）
//   ④ 渲染后脚底 y 接近 rest 基准线 307（差 ≤5px 为佳）——最终判据，需渲染后另量
import fs from 'fs';
import { parseCollada } from './collada2anim.mjs';

const dae = process.argv[2];
if (!dae) { console.error('用法: node qa_source_stance.mjs <动作.dae>'); process.exit(2); }

const C = parseCollada(dae);
const byName = {}; for (const j of C.joints) byName[j.clean] = j;
function mul(a, b) { const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k]; o[c*4+r] = s; } return o; }
const xf = (m, p) => [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
function world(j, t, cache) {
  if (cache.has(j.id)) return cache.get(j.id);
  let L = j.rest;
  if (j.anim) { const T = j.anim.times;
    let i = 0; while (i < T.length - 1 && T[i+1] <= t) i++;
    L = j.anim.matrices[Math.min(i, j.anim.matrices.length - 1)]; }
  const pw = j.parent ? world(j.parent, t, cache) : new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const w = mul(pw, L); cache.set(j.id, w); return w;
}
const n3 = v => { const L = Math.hypot(...v) || 1; return v.map(x => x / L); };
const clampDot = d => Math.max(-1, Math.min(1, d));

function leg(side, t) {
  const c = new Map();
  const P = n => xf(world(byName[side + n], t, c), [0,0,0]);
  const hip = P('UpLeg'), knee = P('Leg'), ankle = P('Foot');
  const thigh = n3([knee[0]-hip[0], knee[1]-hip[1], knee[2]-hip[2]]);
  const calf  = n3([ankle[0]-knee[0], ankle[1]-knee[1], ankle[2]-knee[2]]);
  return {
    kneeBend: Math.acos(clampDot(thigh[0]*calf[0]+thigh[1]*calf[1]+thigh[2]*calf[2])) * 180/Math.PI,
    thighFromVert: Math.acos(clampDot(-thigh[1])) * 180/Math.PI,
    hipY: hip[1],
    ankleY: ankle[1],
  };
}

// 采样整段，取均值 + 极差（避免只看某一帧走运）
let dur = 0;
for (const j of C.joints) if (j.anim) dur = Math.max(dur, j.anim.times[j.anim.times.length - 1]);
const samples = [];
const N = 12;
for (let i = 0; i < N; i++) samples.push(dur * i / N);

const L = samples.map(t => leg('Left', t)), R = samples.map(t => leg('Right', t));
const avg = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
const span = (a, k) => Math.max(...a.map(x => x[k])) - Math.min(...a.map(x => x[k]));

const kL = avg(L, 'kneeBend'), kR = avg(R, 'kneeBend');
const tL = avg(L, 'thighFromVert'), tR = avg(R, 'thighFromVert');
const hipY = (avg(L, 'hipY') + avg(R, 'hipY')) / 2;

console.log(`源动作: ${dae}`);
console.log(`时长 ${dur.toFixed(3)}s   采样 ${N} 点`);
console.log('');
console.log(`  膝弯       左 ${kL.toFixed(2)}°  右 ${kR.toFixed(2)}°   左右差 ${Math.abs(kL-kR).toFixed(2)}°   整段波动 ${Math.max(span(L,'kneeBend'), span(R,'kneeBend')).toFixed(2)}°`);
console.log(`  大腿离垂直  左 ${tL.toFixed(2)}°  右 ${tR.toFixed(2)}°`);
console.log(`  髋高       ${hipY.toFixed(2)}   踝高 ${((avg(L,'ankleY')+avg(R,'ankleY'))/2).toFixed(2)}   髋−踝 ${(hipY - (avg(L,'ankleY')+avg(R,'ankleY'))/2).toFixed(2)}`);
console.log('');
const fails = [];
if (kL > 35 || kR > 35) fails.push(`膝弯 ${Math.max(kL,kR).toFixed(1)}° > 35°（蹲太深）`);
if (Math.abs(kL - kR) > 3) fails.push(`左右膝弯差 ${Math.abs(kL-kR).toFixed(1)}° > 3°（歪着站）`);
if (fails.length) {
  console.log(`❌ 三判据未过（仅供参考，最终看渲染后脚底 y）：`);
  for (const f of fails) console.log(`   · ${f}`);
} else {
  console.log(`✅ 三判据通过（膝弯 ≤35°、左右差 ≤3°）。仍需渲染后量脚底 y 与 rest 基准线 307 的差（≤5px 为佳）。`);
}
console.log('');
console.log('参照：Orc Idle 膝弯 31.9/30.5（差 1.4）✅ ｜ Standing Idle 48.0/57.2（差 9.2）❌');
