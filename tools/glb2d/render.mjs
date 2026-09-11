// Skinned software rasterizer for glTF/GLB characters.
// Usage: node render.mjs <model.glb> <out.raw> <W> <H> <animIndex|none> <timeSec|auto> <mode:unlit|lit> <texRaw.rgba> <texW> <texH> [yawDeg]
import fs from 'fs';
import { parseGLB, readAccessor, readIndices } from './glb.mjs';

const [modelPath, outRaw, Ws, Hs, animArg, timeArg, mode, texPath, texWs, texHs, yawArg] = process.argv.slice(2);
const W = +Ws, H = +Hs, yawDeg = yawArg ? +yawArg : 0;

// ---------- mat4 (column-major, glTF convention) ----------
const I4 = () => new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
function mul(a, b) { // a*b
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
const xformPoint = (m, p) => [
  m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12],
  m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13],
  m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14],
];
const xformDir = (m, p) => [
  m[0]*p[0] + m[4]*p[1] + m[8]*p[2],
  m[1]*p[0] + m[5]*p[1] + m[9]*p[2],
  m[2]*p[0] + m[6]*p[1] + m[10]*p[2],
];

// ---------- load ----------
const { json, bin } = parseGLB(modelPath);
const prim = json.meshes[0].primitives[0];
const POS = readAccessor(json, bin, prim.attributes.POSITION);
const NRM = readAccessor(json, bin, prim.attributes.NORMAL);
const UV  = readAccessor(json, bin, prim.attributes.TEXCOORD_0);
const JO  = readAccessor(json, bin, prim.attributes.JOINTS_0);
const WE  = readAccessor(json, bin, prim.attributes.WEIGHTS_0);
const IDX = readIndices(json, bin, prim.indices);
const skin = json.skins[0];
const IBM = readAccessor(json, bin, skin.inverseBindMatrices);
const nVerts = POS.length / 3;

// base node transforms
const nodeTRS = json.nodes.map(n => ({
  t: n.translation ? [...n.translation] : [0,0,0],
  q: n.rotation ? [...n.rotation] : [0,0,0,1],
  s: n.scale ? [...n.scale] : [1,1,1],
}));
const parentOf = new Array(json.nodes.length).fill(-1);
json.nodes.forEach((n, i) => (n.children || []).forEach(c => { parentOf[c] = i; }));

function localMats(trs) {
  return trs.map(x => fromTRS(x.t, x.q, x.s));
}
function worldMats(locals) {
  const world = new Array(json.nodes.length);
  const visit = (i) => {
    if (world[i]) return world[i];
    world[i] = parentOf[i] >= 0 ? mul(visit(parentOf[i]), locals[i]) : locals[i];
    return world[i];
  };
  for (let i = 0; i < json.nodes.length; i++) visit(i);
  return world;
}

// ---------- animation sampling ----------
let sampledTRS = nodeTRS.map(x => ({ t: [...x.t], q: [...x.q], s: [...x.s] }));
let animDur = 0;
let animName = null;

