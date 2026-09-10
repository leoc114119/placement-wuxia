from PIL import Image, ImageDraw

W,H=240,320
BG=(255,255,255,255)
DARK=(45,45,50,255)
BLUE=(0,90,255,255)      # 动作肢体（高饱和）
GREY=(165,165,172,255)   # 非动作肢体（弱化）
LW=9                     # 肢干线宽（夸张明确）

def base_fig(d):
    # 头（圆）+ 躯干（直线），中性
    d.ellipse([W//2-30, 42, W//2+30, 102], fill=BG, outline=DARK, width=LW)
    d.line([W//2, 102, W//2, 178], fill=DARK, width=LW)          # 躯干
    d.line([W//2-26, 120, W//2+26, 120], fill=DARK, width=LW-2)  # 肩线

def leg(d, hipx, hipy, kneex, kneey, footx, footy, color):
    d.line([hipx,hipy,kneex,kneey], fill=color, width=LW)
    d.line([kneex,kneey,footx,footy], fill=color, width=LW)
    d.ellipse([footx-13,footy-9,footx+13,footy+9], fill=color)   # 脚

def arm(d, shx, shy, elx, ely, fistx, fisty, color, fist_r=15):
    d.line([shx,shy,elx,ely], fill=color, width=LW)
    d.line([elx,ely,fistx,fisty], fill=color, width=LW)
    d.ellipse([fistx-fist_r,fisty-fist_r,fistx+fist_r,fisty+fist_r], fill=color)  # 拳

def save(name, drawfn):
    im=Image.new("RGBA",(W,H),BG); d=ImageDraw.Draw(im)
    base_fig(d); drawfn(d)
    im.convert("RGB").save(f"assets/_trial_20260910/t45_chain_limb_alternation/pose_diagrams/{name}.png")
    print("saved", name)

HIP=(120,178)
# 腿：A=画面右腿在前（蓝），B=画面左腿在前（蓝）
def legs_right_forward(d):
    leg(d, *HIP, 158,232, 182,292, BLUE)     # 前腿（画面右）
    leg(d, *HIP, 92,224, 66,286, GREY)       # 后腿（画面左）
def legs_left_forward(d):
    leg(d, *HIP, 82,232, 58,292, BLUE)       # 前腿（画面左）
    leg(d, *HIP, 148,224, 174,286, GREY)     # 后腿（画面右）

SH=(120,122)
# 拳：A=画面右拳伸出（蓝），B=画面左拳伸出（蓝）
def fist_right_out(d):
    arm(d, *SH, 162,132, 196,138, BLUE, 17)  # 伸出（画面右）
    arm(d, *SH, 96,150, 100,163, GREY, 11)   # 收腰侧
def fist_left_out(d):
    arm(d, *SH, 84,132, 52,138, BLUE, 17)    # 伸出（画面左）
    arm(d, *SH, 146,150, 142,163, GREY, 11)  # 收腰侧

save("legs_A_right_forward", legs_right_forward)
save("legs_B_left_forward",  legs_left_forward)
save("fist_A_right_out",     fist_right_out)
save("fist_B_left_out",      fist_left_out)
