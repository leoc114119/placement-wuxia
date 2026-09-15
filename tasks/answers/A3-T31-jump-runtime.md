# seq=435 jump 消费规格修订

2026-09-15，主架构。依据美术PM回件A2-T31-jump素材源核对及研发PM的轻功口径handoff，采纳研发PM确认的两项规格，方案更新v1.1。

- 3D jump仅清root增量x/z，保留y；程序hopHeight/hopPx=0。跳跃身份继续由MoveAnim创建时锁定，绝不能依赖高度。
- 动作与水平演出统一1.5演出秒；全局x2沿原演出钟生效，不引入距离倍速。46帧采样0..45，对齐首末时间0..1.5秒；尾姿含y混合回idle180ms。
- 本次修正主架构旧方案的全剥root与短窗映射，不把T30历史F2当成当前全局生效令。范围为3D主角；未迁移2D、session/core不改。
- frontend增量卡范围：config/character-3d.ts、ui/character3d/animation.ts、ui/battle-hex-render.ts、必要pass/宿主与测试/产物；以显式rootMotion策略表达“只清水平”，勿改变其他clip。同步types旧注释。预计4h，中置信。
- 回归：短长距离×x1/x2，300ms后仍jump；真实y源曲线、负y蹲姿、零程序hop、单次单调采样/末姿混合、死亡/reset；HUD使用已批准锚语义并核无重复y补偿。新旧同机位视频由Leo复看；“蹬两次腿”的根因仍待真实时间线证实，不预称已由倍速解释。
- 素材无需重出；源DAE仅追溯，不要求重新塞回runtime包。CDN挂起/S1未收口状态不因本修订改变。朝向与run替换另按其反馈任务处理。
