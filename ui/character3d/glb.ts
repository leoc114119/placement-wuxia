// T31-FE-A · ui/character3d/glb.ts —— GLB v2 最小子集解析与静态资产装配
//
// 算法来源：`proto/webgl2_probe/src/glb-loader.js`（S0 已验实现）收编为有类型版本；
// 对拍见 tests/character3d-probe-parity.test.ts（模型账 / 顶点摘要 / VBO 交错摘要逐位一致）。
//
// 支持面（= 运行时真正需要的那一块）：
//   GLB v2 JSON/BIN chunk · bufferView/accessor · POSITION/NORMAL/TEXCOORD_0/JOINTS_0/WEIGHTS_0/
//   indices · skin.joints + inverseBindMatrices + 节点层级 · 单 mesh 单 primitive 单材质 +
//   内嵌贴图 · animations（**只读采样器**，见 buildEmbeddedClips）。
// 其余一律报错（**fail-fast，不做静默降级**）：>1 primitive / >1 mesh / >1 material、
//   稀疏 accessor、任何 extensions、非紧凑 byteStride、未识别 componentType/type、缺必需属性、
//   顶点权重未归一、骨索引越界、CUBICSPLINE 采样器。
//
// 本文件只做「读字节 → 结构对象」，不触 GL、不触平台 API（渲染上传在 renderer.ts）。

import type { Character3DAssetRef } from '../../types';

// ===== glTF JSON 最小类型面（只声明本文件真正读的字段；禁 any） =====

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  normalized?: boolean;
  sparse?: unknown;
  min?: number[];
  max?: number[];
  name?: string;
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
}

interface GltfMesh {
  name?: string;
  primitives: GltfPrimitive[];
}

interface GltfNode {
  name?: string;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  mesh?: number;
  skin?: number;
}

interface GltfSkin {
  name?: string;
  joints: number[];
  skeleton?: number;
  inverseBindMatrices?: number;
}

interface GltfTextureRef {
  index: number;
}

interface GltfMaterial {
  name?: string;
  normalTexture?: GltfTextureRef;
  pbrMetallicRoughness?: {
    baseColorTexture?: GltfTextureRef;
    metallicRoughnessTexture?: GltfTextureRef;
  };
}

interface GltfImage {
  name?: string;
  mimeType?: string;
  bufferView?: number;
  uri?: string;
}

interface GltfTexture {
  source?: number;
  sampler?: number;
}

interface GltfAnimationSampler {
  input: number;
  output: number;
  interpolation?: string;
}

interface GltfAnimationChannel {
  sampler: number;
  target: { node?: number; path?: string };
}

interface GltfAnimation {
  name?: string;
  samplers: GltfAnimationSampler[];
  channels: GltfAnimationChannel[];
}

