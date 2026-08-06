#!/usr/bin/env python3

from __future__ import annotations

import sqlite3
import unittest
from datetime import datetime, timedelta, timezone

from scripts import asatibot_lifecycle


class FakeMonitor:
    def __init__(self, *, max_open: int = 5, max_exposure: float = 25.0) -> None:
        self.max_open = max_open
        self.max_exposure = max_exposure

    def load_paper_risk(self) -> dict[str, float]:
        return {
            "initial_bankroll_usd": 100.0,
            "max_total_exposure_percent": self.max_exposure,
            "max_open_positions": float(self.max_open),
        }

    @staticmethod
    def paper_position_size(_text: str) -> tuple[float, float, str]:
        return 5.0, 5.0, "default trusted-call risk"

    @staticmethod
    def historical_entries() -> dict[str, dict[str, object]]:
        return {}


def database(position_count: int) -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        CREATE TABLE signals (
            chat_id INTEGER NOT NULL,
            message_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            PRIMARY KEY(chat_id, message_id)
        );
        CREATE TABLE paper_positions (
            position_id INTEGER PRIMARY KEY,
            contract TEXT NOT NULL,
            opened_at TEXT NOT NULL,
            source_chat_id INTEGER NOT NULL,
            source_message_id INTEGER NOT NULL,
            notional_usd REAL NOT NULL,
            risk_percent REAL,
            sizing_reason TEXT,
            entry_price_usd REAL,
            status TEXT NOT NULL
        );
        CREATE TABLE paper_snapshots (
            snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id INTEGER NOT NULL,
            captured_at TEXT NOT NULL,
            price_usd REAL,
            market_cap REAL,
            liquidity_usd REAL,
            multiple REAL,
            pnl_usd REAL,
            source TEXT NOT NULL,
            error TEXT
        );
        """
    )
    opened_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for index in range(1, position_count + 1):
        db.execute(
            "INSERT INTO signals(chat_id,message_id,text) VALUES (1,?,'call')",
            (index,),
        )
        db.execute(
            """
            INSERT INTO paper_positions(
                position_id, contract, opened_at, source_chat_id, source_message_id,
                notional_usd, entry_price_usd, status
            ) VALUES (?, ?, ?, 1, ?, 5, 1, 'open')
            """,
            (index, "contract-" + str(index), opened_at, index),
        )
    db.commit()
    return db


class LifecycleRiskTest(unittest.TestCase):
    def test_confirmed_exit_frees_one_open_position_slot(self) -> None:
        db = database(7)
        monitor = FakeMonitor(max_open=5, max_exposure=100)
        asatibot_lifecycle.recalculate_existing_paper_sizes(db, monitor)
        self.assertEqual(
            db.execute("SELECT COUNT(*) FROM paper_positions WHERE status='blocked_risk'").fetchone()[0],
            2,
        )

        db.execute(
            """
            INSERT INTO paper_position_lifecycle(position_id,state,reviewed_at)
            VALUES (1,'closed','2026-08-03T00:00:00Z')
            """
        )
        asatibot_lifecycle.recalculate_existing_paper_sizes(db, monitor)

        self.assertEqual(db.execute("SELECT status FROM paper_positions WHERE position_id=1").fetchone()[0], "closed")
        self.assertEqual(db.execute("SELECT status FROM paper_positions WHERE position_id=6").fetchone()[0], "open")
        self.assertEqual(db.execute("SELECT status FROM paper_positions WHERE position_id=7").fetchone()[0], "blocked_risk")
        db.close()

    def test_body_out_keeps_slot_but_removes_principal_from_exposure(self) -> None:
        db = database(4)
        monitor = FakeMonitor(max_open=100, max_exposure=15)
        asatibot_lifecycle.ensure_lifecycle_schema(db)
        db.execute(
            """
            INSERT INTO paper_position_lifecycle(position_id,state,reviewed_at)
            VALUES (1,'body_out','2026-08-03T00:00:00Z')
            """
        )
        asatibot_lifecycle.recalculate_existing_paper_sizes(db, monitor)

        self.assertEqual(
            db.execute("SELECT COUNT(*) FROM paper_positions WHERE status='blocked_risk'").fetchone()[0],
            0,
        )
        self.assertEqual(db.execute("SELECT status FROM paper_positions WHERE position_id=1").fetchone()[0], "open")
        db.close()

    def test_expired_blocked_position_is_not_opened_retroactively(self) -> None:
        db = database(2)
        monitor = FakeMonitor(max_open=1, max_exposure=100)
        asatibot_lifecycle.recalculate_existing_paper_sizes(db, monitor)
        db.execute(
            "UPDATE paper_positions SET opened_at=?, entry_price_usd=NULL WHERE position_id=2",
            ((datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(timespec="seconds"),),
        )
        db.execute(
            "INSERT INTO paper_position_lifecycle(position_id,state,reviewed_at) VALUES (1,'closed','2026-08-06T00:00:00Z')"
        )
        asatibot_lifecycle.recalculate_existing_paper_sizes(db, monitor)
        self.assertEqual(db.execute("SELECT status FROM paper_positions WHERE position_id=2").fetchone()[0], "blocked_risk")
        db.close()

    def test_automatic_take_profit_and_stop_lock_exact_thresholds(self) -> None:
        db = database(2)
        monitor = FakeMonitor(max_open=5, max_exposure=100)
        db.execute(
            "INSERT INTO paper_snapshots(position_id,captured_at,price_usd,multiple,pnl_usd,source) VALUES (1,'2026-08-06T08:00:00Z',2.5,2.5,7.5,'test')"
        )
        db.execute(
            "INSERT INTO paper_snapshots(position_id,captured_at,price_usd,multiple,pnl_usd,source) VALUES (2,'2026-08-06T08:01:00Z',0.4,0.4,-3,'test')"
        )
        self.assertEqual(asatibot_lifecycle.apply_automatic_paper_exits(db, monitor), (1, 1))
        asatibot_lifecycle.recalculate_existing_paper_sizes(db, monitor)
        self.assertEqual(dict(db.execute("SELECT position_id,status FROM paper_positions")), {1: "closed", 2: "stopped"})
        self.assertEqual(db.execute("SELECT pnl_usd FROM paper_snapshots WHERE position_id=1 ORDER BY snapshot_id DESC LIMIT 1").fetchone()[0], 5.0)
        self.assertEqual(db.execute("SELECT pnl_usd FROM paper_snapshots WHERE position_id=2 ORDER BY snapshot_id DESC LIMIT 1").fetchone()[0], -2.5)
        db.close()


if __name__ == "__main__":
    unittest.main()
