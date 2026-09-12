#!/bin/zsh
# jump 六向 × 5 帧 —— **aim3 修正版重渲**（2026-09-12）
#
# 为什么重渲：旧件用 aim2 重定向，aim2 对 Head / NeckTwist01 / Hip / L_Hand / R_Hand
# 五根骨取了不一致的「指向」参照（Head 用「父→自身」对「源 子−自身」），
# 导致头部被恒定多拧 25.4°，画面表现＝「莫名其妙低头」（Leo 09-12 指出，idle 同病）。
# 详见 tools/glb2d/collada2anim.mjs 的 aim2/aim3 注释与 docs/研发缺陷日志.md。
#
# 除重定向（aim2→aim3）外，**其余全部与 09-11 旧件一致**，便于逐帧对照：
#   源抽帧 = 0 / 15 / 18 / 24 / 12（由旧件反查确认，未改）
#   渲染/降采样/后处理参数、yaw 映射、画布 240×320 —— 全部照旧
set -e
GLB="$HOME/Downloads/chibi+warrior+3d+model (1).glb"
TEX="assets/_trial_20260911/glb2d_v2/tex/basecolor.raw"
ANIM_JSON="assets/_trial_20260912/glb2d_jump/retarget_jump_aim4.json"
OUT="assets/_trial_20260912/glb2d_jump/jump_6dir"

TOOLS="tools/glb2d"
SS=4
W=$(( 240 * SS )); H=$(( 320 * SS ))
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)

DIRS=(left:270 leftdown:225 leftup:315 right:90 rightdown:135 rightup:45)
SRC_FRAMES=(0 15 18 24 12)      # 源帧号（30fps）——沿用 09-11 旧件的取帧与顺序

mkdir -p "$OUT"
for entry in "${DIRS[@]}"; do
  dir="${entry%%:*}"; yaw="${entry##*:}"
  i=1
  for sf in "${SRC_FRAMES[@]}"; do
    t=$(python3 -c "print(round($sf/30,5))")
    node "$TOOLS/render.mjs" "$GLB" /tmp/_jp.raw $W $H none "$t" flatcel "$TEX" 2048 2048 "$yaw" /tmp/_jp "$ANIM_JSON" >/dev/null
    node "$TOOLS/downsample.mjs" /tmp/_jp.raw /tmp/_jp.depth /tmp/_jp.normal /tmp/_jp1 $W $H $SS >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_jp1.raw /tmp/_jp1.depth /tmp/_jp1.normal /tmp/_jp2.raw 240 320 "${PP[@]}" >/dev/null
    python3 -c "
from PIL import Image
Image.frombytes('RGBA',(240,320),open('/tmp/_jp2.raw','rb').read()).save('$OUT/jump_${dir}_${i}.png')
"
    i=$((i+1))
  done
  echo "  $dir done (yaw=$yaw)"
done
echo "TOTAL(raw PNG): $(ls $OUT/*.png | wc -l | tr -d ' ')"
