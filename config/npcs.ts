// NPC 配置表（数据源：config/场景与NPC配置.md §3 + modules/03 v1.2 §2.0/§3）
// T04 氛围版：只消费 id/name/appearance.sprite/heightRatio；战斗数值字段留空位注释，战斗接线时补
// SceneConfig.npcs 语义（modules/03 v1.2 §4）：NPC 池声明（有哪些类型可刷），坐标/count 废弃——数量位置由随机散布算法决定

/** NPC 外观（modules/03 §3） */
export interface NpcAppearance {
  sprite: string; // 帧表目录前缀（帧路径 = `${sprite}_0${i}_transparent.png`）
  nameColor: string; // 名字标签色：普通怪淡金 / Boss 朱砂（战斗接线时消费）
}

/** NPC 配置骨架（T06 战斗区接线：battleNums 供 battle-ui 组装 CombatantInput；数值=场景配置文档初稿口径，64 定稿回填） */
export interface NpcConfig {
  id: 'npc-shanzei' | 'npc-lang';
  type: 'mob' | 'boss';
  name: string;
  appearance: NpcAppearance;
  heightRatio: number; // 江湖场景渲染高度占屏比（山贼 0.21 对齐主角 / 野狼 0.15，modules/03 §3 比例锚定）
  /** 战斗数值（T06 接线；hp/atk/def 取自 场景与NPC配置.md §3 初稿，jimin/danshi 为演出组装占位——敌方低机敏便于命中） */
  battleNums: {
    hp: number;
    atk: number;
    def: number;
    jimin: number;
    danshi: number;
    shizhan: number;
  };
  /** 战斗棋子体型（75 §8b.4：humanoid / wolf → SPRITE_HEIGHT_PER_TILE；boss 叠 BOSS_SCALE） */
  bodyKind: 'humanoid' | 'wolf';
}

/** 青牛山下 NPC 池（SceneConfig.npcs 声明引用；等权抽取） */
export const NPC_POOL: NpcConfig[] = [
  {
    id: 'npc-shanzei',
    type: 'mob',
    name: '山贼喽啰',
    appearance: { sprite: 'assets/ui/frames/spr_shanzei/spr_shanzei', nameColor: '#D4AF37' },
    heightRatio: 0.21,
    battleNums: { hp: 300, atk: 30, def: 15, jimin: 15, danshi: 5, shizhan: 0 }, // 配置文档 §3：300/30/15
    bodyKind: 'humanoid',
  },
  {
    id: 'npc-lang',
    type: 'mob',
    name: '野狼',
    appearance: { sprite: 'assets/ui/frames/spr_lang/spr_lang', nameColor: '#D4AF37' },
    heightRatio: 0.15,
    battleNums: { hp: 250, atk: 25, def: 10, jimin: 15, danshi: 5, shizhan: 0 }, // 配置文档 §3：250/25/10
    bodyKind: 'wolf',
  },
];
