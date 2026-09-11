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
if (animArg !== 'none' && json.animations && json.animations.length) {
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
// fit so the character height maps to 0.80*H (leave margin), centred
const charH = mx[1]-mn[1], charW = mx[0]-mn[0];
const scale = Math.min((H*0.80)/charH, (W*0.92)/charW);
const cxModel = (mn[0]+mx[0])/2, cyModel = (mn[1]+mx[1])/2;
const baselineY = H * 0.96;
const toScreen = (q) => [ W/2 + (q[0]-cxModel)*scale, baselineY - (q[1]-mn[1])*scale ];

// ---------- texture ----------
let TEX=null, TW=+texWs, TH=+texHs;
if (texPath && texPath !== 'none') TEX = fs.readFileSync(texPath);

// ---------- raster ----------
const color = new Float32Array(W*H*3);
const depth = new Float32Array(W*H).fill(Infinity);
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
      let tx=Math.min(TW-1,Math.max(0,Math.floor(u*TW)));
      let ty=Math.min(TH-1,Math.max(0,Math.floor(vv*TH)));       // glTF UV origin = top-left
      const ti=(ty*TW+tx)*4;
      r=TEX[ti]/255; g=TEX[ti+1]/255; b=TEX[ti+2]/255;
    }
    if (mode === 'lit') {
      const n = [ w1*P[0].n[0]+w2*P[1].n[0]+w0*P[2].n[0],
                  w1*P[0].n[1]+w2*P[1].n[1]+w0*P[2].n[1],
                  w1*P[0].n[2]+w2*P[1].n[2]+w0*P[2].n[2] ];
      const nl = Math.hypot(n[0],n[1],n[2])||1;
      let d = (n[0]*L[0]+n[1]*L[1]+n[2]*L[2])/nl;
      d = 0.34 + 0.66*Math.max(0,d);
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
console.log(JSON.stringify({ anim: animName, t: timeArg, mode, yaw: yawDeg,
  charH: +charH.toFixed(4), charW: +charW.toFixed(4), scale: +scale.toFixed(1),
  pxHeight: Math.round(charH*scale), pxWidth: Math.round(charW*scale),
  trisDrawn: drawn, trisTotal: tri }));
