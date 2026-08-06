#!/usr/bin/env python3
"""Lifecycle-aware paper-risk helpers for the isolated AsatiBot service.

The original monitor never removed exited positions from its open-position and
exposure limits.  This module keeps reviewed lifecycle decisions in a separate
table and replaces only the risk recalculation function at runtime.  It never
opens Telegram or reads credentials.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any


LIFECYCLE_STATES = {"open", "body_out", "closed", "stopped"}
AUTO_TAKE_PROFIT_MULTIPLE = 2.0
AUTO_STOP_LOSS_MULTIPLE = 0.5


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _event_time(value: object) -> str | None:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def ensure_lifecycle_schema(db: sqlite3.Connection) -> None:
    db.execute("PRAGMA busy_timeout=5000")
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS paper_position_lifecycle (
            position_id INTEGER PRIMARY KEY,
            state TEXT NOT NULL CHECK(state IN ('open','body_out','closed','stopped')),
            reviewed_at TEXT NOT NULL,
            event_at TEXT,
            evidence_chat_id INTEGER,
            evidence_message_id INTEGER,
            confidence REAL,
            reason TEXT,
            FOREIGN KEY(position_id) REFERENCES paper_positions(position_id)
        );

        CREATE TABLE IF NOT EXISTS strategy_audits (
            audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
            generated_at TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            days INTEGER NOT NULL,
            requested_model TEXT NOT NULL,
            response_model TEXT,
            signal_count INTEGER NOT NULL,
            thread_count INTEGER NOT NULL,
            needs_review_before INTEGER NOT NULL,
            needs_review_after INTEGER NOT NULL,
            corrected_count INTEGER NOT NULL,
            blocked_before INTEGER NOT NULL,
            blocked_after INTEGER NOT NULL,
            lifecycle_updates INTEGER NOT NULL,
            ai_cost_usd REAL NOT NULL DEFAULT 0,
            summary_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS strategy_audit_items (
            audit_id INTEGER NOT NULL,
            contract TEXT NOT NULL,
            chain TEXT,
            position_id INTEGER,
            position_status TEXT,
            risk_summary TEXT NOT NULL,
            take_profits_json TEXT NOT NULL,
            stop_loss TEXT,
            principal_removal TEXT,
            lifecycle_state TEXT NOT NULL,
            brief TEXT NOT NULL,
            correction_action TEXT NOT NULL,
            correction_reason TEXT NOT NULL,
            confidence REAL,
            last_event_at TEXT,
            PRIMARY KEY(audit_id, contract),
            FOREIGN KEY(audit_id) REFERENCES strategy_audits(audit_id)
        );

        CREATE INDEX IF NOT EXISTS idx_strategy_audits_generated
            ON strategy_audits(generated_at DESC, audit_id DESC);
        """
    )
    db.commit()


def recalculate_existing_paper_sizes(db: sqlite3.Connection, monitor: Any) -> None:
    """Recalculate risk while excluding reviewed exits from active limits."""
    ensure_lifecycle_schema(db)
    rows = db.execute(
        """
        SELECT p.position_id, p.status, p.opened_at, p.entry_price_usd,
               s.text, COALESCE(l.state, 'open') AS lifecycle_state
        FROM paper_positions p
        JOIN signals s
          ON s.chat_id=p.source_chat_id AND s.message_id=p.source_message_id
        LEFT JOIN paper_position_lifecycle l ON l.position_id=p.position_id
        ORDER BY p.opened_at, p.position_id
        """
    ).fetchall()
    risk = monitor.load_paper_risk()
    max_exposure = (
        risk["initial_bankroll_usd"]
        * risk["max_total_exposure_percent"]
        / 100
    )
    exposure = 0.0
    open_count = 0
    now = datetime.now(timezone.utc)
    for row in rows:
        notional, percent, reason = monitor.paper_position_size(row["text"])
        lifecycle_state = row["lifecycle_state"]
        if lifecycle_state in {"closed", "stopped"}:
            db.execute(
                """
                UPDATE paper_positions
                SET notional_usd=?, risk_percent=?, sizing_reason=?, status=?
                WHERE position_id=?
                """,
                (
                    notional,
                    percent,
                    "reviewed lifecycle: " + lifecycle_state,
                    lifecycle_state,
                    row["position_id"],
                ),
            )
            continue

        # A signal that was blocked when it arrived must not be opened days
        # later merely because another position freed a slot. Once its live
        # entry window is gone, there is no truthful entry price to use.
        opened_at = datetime.fromisoformat(str(row["opened_at"]).replace("Z", "+00:00"))
        stale_blocked = (
            row["status"] == "blocked_risk"
            and row["entry_price_usd"] is None
            and now - opened_at > timedelta(minutes=10)
        )
        if stale_blocked:
            db.execute(
                """
                UPDATE paper_positions
                SET notional_usd=0, risk_percent=?,
                    sizing_reason='blocked at signal time; entry window expired',
                    status='blocked_risk'
                WHERE position_id=?
                """,
                (percent, row["position_id"]),
            )
            continue

        # Once the source explicitly removed the principal, the runner still
        # counts the live bag toward the open-position cap but no longer counts
        # the original principal toward capital-at-risk exposure.
        effective_exposure = 0.0 if lifecycle_state == "body_out" else notional
        blocked = (
            open_count >= int(risk["max_open_positions"])
            or exposure + effective_exposure > max_exposure
        )
        db.execute(
            """
            UPDATE paper_positions
            SET notional_usd=?, risk_percent=?, sizing_reason=?,
                status=CASE WHEN ? THEN 'blocked_risk'
                            WHEN entry_price_usd IS NULL THEN 'unpriced' ELSE 'open' END
            WHERE position_id=?
            """,
            (
                0.0 if blocked else notional,
                percent,
                "blocked by exposure/open-position limit" if blocked else reason,
                int(blocked),
                row["position_id"],
            ),
        )
        if not blocked:
            exposure += effective_exposure
            open_count += 1
    db.commit()


