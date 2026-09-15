# T31/T32 最近11提交技术审核（seq=448）

2026-09-15，主架构Codex。范围：8d3a235f → 1eff38f2a0fe8ab75935bedb9ca6bd12d284eb82。

## 结论

**rejected_pending_fix**。正常路径的PM/Leo目验通过记录保留，本轮发现异常路径与短源播放缺陷，不能整批技术签收。S1生产CDN挂起及未收口状态不变。

独立验证：typecheck/lint/build通过；battle800 passed/14 skipped，behavior14/14。origin/task/t31-fea与核验HEAD一致，8d3a235f是祖先，区间恰11提交；systems/cloudfunctions/config/battle.ts/config/battle-hex.ts零diff。本轮未重跑77/77、23/23视觉脚本，不能称主架构独立视觉复验。工作区存在face_*及w3d_w4_*等未提交证据改动，均未触碰；当前提交图与工作区图需分开引用。现有提交图无法反证远端历史从未force-push，只能确认当前祖先链完整。

## 必修问题

### P1：武器失败隔离只覆盖下载与解析

main.ts的weaponTexture await在武器局部try/catch之外，贴图解码拒绝会进入整个人物装配失败；renderer.buildAll直接调用buildWeaponProgram，武器shader失败同样将整个renderer置failed；pass.weaponRigOf的标定/染色异常也会冒泡出render。与T32“无剑继续+诊断”的确认口径不符。

独立注入：真实模型/武器资产+现有FakeGL，仅让第3个shader编译检查失败（前两个角色shader成功），结果status=failed，diagnostics含`weapon.vs 着色器编译失败`。不是角色故障。

修法：武器下载、解码、GPU装配、挂点标定分别形成失败边界，清理其部分资源/恢复GL绑定，保留角色ready并记录weapon-load/texture/gpu/calibration-failed。真正context丢失仍走整体恢复。新增各阶段失败注入，证明角色持续draw且无剑，不只mock loader失败。

### P2：短施法源未按源周期循环

config.charge固定playWindowSec=3，animation.phaseFor无源长短分支，所有源都elapsed/3。用真实atk(1.5s)替代测试注册表cast，elapsed=1.5实测phase=0.5，应为第二遍起点0；这是已批准“短于3s循环填满”的未实现分支。

修法：长源按3s映射完整一遍；短源按源周期推进，在3s窗口内循环，明确定义窗尾姿态。加入1.5s两遍、非整除短源与4.533s长源对照。不能只用phaseWraps=1的现役长源测试作为全规则证明。不改session/伤害/输入。

### P2：染色武器总drawCalls少计

renderer.drawWeapon四个非空segment分别drawElements并增加weaponDraws，但counters.drawCalls在循环外只加1；四段染色时身体+剑实际5 draw，总表却记2。修成每实际draw计一次，明确人物/武器/FXAA计数口径并对FakeGL实际调用数断言。性能统计不可沿默认白色合批路径外推。

## 方案与待裁事项

1. **placed认可**：最终pose.worldV[Root]减rest世界平移，经placement线性部分投影，仅加入placed；无第二时钟或重复人物平移。保留现有实现。
2. **朝向门认可weapon=off**：角色属性门应消除武器对分母的污染；独立武器开启组合证据保留，不要求另造像素分割。
3. **拳心取甲**：采用本管线inv(handRestWorld)×bind顶点。551顶点与Armature变换差值用独立公式对拍；A4同输入矩阵仍精确验，不简单放宽到5e-4来掩盖约定差。美术PM已接受该约定，约0.04px差不阻塞。
4. **W3需要规格澄清，不能自改判据**：工单明确“ry绕剑自身长轴”，而固定base·Rz·Ry·Rx在rx=-25°时ry+10°使长轴偏4.22°。认可实现复刻固定顺序，但不能以“4.22<6”代替原<0.5°声称W3通过。建议PM向Leo一次确认：保留已验收姿态/固定顺序，把参数定义为联合定姿；若仍要求独立轴向自转，应另设在局部长轴上后乘的twist参数并重验。确认前只暂停W3语义收口，不改已定姿态；这是需求歧义非纯数学容差。
5. **离地/触地**：采纳事件式诊断（首次离地/主峰后首次触地/最终触地均报，保留完整越阈列表）；旧数值带外事实不擦除。认可Leo已接受当前效果与Q3正段3.2增益/名义高计量，不宣称原相位门已全过。后续数值门由PM/Leo确认。
6. **T29休眠不删**；**剑首版无光照**；**武器失败无剑继续+诊断**三项确认。当前失败隔离实现需按上文修齐。
7. **普攻窗折入**：3D专用1.5s，2D/BE700ms不动，view保持窗不得gate输入或结算；未来出招速度用显式表现窗口契约另卡接入。方案归并v1.4，同时收录run槽位、正确yaw、0.78比例、1s jump/正段3.2。

T32主方案的静态网格/矩阵链/逐资产grip/无光照/共享资源方向可采用；W3冲突与W4“屏幕全长=lenRatio×名义高”须修文字：该公式是未投影标称长，屏幕长度还受当前姿态与视角投影影响，三档应对同姿态投影端点与比例线性，不能拿任意屏幕bbox硬对72.07px。

## 重送

前端同分支新增提交修三项问题；保留旧绿用例，增加上述非空负例与实际draw计数；PM处理W3确认并同步任务箱。复跑五门与受影响武器/动作证据，交付报告带准确commit及产物路径。不得借本审核删除未提交图片、修改历史美术源、合main或放行S1。
