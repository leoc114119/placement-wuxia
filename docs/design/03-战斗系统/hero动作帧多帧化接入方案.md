# Hero 动作帧多帧化接入方案 v1.0

> 方案日期：2026-09-11
>
> 输入：projbus seq=367（jump 1→5，leftdown 单向 pilot）及 seq=365（战斗移动帧改用 run）；交接文档 tasks/handoff/接入需求-jump-1帧改5帧-20260911.md。
>
> 基座：origin/main 3aa004ddd6970f3933446ed05899ceeb47c057b4。本文件是发卡级方案，不直接改游戏代码。

## 1. 总体裁决

### 1.1 Jump：采纳方案 A

跳跃战斗演出时长保持现行 JUMP 参数不变（基准 2 格 0.6s，距离插值规则不动）。5 帧由跳跃演出实例 ma 的实际 duration 均分：

    frameCount = 5
    progress = clamp(ma.t / ma.duration, 0, 1)
    idx = min(frameCount - 1, floor(progress * frameCount))
    ordinal = 1 + idx

不新增 jumpFrameMs，不复用 walkFrameMs，不把 220ms/帧的预览 GIF 速度带进游戏。2 格跳跃的游戏内每帧约 120ms；长距离跳跃随 ma.duration 增长，帧数仍完整铺满。Jump 是一次性演出，不循环；到达第 5 帧后保持尾帧，直到 ma.duration 结束。

方案 B 把 baseDuration 改为约 1.1s，会改战斗手感，且与现行距离插值冲突，本卡不取。

### 1.2 Run：W1 覆盖 walk（单独卡）

战斗中的“行走表现”仍叫 walk，素材换为 run；推荐 W1：

- 30 张 run 六向 240×320 PNG-8 逐字节导入正式 battle45 路径，命名为 walk_{facing}_{1..5}.png。
- clipCounts.walk 从 2 改为 5；不新增 run clip，不改 stateMap 的移动语义。
- PIECE.walkFrameMs 保持 140ms。run 源的 258ms/帧是离线素材时长，不作为游戏 clock；若采用 258ms，五帧一循环约 1.29s，反而不能解决 Leo 判定的战斗行走偏慢。
- 原 2 帧 walk 文件先移入 archive 并保留 SHA；production 只认新 5 帧 walk 路径。

Jump 与 Run 可分别发卡；二者只共用 clip count helper 和素材预检，不能把 run 的状态时钟改动混进 jump pilot。

## 2. Jump 单向混合帧数结构

当前 DirectionalSpriteProfile 的 clipCounts 是全局值，不能直接把 jump 改成 5：其它五向尚未完成新 5 帧时会在预载期产生缺图。新增可选 per-facing 覆盖，旧 profile 不受影响：

    type BattleClipCounts = Readonly<Record<BattleClip, number>>;

    interface DirectionalSpriteProfile {
      clipCounts: BattleClipCounts; // 未覆盖方向的基线：jump=2
      clipCountsByFacing?: Readonly<
        Partial<Record<BattleFacingHex, Partial<BattleClipCounts>>>
      >;
      frameSrc(clip: BattleClip, facing: BattleFacingHex, ordinal: number): string;
      sharedSrc: Readonly<Partial<Record<BattleClip, string>>>;
      stateMap: DirectionalStateMap;
    }

    function clipCountOf(profile, clip, facing): number {
      return profile.clipCountsByFacing?.[facing]?.[clip] ?? profile.clipCounts[clip];
    }

Hero profile 的 pilot 配置：

    clipCounts: { idle: 1, walk: 2, jump: 2, atk: 2, cast: 3, die: 1 },
    clipCountsByFacing: {
      leftdown: { jump: 5 },
    },

frameSrc 去掉 jump→_2 的单帧特例，统一按 ordinal 拼接。leftdown 新帧消费 jump_leftdown_1..5.png；其它五向保持现有两帧 jump_{facing}_1..2.png。leftdown 原有旧帧不覆盖，先归档并登记 SHA；其它五向旧两帧在本 pilot 保持原正式路径和两帧行为。后续六向 5 帧铺量只增各方向 override 和正式 5 帧，不改渲染接口。

stateMap.jump 可继续写 from:1,to:5；选帧时以 clipCountOf(profile,'jump',actor.facingHex) 将终点钳到该方向实际 count，不需要 stateMapByFacing 第二套结构。

## 3. Jump 精确改动面

1. config/battle-hex.ts
   - Hero profile jump 基线为 2，增加 clipCountsByFacing.leftdown.jump=5。
   - 删除 jump 文件名特例，frameSrc 使用通用 {clip}_{facing}_{ordinal}.png。
   - stateMap.jump 为 { clip:'jump', from:1, to:5 }。
   - 导出 clipCountOf，供 loader、renderer、测试共用。
   - BATTLE_HEX_RES.ver 从 t45v2 bump 到 t45v3；仅为新 jump 资源防缓存，不改 JUMP 数值。
2. ui/battle-hex-render.ts
   - directionalFrameOf 的 jump 分支使用 ma.t / ma.duration 和 clipCountOf，按上式 clamp；不进入 ANIM_LOOP_GROUPS。
   - 只在 ma 存在且 ma.t < ma.duration 时读取 jump；jump 结束回到既有 idle。
   - 保持 hopHeight、moveLerp、脚底锚、FX、HUD、dead 优先级；不改 drawPieces 架构。