// 外部重定向动画（retarget.mjs 产出的 JSON）：argv[14] = 路径
const animJsonPath = process.argv[14];
if (animJsonPath && animJsonPath !== 'none' && fs.existsSync(animJsonPath)) {
  const RT = JSON.parse(fs.readFileSync(animJsonPath, 'utf8'));
  const fps = RT.fps || 30, nf = RT.nFrames;
  animDur = RT.duration || (nf / fps);
  animName = 'retargeted:' + String(RT.source || '').split('/').pop();
  let t = timeArg === 'auto' ? 0 : timeArg === 'mid' ? animDur / 2 : +timeArg;
  t = Math.min(Math.max(t, 0), animDur);
  const fi = t * fps;
  const i0 = Math.min(nf - 1, Math.floor(fi)), i1 = Math.min(nf - 1, i0 + 1);
  const a = fi - i0;
  const nlerp = (q0, q1, k) => {
    const d = q0[0]*q1[0] + q0[1]*q1[1] + q0[2]*q1[2] + q0[3]*q1[3];
    const s = d < 0 ? -1 : 1;
    const o = [0,1,2,3].map(i => q0[i]*k + q1[i]*(1-k)*s);
    const L = Math.hypot(o[0],o[1],o[2],o[3]) || 1;
    return o.map(v => v / L);
  };
  const nameIdx = {};
  json.nodes.forEach((n, i) => { if (n.name) nameIdx[n.name] = i; });
  let applied = 0;
  for (const [bn, track] of Object.entries(RT.boneTracks || {})) {
    const ni = nameIdx[bn];
    if (ni === undefined || !track[i0] || !track[i1]) continue;
    sampledTRS[ni].q = nlerp(track[i0], track[i1], a);
    applied++;
  }
  if (RT.rootTrack && RT.rootTrack[i0]) {
    const r0 = RT.rootTrack[i0], r1 = RT.rootTrack[i1] || r0;
    const rootIdx = nameIdx['Root'];
    if (rootIdx !== undefined) {
      const rb = nodeTRS[rootIdx].t;
      const d = [0,1,2].map(k => r0[k]*(1-a) + r1[k]*a);
      sampledTRS[rootIdx].t = [rb[0]+d[0], rb[1]+d[1], rb[2]+d[2]];
    }
  }
  console.error(`[retarget] ${animName} frames=${nf} dur=${animDur.toFixed(2)}s applied=${applied} bones t=${t.toFixed(3)}`);
} else if (animArg !== 'none' && json.animations && json.animations.length) {
  const ai = animArg === 'auto' ? 0 : +animArg;
  const anim = json.animations[ai];
  animName = anim.name;
  const chans = anim.channels.map(c => {
    const s = anim.samplers[c.sampler];
    return { path: c.target.path, node: c.target.node, interp: s.interpolation || 'LINEAR',
             input: readAccessor(json, bin, s.input), output: readAccessor(json, bin, s.output) };
  });
  for (const c of chans) animDur = Math.max(animDur, c.input[c.input.length - 1]);
  let t;
  if (timeArg === 'auto') t = 0;
  else if (timeArg === 'mid') t = animDur / 2;
  else t = +timeArg;
  t = Math.min(Math.max(t, 0), animDur);
  for (const c of chans) {
    const inp = c.input, n = inp.length;
    let i1 = 0; while (i1 < n - 1 && inp[i1 + 1] < t) i1++;
    const i0 = Math.max(0, i1 - (inp[i1 + 1] !== undefined && inp[i1+1] > t ? 1 : 0));
    const a = i0, b = Math.min(n - 1, a + 1);
    const span = (inp[b] - inp[a]) || 1;
    let f = Math.min(Math.max((t - inp[a]) / span, 0), 1);
    const nc = c.output.length / n;
    const out = new Array(nc);
    for (let k = 0; k < nc; k++) {
      const v0 = c.output[a * nc + k], v1 = c.output[b * nc + k];
      let v = v0 + (v1 - v0) * f;
      if (c.path === 'rotation') v = v0 + (v1 - v0) * f; // nlerp (approx)
      out[k] = v;
    }
    const nd = sampledTRS[c.node];
    if (c.path === 'translation') nd.t = out;
    else if (c.path === 'scale') nd.s = out;
    else if (c.path === 'rotation') {
      let [x,y,z,w] = out;
      const L = Math.hypot(x,y,z,w) || 1; nd.q = [x/L, y/L, z/L, w/L];
    }
  }
}

const world = worldMats(localMats(sampledTRS));

// ---------- skin matrices ----------
const jmats = skin.joints.map((nodeIdx, ji) => {
  const ibm = new Float64Array(16);
  for (let k = 0; k < 16; k++) ibm[k] = IBM[ji * 16 + k];
  return mul(world[nodeIdx], ibm);
});

