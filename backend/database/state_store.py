from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from .db import connect

COLLECTION_KEYS = ("stf", "stu", "mat", "trn")
SINGLETON_KEYS = ("cfg",)
KNOWN_KEYS = set(COLLECTION_KEYS) | set(SINGLETON_KEYS)
ORDER_KEY = "collection_order"


class StateMigrationError(RuntimeError):
    pass


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str)


def _hash(value: Any) -> str:
    return hashlib.sha256(_json(value).encode("utf-8")).hexdigest()


def _record_id(entity_type: str, row: dict[str, Any], index: int) -> str:
    value = row.get("id")
    if value in (None, ""):
        raise StateMigrationError(f"{entity_type}[{index}]에 id가 없습니다.")
    return str(value)


def validate_state(state: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(state, dict):
        raise StateMigrationError("상태 데이터는 JSON 객체여야 합니다.")
    result = deepcopy(state)
    for key in COLLECTION_KEYS:
        value = result.get(key, [])
        if value is None:
            value = []
        if not isinstance(value, list):
            raise StateMigrationError(f"{key}는 배열이어야 합니다.")
        seen: set[str] = set()
        for idx, row in enumerate(value):
            if not isinstance(row, dict):
                raise StateMigrationError(f"{key}[{idx}]는 객체여야 합니다.")
            rid = _record_id(key, row, idx)
            if rid in seen:
                raise StateMigrationError(f"{key}에 중복 id가 있습니다: {rid}")
            seen.add(rid)
        result[key] = value
    cfg = result.get("cfg") or {}
    if not isinstance(cfg, dict):
        raise StateMigrationError("cfg는 객체여야 합니다.")
    result["cfg"] = cfg
    return result


def _load_collection_order(conn) -> dict[str, list[str]]:
    row = conn.execute("SELECT payload_json FROM state_singletons WHERE key=?", (ORDER_KEY,)).fetchone()
    if not row:
        return {k: [] for k in COLLECTION_KEYS}
    try:
        raw = json.loads(row["payload_json"])
    except Exception:
        raw = {}
    return {k: [str(x) for x in (raw.get(k) or [])] for k in COLLECTION_KEYS}


def _save_collection_order(conn, order: dict[str, list[str]], now: str | None = None) -> None:
    now = now or datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO state_singletons(key, payload_json, updated_at)
        VALUES(?,?,?)
        ON CONFLICT(key) DO UPDATE SET
          payload_json=excluded.payload_json,
          updated_at=excluded.updated_at
        """,
        (ORDER_KEY, _json(order), now),
    )


def import_state(state: dict[str, Any], *, source: str = "v12-json", replace: bool = True) -> dict[str, Any]:
    normalized = validate_state(state)
    record_count = sum(len(normalized.get(k) or []) for k in COLLECTION_KEYS)
    now = datetime.now(timezone.utc).isoformat()

    with connect() as conn:
        try:
            conn.execute("BEGIN IMMEDIATE")
            if replace:
                conn.execute("DELETE FROM records")
                conn.execute("DELETE FROM state_singletons")

            collection_order: dict[str, list[str]] = {k: [] for k in COLLECTION_KEYS}
            for entity_type in COLLECTION_KEYS:
                for idx, row in enumerate(normalized.get(entity_type) or []):
                    rid = _record_id(entity_type, row, idx)
                    collection_order[entity_type].append(rid)
                    conn.execute(
                        """
                        INSERT INTO records(entity_type, entity_id, payload_json, updated_at)
                        VALUES(?, ?, ?, ?)
                        ON CONFLICT(entity_type, entity_id) DO UPDATE SET
                          payload_json=excluded.payload_json,
                          updated_at=excluded.updated_at
                        """,
                        (entity_type, rid, _json(row), now),
                    )

            for key in SINGLETON_KEYS:
                conn.execute(
                    """
                    INSERT INTO state_singletons(key, payload_json, updated_at)
                    VALUES(?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                      payload_json=excluded.payload_json,
                      updated_at=excluded.updated_at
                    """,
                    (key, _json(normalized.get(key) or {}), now),
                )

            extra = {k: v for k, v in normalized.items() if k not in KNOWN_KEYS}
            conn.execute(
                """
                INSERT INTO state_singletons(key, payload_json, updated_at)
                VALUES('extra_state', ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                  payload_json=excluded.payload_json,
                  updated_at=excluded.updated_at
                """,
                (_json(extra), now),
            )
            _save_collection_order(conn, collection_order, now)
            conn.execute(
                "INSERT INTO migration_history(source, mode, record_count, detail) VALUES(?,?,?,?)",
                (source, "replace" if replace else "merge", record_count, _json({"keys": sorted(normalized.keys())})),
            )
            conn.execute(
                "INSERT INTO audit_log(action, entity_type, detail) VALUES(?,?,?)",
                ("state_import", "state", _json({"source": source, "replace": replace, "recordCount": record_count})),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    return {"ok": True, "recordCount": record_count, "mode": "replace" if replace else "merge"}


def upsert_record(entity_type: str, record: dict[str, Any], *, source: str = "dual-write") -> dict[str, Any]:
    if entity_type not in COLLECTION_KEYS:
        raise StateMigrationError(f"지원하지 않는 레코드 유형입니다: {entity_type}")
    if not isinstance(record, dict):
        raise StateMigrationError("record는 객체여야 합니다.")
    rid = _record_id(entity_type, record, 0)
    now = datetime.now(timezone.utc).isoformat()
    payload = _json(record)
    with connect() as conn:
        exists = conn.execute(
            "SELECT 1 FROM records WHERE entity_type=? AND entity_id=?", (entity_type, rid)
        ).fetchone()
        conn.execute(
            """
            INSERT INTO records(entity_type, entity_id, payload_json, updated_at)
            VALUES(?,?,?,?)
            ON CONFLICT(entity_type, entity_id) DO UPDATE SET
              payload_json=excluded.payload_json,
              updated_at=excluded.updated_at
            """,
            (entity_type, rid, payload, now),
        )
        if not exists:
            order = _load_collection_order(conn)
            if rid not in order[entity_type]:
                order[entity_type].append(rid)
                _save_collection_order(conn, order, now)
        conn.execute(
            "INSERT INTO audit_log(action, entity_type, entity_id, detail) VALUES(?,?,?,?)",
            ("dual_upsert", entity_type, rid, _json({"source": source, "hash": _hash(record)})),
        )
    return {"ok": True, "entityType": entity_type, "id": rid, "hash": _hash(record)}


def delete_record(entity_type: str, entity_id: str, *, source: str = "dual-write") -> dict[str, Any]:
    if entity_type not in COLLECTION_KEYS:
        raise StateMigrationError(f"지원하지 않는 레코드 유형입니다: {entity_type}")
    rid = str(entity_id or "")
    if not rid:
        raise StateMigrationError("삭제할 id가 필요합니다.")
    now = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        cur = conn.execute("DELETE FROM records WHERE entity_type=? AND entity_id=?", (entity_type, rid))
        order = _load_collection_order(conn)
        if rid in order[entity_type]:
            order[entity_type] = [x for x in order[entity_type] if x != rid]
            _save_collection_order(conn, order, now)
        conn.execute(
            "INSERT INTO audit_log(action, entity_type, entity_id, detail) VALUES(?,?,?,?)",
            ("dual_delete", entity_type, rid, _json({"source": source, "deleted": cur.rowcount})),
        )
    return {"ok": True, "entityType": entity_type, "id": rid, "deleted": int(cur.rowcount)}


def save_singleton(key: str, value: Any, *, source: str = "dual-write") -> dict[str, Any]:
    if key not in SINGLETON_KEYS:
        raise StateMigrationError(f"지원하지 않는 singleton입니다: {key}")
    now = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO state_singletons(key, payload_json, updated_at)
            VALUES(?,?,?)
            ON CONFLICT(key) DO UPDATE SET
              payload_json=excluded.payload_json,
              updated_at=excluded.updated_at
            """,
            (key, _json(value), now),
        )
        conn.execute(
            "INSERT INTO audit_log(action, entity_type, entity_id, detail) VALUES(?,?,?,?)",
            ("dual_singleton", "singleton", key, _json({"source": source, "hash": _hash(value)})),
        )
    return {"ok": True, "key": key, "hash": _hash(value)}


def export_state() -> dict[str, Any]:
    state: dict[str, Any] = {k: [] for k in COLLECTION_KEYS}
    state["cfg"] = {}
    with connect() as conn:
        order = _load_collection_order(conn)
        records_by_type: dict[str, dict[str, Any]] = {k: {} for k in COLLECTION_KEYS}
        for row in conn.execute("SELECT entity_type, entity_id, payload_json FROM records"):
            entity_type = row["entity_type"]
            if entity_type in COLLECTION_KEYS:
                records_by_type[entity_type][str(row["entity_id"])] = json.loads(row["payload_json"])
        for key in COLLECTION_KEYS:
            rows = records_by_type[key]
            seen: set[str] = set()
            for rid in order.get(key) or []:
                if rid in rows:
                    state[key].append(rows[rid])
                    seen.add(rid)
            for rid in sorted(set(rows) - seen):
                state[key].append(rows[rid])

        for row in conn.execute("SELECT key, payload_json FROM state_singletons"):
            value = json.loads(row["payload_json"])
            if row["key"] == "cfg":
                state["cfg"] = value
            elif row["key"] == "extra_state" and isinstance(value, dict):
                state.update(value)
    return state


def compare_state(state: dict[str, Any]) -> dict[str, Any]:
    browser = validate_state(state)
    sqlite_state = export_state()
    checks: list[dict[str, Any]] = []

    for key in COLLECTION_KEYS:
        left_rows = browser.get(key) or []
        right_rows = sqlite_state.get(key) or []
        left = {str(x.get("id")): _hash(x) for x in left_rows}
        right = {str(x.get("id")): _hash(x) for x in right_rows}
        missing = sorted(set(left) - set(right))
        extra = sorted(set(right) - set(left))
        changed = sorted(k for k in set(left) & set(right) if left[k] != right[k])
        left_order = [str(x.get("id")) for x in left_rows]
        right_order = [str(x.get("id")) for x in right_rows]
        order_ok = left_order == right_order
        checks.append({
            "key": key,
            "ok": not missing and not extra and not changed and order_ok,
            "browserCount": len(left),
            "sqliteCount": len(right),
            "missingInSqlite": missing,
            "extraInSqlite": extra,
            "changed": changed,
            "orderOk": order_ok,
        })

    cfg_ok = _hash(browser.get("cfg") or {}) == _hash(sqlite_state.get("cfg") or {})
    checks.append({"key": "cfg", "ok": cfg_ok})
    return {"ok": all(x["ok"] for x in checks), "checks": checks}


def status() -> dict[str, Any]:
    with connect() as conn:
        counts = {k: 0 for k in COLLECTION_KEYS}
        for row in conn.execute("SELECT entity_type, COUNT(*) AS c FROM records GROUP BY entity_type"):
            counts[row["entity_type"]] = int(row["c"])
        last = conn.execute(
            "SELECT created_at, source, mode, record_count FROM migration_history ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return {
            "counts": counts,
            "totalRecords": sum(counts.values()),
            "lastMigration": dict(last) if last else None,
        }
