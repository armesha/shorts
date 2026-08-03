#!/usr/bin/env python3
"""Lifecycle-aware paper-risk helpers for the isolated AsatiBot service.

The original monitor never removed exited positions from its open-position and
exposure limits.  This module keeps reviewed lifecycle decisions in a separate
table and replaces only the risk recalculation function at runtime.  It never
opens Telegram or reads credentials.
"""

from __future__ import annotations

import sqlite3
from typing import Any


LIFECYCLE_STATES = {"open", "body_out", "closed", "stopped"}


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
        SELECT p.position_id, s.text, COALESCE(l.state, 'open') AS lifecycle_state
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


def install(monitor: Any) -> None:
    """Install the narrow runtime patch before the watcher starts."""
    monitor.recalculate_existing_paper_sizes = (
        lambda db: recalculate_existing_paper_sizes(db, monitor)
    )
