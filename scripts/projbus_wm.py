#!/usr/bin/env python3
"""读某角色的 projbus 唤醒水位线（用于判断是否真的投递了）。用法：projbus_wm.py <role>"""
import json, pathlib, sys
p = pathlib.Path.home() / ".codex" / "projbus-drive-state.json"
try:
    d = json.loads(p.read_text())
    print(d.get("roles", {}).get(sys.argv[1], {}).get("watermark_seq", 0))
except Exception:
    print(0)
