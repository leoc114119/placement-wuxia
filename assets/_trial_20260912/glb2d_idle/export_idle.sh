#!/bin/zsh
# idle 六向 × 5 帧导出（2026-09-12）
#
# 源：Mixamo **"Orc Idle"** → `src/Orc Idle.dae`（Collada / Without Skin / 30fps / no reduction）
#     ⚠️ 09-12 换源：前一个源 "Standing Idle" 是**屈膝错步站姿**（源膝弯 48°/57°、大腿离垂直 48°/33°），
#        重定向后脚底比 walk/run 高 11px、观感也不像站立待机 → Leo 裁定改用 Orc Idle。
#        Mixamo 动作与角色无关（Without Skin 只取骨架+动作）→ 源名叫 "Orc" 不影响适配本模型。
#        实测 Orc Idle：膝弯 31.9°/30.5°（左右差 1.4°，对称）、大腿离垂直 19.8°/19.7°、髋高 93.4
#        → 渲染后脚底 y = **306**（rest 基准线 307，仅差 1px）。
# 重定向：tools/glb2d/collada2anim.mjs --fps 30 --root y（mode 默认 aim3，2026-09-12 起）
# 抽帧：**循环动作 → 均匀相位**（不是贪心最远点——那会挑出重复帧）
#       实测 199 帧闭环（帧 199 ≡ 帧 0，旋转差精确为 0），6.633s
#       5 帧 → 每帧 1327ms（= 源循环时长 ÷ 帧数，等时长档）
#       采样相位帧号 0 / 40 / 80 / 119 / 159
#
# 本脚本渲染参数与已交付的 run/jump/walk 六向**完全一致**——
# 已用「控制实验」验证：同参数重渲 run_left_1 与交付件逐字节零差异。
set -e
GLB="$HOME/Downloads/chibi+warrior+3d+model (1).glb"
TEX="assets/_trial_20260911/glb2d_v2/tex/basecolor.raw"
DIR="assets/_trial_20260912/glb2d_idle"
ANIM_JSON="$DIR/retarget_idle_aim4.json"
OUT="$DIR/idle_6dir"

TOOLS="tools/glb2d"
SS=4
W=$(( 240 * SS )); H=$(( 320 * SS ))

# 后处理参数：zsh 数组（写成字符串会被当成单个参数 → 静默用默认值，本项目踩过）
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)

# 方向 → yaw（实测映射，勿凭感觉改；已由 run 交付件反查确认）
DIRS=(left:270 leftdown:225 leftup:315 right:90 rightdown:135 rightup:45)
# 采样源帧号（30fps）—— 199 帧闭环的均匀相位
SRC_FRAMES=(0 40 80 119 159)

mkdir -p "$OUT"
for entry in "${DIRS[@]}"; do
  dir="${entry%%:*}"; yaw="${entry##*:}"
  i=1
  for sf in "${SRC_FRAMES[@]}"; do
    t=$(python3 -c "print(round($sf/30,6))")
    node "$TOOLS/render.mjs" "$GLB" /tmp/_id.raw $W $H none "$t" flatcel "$TEX" 2048 2048 "$yaw" /tmp/_id "$ANIM_JSON" >/dev/null
    node "$TOOLS/downsample.mjs" /tmp/_id.raw /tmp/_id.depth /tmp/_id.normal /tmp/_id1 $W $H $SS >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_id1.raw /tmp/_id1.depth /tmp/_id1.normal /tmp/_id2.raw 240 320 "${PP[@]}" >/dev/null
    python3 -c "
from PIL import Image
Image.frombytes('RGBA',(240,320),open('/tmp/_id2.raw','rb').read()).save('$OUT/idle_${dir}_${i}.png')
"
    i=$((i+1))
  done
  echo "  $dir done (yaw=$yaw)"
done

echo "TOTAL(raw PNG): $(ls $OUT/*.png | wc -l | tr -d ' ')"
