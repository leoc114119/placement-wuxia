#!/bin/zsh
# 其余四个动作全部重出（Leo 09-12：以 v4 + 定版影调 为准）
#   run  —— 模型自带 preset:biped:run（v4 里 animations[1]）
#   jump —— Mixamo Jumping Up（重定向 v4），源帧 0/15/18/24/12（Leo 09-11 排定的顺序）
#   atk  —— Mixamo Sword And Shield Slash（重定向 v4），源帧 0/8/19/30/44（贪心最远点）
#   cast —— Mixamo One Hand Sword Combo（重定向 v4），源帧 0/11/22/33/44（连招第一段）
#
# 统一规格（Leo 09-12 定版）：
#   模型 v4(600k面) + 4K 贴图 ｜ 240×320 ｜ 六向 ｜ 5 帧 ｜ 地面锁定 299 ｜ PNG-8 无损
#   影调：对比 1.5 / 饱和 1.25 / 亮度 +2 / 加红 26（仅暖色区）
set -e
GLB="$HOME/Downloads/chibi+character+3d+model (2).glb"
TEX="assets/_trial_20260912/model_v4/tex/basecolor.raw"
M4="assets/_trial_20260912/model_v4"
TOOLS="tools/glb2d"; SS=4; W=$((240*SS)); H=$((320*SS))
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)
DIRS=(left:90 leftdown:135 leftup:45 right:270 rightdown:225 rightup:315)
TONE=(--contrast 1.5 --saturation 1.25 --brightness 2 --red 26 --red-scope warm)

# $1=输出目录 $2=动画序号或none $3=retarget json 或 none $4...=时间点
render_group() {
  local OUT="$1" IDX="$2" JSON="$3"; shift 3
  local TS=("$@")
  mkdir -p "$OUT"
  for entry in "${DIRS[@]}"; do
    local dir="${entry%%:*}" yaw="${entry##*:}" i=1
    for t in "${TS[@]}"; do
      if [ "$JSON" = "none" ]; then
        node "$TOOLS/render.mjs" "$GLB" /tmp/_g.raw $W $H "$IDX" "$t" flatcel "$TEX" 4096 4096 "$yaw" /tmp/_g >/dev/null
      else
        node "$TOOLS/render.mjs" "$GLB" /tmp/_g.raw $W $H none "$t" flatcel "$TEX" 4096 4096 "$yaw" /tmp/_g "$JSON" >/dev/null
      fi
      node "$TOOLS/downsample.mjs" /tmp/_g.raw /tmp/_g.depth /tmp/_g.normal /tmp/_g1 $W $H $SS >/dev/null
      python3 "$TOOLS/tone_pass.py" /tmp/_g1.raw /tmp/_g1t.raw 240 320 "${TONE[@]}" >/dev/null
      node "$TOOLS/postprocess.mjs" /tmp/_g1t.raw /tmp/_g1.depth /tmp/_g1.normal /tmp/_g2.raw 240 320 "${PP[@]}" >/dev/null
      python3 -c "
from PIL import Image
import sys
Image.frombytes('RGBA',(240,320),open('/tmp/_g2.raw','rb').read()).save(sys.argv[1])
" "$OUT/${IDXNAME}_${dir}_${i}.png"
      i=$((i+1))
    done
    echo "    $dir done"
  done
}

B="assets/_trial_20260912"
echo "=== run（模型自带 animations[1]）==="
IDXNAME=run render_group "$B/glb2d_run/run_6dir" 1 none 0 0.2583 0.5167 0.775 1.0333
python3 "$TOOLS/ground_lock.py" "$B/glb2d_run/run_6dir" "run_*.png" --target 299
python3 "$TOOLS/png8_encode.py" "$B/glb2d_run/run_6dir" "$B/glb2d_run/run_6dir"

echo "=== jump（retarget，源帧 0/15/18/24/12）==="
IDXNAME=jump render_group "$B/glb2d_jump/jump_6dir_v4" none "$M4/retarget_jump_v4.json" 0 0.5 0.6 0.8 0.4
python3 "$TOOLS/ground_lock.py" "$B/glb2d_jump/jump_6dir_v4" "jump_*.png" --target 299
python3 "$TOOLS/png8_encode.py" "$B/glb2d_jump/jump_6dir_v4" "$B/glb2d_jump/jump_6dir_v4"

echo "=== atk（retarget，源帧 0/8/19/30/44）==="
IDXNAME=atk render_group "$B/glb2d_atk/atk_6dir_v4" none "$M4/retarget_atk_v4.json" 0 0.2667 0.6333 1.0 1.4667
python3 "$TOOLS/ground_lock.py" "$B/glb2d_atk/atk_6dir_v4" "atk_*.png" --target 299
python3 "$TOOLS/png8_encode.py" "$B/glb2d_atk/atk_6dir_v4" "$B/glb2d_atk/atk_6dir_v4"

echo "=== cast（retarget，连招第一段 源帧 0/11/22/33/44）==="
IDXNAME=cast render_group "$B/glb2d_cast/cast_6dir_v4" none "$M4/retarget_cast_v4.json" 0 0.3667 0.7333 1.1 1.4667
python3 "$TOOLS/ground_lock.py" "$B/glb2d_cast/cast_6dir_v4" "cast_*.png" --target 299
python3 "$TOOLS/png8_encode.py" "$B/glb2d_cast/cast_6dir_v4" "$B/glb2d_cast/cast_6dir_v4"

echo "DONE"
