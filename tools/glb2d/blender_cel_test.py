#!/usr/bin/env python3
"""Blender 侧 cel 渲染试验：验证「3D 模型经正经 cel 材质 + 描边，能否接近线上 2D 手绘观感」。

背景：自研渲染器上试过 cel 三阶色，实测推不动（锐度 1.18→1.15、对比度 34→28.4）。
      这次换 Blender 的正经管线：EEVEE + Shader-to-RGB → ColorRamp 三阶 + Freestyle 描边。

用法（无头）：
  blender --background --python tools/glb2d/blender_cel_test.py -- \
      --glb <model.glb> --tex <basecolor.png> --out <out.png> --yaw 270 --res 480x640
"""
from __future__ import annotations

import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if "--" + name in argv:
        return argv[argv.index("--" + name) + 1]
    return default


GLB = arg("glb")
TEX = arg("tex")
OUT = arg("out")
YAW = float(arg("yaw", "270"))
RES = arg("res", "480x640")
RW, RH = (int(v) for v in RES.split("x"))
BANDS = arg("bands", "0.62,0.80,1.0")

if not GLB or not OUT:
    print("FATAL: 需要 --glb 与 --out"); sys.exit(1)

# ---------- 清空 ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- 引擎 ----------
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        scene.render.engine = eng
        print("engine =", eng)
        break
    except TypeError:
        continue
else:
    print("FATAL: 找不到 EEVEE 引擎"); sys.exit(1)

scene.render.resolution_x = RW
scene.render.resolution_y = RH
scene.render.resolution_percentage = 100
scene.render.film_transparent = True          # 透明底，便于抠图
scene.view_settings.view_transform = "Standard"  # 不要 Filmic，否则颜色发灰
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

# ---------- 导入模型 ----------
bpy.ops.import_scene.gltf(filepath=GLB)
meshes_all = [o for o in bpy.data.objects if o.type == "MESH"]
print("meshes:", [(o.name, len(o.data.vertices)) for o in meshes_all])
# ★ GLB 里混了一个多余的 Icosphere（不属于角色）——按顶点数只留主网格，其余删掉，
#   否则它会污染包围盒，让相机取景完全跑偏。
if len(meshes_all) > 1:
    meshes = [max(meshes_all, key=lambda o: len(o.data.vertices))]
    for o in meshes_all:
        if o not in meshes:
            print("  剔除杂项网格:", o.name)
            bpy.data.objects.remove(o, do_unlink=True)
else:
    meshes = meshes_all
if not meshes:
    print("FATAL: 没导入到网格"); sys.exit(1)

