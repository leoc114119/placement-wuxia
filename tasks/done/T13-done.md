# T13 交付回执 · 行走帧正规管线（逐姿势 img2img）

> 交付：2026-09-01（R1）· **R2 修复：2026-09-01 L 环打回两项已修** · 执行：ZCode · 状态：**待 L 环复验（Leo）**
> 验收标准（交接文档 §8）：用正规管线生成的达标行走帧接入现有原型 `proto/home_demo/`

## R2 · L 环打回修复（2026-09-01）

| # | Leo 反馈 | 根因 | 修复 | 复验 |
|---|---|---|---|---|
| 1 | 头部走动时大小有变化 | 帧间**头身比漂移**（实测：down 组头宽差 4%/up 13%/side 23%——全身高归一校正不了头部比例） | 新增**头部尺寸归一**：down/side 按面部皮肤垂直跨度（发际→颈底）归一、up 按全身高（背面宽度差=马尾合法摆动）；全局定标中位高 256+全身高钳制 246-266 | **down 散差 0.00% / side 1.63%**（门 ≤6%），连拍六帧头尺寸目视恒定 |
| 2 | 角色区域有背景虚影 | 排查：帧文件 bbox 外零非零 alpha、场景图无烙印残留 → 判定为**边界亮像素半透明羽化(α130)在深色地板上的光晕** + 换帧解码期闪烁的叠加观感 | ①羽化改**去边**（边界亮像素直接抠除）②原型帧**预解码**（全部 decode 完才开播）③**整数像素定位**（消亚像素层抖动） | 连拍无光晕无闪烁；帧文件 bbox 外仍零残留 |

管线脚本同步升级：`measure_head()` 头代理测量 + 两段式归一 + `_head_consistency_pct` 成品门。画布规格与渲染补偿不变（240×320 / 人物 256 / proto 0.196×0.8≈15.7% 屏高）。

## R1 · DoD 勾选

- [x] 管线脚本入库：`scripts/extract_anchor.py`（锚单帧化）+ `scripts/build_walk_frames.py`（抠图/对齐/合成/校验，可复跑）
- [x] 四向 × (4 walk + 1 idle) = 20 帧就位，校验报告零失败（`walk_v2/report.json`）
- [x] proto 接入完成：本地 `python3 -m http.server` 起服后四向行走+idle 全部切换新帧（playwright 实拍 idle/下/上/右四张自检通过）
- [x] contact sheet：`assets/characters/hero/walk_v2/contact_sheet.png`（20 帧一图，供目验）
- [x] 任务箱三同步 + git commit/push（前缀 T13）

## 管线（交接 §5 路线 1 落地）

```
ref_hero_v1.png --extract_anchor--> 单帧锚×3（down/side/up，白底单人）
  --mxai img2img (seedream-5.0-pro, 1:1 2K, 9 份 pose prompt)--> raw ×9（站/迈A/迈B × 3 向）
  --泛洪抠图(边缘播种+连通性,白衣不咬穿)--> cut ×9
  --高度归一 256px + 脚底基线 300 + 质心 x=120 双对齐(240×320 统一画布)-->
  4 帧循环 [站,迈A,站,迈B] × down/up/right + idle ×3
  --right 镜像--> left ×5（规范#10：右=左镜像，不单独生成）
  → 校验门（非空/高度±4%/脚底/质心/触边）全过 → 20 帧
```

## 架构决策说明

1. **锚从 ref_hero_v1 表内裁单帧**而非用整表 img2img：模型对"单角色白底"遵循度远高于"改姿势"，且避开锚表格线裁切问题（extract_anchor.py 用投影法自动剔邻行出血）。
2. **画布 240×320、人物高 256（占画布 80%）**：height 定尺（规范#7）；proto 侧 `hero` 高度 15.7%→19.6%、translate -90%→-92% 补偿，屏高与 Leo 验收过的原版一致（15.7%×0.8≈12.6%…19.6%×0.8=15.7% 不变）。
3. **侧向只生成朝右**（anchor_side=row3 最完整），left 全量镜像派生。
4. **cut/ 中间产物（9.4MB）不入库**：由 raw+脚本确定性可再生，.gitignore 局部排除；raw 底片（2.4MB）留档支持单格修复法（规范#9）。
5. 每帧独立生成+校验门入库（规范#4/#5 的程序化落地），帧间形象一致性实测良好（发型/脸/服装稳定），已知瑕疵：剑的角度帧间略有摆动——原型级可接受，请 Leo 目验裁决。

## 文件清单

| 类型 | 路径 |
|---|---|
| 脚本 | `scripts/extract_anchor.py` · `scripts/build_walk_frames.py` |
| 锚 | `assets/characters/hero/walk_v2/anchors/anchor_{down,side,up}.png` |
| prompt（可复用） | `assets/characters/hero/walk_v2/prompts/{down,up,side}_{stand,stepA,stepB}.txt` ×9 |
| raw 底片 | `assets/characters/hero/walk_v2/raw/` ×9 |
| 成品帧 | `assets/characters/hero/walk_v2/frames/` ×20 = `proto/home_demo/frames_v2/` ×20 |
| 报告 | `walk_v2/report.json`（逐帧指标）· `walk_v2/contact_sheet.png` |
| 原型改动 | `proto/home_demo/index.html`（帧路径/版本号 v7/尺寸补偿三处） |

## Leo 目验指引

1. 看图速览：`assets/characters/hero/walk_v2/contact_sheet.png`
2. 上手跑：`cd proto/home_demo && python3 -m http.server 8222` → 浏览器开 `http://127.0.0.1:8222`，点击地板走动看四向行走+停下 idle（当前会话已在 :8222 起了服务）
3. 看点：①走动是否自然（4 帧循环 180ms/帧）②帧间形象是否跳 ③剑角度摆动是否可接受 ④人物大小与原版是否一致

## 边界自查

未动 `ref_hero_v1.png` 等既有素材；未直出多帧网格；未改正式工程代码（仅 proto 原型）；八向对角帧未做（本卡边界外，待后续卡）。
