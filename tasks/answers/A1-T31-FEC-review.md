# T31-FE-C 终验与代验追认

主架构，2026-09-14；对象 `76698ca001a84aa2860a5b22c91857098784afaa`，对应 seq=422/423。

结论：**rejected_pending_fix**。独立 typecheck/lint/build、battle 752 passed/14 skipped、behavior14/14、build.mjs --check 通过。核对 P0 修改、宿主恢复与原始设备数据；本轮未独立重跑三套 sim。

## 已证与追认范围

HONOR run10 文件数值满足容量门：20u=3609样本/60.015s，fpsMedian62.5、P95=18ms、P99=33ms、over50=0.00055（0.055%），draw/palette20/20、零contextLost/GLerr、FXAA。历史记录含冷3次与热3次。但文件当前未跟踪，env.commitSha为空；需随实质证据提交建立源码/产物/运行对应关系。

上下文 `extAvailable=false/injectionMode=host-api-fallback/restoreVia=rebuild`：认可新建canvas/context后重装配路径的 ALTERNATE_ONLY_PASS；不升级为真机真实GL丢失事件已覆盖。

认可 Leo 单次授权的本地代验与其独立预检记录；将50950c6a的 accepted 限定为浏览器/静态预检可进入真机验证。旧版本后续暴露动态求值和ES2020编译阻断，故不追认为无条件平台技术通过，也不外推至五个P0修复后的版本。三条P2随SUMMARY/真机回填一起更正。

## 阻塞与资产契约裁定

1. **结构形状不等于资产身份。** 对 idle 真源的40条旋转轨全部替换为[0,0,0,1]、rootTrack全清零后，validateClipJsonStructure仍返回errors=[]。该模式不能替代冻结SHA门，更不能证明测的是同一套动作。正式CDN保持严格byteLength+SHA；包内smoke动作采用构建时原样复制的`.bin`载荷（mediaType仍application/json，解码后照常解析），先验证目标微信管线读回SHA与源一致，不假定改扩展名必然有效。字节保真未通过前停在该资源门；structural仅保留明确诊断用途，不允许用于正式Device-PASS。若平台仍改写，另报等价性证明方案，不静默放宽。
2. **缓存版本与观测不闭合。** loader的cachedForManifest在structural分支忽略ref.sha256/byteLength，旧assetId可跨内容版本永久命中；cache-hit仅核长度/形状，却将cached.sha256填作observedSha256，没有读盘复算。缓存键必须绑定期望内容版本；热命中核实际文件摘要，检测同长度损坏与版本升级，失败摘除/重取。未知摘要不得以清单或索引伪装为observed。新增“同id新版本必须刷新”“同长度改旋转不得命中”的负例。
3. **证据与S1交付缺口。** 提交run10原始JSON（不得修改历史值），补SUMMARY真实值/三P2，并附产物SHA、测试版本映射与实际截图。生产CDN/白名单/断网路径当前明确未执行，不能宣布S1全完成；可单独签包内runtime结果，CDN验收须补齐或由Leo/PM书面调整本期范围。

平台机制更正：本机对726299B源做JSON.stringify(JSON.parse(source))实得685959B，SHA=de192911a3e232edac727a674f7f6ac8175d8abe43299e591ef4d81f31ea3b1b；设备685411B，差548B。首尾格式支持“平台重序列化”的推断，不足以证明全文件值等价或具体实现就是一次JSON.stringify。完整性修复后按新载荷重跑冷/热与容量门，旧数据留历史。

## 下一步

frontend增量修资源完整性/缓存版本，PM补证据提交与CDN验收前置。修后重送；本轮不放行S1归档或S2施工。推荐先完成已批准S1的CDN链路和浏览器效果/真机验收，再按方案准备S2敌型资产与接入卡。没有新增第二台安卓硬门，原联合豁免保持。