interface GltfJson {
  asset?: { generator?: string; version?: string };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  skins?: GltfSkin[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: { byteLength?: number }[];
  materials?: GltfMaterial[];
  images?: GltfImage[];
  textures?: GltfTexture[];
  animations?: GltfAnimation[];
  extensionsRequired?: string[];
}

// ===== 输出结构 =====

/** 节点树（拓扑序保证父先于子，世界矩阵递推必须）。 */
export interface Character3DNodeTree {
  count: number;
  parents: Int32Array;
  /** 父先于子的节点下标序 */
  order: Int32Array;
  trs: { name: string; t: number[]; q: number[]; s: number[] }[];
}

/** 模型账：与 assets/characters/hero/model/README.md 的核验记录逐项互核（§9.1 profile 用例）。 */
export interface Character3DModelAccount {
  triangleCount: number;
  vertexCount: number;
  jointCount: number;
  primitiveCount: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  bufferBytes: number;
  nodeCount: number;
  generator: string;
}

/** 内嵌贴图（BIN 内 JPEG/PNG 字节，交平台适配器解码；本文件不解码）。 */
export interface Character3DImageSource {
  index: number;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

/** 网格顶点数据（各属性与 POSITION 等长，已在解析期校验）。 */
export interface Character3DMeshData {
  positions: Float64Array; // count*3
  normals: Float64Array;   // count*3
  uvs: Float64Array;       // count*2
  jointIndices: Float64Array; // count*4
  weights: Float64Array;   // count*4
  indices: Uint16Array | Uint32Array;
  indexComponentType: number;
  vertexCount: number;
  indexCount: number;
}

/** 嵌入动画轨道（已解成数值；采样在 animation.ts）。 */
export interface Character3DTrack {
  nodeIndex: number;
  path: 'rotation' | 'translation' | 'scale';
  times: Float32Array;
  /** keyCount × 分量数（rotation/scale=4，translation=3），与 times 对齐 */
  values: Float32Array;
  interpolation: 'STEP' | 'LINEAR';
}

/** 一条嵌入动画（GLB animations[i]）。 */
export interface Character3DEmbeddedClip {
  name: string;
  keyCount: number;
  /** 首个/末个关键帧时间（秒）。Tripo 预设不自 0 起（1/30），播放窗 = lastTime - firstTime。 */
  startTimeSec: number;
  endTimeSec: number;
  durationSec: number;
  tracks: Character3DTrack[];
}

export interface Character3DModel {
  account: Character3DModelAccount;
  mesh: Character3DMeshData;
  nodes: Character3DNodeTree;
  /** skin.joints 的节点下标（palette 顺序 = 本数组顺序，勿重排） */
  jointNodes: number[];
  jointNames: string[];
  /** 行主序意义上的扁平 IBM（列主序矩阵，joints.length × 16） */
  ibm: Float64Array;
  images: Character3DImageSource[];
  /** 材质角色 → images 元素（baseColor 必需，其余可缺） */
  textureRoles: { baseColor: Character3DImageSource | null; normal: Character3DImageSource | null; metallicRoughness: Character3DImageSource | null };
  bounds: { min: number[]; max: number[]; source: 'accessor.minmax' | 'computed' };
  clips: Character3DEmbeddedClip[];
}

// ===== 容器解析 =====

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENTS: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const REQUIRED_ATTRS = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'] as const;

function fail(msg: string): never {
  throw new Error('[character3d/glb] ' + msg);
}

/**
 * UTF-8 解码（JSON chunk）。小游戏基础库不保证有 TextDecoder，故自带最小回退实现
 * —— 不能因为宿主缺一个 Web API 就整条解析链断掉。
 */
export function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder === 'function') return new TextDecoder().decode(bytes);
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b0 = bytes[i++];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      continue;
    }
    let cp: number;
    let extra: number;
    if ((b0 & 0xe0) === 0xc0) { cp = b0 & 0x1f; extra = 1; }
    else if ((b0 & 0xf0) === 0xe0) { cp = b0 & 0x0f; extra = 2; }
    else if ((b0 & 0xf8) === 0xf0) { cp = b0 & 0x07; extra = 3; }
    else { out += '\uFFFD'; continue; }
    for (let k = 0; k < extra; k++) cp = (cp << 6) | (bytes[i++] & 0x3f);
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else out += String.fromCharCode(cp);
  }
  return out;
}

export interface ParsedGlb {
  json: GltfJson;
  bin: Uint8Array | null;
  version: number;
  byteLength: number;
}

export function parseGlb(buffer: ArrayBuffer | Uint8Array): ParsedGlb {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u8.byteLength < 12) fail('文件不足 12 字节，不是 GLB');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) fail('magic 不符，不是 GLB（禁按 glTF 文本猜）');
  const version = dv.getUint32(4, true);
  if (version !== 2) fail('只支持 GLB v2，实得 v' + version);
  const total = dv.getUint32(8, true);
  if (total > u8.byteLength) fail('GLB 声明长度 ' + total + ' > 实际 ' + u8.byteLength);
  let off = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  while (off < total) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > total) fail('chunk 越界');
    if (type === CHUNK_JSON) json = JSON.parse(decodeUtf8(u8.subarray(start, start + len))) as GltfJson;
    else if (type === CHUNK_BIN) bin = u8.subarray(start, start + len);
    off = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json) fail('缺 JSON chunk');
  return { json, bin, version, byteLength: total };
}

