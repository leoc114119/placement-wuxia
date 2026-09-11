#!/usr/bin/env node
// Collada(.dae) → 我们的骨骼动画 JSON
//
// 为什么优先 Collada：Mixamo 的 Collada 导出直接给「每骨骼每帧的局部 4x4 矩阵」，
// 没有欧拉角顺序 / 轴朝向 / 编码歧义这些坑（FBX Binary 三样全占）。
//
// 重定向式（局部空间，以动画第 0 帧为基准）——与 fbx2anim.mjs 最终版同思路：
//   R(b,t)  = rot( L_src_rest(b)^-1 × L_src_anim(b,t) )   源骨骼在其自身局部系的旋转
//   E(b,t)  = R(b,0)^-1 × R(b,t)                          相对第 0 帧的增量
//   L_tgt(b,t) = L_tgt_rest(b) × E(b,t)                   施加到我们模型的 rest 上
//   不变量：t=0 时 L_tgt = 目标自身 rest（有自动校验）
//
// 用法：
//   node collada2anim.mjs <model.glb> <anim.dae> <out.json> [--fps 30] [--frames N] [--root y|none]
//   node collada2anim.mjs <anim.dae> --list
import fs from 'fs';
import { parseGLB } from './glb.mjs';

export const MIXAMO_TO_MODEL = {
  Hips: 'Hip', Spine: 'Waist', Spine1: 'Spine01', Spine2: 'Spine02',
  Neck: 'NeckTwist01', Head: 'Head',
  LeftShoulder: 'L_Clavicle', LeftArm: 'L_Upperarm', LeftForeArm: 'L_Forearm', LeftHand: 'L_Hand',
  LeftUpLeg: 'L_Thigh', LeftLeg: 'L_Calf', LeftFoot: 'L_Foot', LeftToeBase: 'L_ToeBase',
  RightShoulder: 'R_Clavicle', RightArm: 'R_Upperarm', RightForeArm: 'R_Forearm', RightHand: 'R_Hand',
  RightUpLeg: 'R_Thigh', RightLeg: 'R_Calf', RightFoot: 'R_Foot', RightToeBase: 'R_ToeBase',
};

// ————— 极简 XML 解析（只取我们要的结构）—————
function parseXML(src) {
  const stack = [];
  let root = { name: '#root', attrs: {}, children: [], text: '' };
  stack.push(root);
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[0].startsWith('<!--') || m[0].startsWith('<?') || m[0].startsWith('<![CDATA[')) continue;
    if (m[1]) {                       // 闭合标签
      if (stack.length > 1) stack.pop();
    } else if (m[2]) {                // 开标签
      const attrs = {};
      const ar = /([\w:.-]+)\s*=\s*"([^"]*)"/g; let a;
      while ((a = ar.exec(m[3] || ''))) attrs[a[1]] = a[2];
      const node = { name: m[2], attrs, children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      if (!m[0].endsWith('/>')) stack.push(node);
    } else if (m[4] !== undefined) {  // 文本
      const t = m[4];
      if (t.trim()) stack[stack.length - 1].text += t;
    }
  }
  return root;
}
const kids = (n, name) => (n?.children || []).filter(c => c.name === name);
const kid = (n, name) => (n?.children || []).find(c => c.name === name);
function descendants(n, name, out = []) {
  for (const c of n.children) { if (c.name === name) out.push(c); descendants(c, name, out); }
  return out;
}

// Collada <matrix> 是行主序；转成 glTF 的列主序 Float64Array(16)
function colladaMatrixToColMajor(str) {
  const v = Array.isArray(str) ? str.map(Number) : str.trim().split(/\s+/).map(Number);
  if (v.length !== 16) throw new Error('matrix 需要 16 个数，得到 ' + v.length);
  const o = new Float64Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[c * 4 + r] = v[r * 4 + c];
  return o;
}

