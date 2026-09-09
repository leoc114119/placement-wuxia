# T45 主角武器 frame06 `idle_rightdown` · 精准拳头遮罩修复 v9 交接

Leo 对 v8 放大遮罩标注两处修正：蓝框区域遮多了，红框区域漏遮。本版按放大标注映射回原图像素修复，身体、握点、剑轴与武器源冻结。

- 蓝框去遮：原图像素 `x=101..112, y=181..186`，移除过宽顶层遮罩，让上方标注剑柄保持可见。
- 红框补遮：原图像素 `x=97..103, y=189..197`，恢复拳头顶层遮罩，完全盖住中间漏出的剑柄。
- 握点仍为镜像源 `(74,185)` → 拳心 `(102,195)`，平移 `(+43,-13)`。
- 剑轴仍为 `-75°`，朝人物脸部转 15°；图层仍为身体底图 → 武器 → 精准拳头顶层。
- QA：`allMachineChecksPass=true`；拳区武器 `112→0`；蓝框移除 40 像素，红框补遮 63 像素；runtime 未改、生成 credits=0。
- `runtimeRelease=false`，候选待 Leo 视觉门与 PM 第二道规格门。

活动包：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v9-precise-fist-mask-repair/`
