#!/bin/zsh
# idle 六向 × 5 帧 —— **新模型（chibi+character）+ 去 AO** 版（Leo 09-12 令：A 方案，一组一组出）
# 相对 v1 的差别：模型/贴图/retarget 全换 v2；后处理不带 AO；预览改无损 PNG
set -e
GLB="$HOME/Downloads/chibi+character+3d+model.glb"
TEX="assets/_trial_20260912/model_v2/tex/basecolor4096.raw"
TW=4096; TH=4096
DIR="assets/_trial_20260912/glb2d_idle"
ANIM_JSON="$DIR/retarget_idle_v2.json"
OUT="$DIR/idle_6dir_v2"
TOOLS="tools/glb2d"; SS=4; W=$((240*SS)); H=$((320*SS))
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)
DIRS=(left:90 leftdown:135 leftup:45 right:270 rightdown:225 rightup:315)
SRC_FRAMES=(0 40 80 119 159)   # 199 帧闭环 / 6.633s 的均匀相位
mkdir -p "$OUT"
for entry in "${DIRS[@]}"; do
  dir="${entry%%:*}"; yaw="${entry##*:}"; i=1
  for sf in "${SRC_FRAMES[@]}"; do
    t=$(python3 -c "print(round($sf/30,6))")
    node "$TOOLS/render.mjs" "$GLB" /tmp/_iv.raw $W $H none "$t" flatcel "$TEX" $TW $TH "$yaw" /tmp/_iv "$ANIM_JSON" >/dev/null
    node "$TOOLS/downsample.mjs" /tmp/_iv.raw /tmp/_iv.depth /tmp/_iv.normal /tmp/_iv1 $W $H $SS >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_iv1.raw /tmp/_iv1.depth /tmp/_iv1.normal /tmp/_iv2.raw 240 320 "${PP[@]}" >/dev/null
    python3 -c "
from PIL import Image
Image.frombytes('RGBA',(240,320),open('/tmp/_iv2.raw','rb').read()).save('$OUT/idle_${dir}_${i}.png')
"
    i=$((i+1))
  done
  echo "  $dir done (yaw=$yaw)"
done
python3 "$TOOLS/ground_lock.py" "$OUT" "idle_*.png" --target 299
python3 "$TOOLS/png8_encode.py" "$OUT" "$OUT"
echo "TOTAL: $(ls $OUT/*.png | wc -l | tr -d ' ')"
