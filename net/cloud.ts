// 云函数调用封装（mock）：T02 仅打桩，T07 接微信云开发
// 接口形状按 AGENTS.md 施工守则 4「接口先定」：先定契约，实现后补

/** 云函数调用结果 */
export interface CloudResult<T> {
  ok: boolean;
  data?: T;
  errMsg?: string;
}

/** 调用云函数（mock：本地直接 reject，待 T07 接 wx.cloud.callFunction） */
export function callCloud<T>(_name: string, _payload?: object): Promise<CloudResult<T>> {
  return Promise.resolve({ ok: false, errMsg: 'cloud not wired (mock)' });
}