3. proto/battle_demo/main.ts
   - directional 预载循环改调用 clipCountOf(profile, clip, facing)，否则 leftdown 的 _3..5 不会被预载。
   - 其余加载、asset gate、URL 版本串沿既有路径；缺图不能以占位判绿。

## 4. Jump 素材 DoR 与正式路径

pilot 只导入 leftdown 五帧：

    candidate:
    assets/_trial_20260911/glb2d_v2/mixamo/jump_6dir/jump_leftdown_1..5.png

    runtime:
    assets/characters/hero/battle45/jump_leftdown_1..5.png

逐张核 240×320、RGBA、alpha 非空、PNG 解码、SHA 清单、脚底/质心/单连通和五帧状态顺序。候选→正式必须同一实质提交包含文件、SHA、runtime manifest/版本和预检证据；禁止直接引用 _trial。

已知内容风险如实保留：当前 Jumping Up 源动作没有真实下落段，p4 是重排的落地缓冲姿态。pilot 的 Leo L 环验收点是起跳→上升→腾空→落地缓冲的过程观感，不宣称真实物理下落已解决；真实下落另立素材替换卡。

## 5. Run 接入卡（seq=365 议题）

Run 卡独立落地 30 张：

    candidate:
    assets/_trial_20260911/glb2d_v2/mixamo/run_6dir/run_{facing}_{1..5}.png

    runtime:
    assets/characters/hero/battle45/walk_{facing}_{1..5}.png

DoR：六向 30/30、240×320 RGBA、PNG-8 无损、路径/SHA、方向键、脚底 y=300、无裁切。旧 walk 两帧归档，不删不复用旧预检。预载后 clipCounts.walk=5，五帧沿 140ms 循环；普通移动的 ma.duration 只负责位置，不重新按移动时长压缩 walk 帧。

Run 预览覆盖 375×667、560×700、900×560，六向至少一张行走截图；重点看跑动节奏比现有 walk 更快/更有动感，脚底不漂，角色尺寸不变。Run 卡不得改 jump 选帧或 jump duration。

## 6. 文件面、禁碰区与拆卡

### Jump-5-leftdown

允许：
- assets/characters/hero/battle45/jump_leftdown_1..5.png、archive/旧 leftdown、SHA/manifest
- config/battle-hex.ts（per-facing count、frameSrc、ver）
- ui/battle-hex-render.ts（jump 选帧纯表现）
- proto/battle_demo/main.ts（预载循环）
- tests/battle-hex-render.test.ts、tests/battle-behavior.test.ts、预览截图/回执

禁止：battle-core、session 行为与数值、JUMP.baseDuration/距离插值、PIECE.moveLerpSec、FX、HUD、其它方向新素材、NPC profile、结算和 config/numbers.ts。

预计 4 小时（高置信；含单向 profile、loader、选帧测试和一档浏览器证据；不含美术等待和 Leo L 环）。

### Run-W1

允许：30 张 run→walk 正式导入、旧 walk 归档、config clipCounts.walk、预载/预检、截图和测试。

禁止：jump pilot 逻辑、JUMP 参数、session 移动规则、NPC 资源、walkFrameMs 以外的数值散落。

预计 4 小时（高置信；素材已齐，主要风险是旧 walk 归档与截图基线更新）。

## 7. DoD 与验收顺序

Jump 卡：
1. 单测证明 leftdown jump 读取 1→5，其他五向只读 1→2；jump 不循环且尾帧保持。
2. 时间采样证明 progress 0、0.2、0.4、0.6、0.8、<1.0 依次显示 1..5；长距离 ma.duration 变长时仍 5 帧铺满；ma.t=duration 后不再查 jump。
3. 预载 gate 只要求 leftdown 五帧新增资源与其它方向两帧旧资源，缺帧红条/非零预检。
4. 375×667 至少一组 leftdown jump 过程截图，另有 560×700 或 900×560 复核；Leo 看起跳、最高点、落地缓冲连续性和脚底不漂。
5. typecheck/lint/build、battle 全量、behavior 全绿；BATTLE_HEX_RES.ver=t45v3；禁止改 JUMP/baseDuration。

Run 卡：
1. 30 张五帧 walk 全量加载、SHA/尺寸/方向/脚底门过；旧两帧 archive 有 SHA。
2. walk 五帧沿 140ms 循环，移动位置仍由 ma.duration；无新 run clip。
3. 三档六向截图与既有交互/e2e 全绿；Leo 看跑动节奏、脚底和尺寸。
4. 两卡都必须提交真实素材/配置/测试或截图，不得提交纯回执。

## 8. 风险时间轴

现在最先爆的是混合 clip count：误改全局 jump=5 会让五个方向在启动 gate 假红；per-facing override 是本 pilot 的结构底线。下一个月的债是 walk/run 与素材源时长不一致，不能用 258ms 机械替代战斗 clock，否则会把“跑得更快”做成更慢。两到三个月后的债是五/六向动作资源一次性预载带来的包体与驻留压力，按场景预载与 LRU 另立资源卡。