// ————— 解析 Collada —————
export function parseCollada(file) {
  const rootXml = parseXML(fs.readFileSync(file, 'utf8'));
  const xml = kid(rootXml, 'COLLADA') || rootXml;   // <COLLADA> 是根元素的子级
  const asset = kid(xml, 'asset');
  const upAxis = asset && kid(asset, 'up_axis') ? kid(asset, 'up_axis').text.trim() : 'Y_UP';
  const unitNode = asset && kid(asset, 'unit');
  const unitScale = unitNode ? +unitNode.attrs.meter : 1;

  // rest 骨架 + 层级
  const vs = kid(xml, 'library_visual_scenes');
  const joints = [];
  const byId = {};
  const walkJoints = (node, parent) => {
    for (const c of node.children) {
      if (c.name !== 'node') continue;
      const isJoint = c.attrs.type === 'JOINT';
      if (isJoint) {
        const mtx = kid(c, 'matrix');
        const j = {
          id: c.attrs.id,
          clean: String(c.attrs.id || '').replace(/^mixamorig[:_]?/, ''),
          rest: mtx ? colladaMatrixToColMajor(mtx.text) : null,
          parent, children: [],
          anim: null,
        };
        joints.push(j); byId[j.id] = j;
        if (parent) parent.children.push(j);
        walkJoints(c, j);
      } else {
        walkJoints(c, parent);
      }
    }
  };
  const vsScene = kid(vs, 'visual_scene') || vs;
  walkJoints(vsScene, null);

  // 动画：id="<boneId>-anim"，channel target="<boneId>/matrix"
  const la = kid(xml, 'library_animations');
  const anims = la ? kids(la, 'animation') : [];
  for (const an of anims) {
    const ch = kid(an, 'channel');
    if (!ch) continue;
    const target = ch.attrs.target || '';
    const boneId = target.split('/')[0];
    const j = byId[boneId];
    if (!j) continue;
    const srcId = (ch.attrs.source || '').replace(/^#/, '');
    const sampler = descendants(an, 'sampler').find(s => s.attrs.id === srcId);
    if (!sampler) continue;
    // Collada 的 <sampler> 里两个元素都叫 <input>，靠 semantic 区分 INPUT/OUTPUT
    // （没有 <output> 标签——按名字找会静默拿到错的那个）
    const semOf = (sem) => {
      const el = sampler.children.find(c => c.name === 'input' && (c.attrs.semantic || '').toUpperCase() === sem);
      return el ? String(el.attrs.source || '').replace(/^#/, '') : null;
    };
    const srcIds = descendants(an, 'source').map(x => x.attrs.id);
    const inSrc = descendants(an, 'source').find(s => s.attrs.id === semOf('INPUT'));
    const outSrc = descendants(an, 'source').find(s => s.attrs.id === semOf('OUTPUT'));
    if (!inSrc || !outSrc) continue;
    const times = kid(inSrc, 'float_array').text.trim().split(/\s+/).map(Number);
    const mats = kid(outSrc, 'float_array').text.trim().split(/\s+/).map(Number);
    const frames = [];
    // ★ Collada 的 <matrix> 是行主序；必须转成列主序再使用。
    //   不转的后果：位移落在 [3][7][11] 而代码读 [12][13][14]（底行 0,0,0,1）→ 位移恒为 0；
    //   旋转部分对纯旋转恰等于转置（即逆），相对量里侥幸抵消，但语义是错的。
    for (let i = 0; i < times.length; i++) {
      frames.push(colladaMatrixToColMajor(mats.slice(i * 16, i * 16 + 16).join(' ')));
    }
    j.anim = { times, matrices: frames };
  }
  return { upAxis, unitScale, joints, byId, animNames: anims.map(a => a.attrs.id) };
}

// ————— 矩阵工具（与其它脚本一致）—————
const I4 = () => new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
function mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k];
    o[c*4+r] = s;
  }
  return o;
}
function fromTRS(t,q,s){const[x,y,z,w]=q;const x2=x+x,y2=y+y,z2=z+z;
  const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return new Float64Array([(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,
    (xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,
    (xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0, t[0],t[1],t[2],1]);}
function invRot(m){const o=new Float64Array(16);
  o[0]=m[0];o[1]=m[4];o[2]=m[8];o[4]=m[1];o[5]=m[5];o[6]=m[9];o[8]=m[2];o[9]=m[6];o[10]=m[10];o[15]=1;return o;}
function rotPart(m){
  let c0=[m[0],m[1],m[2]],c1=[m[4],m[5],m[6]];
  const n=v=>{const L=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/L,v[1]/L,v[2]/L];};
  c0=n(c0); const d=c0[0]*c1[0]+c0[1]*c1[1]+c0[2]*c1[2];
  c1=n([c1[0]-c0[0]*d,c1[1]-c0[1]*d,c1[2]-c0[2]*d]);
  const c2=[c0[1]*c1[2]-c0[2]*c1[1], c0[2]*c1[0]-c0[0]*c1[2], c0[0]*c1[1]-c0[1]*c1[0]];
  return new Float64Array([c0[0],c0[1],c0[2],0, c1[0],c1[1],c1[2],0, c2[0],c2[1],c2[2],0, 0,0,0,1]);
}
function matToQuat(r){
  const tr=r[0]+r[5]+r[10]; let x,y,z,w;
  if(tr>0){const s=Math.sqrt(tr+1)*2;w=0.25*s;x=(r[6]-r[9])/s;y=(r[8]-r[2])/s;z=(r[1]-r[4])/s;}
  else if(r[0]>r[5]&&r[0]>r[10]){const s=Math.sqrt(1+r[0]-r[5]-r[10])*2;w=(r[6]-r[9])/s;x=0.25*s;y=(r[4]+r[1])/s;z=(r[8]+r[2])/s;}
  else if(r[5]>r[10]){const s=Math.sqrt(1+r[5]-r[0]-r[10])*2;w=(r[8]-r[2])/s;x=(r[4]+r[1])/s;y=0.25*s;z=(r[9]+r[6])/s;}
  else{const s=Math.sqrt(1+r[10]-r[0]-r[5])*2;w=(r[1]-r[4])/s;x=(r[8]+r[2])/s;y=(r[9]+r[6])/s;z=0.25*s;}
  const L=Math.hypot(x,y,z,w)||1; return [x/L,y/L,z/L,w/L];
}

// ————— 主流程 —————
function main() {
  const argv = process.argv.slice(2);
  const flag = (n, d) => { const i = argv.indexOf('--'+n); return i < 0 ? d : argv[i+1]; };
  const daePath = argv.find(a => a.endsWith('.dae'));
  const C = parseCollada(daePath);

  if (argv.includes('--list')) {
    console.log('up_axis:', C.upAxis, ' unit(meter):', C.unitScale, ' JOINT:', C.joints.length, ' 动画条目:', C.animNames.length);
    console.log('有动画的骨骼:', C.joints.filter(j => j.anim).length);
    console.log('\n映射:');
    for (const j of C.joints) { const m = MIXAMO_TO_MODEL[j.clean]; if (m) console.log(`   ${j.clean.padEnd(16)} -> ${m}`); }
    const hips = C.joints.find(j => j.clean === 'Hips');
    if (hips && hips.anim) console.log(`\nHips 动画: ${hips.anim.times.length} 帧, 时长 ${hips.anim.times[hips.anim.times.length-1].toFixed(2)}s`);
    return;
  }

  const positional = argv.filter(a => !a.startsWith('--') && !a.endsWith('.dae')
    && a !== flag('fps',null) && a !== flag('frames',null) && a !== flag('root',null));
  const [modelPath, outPath] = positional;

  const { json } = parseGLB(modelPath);
  const nodes = json.nodes;
  const parentOf = new Array(nodes.length).fill(-1);
  nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parentOf[c]=i));
  const nameToIdx = {}; nodes.forEach((n,i)=>{ if(n.name) nameToIdx[n.name]=i; });
  const depthOf = new Array(nodes.length).fill(0);
  { const calc = i => { if(depthOf[i]>0||parentOf[i]<0) return depthOf[i]; depthOf[i]=calc(parentOf[i])+1; return depthOf[i]; };
    for(let i=0;i<nodes.length;i++) calc(i); }
  const order = [...nodes.keys()].sort((a,b)=>depthOf[a]-depthOf[b]);
  const restLocal = nodes.map(n => fromTRS(n.translation||[0,0,0], n.rotation||[0,0,0,1], n.scale||[1,1,1]));

  const srcOfModel = {};
  for (const j of C.joints) { const mi = nameToIdx[MIXAMO_TO_MODEL[j.clean]]; if (mi !== undefined) srcOfModel[mi] = j; }

  // 时长与帧数
  let dur = 0;
  for (const j of C.joints) if (j.anim) dur = Math.max(dur, j.anim.times[j.anim.times.length-1]);
  const fps = +flag('fps', 30);
  const want = +flag('frames', 0);
  const nFrames = want > 0 ? want : Math.max(1, Math.round(dur * fps));
  const rootMode = flag('root', 'y');

  // 采样源局部矩阵
  const sampleMat = (j, t) => {
    const a = j.anim; if (!a) return j.rest;
    const T = a.times, M = a.matrices;
    if (t <= T[0]) return M[0];
    if (t >= T[T.length-1]) return M[M.length-1];
    let lo=0, hi=T.length-1;
    while (hi-lo>1) { const m=(lo+hi)>>1; if (T[m]<=t) lo=m; else hi=m; }
    // 用旋转部分做球面近似（nlerp 于四元数），位移线性插值
    const k = (t-T[lo])/((T[hi]-T[lo])||1);
    const q0 = matToQuat(rotPart(new Float64Array(M[lo]))), q1 = matToQuat(rotPart(new Float64Array(M[hi])));
    let d = q0[0]*q1[0]+q0[1]*q1[1]+q0[2]*q1[2]+q0[3]*q1[3];
    const s = d<0?-1:1;
    const q = [0,1,2,3].map(i => q0[i]*(1-k)+q1[i]*k*s);
    const L = Math.hypot(q[0],q[1],q[2],q[3])||1;
    const qn = q.map(v=>v/L);
    const tr = [12,13,14].map(i => M[lo][i]*(1-k)+M[hi][i]*k);
    return fromTRS(tr, qn, [1,1,1]);
  };

  // 源每帧、每骨骼「相对自身 rest 的局部旋转」
  const Rof = (j, t) => {
    const L = sampleMat(j, t);
    return rotPart(mul(invRot(rotPart(new Float64Array(j.rest))), L));
  };
  // 第 0 帧基准
  const R0 = {};
  for (const [mi, j] of Object.entries(srcOfModel)) R0[mi] = Rof(j, 0);

  const boneTracks = {};
  const emit = new Set();
  for (const mi of Object.keys(srcOfModel).map(Number)) {
    emit.add(mi);
    const st = [...(nodes[mi].children||[])];
    while (st.length) { const c = st.pop(); emit.add(c); st.push(...(nodes[c].children||[])); }
  }

  const rootTrack = [];
  const hipsSrc = C.joints.find(j => j.clean === 'Hips');
  const hipsRestT = hipsSrc && hipsSrc.rest ? [hipsSrc.rest[12], hipsSrc.rest[13], hipsSrc.rest[14]] : [0,0,0];
  // 源/目标 髋高比，用于根位移缩放（源单位 cm）
  const tgtHipY = (() => {
    const i = nameToIdx['Hip']; if (i === undefined) return 1;
    const W = new Array(nodes.length);
    const go = k => { if (W[k]) return W[k]; W[k] = parentOf[k]>=0 ? mul(go(parentOf[k]), restLocal[k]) : restLocal[k]; return W[k]; };
    for (let k=0;k<nodes.length;k++) go(k);
    return W[i][13];
  })();
  const srcHipY = Math.abs(hipsRestT[1]) * C.unitScale;
  const rootScale = srcHipY > 1e-6 ? (tgtHipY / srcHipY) : 1;

  const perFrame = [];
  for (let f = 0; f < nFrames; f++) {
    const t = f / fps;
    const L = new Array(nodes.length);
    for (const [mi, j] of Object.entries(srcOfModel)) {
      const R = Rof(j, +t);
      const E = mul(invRot(R0[mi]), R);
      L[mi] = mul(restLocal[mi], E);
    }
    // 未映射骨骼（Root/扭转骨/手指）：局部旋转保持自身 rest。
    // 父级的动画会通过层级自然传导，无需在此重复施加。
    // ⚠️ 此处 L[] 存的是「局部矩阵」——早先误按「世界矩阵」写法
    //    （L[parent] × restLocal）会把父级旋转叠加两次，导致 Pelvis 偏 53.7°、
    //    各 Twist 骨偏 ~175°。两种语义不可混用。
    for (const i of order) {
      if (srcOfModel[i] !== undefined) continue;
      L[i] = restLocal[i];
    }
    const q = {};
    for (const i of emit) q[nodes[i].name] = matToQuat(rotPart(L[i]));
    perFrame.push(q);

    let rt = null;
    if (rootMode !== 'none' && hipsSrc && hipsSrc.anim) {
      const a = hipsSrc.anim;
      const idx = Math.min(a.times.length-1, Math.round(t * (a.times.length-1) / (a.times[a.times.length-1] || 1)));
      const M = a.matrices[idx];
      let dx = (M[12]-hipsRestT[0]) * C.unitScale * rootScale;
      let dy = (M[13]-hipsRestT[1]) * C.unitScale * rootScale;
      let dz = (M[14]-hipsRestT[2]) * C.unitScale * rootScale;
      if (rootMode === 'y') { dx = 0; dz = 0; }
      rt = [dx, dy, dz];
    }
    rootTrack.push(rt);
  }

  for (const i of emit) {
    const bn = nodes[i].name;
    boneTracks[bn] = perFrame.map(q => q[bn] || [0,0,0,1]);
  }
  const result = { source: daePath, model: modelPath, fps, nFrames, duration: nFrames/fps,
    rootMode, rootScale: +rootScale.toFixed(5), unitScale: C.unitScale,
    mappedCount: Object.keys(boneTracks).length, boneTracks, rootTrack };
  fs.writeFileSync(outPath, JSON.stringify(result));
  console.log(JSON.stringify({ out: outPath, frames: nFrames, duration: +result.duration.toFixed(2),
    bones: Object.keys(boneTracks).length, rootScale: +rootScale.toFixed(4) }));
}

main();
