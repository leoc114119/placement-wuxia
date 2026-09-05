#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
projbus_mcp.py — projbus MCP stdio 入口（SPEC §一 + §2.4 运行时裁定）
手搓最小 JSON-RPC 2.0（newline-delimited），零第三方依赖（SPEC §2.4 裁定禁引包）：
  - initialize / tools/list / tools/call 三方法（notifications 只吞不回；附带 ping）
  - 暴露 SPEC §一 四个工具：send / poll / ack / status
  - MCP 只是同一核心的代理接口：业务全在 projbus_core.py（宿主 Hook 走 CLI，不走本文件）

DB 选择：环境变量 PROJBUS_DB > 默认 ~/.projbus/projbus.sqlite。
身份/项目回退（与 CLI 同规）：send.from / poll.recipient 缺省读环境变量 PROJBUS_ACTOR，
优先级=显式参数 > env > 报错（必填身份不得静默猜）；send.project_id 缺省读
PROJBUS_PROJECT_ID > 默认 placement-wuxia。env 值仍过注册表校验（SPEC §2.1）。
ack accepted 的仓库根由工具参数 repo_root 传入（默认调用方 cwd）。
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import projbus_core as core  # noqa: E402

PROTOCOL_VERSION = "2025-06-18"

_JSONRPC = {"jsonrpc": "2.0"}
_S = {"type": "string"}
_ROLE = {"type": "string", "enum": list(core.ROLES)}

TOOLS = [
    {
        "name": "send",
        "description": "发送 projbus 消息。kind 白名单=delivery/question/answer/acceptance/turn_completed；"
                       "to 必须是注册角色 rd/art/arch；payload 必须是 JSON 对象且≤16KB"
                       "（验收报告正文不进总线，只传 commit SHA/文件路径/摘要）；"
                       "同 (project,to,idempotency_key) 重复调用幂等去重。"
                       "from 缺省读环境变量 PROJBUS_ACTOR。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "from": {**_ROLE, "description": "发送方角色；缺省读环境变量 PROJBUS_ACTOR"},
                "to": {**_ROLE, "description": "收件人角色"},
                "kind": {"type": "string", "enum": list(core.KINDS)},
                "payload": {"type": "object", "description": "JSON 对象；约定含 subject（主题）"},
                "project_id": {"type": "string",
                               "description": "缺省读环境变量 PROJBUS_PROJECT_ID，再缺省 placement-wuxia"},
                "correlation_id": _S,
                "idempotency_key": _S,
                "commit_sha": {"type": "string", "description": "delivery 惯例携带的交付 commit SHA"},
                "artifact_paths": {"type": "array", "items": _S,
                                   "description": "仓库相对路径列表"},
            },
            "required": ["to", "kind", "payload"],
        },
    },
    {
        "name": "poll",
        "description": "非破坏读收件箱：返回 recipient 收件箱中 seq>after_seq 的消息（升序，≤limit 条）；"
                       "未 ACK 的消息可重复返回。ack 用 ack 工具，四态 received/accepted/rejected/needs_info。"
                       "recipient 缺省读环境变量 PROJBUS_ACTOR。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "recipient": {**_ROLE, "description": "收件人角色；缺省读环境变量 PROJBUS_ACTOR"},
                "after_seq": {"type": "integer", "minimum": 0, "default": 0},
                "limit": {"type": "integer", "minimum": 1, "maximum": 500, "default": 50},
            },
        },
    },
    {
        "name": "ack",
        "description": "确认消息。state=received/accepted/rejected/needs_info。"
                       "accepted 门禁：用 subprocess 在 repo_root 跑 git fetch，确认 commit SHA 存在"
                       "且 artifact_paths 在该 commit 中全部存在，否则拒绝。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "message_id": _S,
                "state": {"type": "string", "enum": list(core.ACK_STATES)},
                "observed_commit_sha": {"type": "string", "description": "接收方核验到的 SHA"},
                "note": _S,
                "repo_root": {"type": "string", "description": "仓库根目录（git 门禁用）"},
            },
            "required": ["message_id", "state"],
        },
    },
    {
        "name": "status",
        "description": "总线状态：schema 版本、每个收件箱未 ACK 数、最后序号、数据库健康（quick_check）。",
        "inputSchema": {
            "type": "object",
            "properties": {"project_id": _S},
        },
    },
]


