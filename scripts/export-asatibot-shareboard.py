#!/usr/bin/env python3
"""Export a deliberately limited AsatiBot snapshot for Shareboard.

This script never exports Telegram messages, sender/chat identifiers, model
prompts or responses, errors, credentials, or the bot's SQLite database.  It
only reads explicitly selected paper-trading and aggregate accounting fields
and atomically replaces a small JSON snapshot for the Shareboard backend.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sqlite3
import stat
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


DEFAULT_DATABASE = Path("/opt/asatibot/userdata/data/shadow_log.sqlite3")
DEFAULT_AI_BUDGET = Path("/opt/asatibot/userdata/ai-budget.json")
DEFAULT_PAPER_RISK = Path("/opt/asatibot/userdata/paper-risk.json")
DEFAULT_OUTPUT = Path("/var/lib/asatibot/shareboard-signals.json")
DEFAULT_CONTROL_REQUEST = Path("/var/lib/asatibot-control/request.json")
MAX_POSITIONS = 50
MAX_RECENT_SIGNALS = 20
MAX_CONTRACTS_PER_SIGNAL = 5
MAX_SNAPSHOT_BYTES = 128 * 1024
MAX_CONTROL_REQUEST_BYTES = 8 * 1024
SAFE_LABEL = re.compile(r"[A-Za-z0-9._:-]{1,64}\Z")

SETTINGS_DEFAULTS = {
    "initialBankrollUsd": 100.0,
    "lowConfidencePercent": 1.0,
    "defaultPositionPercent": 5.0,
    "maxPositionPercent": 10.0,
    "maxTotalExposurePercent": 25.0,
    "maxOpenPositions": 5,
    "dailyAiLimitUsd": 0.05,
    "monthlyAiLimitUsd": 0.50,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def finite_number(value: object, *, maximum: float = 1_000_000_000_000.0) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or abs(number) > maximum:
        return None
    return number


def nonnegative_number(value: object) -> float:
    number = finite_number(value)
    return number if number is not None and number >= 0 else 0.0


def safe_label(value: object) -> str | None:
    if not isinstance(value, str) or not SAFE_LABEL.fullmatch(value):
        return None
    return value


def safe_timestamp(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or len(text) > 64:
        return None
    try:
        parsed = datetime.fromisoformat(f"{text[:-1]}+00:00" if text.endswith("Z") else text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def safe_contract(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value or len(value) > 160 or any(ord(char) < 32 for char in value):
        return None
    return value


def load_numeric_limits(path: Path, defaults: dict[str, float]) -> dict[str, float]:
    source = read_regular_json_object(path, MAX_CONTROL_REQUEST_BYTES)
    if source is None:
        return defaults.copy()
    return {
        name: nonnegative_number(source.get(name, default))
        for name, default in defaults.items()
    }


def read_regular_json_object(path: Path, maximum_bytes: int) -> dict[str, object] | None:
    """Read one trusted control/config file without following a symlink."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError:
        return None
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > maximum_bytes:
            return None
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            raw = source.read(maximum_bytes + 1)
    except OSError:
        return None
    finally:
        os.close(descriptor)
    if len(raw) > maximum_bytes:
        return None
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def current_settings(ai_budget_path: Path, paper_risk_path: Path) -> dict[str, float | int]:
    ai_budget = load_numeric_limits(
        ai_budget_path,
        {"daily_usd": 0.05, "monthly_usd": 0.50},
    )
    paper_risk = load_numeric_limits(
        paper_risk_path,
        {
            "initial_bankroll_usd": 100.0,
            "low_confidence_percent": 1.0,
            "default_position_percent": 5.0,
            "max_position_percent": 10.0,
            "max_total_exposure_percent": 25.0,
            "max_open_positions": 5.0,
        },
    )
    return {
        "initialBankrollUsd": paper_risk["initial_bankroll_usd"],
        "lowConfidencePercent": paper_risk["low_confidence_percent"],
        "defaultPositionPercent": paper_risk["default_position_percent"],
        "maxPositionPercent": paper_risk["max_position_percent"],
        "maxTotalExposurePercent": paper_risk["max_total_exposure_percent"],
        "maxOpenPositions": max(1, int(paper_risk["max_open_positions"])),
        "dailyAiLimitUsd": ai_budget["daily_usd"],
        "monthlyAiLimitUsd": ai_budget["monthly_usd"],
    }


