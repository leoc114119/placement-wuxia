# T31-FE-B 技术验收与 Q1/Q2 裁定

2026-09-14，主架构；对象 `03e2d3af00a850552998aac0023c09ceb4d18278`。

结论：`rejected_pending_fix`。独立 typecheck/lint/build 全过，battle 674 passed/14 skipped，behavior 14/14；本轮未重跑视觉脚本，不把 PM 的 48/48 写成主架构独立实测。已核代码改动边界与问件。

## Q1：采用修订乙，保存演出创建时的意图

我的 9e824cb5 每帧直传要求漏掉了 session 300ms 与 view 0.6–1.2s 的窗口差异，现修正。MoveAnim 增 `isJumpMove`，创建时赋快照 isJump，command 在当前有效移动演出期间消费该值，结束/替换/死亡/reset 释放；不按 hopPx 猜、不拉长 session 窗口。由 frontend 修 `battle-hex-render.ts` 与 types/方案注释；CharacterAnimController 保持显式布尔判据。无需 backend 卡。

必须新增真实 session→view→command→controller 的回归：300ms 后快照 false，顶点/降段仍 jump；0.6s/1.2s、x1/x2、起落 hop=0、普通移动、死亡/reset/后续普通移动不串状态。重录 jump 时间线并记录 activeClipKey，不仅保存图片。

## Q2 三项

1. 配置参考高为逻辑像素，运行时 profile 为物理像素，保留宿主 ×pixelRatio 桥接；改 config 的错误物理像素注释。无需增 pass.pixelRatio，避免重复换算。DPR 1/2/3 锁逻辑高度一致。
2. 投影未初始化的归因驳回。renderer.ts 的 beginFrame 在上传 uProjection 前调用 orthoPixel；正常 pass.render 必调 beginFrame。按目标尺寸创建 canvas，移除 1×1 绕过和错误注释；加“同尺寸首调 resize→beginFrame→投影非零”回归。无需卡 A 算法修复。
3. PM 将本次方案修订带入施工分支，保证分支文档与代码一致。不要仅补旧 9e824cb5 两行而漏本次演出窗修订。

## 第二条 blocker：上下文重建失败未暂停对局

main.ts restored 回调只 showCharacter3DGate；loop 仍无条件 session.tick 并续排 RAF，retry 又 bootstrap 启第二条循环。补宿主运行状态：重建终失败时停止 tick/输入推进；重试保证单一 RAF、释放旧 renderer/监听，恢复时重置 last，避免补算停留时间。用失败注入断言 tick 停止、多次点击重试只产生一个循环。短暂 context-lost 的策略沿方案，终失败必须暂停。

上述两项行为修复与 Q2 文档收口后重送；FE-C 等此次验收通过再派。保留 S0 联合豁免，未新增设备门槛。
