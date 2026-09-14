// src/anim-loader.js —— 重定向动作 json 的解析 / 采样 / 骨架求解 / 蒙皮调色板
//
// 格式真源 = `tools/glb2d/collada2anim.mjs`（产出）与 `tools/glb2d/render.mjs` L92-127
// 及 `tools/glb2d/qa_retarget_bones.mjs` L49-53（消费）。逐字核实后的语义：
//   { fps, nFrames, duration, rootMode, rootScale, unitScale, mappedCount,
//     boneTracks: { 骨名: Float[nFrames][4] 四元数 xyzw },
//     rootTrack : Float[nFrames][3] 根位移增量 }
//   · boneTracks 直接**替换**该骨 node.rotation；未被 track 覆盖的骨保持 GLB 静止姿态。
//   · rootTrack 是**增量**：Root 的 translation = 静止 translation + 插值后的增量。
//   · 帧间用 nlerp（render.mjs 同口径）。
// 本文件把「采样 + 41 骨 world/skin 矩阵」全部收在这里 —— 这正是 A2 的 jsAnimMs 口径。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./math.js'));
  else { root.PWProbe = root.PWProbe || {}; root.PWProbe.animLoader = factory(root.PWProbe.math); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (math) {
  'use strict';

  function fail(msg) { throw new Error('[anim-loader] ' + msg); }

  /** 解析并校验动作 json（fail-fast；不做静默补齐）。 */
  function parseAnim(raw) {
    if (!raw || typeof raw !== 'object') fail('动作 json 不是对象');
    const fps = raw.fps, nFrames = raw.nFrames, duration = raw.duration;
    if (!(fps > 0)) fail('fps 非法: ' + fps);
    if (!(nFrames > 1)) fail('nFrames 非法: ' + nFrames);
    if (!(duration > 0)) fail('duration 非法: ' + duration);
    if (Math.abs(duration - nFrames / fps) > 0.05) fail('duration ' + duration + ' 与 nFrames/fps=' + (nFrames / fps) + ' 不符');
    const rootMode = raw.rootMode || 'y';
    if (['y', 'none', 'xyz'].indexOf(rootMode) < 0) fail('rootMode 未识别: ' + rootMode);
    const boneTracks = raw.boneTracks;
    if (!boneTracks || typeof boneTracks !== 'object') fail('缺 boneTracks');
    const names = Object.keys(boneTracks);
    if (!names.length) fail('boneTracks 为空');
    for (let i = 0; i < names.length; i++) {
      const tr = boneTracks[names[i]];
      if (!Array.isArray(tr) || tr.length !== nFrames) fail('轨道 ' + names[i] + ' 帧数 ' + (tr && tr.length) + ' != nFrames ' + nFrames);
      for (let f = 0; f < nFrames; f++) {
        if (!Array.isArray(tr[f]) || tr[f].length !== 4) fail('轨道 ' + names[i] + ' 第 ' + f + ' 帧不是四元数');
      }
    }
    const rootTrack = raw.rootTrack;
    if (!Array.isArray(rootTrack) || rootTrack.length !== nFrames) fail('rootTrack 帧数不符');
    for (let f = 0; f < nFrames; f++) {
      if (!Array.isArray(rootTrack[f]) || rootTrack[f].length !== 3) fail('rootTrack 第 ' + f + ' 帧不是 vec3');
    }
    return {
      fps: fps, nFrames: nFrames, duration: duration, rootMode: rootMode,
      rootScale: raw.rootScale, unitScale: raw.unitScale,
      mappedCount: raw.mappedCount === undefined ? names.length : raw.mappedCount,
      boneTracks: boneTracks, rootTrack: rootTrack, source: raw.source || '',
    };
  }

  /**
   * 把动作轨道绑到模型节点上。任一轨道名在模型里找不到 ⇒ 报错（禁静默跳过）。
   * @returns {{tracks: Array<{node:number, track:Array}>, rootNode:number, rootRest:number[], loopWrap:boolean}}
   */
  function bindToModel(anim, model) {
    const nameIdx = {};
    for (let i = 0; i < model.nodes.trs.length; i++) {
      const nm = model.nodes.trs[i].name;
      if (nm && nameIdx[nm] === undefined) nameIdx[nm] = i;
    }
    const jointName = {};
    for (let j = 0; j < model.jointNodes.length; j++) jointName[model.nodes.trs[model.jointNodes[j]].name] = j;
    const tracks = Object.keys(anim.boneTracks).map(function (nm) {
      const node = nameIdx[nm];
      if (node === undefined) fail('动作含模型里不存在的骨: ' + nm);
      if (jointName[nm] === undefined) fail('轨道 ' + nm + ' 对应节点不是 skin.joints 成员');
      return { node: node, name: nm, track: anim.boneTracks[nm] };
    });
    const rootIdx = nameIdx['Root'];
    if (rootIdx === undefined) fail('模型无名为 Root 的节点，无法施加 rootTrack');
    return {
      tracks: tracks, rootNode: rootIdx, rootRest: model.nodes.trs[rootIdx].t.slice(),
      jointNames: jointName, coveredJoints: tracks.length, loopWrap: true,
    };
  }

  /** 预切 IBM 视图（同样为热路径零分配）。幂等。 */
  function prepareModel(model) {
    if (!model.ibmV) {
      model.ibmV = [];
      for (let j = 0; j < model.jointNodes.length; j++) {
        model.ibmV.push(model.ibm.subarray(j * 16, j * 16 + 16));
      }
    }
    return model;
  }

  /**
   * 预分配姿态缓冲 + 预切视图（热路径零分配 —— subarray 若在循环里调用会每帧产生
   * 数千个临时对象，直接污染 A2 的 jsAnimMs 口径）。
   */
  function createPose(model) {
    prepareModel(model);
    const n = model.nodes.count;
    const nj = model.jointNodes.length;
    const pose = {
      nodeCount: n, jointCount: nj,
      t: new Float32Array(n * 3), q: new Float32Array(n * 4), s: new Float32Array(n * 3),
      localM: new Float32Array(n * 16), worldM: new Float32Array(n * 16),
      palette: new Float32Array(nj * 16),
      tV: [], qV: [], sV: [], localV: [], worldV: [], paletteV: [],
    };
    for (let i = 0; i < n; i++) {
      pose.tV.push(pose.t.subarray(i * 3, i * 3 + 3));
      pose.qV.push(pose.q.subarray(i * 4, i * 4 + 4));
      pose.sV.push(pose.s.subarray(i * 3, i * 3 + 3));
      pose.localV.push(pose.localM.subarray(i * 16, i * 16 + 16));
      pose.worldV.push(pose.worldM.subarray(i * 16, i * 16 + 16));
    }
    for (let j = 0; j < nj; j++) pose.paletteV.push(pose.palette.subarray(j * 16, j * 16 + 16));
    return pose;
  }

  /** 静止姿态写回缓冲（每帧起点）。 */
  function resetPose(pose, model) {
    const trs = model.nodes.trs;
    for (let i = 0; i < pose.nodeCount; i++) {
      const x = trs[i], t = pose.tV[i], q = pose.qV[i], s = pose.sV[i];
      t[0] = x.t[0]; t[1] = x.t[1]; t[2] = x.t[2];
      q[0] = x.q[0]; q[1] = x.q[1]; q[2] = x.q[2]; q[3] = x.q[3];
      s[0] = x.s[0]; s[1] = x.s[1]; s[2] = x.s[2];
    }
  }

  const q4 = new Float32Array(4);

  /**
   * 采样 + 求 41 骨 palette。palette[ji] = world[ jointNode[ji] ] · IBM[ji]。
   * @param {number} timeSec 相位时间（调用方已取模）
   */
  function sampleToPalette(anim, bound, model, pose, timeSec) {
    resetPose(pose, model);
    const nF = anim.nFrames, fps = anim.fps;
    let fi = timeSec * fps;
    fi = fi - Math.floor(fi / nF) * nF;                 // 取模（时间可能已超一圈）
    const i0 = Math.min(nF - 1, Math.floor(fi));
    const i1 = bound.loopWrap ? (i0 + 1) % nF : Math.min(nF - 1, i0 + 1);
    const a = fi - Math.floor(fi);

    for (let i = 0; i < bound.tracks.length; i++) {
      const tr = bound.tracks[i].track;
      math.nlerp(q4, tr[i0], 0, tr[i1], 0, a);
      const q = pose.qV[bound.tracks[i].node];
      q[0] = q4[0]; q[1] = q4[1]; q[2] = q4[2]; q[3] = q4[3];
    }
    // rootTrack：增量叠在静止位移上（与 render.mjs L118-125 同口径）
    const r0 = anim.rootTrack[i0], r1 = anim.rootTrack[i1];
    const rt = pose.tV[bound.rootNode], rr = bound.rootRest;
    rt[0] = rr[0] + (r0[0] * (1 - a) + r1[0] * a);
    rt[1] = rr[1] + (r0[1] * (1 - a) + r1[1] * a);
    rt[2] = rr[2] + (r0[2] * (1 - a) + r1[2] * a);

    // local 矩阵
    for (let i = 0; i < pose.nodeCount; i++) {
      math.fromTRS(pose.localV[i], pose.tV[i], pose.qV[i], pose.sV[i]);
    }
    // world 矩阵（拓扑序，父先于子）
    const order = model.nodes.order, parents = model.nodes.parents;
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      if (parents[i] < 0) pose.worldV[i].set(pose.localV[i]);
      else math.mul(pose.worldV[i], pose.worldV[parents[i]], pose.localV[i]);
    }
    // skin palette = world(joint) · IBM
    const joints = model.jointNodes;
    for (let ji = 0; ji < joints.length; ji++) {
      math.mul(pose.paletteV[ji], pose.worldV[joints[ji]], model.ibmV[ji]);
    }
    return pose.palette;
  }

  return { parseAnim: parseAnim, bindToModel: bindToModel, createPose: createPose, sampleToPalette: sampleToPalette };
});