// ===== accessor =====

interface AccessorLayout {
  accessor: GltfAccessor;
  comps: number;
  bpe: number;
  naturalStride: number;
}

function accessorLayout(json: GltfJson, index: number): AccessorLayout {
  const accessors = json.accessors;
  const a = accessors ? accessors[index] : undefined;
  if (!a) fail('accessor[' + index + '] 不存在');
  if (a.sparse) fail('accessor[' + index + '] 是稀疏 accessor（不支持，禁猜）');
  const comps = NCOMP[a.type];
  if (!comps) fail('accessor[' + index + '] type=' + a.type + ' 未识别');
  const bpe = COMPONENTS[a.componentType];
  if (!bpe) fail('accessor[' + index + '] componentType=' + a.componentType + ' 未识别');
  return { accessor: a, comps, bpe, naturalStride: comps * bpe };
}

function viewOf(json: GltfJson, a: GltfAccessor, naturalStride: number): { stride: number; base: number } {
  if (a.bufferView === undefined) fail('accessor 无 bufferView（不支持零填充 accessor）');
  const bvs = json.bufferViews;
  const bv = bvs ? bvs[a.bufferView] : undefined;
  if (!bv) fail('bufferView[' + a.bufferView + '] 不存在');
  const stride = bv.byteStride === undefined ? naturalStride : bv.byteStride;
  if (stride !== naturalStride) {
    fail('bufferView[' + a.bufferView + '] byteStride=' + stride + ' 非紧凑（不支持交错，禁猜）');
  }
  return { stride, base: (bv.byteOffset || 0) + (a.byteOffset || 0) };
}

/** 读单个 accessor → Float64Array（count × comps）。整数按 normalized 标志归一。 */
export function readAccessor(json: GltfJson, bin: Uint8Array | null, index: number): Float64Array {
  const lay = accessorLayout(json, index);
  const a = lay.accessor;
  const v = viewOf(json, a, lay.naturalStride);
  if (!bin) fail('缺 BIN chunk 但 accessor 指向 buffer');
  if (v.base + (a.count - 1) * v.stride + lay.naturalStride > bin.byteLength) fail('accessor[' + index + '] 越界');
  const out = new Float64Array(a.count * lay.comps);
  const dv = new DataView(bin.buffer, bin.byteOffset + v.base);
  for (let i = 0; i < a.count; i++) {
    const row = i * v.stride;
    for (let c = 0; c < lay.comps; c++) {
      const o = row + c * lay.bpe;
      let val: number;
      switch (a.componentType) {
        case 5120: val = dv.getInt8(o); break;
        case 5121: val = dv.getUint8(o); break;
        case 5122: val = dv.getInt16(o, true); break;
        case 5123: val = dv.getUint16(o, true); break;
        case 5125: val = dv.getUint32(o, true); break;
        default: val = dv.getFloat32(o, true);
      }
      if (a.normalized) {
        if (a.componentType === 5121) val /= 255;
        else if (a.componentType === 5120) val = Math.max(val / 127, -1);
        else if (a.componentType === 5123) val /= 65535;
        else if (a.componentType === 5122) val = Math.max(val / 32767, -1);
      }
      out[i * lay.comps + c] = val;
    }
  }
  return out;
}

/** 读 indices → 整数 TypedArray（Uint16 或 Uint32）。 */
export function readIndices(json: GltfJson, bin: Uint8Array | null, index: number): Uint16Array | Uint32Array {
  const accessors = json.accessors;
  const a = accessors ? accessors[index] : undefined;
  if (!a) fail('indices accessor[' + index + '] 不存在');
  if (a.type !== 'SCALAR') fail('indices accessor type=' + a.type + '（应 SCALAR）');
  const vals = readAccessor(json, bin, index);
  const out = a.componentType === 5125 ? new Uint32Array(vals.length) : new Uint16Array(vals.length);
  for (let i = 0; i < vals.length; i++) out[i] = vals[i];
  return out;
}

