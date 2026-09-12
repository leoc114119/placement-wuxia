#!/bin/zsh
# 逐部件渲染（路线：3D 出部件 → 2D 骨骼工具拼装绑定 → 骨骼动画）
#
# 原理：渲染器加 PART_BONES=<骨名,...>，只画"主导骨落在该集合里"的三角面。
#   判定用**任一顶点命中**（不是全部命中）—— 关节处的过渡面会同时出现在相邻两个部件上，
#   拼装时关节自带重叠、不会露缝。
#   相机/光照/缩放完全不变 ⇒ 各部件天然对齐，拼装时不需要再对位。
#
# 输出：assets/_trial_20260912/2D骨骼_部件/parts/*.png（带 alpha）
#       + contact_sheet.png（全部部件拼图）
set -e
GLB="$HOME/Downloads/chibi+character+3d+model (2).glb"
TEX="assets/_trial_20260912/model_v4/tex/basecolor.raw"
ANIM="assets/_trial_20260912/model_v4/retarget_idle_v4.json"
OUT="assets/_trial_20260912/2D骨骼_部件"
W=960; H=1280; YAW=270
TOOLS="tools/glb2d"
[ -f "$GLB" ] || { echo "FATAL: 模型不存在 $GLB"; exit 1; }
mkdir -p "$OUT/parts"

# 部件定义：名字=骨名列表（逗号分隔）
PARTS=(
  "head=Head"
  "neck=NeckTwist01,NeckTwist02"
  "torso=Spine01,Spine02,Waist,Pelvis,Hip,Root"
  "arm_upper_L=L_Clavicle,L_Upperarm,L_UpperarmTwist01,L_UpperarmTwist02"
  "arm_lower_L=L_Forearm,L_ForearmTwist01,L_ForearmTwist02"
  "hand_L=L_Hand"
  "arm_upper_R=R_Clavicle,R_Upperarm,R_UpperarmTwist01,R_UpperarmTwist02"
  "arm_lower_R=R_Forearm,R_ForearmTwist01,R_ForearmTwist02"
  "hand_R=R_Hand"
  "leg_upper_L=L_Thigh,L_ThighTwist01,L_ThighTwist02"
  "leg_lower_L=L_Calf,L_CalfTwist01,L_CalfTwist02"
  "foot_L=L_Foot,L_ToeBase"
  "leg_upper_R=R_Thigh,R_ThighTwist01,R_ThighTwist02"
  "leg_lower_R=R_Calf,R_CalfTwist01,R_CalfTwist02"
  "foot_R=R_Foot,R_ToeBase"
)

echo "=== 全身对照 ==="
node "$TOOLS/render.mjs" "$GLB" /tmp/_pt_full.raw $W $H none 0 flatcel "$TEX" 4096 4096 $YAW /tmp/_pt_full "$ANIM" >/dev/null
python3 -c "
from PIL import Image
Image.frombytes('RGBA',$W*$H*0+($W,$H),open('/tmp/_pt_full.raw','rb').read()).save('$OUT/parts/_full.png')
" 2>/dev/null || python3 - <<PY
from PIL import Image
Image.frombytes('RGBA',($W,$H),open('/tmp/_pt_full.raw','rb').read()).save('$OUT/parts/_full.png')
PY

for entry in "${PARTS[@]}"; do
  name="${entry%%=*}"; bones="${entry##*=}"
  PART_BONES="$bones" node "$TOOLS/render.mjs" "$GLB" /tmp/_pt.raw $W $H none 0 flatcel "$TEX" 4096 4096 $YAW /tmp/_pt "$ANIM" >/dev/null
  python3 - <<PY
from PIL import Image
im=Image.frombytes('RGBA',($W,$H),open('/tmp/_pt.raw','rb').read())
im.save('$OUT/parts/${name}.png')
n=sum(1 for p in im.getdata() if p[3]>0)
print('  %-14s %7d px' % ('${name}', n))
PY
done

echo "=== 拼图 ==="
python3 - <<'PY'
from PIL import Image, ImageDraw
import glob, os
OUT='assets/_trial_20260912/2D骨骼_部件'
files=[p for p in sorted(glob.glob(OUT+'/parts/*.png')) if not os.path.basename(p).startswith('_full')]
TH=260
tiles=[]
for p in files:
    im=Image.open(p).convert('RGBA')
    a=im.getchannel('A'); bb=a.getbbox()
    if bb: im=im.crop(bb)
    s=TH/im.size[1]
    im=im.resize((max(1,round(im.size[0]*s)),TH),Image.Resampling.LANCZOS)
    tiles.append((os.path.basename(p)[:-4], im))
cols=8; rows=(len(tiles)+cols-1)//cols
cw=max(t.size[0] for _,t in tiles)+16
c=Image.new('RGB',(cw*cols, (TH+28)*rows+8),(28,28,32))
d=ImageDraw.Draw(c)
for i,(n,im) in enumerate(tiles):
    r,cc=divmod(i,cols)
    x=cc*cw+(cw-im.size[0])//2; y=r*(TH+28)+24
    bg=Image.new('RGBA',im.size,(20,20,24,255)); bg.alpha_composite(im)
    c.paste(bg.convert('RGB'),(x,y))
    d.text((cc*cw+6, r*(TH+28)+6), '%s  %dx%d'%(n, im.size[0], im.size[1]), fill=(255,225,130))
c.save(OUT+'/contact_sheet.png')
print('→', OUT+'/contact_sheet.png', c.size, '部件数', len(tiles))
PY
echo "DONE"
