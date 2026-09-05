#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
projbus_core.py — projbus 跨工具协作消息总线 · 核心（单文件）
规格真源：scripts/projbus/SPEC.md v1.1（§一 Codex MCP-01 原文 + §二 PM 增补 + §三 实现约束）

职责：本机（同机同 OS 用户）SQLite 运输层。git commit/push + handoff 文件仍是唯一事实源，
projbus 只负责通知、协商与 ACK。不读 transcript、不做 HTTP/wait/自动 merge。

关键实现裁定（架构决策，实现者：ZCode）：
  D1 seq = 全局 AUTOINCREMENT 单调递增；每个收件箱的子序列天然单调（SPEC §一"每收件箱单调 sequence"）。
  D2 幂等作用域 = UNIQUE(project_id, recipient, idempotency_key)：同一调用重发必去重；
     一条 handoff 广播给多个收件人（同 key 不同 to）不算重复（outbox 常规语义）。
  D3 payload 必须是 JSON 对象且 ≤16KB（SPEC §一"payload 大小受限""验收正文不进总线"）；
     上限值 SPEC 未定死，取 16384 字节，常量 MAX_PAYLOAD_BYTES 单点可调。
  D4 ack accepted 门禁（SPEC §一）：subprocess 跑 git、仓库根由参数传入；
     步骤 = 有 remote 则 git fetch --all --prune（失败仅记录）→ `git cat-file -e <sha>^{commit}`
     必须通过（= 接收方 fetch 到了该 commit）→ 每个 artifact 路径 `git cat-file -e <sha>:<path>`
     必须存在。任一不过即拒绝 accepted。commit 是否在 remote 跟踪分支上仅作信息返回，不作硬门禁。
  D5 reconcile-outbox（SPEC §2.3）：游标存 DB meta（reconcile_cursor:<project_id>）；
     首次运行 = 基线（cursor:=HEAD，不补发历史，防止洪水）；之后每次
     `git log <cursor>..HEAD -- <handoff 路径>` 逐条（老→新）核对总线是否已有同 sha 的 delivery
     （sha 前缀互认），缺则代发（payload 带 reconciled:true，idempotency_key=reconcile:<sha>:<to>，
     广播给除发送方外全部角色），全部处理完才推进游标；中途失败不推游标，靠幂等键安全重试。
  D6 运行时 = Python3 标准库零依赖（SPEC §2.4 裁定：手搓 MCP，禁引包）。
