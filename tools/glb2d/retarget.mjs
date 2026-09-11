#!/usr/bin/env node
// BVH → 模型骨骼动画 重定向器
//
// 用途：把免费动作库（CMU mocap 等）的 BVH 动作，套到 Tripo 生成的 GLB 模型上。
//       绕开「Tripo 动作库有限」这个瓶颈。
//
// 原理（标准骨骼重定向）：
//   1) BVH 的 rest pose 各骨骼旋转恒为 0，所以某帧的「世界旋转」即为相对 rest 的旋转增量 A(b,t)
//   2) 目标骨骼世界矩阵 W_tgt(b,t) = A(b,t) × W_rest(b)   （把 rest 姿态整体旋转一个增量）
//   3) 局部旋转 L(b,t) = W_tgt(parent)^-1 × W_tgt(b)，写回节点
//   4) 未映射的骨骼（扭转骨/手指）继承最近已映射祖先的增量，避免反向补偿
//
// 用法：
//   node retarget.mjs <model.glb> <input.bvh> <out.json> [--frames N] [--fps 30]
//                      [--start 0] [--root none|y|xz|all] [--scale auto|number]
//   node retarget.mjs <model.glb> --list      # 打印两侧骨骼名，供核对映射
import fs from 'fs';
import { parseGLB, readAccessor } from './glb.mjs';

// ————— CMU/标准 BVH 骨骼名 → 本模型骨骼名 —————
// 左侧/右侧/中轴全套；模型里没有的（手指）不列，保持 rest。
export const BVH_TO_MODEL = {
  Hips: 'Hip',
  LowerBack: 'Waist',
  Spine: 'Spine01',
  Spine1: 'Spine02',
  Neck: 'NeckTwist01',
  Neck1: 'NeckTwist02',
  Head: 'Head',
  LeftShoulder: 'L_Clavicle',
  LeftArm: 'L_Upperarm',
  LeftForeArm: 'L_Forearm',
  LeftHand: 'L_Hand',
  LeftUpLeg: 'L_Thigh',
  LeftLeg: 'L_Calf',
  LeftFoot: 'L_Foot',
  LeftToeBase: 'L_ToeBase',
  RightShoulder: 'R_Clavicle',
  RightArm: 'R_Upperarm',
  RightForeArm: 'R_Forearm',
  RightHand: 'R_Hand',
  RightUpLeg: 'R_Thigh',
  RightLeg: 'R_Calf',
  RightFoot: 'R_Foot',
  RightToeBase: 'R_ToeBase',
};

// ————— 4x4 列主序矩阵工具（与 glTF 一致）—————
const I4 = () => new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
function mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k];
    o[c*4+r] = s;
  }
  return o;
}
function fromTRS(t, q, s) {
  const [x,y,z,w] = q;
  const x2=x+x, y2=y+y, z2=z+z;
  const xx=x*x2, xy=x*y2, xz=x*z2, yy=y*y2, yz=y*z2, zz=z*z2, wx=w*x2, wy=w*y2, wz=w*z2;
  return new Float64Array([
    (1-(yy+zz))*s[0], (xy+wz)*s[0], (xz-wy)*s[0], 0,
    (xy-wz)*s[1], (1-(xx+zz))*s[1], (yz+wx)*s[1], 0,
    (xz+wy)*s[2], (yz-wx)*s[2], (1-(xx+yy))*s[2], 0,
    t[0], t[1], t[2], 1,
  ]);
}
function rotX(a){const c=Math.cos(a),s=Math.sin(a);return new Float64Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);}
function rotY(a){const c=Math.cos(a),s=Math.sin(a);return new Float64Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);}
function rotZ(a){const c=Math.cos(a),s=Math.sin(a);return new Float64Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]);}

