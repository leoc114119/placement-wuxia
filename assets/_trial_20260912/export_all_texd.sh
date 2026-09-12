#!/bin/zsh
# 五组动作帧 —— **细节贴图版**（Leo 09-12 令：把别的动作帧都做出来）
#
# 与 export_remaining_v4.sh / export_walk_v4.sh 的唯一差别：**贴图换成回填后的细节贴图**。
# 模型、动画源、抽帧时间点、渲染/降采样/影调/后处理参数、地面锁定 —— 全部一字不动。
# 目的：一个模型 + 一张贴图管所有动作，比例跨动作天然一致。
#
# 规格：240×320 ｜ 六向 ｜ 5 帧 ｜ 地面锁定 299 ｜ PNG-8 无损（全 30 帧共用 248 色调色板）
set -e
GLB="$HOME/Downloads/chibi+character+3d+model (2).glb"
TEX="assets/_trial_20260912/贴图回填_美术线输入/配准后/basecolor_detail_20views.raw"
M4="assets/_trial_20260912/model_v4"
B="assets/_trial_20260912"
TOOLS="tools/glb2d"; SS=4; W=$((240*SS)); H=$((320*SS))
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)
DIRS=(left:90 leftdown:135 leftup:45 right:270 rightdown:225 rightup:315)
TONE=(--contrast 1.5 --saturation 1.25 --brightness 2 --red 26 --red-scope warm)
[ -f "$TEX" ] || { echo "FATAL: 细节贴图不存在 $TEX"; exit 1; }

render_group() {
  local OUT="$1" IDX="$2" JSON="$3"; shift 3
  local TS=("$@")
  mkdir -p "$OUT"
  for entry in "${DIRS[@]}"; do
    local dir="${entry%%:*}" yaw="${entry##*:}" i=1
    for t in "${TS[@]}"; do
      if [ "$JSON" = "none" ]; then
        node "$TOOLS/render.mjs" "$GLB" /tmp/_gt.raw $W $H "$IDX" "$t" flatcel "$TEX" 4096 4096 "$yaw" /tmp/_gt >/dev/null
      else
        node "$TOOLS/render.mjs" "$GLB" /tmp/_gt.raw $W $H none "$t" flatcel "$TEX" 4096 4096 "$yaw" /tmp/_gt "$JSON" >/dev/null
      fi
      node "$TOOLS/downsample.mjs" /tmp/_gt.raw /tmp/_gt.depth /tmp/_gt.normal /tmp/_gt1 $W $H $SS >/dev/null
      python3 "$TOOLS/tone_pass.py" /tmp/_gt1.raw /tmp/_gt1t.raw 240 320 "${TONE[@]}" >/dev/null
      node "$TOOLS/postprocess.mjs" /tmp/_gt1t.raw /tmp/_gt1.depth /tmp/_gt1.normal /tmp/_gt2.raw 240 320 "${PP[@]}" >/dev/null
      python3 -c "
from PIL import Image
import sys
Image.frombytes('RGBA',(240,320),open('/tmp/_gt2.raw','rb').read()).save(sys.argv[1])
" "$OUT/${IDXNAME}_${dir}_${i}.png"
      i=$((i+1))
    done
  done
}

finish() {
  local OUT="$1" PAT="$2"
  python3 "$TOOLS/ground_lock.py" "$OUT" "$PAT" --target 299
  python3 "$B/png8_shared_palette.py" "$OUT" >/dev/null
  python3 "$TOOLS/png8_encode.py" "$OUT" "$OUT" | tail -1
  rm -rf "$OUT/_rgba_backup"
  echo "    $OUT: $(ls $OUT/*.png | wc -l | tr -d ' ') 帧"
}

echo "=== walk（模型自带 preset:biped:walk = animations[0]）==="
IDXNAME=walk render_group "$B/glb2d_walk/walk_6dir_v4_texd" 0 none 0 0.375 0.75 1.125 1.5
finish "$B/glb2d_walk/walk_6dir_v4_texd" "walk_*.png"

echo "=== run（模型自带 animations[1]）==="
IDXNAME=run render_group "$B/glb2d_run/run_6dir_v4_texd" 1 none 0 0.2583 0.5167 0.775 1.0333
finish "$B/glb2d_run/run_6dir_v4_texd" "run_*.png"

echo "=== jump（源帧 0/15/18/24/12）==="
IDXNAME=jump render_group "$B/glb2d_jump/jump_6dir_v4_texd" none "$M4/retarget_jump_v4.json" 0 0.5 0.6 0.8 0.4
finish "$B/glb2d_jump/jump_6dir_v4_texd" "jump_*.png"

echo "=== atk（源帧 0/8/19/30/44）==="
IDXNAME=atk render_group "$B/glb2d_atk/atk_6dir_v4_texd" none "$M4/retarget_atk_v4.json" 0 0.2667 0.6333 1.0 1.4667
finish "$B/glb2d_atk/atk_6dir_v4_texd" "atk_*.png"

echo "=== cast（连招第一段 源帧 0/11/22/33/44）==="
IDXNAME=cast render_group "$B/glb2d_cast/cast_6dir_v4_texd" none "$M4/retarget_cast_v4.json" 0 0.3667 0.7333 1.1 1.4667
finish "$B/glb2d_cast/cast_6dir_v4_texd" "cast_*.png"

echo "DONE 五组"
