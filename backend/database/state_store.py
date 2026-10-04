from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from .db import connect

COLLECTION_KEYS = ("stf", "stu", "mat", "trn")
SINGLETON_KEYS = ("cfg",)
KNOWN_KEYS = set(COLLECTION_KEYS) | set(SINGLETON_KEYS)


class StateMigrationError(RuntimeError):
    pass


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


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

            for entity_type in COLLECTION_KEYS:
                for idx, row in enumerate(normalized.get(entity_type) or []):
                    rid = _record_id(entity_type, row, idx)
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


def export_state() -> dict[str, Any]:
    state: dict[str, Any] = {k: [] for k in COLLECTION_KEYS}
    state["cfg"] = {}
    with connect() as conn:
        for row in conn.execute("SELECT entity_type, payload_json FROM records ORDER BY entity_type, entity_id"):
            if row["entity_type"] in COLLECTION_KEYS:
                state[row["entity_type"]].append(json.loads(row["payload_json"]))
        for row in conn.execute("SELECT key, payload_json FROM state_singletons"):
            value = json.loads(row["payload_json"])
            if row["key"] == "cfg":
                state["cfg"] = value
            elif row["key"] == "extra_state" and isinstance(value, dict):
                state.update(value)
    return state


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
