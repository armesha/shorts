#!/usr/bin/env python3

from __future__ import annotations

import sqlite3
import unittest

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
        """
    )
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
            (index, "contract-" + str(index), f"2026-08-0{index}T00:00:00+00:00", index),
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


if __name__ == "__main__":
    unittest.main()
