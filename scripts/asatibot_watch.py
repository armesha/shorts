#!/usr/bin/env python3
"""Start AsatiBot's single Telegram watcher with lifecycle-aware paper risk."""

from __future__ import annotations

import asyncio

import asatibot_codex
import asatibot_lifecycle
import shadow_monitor


def main() -> None:
    asatibot_lifecycle.install(shadow_monitor)
    asatibot_codex.install(shadow_monitor)
    db = shadow_monitor.connect_db()
    try:
        asatibot_lifecycle.ensure_lifecycle_schema(db)
        asatibot_lifecycle.recalculate_existing_paper_sizes(db, shadow_monitor)
    finally:
        db.close()
    try:
        asyncio.run(shadow_monitor.watch_messages())
    except KeyboardInterrupt:
        print("\nWatch stopped.")


if __name__ == "__main__":
    main()
