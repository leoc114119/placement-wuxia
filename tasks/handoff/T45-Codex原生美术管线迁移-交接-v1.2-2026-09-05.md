# T45 · Codex 原生美术管线迁移交接 v1.2

```yaml
messageId: T45-CX-ZC-001
taskId: T45
from: Codex
to: ZCode
baseCommit: 8d7bb7b
manifestVersion: proposal-v1
status: architecture-review-ready
nextOwner: ZCode 主架构
```

## 一、已定结论

1. Leo 已决定新美术生产全面迁移到 Codex 原生 ImageGen，mxai 退出所有新任务。
2. `atk_rightup_2_attempt4.png` 已获 Leo 视觉选择；现文件 1086×1448、无 alpha，状态为 `raw / visual-selected / spec-fail / not-handed-off`，禁止直接接线。
3. 扣图保留为条件分支：真实 alpha 直通；纯色隔离底走确定性连通域；白衣/发丝复杂边缘才允许一次原生语义扣图并复查身份。
4. 新动作继续“right 三帧序列表母版 → rightup/rightdown 整表转面 → 左系确定性镜像”；局部返修才逐帧编辑，每帧最多两次生成式尝试。
5. 生产树与运行时树分开；Codex 交付 manifest，ZCode 常量表是接线后的运行时真源，两者必须机器 diff。

## 二、主架构事实修订

- A2 F7 错误：一期基线为主包 ≤4MB、整包 ≤20MB；30MB 仅开通虚拟支付后。
- F4 应写“当前调用点只供应包内路径”；`loadImage(src)` 本身未拒绝 URL/缓存路径。
- 六向接线建议从 session 已有 `Runner.hexFacing` 单点导出 `facingHex`/`direction6`，保留旧二值 `BattleFacing` 供 legacy billboard 降级。
- 多层 Canvas 绘制和 palette runtime 的性能数字尚无真机证据，必须先 spike，不能写成既定性能结论。

## 三、详细证据

| 文件 | 用途 | SHA-256 |
|---|---|---|
| `docs/reviews/美术管线动作帧生产与复用体系-研究报告-2026-09-05.md` | v1.2 融合报告、F1~F10、七项意见、迁移顺序 | `236af3f779eb29bcbf13a4ad192feacaf0ef2481df4d73f921d5c783b8eb43b9` |
| `docs/reviews/Codex原生美术管线执行手册-v1.0.md` | 已安装项目级 Codex skill 的审查同源副本 | `5012ce39e967fa8719e229e0a408aaa9c3b42e7bd444fa94907a58b35709064d` |
| `assets/_trial_20260905/t45_native_opt/candidates/atk_rightup_2_attempt4.png` | Leo 视觉选定的迁移金丝雀 raw | `9f9b96bf46acc1268274ee47573b130bc9cc9b33105204c6c883adf1d7c4e0a7` |
| `assets/_trial_20260905/t45_native_opt/REPORT.md` | 原生试产次数、失败事实和视觉选定状态 | 随工作树复核 |

## 四、请求 ZCode 的下一步

请主架构只做方案/任务卡承接，不在本交接内直接改代码：

1. 回显 `messageId=T45-CX-ZC-001 / baseCommit=8d7bb7b / manifestVersion=proposal-v1`，确认读取同一基线；
2. 评审 manifest schema 中 role/skin 资产键、palette 渲染变体、六向方向字段、legacy/directional 表型和 weapon anchor；
3. 拆一张独立研发卡，范围限定为 `facingHex` 快照导出、六向帧表、资源三态解析/LRU、manifest→常量表 diff 和真机 spike；
4. 不把当前 attempt4 当成已交接素材；等 Codex 报 `specGate=pass` 并提交 release manifest 后再接线。

## 五、不得做事项

- 不覆盖 `assets/characters/hero/battle45/atk_rightup_2.png`；
- 不在研发卡中重新生成或审美修改素材；
- 不把旧二值 facing 与六向成品同时翻转；
- 不以 30MB 作为一期预算；
- 不删除 mxai 历史脚本或旧批次记录，退役清理另卡处理。

## 六、回复路径

详细回复落 `tasks/answers/`，`tasks/threads/ART-ARCH.md` 与 `tasks/LOG.md` 只写摘要和指针。若 Codex 侧无法直接唤醒 ZCode，由 Leo 转告本交接路径。