// ===== 节点树 =====

function buildNodes(json: GltfJson): Character3DNodeTree {
  const src = json.nodes;
  if (!Array.isArray(src) || !src.length) fail('无 nodes');
  const n = src.length;
  const parents = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const kids = src[i].children || [];
    for (let k = 0; k < kids.length; k++) {
      if (kids[k] < 0 || kids[k] >= n) fail('node[' + i + '] 子节点越界');
      if (parents[kids[k]] !== -1) fail('node[' + kids[k] + '] 有多个父节点（非法树）');
      parents[kids[k]] = i;
    }
  }
  const order = new Int32Array(n);
  const seen = new Uint8Array(n);
  let w = 0;
  const visit = (i: number): void => {
    if (seen[i]) return;
    seen[i] = 1;
    if (parents[i] >= 0) visit(parents[i]);
    order[w++] = i;
  };
  for (let i = 0; i < n; i++) visit(i);
  if (w !== n) fail('节点树存在环（拓扑排序只覆盖 ' + w + '/' + n + '）');
  const trs = src.map((nd) => ({
    name: nd.name || '',
    t: (nd.translation || [0, 0, 0]).slice(),
    q: (nd.rotation || [0, 0, 0, 1]).slice(),
    s: (nd.scale || [1, 1, 1]).slice(),
  }));
  return { count: n, parents, order, trs };
}

// ===== 主入口 =====

/** 固定机位用：静止姿态包围盒（POSITION accessor 的 min/max 即可，缺则现算）。 */
function boundsOf(
  json: GltfJson,
  positionAccessorIndex: number,
  positions: Float64Array,
  vertexCount: number,
): Character3DModel['bounds'] {
  const accessors = json.accessors;
  const a = accessors ? accessors[positionAccessorIndex] : undefined;
  if (a && a.min && a.max) return { min: a.min.slice(), max: a.max.slice(), source: 'accessor.minmax' };
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertexCount; i++) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i * 3 + c];
      if (v < mn[c]) mn[c] = v;
      if (v > mx[c]) mx[c] = v;
    }
  }
  return { min: mn, max: mx, source: 'computed' };
}

