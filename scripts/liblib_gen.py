#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LiblibAI API 生图脚本（放置武侠 · Q版水墨国风素材）
认证：AccessKey + HMAC-SHA1 签名（Liblib 开放平台）
路线：Qwen-Image 底模（75e0be0c...）+ 可选 Q版 LoRA（场景 bg_q / 人物 hero_q）
任务：bg(背景) / hero(人物) / icon(道具图标)
省积分：默认每次 1 张（Leo 2026-08-19 拍板）

参考模型（Leo 提供，Liblib 模型页 ?versionUuid=）：
  场景/人物 两套 Q版 LoRA，从会话日志 recovered，待 Leo 确认 scene/character 映射：
  A: modelinfo/253852721aa446b2800554ced51dacc1  versionUuid=25459cf279334606ab63b43c2bd02c41
  B: modelinfo/588eec21eb9a4471903ed8124bd29766  versionUuid=fab33aeaedc145a2be890fdb4f226c05
  脚本通过 env 注入：LIBLIB_LORA_SCENE / LIBLIB_LORA_CHAR
"""
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import uuid

BASE = "https://openapi.liblibai.cloud"

# ===== Qwen 路线（最终定稿路线，对齐 bg_main / hero_idle）=====
TEMPLATE_QWEN = "bf085132c7134622895b783b520b39ff"    # Qwen 文生图模板
CHECKPOINT_QWEN = "75e0be0c93b34dd8baeec9c968013e0c"  # Qwen-Image 底模
STATUS_QWEN = "/api/generate/status"                  # Qwen 查询接口（SKILL 记录）
SUBMIT_QWEN = "/api/generate/webui/text2img"          # Qwen 提交接口（与 F.1 同路由，仅底模/template 不同）
SAMPLER_EULER = 1
STEPS_QWEN = 30
CFG_QWEN = 4.0

# ===== F.1 路线（备选 / 青绿山水测试）=====
TEMPLATE_F1 = "6f7c4652458d4802969f8d089cf5b91f"
CHECKPOINT_F1 = "412b427ddb674b4dbab9e5abd5ae6057"
STATUS_F1 = "/api/generate/webui/status"
SUBMIT_F1 = "/api/generate/webui/text2img"
SAMPLER_DPM2M = 15
STEPS_F1 = 28
CFG_F1 = 4.0

# Q版 LoRA（可选，env 注入 versionUuid；LIBLIB_LORA_SCENE=场景，LIBLIB_LORA_CHAR=人物）
LORA_SCENE = os.environ.get("LIBLIB_LORA_SCENE", "")
LORA_CHAR = os.environ.get("LIBLIB_LORA_CHAR", "")

NEGATIVE = "lowres, blurry, text, watermark, logo, 文字, 水印, 模糊, 低清, 变形, 杂乱, 过度饱和"


def make_sign(uri: str, timestamp: str, nonce: str) -> str:
    """HMAC-SHA1 签名：原文 = URL + '&' + 时间戳 + '&' + 随机串"""
    secret = os.environ["LIBLIB_SECRET_KEY"]
    content = f"{uri}&{timestamp}&{nonce}"
    digest = hmac.new(secret.encode(), content.encode(), hashlib.sha1).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def api_post(uri: str, body: dict) -> dict:
    ts = str(int(time.time() * 1000))
    nonce = str(uuid.uuid4())
    sign = make_sign(uri, ts, nonce)
    url = f"{BASE}{uri}?AccessKey={urllib.parse.quote(os.environ['LIBLIB_ACCESS_KEY'])}&Signature={sign}&Timestamp={ts}&SignatureNonce={nonce}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def submit_text2img(route: str, prompt: str, width: int, height: int, img_count: int = 1, lora: str = "", lora_weight: float = 0.8) -> str:
    """提交文生图任务，返回 generateUuid。route='qwen'|'f1'"""
    if route == "qwen":
        template, ckpt, sampler, steps, cfg, submit = (
            TEMPLATE_QWEN, CHECKPOINT_QWEN, SAMPLER_EULER, STEPS_QWEN, CFG_QWEN, SUBMIT_QWEN)
    else:
        template, ckpt, sampler, steps, cfg, submit = (
            TEMPLATE_F1, CHECKPOINT_F1, SAMPLER_DPM2M, STEPS_F1, CFG_F1, SUBMIT_F1)
    params = {
        "checkPointId": ckpt,
        "prompt": prompt,
        "negativePrompt": NEGATIVE,
        "sampler": sampler,
        "steps": steps,
        "cfgScale": cfg,
        "width": width,
        "height": height,
        "imgCount": img_count,
        "seed": -1,
        "restoreFaces": 0,
    }
    if lora:
        params["additionalNetwork"] = [{"modelId": lora, "weight": lora_weight}]
    body = {"templateUuid": template, "generateParams": params}
    r = api_post(submit, body)
    if r.get("code") != 0:
        raise RuntimeError(f"提交失败: {r}")
    return r["data"]["generateUuid"]


def wait_result(status_uri: str, generate_uuid: str, timeout: int = 300) -> dict:
    """轮询状态直到成功，返回 data"""
    start = time.time()
    while time.time() - start < timeout:
        r = api_post(status_uri, {"generateUuid": generate_uuid})
        data = r.get("data", {})
        status = data.get("generateStatus")
        if status == 5:  # 成功
            return data
        if status == 6:
            raise RuntimeError(f"生成失败: {data.get('generateMsg')}")
        time.sleep(3)
    raise TimeoutError("轮询超时")


def download(url: str, path: str):
    with urllib.request.urlopen(url, timeout=60) as resp, open(path, "wb") as f:
        f.write(resp.read())
    print(f"  ✅ 已保存: {path}")


PROMPTS = {
    "bg": (
        "青绿山水国风仙侠场景，远山层叠云雾缭绕，悬崖边有古楼屋檐，"
        "朱砂灯笼点缀，仙鹤飞过，一缕清泉从山间流下，"
        "宣纸底色质感，意境留白，明亮清透不灰暗，高清，"
        "无人物无文字无水印，竖屏构图"
    ),
    "hero": (
        "青绿山水国风仙侠Q版少年侠客盘腿打坐修炼，"
        "二头身大头身，束发髻戴发带，白袍劲装，剑眉，目光坚定，"
        "闭目运功，衣袂灵动，周身淡朱砂色水墨气场环绕，"
        "少年英气，水墨画风，清透活泼，"
        "纯白背景，人物居中完整全身，无任何文字无水印"
    ),
    "icon": (
        "Q版水墨国风武学秘籍古籍书本图标，卡通可爱画风，水墨简笔，"
        "朱砂描边，竹青色封面烫金线点缀，古朴线装书卷，"
        "居中构图，纯白背景，无任何文字无水印"
    ),
}

SIZES = {"bg": (768, 1344), "hero": (768, 1024), "icon": (1024, 1024)}
WEIGHTS = {"bg": 0.8, "hero": 0.5, "icon": 0.6}
ROUTES = {"bg": "qwen", "hero": "qwen", "icon": "qwen"}
OUT_DIRS = {"bg": "assets/ui", "hero": "assets/ui", "icon": "assets/ui/icons"}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in PROMPTS:
        print("用法: python3 scripts/liblib_gen.py [bg|hero|icon]")
        sys.exit(1)
    task = sys.argv[1]
    if not os.environ.get("LIBLIB_ACCESS_KEY") or not os.environ.get("LIBLIB_SECRET_KEY"):
        print("❌ 请先设置环境变量 LIBLIB_ACCESS_KEY / LIBLIB_SECRET_KEY")
        sys.exit(1)
    route = ROUTES[task]
    status_uri = STATUS_QWEN if route == "qwen" else STATUS_F1
    # 道具图标用场景 LoRA 锚定水墨物件质感；人物/背景按各自 LoRA
    lora = {"bg": LORA_SCENE, "hero": LORA_CHAR, "icon": LORA_SCENE}[task]
    if not lora:
        print(f"⚠️  未设置对应 LoRA env（icon/bg 需 LIBLIB_LORA_SCENE，hero 需 LIBLIB_LORA_CHAR），将不带 LoRA 生成")
    print(f"🚀 提交任务: {task}（route={route}, imgCount=1, LoRA 权重 {WEIGHTS[task]}）")
    gid = submit_text2img(route, PROMPTS[task], *SIZES[task], img_count=1, lora=lora, lora_weight=WEIGHTS[task])
    print(f"  task_id={gid}，轮询中...")
    data = wait_result(status_uri, gid)
    imgs = data.get("images", [])
    print(f"  成功，共 {len(imgs)} 张，消耗积分 {data.get('pointsCost')}，余额 {data.get('accountBalance')}")
    out_dir = OUT_DIRS[task]
    os.makedirs(out_dir, exist_ok=True)
    for i, img in enumerate(imgs):
        download(img["imageUrl"], f"{out_dir}/{task}_{gid[:8]}_{i+1}.png")


if __name__ == "__main__":
    main()
