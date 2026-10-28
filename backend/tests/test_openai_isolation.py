"""Test proving OpenAI test isolation.
Verifies isolation using a temporary .env with a dummy key:
- OPENAI_API_KEY is blanked in os.environ
- app.AI_AVAILABLE is False
- accessing any attribute on app.client raises AssertionError("tests must not call OpenAI")
- dotenv.load_dotenv() cannot reload the real key
- explicit client mocking works and reverts to the sentinel
"""
import os
from pathlib import Path
import unittest
import socket
import tempfile
from unittest.mock import MagicMock, patch
import dotenv
import app
from tests import BlockedOpenAIClient


class TestOpenAIIsolation(unittest.TestCase):
    def test_env_file_cannot_enable_openai(self):
        with tempfile.TemporaryDirectory() as folder:
            env_path = Path(folder) / '.env'
            env_path.write_text('OPENAI_API_KEY=offline-test-placeholder\n', encoding='utf-8')
            self.assertTrue(bool(dotenv.dotenv_values(env_path).get('OPENAI_API_KEY')))
            dotenv.load_dotenv(env_path, override=True)
            self.assertFalse(bool(os.environ.get('OPENAI_API_KEY')))
            self.assertFalse(app.AI_AVAILABLE)

    def test_network_is_blocked(self):
        with self.assertRaisesRegex(AssertionError, 'tests must not call the network'):
            socket.create_connection(('example.invalid', 443))
        with socket.socket() as connection:
            with self.assertRaisesRegex(AssertionError, 'tests must not call the network'):
                connection.connect(('127.0.0.1', 9))

    def test_environment_key_is_blanked_in_test_process(self):
        # Rule: never print environment values (test keys with bool() only)
        self.assertFalse(bool(os.environ.get('OPENAI_API_KEY')))
        self.assertEqual(os.environ.get('OPENAI_API_KEY'), '')

    def test_app_ai_available_is_false(self):
        self.assertFalse(app.AI_AVAILABLE)

    def test_client_sentinel_raises_on_attribute_access_and_call(self):
        self.assertIsInstance(app.client, BlockedOpenAIClient)

        with self.assertRaises(AssertionError) as ctx:
            _ = app.client.chat
        self.assertEqual(str(ctx.exception), "tests must not call OpenAI")

        with self.assertRaises(AssertionError) as ctx:
            _ = app.client.models
        self.assertEqual(str(ctx.exception), "tests must not call OpenAI")

        with self.assertRaises(AssertionError) as ctx:
            _ = app.client.completions
        self.assertEqual(str(ctx.exception), "tests must not call OpenAI")

        with self.assertRaises(AssertionError) as ctx:
            app.client()
        self.assertEqual(str(ctx.exception), "tests must not call OpenAI")

    def test_dotenv_cannot_reload_key_during_tests(self):
        dotenv.load_dotenv()
        self.assertFalse(bool(os.environ.get('OPENAI_API_KEY')))
        self.assertEqual(os.environ.get('OPENAI_API_KEY'), '')
        self.assertFalse(app.AI_AVAILABLE)

        # Even with override=True, safe wrapper keeps it blanked
        dotenv.load_dotenv(override=True)
        self.assertFalse(bool(os.environ.get('OPENAI_API_KEY')))
        self.assertEqual(os.environ.get('OPENAI_API_KEY'), '')

    def test_explicit_client_mocking_allowed_and_reverts(self):
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Mocked response"))]
        )

        with patch.object(app, 'AI_AVAILABLE', True), patch.object(app, 'client', mock_client):
            self.assertTrue(app.AI_AVAILABLE)
            res = app.client.chat.completions.create()
            self.assertEqual(res.choices[0].message.content, "Mocked response")

        # After unpatching, client must revert to the sentinel and raise
        self.assertFalse(app.AI_AVAILABLE)
        with self.assertRaises(AssertionError) as ctx:
            _ = app.client.chat
        self.assertEqual(str(ctx.exception), "tests must not call OpenAI")

    def test_fresh_test_process_import_gives_ai_unavailable_and_call_raises(self):
        import subprocess
        import sys
        code = (
            "import tests\n"
            "import app\n"
            "assert not app.AI_AVAILABLE, 'app.AI_AVAILABLE should be False in test process'\n"
            "try:\n"
            "    app.client.chat\n"
            "    raise SystemExit(1)\n"
            "except AssertionError as e:\n"
            "    assert str(e) == 'tests must not call OpenAI'\n"
            "try:\n"
            "    app.client()\n"
            "    raise SystemExit(1)\n"
            "except AssertionError as e:\n"
            "    assert str(e) == 'tests must not call OpenAI'\n"
        )
        proc = subprocess.run(
            [sys.executable, "-c", code],
            cwd=str(Path(__file__).resolve().parent.parent),
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 0, f"Subprocess test failed: {proc.stderr}")


if __name__ == '__main__':
    unittest.main()
