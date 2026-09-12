#!/bin/zsh
# 施法（One Hand Sword Combo）六向 × 5 帧导出（2026-09-12）
#
# 源：Mixamo `One Hand Sword Combo` → `src/One Hand Sword Combo.dae`
#     （Collada / Without Skin / 30fps / Keyframe Reduction: none / **Leo 勾了 Mirror**）
#     ⚠️ 关于 Mirror：`镜像(渲染(镜像(动作))) = 渲染(动作)` —— 若渲染器仍是镜像的，勾 Mirror 可以抵消。
#     但 09-12 已把渲染器的镜像修掉（BUG-16），所以**这份成品的动作是原动作的镜像版**（左右手对调）。
#     Leo 09-12 已知情并选择用它。后续下载建议不勾 Mirror（理由见交付文档）。
# 重定向：tools/glb2d/collada2anim.mjs --fps 30 --root y（mode 默认 aim4；根位移只保留 Y ⇒ 水平位移被丢掉，人物原地）
# 抽帧：实测**首尾闭环**（帧0 vs 帧135 差 0.000044，与帧0 vs 帧1 的 0.000049 同量级）⇒ 循环动作 ⇒ **均匀相位**
#       源 136 帧 → 取 0 / 27 / 54 / 81 / 108
#       ⚠️ 游戏内 cast 是**循环播放**（《出招速度与两段式伤害需求文档》AS-2：施法循环帧周期 280ms/帧）
#          ⇒ 5×280ms = 1.4s 一轮；源循环 4.53s ⇒ 比源快约 3.2×（游戏规格定的节奏，见交付文档）
#
# 渲染参数与 idle/jump/atk 六向**完全一致**（含 09-12 修好的屏幕 x 取负 + yaw 左右对调）
set -e
GLB="$HOME/Downloads/chibi+warrior+3d+model (1).glb"
TEX="assets/_trial_20260911/glb2d_v2/tex/basecolor.raw"
DIR="assets/_trial_20260912/glb2d_cast"
ANIM_JSON="$DIR/retarget_cast_aim4.json"
OUT="$DIR/cast_6dir"

TOOLS="tools/glb2d"
SS=4
W=$(( 240 * SS )); H=$(( 320 * SS ))
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)

# ★ 09-12 屏幕 x 取消镜像后，侧向 yaw 左右对调（270↔90 / 225↔135 / 315↔45）
DIRS=(left:90 leftdown:135 leftup:45 right:270 rightdown:225 rightup:315)
SRC_FRAMES=(0 27 54 81 108)

mkdir -p "$OUT"
for entry in "${DIRS[@]}"; do
  dir="${entry%%:*}"; yaw="${entry##*:}"
  i=1
  for sf in "${SRC_FRAMES[@]}"; do
    t=$(python3 -c "print(round($sf/30,6))")
    node "$TOOLS/render.mjs" "$GLB" /tmp/_cs.raw $W $H none "$t" flatcel "$TEX" 2048 2048 "$yaw" /tmp/_cs "$ANIM_JSON" >/dev/null
    node "$TOOLS/downsample.mjs" /tmp/_cs.raw /tmp/_cs.depth /tmp/_cs.normal /tmp/_cs1 $W $H $SS >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_cs1.raw /tmp/_cs1.depth /tmp/_cs1.normal /tmp/_cs2.raw 240 320 "${PP[@]}" >/dev/null
    python3 -c "
from PIL import Image
Image.frombytes('RGBA',(240,320),open('/tmp/_cs2.raw','rb').read()).save('$OUT/cast_${dir}_${i}.png')
"
    i=$((i+1))
  done
  echo "  $dir done (yaw=$yaw)"
done
echo "TOTAL(raw PNG): $(ls $OUT/*.png | wc -l | tr -d ' ')"
