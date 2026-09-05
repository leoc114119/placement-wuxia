# ART×ARCH 沟通线程 · 美术窗口 ↔ 主架构

> 建立：2026-09-04（Leo 令：美术线有问题直接和主架构沟通，ZCode PM 留意沟通情况）
> **机制（09-04 晚定）**：美术窗口直接 spawn 主架构子代理，会话跨窗口不可见——留痕靠 `.zcode/agents/architect.md` 的「美术线咨询处置」硬规则：**主架构每次答复美术咨询，答完立即写入本文件 + LOG 记一行**，无例外。哪个窗口 spawn 都受此约束（代理定义为仓库文件）。
> 监督人：ZCode（PM）——开工/发卡前扫本文件尾部，盯三件事：①答复与规格/盘点口径一致 ②无越界（改需求文档/研发代码只登记报 PM）③无悬空未答问题

## 提问格式

```
### Q<n> · 09-XX · 美术窗口
问题原文（含涉及文件/规格条目编号）
→ 主架构答复 · 09-XX
（答复原文，需改规格/文档的注明改哪份哪节）
```

## 沟通记录

### Q1 · 09-04 · 美术窗口
《T45 战斗帧 45°-需求文档 v2.0》§8 四条接口待研发线口径（Leo 授权直通）：①FACE-1 flat-top 术语勘误 ②§8.1 左系镜像交付形态二选一 ③§8.3 weapon_anchor 元数据格式二选一 ④C1 上下固定战场点缀进度确认。
→ 主架构答复 · 09-04
①**勘误已执行**：FACE-1「flat-top」更正为「pointy-top（上下尖）+ 奇偶行错位半格布点」（drawTile 顶点序/TILE_SPEC 为证，结论六向不变），改 `docs/design/03-战斗系统/战斗交互行为规格.md` FACE-1 条目 + 更新记录留痕。②**§8.1=方案 A**：美术管线直接产出左系 PNG 成品（156 文件）——渲染路径零分支（B 案翻转知识横切多点化，违背《战斗交互行为规格》§八决策点收敛教训）、包体差异仅 ≈+3.7MB 且两案同走分包/外置、帧表六向平铺无 flip 语义；已写进需求文档 §8.1。③**§8.3=方案 B**：代码常量表（建议 config/battle-frames-meta.ts，ADR-004 只读展示参数口径）——类型咬合+三零门覆盖+同步零 IO；管线 json manifest 保留为交付源，实装卡誊录+逐帧 diff 对表；已写进 §8.3。④**C1 规格文档已存在**：`docs/design/03-战斗系统/战斗上下点缀规格口径-v0.1.md`（commit edcbb80），🟡 停等 Leo 审阅（3 开放点），素材未产/研发接线未开工/无独立任务卡——如实登记，未代拟。四条详据：`tasks/answers/A1-T45-sixdir-interfaces.md`；需求文档状态同步为「§8 四条全闭·待 Leo 发单」。

### H2 · 09-05 · Codex 美术管线迁移交接

Leo 已决定新美术生产全面迁移至 Codex 原生 ImageGen；右上方向第 2 帧 `atk_rightup_2_attempt4.png` 视觉选定，现文件 1086×1448、无 alpha，仍是规格 FAIL，禁止接线。v1.2 已复核 A2：F7 一期整包应为 20MB；F4 仅能断言当前调用点给包内路径；六向建议从 session 既有 `hexFacing` 导出新字段并保留 legacy 二值 facing。详细正文与 ACK 要求见 `tasks/handoff/T45-Codex原生美术管线迁移-交接-v1.2-2026-09-05.md`（messageId `T45-CX-ZC-001`）。

### H3 · 09-05 · Codex 美术窗口

Leo 将 T45 动作改为逐张确认；死亡动作收敛为一张通用 `die` 帧，六向复用，1a 其余批量帧暂缓。基于 Leo 提供的倒地参考图试做透明版：原生去背景尝试改变了主体比例/构图，判定不采纳；保留源图像素的确定性泛洪抠图候选已落 `assets/_trial_20260905/t45_die_common_codex_native/normalized/die_common.png`（240×320 RGBA，宽 210，底线 y=300，质心 x=119.7），尚未覆盖正式资产，待 Leo 目验。

### H4 · 09-05 · Codex 美术窗口

Leo 确认通用死亡帧候选合格，并强调透明版本、240×320 画布与现有帧规格一致。已将候选写入 `assets/characters/hero/battle45/die_down.png` 作为六向缺向回退的共用死亡帧；其余 1a 动作仍暂停，未提交/未发交付。

### H5 · 09-05 · Codex 美术窗口

Leo 转入行走帧逐张审看。先展示 `walk_right_1` 首轮候选（由既有双格原生候选右半格确定性切出并归一，240×320 RGBA、视觉高 256、底线 y=300、质心 x=119.9），尚未生成第二版或写入正式目录，待 Leo 先判步态。

### H6 · 09-05 · Codex 美术窗口

Leo 指出行走步幅过大，并确认行走应由左右脚交替的两帧组成。`walk_right_1` 已用第 2 次原生编辑把步幅收小；`walk_right_2` 仍是首轮候选，已切出组成两帧对照，规格均为 240×320 / 视觉高 256 / 底线 y=300 / 质心约 120，尚未入正式目录，等待继续判定。