// ---------- skin vertices ----------
const sp = new Float64Array(nVerts * 3);
const sn = new Float64Array(nVerts * 3);
for (let v = 0; v < nVerts; v++) {
  const p = [POS[v*3], POS[v*3+1], POS[v*3+2]];
  const nr = [NRM[v*3], NRM[v*3+1], NRM[v*3+2]];
  let ax=0, ay=0, az=0, nx=0, ny=0, nz=0;
  for (let k = 0; k < 4; k++) {
    const w = WE[v*4+k];
    if (!w) continue;
    const m = jmats[JO[v*4+k]];
    const tp = xformPoint(m, p);
    const tn = xformDir(m, nr);
    ax += tp[0]*w; ay += tp[1]*w; az += tp[2]*w;
    nx += tn[0]*w; ny += tn[1]*w; nz += tn[2]*w;
  }
  const nl = Math.hypot(nx,ny,nz) || 1;
  sp[v*3]=ax; sp[v*3+1]=ay; sp[v*3+2]=az;
  sn[v*3]=nx/nl; sn[v*3+1]=ny/nl; sn[v*3+2]=nz/nl;
}

// ---------- camera: orthographic, fit height ----------
// rotate about Y by yaw, then front view looks down -Z (camera at +Z)
const yaw = yawDeg * Math.PI / 180;
const cy = Math.cos(yaw), sy = Math.sin(yaw);
const rot = new Float64Array([cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1]);
let mn=[1e9,1e9], mx=[-1e9,-1e9];
const rp = new Float64Array(nVerts*2);
for (let v = 0; v < nVerts; v++) {
  const q = xformPoint(rot, [sp[v*3], sp[v*3+1], sp[v*3+2]]);
  rp[v*2]=q[0]; rp[v*2+1]=q[1];
  if (q[0]<mn[0]) mn[0]=q[0]; if (q[0]>mx[0]) mx[0]=q[0];
  if (q[1]<mn[1]) mn[1]=q[1]; if (q[1]>mx[1]) mx[1]=q[1];
}
// ————— 相机拟合 —————
// ⚠️ 关键：动画必须用「固定机位」。若每帧各自拟合包围盒，会把角色的上下位移
//    整个抵消掉（实测：跳跃 12 帧脚底 y 全为 308 → 完全看不出起跳/落地）。
//    故取「模型静止姿态」的包围盒作为唯一的拟合基准。
const FIXCAM = !(process.argv[15] === 'perframe');
let fitSrc = null;
if (FIXCAM) {
  // 用静止姿态（nodeTRS，不带动画）重算一次蒙皮，取包围盒
  const restWorld2 = worldMats(localMats(nodeTRS));
  const jm2 = skin.joints.map((ni, ji) => {
    const ibm = new Float64Array(16);
    for (let k = 0; k < 16; k++) ibm[k] = IBM[ji*16+k];
    return mul(restWorld2[ni], ibm);
  });
  let a=1e9,b=-1e9;
  for (let v = 0; v < nVerts; v++) {
    const p=[POS[v*3],POS[v*3+1],POS[v*3+2]];
    let x=0,y=0,oz=0;
    for (let k=0;k<4;k++){ const w=WE[v*4+k]; if(!w)continue; const m=jm2[JO[v*4+k]];
      const q=xformPoint(m,p); x+=q[0]*w; y+=q[1]*w; oz+=q[2]*w; }
    const q=xformPoint(rot,[x,y,oz]);
    if(q[1]<a)a=q[1]; if(q[1]>b)b=q[1];
  }
  fitSrc = { minY: a, maxY: b };
}
const charH = FIXCAM ? (fitSrc.maxY - fitSrc.minY) : (mx[1]-mn[1]);
const charW = mx[0]-mn[0];
const scale = Math.min((H*0.80)/charH, (W*0.92)/charW);
const cxModel = (mn[0]+mx[0])/2;
const minYRef = FIXCAM ? fitSrc.minY : mn[1];
const baselineY = H * 0.96;
const toScreen = (q) => [ W/2 + (q[0]-cxModel)*scale, baselineY - (q[1]-minYRef)*scale ];

// ---------- texture ----------
let TEX=null, TW=+texWs, TH=+texHs;
if (texPath && texPath !== 'none') TEX = fs.readFileSync(texPath);

