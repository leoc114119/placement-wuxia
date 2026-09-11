# Cocos 骨骼装配 · 第 1 步验证结果（2026-09-11）

**环境**：Cocos Creator 3.8.8 + Cocos MCP Pro v1.8.1（3 天试用中）
**项目**：`~/WorkBuddy/Claw/cocos-skel-test`
**方式**：**我通过 MCP 直接驱动编辑器**（curl 调 JSON-RPC，无需重启 ZCode 即可操作）

---

## 一、做成了什么

| # | 步骤 | 结果 |
|---|---|---|
| 1 | Cocos MCP 接入 | ✅ 服务在 `127.0.0.1:3000/mcp`，**16 个工具**，license VALID |
| 2 | 导入 10 个部件 | ✅ 全部自动生成 Texture2D + SpriteFrame |
| 3 | **建节点层级（"骨骼"）** | ✅ `Hero → {Torso, Head, UarmA/B, FarmA/B, ThighA/B, ShinA/B}` **10 个节点** |
| 4 | 装 Sprite + 设正确尺寸 | ✅ 10/10（`UITransform.contentSize` = 部件真实像素尺寸） |
| 5 | **按关节对位装配** | ✅ **角色完整拼出**（见 `/tmp/hero_crop.png`）——头/躯干/双臂/双腿位置正确 |
| 6 | **旋转手臂（换手的基础）** | ✅ **旋转生效**：右臂从"前伸"转为"收在身侧"（见 `/tmp/hero_punch_test.png`） |

**关键结论：Cocos 的 Sprite 节点 + 层级 + 旋转，确实能驱动部件做动作。**
**这验证了骨骼路线的可行性**——不需要逐帧重画，动作靠"改节点变换"。

## 二、这次最重要的技术发现

### 2.1 **我可以直接驱动 Cocos，不需要重启 ZCode**
MCP 是 HTTP + JSON-RPC 接口，**我用 curl 就能调**（`initialize` → `tools/call`）。这绕开了"新 MCP 要重启客户端"的限制。

### 2.2 MCP 提供的动画能力（Pro 版专属）
| 工具 | 能力 |
|---|---|
| `cocos_builder` | **一次调用建完整节点树**（我用它建了 10 节点层级） |
| `cocos_node` | 节点增删改（position/rotation/scale/父子） |
| `cocos_component` | 组件增删改属性（Sprite 的 sizeMode/spriteFrame 等） |
| **`cocos_animation`** | **关键帧、轨道、事件、预设**（14 种动作） |
| `cocos_capture` | 截图（可裁 UI，我用来做视觉验证） |
| `cocos_spine` | Spine 骨骼动画管理 |

### 2.3 踩到的坑（记录下来避免重复）
1. **`cc.Sprite` 不能用 builder 的 `props` 直接设 spriteFrame** → 报 `ctor with name [object Object] is not a child class of Component`；正确做法：**先 `component add cc.Sprite`，再 `set_property spriteFrame`**；
2. **Sprite 的 `_sizeMode` 枚举**：0=CUSTOM / 2=RAW（不是 TRIMMED）→ 设 contentSize 更可靠；
3. **部件要对"关节"（连接点）而非"中心点"** 对位，否则四肢会脱开。

## 三、目前的效果与不足（如实说）

**效果**：
- 角色完整、比例正常（比我在 Python 里手工切的版本好得多）；
- 因为部件是 AI 画的**完整部件（含连接处）**，**关节接缝明显优于"硬切"方案**；
- 换手 = 旋转两个节点，**100% 确定、零成本**。

**不足**：
1. **旋转后仍有轻微脱节**——纯节点旋转是刚性的，关节处会露缝（需要"关节补片"或 mesh 变形改善）；
2. **手臂对位还需精调**（我目前是手算坐标，有偏差）；
3. **还没做出连贯动画**（只验证了单帧旋转）。

## 四、下一步（建议）

### 立刻可做（我有 MCP 权限，成本 0）
1. **精调装配坐标**——把各关节对准（改 10 个节点的 position）；
2. **用 `cocos_animation` 做三帧出拳动画**——帧1 右拳 → 帧2 换左拳 → 帧3 换回；
3. **导出 GIF/连续截图给你看观感**。

### 需要你决定的
- **观感能否接受**（这是骨骼路线的生死判据）；
- 若接受 → 评估正式迁移（现有 6346 行代码）；
- 若不接受 → 说明需要 mesh 变形（Spine 的能力），或改动作设计。

## 五、资产位置
```
~/WorkBuddy/Claw/cocos-skel-test/          Cocos 项目（含 Hero 节点树、10 个部件）
/tmp/hero_crop.png                          装配效果（放大）
/tmp/hero_punch_test.png                    旋转手臂后的效果
/tmp/cocos_drive.py, assemble*.py           我写的 MCP 驱动脚本
```
