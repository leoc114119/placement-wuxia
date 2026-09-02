# 物品数据 Schema

> 分类：05-成长与经济 · 状态：🔶骨架 v0.1（2026-09-02，T10 排雷 P1-5 新建）· 优先级：P0（与武功 schema 同批，研发窗口审落 types.ts）
> 消费方：NPC 配置系统 drops 表、掉落流一键变强、装备系统、城镇材料
> 原则：最小集起步（MVP 够用），字段可扩展

---

## 1. 字段定义

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✓ | 全局唯一（命名域：`eq_`装备 / `mat_`材料 / `use_`消耗 / `tre_`钱袋宝箱类） |
| `name` | string | ✓ | 显示名 |
| `type` | enum | ✓ | equipment 装备 / material 材料 / consumable 消耗 / chest 开箱类 / quest 任务物 |
| `icon` | string | ✓ | 图标资源键（淡金族，assets/ui/pixel/icons/） |
| `desc` | string | – | 描述文案 |
| `stack` | bool | ✓ | 可叠堆（装备 false、材料/消耗 true） |
| `rarity` | enum | ✓ | common / uncommon / rare / epic（掉落品质色：白/绿/蓝/紫；福缘修正入口） |
| `equip` | object/null | 装备必填 | `{ slot, atk, def, spd }`——slot=weapon/armor/…；数值走 F-02/F-08 口径（🔧 占位） |
| `use` | object/null | 消耗必填 | `{ effect, value }`（MVP：auto_heal 自动补药类，R-06） |

## 2. 示例

```jsonc
// 装备
{ "id": "eq_shanzei_dao", "name": "山贼朴刀", "type": "equipment", "icon": "items/putao.png",
  "stack": false, "rarity": "common",
  "equip": { "slot": "weapon", "weaponType": "blade", "atk": 6, "def": 0, "spd": 0 } }
// 材料
{ "id": "mat_ore", "name": "铁矿石", "type": "material", "icon": "items/ore.png",
  "stack": true, "rarity": "common",
  "desc": "打铁原料（原料唯一来源红线：挖矿采集）" }
```

## 3. 边界与接口

- 装备字段 `weaponType` 与武功 `weapon` 匹配（R-05 装配匹配）
- 掉落表引用：NPC 配置 `drops.table[].item` = 本 schema `id`
- 一键变强对比：equip 字段 → 战力跳字（F-08 战力口径 🔧）
- 挖矿→打铁原料唯一来源红线（小游戏骨架 §2.3）

## 更新记录

| 日期 | 变更 | 签字 |
|---|---|---|
| 2026-09-02 | 骨架 v0.1 新建：最小集 9 字段 + 装备/材料示例 + 掉落/装备接口 | ZCode（待研发窗口审落 types.ts） |