// ---------- raster ----------
const color = new Float32Array(W*H*3);
const depth = new Float32Array(W*H).fill(Infinity);
const nbuf  = new Float32Array(W*H*3);   // view-space normal, for outline post-process
const alpha = new Uint8Array(W*H);
color.fill(1);

const L = [0.45, 0.72, -0.53]; // light dir (normalized-ish)
const Ll = Math.hypot(...L); L[0]/=Ll; L[1]/=Ll; L[2]/=Ll;

const tri = IDX.length/3;
let drawn = 0;
for (let f = 0; f < tri; f++) {
  const i0=IDX[f*3], i1=IDX[f*3+1], i2=IDX[f*3+2];
  const P = [0,1,2].map(k => {
    const vi = [i0,i1,i2][k];
    const q = xformPoint(rot, [sp[vi*3], sp[vi*3+1], sp[vi*3+2]]);
    return { s: toScreen(q), z: q[2], n: xformDir(rot, [sn[vi*3],sn[vi*3+1],sn[vi*3+2]]),
             uv: [UV[vi*2], UV[vi*2+1]] };
  });
  const A=P[0].s, B=P[1].s, C=P[2].s;
  const twice = (B[0]-A[0])*(C[1]-A[1]) - (B[1]-A[1])*(C[0]-A[0]);
  if (Math.abs(twice) < 1e-9) continue;   // degenerate
  let minx=Math.max(0,Math.floor(Math.min(A[0],B[0],C[0])));
  let maxx=Math.min(W-1,Math.ceil(Math.max(A[0],B[0],C[0])));
  let miny=Math.max(0,Math.floor(Math.min(A[1],B[1],C[1])));
  let maxy=Math.min(H-1,Math.ceil(Math.max(A[1],B[1],C[1])));
  if (minx>maxx||miny>maxy) continue;
  drawn++;
  for (let y=miny;y<=maxy;y++) for (let x=minx;x<=maxx;x++) {
    const px=x+0.5, py=y+0.5;
    let w0=((B[0]-A[0])*(py-A[1])-(B[1]-A[1])*(px-A[0]))/twice;
    let w1=((C[0]-B[0])*(py-B[1])-(C[1]-B[1])*(px-B[0]))/twice;
    let w2=((A[0]-C[0])*(py-C[1])-(A[1]-C[1])*(px-C[0]))/twice;
    if (w0<0||w1<0||w2<0) continue;
    const z = w1*P[0].z + w2*P[1].z + w0*P[2].z;
    const o=y*W+x;
    if (z >= depth[o]) continue;
    depth[o]=z; alpha[o]=255;
    const u = w1*P[0].uv[0] + w2*P[1].uv[0] + w0*P[2].uv[0];
    const vv= w1*P[0].uv[1] + w2*P[1].uv[1] + w0*P[2].uv[1];
    let r=1,g=1,b=1;
    if (TEX) {
      // 双线性采样：最近邻在缩小时会严重走样（2048² 贴图渲到 256px 人物，
      // 每个输出像素对应 8x8 纹素却只取一个）→ 噪点/花斑。用双线性显著改善。
      const fx = u*TW - 0.5, fy = vv*TH - 0.5;         // glTF UV origin = top-left
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const ax = fx - x0, ay = fy - y0;
      const cx0 = Math.min(TW-1, Math.max(0, x0)), cx1 = Math.min(TW-1, Math.max(0, x0+1));
      const cy0 = Math.min(TH-1, Math.max(0, y0)), cy1 = Math.min(TH-1, Math.max(0, y0+1));
      const w00=(1-ax)*(1-ay), w10=ax*(1-ay), w01=(1-ax)*ay, w11=ax*ay;
      const i00=(cy0*TW+cx0)*4, i10=(cy0*TW+cx1)*4, i01=(cy1*TW+cx0)*4, i11=(cy1*TW+cx1)*4;
      r=(TEX[i00]*w00+TEX[i10]*w10+TEX[i01]*w01+TEX[i11]*w11)/255;
      g=(TEX[i00+1]*w00+TEX[i10+1]*w10+TEX[i01+1]*w01+TEX[i11+1]*w11)/255;
      b=(TEX[i00+2]*w00+TEX[i10+2]*w10+TEX[i01+2]*w01+TEX[i11+2]*w11)/255;
    }
    // normal is always computed: lighting needs it, and the outline post-process reads it
    const n = [ w1*P[0].n[0]+w2*P[1].n[0]+w0*P[2].n[0],
                w1*P[0].n[1]+w2*P[1].n[1]+w0*P[2].n[1],
                w1*P[0].n[2]+w2*P[1].n[2]+w0*P[2].n[2] ];
    const nl = Math.hypot(n[0],n[1],n[2])||1;
    const nx=n[0]/nl, ny=n[1]/nl, nz=n[2]/nl;
    nbuf[o*3]=nx; nbuf[o*3+1]=ny; nbuf[o*3+2]=nz;
    if (mode === 'lit' || mode === 'relief' || mode === 'cel' || mode === 'flatcel') {
      const kd = Math.max(0, nx*L[0]+ny*L[1]+nz*L[2]);          // key
      const fd = Math.max(0, nx*(-L[0]) + ny*0.2 + nz*(-L[2])); // fill
      const rd = Math.max(0, ny*0.7 + nz*0.55 - nx*0.3);        // rim
      let d;
      if (mode === 'relief') {
        d = 0.10 + 0.95*Math.pow(kd,0.6) + 0.55*Math.pow(rd,2.0);
      } else if (mode === 'cel') {
        // hard-banded diffuse (cel look) + separate rim
        const STEPS = 4;
        const band = Math.ceil(kd*STEPS)/STEPS;
        d = 0.34 + 0.66*Math.max(0.25, band) + 0.30*Math.pow(rd,3.0);
      } else if (mode === 'flatcel') {
        // 接近我们 2D 画风的「平涂」：光照压到极窄区间，只留很轻的形体提示，
        // 让色彩量化后趋近平涂块面；描边交给后处理。
        const STEPS = 3;
        const band = Math.ceil(kd*STEPS)/STEPS;
        d = 0.86 + 0.14*band;                 // 亮度区间 0.86~1.00，几乎平涂
        d += 0.06*Math.pow(rd,4.0);           // 极轻的边缘光
      } else {
        d = 0.22 + 0.62*Math.pow(kd,0.8) + 0.20*fd + 0.42*Math.pow(rd,2.2);
      }
      r*=d; g*=d; b*=d;
    }
    color[o*3]=r; color[o*3+1]=g; color[o*3+2]=b;
  }
}

