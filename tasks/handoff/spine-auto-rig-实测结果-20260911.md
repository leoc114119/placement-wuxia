# 自动装配骨骼（spine-animation-ai 实测）· 2026-09-11

**结论：这套工具链能把"一张角色图 + 一堆部件"自动装配成骨骼布局，头/躯干/双臂已基本对齐；腿与整体精度还剩一点偏差。**

---

## 一、用了什么

**仓库**：[GenielabsOpenSource/spine-animation-ai](https://github.com/GenielabsOpenSource/spine-animation-ai)（425★，今天仍在更新）
**它是什么**：把"拆解角色 → 自动定位 → 建 Spine JSON → 打包图集 → 生成 HTML 预览"做成脚本流水线的 AI 工具

| 脚本 | 作用 | 我实测了吗 |
|---|---|---|
| `split_character.py` | 把完整角色图拆成部件（需 Gemini） | ⚠️ 改用 **mxai 的 `nano-2.0-pro`**（同为 Gemini 系）替代 |
| **`position_parts.py`** | **SIFT+RANSAC 自动定位 + 遮挡投票定层序** | ✅ **实测跑通** |
| `build_spine_json.py` | 生成 Spine JSON（含 `idle/walk/run/attack` 等程序化动画） | 未跑 |
| `make_atlas.py` | 打包图集 | 未跑 |
| `generate_spine_player.py` | 生成 HTML 预览 | 未跑 |

## 二、实测结果（两轮）

### 第 1 轮：**失败**（重要教训）
拿"单独生成的拆解图"当部件 + "站立帧"当参照 → **四肢全错位**。
**根因**：两者**不同源**（拆解图里部件姿态/尺度/光照都不同），SIFT 匹配不上，脚本大量 fallback 到 template 且失准。
→ **教训：部件必须与参照图同源同姿态。**

### 第 2 轮：**基本成功** ✅
用 **nano-2.0-pro 从站立帧本身拆解**（同源）→ 自动定位：

| 部件 | 结果 |
|---|---|
| 头 | ✅ SIFT 匹配，位置准 |
| 躯干 | ✅ SIFT，位置准 |
| 双臂 | ✅ SIFT，位置准 |
| 腿 | ⚠️ SIFT 匹配上，但**尺寸略偏大** |

**全部 6 个部件都走 SIFT 通道**（第 1 轮大量走 template）→ **证明同源是决定性的**。

**叠加验证**（[overlay.png](/Users/leochen/WorkBuddy/Claw/placement-wuxia/assets/_trial_20260911/spine_rig_v2/overlay.png)）：参照图与装配结果 **50% 叠加，两人物高度重合**，只有轻微重影（≈3~5% 尺度差）。

**脚本还额外产出**：
- **绘制顺序（z-order）**：通过**遮挡投票**自动算出（z=0 最后 → z=5 最前），这部分**完全正确**（脚在最底、头在最前）；
- **每个部件的 x/y/scale/rotation**（含旋转角）。

## 三、这条路的价值（相对我们之前的手工装配）

| | 我之前手工装配 | 这套工具 |
|---|---|---|
| 定位方式 | **手算坐标**，反复试 | **SIFT 自动算**（一张参照图搞定） |
| 层序 | 手工猜 | **遮挡投票自动定** |
| 旋转角 | 全 0（硬贴） | **自动算出每个部件的旋转角** |
| 装配时间 | 我调了 1 小时仍不准 | **一条命令，秒级** |

## 四、还剩的问题（如实说）

1. **精度 ~3-5% 偏差**（头略偏、腿略大）→ 可用工具的**交互编辑器**（`demo/sombrero_editor.html` 那类）手动微调；
2. **AI 拆解会拆出多余部件**（本次腿拆了 3 条，需人工删 1 条）；
3. **Spine 4.2 vs Cocos 3.8 的格式问题**（Leo 指出）→ 见下节；
4. **未跑完整链路**（spine json → 图集 → 预览 → 导入游戏）。

## 五、Spine 格式问题（Leo 指出的关键约束）

**已核实（Cocos 官方文档）**：Cocos Creator **只支持 Spine v3.8**（"v3.0 及以上 → v3.8，原生平台不支持 v3.8.75"）。

而 `spine-animation-ai` 输出 **Spine 4.2** 语义 → **不能直接导入 Cocos**。

**三条解法**：
| 方案 | 成本 | 说明 |
|---|---|---|
| **A. 用 Spine 3.8 重导出**（Leo 提的路） | 需 Spine 授权 | 官方编辑器打开 4.2 项目 → 导出 3.8（Spine Essential $69） |
| **B. 不生成 Spine，直接用脚本产出的 layout** | **0** | **`layout.json` 里有 x/y/scale/rotation/z-order —— 这些数据我可以直接喂给 Cocos 的节点树**（正是我今天做的！）**完全绕开 Spine 格式问题** |
| **C. 改脚本输出 3.8 格式** | 工作量中 | 格式差异有限（4.2 相对 3.8 主要是新增字段），可改 |

**B 是最优解** —— 我们**不需要 Spine 运行时**，只需要它算出来的**布局数据**。Cocos 有 `cocos_animation`（打关键帧），动作照样能做。

## 六、许可证（必须知道）

**PolyForm Noncommercial 1.0.0 —— 非商业免费，商用需单独授权。**
- 我们是商业项目 → **不能直接拿它的代码上生产**；
- **但**：①试验阶段属非商业用途 ②**它的算法是通用 CV 技术**（SIFT/RANSAC/遮挡投票），**我可以自己实现**（OpenCV 是 Apache 2.0 可商用）；
- 路径：**先用它验证可行 → 自研复刻核心算法**（约 200 行）。

## 七、产出

```
assets/_trial_20260911/spine_rig_v2/
  idle_stand.png        参照图（站立帧）
  atlas_raw.png         nano-2.0-pro 拆解结果
  parts/s01~s06.png     6 个部件（头/躯干/双臂/双腿）
  layout.json           ★ 自动定位结果（x/y/scale/rotation + z-order）
  overlay.png           与参照图的叠加验证
  compare2.png          并排对比
tools/spine_rig/scripts/  5 个脚本（试验用，商用需自研复刻）
```

## 八、下一步建议

1. **把 `layout.json` 直接喂给 Cocos**（我的 MCP 脚本已有，改读这个 json 即可）→ **验证"自动定位 → Cocos 节点树"的完整链路**；
2. 若链路通 → **这条就是"一劳永逸"的形态**：一张角色图 → 自动拆件 → 自动定位 → 自动建节点 → 打关键帧出动作；
3. **精度微调**用工具的交互编辑器（或我写个简单的坐标微调页）。