# ---------- cel 材质 ----------
lo, mid, hi = (float(v) for v in BANDS.split(","))
for obj in meshes:
    mat = bpy.data.materials.new(name="cel_" + obj.name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (900, 0)
    emis = nt.nodes.new("ShaderNodeEmission"); emis.location = (700, 0)
    mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type = "MULTIPLY"
    mix.location = (450, 0); mix.inputs["Fac"].default_value = 1.0

    tex = nt.nodes.new("ShaderNodeTexImage"); tex.location = (0, -200)
    if TEX and os.path.exists(TEX):
        img = bpy.data.images.load(TEX)
        tex.image = img
    else:
        print("WARN: 没给贴图，用材质自带 baseColor")

    diff = nt.nodes.new("ShaderNodeBsdfDiffuse"); diff.location = (-200, 200)
    diff.inputs["Color"].default_value = (1, 1, 1, 1)
    s2rgb = nt.nodes.new("ShaderNodeShaderToRGB"); s2rgb.location = (0, 200)
    ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.location = (200, 200)
    ramp.color_ramp.interpolation = "CONSTANT"
    el = ramp.color_ramp.elements
    el[0].position = 0.0;  el[0].color = (lo, lo, lo, 1)
    el[1].position = 0.28; el[1].color = (mid, mid, mid, 1)
    e2 = el.new(0.60); e2.color = (hi, hi, hi, 1)

    nt.links.new(diff.outputs["BSDF"], s2rgb.inputs["Shader"])
    nt.links.new(s2rgb.outputs["Color"], ramp.inputs["Fac"])
    if tex.image:
        nt.links.new(tex.outputs["Color"], mix.inputs["Color1"])
    else:
        mix.inputs["Color1"].default_value = (1, 1, 1, 1)
    nt.links.new(ramp.outputs["Color"], mix.inputs["Color2"])
    nt.links.new(mix.outputs["Color"], emis.inputs["Color"])
    nt.links.new(emis.outputs["Emission"], out.inputs["Surface"])

    obj.data.materials.clear()
    obj.data.materials.append(mat)
print("cel 材质就绪：bands =", (lo, mid, hi))

# ---------- 相机：正交，按角色包围盒取景 ----------
bpy.context.view_layer.update()
import mathutils
pts = []
for obj in meshes:
    for c in obj.bound_box:
        pts.append(obj.matrix_world @ mathutils.Vector(c))
yaw = math.radians(YAW)
# 按「相机坐标轴」投影取景，跟自研渲染器同一套逻辑（正交、按高度取景）
# Blender 相机默认看向 -Z、up 为 +Y；按 (90°,0,yaw) 旋转后视线方向 = (-sin yaw, cos yaw, 0)
viewdir = mathutils.Vector((-math.sin(yaw), math.cos(yaw), 0))
right = mathutils.Vector((math.cos(yaw), math.sin(yaw), 0))
zs = [p.z for p in pts]
us = [p.dot(right) for p in pts]
charH = max(zs) - min(zs)
charW = max(us) - min(us)
cam_data = bpy.data.cameras.new("cam"); cam_data.type = "ORTHO"
cam_data.ortho_scale = max(charH / 0.80, charW / 0.92)
dist = max(charH, charW) * 3
cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam)
scene.camera = cam
cz = (min(zs) + max(zs)) / 2
cu = (min(us) + max(us)) / 2
# 相机放在角色中心沿视线反方向 dist 处（否则会背对角色，渲出一片空）
cam.location = (-viewdir.x * dist + right.x * cu, -viewdir.y * dist + right.y * cu, cz)
cam.rotation_euler = (math.radians(90), 0, yaw)
print("cam ortho_scale=%.3f charH=%.3f charW=%.3f" % (cam_data.ortho_scale, charH, charW))

# ---------- 灯光 ----------
sun = bpy.data.lights.new("key", type="SUN"); sun.energy = 3.0
so = bpy.data.objects.new("key", sun); scene.collection.objects.link(so)
so.rotation_euler = (math.radians(55), 0, math.radians(-40))
fill = bpy.data.lights.new("fill", type="SUN"); fill.energy = 1.0
fo = bpy.data.objects.new("fill", fill); scene.collection.objects.link(fo)
fo.rotation_euler = (math.radians(70), 0, math.radians(140))
scene.world = bpy.data.worlds.new("w")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.5, 0.5, 0.6, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.35

# ---------- Freestyle 描边 ----------
scene.render.use_freestyle = True
vl = scene.view_layers[0]
vl.use_freestyle = True
fs = vl.freestyle_settings
if not fs.linesets:
    fs.linesets.new("ls")
ls = fs.linesets[0]
# Blender 5.x：lineset 默认没有 linestyle，要自己建一个
if ls.linestyle is None:
    ls.linestyle = bpy.data.linestyles.new("cel_line")
ls.select_silhouette = True
ls.select_border = True
ls.select_crease = False
ls.select_edge_mark = False
ls.linestyle.color = (0.05, 0.04, 0.05)
ls.linestyle.thickness = float(arg("outline", "2.0"))

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
scene.render.filepath = os.path.abspath(OUT)
bpy.ops.render.render(write_still=True)
print("RENDERED ->", OUT)
