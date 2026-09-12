#!/bin/zsh
# 攻击（Sword And Shield Slash）六向 × 5 帧导出（2026-09-12）
#
# 源：Mixamo `Sword And Shield Slash` → `src/Sword And Shield Slash.dae`
#     （Collada / Without Skin / 30fps / Keyframe Reduction: none / **Trim 全 46 帧** / 不勾 Mirror）
#     Leo 09-12 已目视确认「副手持盾的姿势拿掉盾不违和」。
# 重定向：tools/glb2d/collada2anim.mjs --fps 30 --root y（mode 默认 aim4）
# 抽帧：**一次性动作 → 贪心最远点采样**（`tools/glb2d/select_keyframes.py`，保留极值帧）
#       源 45 帧 → 选 5 帧 = **0 / 8 / 19 / 30 / 44**（覆盖度 5470）
#       ⚠️ 循环动作才用均匀相位；一次性动作用最远点，两者不可混用
#
# 渲染参数与 idle/run/jump 六向**完全一致**（只换 ANIM_JSON）——
# 目的是保证**人物高度/脚底基准线跨动作一致**（Leo 09-12 特别叮嘱的一条）。
set -e
GLB="$HOME/Downloads/chibi+warrior+3d+model (1).glb"
TEX="assets/_trial_20260911/glb2d_v2/tex/basecolor.raw"
DIR="assets/_trial_20260912/glb2d_atk"
ANIM_JSON="$DIR/retarget_atk_aim4.json"
OUT="$DIR/atk_6dir"

TOOLS="tools/glb2d"
SS=4
W=$(( 240 * SS )); H=$(( 320 * SS ))
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)

DIRS=(left:270 leftdown:225 leftup:315 right:90 rightdown:135 rightup:45)
SRC_FRAMES=(0 8 19 30 44)     # 源帧号（30fps）—— 贪心最远点采样结果

mkdir -p "$OUT"
for entry in "${DIRS[@]}"; do
  dir="${entry%%:*}"; yaw="${entry##*:}"
  i=1
  for sf in "${SRC_FRAMES[@]}"; do
    t=$(python3 -c "print(round($sf/30,6))")
    node "$TOOLS/render.mjs" "$GLB" /tmp/_ak.raw $W $H none "$t" flatcel "$TEX" 2048 2048 "$yaw" /tmp/_ak "$ANIM_JSON" >/dev/null
    node "$TOOLS/downsample.mjs" /tmp/_ak.raw /tmp/_ak.depth /tmp/_ak.normal /tmp/_ak1 $W $H $SS >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_ak1.raw /tmp/_ak1.depth /tmp/_ak1.normal /tmp/_ak2.raw 240 320 "${PP[@]}" >/dev/null
    python3 -c "
from PIL import Image
Image.frombytes('RGBA',(240,320),open('/tmp/_ak2.raw','rb').read()).save('$OUT/atk_${dir}_${i}.png')
"
    i=$((i+1))
  done
  echo "  $dir done (yaw=$yaw)"
done
echo "TOTAL(raw PNG): $(ls $OUT/*.png | wc -l | tr -d ' ')"