const out = Buffer.alloc(W*H*4);
for (let i=0;i<W*H;i++) {
  out[i*4]=Math.round(Math.min(1,Math.max(0,color[i*3]))*255);
  out[i*4+1]=Math.round(Math.min(1,Math.max(0,color[i*3+1]))*255);
  out[i*4+2]=Math.round(Math.min(1,Math.max(0,color[i*3+2]))*255);
  out[i*4+3]=alpha[i];
}
fs.writeFileSync(outRaw, out);

// optional aux buffers for the outline post-process (12th arg = prefix)
const auxPrefix = process.argv[13];  // argv[2..12] 是位置参数（含 yaw），aux 在最后
if (auxPrefix) {
  const dp = Buffer.alloc(W*H*4);
  for (let i=0;i<W*H;i++) dp.writeFloatLE(Number.isFinite(depth[i]) ? depth[i] : 1e9, i*4);
  fs.writeFileSync(auxPrefix + '.depth', dp);
  const np = Buffer.alloc(W*H*4*3);
  for (let i=0;i<W*H*3;i++) np.writeFloatLE(nbuf[i], i*4);
  fs.writeFileSync(auxPrefix + '.normal', np);
}

console.log(JSON.stringify({ anim: animName, t: timeArg, mode, yaw: yawDeg,
  charH: +charH.toFixed(4), charW: +charW.toFixed(4), scale: +scale.toFixed(1),
  pxHeight: Math.round(charH*scale), pxWidth: Math.round(charW*scale),
  trisDrawn: drawn, trisTotal: tri }));
