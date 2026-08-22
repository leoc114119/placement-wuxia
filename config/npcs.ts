// NPC 配置表（数据源：config/场景与NPC配置.md §3 + modules/03 v1.2 §2.0/§3）
// T04 氛围版：只消费 id/name/appearance.sprite/heightRatio；战斗数值字段留空位注释，战斗接线时补
// SceneConfig.npcs 语义（modules/03 v1.2 §4）：NPC 池声明（有哪些类型可刷），坐标/count 废弃——数量位置由随机散布算法决定

/** NPC 外观（modules/03 §3） */
export interface NpcAppearance {
  sprite: string; // 帧表目录前缀（帧路径 = `${sprite}_0${i}_transparent.png`）
  nameColor: string; // 名字标签色：普通怪淡金 / Boss 朱砂（战斗接线时消费）
}

/** NPC 配置骨架（战斗数值字段按 场景与NPC配置.md §3 留空位） */
export interface NpcConfig {
  id: 'npc-shanzei' | 'npc-lang';
  type: 'mob' | 'boss';
  name: string;
  appearance: NpcAppearance;
  heightRatio: number; // 渲染高度占屏比（山贼 0.21 对齐主角 / 野狼 0.15，modules/03 §3 比例锚定）
  // ---- 战斗数值（T04 不消费，接线时补）：hp/attack/defense/speed/aggro/aggroRange/skills/dropTable ----
}

/** 青牛山下 NPC 池（SceneConfig.npcs 声明引用；等权抽取） */
export const NPC_POOL: NpcConfig[] = [
  {
    id: 'npc-shanzei',
    type: 'mob',
    name: '山贼喽啰',
    appearance: { sprite: 'assets/ui/frames/spr_shanzei/spr_shanzei', nameColor: '#D4AF37' },
    heightRatio: 0.21,
    // hp: 300, attack: 30, defense: 15, speed: 100, aggro: 'active', aggroRange: 0.15（接线时补）
  },
  {
    id: 'npc-lang',
    type: 'mob',
    name: '野狼',
    appearance: { sprite: 'assets/ui/frames/spr_lang/spr_lang', nameColor: '#D4AF37' },
    heightRatio: 0.15,
    // hp: 250, attack: 25, defense: 10, speed: 120, aggro: 'active', aggroRange: 0.15（接线时补）
  },
];
