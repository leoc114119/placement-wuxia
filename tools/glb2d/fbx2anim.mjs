#!/usr/bin/env node
// FBX(Binary) → 我们的骨骼动画 JSON
//
// 背景：Mixamo 默认导出 FBX Binary（version 7700）。本解析器就是为这条路写的，
//       写一次即可复用所有 Mixamo 下载的动作。
//
// 原理（与 retarget.mjs 同一套「世界增量」思路，保证与已有管线一致）：
//   1) 从 FBX 读骨架 rest（Model 节点的 Lcl Translation / Lcl Rotation）+ 层级
//   2) 从 AnimationCurve 读每帧的局部旋转（欧拉角，度）
//   3) 源世界增量 Δ(b,t) = W_anim(b,t) × W_rest(b)^-1
//   4) 目标世界 W_tgt(b,t) = Δ(b,t) × W_tgt_rest(b)   ← 施加到我们模型
//   5) 局部 = 父世界^-1 × 自身世界
//
// 用法：
//   node fbx2anim.mjs <model.glb> <anim.fbx> <out.json> [--fps 30] [--frames N] [--root y|none]
//   node fbx2anim.mjs <anim.fbx> --list     # 只看 FBX 里的骨架
import fs from 'fs';
import zlib from 'zlib';
import { parseGLB } from './glb.mjs';

