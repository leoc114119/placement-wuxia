// Minimal GLB (glTF 2.0 binary) parser — returns {json, bin}
import fs from 'fs';

export function parseGLB(path) {
  const buf = fs.readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint32(0, true);
  if (magic !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  const version = dv.getUint32(4, true);
  const total = dv.getUint32(8, true);
  let off = 12, json = null, bin = null;
  while (off < total) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(buf.slice(start, start + len).toString('utf8'));
    else if (type === 0x004e4942) bin = buf.slice(start, start + len);
    off = start + len + ((4 - (len % 4)) % 4);
  }
  return { json, bin, version };
}

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function readAccessor(json, bin, idx) {
  const a = json.accessors[idx];
  const n = NCOMP[a.type];
  const out = new Float64Array(a.count * n);
  if (a.bufferView === undefined) return out;
  const bv = json.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const TA = COMP[a.componentType];
  const bpe = TA.BYTES_PER_ELEMENT;
  const stride = bv.byteStride || n * bpe;
  for (let i = 0; i < a.count; i++) {
    const dv = new DataView(bin.buffer, bin.byteOffset + base + i * stride, n * bpe);
    for (let c = 0; c < n; c++) {
      const o = c * bpe;
      let v;
      switch (a.componentType) {
        case 5120: v = dv.getInt8(o); break;
        case 5121: v = dv.getUint8(o); break;
        case 5122: v = dv.getInt16(o, true); break;
        case 5123: v = dv.getUint16(o, true); break;
        case 5125: v = dv.getUint32(o, true); break;
        default: v = dv.getFloat32(o, true);
      }
      out[i * n + c] = v;
    }
  }
  return out;
}

export function readIndices(json, bin, idx) {
  const a = json.accessors[idx];
  const TA = COMP[a.componentType];
  const out = new (TA === Uint32Array ? Uint32Array : TA === Uint16Array ? Uint16Array : Uint8Array)(a.count);
  const bv = json.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const bpe = TA.BYTES_PER_ELEMENT;
  const stride = bv.byteStride || bpe;
  for (let i = 0; i < a.count; i++) {
    const dv = new DataView(bin.buffer, bin.byteOffset + base + i * stride, bpe);
    out[i] = a.componentType === 5125 ? dv.getUint32(0, true)
      : a.componentType === 5123 ? dv.getUint16(0, true)
      : a.componentType === 5121 ? dv.getUint8(0) : dv.getUint8(0);
  }
  return out;
}