/** 解析 GLB → 静态资产（fail-fast）。 */
export function loadCharacter3DModel(buffer: ArrayBuffer | Uint8Array): Character3DModel {
  const glb = parseGlb(buffer);
  const json = glb.json;
  const bin = glb.bin;
  if (json.extensionsRequired && json.extensionsRequired.length) {
    fail('extensionsRequired=' + json.extensionsRequired.join(',') + '（DRACO 等一律不支持）');
  }
  const meshes = json.meshes;
  if (!Array.isArray(meshes) || meshes.length !== 1) fail('mesh 数=' + (meshes ? meshes.length : 0) + '（只支持单 mesh）');
  const mesh = meshes[0];
  if (!mesh.primitives || mesh.primitives.length !== 1) {
    fail('primitive 数=' + (mesh.primitives ? mesh.primitives.length : 0) + '（只支持单 primitive）');
  }
  const prim = mesh.primitives[0];
  if (prim.mode !== undefined && prim.mode !== 4) fail('primitive.mode=' + prim.mode + '（只支持 TRIANGLES=4）');
  const attrs = Object.keys(prim.attributes || {});
  for (const required of REQUIRED_ATTRS) {
    if (attrs.indexOf(required) < 0) fail('缺必需属性 ' + required);
  }
  for (const attr of attrs) {
    if (REQUIRED_ATTRS.indexOf(attr as (typeof REQUIRED_ATTRS)[number]) < 0) {
      fail('出现未支持属性 ' + attr + '（禁猜语义）');
    }
  }
  if (prim.indices === undefined) fail('primitive 无 indices');
  const materials = json.materials;
  if (!Array.isArray(materials) || materials.length !== 1) {
    fail('material 数=' + (materials ? materials.length : 0) + '（只支持单材质）');
  }
  const skins = json.skins;
  if (!Array.isArray(skins) || skins.length !== 1) fail('skin 数=' + (skins ? skins.length : 0) + '（只支持单 skin）');

  const positions = readAccessor(json, bin, prim.attributes.POSITION);
  const normals = readAccessor(json, bin, prim.attributes.NORMAL);
  const uvs = readAccessor(json, bin, prim.attributes.TEXCOORD_0);
  const jointIndices = readAccessor(json, bin, prim.attributes.JOINTS_0);
  const weights = readAccessor(json, bin, prim.attributes.WEIGHTS_0);
  const indices = readIndices(json, bin, prim.indices);
  const accessors = json.accessors as GltfAccessor[];
  const vertexCount = accessors[prim.attributes.POSITION].count;
  for (const key of REQUIRED_ATTRS) {
    if (accessors[prim.attributes[key]].count !== vertexCount) {
      fail(key + ' 顶点数与 POSITION 不一致（禁按最小数截断）');
    }
  }

  const nodes = buildNodes(json);
  const skin = skins[0];
  if (!Array.isArray(skin.joints) || !skin.joints.length) fail('skin.joints 为空');
  if (skin.inverseBindMatrices === undefined) fail('skin 无 inverseBindMatrices');
  if (skin.skeleton !== undefined && skin.skeleton !== null) {
    fail('skin.skeleton 非空（不接受，避免根骨歧义）');
  }
  const ibm = readAccessor(json, bin, skin.inverseBindMatrices);
  if (ibm.length !== skin.joints.length * 16) {
    fail('IBM 矩阵数 ' + ibm.length / 16 + ' != joints ' + skin.joints.length);
  }

  // 顶点合法性与权重归一（不合法直接报错，不 clamp 掩盖）
  for (let i = 0; i < vertexCount; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const w = weights[i * 4 + k];
      if (w < 0 || w > 1.0001) fail('vertex ' + i + ' 权重越界 ' + w);
      const ji = jointIndices[i * 4 + k];
      if (ji >= skin.joints.length) fail('vertex ' + i + ' 骨索引 ' + ji + ' 越界（joints=' + skin.joints.length + '）');
      sum += w;
    }
    if (Math.abs(sum - 1) > 1e-3) fail('vertex ' + i + ' 权重和 ' + sum.toFixed(5) + ' 未归一');
  }

  // 内嵌贴图（本模型是 BIN 内 JPEG；这是唯一形态，其它形态报错）
  const images: Character3DImageSource[] = [];
  const textures = json.textures || [];
  const imageDefs = json.images || [];
  const bufferViews = json.bufferViews || [];
  for (let i = 0; i < textures.length; i++) {
    const src = textures[i].source;
    if (src === undefined) fail('texture[' + i + '] 无 source（不支持扩展纹理）');
    const img = imageDefs[src];
    if (!img) fail('image[' + src + '] 不存在');
    if (img.bufferView === undefined) fail('image[' + src + '] 非内嵌（不支持外部 URI，禁猜路径）');
    const bv = bufferViews[img.bufferView];
    const start = bv.byteOffset || 0;
    if (!bin) fail('缺 BIN chunk 但 image[' + src + '] 指向 buffer');
    images.push({
      index: i,
      name: img.name || 'image' + src,
      mimeType: img.mimeType || '',
      bytes: bin.subarray(start, start + bv.byteLength),
    });
  }
  const mat = materials[0];
  const roleOf = (texRef: GltfTextureRef | undefined): Character3DImageSource | null => {
    if (!texRef) return null;
    const found = images[texRef.index];
    return found === undefined ? null : found;
  };
  const textureRoles = {
    baseColor: roleOf(mat.pbrMetallicRoughness ? mat.pbrMetallicRoughness.baseColorTexture : undefined),
    metallicRoughness: roleOf(mat.pbrMetallicRoughness ? mat.pbrMetallicRoughness.metallicRoughnessTexture : undefined),
    normal: roleOf(mat.normalTexture),
  };
  if (!textureRoles.baseColor) fail('材质缺 baseColorTexture（无底色贴图的模型不进 S1）');

  const account: Character3DModelAccount = {
    triangleCount: indices.length / 3,
    vertexCount,
    jointCount: skin.joints.length,
    primitiveCount: mesh.primitives.length,
    meshCount: meshes.length,
    materialCount: materials.length,
    textureCount: images.length,
    bufferBytes: (json.buffers && json.buffers[0] && json.buffers[0].byteLength) || (bin ? bin.byteLength : 0),
    nodeCount: nodes.count,
    generator: (json.asset && json.asset.generator) || '',
  };

  return {
    account,
    mesh: {
      positions,
      normals,
      uvs,
      jointIndices,
      weights,
      indices,
      indexComponentType: accessors[prim.indices].componentType,
      vertexCount,
      indexCount: indices.length,
    },
    nodes,
    jointNodes: skin.joints.slice(),
    jointNames: skin.joints.map((j) => nodes.trs[j].name),
    ibm,
    images,
    textureRoles,
    bounds: boundsOf(json, prim.attributes.POSITION, positions, vertexCount),
    clips: buildEmbeddedClips(json, bin, nodes),
  };
}

