#!/bin/zsh
# 施法 —— **2× 画布（480×640）+ 去掉 AO** 版（Leo 09-12 令）
# 目的：验证"提高输出分辨率"能不能解决清晰度问题
#   渲染 1920×2560（= 480×640 的 4× 超采样）→ 降采样到 480×640 → 后处理 → PNG-8
# 相对 240×320 版：超采样倍率不变（4×），只是目标画布翻倍 ⇒ 同一角色得到 2 倍像素
set -e
GLB="$HOME/Downloads/chibi+character+3d+model.glb"
TEX="assets/_trial_20260912/model_v2/tex/basecolor4096.raw"
TW=4096; TH=4096
DIR="assets/_trial_20260912/glb2d_cast"
ANIM_JSON="assets/_trial_20260912/model_v2/retarget_cast_v2.json"
OUT="$DIR/cast_6dir_2x"
TOOLS="tools/glb2d"
OW=480; OH=640          # 输出画布
SS=4                    # 超采样倍率
W=$(( OW*SS )); H=$(( OH*SS ))
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)
DIRS=(left:90 leftdown:135 leftup:45 right:270 rightdown:225 rightup:315)
SRC_FRAMES=(0 11 22 33 44)
mkdir -p "$OUT"
for entry in "${DIRS[@]}"; do
  dir="${entry%%:*}"; yaw="${entry##*:}"; i=1
  for sf in "${SRC_FRAMES[@]}"; do
    t=$(python3 -c "print(round($sf/30,6))")
    node "$TOOLS/render.mjs" "$GLB" /tmp/_2x.raw $W $H none "$t" flatcel "$TEX" $TW $TH "$yaw" /tmp/_2x "$ANIM_JSON" >/dev/null
    node "$TOOLS/downsample.mjs" /tmp/_2x.raw /tmp/_2x.depth /tmp/_2x.normal /tmp/_2x1 $W $H $SS >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_2x1.raw /tmp/_2x1.depth /tmp/_2x1.normal /tmp/_2x2.raw $OW $OH "${PP[@]}" >/dev/null
    python3 -c "
from PIL import Image
Image.frombytes('RGBA',($OW,$OH),open('/tmp/_2x2.raw','rb').read()).save('$OUT/cast_${dir}_${i}.png')
"
    i=$((i+1))
  done
  echo "  $dir done (yaw=$yaw)"
done
# 地面锁定：目标末实体行 = 599（= 300/320 基线在 640 高下的对应行）
python3 "$TOOLS/ground_lock.py" "$OUT" "cast_*.png" --target 599
python3 "$TOOLS/png8_encode.py" "$OUT" "$OUT"
echo "TOTAL: $(ls $OUT/*.png | wc -l | tr -d ' ')"