def normalized_settings(value: object) -> dict[str, float | int] | None:
    if not isinstance(value, dict) or set(value) != set(SETTINGS_DEFAULTS):
        return None
    numbers = {name: finite_number(value.get(name)) for name in SETTINGS_DEFAULTS}
    if any(number is None for number in numbers.values()):
        return None
    result = {name: float(number) for name, number in numbers.items() if number is not None}
    max_open_positions = result["maxOpenPositions"]
    if not max_open_positions.is_integer():
        return None
    if not 1 <= result["initialBankrollUsd"] <= 1_000_000:
        return None
    if not 0 <= result["dailyAiLimitUsd"] <= 50:
        return None
    if not 0 <= result["monthlyAiLimitUsd"] <= 1_000:
        return None
    if result["monthlyAiLimitUsd"] < result["dailyAiLimitUsd"]:
        return None
    if not all(
        0 <= result[name] <= 100
        for name in (
            "lowConfidencePercent",
            "defaultPositionPercent",
            "maxPositionPercent",
            "maxTotalExposurePercent",
        )
    ):
        return None
    if not (
        result["lowConfidencePercent"] <= result["maxPositionPercent"]
        and result["defaultPositionPercent"] <= result["maxPositionPercent"]
        and result["maxPositionPercent"] <= result["maxTotalExposurePercent"]
        and 1 <= max_open_positions <= 100
    ):
        return None
    result["maxOpenPositions"] = int(max_open_positions)
    return result


def write_private_json(path: Path, payload: dict[str, object]) -> None:
    encoded = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    except BaseException:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise


def apply_control_request(
    control_path: Path, ai_budget_path: Path, paper_risk_path: Path
) -> tuple[dict[str, float | int], str]:
    settings = current_settings(ai_budget_path, paper_risk_path)
    ai_budget = read_regular_json_object(ai_budget_path, MAX_CONTROL_REQUEST_BYTES)
    paper_risk = read_regular_json_object(paper_risk_path, MAX_CONTROL_REQUEST_BYTES)
    request = read_regular_json_object(control_path, MAX_CONTROL_REQUEST_BYTES)
    if request is None:
        return settings, "idle" if ai_budget is not None and paper_risk is not None else "unavailable"
    if (
        set(request) != {"version", "requestedAt", "settings"}
        or request.get("version") != 1
        or safe_timestamp(request.get("requestedAt")) is None
    ):
        return settings, "invalid"
    desired = normalized_settings(request.get("settings"))
    if desired is None:
        return settings, "invalid"
    if ai_budget is None or paper_risk is None:
        # A valid web request must never overwrite an unreadable, malformed, or substituted
        # private config file.
        return settings, "unavailable"
    if desired == settings:
        return desired, "applied"
    try:
        ai_budget.update(
            {
                "daily_usd": desired["dailyAiLimitUsd"],
                "monthly_usd": desired["monthlyAiLimitUsd"],
            }
        )
        paper_risk.update(
            {
                "initial_bankroll_usd": desired["initialBankrollUsd"],
                "low_confidence_percent": desired["lowConfidencePercent"],
                "default_position_percent": desired["defaultPositionPercent"],
                "max_position_percent": desired["maxPositionPercent"],
                "max_total_exposure_percent": desired["maxTotalExposurePercent"],
                "max_open_positions": desired["maxOpenPositions"],
            }
        )
        write_private_json(ai_budget_path, ai_budget)
        write_private_json(paper_risk_path, paper_risk)
    except OSError:
        return settings, "unavailable"
    return desired, "applied"