/** 取 4x4 的旋转部分（正交化，容忍微小数值误差）并转回 4x4 */
function rotPart(m) {
  // 列向量归一化
  let c0=[m[0],m[1],m[2]], c1=[m[4],m[5],m[6]], c2=[m[8],m[9],m[10]];
  const n=v=>{const L=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/L,v[1]/L,v[2]/L];};
  c0=n(c0);
  // Gram-Schmidt
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const d01=dot(c0,c1);
  c1=n([c1[0]-c0[0]*d01, c1[1]-c0[1]*d01, c1[2]-c0[2]*d01]);
  c2=[c0[1]*c1[2]-c0[2]*c1[1], c0[2]*c1[0]-c0[0]*c1[2], c0[0]*c1[1]-c0[1]*c1[0]];
  return new Float64Array([c0[0],c0[1],c0[2],0, c1[0],c1[1],c1[2],0, c2[0],c2[1],c2[2],0, 0,0,0,1]);
}
function matToQuat(m) {
  const r=m;
  const tr = r[0]+r[5]+r[10];
  let x,y,z,w;
  if (tr > 0) { const s=Math.sqrt(tr+1)*2; w=0.25*s; x=(r[6]-r[9])/s; y=(r[8]-r[2])/s; z=(r[1]-r[4])/s; }
  else if (r[0]>r[5] && r[0]>r[10]) { const s=Math.sqrt(1+r[0]-r[5]-r[10])*2; w=(r[6]-r[9])/s; x=0.25*s; y=(r[4]+r[1])/s; z=(r[8]+r[2])/s; }
  else if (r[5]>r[10]) { const s=Math.sqrt(1+r[5]-r[0]-r[10])*2; w=(r[8]-r[2])/s; x=(r[4]+r[1])/s; y=0.25*s; z=(r[9]+r[6])/s; }
  else { const s=Math.sqrt(1+r[10]-r[0]-r[5])*2; w=(r[1]-r[4])/s; x=(r[8]+r[2])/s; y=(r[9]+r[6])/s; z=0.25*s; }
  const L=Math.hypot(x,y,z,w)||1;
  return [x/L,y/L,z/L,w/L];
}

// ————— BVH 解析 —————
export function parseBVH(text) {
  const hi = text.slice(0, text.indexOf('MOTION'));
  const lines = hi.split('\n').map(l => l.trim()).filter(Boolean);
  const joints = [];          // {name, parent, offset, channels}
  const stack = [];
  for (const ln of lines) {
    const mRoot = ln.match(/^(ROOT|JOINT|End Site)\s*(\w*)/);
    if (mRoot) {
      const kind = mRoot[1];
      if (kind === 'End Site') { stack.push({ __end: true }); continue; }
      const j = { name: mRoot[2] || mRoot[1], parent: stack.length ? stack[stack.length-1].__end ? (stack[stack.length-2]?.idx ?? -1) : stack[stack.length-1].idx : -1,
                  offset: [0,0,0], channels: [] };
      j.idx = joints.length;
      joints.push(j);
      stack.push(j);
      continue;
    }
    const mOff = ln.match(/^OFFSET\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)/);
    if (mOff) {
      const cur = stack[stack.length-1];
      if (cur && cur.__end) cur.offset = [+mOff[1],+mOff[2],+mOff[3]];
      else if (cur) cur.offset = [+mOff[1],+mOff[2],+mOff[3]];
      continue;
    }
    const mCh = ln.match(/^CHANNELS\s+(\d+)\s+(.*)$/);
    if (mCh) {
      const cur = stack[stack.length-1];
      if (cur && !cur.__end) cur.channels = mCh[2].trim().split(/\s+/);
      continue;
    }
    if (ln === '}') { stack.pop(); continue; }
  }
  // MOTION
  const mo = text.slice(text.indexOf('MOTION'));
  const mFrames = mo.match(/Frames:\s*(\d+)/);
  const mTime = mo.match(/Frame Time:\s*([\d.]+)/);
  const bodyStart = mo.indexOf('\n', mo.indexOf('Frame Time:'));
  const rows = mo.slice(bodyStart).trim().split('\n').map(l => l.trim().split(/\s+/).map(Number)).filter(r => r.length > 1);
  return { joints, frames: mFrames ? +mFrames[1] : rows.length, frameTime: mTime ? +mTime[1] : 1/30, rows };
}

