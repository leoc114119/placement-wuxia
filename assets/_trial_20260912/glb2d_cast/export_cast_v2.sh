#!/bin/zsh
# 施法 —— **新模型（chibi+character，多 Pelvis+Twist 骨）+ AO 0.22** 版
# 与 export_cast.sh 的差别：模型/贴图/retarget 换成 v2，后处理多一步 AO
set -e
GLB="$HOME/Downloads/chibi+character+3d+model.glb"
TEX="assets/_trial_20260912/model_v2/tex/basecolor4096.raw"
TW=4096; TH=4096
DIR="assets/_trial_20260912/glb2d_cast"
ANIM_JSON="assets/_trial_20260912/model_v2/retarget_cast_v2.json"
OUT="$DIR/cast_6dir_v2"
TOOLS="tools/glb2d"; SS=4; W=$((240*SS)); H=$((320*SS))
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)
DIRS=(left:90 leftdown:135 leftup:45 right:270 rightdown:225 rightup:315)
SRC_FRAMES=(0 11 22 33 44)
mkdir -p "$OUT"
for entry in "${DIRS[@]}"; do
  dir="${entry%%:*}"; yaw="${entry##*:}"; i=1
  for sf in "${SRC_FRAMES[@]}"; do
    t=$(python3 -c "print(round($sf/30,6))")
    node "$TOOLS/render.mjs" "$GLB" /tmp/_cv.raw $W $H none "$t" flatcel "$TEX" $TW $TH "$yaw" /tmp/_cv "$ANIM_JSON" >/dev/null
    node "$TOOLS/downsample.mjs" /tmp/_cv.raw /tmp/_cv.depth /tmp/_cv.normal /tmp/_cv1 $W $H $SS >/dev/null
    # ★ AO 必须在**量化之前**上：作用在 24 位降采样图上，后处理只量化一次
    #   （顺序反了 → AO 的渐变让 256 色放不下 → PNG-8 变有损 → 画面发糊，实测踩过）
    python3 "$TOOLS/ao_pass.py" /tmp/_cv1.raw /tmp/_cv1.depth /tmp/_cv1ao.raw 240 320 --strength 0.22 >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_cv1ao.raw /tmp/_cv1.depth /tmp/_cv1.normal /tmp/_cv2.raw 240 320 "${PP[@]}" >/dev/null
    cp /tmp/_cv2.raw /tmp/_cv2ao.raw
    python3 -c "
from PIL import Image
Image.frombytes('RGBA',(240,320),open('/tmp/_cv2ao.raw','rb').read()).save('$OUT/cast_${dir}_${i}.png')
"
    i=$((i+1))
  done
  echo "  $dir done (yaw=$yaw)"
done
python3 "$TOOLS/png8_encode.py" "$OUT" "$OUT"
echo "TOTAL: $(ls $OUT/*.png | grep -v ao | wc -l | tr -d ' ')"
