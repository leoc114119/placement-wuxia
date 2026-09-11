# Tripo3d Cocos Bridge 扩展 · 安装与使用说明（2026-09-11 · PM2）

**你给的 zip 是 Tripo 官方的 Cocos Creator 扩展，我已经装好并实测通过了。**

---

## 一、它是什么

把「**Tripo Studio 网页 → 下载模型 → 手动导入 Cocos**」这条手工链路，换成**一条 WebSocket 直连**：

```
Tripo Studio（网页）  ──WebSocket 127.0.0.1:60660──▶  Cocos Creator 编辑器
                                                      ├ 自动解包落到 assets/TripoModels/
                                                      ├ 自动导入（生成 .meta、识别为模型资源）
                                                      └ 自动在场景里建节点 + 套材质
```

**对你最直接的好处**：以后 Tripo 网页上生成完，点一下推送，模型**自己进 Cocos 场景**，不用下载再拖。

---

## 二、装在哪

```
~/WorkBuddy/Claw/cocos-skel-test/extensions/tripo3d_cocos_bridge/
```

（`cocos-skel-test` 就是我们那个验证用 Cocos 工程。）

**装法＝整包复制源码**（和上次 MCP 插件一样，这个扩展也**没有 GitHub Release**，走的是官方分发的 zip）：

1. 解压 zip → 整包复制到工程的 `extensions/tripo3d_cocos_bridge/`；
2. `dist/` 是**预编译好的**，不用 `npm run build`；
3. `node_modules/` 里 `ws` + `unzipper` 及其子依赖**已随包带齐**，不用再 `npm install`。

---

## 三、我实测到的（三项，都通过）

| 项 | 结果 |
|---|---|
| 扩展加载 | ✅ `require('./dist/main.js')` 成功，导出 `openPanel / queryState / startServer / stopServer / clearLogs` 五个方法，依赖解析正常 |
| 服务启动 | ✅ `startServer()` 真的绑上 `127.0.0.1:60660`（实测端口被占用后释放） |
| **协议握手** | ✅ 模拟 Tripo Studio 客户端连上 → 收到 `handshake_ack`（`success:true, clientName:"Cocos Creator", protocolVersion:"1.0.0"`）；心跳 `ping` → `pong` 正常 |

> `60660` 端口实测**之前是空闲的**，不会和别的服务打架。

### 它的工作细节（读源码得到的）

- **落盘位置**：`<Cocos工程>/assets/TripoModels/`（自动建目录、重名自动加后缀）；
- **支持的输入格式**：`zip` 和 `fbx` 两种（协议里写死的白名单）；
- **模型识别优先级**：`.fbx` > `.glb` > `.gltf` > `.obj`（压缩包里找主模型文件）；
- **落地后自动**：在场景根节点下**建一个同名节点**，并自动套默认材质；
- **心跳超时**：5 分钟（Tripo Studio 空闲时不会被误判断线）。

---

## 四、怎么用（需要你操作）

**① 重启 Cocos Creator**（扩展是启动时扫描的，装着的时候编辑器是开着的，所以要重启一次才认）。

**② 打开面板**：菜单栏 **扩展 → Tripo Bridge**（打开时它会自己把服务起起来，面板上能看状态/端口/进度/日志）。

**③ Tripo 网页端推送**：在 Tripo Studio 里把模型通过 DCC Bridge 推过来，Cocos 这边会**自动**解包、导入、建节点。

---

## 五、两个我必须说清楚的局限

**1. 它只管「模型传送 + 导入」，不管我们要做的事。**
这个扩展解决的是**「模型怎么进 Cocos」这道搬运工**——**没有解决画风**（3D 渲成 2D 手绘风）的问题，也没解决我们卡住的换手。它让流程顺一点，但不是那条路的生死判据。

**2. 「支持的格式只有 zip / fbx」这一条有歧义，我没验到。**
协议白名单写的是 `zip` 和 `fbx`——**但**同文件里 `findPrimaryModelFile` 的识别列表里**明确包含 `.glb`**（排在 `.fbx` 之后）。合理解释是：**`.fbx` 单文件直传、多文件（含 GLB + 贴图）打成 zip 传**——但这是我从代码推的，**没实测过**（要真的推一次才知道）。
→ **如果推过来不认，改用 zip 试一次**就行。

---

## 六、我没做的事（如实登记）

- **没重启 Cocos、没点过面板**——我是在编辑器外面用 Node 直接加载它的 dist 来测的（等价于验证「代码能跑、协议能通」，但**不等于编辑器里已加载**）；
- **没真推过一个模型**——只做到协议握手，没跑完整条「传输→解包→导入→建节点」；
- 所以**第 ① 步重启之后，如果面板打不开或服务起不来，告诉我，我再查**。