// ===== 嵌入动画（GLB animations）=====

/** 解析 GLB 内嵌动画为统一轨道结构（**按 sampler 自己的 interpolation**，
 * 禁一律 nlerp：Tripo 预设的 Root/Pelvis 是 STEP、四肢是 LINEAR，混为一谈会让不动骨跳到末端姿态）。 */
export function buildEmbeddedClips(json: GltfJson, bin: Uint8Array | null, nodes: Character3DNodeTree): Character3DEmbeddedClip[] {
  const anims = json.animations;
  if (!Array.isArray(anims) || !anims.length) return [];
  const out: Character3DEmbeddedClip[] = [];
  for (let ai = 0; ai < anims.length; ai++) {
    const anim = anims[ai];
    let minT = Infinity;
    let maxT = -Infinity;
    let keyCount = 0;
    const tracks: Character3DTrack[] = [];
    for (const ch of anim.channels) {
      const nodeIndex = ch.target.node;
      if (nodeIndex === undefined) fail('animation[' + ai + '] channel 无 target.node（不支持无节点通道）');
      const path = ch.target.path;
      if (path !== 'rotation' && path !== 'translation' && path !== 'scale') {
        fail('animation[' + ai + '] target.path=' + String(path) + ' 未支持');
      }
      const sampler = anim.samplers[ch.sampler];
      if (!sampler) fail('animation[' + ai + '] sampler[' + ch.sampler + '] 不存在');
      const ip = sampler.interpolation || 'LINEAR';
      if (ip !== 'STEP' && ip !== 'LINEAR') fail('animation[' + ai + '] interpolation=' + ip + ' 未支持（禁 CUBICSPLINE）');
      const ncomp = path === 'rotation' ? 4 : 3;
      const times64 = readAccessor(json, bin, sampler.input);
      const values64 = readAccessor(json, bin, sampler.output);
      if (values64.length !== times64.length * ncomp) {
        fail('animation[' + ai + '] 轨道 ' + nodes.trs[nodeIndex].name + '.' + path + ' 输出长度不符');
      }
      const times = new Float32Array(times64.length);
      for (let i = 0; i < times64.length; i++) times[i] = times64[i];
      const values = new Float32Array(values64.length);
      for (let i = 0; i < values64.length; i++) values[i] = values64[i];
      for (let i = 0; i < times.length; i++) {
        if (times[i] < minT) minT = times[i];
        if (times[i] > maxT) maxT = times[i];
      }
      keyCount = Math.max(keyCount, times.length);
      tracks.push({ nodeIndex, path, times, values, interpolation: ip });
    }
    if (!tracks.length) fail('animation[' + ai + '] 无可用轨道');
    out.push({
      name: anim.name || 'anim' + ai,
      keyCount,
      startTimeSec: minT,
      endTimeSec: maxT,
      durationSec: maxT - minT,
      tracks,
    });
  }
  return out;
}

