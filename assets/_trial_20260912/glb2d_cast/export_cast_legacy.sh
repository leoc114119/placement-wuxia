#!/bin/zsh
# 施法 —— **修镜像之前**的旧设置版（A/B 对照用）
# LEGACY_MIRROR=1（屏幕 x 用 +X）+ 旧方向表（left:270 …），其余与 export_cast.sh 完全一致
set -e
GLB="$HOME/Downloads/chibi+warrior+3d+model (1).glb"
TEX="assets/_trial_20260911/glb2d_v2/tex/basecolor.raw"
DIR="assets/_trial_20260912/glb2d_cast"
ANIM_JSON="$DIR/retarget_cast_aim4.json"
OUT="$DIR/cast_6dir_legacy"
export LEGACY_MIRROR=1
TOOLS="tools/glb2d"; SS=4; W=$((240*SS)); H=$((320*SS))
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)
DIRS=(left:270 leftdown:225 leftup:315 right:90 rightdown:135 rightup:45)
SRC_FRAMES=(0 11 22 33 44)
mkdir -p "$OUT"
for entry in "${DIRS[@]}"; do
  dir="${entry%%:*}"; yaw="${entry##*:}"; i=1
  for sf in "${SRC_FRAMES[@]}"; do
    t=$(python3 -c "print(round($sf/30,6))")
    node "$TOOLS/render.mjs" "$GLB" /tmp/_cl.raw $W $H none "$t" flatcel "$TEX" 2048 2048 "$yaw" /tmp/_cl "$ANIM_JSON" >/dev/null
    node "$TOOLS/downsample.mjs" /tmp/_cl.raw /tmp/_cl.depth /tmp/_cl.normal /tmp/_cl1 $W $H $SS >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_cl1.raw /tmp/_cl1.depth /tmp/_cl1.normal /tmp/_cl2.raw 240 320 "${PP[@]}" >/dev/null
    python3 -c "
from PIL import Image
Image.frombytes('RGBA',(240,320),open('/tmp/_cl2.raw','rb').read()).save('$OUT/cast_${dir}_${i}.png')
"
    i=$((i+1))
  done
  echo "  $dir done (yaw=$yaw)"
done
echo "TOTAL: $(ls $OUT/*.png | wc -l | tr -d ' ')"