def service_health() -> dict[str, object]:
    try:
        result = subprocess.run(
            [
                "/usr/bin/systemctl",
                "show",
                "asatibot.service",
                "-p",
                "ActiveState",
                "-p",
                "SubState",
                "-p",
                "NRestarts",
                "-p",
                "ExecMainStatus",
                "--no-pager",
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=3,
        )
    except (OSError, subprocess.SubprocessError):
        return {"state": "unknown", "restartCount": 0, "lastExitCode": None}
    properties = dict(
        line.split("=", 1)
        for line in result.stdout.splitlines()
        if "=" in line
    )
    active = properties.get("ActiveState")
    sub_state = properties.get("SubState")
    if active == "active" and sub_state == "running":
        state = "running"
    elif active == "activating" or sub_state == "auto-restart":
        state = "starting"
    elif active == "failed":
        state = "failed"
    elif active == "inactive":
        state = "stopped"
    else:
        state = "unknown"
    try:
        restart_count = int(properties.get("NRestarts", "0"))
    except ValueError:
        restart_count = 0
    try:
        exit_code = int(properties.get("ExecMainStatus", "0"))
    except ValueError:
        exit_code = 0
    return {
        "state": state,
        "restartCount": min(max(restart_count, 0), 1_000_000),
        "lastExitCode": exit_code if 0 <= exit_code <= 255 else None,
    }


def open_database(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise RuntimeError("AsatiBot database is unavailable")
    uri = f"file:{quote(str(path.resolve()))}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    return connection


def latest_positions(connection: sqlite3.Connection) -> list[dict[str, object]]:
    position_columns = {
        str(row["name"])
        for row in connection.execute("PRAGMA table_info(paper_positions)").fetchall()
    }
    risk_percent_column = "p.risk_percent AS risk_percent" if "risk_percent" in position_columns else "NULL AS risk_percent"
    rows = connection.execute(
        f"""
        SELECT
            p.contract,
            p.chain,
            p.status,
            p.opened_at,
            p.detected_at,
            p.notional_usd,
            {risk_percent_column},
            p.entry_price_usd,
            ps.captured_at AS updated_at,
            ps.price_usd AS current_price_usd,
            ps.multiple,
            ps.pnl_usd
        FROM paper_positions AS p
        LEFT JOIN paper_snapshots AS ps ON ps.snapshot_id = (
            SELECT snapshot_id
            FROM paper_snapshots
            WHERE position_id = p.position_id
            ORDER BY captured_at DESC, snapshot_id DESC
            LIMIT 1
        )
        ORDER BY p.opened_at DESC, p.position_id DESC
        LIMIT ?
        """,
        (MAX_POSITIONS,),
    ).fetchall()
    positions: list[dict[str, object]] = []
    for row in rows:
        contract = safe_contract(row["contract"])
        if contract is None:
            continue
        positions.append(
            {
                "contract": contract,
                "chain": safe_label(row["chain"]),
                "status": safe_label(row["status"]) or "unknown",
                "openedAt": safe_timestamp(row["opened_at"]),
                "detectedAt": safe_timestamp(row["detected_at"]),
                "notionalUsd": nonnegative_number(row["notional_usd"]),
                "riskPercent": nonnegative_number(row["risk_percent"]),
                "entryPriceUsd": finite_number(row["entry_price_usd"]),
                "currentPriceUsd": finite_number(row["current_price_usd"]),
                "multiple": finite_number(row["multiple"]),
                "pnlUsd": finite_number(row["pnl_usd"]),
                "updatedAt": safe_timestamp(row["updated_at"]),
            }
        )
    return positions


def recent_signals(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute(
        """
        SELECT
            s.detected_at,
            s.status,
            s.chain_hint,
            s.contracts_json,
            r.classification,
            r.confidence
        FROM signals AS s
        LEFT JOIN llm_reviews AS r USING(chat_id, message_id)
        ORDER BY s.message_date DESC, s.detected_at DESC
        LIMIT ?
        """,
        (MAX_RECENT_SIGNALS,),
    ).fetchall()
    result: list[dict[str, object]] = []
    for row in rows:
        try:
            raw_contracts = json.loads(row["contracts_json"])
        except (TypeError, ValueError):
            raw_contracts = []
        if not isinstance(raw_contracts, list):
            raw_contracts = []
        contracts = [
            contract
            for value in raw_contracts
            if (contract := safe_contract(value)) is not None
        ][:MAX_CONTRACTS_PER_SIGNAL]
        result.append(
            {
                "detectedAt": safe_timestamp(row["detected_at"]),
                "status": safe_label(row["status"]) or "unknown",
                "chain": safe_label(row["chain_hint"]),
                "contracts": contracts,
                "classification": safe_label(row["classification"]),
                "confidence": finite_number(row["confidence"], maximum=100.0),
            }
        )
    return result


def scalar(connection: sqlite3.Connection, statement: str, parameters: tuple[object, ...] = ()) -> object:
    row = connection.execute(statement, parameters).fetchone()
    return row[0] if row else None


def build_snapshot(
    database_path: Path,
    ai_budget_path: Path,
    paper_risk_path: Path,
    control_request_path: Path,
) -> dict[str, object]:
    settings, control_status = apply_control_request(
        control_request_path, ai_budget_path, paper_risk_path
    )
    now = datetime.now(timezone.utc)
    day_prefix = now.strftime("%Y-%m-%d") + "%"
    month_prefix = now.strftime("%Y-%m") + "%"
    connection = open_database(database_path)
    try:
        positions = latest_positions(connection)
        priced_positions = [
            position
            for position in positions
            if position["entryPriceUsd"] is not None
            and position["multiple"] is not None
            and position["pnlUsd"] is not None
        ]
        total_notional = sum(float(position["notionalUsd"]) for position in priced_positions)
        total_pnl = sum(float(position["pnlUsd"]) for position in priced_positions)
        bankroll = float(settings["initialBankrollUsd"])
        snapshot = {
            "version": 1,
            "generatedAt": utc_now(),
            "lastMessageAt": safe_timestamp(
                scalar(connection, "SELECT MAX(message_date) FROM messages")
            ),
            "summary": {
                "signalCount": int(scalar(connection, "SELECT COUNT(*) FROM signals") or 0),
                "paperPositionCount": len(positions),
                "totalNotionalUsd": total_notional,
                "totalPnlUsd": total_pnl,
                "portfolioValueUsd": bankroll + total_pnl,
                "todayAiSpendUsd": nonnegative_number(
                    scalar(
                        connection,
                        "SELECT COALESCE(SUM(cost_usd), 0) FROM llm_batches WHERE created_at LIKE ?",
                        (day_prefix,),
                    )
                ),
                "monthAiSpendUsd": nonnegative_number(
                    scalar(
                        connection,
                        "SELECT COALESCE(SUM(cost_usd), 0) FROM llm_batches WHERE created_at LIKE ?",
                        (month_prefix,),
                    )
                ),
                "dailyAiLimitUsd": settings["dailyAiLimitUsd"],
                "monthlyAiLimitUsd": settings["monthlyAiLimitUsd"],
            },
            "settings": settings,
            "health": service_health(),
            "controlStatus": control_status,
            "positions": positions,
            "recentSignals": recent_signals(connection),
        }
    finally:
        connection.close()
    return snapshot


def atomic_write(path: Path, snapshot: dict[str, object]) -> None:
    encoded = (json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    if len(encoded) > MAX_SNAPSHOT_BYTES:
        raise RuntimeError("sanitized snapshot exceeds size limit")
    path.parent.mkdir(mode=0o2750, parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o640)
    except BaseException:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export a safe AsatiBot snapshot for Shareboard")
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE)
    parser.add_argument("--ai-budget", type=Path, default=DEFAULT_AI_BUDGET)
    parser.add_argument("--paper-risk", type=Path, default=DEFAULT_PAPER_RISK)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--control-request", type=Path, default=DEFAULT_CONTROL_REQUEST)
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    snapshot = build_snapshot(
        arguments.database,
        arguments.ai_budget,
        arguments.paper_risk,
        arguments.control_request,
    )
    atomic_write(arguments.output, snapshot)
    print("Safe Shareboard snapshot written.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, sqlite3.Error) as error:
        print(f"Snapshot export failed: {type(error).__name__}", file=sys.stderr)
        raise SystemExit(1)