// ===== 账目校验（loader 的结构门）=====

export interface ExpectedModelAccount {
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly jointCount: number;
  readonly primitiveCount: number;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly bufferBytes: number;
}

/** 结构门检（方案 §6.2）：面数/骨数/primitive/贴图数任一不符 ⇒ 该文件不使用、也不覆盖 LKG。
 * @returns 不符项清单；空数组 = 通过。 */
export function validateModelAccount(model: Character3DModel, expected: ExpectedModelAccount): string[] {
  const errors: string[] = [];
  const a = model.account;
  const check = (label: string, actual: number, want: number): void => {
    if (actual !== want) errors.push(`${label}=${actual} 应为 ${want}`);
  };
  check('triangleCount', a.triangleCount, expected.triangleCount);
  check('vertexCount', a.vertexCount, expected.vertexCount);
  check('jointCount', a.jointCount, expected.jointCount);
  check('primitiveCount', a.primitiveCount, expected.primitiveCount);
  check('meshCount', a.meshCount, expected.meshCount);
  check('materialCount', a.materialCount, expected.materialCount);
  check('textureCount', a.textureCount, expected.textureCount);
  check('bufferBytes', a.bufferBytes, expected.bufferBytes);
  return errors;
}

/** 结构门闭包：直接喂给 net/character-asset-loader 的 structureValidator（下载后、登记 LKG 前调用）。 */
export function createModelStructureValidator(
  expected: ExpectedModelAccount,
  ref?: Character3DAssetRef,
): (bytes: Uint8Array, ref: Character3DAssetRef) => void {
  void ref;
  return (bytes: Uint8Array): void => {
    const model = loadCharacter3DModel(bytes);
    const errors = validateModelAccount(model, expected);
    if (errors.length) throw new Error('[character3d/glb] 结构不符: ' + errors.join('; '));
  };
}

// ===== GPU 上传载荷 =====

/**
 * 交错顶点缓冲（16 float/顶点：pos3 + nrm3 + uv2 + joints4 + weights4）。
 * 与 probe 已验渲染器的布局完全一致（对拍逐位比对）。
 */
export function buildVertexInterleave(model: Character3DModel): Float32Array {
  const vcount = model.mesh.vertexCount;
  const m = model.mesh;
  const inter = new Float32Array(vcount * 16);
  for (let v = 0; v < vcount; v++) {
    const o = v * 16;
    inter[o] = m.positions[v * 3]; inter[o + 1] = m.positions[v * 3 + 1]; inter[o + 2] = m.positions[v * 3 + 2];
    inter[o + 3] = m.normals[v * 3]; inter[o + 4] = m.normals[v * 3 + 1]; inter[o + 5] = m.normals[v * 3 + 2];
    inter[o + 6] = m.uvs[v * 2]; inter[o + 7] = m.uvs[v * 2 + 1];
    inter[o + 8] = m.jointIndices[v * 4]; inter[o + 9] = m.jointIndices[v * 4 + 1];
    inter[o + 10] = m.jointIndices[v * 4 + 2]; inter[o + 11] = m.jointIndices[v * 4 + 3];
    inter[o + 12] = m.weights[v * 4]; inter[o + 13] = m.weights[v * 4 + 1];
    inter[o + 14] = m.weights[v * 4 + 2]; inter[o + 15] = m.weights[v * 4 + 3];
  }
  return inter;
}

/** 稳定摘要（FNV-1a 32bit）：用于账目对拍与「两帧确实不同」的自证。 */
export function digest32(bytes: ArrayLike<number>): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** 浮点数组摘要（先量化到 1e-4 网格再哈希：跨实现比对时吃掉最后几位的舍入噪声）。 */
export function digestFloats(values: ArrayLike<number>, quantum = 1e-4): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < values.length; i++) {
    const q = Math.round(values[i] / quantum) | 0;
    h ^= q & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    h ^= (q >>> 8) & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    h ^= (q >>> 16) & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