### H7 · 09-05 · Codex 美术窗口

Leo 明确第二帧需为人物自身右脚在前，并要求沿用已收小步幅。`walk_right_2` 已完成第 2 次、也是最后一次原生编辑；候选已归一为 240×320 RGBA（视觉高 256、底线 y=300、质心 x=119.6），形成 `walk_pair_attempt2.png` 对照，尚未入正式目录，待 Leo 目验；若相位仍不对则按上限停手，不再生成。

### H8 · 09-05 · Codex 美术窗口

自查发现两帧头顶均 y=44、脚底均 y=300，但主色躯干/肩部连通块起始行约为 `walk_right_1` y=157、`walk_right_2` y=153，肩高相差约 4px。结论：循环帧应统一肩高，否则可能有上下抖动；当前 pair 不入正式目录。`walk_right_2` 已用完 2 次原生尝试，继续重生会违反上限；不做未经批准的程序化硬拼。

### H9 · 09-05 · Codex 美术窗口

Leo 明确：原生尝试次数限制只适用于自动处理，协作调试阶段不设上限。按此口径连续微调 `walk_right_2` 的肩线；第 5 版与 `walk_right_1_attempt2` 对照后，肩部起始行约 y=156 vs y=157，视觉差约 1px，步幅/人物自身右脚在前/脚底 y=300 均保持。Leo 已确认通过，透明化复核合格，正式写入 `assets/characters/hero/battle45/walk_right_2.png`（240×320 RGBA，bbox 37,44–196,300）。未提交/未发交付，等待后续步行帧继续确认。

### H10 · 09-05 · Codex 美术窗口

Leo 确认继续入库并查看跳跃双帧。`walk_right_1_attempt2` 已通过透明化规格复核并写入 `assets/characters/hero/battle45/walk_right_1.png`（240×320 RGBA，bbox 39,44–200,300）；与已入库 `walk_right_2.png` 组成右向行走双帧。跳跃 `jump_right_1/2` 仅从双格候选右半格切出并归一为透明 RGBA 240×320（两帧视觉高 256、脚底 y=300），对照图 `assets/_trial_20260905/t45_batch1a_codex_native/contact/jump_pair_attempt1.png`，尚未入正式目录，待 Leo 目验。

### H11 · 09-05 · Codex 美术窗口

Leo 确认跳跃双帧通过。`jump_right_1_attempt3`（静止基础上明确微屈膝、骨盆小幅下沉）与 `jump_right_2_attempt2`（双手下垂微开、双脚前后错开、微弓腿向右前冲飞）已透明化复核并写入正式目录 `assets/characters/hero/battle45/jump_right_{1,2}.png`，均 240×320 RGBA、视觉高 256、脚底 y=300。随后切入普攻起手 `atk_right_1`，首轮双格候选已切出透明归一版本与 idle 对照 `assets/_trial_20260905/t45_batch1a_codex_native/contact/atk_right_1_compare_idle.png`，尚未入正式目录，待 Leo 目验。

### H12 · 09-05 · Codex 美术窗口

Leo 确认右向普攻两帧通过：第一帧为人物自身右手抬至右胸偏下的预备位；第二帧保持同一手从近侧肩横过衣襟、朝画面右侧作胸下缘高度的直刺，无武器。已写入正式目录 `assets/characters/hero/battle45/atk_right_{1,2}.png`；均为 240×320 RGBA 透明底、前景顶端 y=44、脚底基线 y=300（bbox 分别为 45,44–193,300 与 46,44–217,300）。原生背景格纹未被采纳为素材内容，仅作确定性连通域透明化；未提交、未发交付。

### H13 · 09-05 · Codex 美术窗口

Leo 定稿右向施放三帧：`cast_right_1` 举起虚握剑柄的右手；`cast_right_2` 向角色自身左下（画面右下）轻度背斜甩击；`cast_right_3` 向角色自身右下（画面左下）收短反向甩击。全程空手，武器留渲染层组合；双脚保持原地战斗站姿，头部仅轻微侧转。三帧已写入 `assets/characters/hero/battle45/cast_right_{1,2,3}.png`，均为 240×320 RGBA 透明底、顶端 y=44、脚底 y=300（bbox 47,44–193,300 / 21,44–212,300 / 13,44–197,300）。未提交、未发交付；Leo 指示本轮先停在此处。

### H14 · 09-05 · Codex 美术窗口

Leo 复看施放第三帧，指出角色自身右手/动作臂偏长。已用原生编辑生成收短候选，归一为 240×320 RGBA 并生成三帧对照 `assets/_trial_20260905/t45_batch1a_codex_native/contact/cast_triplet_attempt5.png`；正式 `cast_right_3.png` 暂不覆盖，等待 Leo 最终确认。故 T45 批 1a 当前仍未闭环。

### H15 · 09-05 · Codex 美术窗口

Leo 确认收短版 `cast_right_3`。已覆盖正式 `assets/characters/hero/battle45/cast_right_3.png`；规格复核通过：RGBA、240×320、透明 alpha、bbox 13,44–197,300。T45 批 1a 帧产出闭环完成，尚未提交/发 delivery。