function bvhJointWorld(joints, row, idx, cache) {
  if (cache[idx]) return cache[idx];
  const j = joints[idx];
  // 局部旋转：按 CHANNELS 中出现顺序连乘
  let M = I4();
  let ci = 0;
  // 该关节在 row 中的起始偏移
  const start = j.__chStart;
  for (const ch of j.channels) {
    const v = row[start + ci]; ci++;
    if (ch === 'Xrotation') M = mul(M, rotX(v * Math.PI/180));
    else if (ch === 'Yrotation') M = mul(M, rotY(v * Math.PI/180));
    else if (ch === 'Zrotation') M = mul(M, rotZ(v * Math.PI/180));
  }
  if (j.parent < 0) { cache[idx] = M; return M; }
  const P = bvhJointWorld(joints, row, j.parent, cache);
  cache[idx] = mul(P, M);
  return cache[idx];
}

// ————— 主流程 —————
function main() {
  const [modelPath, bvhPath, outPath] = process.argv.slice(2);
  const argv = process.argv.slice(2);
  const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i+1]; };

  const { json } = parseGLB(modelPath);
  const nodes = json.nodes;
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n,i) => (n.children||[]).forEach(c => parent[c] = i));

  if (argv.includes('--list')) {
    console.log('模型骨骼:');
    json.skins[0].joints.forEach(j => console.log('   ', nodes[j].name));
    if (bvhPath && bvhPath.endsWith('.bvh')) {
      const b = parseBVH(fs.readFileSync(bvhPath, 'utf8'));
      console.log('BVH 骨骼:');
      b.joints.forEach(j => console.log('   ', j.name));
    }
    console.log('\n当前映射:');
    for (const [k,v] of Object.entries(BVH_TO_MODEL)) console.log(`   ${k.padEnd(16)} -> ${v}`);
    return;
  }

  // 1) 计算每个 CHANNELS 在 row 中的起始下标
  const bvh = parseBVH(fs.readFileSync(bvhPath, 'utf8'));
  let off = 0;
  for (const j of bvh.joints) { j.__chStart = off; off += j.channels.length; }
  const rowLen = off;

  // 2) 目标骨骼：rest 世界矩阵
  const nameToIdx = {};
  nodes.forEach((n,i) => { if (n.name) nameToIdx[n.name] = i; });
  const restLocal = nodes.map(n => fromTRS(n.translation||[0,0,0], n.rotation||[0,0,0,1], n.scale||[1,1,1]));
  const restWorld = new Array(nodes.length);
  const worldOf = (i) => {
    if (restWorld[i]) return restWorld[i];
    restWorld[i] = parent[i] >= 0 ? mul(worldOf(parent[i]), restLocal[i]) : restLocal[i];
    return restWorld[i];
  };
  for (let i=0;i<nodes.length;i++) worldOf(i);

  // 3) 反向映射：模型骨骼名 → BVH 关节下标
  const modelToBvh = {};
  for (const [bk, mk] of Object.entries(BVH_TO_MODEL)) {
    const ji = bvh.joints.findIndex(j => j.name === bk);
    if (ji >= 0 && nameToIdx[mk] !== undefined) modelToBvh[nameToIdx[mk]] = ji;
  }
  const mappedModelBones = Object.keys(modelToBvh).map(Number);
  console.log(`映射成功 ${mappedModelBones.length} 根骨骼（共 ${json.skins[0].joints.length}）`);

  // 4) 每帧：算 BVH 世界旋转增量 → 目标世界 → 目标局部旋转
  const start = +flag('start', 0);
  const wanted = +flag('frames', 0);
  const fps = +flag('fps', 30);
  const srcFps = 1 / bvh.frameTime;
  const step = Math.max(1, Math.round(srcFps / fps));
  const avail = bvh.rows.length - start;
  const nFrames = wanted > 0 ? wanted : Math.floor(avail / step);
  const rootMode = flag('root', 'y');

  const out = { source: bvhPath, model: modelPath, boneNames: [], frames: [] };
  // 只输出被映射的骨骼 + 它们的后代（后代继承增量）
  const emit = new Set();
  for (const b of mappedModelBones) {
    emit.add(b);
    const stack = [...(nodes[b].children||[])];
    while (stack.length) { const c = stack.pop(); emit.add(c); stack.push(...(nodes[c].children||[])); }
  }
  out.boneNames = [...emit].map(i => nodes[i].name);

  // 源骨架 rest 髋高 & 目标 rest 髋高（用于根位移缩放）
  const hipsBvh = bvh.joints.find(j => j.name === 'Hips');
  const srcHipH = hipsBvh ? hipsBvh.offset[1] : 1;
  const hipModelIdx = nameToIdx['Hip'];
  const tgtHipH = hipModelIdx !== undefined ? (nodes[hipModelIdx].translation||[0,1,0])[1] : 1;
  const rootScale = (flag('scale','auto') === 'auto') ? (tgtHipH / Math.abs(srcHipH)) : +flag('scale','1');

  // 深度排序（父先于子），供增量传播与局部矩阵计算
  const depthOf = new Array(nodes.length).fill(0);
  {
    const calc = (i) => {
      if (depthOf[i] > 0 || parent[i] < 0) return depthOf[i];
      depthOf[i] = calc(parent[i]) + 1;
      return depthOf[i];
    };
    for (let i = 0; i < nodes.length; i++) calc(i);
  }
  const order = [...nodes.keys()].sort((a, b) => depthOf[a] - depthOf[b]);

  const framesMatrix = [];
  for (let f = 0; f < nFrames; f++) {
    const row = bvh.rows[start + f*step];
    if (!row || row.length < rowLen) break;
    const cache = {};
    // 每个目标骨骼：找其对应 BVH 关节的增量；未映射则继承父
    const delta = new Array(nodes.length).fill(null);
    for (const i of order) {
      const ji = modelToBvh[i];
      if (ji !== undefined) delta[i] = rotPart(bvhJointWorld(bvh.joints, row, ji, cache));
      else if (parent[i] >= 0 && delta[parent[i]]) delta[i] = delta[parent[i]];
      else delta[i] = I4();
    }
    // 世界 → 局部
    const W = new Array(nodes.length);
    for (const i of order) W[i] = mul(delta[i], restWorld[i]);
    const localOut = {};
    for (const i of emit) {
      const pw = parent[i] >= 0 ? W[parent[i]] : I4();
      // 取逆（纯旋转，转置即可）
      const inv = new Float64Array(16);
      inv[0]=pw[0];inv[1]=pw[4];inv[2]=pw[8];
      inv[4]=pw[1];inv[5]=pw[5];inv[6]=pw[9];
      inv[8]=pw[2];inv[9]=pw[6];inv[10]=pw[10];
      inv[15]=1;
      const L = mul(inv, W[i]);
      localOut[nodes[i].name] = matToQuat(L);
    }
    // 根位移
    let rootT = null;
    if (rootMode !== 'none' && bvh.joints.some(j=>j.channels.some(c=>c.endsWith('position')))) {
      const hips = bvh.joints.find(j => j.name === 'Hips');
      const si = hips.__chStart;
      const px = row[si] ?? 0, py = row[si+1] ?? 0, pz = row[si+2] ?? 0;
      const restPos = hips.offset;
      let dx = (px - restPos[0]) * rootScale, dy = (py - restPos[1]) * rootScale, dz = (pz - restPos[2]) * rootScale;
      if (rootMode === 'y') { dx = 0; dz = 0; }
      rootT = [dx, dy, dz];
    }
    framesMatrix.push({ t: +(f / fps).toFixed(5), bones: localOut, rootT });
  }

  // 组织成 {boneName: [ [x,y,z,w] per frame ]}
  const boneTracks = {};
  for (const bn of out.boneNames) boneTracks[bn] = framesMatrix.map(fr => fr.bones[bn] || [0,0,0,1]);
  const result = {
    source: bvhPath, model: modelPath,
    fps, nFrames: framesMatrix.length,
    duration: framesMatrix.length ? framesMatrix[framesMatrix.length-1].t : 0,
    rootMode, rootScale: +rootScale.toFixed(5),
    mappedCount: mappedModelBones.length,
    boneTracks,
    rootTrack: framesMatrix.map(fr => fr.rootT),
  };
  fs.writeFileSync(outPath, JSON.stringify(result));
  console.log(JSON.stringify({ out: outPath, frames: result.nFrames, duration: result.duration,
                               bones: out.boneNames.length, rootScale: +rootScale.toFixed(4) }));
}

let __depthCache = {};

main();
