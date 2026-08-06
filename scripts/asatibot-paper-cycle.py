#!/usr/bin/env python3
"""Refresh AsatiBot paper prices and enforce automatic paper exits."""

from __future__ import annotations

import asatibot_lifecycle
import shadow_monitor


def main() -> None:
    asatibot_lifecycle.install(shadow_monitor)
    db = shadow_monitor.connect_db()
    try:
        asatibot_lifecycle.ensure_lifecycle_schema(db)
        created = shadow_monitor.sync_paper_positions(db)
        asatibot_lifecycle.recalculate_existing_paper_sizes(db, shadow_monitor)
        priced = shadow_monitor.price_paper_entries(db)
        captured = shadow_monitor.snapshot_paper_positions(db)
        closed, stopped = asatibot_lifecycle.apply_automatic_paper_exits(db, shadow_monitor)
        asatibot_lifecycle.recalculate_existing_paper_sizes(db, shadow_monitor)
        totals = db.execute(
            "SELECT COUNT(*) AS positions, SUM(status='open') AS open FROM paper_positions"
        ).fetchone()
        print(
            "Paper refresh complete: "
            f"created={created}, priced={priced}, snapshots={captured}, "
            f"take_profit={closed}, stop_loss={stopped}, "
            f"positions={totals['positions']}, open={totals['open'] or 0}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
