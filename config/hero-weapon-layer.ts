// T28 · hero 武器层配置（由 tools/import_hero_weapon_layer.mjs 生成——勿手改；源=候选 manifest-26rows-seq232，
// 运行时契约=assets/characters/hero/weapon45/manifest.runtime.json，预检 tools/preflight_hero_weapon_layer.mjs 双向锁）。
// 铁律（《主角武器层接线实施方案》§1/§3）：剑层 PNG 已在 240×320 画布内完成定位/角度——与身体帧同 left/top/w/h
// 叠画，零运行时旋转；gripPointPx/fistCenterPx/angleDeg 是预检与回归的契约数据，非运行时变换参数。
// 键=spriteKey → bodySrc（身体帧完整路径为稳定键，非 actor.id/facing/帧序猜测）；本卡仅 hero 有条目，
// NPC/敌方条目须后续需求卡授权。layerOrder：weapon_front=剑层绘于身体之上（有遮挡时先离屏挖拳孔）、
// body_front=剑层绘于身体之下（候选 manifest 既有值，帧数据如 frame05 idle_rightup）。jump/die 显式无武器。

export type WeaponLayerOrder = 'weapon_front' | 'body_front';

/** maskPolicy 枚举化（方案 §3 裁决）：资源契约非逐帧脚本——候选 manifest 六种拳区蒙版策略
 * （tight_fist_roi/tight_fist_polygon/precise_connected_fist/fist_polygon/fist/complete_fist_cutout）
 * 运行时算法同构：destination-out 按 alpha 挖拳孔（蒙版已由导入脚本机械转换为 alpha=候选灰度 luma，
 * 运行时全链零 getImageData）；每帧差异只由 maskSrc 表示；禁字符串自由发挥，新遮挡算法先扩枚举和预检再由新需求卡启用。 */
export type WeaponOcclusion =
  | { kind: 'none' }
  | { kind: 'body-alpha-tight-fist-roi'; maskSrc: string; maskSha256: string };

export interface WeaponLayerFrame {
  bodySrc: string; // 以 body frame 完整路径作稳定键
  weaponSrc: string; // 正式 assets/characters/hero/weapon45 路径
  weaponSha256: string;
  gripPointPx: readonly [number, number];
  fistCenterPx: readonly [number, number];
  angleDeg: number; // 预检/回归元数据，本批不作运行时旋转
  layerOrder: WeaponLayerOrder;
  occlusion: WeaponOcclusion;
}

export type WeaponLayerProfile = Readonly<Record<string, ReadonlyMap<string, WeaponLayerFrame>>>;