// ————— Mixamo 骨骼名 → 本模型骨骼名 —————
export const MIXAMO_TO_MODEL = {
  Hips: 'Hip',
  Spine: 'Waist',
  Spine1: 'Spine01',
  Spine2: 'Spine02',
  Neck: 'NeckTwist01',
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

// ————— FBX Binary 解析 —————
const FBX_TIME = 46186158000;   // 1 秒 = 46186158000 FBX 时间单位

function parseFBXBinary(buf) {
  if (buf.slice(0, 20).toString('latin1') !== 'Kaydara FBX Binary  ') throw new Error('不是 FBX Binary');
  const version = buf.readUInt32LE(23);
  const wide = version >= 7500;
  const offSize = wide ? 8 : 4;
  let pos = 27;

  const readU64 = () => { const v = wide ? Number(buf.readBigUInt64LE(pos)) : buf.readUInt32LE(pos); pos += offSize; return v; };

  function readProperty() {
    const t = String.fromCharCode(buf[pos++]);
    switch (t) {
      case 'Y': { const v = buf.readInt16LE(pos); pos += 2; return v; }
      case 'C': { const v = buf[pos++]; return !!v; }
      case 'I': { const v = buf.readInt32LE(pos); pos += 4; return v; }
      case 'F': { const v = buf.readFloatLE(pos); pos += 4; return v; }
      case 'D': { const v = buf.readDoubleLE(pos); pos += 8; return v; }
      case 'L': { const v = Number(buf.readBigInt64LE(pos)); pos += 8; return v; }
      case 'f': case 'd': case 'l': case 'i': case 'b': {
        const len = buf.readUInt32LE(pos); pos += 4;
        const enc = buf.readUInt32LE(pos); pos += 4;
        const clen = buf.readUInt32LE(pos); pos += 4;
        let raw = buf.slice(pos, pos + clen); pos += clen;
        if (enc === 1) raw = zlibInflate(raw);
        const out = [];
        if (t === 'f') { for (let i = 0; i < len; i++) out.push(raw.readFloatLE(i*4)); }
        else if (t === 'd') { for (let i = 0; i < len; i++) out.push(raw.readDoubleLE(i*8)); }
        else if (t === 'l') { for (let i = 0; i < len; i++) out.push(Number(raw.readBigInt64LE(i*8))); }
        else if (t === 'i') { for (let i = 0; i < len; i++) out.push(raw.readInt32LE(i*4)); }
        else { for (let i = 0; i < len; i++) out.push(!!raw[i]); }
        return out;
      }
      case 'S': case 'R': {
        const len = buf.readUInt32LE(pos); pos += 4;
        let s = buf.slice(pos, pos + len); pos += len;
        return t === 'S' ? s.toString('utf8') : s;
      }
      default: throw new Error('未知属性类型 ' + t + ' @' + (pos-1));
    }
  }

  // 空记录（列表结束标记）长度：64 位版 = 8(end)+8(nProps)+8(propLen)+1(nameLen) = 25 字节
  //                        32 位版 = 4+4+4+1 = 13 字节
  const NULL_REC = wide ? 25 : 13;

  function readNodeList(endOffset) {
    const nodes = [];
    while (pos < endOffset) {
      const peek = wide ? Number(buf.readBigUInt64LE(pos)) : buf.readUInt32LE(pos);
      if (peek === 0) { pos += NULL_REC; break; }   // 此前用 pos += offSize 只跳 8/4 字节 → 错位
      const nodeEnd = readU64();
      const numProps = readU64();
      const propLen = readU64();
      const nameLen = buf[pos++];
      const name = buf.slice(pos, pos + nameLen).toString('utf8'); pos += nameLen;
      const props = [];
      for (let i = 0; i < numProps; i++) props.push(readProperty());
      const children = readNodeList(nodeEnd);
      if (pos > nodeEnd) pos = nodeEnd;
      nodes.push({ name, props, children });
    }
    return nodes;
  }

  const root = readNodeList(buf.length);
  return { version, root };
}

function zlibInflate(b) { return zlib.inflateSync(b); }

// ————— 从 FBX 抽取骨架与动画 —————
function extract(fbx) {
  const flat = [];
  const walk = (nodes, parent) => {
    for (const n of nodes) { n.__parent = parent; flat.push(n); walk(n.children, n); }
  };
  walk(fbx.root, null);

  const find = (name) => flat.filter(n => n.name === name);

  // Objects 段
  const objects = flat.find(n => n.name === 'Objects');
  const models = [], curveNodes = [], curves = [];
  if (objects) {
    for (const n of objects.children) {
      if (n.name === 'Model') models.push(n);
      else if (n.name === 'AnimationCurveNode') curveNodes.push(n);
      else if (n.name === 'AnimationCurve') curves.push(n);
    }
  }

  // Connections
  const conns = flat.find(n => n.name === 'Connections');
  const oo = [], op = [];   // oo: [child, parent]; op: [src, dst, prop]
  if (conns) {
    for (const c of conns.children) {
      if (c.name !== 'C') continue;
      const kind = c.props[0];
      if (kind === 'OO') oo.push([c.props[1], c.props[2]]);
      else if (kind === 'OP') op.push([c.props[1], c.props[2], c.props[3]]);
    }
  }

  const byId = {};
  for (const n of models) byId[n.props[0]] = n;
  for (const n of curveNodes) byId[n.props[0]] = n;
  for (const n of curves) byId[n.props[0]] = n;

  // Property70 便捷读取
  const getProp = (node, name) => {
    const p70 = node.children.find(c => c.name === 'Properties70');
    if (!p70) return null;
    for (const p of p70.children) if (p.props[0] === name) return p.props.slice(4);
    return null;
  };
  const getV3 = (node, name, def) => {
    const v = getProp(node, name);
    return v ? [v[0], v[1], v[2]] : def;
  };

  // 骨架：名字 + rest TRS
  const bones = models.map(m => {
    // FBX 把「\x00\x01<类型名>」拼在名称后（例："mixamorig:Hips\x00\x01Model"）
    const rawName = String(m.props[1] || '').replace(/^Model::/, '').split('\x00')[0];
    const clean = rawName.replace(/^mixamorig[:_]?/, '');
    return {
      id: m.props[0],
      rawName, clean,
      t: getV3(m, 'Lcl Translation', [0,0,0]),
      r: getV3(m, 'Lcl Rotation', [0,0,0]),      // 度
      pre: getV3(m, 'PreRotation', [0,0,0]),
      parent: null,
      children: [],
    };
  });
  const boneById = {};
  for (const b of bones) boneById[b.id] = b;
  for (const [child, parent] of oo) {
    if (boneById[child] && boneById[parent]) {
      boneById[child].parent = boneById[parent];
      boneById[parent].children.push(boneById[child]);
    }
  }

  // 动画曲线：curveNode ↔ 骨骼（OP 的属性名 = Lcl Translation/Rotation）
  //           curve ↔ curveNode（属性名 = d|X / d|Y / d|Z）
  const cnOfBone = {};   // boneId -> { 'Lcl Rotation': curveNode, ... }
  for (const [src, dst, prop] of op) {
    const cnode = byId[src], bone = byId[dst];
    if (cnode && bone && (cnode.name === 'AnimationCurveNode') && (bone.name === 'Model')) {
      (cnOfBone[dst] = cnOfBone[dst] || {})[prop] = cnode;
    }
  }
  const curveOfCn = {};  // cnId -> { 'd|X': curve, ... }
  for (const [src, dst, prop] of op) {
    const cur = byId[src], cnode = byId[dst];
    if (cur && cnode && cur.name === 'AnimationCurve' && cnode.name === 'AnimationCurveNode') {
      (curveOfCn[dst] = curveOfCn[dst] || {})[prop] = cur;
    }
  }

  const readCurve = (curve) => {
    const kt = curve.children.find(c => c.name === 'KeyTime');
    const kv = curve.children.find(c => c.name === 'KeyValueFloat');
    if (!kt || !kv) return null;
    const times = kt.props[0].map(v => v / FBX_TIME);
    const vals = kv.props[0];
    return { times, vals };
  };

  return { bones, boneById, cnOfBone, curveOfCn, readCurve, getProp, getV3 };
}

// ————— 矩阵/四元数（与 retarget.mjs 一致）—————
const I4 = () => new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
function mul(a,b){const o=new Float64Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function fromTRS(t,q,s){const[x,y,z,w]=q;const x2=x+x,y2=y+y,z2=z+z;const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return new Float64Array([(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,(xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,(xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0,t[0],t[1],t[2],1]);}
function rotX(a){const c=Math.cos(a),s=Math.sin(a);return new Float64Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);}
function rotY(a){const c=Math.cos(a),s=Math.sin(a);return new Float64Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);}
function rotZ(a){const c=Math.cos(a),s=Math.sin(a);return new Float64Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);}
// FBX 欧拉角（度）→ 矩阵。
// FBX 的 eEulerXYZ 语义 = 先绕 X、再绕 Y、最后绕 Z 作用于向量，
// 即 R = Rz·Ry·Rx（与直觉的 Rx·Ry·Rz 相反）。顺序错了手会收进身体，
// 故用环境变量 FBX_EULER 可在两种顺序间切换，便于实测判定。
function eulerDegToMat(r){
  const d=Math.PI/180;
  const X=rotX(r[0]*d), Y=rotY(r[1]*d), Z=rotZ(r[2]*d);
  const ord = process.env.FBX_EULER || 'ZYX';
  return ord==='ZYX' ? mul(mul(Z,Y),X) : mul(mul(X,Y),Z);
}
function quatIdentity(){return I4();}
function matToQuat(r){
  const tr=r[0]+r[5]+r[10];let x,y,z,w;
  if(tr>0){const s=Math.sqrt(tr+1)*2;w=0.25*s;x=(r[6]-r[9])/s;y=(r[8]-r[2])/s;z=(r[1]-r[4])/s;}
  else if(r[0]>r[5]&&r[0]>r[10]){const s=Math.sqrt(1+r[0]-r[5]-r[10])*2;w=(r[6]-r[9])/s;x=0.25*s;y=(r[4]+r[1])/s;z=(r[8]+r[2])/s;}
  else if(r[5]>r[10]){const s=Math.sqrt(1+r[5]-r[0]-r[10])*2;w=(r[8]-r[2])/s;x=(r[4]+r[1])/s;y=0.25*s;z=(r[9]+r[6])/s;}
  else{const s=Math.sqrt(1+r[10]-r[0]-r[5])*2;w=(r[1]-r[4])/s;x=(r[8]+r[2])/s;y=(r[9]+r[6])/s;z=0.25*s;}
  const L=Math.hypot(x,y,z,w)||1;return[x/L,y/L,z/L,w/L];
}
function rotPart(m){
  let c0=[m[0],m[1],m[2]],c1=[m[4],m[5],m[6]],c2=[m[8],m[9],m[10]];
  const n=v=>{const L=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/L,v[1]/L,v[2]/L];};
  c0=n(c0);const d01=c0[0]*c1[0]+c0[1]*c1[1]+c0[2]*c1[2];
  c1=n([c1[0]-c0[0]*d01,c1[1]-c0[1]*d01,c1[2]-c0[2]*d01]);
  c2=[c0[1]*c1[2]-c0[2]*c1[1],c0[2]*c1[0]-c0[0]*c1[2],c0[0]*c1[1]-c0[1]*c1[0]];
  return new Float64Array([c0[0],c0[1],c0[2],0,c1[0],c1[1],c1[2],0,c2[0],c2[1],c2[2],0,0,0,0,1]);
}

// ————— 主流程 —————
function main(){
  const argv = process.argv.slice(2);
  const flag=(n,d)=>{const i=argv.indexOf('--'+n);return i<0?d:argv[i+1];};
  const fbxPath = argv.find(a=>a.endsWith('.fbx'));
  const fbx = parseFBXBinary(fs.readFileSync(fbxPath));
  const E = extract(fbx);

  if (argv.includes('--list')) {
    console.log('FBX version', fbx.version, ' 模型节点', E.bones.length);

    const show=(b,d=0)=>{console.log('  '.repeat(d)+'  '+(b.clean||b.rawName));b.children.forEach(c=>show(c,d+1));};
    const roots=E.bones.filter(b=>!b.parent);
    roots.forEach(r=>show(r));
    console.log('\n映射:');
    for(const b of E.bones){const m=MIXAMO_TO_MODEL[b.clean]; if(m) console.log(`   ${b.clean.padEnd(16)} -> ${m}`);}
    return;
  }

  const [modelPath, outPath] = argv.filter(a=>!a.startsWith('--') && a!==flag('fps',null) && a!==flag('frames',null) && a!==flag('root',null) && !a.endsWith('.fbx'));
  const { json } = parseGLB(modelPath);
  const nodes = json.nodes;
  const parentOf = new Array(nodes.length).fill(-1);
  nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parentOf[c]=i));
  const nameToIdx={}; nodes.forEach((n,i)=>{if(n.name)nameToIdx[n.name]=i;});
  const depthOf=new Array(nodes.length).fill(0);
  {const calc=i=>{if(depthOf[i]>0||parentOf[i]<0)return depthOf[i];depthOf[i]=calc(parentOf[i])+1;return depthOf[i];};for(let i=0;i<nodes.length;i++)calc(i);}
  const order=[...nodes.keys()].sort((a,b)=>depthOf[a]-depthOf[b]);

  // 目标 rest 世界
  const restLocal=nodes.map(n=>fromTRS(n.translation||[0,0,0],n.rotation||[0,0,0,1],n.scale||[1,1,1]));
  const restWorld=new Array(nodes.length);
  const wo=i=>{if(restWorld[i])return restWorld[i];restWorld[i]=parentOf[i]>=0?mul(wo(parentOf[i]),restLocal[i]):restLocal[i];return restWorld[i];};
  for(let i=0;i<nodes.length;i++)wo(i);

  // 源 rest 世界（FBX）
  const srcWorld=new Map();
  const swo=b=>{if(srcWorld.has(b))return srcWorld.get(b);const L=mul(fromTRS(b.t,matToQuat(eulerDegToMat(b.pre)),[1,1,1]),eulerDegToMat(b.r));
    const W=b.parent?mul(swo(b.parent),L):L;srcWorld.set(b,W);return W;};
  E.bones.forEach(swo);

  // 采样：以 Rotation 曲线最长为总时长
  const fps=+flag('fps',30);
  let dur=0;
  for(const b of E.bones){
    const cn=(E.cnOfBone[b.id]||{})['Lcl Rotation'];
    if(!cn) continue;
    const cs=E.curveOfCn[cn.props[0]]||{};
    for(const cur of Object.values(cs)){const c=E.readCurve(cur);if(c&&c.times.length)dur=Math.max(dur,c.times[c.times.length-1]);}
  }
  const wantFrames=+flag('frames',0);
  const nFrames=wantFrames>0?wantFrames:Math.max(1,Math.round(dur*fps));
  const rootMode=flag('root','y');

  const sampleCurve=(c,t)=>{
    if(!c||!c.times.length)return 0;
    const T=c.times,V=c.vals;
    if(t<=T[0])return V[0];
    if(t>=T[T.length-1])return V[V.length-1];
    let lo=0,hi=T.length-1;
    while(hi-lo>1){const m=(lo+hi)>>1;if(T[m]<=t)lo=m;else hi=m;}
    const k=(t-T[lo])/((T[hi]-T[lo])||1);
    return V[lo]*(1-k)+V[hi]*k;
  };

  const boneTracks={};
  const emit=new Set();
  for(const b of E.bones){
    const mi=nameToIdx[MIXAMO_TO_MODEL[b.clean]];
    if(mi===undefined)continue;
    emit.add(mi);
    const st=[...(nodes[mi].children||[])];
    while(st.length){const c=st.pop();emit.add(c);st.push(...(nodes[c].children||[]));}
  }

  const rootTrack=[];
  const frames=[];
  for(let f=0;f<nFrames;f++){
    const t=f/fps;
    // 源世界（动画后）
    const animW=new Map();
    const awo=b=>{if(animW.has(b))return animW.get(b);
      let R=b.r;
      const cn=(E.cnOfBone[b.id]||{})['Lcl Rotation'];
      if(cn){const cs=E.curveOfCn[cn.props[0]]||{};
        const g=k=>cs[k]?sampleCurve(E.readCurve(cs[k]),t):null;
        const rx=g('d|X'),ry=g('d|Y'),rz=g('d|Z');
        R=[rx!==null?rx:b.r[0], ry!==null?ry:b.r[1], rz!==null?rz:b.r[2]];}
      const L=mul(fromTRS(b.t,matToQuat(eulerDegToMat(b.pre)),[1,1,1]),eulerDegToMat(R));
      const W=b.parent?mul(awo(b.parent),L):L;animW.set(b,W);return W;};
    E.bones.forEach(awo);

    // ★★ 重定向核心（两次修正后的最终式）
    //   错误 1（最初）：W_tgt = (W_src_anim × W_src_rest⁻¹) × W_tgt_rest
    //       世界系增量左乘目标 rest，只在两边 rest 同姿态时成立。
    //   错误 2（第一次修正）：W_tgt = (W_tgt_rest × W_src_rest⁻¹) × W_src_anim
    //       把「源 rest（T-pose）」当成了「目标 rest（A-pose）」的对应姿态。
    //   错因实测：Mixamo 的 rest 是 T-pose（LeftArm rest = 0°），
    //       而动画帧 0 已是「手臂下垂 71°」；我们模型 rest 本身已下垂 ~45°。
    //       上面两式都会把这 71° 叠加到已有的 45° 上 → 手臂穿进身体。
    //   正解：以「动画自己的第 0 帧」为基准，把运动当相对量施加到目标 rest 上：
    //       D(t)     = W_src_rest⁻¹ × W_src_anim(t)   源姿态（骨骼局部系）
    //       E(t)     = D(0)⁻¹ × D(t)                  相对第 0 帧的增量
    //       W_tgt(t) = W_tgt_rest × E(t)
    //   效果：帧 0 精确落在我们模型自己的 rest 上，后续为相对运动。
    const invRot = (m)=>{const o=new Float64Array(16);
      o[0]=m[0];o[1]=m[4];o[2]=m[8];o[4]=m[1];o[5]=m[5];o[6]=m[9];o[8]=m[2];o[9]=m[6];o[10]=m[10];o[15]=1;return o;};

    // 目标骨骼 → 源骨骼
    const srcOfModel = {};
    for(const b of E.bones){
      const mi = nameToIdx[MIXAMO_TO_MODEL[b.clean]];
      if(mi !== undefined) srcOfModel[mi] = b;
    }

    // 第 0 帧的 D(0)（每个映射骨骼）
    const D0 = {};
    if (f === 0) {
      for (const [mi, b] of Object.entries(srcOfModel)) {
        D0[mi] = mul(invRot(rotPart(srcWorld.get(b))), rotPart(awo(b)));
      }
      globalThis.__D0 = D0;
    }
    const d0 = globalThis.__D0 || {};

    const Wtgt = new Array(nodes.length);
    for (const i of order) Wtgt[i] = restWorld[i];
    for (const [mi, b] of Object.entries(srcOfModel)) {
      const D = mul(invRot(rotPart(srcWorld.get(b))), rotPart(awo(b)));
      const E = d0[mi] ? mul(invRot(d0[mi]), D) : D;
      Wtgt[mi] = mul(restWorld[mi], E);
    }
    // 未映射骨骼（Root/扭转骨/手指）：保持自己的局部 rest，跟随已映射父级。
    // 注：此处曾误写 mul(a, b, c) 三参——mul 只接受两个参数，第三个被静默丢弃，
    //     导致未映射的 Root 世界矩阵错误，进而让它已映射的子级 Hip 偏 90°、整个人横躺。
    for (const i of order) {
      if (srcOfModel[i]) continue;
      const p = parentOf[i];
      Wtgt[i] = p >= 0 ? mul(Wtgt[p], restLocal[i]) : restLocal[i];
    }

    const localOut={};
    for(const i of emit){
      const p=i>=0?parentOf[i]:-1;
      const pw=p>=0?Wtgt[p]:I4();
      const inv=new Float64Array(16);
      inv[0]=pw[0];inv[1]=pw[4];inv[2]=pw[8];inv[4]=pw[1];inv[5]=pw[5];inv[6]=pw[9];inv[8]=pw[2];inv[9]=pw[6];inv[10]=pw[10];inv[15]=1;
      localOut[nodes[i].name]=matToQuat(mul(inv,Wtgt[i]));
    }
    frames.push(localOut);
    // 根位移
    let rt=null;
    if(rootMode!=='none'){
      const hips=E.bones.find(b=>b.clean==='Hips');
      const cn=(E.cnOfBone[hips.id]||{})['Lcl Translation'];
      if(cn){const cs=E.curveOfCn[cn.props[0]]||{};
        const g=k=>cs[k]?sampleCurve(E.readCurve(cs[k]),t):0;
        let dx=g('d|X')-(hips.t[0]||0), dy=g('d|Y')-(hips.t[1]||0), dz=g('d|Z')-(hips.t[2]||0);
        if(rootMode==='y'){dx=0;dz=0;}
        rt=[dx*0.01,dy*0.01,dz*0.01];}
    }
    rootTrack.push(rt);
  }

  for(const bn of [...emit].map(i=>nodes[i].name)) boneTracks[bn]=frames.map(fr=>fr[bn]||[0,0,0,1]);
  const result={source:fbxPath,model:modelPath,fps,nFrames,duration:nFrames/fps,rootMode,
    mappedCount:Object.keys(boneTracks).length,boneTracks,rootTrack};
  fs.writeFileSync(outPath,JSON.stringify(result));
  console.log(JSON.stringify({out:outPath,frames:nFrames,duration:+result.duration.toFixed(2),
    bones:Object.keys(boneTracks).length}));
}


// 仅在被直接执行时跑 main()；被 import 时只导出函数（供其它脚本与校验复用）
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
