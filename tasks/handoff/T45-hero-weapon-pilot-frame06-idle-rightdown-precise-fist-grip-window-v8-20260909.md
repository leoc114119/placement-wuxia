# T45 主角武器 frame06 `idle_rightdown` · 精准拳头遮罩握点窗口 v8 交接

Leo 指出 v7 完整拳头顶层把握点剑柄遮住。本版保留拳头完整外轮廓顶层，只在标注握点开 3px 半径的小型棕色剑柄窗口，恢复握点可见。

- 握点：镜像源 `(74,185)` → 拳心控制像素 `(102,195)`，平移 `(+43,-13)`
- 剑轴：`-75°`，朝脸部转 15°
- 图层：身体底图 → 武器 → 精准拳头顶层；仅握点窗口透出剑柄
- QA：`allMachineChecksPass=true`；遮罩内武器 `123→0`；允许握点窗口武器像素 `15`
- `runtimeRelease=false`，候选待 Leo 目验与 PM 第二道规格门

活动包：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v8-precise-fist-grip-window/`
