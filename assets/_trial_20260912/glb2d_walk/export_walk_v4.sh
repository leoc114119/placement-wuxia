#!/bin/zsh
# walk 六向 × 5 帧 —— 新模型 v4(600k面) + 定版影调（Leo 09-12 定稿）
#
# 源：**模型自带 `preset:biped:walk`**（不走 Mixamo 重定向）
#     ⚠️ 序号按**名字**取：v4 里 animations[0]=walk、animations[1]=run
#        （上一版是 0=run/1=walk —— 序号会变，禁按序号硬编码）
#     时长 1.875s（=56.25 帧 @30fps）⇒ 循环动作 ⇒ **均匀相位**取 5 帧
#     每帧 375ms（= 源循环时长 ÷ 帧数）
# 规格（Leo 09-12 定）：240×320 / 六向 / 5 帧 / 地面锁定 299 / PNG-8 无损
# 影调定版（Leo 09-12 逐档目视选）：对比 1.5 / 饱和 1.25 / 亮度 +22 / **加红 26（仅暖色区）**
set -e
GLB="$HOME/Downloads/chibi+character+3d+model (2).glb"
TEX="assets/_trial_20260912/model_v4/tex/basecolor.raw"
DIR="assets/_trial_20260912/glb2d_walk"
OUT="$DIR/walk_6dir"
TOOLS="tools/glb2d"; SS=4; W=$((240*SS)); H=$((320*SS))
ANIM_IDX=0                       # ★ 按名字确认过：v4 的 animations[0] = preset:biped:walk
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)
DIRS=(left:90 leftdown:135 leftup:45 right:270 rightdown:225 rightup:315)
# 均匀相位：t = i × 1.875/5
TS=(0 0.375 0.75 1.125 1.5)
mkdir -p "$OUT"
for entry in "${DIRS[@]}"; do
  dir="${entry%%:*}"; yaw="${entry##*:}"; i=1
  for t in "${TS[@]}"; do
    node "$TOOLS/render.mjs" "$GLB" /tmp/_wk.raw $W $H $ANIM_IDX "$t" flatcel "$TEX" 4096 4096 "$yaw" /tmp/_wk >/dev/null
    node "$TOOLS/downsample.mjs" /tmp/_wk.raw /tmp/_wk.depth /tmp/_wk.normal /tmp/_wk1 $W $H $SS >/dev/null
    python3 "$TOOLS/tone_pass.py" /tmp/_wk1.raw /tmp/_wk1t.raw 240 320 --contrast 1.5 --saturation 1.25 --brightness 2 --red 26 --red-scope warm >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_wk1t.raw /tmp/_wk1.depth /tmp/_wk1.normal /tmp/_wk2.raw 240 320 "${PP[@]}" >/dev/null
    python3 -c "
from PIL import Image
Image.frombytes('RGBA',(240,320),open('/tmp/_wk2.raw','rb').read()).save('$OUT/walk_${dir}_${i}.png')
"
    i=$((i+1))
  done
  echo "  $dir done (yaw=$yaw)"
done
python3 "$TOOLS/ground_lock.py" "$OUT" "walk_*.png" --target 299
python3 "$TOOLS/png8_encode.py" "$OUT" "$OUT"
echo "TOTAL: $(ls $OUT/*.png | wc -l | tr -d ' ')"
