#!/usr/bin/env python3

from __future__ import annotations

import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from typing import Any

import asatibot_codex


class CodexProviderTest(unittest.TestCase):
    def test_sandbox_command_has_no_asatibot_or_user_home_mount(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            command = asatibot_codex._sandbox_command(
                root,
                root / "output-schema.json",
                root / "final.json",
            )
        rendered = " ".join(command)
        self.assertNotIn("/opt/asatibot", rendered)
        self.assertNotIn("/home/davtian", rendered)
        self.assertIn("--sandbox read-only", rendered)
        self.assertIn("--ephemeral", rendered)
        self.assertIn("gpt-5.6-sol", rendered)
        self.assertIn('model_reasoning_effort="max"', rendered)

    def test_install_switches_only_paid_reviews(self) -> None:
        class FakeMonitor:
            PAID_REVIEW_MODEL = "deepseek/test"

            def __init__(self) -> None:
                self.assert_paid_budget = lambda db: "paid"
                self.classify_with_openrouter = lambda *args: 2

            @staticmethod
            def load_openrouter_api_key(kind: str | None = None) -> str:
                return "original-" + str(kind)

            @staticmethod
            def openrouter_request(
                api_key: str,
                model: str,
                items: list[dict[str, Any]],
                paid: bool = False,
            ) -> dict[str, Any]:
                return {"model": model, "paid": paid}

        monitor = FakeMonitor()
        original_enabled = asatibot_codex.enabled
        asatibot_codex.enabled = lambda: True
        try:
            self.assertTrue(asatibot_codex.install(monitor))
        finally:
            asatibot_codex.enabled = original_enabled

        self.assertEqual(monitor.PAID_REVIEW_MODEL, "gpt-5.6-sol")
        self.assertEqual(monitor.load_openrouter_api_key("paid"), "codex-chatgpt-subscription")
        self.assertEqual(monitor.load_openrouter_api_key(None), "original-None")
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            saved = monitor.classify_with_openrouter(
                "gpt-5.6-sol",
                1,
                False,
                True,
                False,
            )
        self.assertEqual(saved, 2)
        self.assertIn("Codex subscription model", output.getvalue())

    def test_classification_schema_is_strict(self) -> None:
        schema = asatibot_codex.classification_schema()
        self.assertFalse(schema["additionalProperties"])
        result = schema["properties"]["results"]
        self.assertEqual(result["type"], "array")
        self.assertFalse(result["items"]["additionalProperties"])

    def test_disabled_codex_never_falls_back_to_paid_provider(self) -> None:
        class FakeMonitor:
            PAID_REVIEW_MODEL = "paid-provider"

            @staticmethod
            def classify_with_openrouter(*args: Any) -> int:
                return 7

        monitor = FakeMonitor()
        original_enabled = asatibot_codex.enabled
        asatibot_codex.enabled = lambda: False
        try:
            self.assertFalse(asatibot_codex.install(monitor))
        finally:
            asatibot_codex.enabled = original_enabled
        self.assertEqual(monitor.PAID_REVIEW_MODEL, "gpt-5.6-sol")
        with self.assertRaisesRegex(RuntimeError, "Codex subscription provider is disabled"):
            monitor.classify_with_openrouter("gpt-5.6-sol", 1, False, True, False)
        self.assertEqual(
            monitor.classify_with_openrouter("free-provider", 1, False, False, False),
            7,
        )


if __name__ == "__main__":
    unittest.main()
