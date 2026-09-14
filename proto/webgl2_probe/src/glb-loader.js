// src/glb-loader.js —— GLB v2 最小子集解析器（fail-fast，不做猜测降级）
//
// 支持面（= 本 probe 实际需要的那一块，见《T31 方案》§2.1）：
//   GLB v2 JSON/BIN chunk · bufferView/accessor · POSITION/NORMAL/TEXCOORD_0/
//   JOINTS_0/WEIGHTS_0/indices · skin.joints + inverseBindMatrices + node hierarchy ·
//   单 mesh 单 primitive 单材质 + 内嵌贴图。
// 其余一律报错（不做静默降级）：
//   >1 primitive、>1 mesh、>1 material、稀疏 accessor、DRACO/任何 extensions、
//   非紧凑 byteStride、未识别 componentType/type、缺必需属性。
//
// 输出「模型账」供 README 基线与真机结果互核：triangleCount / vertexCount / jointCount /
// primitiveCount / textureCount / bufferBytes —— 41 骨对不上直接由调用方 FAIL。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.PWProbe = root.PWProbe || {}; root.PWProbe.glbLoader = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GLB_MAGIC = 0x46546c67;
  const CHUNK_JSON = 0x4e4f534a;
  const CHUNK_BIN = 0x004e4942;
  const COMPONENTS = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const REQUIRED_ATTRS = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'];

  function fail(msg) { throw new Error('[glb-loader] ' + msg); }

  /**
   * UTF-8 解码（JSON chunk）。小游戏基础库不保证有 TextDecoder，故自带一个最小回退实现
   * —— 不能因为宿主缺一个 Web API 就整个解析链断掉。
   */
  function decodeUtf8(bytes) {
    if (typeof TextDecoder === 'function') return new TextDecoder().decode(bytes);
    let out = '';
    for (let i = 0; i < bytes.length;) {
      const b0 = bytes[i++];
      if (b0 < 0x80) { out += String.fromCharCode(b0); continue; }
      let cp, extra;
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

  // ---------- 容器 ----------

  function parseGLB(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.byteLength < 12) fail('文件不足 12 字节，不是 GLB');
    if (dv.getUint32(0, true) !== GLB_MAGIC) fail('magic 不符，不是 GLB（禁按 glTF 文本猜）');
    const version = dv.getUint32(4, true);
    if (version !== 2) fail('只支持 GLB v2，实得 v' + version);
    const total = dv.getUint32(8, true);
    if (total > u8.byteLength) fail('GLB 声明长度 ' + total + ' > 实际 ' + u8.byteLength);
    let off = 12, json = null, bin = null;
    while (off < total) {
      const len = dv.getUint32(off, true);
      const type = dv.getUint32(off + 4, true);
      const start = off + 8;
      if (start + len > total) fail('chunk 越界');
      if (type === CHUNK_JSON) json = JSON.parse(decodeUtf8(u8.subarray(start, start + len)));
      else if (type === CHUNK_BIN) bin = u8.subarray(start, start + len);
      off = start + len + ((4 - (len % 4)) % 4);
    }
    if (!json) fail('缺 JSON chunk');
    return { json: json, bin: bin, version: version, byteLength: total };
  }

  // ---------- accessor ----------

  function accessorLayout(json, index) {
    const a = json.accessors && json.accessors[index];
    if (!a) fail('accessor[' + index + '] 不存在');
    if (a.sparse) fail('accessor[' + index + '] 是稀疏 accessor（不支持，禁猜）');
    const n = NCOMP[a.type];
    if (!n) fail('accessor[' + index + '] type=' + a.type + ' 未识别');
    const bpe = COMPONENTS[a.componentType];
    if (!bpe) fail('accessor[' + index + '] componentType=' + a.componentType + ' 未识别');
    return { accessor: a, comps: n, bpe: bpe, naturalStride: n * bpe };
  }

  function viewOf(json, a, naturalStride) {
    if (a.bufferView === undefined) fail('accessor 无 bufferView（不支持零填充 accessor）');
    const bv = json.bufferViews[a.bufferView];
    if (!bv) fail('bufferView[' + a.bufferView + '] 不存在');
    const stride = bv.byteStride === undefined ? naturalStride : bv.byteStride;
    if (stride !== naturalStride) fail('bufferView[' + a.bufferView + '] byteStride=' + stride + ' 非紧凑（不支持交错，禁猜）');
    return { bv: bv, stride: stride, base: (bv.byteOffset || 0) + (a.byteOffset || 0) };
  }

  /** 读单个 accessor → Float64Array（count*comps）。整数按 normalized 标志归一。 */
  function readAccessor(json, bin, index) {
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
        let val;
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
  function readIndices(json, bin, index) {
    const a = json.accessors[index];
    if (!a) fail('indices accessor[' + index + '] 不存在');
    if (a.type !== 'SCALAR') fail('indices accessor type=' + a.type + '（应 SCALAR）');
    const vals = readAccessor(json, bin, index);
    const use32 = a.componentType === 5125;
    const out = use32 ? new Uint32Array(vals.length) : new Uint16Array(vals.length);
    for (let i = 0; i < vals.length; i++) out[i] = vals[i];
    return out;
  }

  // ---------- 节点树 ----------

  function buildNodes(json) {
    if (!Array.isArray(json.nodes) || !json.nodes.length) fail('无 nodes');
    const n = json.nodes.length;
    const parents = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const kids = json.nodes[i].children || [];
      for (let k = 0; k < kids.length; k++) {
        if (kids[k] < 0 || kids[k] >= n) fail('node[' + i + '] 子节点越界');
        if (parents[kids[k]] !== -1) fail('node[' + kids[k] + '] 有多个父节点（非法树）');
        parents[kids[k]] = i;
      }
    }
    // 拓扑序（父先于子）：用世界矩阵递推时必须
    const order = new Int32Array(n);
    const seen = new Uint8Array(n);
    let w = 0;
    function visit(i) {
      if (seen[i]) return;
      seen[i] = 1;
      if (parents[i] >= 0) visit(parents[i]);
      order[w++] = i;
    }
    for (let i = 0; i < n; i++) visit(i);
    if (w !== n) fail('节点树存在环（拓扑排序只覆盖 ' + w + '/' + n + '）');
    const trs = json.nodes.map(function (nd) {
      return {
        name: nd.name || '',
        t: nd.translation || [0, 0, 0],
        q: nd.rotation || [0, 0, 0, 1],
        s: nd.scale || [1, 1, 1],
      };
    });
    return { count: n, parents: parents, order: order, trs: trs };
  }

  // ---------- 主入口 ----------

  /**
   * @param {ArrayBuffer|Uint8Array} buffer GLB 字节
   * @returns 模型对象（见文件头「模型账」）
   */
  function load(buffer) {
    const glb = parseGLB(buffer);
    const json = glb.json, bin = glb.bin;
    if (json.extensionsRequired && json.extensionsRequired.length) fail('extensionsRequired=' + json.extensionsRequired.join(',') + '（DRACO 等一律不支持）');
    if (!Array.isArray(json.meshes) || json.meshes.length !== 1) fail('mesh 数=' + (json.meshes || []).length + '（本 probe 只支持单 mesh）');
    const mesh = json.meshes[0];
    if (!mesh.primitives || mesh.primitives.length !== 1) fail('primitive 数=' + (mesh.primitives || []).length + '（只支持单 primitive）');
    const prim = mesh.primitives[0];
    if (prim.mode !== undefined && prim.mode !== 4) fail('primitive.mode=' + prim.mode + '（只支持 TRIANGLES=4）');
    const attrs = Object.keys(prim.attributes || {});
    for (let i = 0; i < REQUIRED_ATTRS.length; i++) {
      if (attrs.indexOf(REQUIRED_ATTRS[i]) < 0) fail('缺必需属性 ' + REQUIRED_ATTRS[i]);
    }
    for (let i = 0; i < attrs.length; i++) {
      if (REQUIRED_ATTRS.indexOf(attrs[i]) < 0) fail('出现未支持属性 ' + attrs[i] + '（禁猜语义）');
    }
    if (prim.indices === undefined) fail('primitive 无 indices');
    if (!Array.isArray(json.materials) || json.materials.length !== 1) fail('material 数=' + (json.materials || []).length + '（只支持单材质）');
    if (!Array.isArray(json.skins) || json.skins.length !== 1) fail('skin 数=' + (json.skins || []).length + '（只支持单 skin）');

    const positions = readAccessor(json, bin, prim.attributes.POSITION);
    const normals = readAccessor(json, bin, prim.attributes.NORMAL);
    const uvs = readAccessor(json, bin, prim.attributes.TEXCOORD_0);
    const jointIdx = readAccessor(json, bin, prim.attributes.JOINTS_0);
    const weights = readAccessor(json, bin, prim.attributes.WEIGHTS_0);
    const indices = readIndices(json, bin, prim.indices);
    const vertexCount = json.accessors[prim.attributes.POSITION].count;
    for (let i = 0; i < 5; i++) {
      const key = REQUIRED_ATTRS[i];
      if (json.accessors[prim.attributes[key]].count !== vertexCount) fail(key + ' 顶点数与 POSITION 不一致（禁按最小数截断）');
    }

    const nodes = buildNodes(json);
    const skin = json.skins[0];
    if (!Array.isArray(skin.joints) || !skin.joints.length) fail('skin.joints 为空');
    if (skin.inverseBindMatrices === undefined) fail('skin 无 inverseBindMatrices');
    if (skin.skeleton !== undefined && skin.skeleton !== null) fail('skin.skeleton 非空（本 probe 不接受，避免根骨歧义）');
    const ibm = readAccessor(json, bin, skin.inverseBindMatrices);
    if (ibm.length !== skin.joints.length * 16) fail('IBM 矩阵数 ' + (ibm.length / 16) + ' != joints ' + skin.joints.length);

    // 顶点合法性与权重归一（不合法直接报错，不 clamp 掩盖）
    for (let i = 0; i < vertexCount; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const w = weights[i * 4 + k];
        if (w < 0 || w > 1.0001) fail('vertex ' + i + ' 权重越界 ' + w);
        const ji = jointIdx[i * 4 + k];
        if (ji >= skin.joints.length) fail('vertex ' + i + ' 骨索引 ' + ji + ' 越界（joints=' + skin.joints.length + '）');
        sum += w;
      }
      if (Math.abs(sum - 1) > 1e-3) fail('vertex ' + i + ' 权重和 ' + sum.toFixed(5) + ' 未归一');
    }

    // 内嵌贴图（本模型是 BIN 内 JPEG；这是唯一形态，其它形态报错）
    const images = [];
    const mats = json.materials[0];
    const texRefs = [];
    if (mats.pbrMetallicRoughness && mats.pbrMetallicRoughness.baseColorTexture) texRefs.push(['baseColor', mats.pbrMetallicRoughness.baseColorTexture.index]);
    if (mats.pbrMetallicRoughness && mats.pbrMetallicRoughness.metallicRoughnessTexture) texRefs.push(['metallicRoughness', mats.pbrMetallicRoughness.metallicRoughnessTexture.index]);
    if (mats.normalTexture) texRefs.push(['normal', mats.normalTexture.index]);
    const textures = json.textures || [];
    for (let i = 0; i < textures.length; i++) {
      const src = textures[i].source;
      if (src === undefined) fail('texture[' + i + '] 无 source（不支持扩展纹理）');
      const img = json.images[src];
      if (!img) fail('image[' + src + '] 不存在');
      if (img.bufferView === undefined) fail('image[' + src + '] 非内嵌（不支持外部 URI，禁猜路径）');
      const bv = json.bufferViews[img.bufferView];
      images.push({
        index: i,
        mimeType: img.mimeType || '',
        bytes: bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength),
      });
    }
    const roleOf = {};
    for (let i = 0; i < texRefs.length; i++) roleOf[texRefs[i][0]] = images[texRefs[i][1]];

    const account = {
      triangleCount: indices.length / 3,
      vertexCount: vertexCount,
      jointCount: skin.joints.length,
      primitiveCount: mesh.primitives.length,
      textureCount: images.length,
      bufferBytes: (json.buffers && json.buffers[0] && json.buffers[0].byteLength) || (bin ? bin.byteLength : 0),
      nodeCount: nodes.count,
      generator: (json.asset && json.asset.generator) || '',
    };

    return {
      positions: positions, normals: normals, uvs: uvs,
      jointIndices: jointIdx, weights: weights, indices: indices,
      indexType: json.accessors[prim.indices] ? json.accessors[prim.indices].componentType : 0,
      nodes: nodes, jointNodes: skin.joints.slice(), ibm: ibm,
      images: images, textures: roleOf, account: account,
      bounds: boundsOf(json, prim, positions, vertexCount),
    };
  }

  /** 固定机位用：静止姿态包围盒（POSITION accessor 的 min/max 即可，缺则现算）。 */
  function boundsOf(json, prim, positions, vertexCount) {
    const a = json.accessors[prim.attributes.POSITION];
    if (a.min && a.max) return { min: a.min.slice(), max: a.max.slice(), source: 'accessor.minmax' };
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertexCount; i++) {
      for (let c = 0; c < 3; c++) {
        const v = positions[i * 3 + c];
        if (v < mn[c]) mn[c] = v;
        if (v > mx[c]) mx[c] = v;
      }
    }
    return { min: mn, max: mx, source: 'computed' };
  }

  /** 顶点摘要（A1-04 用：证明两帧像素不同 ⇒ 真在动）。 */
  function digest32(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  return {
    load: load, parseGLB: parseGLB, readAccessor: readAccessor,
    readIndices: readIndices, digest32: digest32, decodeUtf8: decodeUtf8,
    MODEL_ACCOUNT_BASELINE: { triangleCount: 48419, jointCount: 41, primitiveCount: 1, textureCount: 3, bufferBytes: 3974376 },
  };
});