const HERO_WEAPON_FRAMES: ReadonlyMap<string, WeaponLayerFrame> = new Map<string, WeaponLayerFrame>([
  [
    'assets/characters/hero/battle45/battle_idle_right.png',
    {
      bodySrc: 'assets/characters/hero/battle45/battle_idle_right.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_battle_idle_right.png',
      weaponSha256: '9d6d593e664f40f91baf26968d5c9c2d24280e38dd54bf3007fc09c56fb4258d',
      gripPointPx: [113, 196],
      fistCenterPx: [102, 206],
      angleDeg: -40,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_battle_idle_right.png', maskSha256: '07754810410f3bb8d7ac40b8b74fe3c962d375b3491e400c04e0e4e7eabae9bc' },
    },
  ],
  [
    'assets/characters/hero/battle45/walk_right_1.png',
    {
      bodySrc: 'assets/characters/hero/battle45/walk_right_1.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_walk_right_1.png',
      weaponSha256: 'e4daf035adf788de89c44fadde74ba4cf337b3b7373d8bb001f465b0470bb1d4',
      gripPointPx: [98.4896717287, 206.587805724],
      fistCenterPx: [84, 207],
      angleDeg: 0,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_walk_right_1.png', maskSha256: '3990298b72207049de6ea855b7135c1c827a2bc66a4bc0cc93df5dc1cc669a04' },
    },
  ],
  [
    'assets/characters/hero/battle45/walk_right_2.png',
    {
      bodySrc: 'assets/characters/hero/battle45/walk_right_2.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_walk_right_2.png',
      weaponSha256: '2761f8ce877e5a960eb18de19126fa74c0657582a801f3c0a64b09753178425e',
      gripPointPx: [115.9814206992, 199.7272669341],
      fistCenterPx: [102, 204],
      angleDeg: -15,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_walk_right_2.png', maskSha256: 'cdc865df32923dfb45427f6c88e1a31fbb666474138391fcc147d1b1b3df5921' },
    },
  ],
  [
    'assets/characters/hero/battle45/atk_right_2.png',
    {
      bodySrc: 'assets/characters/hero/battle45/atk_right_2.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_atk_right_2.png',
      weaponSha256: '8f419afc3d10b6970bd6f6b13e250b0021f415b9731ca2bf8d68a737ecefe9f7',
      gripPointPx: [214, 168],
      fistCenterPx: [203.0731707317, 177.6422764228],
      angleDeg: -40,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_atk_right_2.png', maskSha256: 'b9dd8222dab2c18d51e16d11503a2de6e332ee85471d128adad96dbe3349812c' },
    },
  ],
  [
    'assets/characters/hero/battle45/battle_idle_rightup.png',
    {
      bodySrc: 'assets/characters/hero/battle45/battle_idle_rightup.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_battle_idle_rightup.png',
      weaponSha256: 'ae500aef1a9921c06373f7bd4ff144c8be24548433d8379999faee410c83ca57',
      gripPointPx: [189, 190],
      fistCenterPx: [178.1052631579, 204.5],
      angleDeg: -40,
      layerOrder: 'body_front',
      occlusion: { kind: 'none' },
    },
  ],
  [
    'assets/characters/hero/battle45/battle_idle_rightdown.png',
    {
      bodySrc: 'assets/characters/hero/battle45/battle_idle_rightdown.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_battle_idle_rightdown.png',
      weaponSha256: 'f8653f8d4cf0529eb7850dd956964c40344711d884007283d9e2f4a5f72661dd',
      gripPointPx: [102, 195],
      fistCenterPx: [102.15625, 195.359375],
      angleDeg: -75,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_battle_idle_rightdown.png', maskSha256: 'e6c12023c2143e6d921728fa1734edd2a0ce134575aa49e503ac5e07cacd5165' },
    },
  ],
  [
    'assets/characters/hero/battle45/walk_rightup_1.png',
    {
      bodySrc: 'assets/characters/hero/battle45/walk_rightup_1.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_walk_rightup_1.png',
      weaponSha256: '8f7dadcdc1cab263ffdc8d4d5e1bef78f9ab0f2891018f01f994348a109ed55a',
      gripPointPx: [178.5736861516, 186.5878157359],
      fistCenterPx: [181, 189],
      angleDeg: -90,
      layerOrder: 'body_front',
      occlusion: { kind: 'none' },
    },
  ],
  [
    'assets/characters/hero/battle45/walk_rightup_2.png',
    {
      bodySrc: 'assets/characters/hero/battle45/walk_rightup_2.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_walk_rightup_2.png',
      weaponSha256: 'a358789e80f4ba1e43bc8ff63233c583460d9859d1130e4987dca9b63a22e190',
      gripPointPx: [186.5736861516, 189.5878157359],
      fistCenterPx: [189, 192],
      angleDeg: -90,
      layerOrder: 'body_front',
      occlusion: { kind: 'none' },
    },
  ],
  [
    'assets/characters/hero/battle45/atk_rightup_1.png',
    {
      bodySrc: 'assets/characters/hero/battle45/atk_rightup_1.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_atk_rightup_1.png',
      weaponSha256: '556cf39b84b9604d2c2bdebb32f6f00c728d488f45fa1da4389ef6122752b194',
      gripPointPx: [157.5736861516, 183.5878157359],
      fistCenterPx: [164, 181],
      angleDeg: -90,
      layerOrder: 'body_front',
      occlusion: { kind: 'none' },
    },
  ],
  [
    'assets/characters/hero/battle45/atk_rightup_2.png',
    {
      bodySrc: 'assets/characters/hero/battle45/atk_rightup_2.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_atk_rightup_2.png',
      weaponSha256: '061f5197865e5671e20271e2255f3f777588951770ebba0321fc02ec32a5b342',
      gripPointPx: [212.5736861516, 98.5878157359],
      fistCenterPx: [216, 96],
      angleDeg: -160,
      layerOrder: 'body_front',
      occlusion: { kind: 'none' },
    },
  ],
  [
    'assets/characters/hero/battle45/walk_rightdown_1.png',
    {
      bodySrc: 'assets/characters/hero/battle45/walk_rightdown_1.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_walk_rightdown_1.png',
      weaponSha256: 'a58b0d91c23c99183a80187b51ecc05c7d4338de73ef942d800b83dd24da96ac',
      gripPointPx: [82, 207],
      fistCenterPx: [82, 206],
      angleDeg: 35,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_walk_rightdown_1.png', maskSha256: 'ff95063c9b870cc298a83a0ad04e4328689238247e30ec5e55f3b93ba49210df' },
    },
  ],
  [
    'assets/characters/hero/battle45/atk_rightdown_1.png',
    {
      bodySrc: 'assets/characters/hero/battle45/atk_rightdown_1.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_atk_rightdown_1.png',
      weaponSha256: '2a655c13ce6d8884c836d97bcdb8c08ee2306bcf68b8eb34399d212331db185f',
      gripPointPx: [121, 186],
      fistCenterPx: [121, 186],
      angleDeg: -90,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_atk_rightdown_1.png', maskSha256: '6d15785acf669675f7d9a34d9aa96e9c27625dd6d68f1b1b3be43aa635e4ef16' },
    },
  ],
  [
    'assets/characters/hero/battle45/atk_rightdown_2.png',
    {
      bodySrc: 'assets/characters/hero/battle45/atk_rightdown_2.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_atk_rightdown_2.png',
      weaponSha256: 'fbab3dd75d8519e1a4b58aab6d610dc3d0a5e90bf00d6704a37de3fe98dfbc7a',
      gripPointPx: [197, 202],
      fistCenterPx: [201, 200],
      angleDeg: -15,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_atk_rightdown_2.png', maskSha256: '8fb5e5e29abffeda40e819853bf6491ad79a7dfacbc23c8bc94eeab104824e68' },
    },
  ],
  [
    'assets/characters/hero/battle45/battle_idle_left.png',
    {
      bodySrc: 'assets/characters/hero/battle45/battle_idle_left.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_battle_idle_left.png',
      weaponSha256: '709204e10a5f77b0bb4313fa2ad69714fa6cb3274fe51cc7637f0f92642c627a',
      gripPointPx: [126, 196],
      fistCenterPx: [137, 206],
      angleDeg: 40,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_battle_idle_left.png', maskSha256: '214ee770bca162e28378f244a7b750065d206211c62220a2543c43394bc4964b' },
    },
  ],
  [
    'assets/characters/hero/battle45/walk_left_1.png',
    {
      bodySrc: 'assets/characters/hero/battle45/walk_left_1.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_walk_left_1.png',
      weaponSha256: '2ee4095dc66f818ac77ef3c8f72eddac481f48966993bf8ca4e77a3ea2539081',
      gripPointPx: [140.510328, 206.587805724],
      fistCenterPx: [155, 207],
      angleDeg: 0,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_walk_left_1.png', maskSha256: '5f57016ddbf20d1ee10f17e64e94d080a640eea38590d0ae2d86120189a43e41' },
    },
  ],
  [
    'assets/characters/hero/battle45/walk_left_2.png',
    {
      bodySrc: 'assets/characters/hero/battle45/walk_left_2.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_walk_left_2.png',
      weaponSha256: 'd3ef47c0f212c13b6d8a39e1db37293d94e9c7b75fae01784b9c377315e631aa',
      gripPointPx: [123.018579, 199.7272669341],
      fistCenterPx: [137, 204],
      angleDeg: 15,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_walk_left_2.png', maskSha256: 'ea18d08d21d1ae0b237ab2f67350c302c3d940aff0b35f10cde86d6ff2eef547' },
    },
  ],
  [
    'assets/characters/hero/battle45/atk_left_2.png',
    {
      bodySrc: 'assets/characters/hero/battle45/atk_left_2.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_atk_left_2.png',
      weaponSha256: 'c08def30a29aef0bf75b5c663838214addfbc205f11e308b68b908f16ad1deb6',
      gripPointPx: [25, 168],
      fistCenterPx: [35.926829, 177.6422764228],
      angleDeg: 40,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_atk_left_2.png', maskSha256: '01d3ed61a8a9c905593185af51dfe6333cdd98c4cece924ad39babc4c3bacfdd' },
    },
  ],
  [
    'assets/characters/hero/battle45/battle_idle_leftup.png',
    {
      bodySrc: 'assets/characters/hero/battle45/battle_idle_leftup.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_battle_idle_leftup.png',
      weaponSha256: 'd3953b4b377a51c3afadefcfb79e855d053ddf0f168cd24fcd62424c4475656c',
      gripPointPx: [50, 190],
      fistCenterPx: [60.894737, 204.5],
      angleDeg: 40,
      layerOrder: 'body_front',
      occlusion: { kind: 'none' },
    },
  ],
  [
    'assets/characters/hero/battle45/battle_idle_leftdown.png',
    {
      bodySrc: 'assets/characters/hero/battle45/battle_idle_leftdown.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_battle_idle_leftdown.png',
      weaponSha256: '465fcd4a41092cb452865833073c2ccb53b9b5c7842c7370455d2568f0943051',
      gripPointPx: [137, 195],
      fistCenterPx: [136.84375, 195.359375],
      angleDeg: 75,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_battle_idle_leftdown.png', maskSha256: 'e4e91382aa675a237f2d1165cba684b5905120f5b1388a92b9985511ba55e324' },
    },
  ],
  [
    'assets/characters/hero/battle45/walk_leftup_1.png',
    {
      bodySrc: 'assets/characters/hero/battle45/walk_leftup_1.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_walk_leftup_1.png',
      weaponSha256: '97e0d55e4fc8adbe62eaac21215affadb306e76745d07d8775d4bffba5ad0010',
      gripPointPx: [60.426314, 186.5878157359],
      fistCenterPx: [58, 189],
      angleDeg: 90,
      layerOrder: 'body_front',
      occlusion: { kind: 'none' },
    },
  ],
  [
    'assets/characters/hero/battle45/walk_leftup_2.png',
    {
      bodySrc: 'assets/characters/hero/battle45/walk_leftup_2.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_walk_leftup_2.png',
      weaponSha256: 'f4d6a884f605f1e05a79bc4eae8ac5953e71a958e371b87ac9d17dbb5bb6ec9d',
      gripPointPx: [52.426314, 189.5878157359],
      fistCenterPx: [50, 192],
      angleDeg: 90,
      layerOrder: 'body_front',
      occlusion: { kind: 'none' },
    },
  ],
  [
    'assets/characters/hero/battle45/atk_leftup_1.png',
    {
      bodySrc: 'assets/characters/hero/battle45/atk_leftup_1.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_atk_leftup_1.png',
      weaponSha256: '8613452d5acd252ee24b5d96c172eef632283e16aeacf8a20abd9933ec425d16',
      gripPointPx: [81.426314, 183.5878157359],
      fistCenterPx: [75, 181],
      angleDeg: 90,
      layerOrder: 'body_front',
      occlusion: { kind: 'none' },
    },
  ],
  [
    'assets/characters/hero/battle45/atk_leftup_2.png',
    {
      bodySrc: 'assets/characters/hero/battle45/atk_leftup_2.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_atk_leftup_2.png',
      weaponSha256: '5df17354597a1394e029ac4936b3984e10906844d229bbe4821a744ef2050fdb',
      gripPointPx: [26.426314, 98.5878157359],
      fistCenterPx: [23, 96],
      angleDeg: 160,
      layerOrder: 'body_front',
      occlusion: { kind: 'none' },
    },
  ],
  [
    'assets/characters/hero/battle45/walk_leftdown_1.png',
    {
      bodySrc: 'assets/characters/hero/battle45/walk_leftdown_1.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_walk_leftdown_1.png',
      weaponSha256: 'b7e7c111e863b6275106f4d9a9bde6f2da6be71fe66398e63c492cc5e4ec19d7',
      gripPointPx: [157, 207],
      fistCenterPx: [157, 206],
      angleDeg: -35,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_walk_leftdown_1.png', maskSha256: '81b10ca6259aac9438314faec0dd07f387a61ec9901c0c1d33d9d4101cab8973' },
    },
  ],
  [
    'assets/characters/hero/battle45/atk_leftdown_1.png',
    {
      bodySrc: 'assets/characters/hero/battle45/atk_leftdown_1.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_atk_leftdown_1.png',
      weaponSha256: '6be1852eb1ae1022be4570e0bf21f79ff40145604fdec1eae130fe076c80d886',
      gripPointPx: [118, 186],
      fistCenterPx: [118, 186],
      angleDeg: 90,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_atk_leftdown_1.png', maskSha256: 'dcd109824492455c7c28f7493be6b403febe110681c984cb837a3c32169eebfb' },
    },
  ],
  [
    'assets/characters/hero/battle45/atk_leftdown_2.png',
    {
      bodySrc: 'assets/characters/hero/battle45/atk_leftdown_2.png',
      weaponSrc: 'assets/characters/hero/weapon45/weapon_atk_leftdown_2.png',
      weaponSha256: '6950a485f084998704b9932b126b45a90ee7e4a5459bc37c065efebfe945296f',
      gripPointPx: [42, 202],
      fistCenterPx: [38, 200],
      angleDeg: 15,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'body-alpha-tight-fist-roi', maskSrc: 'assets/characters/hero/weapon45/masks/mask_atk_leftdown_2.png', maskSha256: '1ee247be4c3837c399df0c37dab31884b882baeb8e53890a59dd6851e9d4c08a' },
    },
  ],
]);

export const WEAPON_LAYER_PROFILES: WeaponLayerProfile = {
  hero: HERO_WEAPON_FRAMES,
};