"""

from __future__ import annotations

import json
import os
import posixpath
import re
import sqlite3
import subprocess
import time
import uuid
from datetime import datetime, timezone

# ---------------------------------------------------------------- 常量（注册表/限额）

SCHEMA_VERSION = 1
SERVER_VERSION = "1.1.0"

ROLES = ("rd", "art", "arch")                     # SPEC §2.1 角色注册表（固定）
PROJECTS = ("placement-wuxia",)                   # SPEC §2.1 project_id 现仅此一个
DEFAULT_PROJECT = "placement-wuxia"
KINDS = ("delivery", "question", "answer", "acceptance", "turn_completed")  # SPEC §一 kind 白名单
ACK_STATES = ("received", "accepted", "rejected", "needs_info")             # SPEC §一 ack 四态

BUSY_TIMEOUT_MS = 10_000                          # SPEC §一 busy_timeout
MAX_PAYLOAD_BYTES = 16_384                        # D3：payload 上限 16KB
MAX_ARTIFACT_PATHS = 64
MAX_ID_LEN = 128
DEFAULT_HANDOFF_PATHS = ("tasks/LOG.md", "tasks/threads/", "assets/")       # SPEC §2.3 handoff 路径

DEFAULT_DB = os.path.join(os.path.expanduser("~"), ".projbus", "projbus.sqlite")  # SPEC §一 存储固定
_SHA_RE = re.compile(r"^[0-9a-fA-F]{7,64}$")


class ProjbusError(Exception):
    """业务/校验错误。CLI 捕获转 stderr+exit(1)；MCP 层转 isError 结果。"""


# ---------------------------------------------------------------- 路径 / 存储初始化

def resolve_db_path(db_path=None) -> str:
    """显式参数 > 环境变量 PROJBUS_DB > 默认 ~/.projbus/projbus.sqlite。
    默认值动态按当前 HOME 解析（不在 import 时冻结，便于测试以临时 HOME 验证真实初始化）。"""
    if db_path:
        return db_path
    env = os.environ.get("PROJBUS_DB")
    if env:
        return env
    return os.path.join(os.path.expanduser("~"), ".projbus", "projbus.sqlite")


def _ensure_storage(db_path: str) -> None:
    """目录 0700、文件 0600（SPEC §一）。文件不存在时先以 0600 预创建，避免 sqlite 产出宽权限窗口。"""
    d = os.path.dirname(os.path.abspath(db_path))
    os.makedirs(d, exist_ok=True)
    try:
        os.chmod(d, 0o700)
    except OSError:
        pass
    if not os.path.exists(db_path):
        fd = os.open(db_path, os.O_CREAT | os.O_WRONLY, 0o600)
        os.close(fd)
    try:
        os.chmod(db_path, 0o600)
    except OSError:
        pass


_SCHEMA_SQL = (
    "CREATE TABLE IF NOT EXISTS projbus_meta ("
    " key TEXT PRIMARY KEY,"
    " value TEXT NOT NULL)",
    ("CREATE TABLE IF NOT EXISTS messages ("
     " seq INTEGER PRIMARY KEY AUTOINCREMENT,"          # D1 全局单调
     " message_id TEXT NOT NULL UNIQUE,"
     " project_id TEXT NOT NULL,"
     " sender TEXT NOT NULL,"
     " recipient TEXT NOT NULL,"
     " kind TEXT NOT NULL,"
     " payload TEXT NOT NULL,"                          # JSON 对象文本
     " correlation_id TEXT,"
     " idempotency_key TEXT,"
     " commit_sha TEXT,"
     " artifact_paths TEXT,"                            # JSON 数组文本（仓库相对路径）
     " ack_state TEXT,"                                 # NULL=未 ACK | received|accepted|rejected|needs_info
     " ack_note TEXT,"
     " ack_observed_sha TEXT,"
     " acked_at TEXT,"
     " reconciled INTEGER NOT NULL DEFAULT 0,"          # SPEC §2.3 代发标记
     " created_at TEXT NOT NULL,"
     " UNIQUE (project_id, recipient, idempotency_key)"  # D2 幂等作用域
     ")"),
    "CREATE INDEX IF NOT EXISTS idx_messages_inbox ON messages (recipient, seq)",
    "CREATE INDEX IF NOT EXISTS idx_messages_sha ON messages (commit_sha) WHERE commit_sha IS NOT NULL",
)


def connect(db_path=None) -> sqlite3.Connection:
    """打开连接：WAL + busy_timeout + schema 版本校验/迁移保护（SPEC §一）。"""
    path = resolve_db_path(db_path)
    _ensure_storage(path)
    try:
        conn = sqlite3.connect(path, timeout=BUSY_TIMEOUT_MS / 1000.0, isolation_level=None)
    except sqlite3.Error as e:
        raise ProjbusError("无法打开数据库 %s: %s" % (path, e))
    conn.row_factory = sqlite3.Row
    # WAL 转换在其它连接尚有未关事务时会立即 SQLITE_BUSY（busy handler 不覆盖该路径），
    # 故对「查模式→(必要时)转 WAL→建 schema」整体做有界重试；schema 语句全部 IF NOT EXISTS，重入安全。
    last_err = None
    for _attempt in range(20):
        try:
            mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
            if str(mode).lower() != "wal":
                conn.execute("PRAGMA journal_mode=WAL")   # WAL 是持久属性，写入库文件
            conn.execute("PRAGMA synchronous=NORMAL")     # WAL 下的常规耐久/性能折中
            _init_schema(conn)
            return conn
        except sqlite3.OperationalError as e:
            last_err = e
            msg = str(e).lower()
            if "locked" not in msg and "busy" not in msg:
                conn.close()
                raise ProjbusError("数据库错误: %s" % e)
            try:  # 清掉可能的半开事务再重试
                if conn.in_transaction:
                    conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            time.sleep(0.1)
    conn.close()
    raise ProjbusError("数据库忙：初始化重试后仍锁（busy_timeout=%dms）: %s"
                       % (BUSY_TIMEOUT_MS, last_err))


def _init_schema(conn: sqlite3.Connection) -> None:
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    # 迁移保护①：有 messages 却无版本表 → 外来/遗留 schema，拒开
    if "messages" in tables and "projbus_meta" not in tables:
        raise ProjbusError("schema 迁移保护：库中存在无 projbus_meta 版本表的 messages 表（外来/遗留库），拒绝打开")
    conn.execute("BEGIN IMMEDIATE")
    try:
        for stmt in _SCHEMA_SQL:
            conn.execute(stmt)
        row = conn.execute("SELECT value FROM projbus_meta WHERE key='schema_version'").fetchone()
        if row is None:
            conn.execute("INSERT INTO projbus_meta(key, value) VALUES('schema_version', ?)", (str(SCHEMA_VERSION),))
        else:
            ver = int(row["value"])
            if ver > SCHEMA_VERSION:
                # 迁移保护②：库比工具新，降级打开可能损坏，拒绝
                raise ProjbusError(
                    "schema 迁移保护：数据库版本 v%d 新于本工具 v%d，拒绝打开（请升级 projbus）" % (ver, SCHEMA_VERSION)
                )
            if ver < SCHEMA_VERSION:
                _migrate(conn, ver)
        conn.execute("COMMIT")
    except Exception:
        try:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise


def _migrate(conn: sqlite3.Connection, from_ver: int) -> None:
    """版本迁移入口。v1 为首个版本，无更老版本；后续版本在此追加分步迁移。"""
    raise ProjbusError("schema 迁移保护：v%d 无迁移路径（本工具 v%d）" % (from_ver, SCHEMA_VERSION))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _new_id() -> str:
    return uuid.uuid4().hex  # SPEC §一：消息 ID 用 UUID


# ---------------------------------------------------------------- 校验

def _check_role(role: str, field: str) -> str:
    if role not in ROLES:
        raise ProjbusError("未注册%s: %r（注册角色=%s，SPEC §2.1）" % (field, role, "/".join(ROLES)))
    return role


def _check_project(project_id: str) -> str:
    if project_id not in PROJECTS:
        raise ProjbusError("未注册 project_id: %r（现仅 %s，SPEC §2.1）" % (project_id, "/".join(PROJECTS)))
    return project_id


def _check_sha(sha: str, field: str) -> str:
    sha = str(sha).strip().lower()
    if not _SHA_RE.match(sha):
        raise ProjbusError("%s 不是合法 git SHA（7~64 位十六进制）: %r" % (field, sha))
    return sha


def validate_rel_path(p: str) -> str:
    """路径只允许仓库相对路径（SPEC §一）。拒绝绝对路径、..、反斜杠、盘符、空串。"""
    if not isinstance(p, str) or not p.strip():
        raise ProjbusError("artifact 路径不能为空: %r" % (p,))
    if "\x00" in p:
        raise ProjbusError("artifact 路径含非法字符: %r" % (p,))
    if p.startswith("/") or p.startswith("\\") or ":" in p or "\\\\" in p:
        raise ProjbusError("artifact 路径必须是仓库相对路径（拒绝绝对路径/盘符）: %r" % (p,))
    norm = posixpath.normpath(p.replace("\\\\", "/"))
    if norm.startswith("..") or norm == "." or norm.startswith("/"):
        raise ProjbusError("artifact 路径不允许越出仓库根（..）: %r" % (p,))
    return norm


def _validate_payload(payload) -> str:
    """payload 必须是 JSON 对象，≤ MAX_PAYLOAD_BYTES（D3；SPEC §一：验收正文不进总线，只传 sha/路径/摘要）。"""
    if not isinstance(payload, dict):
        raise ProjbusError("payload 必须是 JSON 对象（dict），收到: %s" % type(payload).__name__)
    try:
        blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError) as e:
        raise ProjbusError("payload 不可序列化为 JSON: %s" % e)
    size = len(blob.encode("utf-8"))
    if size > MAX_PAYLOAD_BYTES:
        raise ProjbusError("payload 超限: %d 字节 > 上限 %d（验收报告正文请走 git 仓库，总线只传 sha/路径/摘要）"
                           % (size, MAX_PAYLOAD_BYTES))
    return blob


def _check_optional_id(v, field: str):
    if v is None:
        return None
    v = str(v)
    if not v.strip():
        return None
    if len(v) > MAX_ID_LEN:
        raise ProjbusError("%s 超长（>%d）: %r…" % (field, MAX_ID_LEN, v[:32]))
    return v


# ---------------------------------------------------------------- 行 ↔ dict

_MSG_COLS = ("seq, message_id, project_id, sender, recipient, kind, payload, correlation_id,"
             " idempotency_key, commit_sha, artifact_paths, ack_state, ack_note, ack_observed_sha,"
             " acked_at, reconciled, created_at")


def _row_to_msg(row) -> dict:
    return {
        "seq": row["seq"],
        "message_id": row["message_id"],
        "project_id": row["project_id"],
        "sender": row["sender"],
        "recipient": row["recipient"],
        "kind": row["kind"],
        "payload": json.loads(row["payload"]),
        "correlation_id": row["correlation_id"],
        "idempotency_key": row["idempotency_key"],
        "commit_sha": row["commit_sha"],
        "artifact_paths": json.loads(row["artifact_paths"]) if row["artifact_paths"] else [],
        "ack_state": row["ack_state"],
        "ack_note": row["ack_note"],
        "ack_observed_sha": row["ack_observed_sha"],
        "acked_at": row["acked_at"],
        "reconciled": bool(row["reconciled"]),
        "created_at": row["created_at"],
    }


# ---------------------------------------------------------------- 四大能力（SPEC §一）+ reconcile（§2.3）

def send(db_path=None, *, project_id=DEFAULT_PROJECT, sender: str, to: str, kind: str,
         payload: dict, correlation_id=None, idempotency_key=None,
         commit_sha=None, artifact_paths=None, reconciled: bool = False):
    """发消息。返回 (message_dict, duplicate:bool)。同幂等键重复调用返回已存在消息不重复入库（SPEC §一）。"""
    _check_role(sender, "from")
    _check_role(to, "recipient")
    _check_project(project_id)
    if kind not in KINDS:
        raise ProjbusError("kind 不在白名单: %r（允许=%s，SPEC §一）" % (kind, "/".join(KINDS)))
    blob = _validate_payload(payload)
    if commit_sha is not None:
        commit_sha = _check_sha(commit_sha, "commit_sha")
    paths = [validate_rel_path(p) for p in (artifact_paths or [])]
    if len(paths) > MAX_ARTIFACT_PATHS:
        raise ProjbusError("artifact_paths 过多: %d > %d" % (len(paths), MAX_ARTIFACT_PATHS))
    correlation_id = _check_optional_id(correlation_id, "correlation_id")
    idempotency_key = _check_optional_id(idempotency_key, "idempotency_key")

    conn = connect(db_path)
    try:
        try:
            conn.execute("BEGIN IMMEDIATE")
            if idempotency_key:
                row = conn.execute(
                    "SELECT %s FROM messages WHERE project_id=? AND recipient=? AND idempotency_key=?"
                    % _MSG_COLS, (project_id, to, idempotency_key)).fetchone()
                if row is not None:
                    conn.execute("ROLLBACK")
                    return _row_to_msg(row), True
            mid, now = _new_id(), _now()
            conn.execute(
                "INSERT INTO messages (message_id, project_id, sender, recipient, kind, payload,"
                " correlation_id, idempotency_key, commit_sha, artifact_paths, reconciled, created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (mid, project_id, sender, to, kind, blob, correlation_id, idempotency_key,
                 commit_sha, json.dumps(paths, ensure_ascii=False) if paths else None,
                 1 if reconciled else 0, now))
            row = conn.execute("SELECT %s FROM messages WHERE message_id=?" % _MSG_COLS, (mid,)).fetchone()
            conn.execute("COMMIT")
            return _row_to_msg(row), False
        except sqlite3.OperationalError as e:
            raise ProjbusError("send 数据库忙/锁超时: %s" % e)
    finally:
        conn.close()


def poll(db_path=None, *, recipient: str, after_seq: int = 0, limit: int = 50,
         unack_only: bool = False):
    """非破坏读：after_seq 之后按 seq 单调升序返回；未 ACK 消息可重复返回（SPEC §一）。"""
    _check_role(recipient, "recipient")
    after_seq = int(after_seq)
    if after_seq < 0:
        raise ProjbusError("after_seq 必须 >= 0")
    limit = max(1, min(int(limit), 500))
    sql = "SELECT %s FROM messages WHERE recipient=? AND seq>?" % _MSG_COLS
    params = [recipient, after_seq]
    if unack_only:
        sql += " AND ack_state IS NULL"
    sql += " ORDER BY seq ASC LIMIT ?"
    params.append(limit)
    conn = connect(db_path)
    try:
        return [_row_to_msg(r) for r in conn.execute(sql, params)]
    finally:
        conn.close()


def get_message(db_path=None, message_id: str = ""):
    conn = connect(db_path)
    try:
        row = conn.execute("SELECT %s FROM messages WHERE message_id=?" % _MSG_COLS,
                           (message_id,)).fetchone()
        return _row_to_msg(row) if row else None
    finally:
        conn.close()


def _git(repo_root: str, *args, timeout: int = 30) -> subprocess.CompletedProcess:
    """subprocess 跑 git（SPEC §一：确认 SHA 与文件存在；D4：仓库根从参数传）。"""
    try:
        return subprocess.run(["git", *args], cwd=repo_root, capture_output=True,
                              text=True, timeout=timeout)
    except FileNotFoundError:
        raise ProjbusError("找不到 git 可执行文件")
    except subprocess.TimeoutExpired:
        raise ProjbusError("git %s 超时（%ds）" % (args[0], timeout))


def _verify_commit_for_accept(repo_root, sha: str, artifact_paths) -> dict:
    """ack accepted 门禁（D4）。不通过即抛 ProjbusError，通过则返回核验信息（随 ack 结果返回）。"""
    if not repo_root or not os.path.isdir(repo_root):
        raise ProjbusError("ack accepted 需要 repo_root（仓库根）参数指向真实目录")
    sha = _check_sha(sha, "commit_sha")
    remotes = [x.strip() for x in _git(repo_root, "remote").stdout.split() if x.strip()]
    fetch_ok, fetch_note = True, ""
    if remotes:
        p = _git(repo_root, "fetch", "--all", "--prune", "--quiet", timeout=60)
        fetch_ok = (p.returncode == 0)
        if not fetch_ok:
            fetch_note = ((p.stderr or "").strip() or "fetch 失败")[:300]
    else:
        fetch_note = "无 remote 配置，fetch 跳过"
    if _git(repo_root, "cat-file", "-e", "%s^{commit}" % sha).returncode != 0:
        raise ProjbusError(
            "git fetch 后仓库中不存在 commit %s：不允许 ack accepted（接收方未 fetch 到该 commit，SPEC §一）" % sha)
    subject = _git(repo_root, "log", "-1", "--format=%s", sha).stdout.strip()
    missing = [p for p in artifact_paths
               if _git(repo_root, "cat-file", "-e", "%s:%s" % (sha, p)).returncode != 0]
    if missing:
        raise ProjbusError("artifact 路径在 commit %s 中不存在，不允许 ack accepted: %s"
                           % (sha[:8], ", ".join(missing)))
    branches = [b.strip() for b in _git(repo_root, "branch", "-r", "--contains", sha).stdout.splitlines()
                if b.strip()]
    return {"sha": sha, "subject": subject[:200], "fetch_ok": fetch_ok, "fetch_note": fetch_note,
            "remote_branches": branches}


def ack(db_path=None, *, message_id: str, state: str, observed_commit_sha=None,
        note=None, repo_root=None):
    """ACK 四态（SPEC §一）。accepted 必须先过 git 门禁（D4）。重复 ack 允许（后写覆盖）。"""
    if state not in ACK_STATES:
        raise ProjbusError("ack state 非法: %r（允许=%s）" % (state, "/".join(ACK_STATES)))
    observed_commit_sha = _check_optional_id(observed_commit_sha, "observed_commit_sha")
    if observed_commit_sha:
        observed_commit_sha = _check_sha(observed_commit_sha, "observed_commit_sha")
    note = _check_optional_id(note, "note")
    if note and len(note) > 512:
        raise ProjbusError("note 超长（>512）")

    msg = get_message(db_path, message_id)
    if msg is None:
        raise ProjbusError("message 不存在: %s" % message_id)

    gate = None
    if state == "accepted":
        sha = observed_commit_sha or msg["commit_sha"]
        if not sha:
            raise ProjbusError("ack accepted 需要 commit_sha（observed_commit_sha 或消息自带），无法核验交付")
        paths = msg["artifact_paths"] or []
        if observed_commit_sha and msg["commit_sha"] and msg["commit_sha"] != sha \
                and not msg["commit_sha"].startswith(sha) and not sha.startswith(msg["commit_sha"]):
            raise ProjbusError("observed_commit_sha(%s) 与消息 commit_sha(%s) 不一致，拒绝 accepted"
                               % (sha[:8], msg["commit_sha"][:8]))
        gate = _verify_commit_for_accept(repo_root, sha, paths)

    conn = connect(db_path)
    try:
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "UPDATE messages SET ack_state=?, ack_note=?, ack_observed_sha=?, acked_at=?"
                " WHERE message_id=?",
                (state, note, observed_commit_sha or msg["commit_sha"] if state == "accepted" else observed_commit_sha,
                 _now(), message_id))
            conn.execute("COMMIT")
        except sqlite3.OperationalError as e:
            raise ProjbusError("ack 数据库忙/锁超时: %s" % e)
    finally:
        conn.close()
    out = get_message(db_path, message_id)
    if gate is not None:
        out["accept_gate"] = gate
    return out


def status(db_path=None, *, project_id=None):
    """schema 版本 / 每收件箱未 ACK 数 / 最后序号 / 数据库健康（SPEC §一）。"""
    if project_id is not None:
        _check_project(project_id)
    conn = connect(db_path)
    try:
        row = conn.execute("SELECT value FROM projbus_meta WHERE key='schema_version'").fetchone()
        health = conn.execute("PRAGMA quick_check").fetchone()[0]
        last_seq = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM messages").fetchone()[0]
        inboxes = {}
        for r in ROLES:
            scope, params = "", []
            if project_id is not None:
                scope, params = " AND project_id=?", [project_id]
            total = conn.execute("SELECT COUNT(*) FROM messages WHERE recipient=?" + scope,
                                 [r] + params).fetchone()[0]
            unacked = conn.execute(
                "SELECT COUNT(*) FROM messages WHERE recipient=? AND ack_state IS NULL" + scope,
                [r] + params).fetchone()[0]
            inboxes[r] = {"total": total, "unacked": unacked}
        return {
            "db": resolve_db_path(db_path),
            "schema_version": int(row["value"]),
            "health": health,
            "last_seq": last_seq,
            "inboxes": inboxes,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------- meta（游标等）

def _get_meta(conn, key: str):
    row = conn.execute("SELECT value FROM projbus_meta WHERE key=?", (key,)).fetchone()
    return row["value"] if row else None


def _set_meta(conn, key: str, value: str) -> None:
    conn.execute("INSERT INTO projbus_meta(key, value) VALUES(?, ?)"
                 " ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))


def get_reconcile_cursor(db_path=None, project_id=DEFAULT_PROJECT):
    conn = connect(db_path)
    try:
        return _get_meta(conn, "reconcile_cursor:%s" % project_id)
    finally:
        conn.close()


# ---------------------------------------------------------------- reconcile-outbox（SPEC §2.3，D5）

def reconcile_outbox(db_path=None, *, repo_root, project_id=DEFAULT_PROJECT, sender="rd",
                     handoff_paths=None):
    """对账 git 事实与总线已发：缺的 delivery 代发（reconciled:true）+ 推进游标。
    首次运行 = 基线（cursor:=HEAD，不补发历史）。中途失败不推游标，幂等键保证重试安全。"""
    _check_role(sender, "sender")
    _check_project(project_id)
    if not repo_root or not os.path.isdir(repo_root):
        raise ProjbusError("reconcile-outbox 需要 repo_root（仓库根）指向真实目录")
    paths = tuple(handoff_paths or DEFAULT_HANDOFF_PATHS)
    cursor_key = "reconcile_cursor:%s" % project_id

    conn = connect(db_path)
    try:
        cursor = _get_meta(conn, cursor_key)
    finally:
        conn.close()

    if not cursor:
        p = _git(repo_root, "rev-parse", "HEAD")
        if p.returncode != 0:
            return {"baseline": True, "cursor_before": None, "cursor": None, "commits_seen": 0,
                    "deliveries_created": 0, "messages_sent": 0, "skipped_existing": 0,
                    "note": "空仓库（无 HEAD），建立基线跳过"}
        head = p.stdout.strip()
        conn = connect(db_path)
        try:
            conn.execute("BEGIN IMMEDIATE")
            _set_meta(conn, cursor_key, head)
            conn.execute("COMMIT")
        finally:
            conn.close()
        return {"baseline": True, "cursor_before": None, "cursor": head, "commits_seen": 0,
                "deliveries_created": 0, "messages_sent": 0, "skipped_existing": 0,
                "note": "首次运行建立基线：cursor=HEAD，不补发基线之前的提交（D5，防洪水）"}

    p = _git(repo_root, "log", "--format=%H%x00%s", "%s..HEAD" % cursor, "--", *paths)
    if p.returncode != 0:
        raise ProjbusError("git log 失败: %s" % ((p.stderr or "").strip()[:300]))
    commits = []
    for line in p.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        sha, _, subj = line.partition("\x00")
        commits.append((sha.strip(), subj.strip()))
    commits.reverse()  # 老 → 新

    conn = connect(db_path)
    try:
        rows = conn.execute(
            "SELECT DISTINCT commit_sha FROM messages WHERE project_id=? AND kind='delivery'"
            " AND commit_sha IS NOT NULL", (project_id,)).fetchall()
    finally:
        conn.close()
    existing_shas = {r[0] for r in rows}
    def _has_delivery(sha):
        return any(e == sha or e.startswith(sha) or sha.startswith(e) for e in existing_shas)

    created, sent, skipped, last_sha = 0, 0, 0, None
    for sha, subj in commits:
        last_sha = sha
        if _has_delivery(sha):
            skipped += 1
            continue
        # -z：NUL 分隔，避免 git 对非 ASCII/特殊字符路径做 quote 转义
        dp = _git(repo_root, "diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z",
                  sha, "--", *paths)
        if dp.returncode != 0:
            raise ProjbusError("git diff-tree 失败（%s）: %s" % (sha[:8], (dp.stderr or "").strip()[:200]))
        matched = [validate_rel_path(x) for x in dp.stdout.split("\x00") if x.strip()]
        summary = (subj or "reconciled delivery")[:200]
        targets = [r for r in ROLES if r != sender]
        for to in targets:
            send(db_path, project_id=project_id, sender=sender, to=to, kind="delivery",
                 payload={"subject": summary, "summary": summary, "sha": sha, "paths": matched,
                          "reconciled": True, "source": "reconcile-outbox"},
                 idempotency_key="reconcile:%s:%s" % (sha, to),
                 commit_sha=sha, artifact_paths=matched, reconciled=True)
            sent += 1
        created += 1

    if last_sha:  # 全部处理成功才推游标（D5）
        conn = connect(db_path)
        try:
            conn.execute("BEGIN IMMEDIATE")
            _set_meta(conn, cursor_key, last_sha)
            conn.execute("COMMIT")
        finally:
            conn.close()
    return {"baseline": False, "cursor_before": cursor, "cursor": last_sha or cursor,
            "commits_seen": len(commits), "deliveries_created": created,
            "messages_sent": sent, "skipped_existing": skipped}


# ---------------------------------------------------------------- 展示辅助（CLI poll-context 用）

def msg_subject(msg: dict, maxlen: int = 120) -> str:
    """从 payload 提取主题：subject > summary > title > 压缩 JSON 前 48 字符。
    所有空白（含换行）压成单空格——宿主按行解析时不会被 payload 内容伪造新行。"""
    p = msg.get("payload") or {}
    s = ""
    for k in ("subject", "summary", "title"):
        v = p.get(k)
        if isinstance(v, str) and v.strip():
            s = v.strip()
            break
    if not s:
        try:
            s = json.dumps(p, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError):
            s = str(p)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:maxlen]