def _record_auto_exit(
    db: sqlite3.Connection,
    row: sqlite3.Row,
    *,
    state: str,
    multiple: float,
    event_at: str,
    source: str,
) -> None:
    notional = float(row["notional_usd"] or 0)
    entry_price = float(row["entry_price_usd"])
    price = entry_price * multiple
    pnl = notional * (multiple - 1)
    db.execute(
        """
        INSERT INTO paper_snapshots (
            position_id, captured_at, price_usd, market_cap, liquidity_usd,
            multiple, pnl_usd, source, error
        ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, NULL)
        """,
        (row["position_id"], event_at, price, multiple, pnl, source),
    )
    reason = (
        f"automatic paper take-profit at {AUTO_TAKE_PROFIT_MULTIPLE:g}x"
        if state == "closed"
        else f"automatic paper stop-loss at {AUTO_STOP_LOSS_MULTIPLE:g}x"
    )
    db.execute(
        """
        INSERT INTO paper_position_lifecycle (
            position_id, state, reviewed_at, event_at,
            evidence_chat_id, evidence_message_id, confidence, reason
        ) VALUES (?, ?, ?, ?, NULL, NULL, 1.0, ?)
        ON CONFLICT(position_id) DO UPDATE SET
            state=excluded.state,
            reviewed_at=excluded.reviewed_at,
            event_at=excluded.event_at,
            evidence_chat_id=NULL,
            evidence_message_id=NULL,
            confidence=1.0,
            reason=excluded.reason
        WHERE paper_position_lifecycle.state IN ('open','body_out')
        """,
        (row["position_id"], state, _utc_now(), event_at, reason),
    )


def apply_automatic_paper_exits(db: sqlite3.Connection, monitor: Any) -> tuple[int, int]:
    """Lock paper gains/losses at explicit automatic thresholds.

    Existing historical 5-minute analysis is used once to repair positions that
    crossed a threshold before the periodic runner existed. Future exits are
    based only on snapshots captured by the periodic runner.
    """
    ensure_lifecycle_schema(db)
    rows = db.execute(
        """
        SELECT p.*, COALESCE(l.state, 'open') AS lifecycle_state
        FROM paper_positions p
        LEFT JOIN paper_position_lifecycle l ON l.position_id=p.position_id
        WHERE p.entry_price_usd IS NOT NULL
          AND p.status NOT IN ('blocked_risk','closed','stopped')
          AND COALESCE(l.state, 'open') IN ('open','body_out')
        ORDER BY p.opened_at, p.position_id
        """
    ).fetchall()
    historical = monitor.historical_entries()
    closed = 0
    stopped = 0
    for row in rows:
        candidates: list[tuple[str, str, float, str]] = []
        prior = historical.get(str(row["contract"]).lower())
        if isinstance(prior, dict):
            peak = prior.get("peak") if isinstance(prior.get("peak"), dict) else {}
            drawdown = prior.get("drawdown") if isinstance(prior.get("drawdown"), dict) else {}
            peak_multiple = peak.get("multiple")
            peak_at = _event_time(peak.get("timestamp"))
            drawdown_multiple = drawdown.get("multiple")
            drawdown_at = _event_time(drawdown.get("timestamp"))
            if isinstance(peak_multiple, (int, float)) and float(peak_multiple) >= AUTO_TAKE_PROFIT_MULTIPLE and peak_at:
                candidates.append((peak_at, "closed", AUTO_TAKE_PROFIT_MULTIPLE, "auto_take_profit_backfill"))
            if isinstance(drawdown_multiple, (int, float)) and float(drawdown_multiple) <= AUTO_STOP_LOSS_MULTIPLE and drawdown_at:
                candidates.append((drawdown_at, "stopped", AUTO_STOP_LOSS_MULTIPLE, "auto_stop_loss_backfill"))

        snapshot = db.execute(
            """
            SELECT captured_at, multiple
            FROM paper_snapshots
            WHERE position_id=? AND multiple IS NOT NULL
              AND (multiple>=? OR multiple<=?)
            ORDER BY datetime(captured_at), snapshot_id
            LIMIT 1
            """,
            (row["position_id"], AUTO_TAKE_PROFIT_MULTIPLE, AUTO_STOP_LOSS_MULTIPLE),
        ).fetchone()
        if snapshot:
            observed = float(snapshot["multiple"])
            state = "closed" if observed >= AUTO_TAKE_PROFIT_MULTIPLE else "stopped"
            threshold = AUTO_TAKE_PROFIT_MULTIPLE if state == "closed" else AUTO_STOP_LOSS_MULTIPLE
            source = "auto_take_profit" if state == "closed" else "auto_stop_loss"
            candidates.append((str(snapshot["captured_at"]), state, threshold, source))

        if not candidates:
            continue
        event_at, state, multiple, source = min(candidates, key=lambda item: item[0])
        _record_auto_exit(db, row, state=state, multiple=multiple, event_at=event_at, source=source)
        if state == "closed":
            closed += 1
        else:
            stopped += 1
    db.commit()
    return closed, stopped


def install(monitor: Any) -> None:
    """Install the narrow runtime patch before the watcher starts."""
    monitor.recalculate_existing_paper_sizes = (
        lambda db: recalculate_existing_paper_sizes(db, monitor)
    )