# ---------------------------------------------------------------- 工具实现（转调核心）

def _require(args: dict, *keys: str) -> None:
    missing = [k for k in keys if k not in args or args[k] is None]
    if missing:
        raise core.ProjbusError("缺少必填参数: %s" % ", ".join(missing))


def tool_send(args: dict) -> dict:
    _require(args, "to", "kind", "payload")
    msg, dup = core.send(
        project_id=core.resolve_project_id(args.get("project_id")),
        sender=core.resolve_actor(args.get("from"), "from"),
        to=args["to"], kind=args["kind"], payload=args["payload"],
        correlation_id=args.get("correlation_id"),
        idempotency_key=args.get("idempotency_key"),
        commit_sha=args.get("commit_sha"),
        artifact_paths=args.get("artifact_paths"))
    return {"message": msg, "duplicate": dup}


def tool_poll(args: dict) -> dict:
    return {"messages": core.poll(recipient=core.resolve_actor(args.get("recipient"), "recipient"),
                                  after_seq=args.get("after_seq", 0),
                                  limit=args.get("limit", 50))}


def tool_ack(args: dict) -> dict:
    _require(args, "message_id", "state")
    return core.ack(message_id=args["message_id"], state=args["state"],
                    observed_commit_sha=args.get("observed_commit_sha"),
                    note=args.get("note"),
                    repo_root=args.get("repo_root") or os.getcwd())


def tool_status(args: dict) -> dict:
    return core.status(project_id=args.get("project_id"))


_DISPATCH = {"send": tool_send, "poll": tool_poll, "ack": tool_ack, "status": tool_status}


# ---------------------------------------------------------------- JSON-RPC 骨架

def _reply(rid, result=None, error=None) -> dict:
    r = dict(_JSONRPC)
    r["id"] = rid
    if error is not None:
        r["error"] = error
    else:
        r["result"] = result
    return r


def _tool_result(data, is_error=False) -> dict:
    out = {
        "content": [{"type": "text", "text": json.dumps(data, ensure_ascii=False, indent=2)}],
    }
    if is_error:
        out["isError"] = True
    return out


def handle(req: dict):
    """处理一条 JSON-RPC 消息。返回响应 dict；notification（无 id）返回 None（不回）。"""
    rid = req.get("id")
    method = req.get("method")
    if rid is None:          # JSON-RPC notification：一律不回
        return None
    params = req.get("params") or {}
    if method == "initialize":
        return _reply(rid, {
            "protocolVersion": params.get("protocolVersion") or PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "projbus", "version": core.SERVER_VERSION},
            "instructions": "projbus 跨工具协作消息总线（SPEC v1.1）。通知/协商/ACK 专用；"
                            "git commit+push+handoff 文件仍是唯一事实源；不自动 merge，不执行消息正文。",
        })
    if method == "ping":
        return _reply(rid, {})
    if method == "tools/list":
        return _reply(rid, {"tools": TOOLS})
    if method == "tools/call":
        name = params.get("name")
        fn = _DISPATCH.get(name or "")
        if fn is None:
            return _reply(rid, error={"code": -32602, "message": "unknown tool: %r" % name})
        try:
            return _reply(rid, _tool_result(fn(params.get("arguments") or {})))
        except core.ProjbusError as e:
            return _reply(rid, _tool_result({"error": str(e)}, is_error=True))
        except Exception as e:  # 未预期异常也以工具错误返回，不让宿主挂掉
            return _reply(rid, _tool_result({"error": "internal: %s" % e}, is_error=True))
    return _reply(rid, error={"code": -32601, "message": "method not found: %r" % method})


def main() -> int:
    out = sys.stdout
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            out.write(json.dumps(_reply(None, error={"code": -32700,
                                                     "message": "parse error: %s" % e}),
                                 ensure_ascii=False) + "\n")
            out.flush()
            continue
        try:
            resp = handle(req)
        except Exception as e:  # 骨架层兜底
            resp = _reply(req.get("id"), error={"code": -32603, "message": "internal error: %s" % e})
        if resp is not None:
            out.write(json.dumps(resp, ensure_ascii=False, separators=(",", ":")) + "\n")
            out.flush()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        sys.exit(0)
